import fs from 'node:fs';
import path from 'node:path';
import { addTrustline } from './trustline.js';
import { loadTestnetAnchors, type TestnetAnchor } from './anchors.js';
import { config } from './config.js';
import { writeEvidence } from './evidence.js';
import { runMoneyFlow, type FlowDeps, type FlowResult, type FlowTarget } from './flow.js';
import { createAndFundAccount } from './friendbot.js';
import { verifyPayment } from './horizon-verify.js';
// The very probe every mainnet anchor gets, imported rather than copied so the
// two networks can never be judged by different checks.
import { probeAnchor as probePublicSurface, type MainnetProbeResult } from '../../mainnet-probe/src/probe.js';
import { completeInteractiveFlow } from './interactive.js';
import { balanceOf, memoFor, sendPayment } from './payment.js';
import { resolvesToPublicAddress } from './public-host.js';
import { authenticateSep10 } from './sep10.js';
import { completeSandboxLeg, getSep6Info, requestDeposit, requestWithdraw } from './sep6.js';
import { getTransactionStatus, initiateInteractiveDeposit, pollUntilTerminal } from './sep24.js';
import { fetchAnchorToml } from './toml.js';
import type { ProbeResult } from './types.js';

/** True when the run failed on our side (browser missing or unlaunchable,
 * Friendbot down) rather than on the anchor's. Blaming an anchor for our
 * own broken tooling puts a false failure on-chain, which cannot be undone,
 * so these are recorded as inconclusive and never submitted. */
export function isProbeEnvironmentError(message: string): boolean {
  return /browserType\.launch|Executable doesn't exist|playwright install|Friendbot funding failed/i.test(message);
}

/** The anchor that is always measured: SDF's reference anchor. */
export const REFERENCE_ANCHOR: TestnetAnchor = {
  anchor_id: config.anchorId,
  name: 'Stellar test anchor',
  domain: config.anchorDomain,
  asset_code: config.assetCode,
  first_seen: '2026-09-01T00:00:00.000Z',
  origin: 'reference',
};

/** The real network, behind the flow's seams. */
export function liveDeps(target: FlowTarget): FlowDeps {
  return {
    fetchToml: (domain) => fetchAnchorToml(domain),
    createAccount: () => createAndFundAccount(config.friendbotUrl),
    addTrustline: (kp, code, issuer) => addTrustline(config.horizonTestnetUrl, kp, code, issuer, config.networkPassphrase),
    sep10: (toml, kp) => authenticateSep10(toml, kp, config.networkPassphrase),
    sep24Deposit: (server, token, code, amount) => initiateInteractiveDeposit(server, token, code, amount),
    sep24Interactive: (url, amount) => completeInteractiveFlow(url, amount, config.interactiveTimeoutMs, config.headless),
    sep6Info: (server) => getSep6Info(server),
    sep6Deposit: (server, token, p) => requestDeposit(server, token, p),
    sep6Withdraw: (server, token, p) => requestWithdraw(server, token, p),
    // Only a page on the anchor's own host or its transfer server's, and
    // only a public address: the button is pressed from our server.
    sandbox: async (url) => {
      const u = new URL(url);
      const toml = await fetchAnchorToml(target.domain);
      const allowed = new Set([target.domain, toml.transferServerSep6, toml.transferServerSep24].filter(Boolean).map((h) => (h!.includes('/') ? new URL(h!).host : h!)));
      if (u.protocol !== 'https:' || !allowed.has(u.host)) throw new Error(`more_info_url ${u.host} is not the anchor's own host`);
      if (!(await resolvesToPublicAddress(u.hostname))) throw new Error('more_info_url does not resolve to a public address');
      return completeSandboxLeg(url);
    },
    poll: async (server, token, id) => (await pollUntilTerminal(server, token, id, config.pollIntervalMs, config.pollTimeoutMs)) as never,
    getTransaction: async (server, token, id) => (await getTransactionStatus(server, token, id)) as never,
    pay: (kp, p) =>
      sendPayment(
        config.horizonTestnetUrl,
        kp,
        { destination: p.destination, code: p.code, issuer: p.issuer, amount: p.amount, memo: memoFor(p.memoType, p.memo) },
        config.networkPassphrase,
      ),
    verify: (hash, want) => verifyPayment(config.horizonTestnetUrl, hash, want),
    balance: (account, code, issuer) => balanceOf(config.horizonTestnetUrl, account, code, issuer),
    depositAmount: config.depositAmount,
    now: () => Date.now(),
  };
}

/** One anchor's money-flow run as the result the aggregator reads, with its
 * evidence published (unless the failure was ours). */
export function toProbeResult(anchor: FlowTarget, startedAt: Date, flow: FlowResult, pub?: MainnetProbeResult): ProbeResult {
  const inconclusive = flow.inconclusive || (!flow.success && isProbeEnvironmentError(flow.error ?? ''));
  const result: ProbeResult = {
    anchor_id: anchor.anchor_id,
    domain: anchor.domain,
    source_type: 'RealTestnet',
    success: flow.success,
    ...(inconclusive ? { inconclusive: true } : {}),
    settlement_seconds: flow.seconds,
    timestamp: startedAt.toISOString(),
    final_transaction_status: flow.final_transaction_status,
    ...(flow.error ? { error: flow.error } : {}),
    ...(flow.protocol ? { protocol: flow.protocol } : {}),
    ...(flow.asset ? { asset: flow.asset } : {}),
    steps: flow.steps,
    ...(pub ? { public_checks: publicChecks(pub) } : {}),
  };
  if (!inconclusive) {
    result.evidence_hash = writeEvidence(config.evidenceDir, {
      kind: 'testnet-probe',
      network: 'testnet',
      anchor_id: result.anchor_id,
      domain: result.domain,
      started_at: result.timestamp,
      verdict: {
        success: result.success,
        settlement_seconds: result.settlement_seconds,
        final_transaction_status: result.final_transaction_status,
        ...(result.error ? { error: result.error } : {}),
      },
      ...(flow.protocol ? { protocol: flow.protocol } : {}),
      steps: flow.steps,
      ...(pub ? { public_checks: publicChecks(pub), public_transcript: pub.transcript } : {}),
      ...flow.evidence,
    });
  }
  return result;
}

const publicChecks = (pub: MainnetProbeResult) => ({
  success: pub.success,
  ...(pub.failed_stage ? { failed_stage: pub.failed_stage } : {}),
  ...(pub.error ? { error: pub.error } : {}),
  stages: pub.stages,
  stages_expected: pub.stages_expected,
  checks: pub.checks,
});

/** The mainnet check (toml, /info, SEP-10, deposit start, TLS), then, if the
 * anchor passed it, the testnet-only money flow. Admission uses it too. */
export async function runChecks(target: FlowTarget): Promise<{ flow: FlowResult; pub: MainnetProbeResult }> {
  const pub = await probePublicSurface(target, { fetchImpl: fetch, requestTimeoutMs: 20_000, networkPassphrase: config.networkPassphrase });
  // A hard failure of the public surface is the anchor's outage already; no
  // need to spend a Friendbot account proving the money flow cannot work.
  if (!pub.success) {
    const flow: FlowResult = {
      success: false,
      inconclusive: false,
      steps: [],
      seconds: pub.settlement_seconds,
      final_transaction_status: null,
      error: `public check failed at ${pub.failed_stage}: ${pub.error}`,
      evidence: {},
    };
    return { flow, pub };
  }
  const flow = await runMoneyFlow(target, liveDeps(target));
  return { flow: { ...flow, seconds: flow.seconds + pub.settlement_seconds }, pub };
}

export async function probeAnchor(anchor: TestnetAnchor): Promise<ProbeResult> {
  const startedAt = new Date();
  const target: FlowTarget = { anchor_id: anchor.anchor_id, domain: anchor.domain, ...(anchor.asset_code ? { asset_code: anchor.asset_code } : {}) };
  const { flow, pub } = await runChecks(target);
  return toProbeResult(target, startedAt, flow, pub);
}

export function appendResult(result: ProbeResult, resultsPath: string = config.resultsPath): void {
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  let existing: ProbeResult[] = [];
  if (fs.existsSync(resultsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    } catch {
      existing = [];
    }
  }
  existing.push(result);
  fs.writeFileSync(resultsPath, JSON.stringify(existing, null, 2));
}

const verdict = (r: ProbeResult) => (r.inconclusive ? 'INCONCLUSIVE' : r.success ? 'SUCCESS' : 'FAILURE');

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const anchors = loadTestnetAnchors(config.anchorsPath, REFERENCE_ANCHOR);
  console.log(`[testnet-probe] money-flow check of ${anchors.length} testnet anchor(s)`);
  let failures = 0;
  // One at a time: each run funds its own account through Friendbot.
  for (const anchor of anchors) {
    const r = await probeAnchor(anchor);
    appendResult(r);
    if (!r.success && !r.inconclusive) failures++;
    const last = r.steps?.filter((s) => s.ok !== null).at(-1);
    console.log(
      `[testnet-probe] ${anchor.anchor_id.padEnd(28)} ${verdict(r).padEnd(12)} ${r.settlement_seconds.toFixed(1)}s ` +
        `${r.protocol ?? ''} ${r.success ? '' : `at ${last?.step}: ${r.error}`}`,
    );
    for (const s of r.steps ?? []) if (s.tx) console.log(`[testnet-probe]     ${s.step}: ${s.tx}`);
  }
  process.exitCode = failures > 0 ? 1 : 0;
}
