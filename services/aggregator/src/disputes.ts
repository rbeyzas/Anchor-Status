// Disputes, every round, on each reporter host (`npm run disputes`):
//
//   primary (A)  compares its card for each open dispute's window with the
//                other host's (both hosts' shadow cards), writes the result
//                and a recommendation where the panel reads it, and tells
//                the admins on Telegram when a dispute opens;
//   both         casts this host's reporter vote once the oracle admin's
//                signers have decided a dispute in the panel, checking
//                their signatures itself against Horizon first.
//
// The admins decide; the reporters' keys only carry the decision on-chain,
// since the contract takes dispute votes from reporters alone. A secondary
// host votes only once it publishes (SECONDARY_PUBLISH=true).
//
// .env: DISPUTES_URL (the dashboard's /api/disputes), PEER_SHADOW_URL (the
// other host's shadow-cards.jsonl; defaults to WATCH_URL), ONBOARDING_DIR
// (where the intake reads the comparison), TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_IDS (as for scripts/watch-peer.mjs), HORIZON_URL.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Address, contract, Keypair, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { config } from './config.js';
import { FLAGS } from './scoring/constants.js';
import { readShadow, shadowPath, type ShadowRow } from './scoring/shadow.js';

type SourceType = 'RealMainnet' | 'RealTestnet';
type DecisionValue = 'uphold' | 'reject';

/** Must match dashboard/lib/queue-message.ts. */
export const decisionMessage = (oracle: string, anchorId: string, windowEnd: number, decision: DecisionValue) =>
  `Mona dispute decision: ${decision} ${anchorId} card ${windowEnd} oracle ${oracle}`;

export interface HostCard {
  host: string;
  score?: number;
  flags?: number;
}

export interface Comparison {
  anchorId: string;
  windowEnd: number;
  hosts: HostCard[];
  recommendation: DecisionValue | 'unclear';
  reason: string;
  computedAt: string;
}

/** Scores further apart than this are two different views of the anchor. */
const DISAGREE_POINTS = 15;
const TROUBLE = (1 << FLAGS.OUTAGE) | (1 << FLAGS.LOW_UPTIME);
/** A shadow card this much older than the disputed window still stands for it. */
const NEAREST_S = 2 * 3600;

/** The host's card for `windowEnd`: the latest at or before it, if close. */
export function cardFor(rows: ShadowRow[], anchorId: string, windowEnd: number): ShadowRow | undefined {
  let best: ShadowRow | undefined;
  for (const r of rows) {
    if (r.anchor_id !== anchorId || r.window_end > windowEnd || windowEnd - r.window_end > NEAREST_S) continue;
    if (!best || r.window_end > best.window_end) best = r;
  }
  return best;
}

/** What the two reporters' cards say about a disputed window. A suggestion
 * for the admins, who also read the operator's evidence. */
export function recommend(a: HostCard, b: HostCard): Pick<Comparison, 'recommendation' | 'reason'> {
  if (a.score === undefined || b.score === undefined) {
    const has = [a, b].filter((h) => h.score !== undefined).map((h) => h.host);
    return {
      recommendation: 'unclear',
      reason: has.length ? `Only ${has[0]} has a card for this window; decide on the evidence.` : 'Neither reporter has a card for this window; decide on the evidence.',
    };
  }
  const troubled = (h: HostCard) => ((h.flags ?? 0) & TROUBLE) !== 0;
  const scores = `${a.host} ${a.score}, ${b.host} ${b.score}`;
  if (troubled(a) !== troubled(b) || Math.abs(a.score - b.score) > DISAGREE_POINTS) {
    const [low, high] = a.score <= b.score ? [a, b] : [b, a];
    return {
      recommendation: 'uphold',
      reason: `${low.host} saw failures that ${high.host} did not (${scores}): the card rests on one reporter's view. Uphold, unless the evidence shows the anchor really was down for ${low.host}'s users too.`,
    };
  }
  if (troubled(a)) {
    return {
      recommendation: 'unclear',
      reason: `Both reporters saw the outage (${scores}): the anchor really was unreachable. Whether it should count is for the evidence to show, for example maintenance announced in advance.`,
    };
  }
  return {
    recommendation: 'reject',
    reason: `The reporters agree and neither saw an outage (${scores}): the card matches both measurements. Reject, unless the evidence shows what the probes cannot see.`,
  };
}

interface OpenDispute {
  anchorId: string;
  windowEnd: number;
  openedAt: number;
  reasonCode: number;
  evidenceHash: string;
  voters: string[];
}

const tag = (v: unknown) => (Array.isArray(v) ? String(v[0]) : String(v));

async function openDisputes(server: rpc.Server, oracle: string, anchorIds: string[]): Promise<OpenDispute[]> {
  const contractAddress = new Address(oracle).toScAddress();
  const out: OpenDispute[] = [];
  for (let i = 0; i < anchorIds.length; i += 100) {
    const keys = anchorIds.slice(i, i + 100).map((id) =>
      xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: contractAddress,
          key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Dispute'), xdr.ScVal.scvSymbol(id)]),
          durability: xdr.ContractDataDurability.persistent,
        }),
      ),
    );
    const { entries } = await server.getLedgerEntries(...keys);
    for (const e of entries) {
      if (e.val.type !== 'contractData') continue;
      const data = e.val.contractData;
      const anchorId = String(scValToNative(data.key)[1]);
      const d = scValToNative(data.val) as Record<string, unknown>;
      if (tag(d.status) !== 'Open') continue;
      out.push({
        anchorId,
        windowEnd: Number(d.window_end),
        openedAt: Number(d.opened_at),
        reasonCode: Number(d.reason_code),
        evidenceHash: Buffer.from(d.evidence_hash as Uint8Array).toString('hex'),
        voters: [...(d.uphold as unknown[]), ...(d.reject as unknown[])].map(String),
      });
    }
  }
  return out;
}

async function telegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = (process.env.TELEGRAM_CHAT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!token || chats.length === 0) return;
  for (const chat_id of chats) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    }).catch((err: Error) => ({ ok: false, status: err.message }) as const);
    if (!res.ok) console.error(`[disputes] telegram: chat ${chat_id} failed (${res.status})`);
  }
}

/** A SEP-53 signed message: ed25519 over sha256("Stellar Signed Message:\n" + message). */
export function verifyMessage(signer: string, message: string, signatureBase64: string): boolean {
  const digest = createHash('sha256').update(`Stellar Signed Message:\n${message}`).digest();
  try {
    return Keypair.fromPublicKey(signer).verify(digest, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

interface Decision {
  anchorId: string;
  windowEnd: number;
  decision: DecisionValue;
  signers: string[];
}

interface Account {
  signers: { key: string; weight: number }[];
  threshold: number;
}

/** The decision for `d` that the admin's signers carried, checked here and
 * not taken from the dashboard's own weighing; null if none, or if both
 * were carried (then nobody votes and the admins hear about it). */
export function carried(d: OpenDispute, decisions: { anchorId: string; windowEnd: number; decision: DecisionValue; signatures: { signer: string; signature: string }[] }[], account: Account, oracle: string): DecisionValue | 'both' | null {
  const weightOf = (value: DecisionValue) => {
    const ds = decisions.filter((x) => x.anchorId === d.anchorId && x.windowEnd === d.windowEnd && x.decision === value);
    const message = decisionMessage(oracle, d.anchorId, d.windowEnd, value);
    const valid = new Set(ds.flatMap((x) => x.signatures).filter((s) => verifyMessage(s.signer, message, s.signature)).map((s) => s.signer));
    return account.signers.filter((s) => valid.has(s.key)).reduce((w, s) => w + s.weight, 0);
  };
  const up = weightOf('uphold') >= account.threshold;
  const down = weightOf('reject') >= account.threshold;
  return up && down ? 'both' : up ? 'uphold' : down ? 'reject' : null;
}

async function loadAccount(address: string): Promise<Account> {
  const horizon = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
  const res = await fetch(`${horizon}/accounts/${address}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Horizon: account ${address} HTTP ${res.status}`);
  const a = (await res.json()) as { signers: { key: string; weight: number }[]; thresholds: { med_threshold: number } };
  return { signers: a.signers.filter((s) => s.weight > 0), threshold: Math.max(1, a.thresholds.med_threshold) };
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 1));
  fs.renameSync(`${file}.tmp`, file);
}

async function main() {
  const primary = (process.env.COLLECTOR_ROLE ?? 'primary') === 'primary';
  const votes = primary || process.env.SECONDARY_PUBLISH === 'true';
  const oracleId = config.performanceOracleContractId();
  const server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const client = (id: string, signer?: Keypair) =>
    contract.Client.from({
      contractId: id,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      ...(signer ? { publicKey: signer.publicKey(), signTransaction: new contract.KeypairSigner(signer, config.networkPassphrase) } : {}),
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registry: any = await client(config.anchorRegistryContractId());
  const anchorIds = ((await registry.list_anchors()).result as string[]).map(String);
  const open = await openDisputes(server, oracleId, anchorIds);
  console.log(`[disputes] ${open.length} open dispute(s)`);

  const statePath = path.join(path.dirname(config.statePath), 'disputes-state.json');
  const state = readJson<{ notified: string[] }>(statePath, { notified: [] });
  const keyOf = (d: { anchorId: string; windowEnd: number }) => `${d.anchorId}@${d.windowEnd}`;
  const when = (s: number) => new Date(s * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  if (primary) {
    const comparisons: Record<string, Comparison> = {};
    if (open.length) {
      const peerUrl = process.env.PEER_SHADOW_URL ?? process.env.WATCH_URL ?? '';
      const own = readShadow(shadowPath());
      let peer: ShadowRow[] = [];
      try {
        const res = await fetch(peerUrl, { signal: AbortSignal.timeout(30_000) });
        if (res.ok) peer = (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as ShadowRow);
      } catch (err) {
        console.error(`[disputes] could not read the other host's cards (${peerUrl}): ${(err as Error).message}`);
      }
      for (const d of open) {
        const pick = (host: string, rows: ShadowRow[]): HostCard => {
          const c = cardFor(rows, d.anchorId, d.windowEnd);
          return c ? { host, score: c.score, flags: c.flags } : { host };
        };
        const hosts = [pick('A', own), pick('B', peer)];
        comparisons[keyOf(d)] = { anchorId: d.anchorId, windowEnd: d.windowEnd, hosts, ...recommend(hosts[0], hosts[1]), computedAt: new Date().toISOString() };
      }
    }
    if (process.env.ONBOARDING_DIR) writeJson(path.join(process.env.ONBOARDING_DIR, 'dispute-compare.json'), comparisons);

    for (const d of open.filter((x) => !state.notified.includes(keyOf(x)))) {
      const c = comparisons[keyOf(d)];
      await telegram(
        `⚖️ Dispute opened on ${d.anchorId}\ncard ending ${when(d.windowEnd)}, reason code ${d.reasonCode}\n` +
          (c ? `Suggestion: ${c.recommendation}. ${c.reason}\n` : '') +
          `Decide in the panel: ${process.env.PANEL_URL ?? 'https://monarank.xyz/panel'}`,
      );
      state.notified.push(keyOf(d));
    }
    state.notified = state.notified.slice(-200);
    writeJson(statePath, state);
  }

  if (!votes || !open.length) return;
  const disputesUrl = process.env.DISPUTES_URL ?? 'https://monarank.xyz/api/disputes';
  const res = await fetch(disputesUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${disputesUrl}: HTTP ${res.status}`);
  // The dashboard's weighing is ignored: the raw signatures are checked here.
  const { decisions = [] } = (await res.json()) as { decisions?: (Decision & { signatures?: { signer: string; signature: string }[] })[] };
  if (!decisions.length) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oracleRead: any = await client(oracleId);
  const adminResult = (await oracleRead.get_admin()).result;
  const admin = String(adminResult?.unwrap ? adminResult.unwrap() : adminResult);
  const account = await loadAccount(admin);

  for (const d of open) {
    const raw = decisions.map((x) => ({ ...x, signatures: x.signatures ?? [] }));
    const outcome = carried(d, raw, account, oracleId);
    if (!outcome) continue;
    if (outcome === 'both') {
      console.error(`[disputes] ${keyOf(d)}: both uphold and reject carried; not voting`);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info: any = (await registry.get_anchor_info({ anchor_id: d.anchorId })).result;
    const t = info.unwrap ? info.unwrap() : info;
    const sourceType = (typeof t.source_type === 'string' ? t.source_type : t.source_type.tag) as SourceType;
    const reporter = Keypair.fromSecret(config.reporterSecretKeys[sourceType]());
    if (d.voters.includes(reporter.publicKey())) continue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oracle: any = await client(oracleId, reporter);
      const tx = await oracle.vote_dispute({ reporter: reporter.publicKey(), anchor_id: d.anchorId, uphold: outcome === 'uphold' });
      const sent = await tx.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '?';
      console.log(`[disputes] voted ${outcome} on ${keyOf(d)} as ${reporter.publicKey()}; tx ${hash}`);
      await telegram(`🗳️ ${primary ? 'A' : 'B'} voted ${outcome} on the dispute of ${d.anchorId} (card ending ${when(d.windowEnd)}), as the admins decided. tx ${hash}`);
    } catch (err) {
      console.error(`[disputes] vote on ${keyOf(d)} failed: ${(err as Error).message.split('\n')[0]}`);
    }
  }
}

if (process.argv[1]?.endsWith('disputes.ts')) {
  await main().catch((err) => {
    console.error(`[disputes] ${(err as Error).message.split('\n')[0]}`);
    process.exitCode = 1;
  });
}
