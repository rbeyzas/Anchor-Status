import fs from 'node:fs';
import path from 'node:path';
import { isDormant, loadAnchorsFile, registeredMainnetAnchors, type MainnetAnchor } from './anchors.js';
import { mapWithConcurrency } from './concurrency.js';
import { config } from './config.js';
import { HttpError } from './http.js';
import { probeAnchor, type MainnetProbeResult, type ProbeTarget } from './probe.js';
import { buildStatus, lastProbedAt, loadStatus, saveStatus } from './status.js';
import { writeEvidence } from './evidence.js';

/** Resolves to a timeout failure if the whole probe of one anchor overruns,
 * so a hung anchor can't hold up the round. */
function withAnchorTimeout(target: ProbeTarget, run: Promise<MainnetProbeResult>): Promise<MainnetProbeResult> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<MainnetProbeResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          anchor_id: target.anchor_id,
          domain: target.domain,
          source_type: 'RealMainnet',
          timestamp: new Date().toISOString(),
          success: false,
          settlement_seconds: config.anchorTimeoutMs / 1000,
          failed_stage: 'timeout',
          error: `no result within ${config.anchorTimeoutMs} ms`,
          stages: {},
        }),
      config.anchorTimeoutMs,
    );
  });
  return Promise.race([run, timeout]).finally(() => clearTimeout(timer));
}

/** True when we, not the anchors, are offline: a failed probe must not be
 * written on-chain as an anchor outage when it was our network. */
async function ourNetworkIsDown(): Promise<boolean> {
  try {
    const res = await fetch('https://horizon.stellar.org/', { signal: AbortSignal.timeout(10_000) });
    return !res.ok;
  } catch {
    return true;
  }
}

/** Appends to one JSON-lines file per UTC day. Append-only: nothing already
 * collected is ever rewritten, and readers only need the last few days. */
export function appendResults(dir: string, results: MainnetProbeResult[]): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const r of results) {
    const file = path.join(dir, `probe-${r.timestamp.slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, `${JSON.stringify(r)}\n`);
  }
}

async function main() {
  const now = new Date();
  const anchors: MainnetAnchor[] =
    loadAnchorsFile(config.anchorsPath)?.anchors ??
    registeredMainnetAnchors(config.registeredAnchorsPath).map((a) => ({ ...a, first_seen: now.toISOString() }));
  const previousStatus = loadStatus(config.statusPath);
  const dormant = (a: MainnetAnchor) => isDormant(a, now);

  // Every anchor is measured; dormant ones (silent for a week) only every
  // few hours, so ~80 dead directory entries don't turn each 20-minute round
  // into 80 failing transactions.
  const due = anchors.filter(
    (a) => !dormant(a) || now.getTime() - lastProbedAt(previousStatus, a.anchor_id) >= config.dormantIntervalMs,
  );
  console.log(
    `[mainnet-probe] probing ${due.length} of ${anchors.length} anchor(s) ` +
      `(${anchors.filter(dormant).length} dormant), up to ${config.concurrency} at a time`,
  );

  const results = await mapWithConcurrency(due, config.concurrency, (a) =>
    withAnchorTimeout(
      a,
      probeAnchor(a, {
        fetchImpl: fetch,
        requestTimeoutMs: config.requestTimeoutMs,
        networkPassphrase: config.mainnetPassphrase,
      }).catch((err): MainnetProbeResult => ({
        anchor_id: a.anchor_id,
        domain: a.domain,
        source_type: 'RealMainnet',
        timestamp: new Date().toISOString(),
        success: false,
        settlement_seconds: 0,
        inconclusive: true,
        error: `probe crashed: ${(err as Error).message}`,
        stages: {},
      })),
    ),
  );

  // Every anchor failing to even serve stellar.toml without an HTTP answer
  // looks like our outage, not twelve simultaneous anchor outages.
  const allUnreachable =
    results.length > 1 &&
    results.every((r) => !r.success && r.failed_stage === 'toml' && !/HTTP \d{3}/.test(r.error ?? ''));
  if ((await ourNetworkIsDown()) || allUnreachable) {
    console.warn('[mainnet-probe] our own network looks down; recording failures as inconclusive');
    for (const r of results) if (!r.success) r.inconclusive = true;
  }

  // Publish one evidence document per conclusive result; its hash goes into
  // the result, and from there into the on-chain report event.
  for (const r of results) {
    const { transcript, ...rest } = r;
    delete r.transcript;
    if (r.inconclusive) continue;
    r.evidence_hash = writeEvidence(config.evidenceDir, {
      kind: 'mainnet-probe',
      network: 'mainnet',
      anchor_id: rest.anchor_id,
      domain: rest.domain,
      started_at: rest.timestamp,
      verdict: {
        success: rest.success,
        settlement_seconds: rest.settlement_seconds,
        ...(rest.failed_stage ? { failed_stage: rest.failed_stage } : {}),
        ...(rest.error ? { error: rest.error } : {}),
      },
      stages: rest.stages,
      ...(transcript ?? {}),
    });
  }

  appendResults(config.resultsDir, results);
  saveStatus(config.statusPath, buildStatus(anchors, results, previousStatus, now, dormant));
  for (const r of results) {
    const verdict = r.inconclusive ? 'INCONCLUSIVE' : r.success ? 'OK' : `FAIL@${r.failed_stage}`;
    const policy = Object.entries(r.stages)
      .filter(([, s]) => s?.policy)
      .map(([k]) => `${k}:policy`)
      .join(',');
    console.log(`[mainnet-probe] ${r.anchor_id.padEnd(28)} ${verdict.padEnd(16)} ${r.settlement_seconds.toFixed(2)}s ${policy}`);
  }
  const ok = results.filter((r) => r.success).length;
  console.log(`[mainnet-probe] done: ${ok}/${results.length} reachable`);
}

// Imported by tests for appendResults; only run when executed directly.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[mainnet-probe] fatal:', err);
    process.exitCode = 1;
  });
}

