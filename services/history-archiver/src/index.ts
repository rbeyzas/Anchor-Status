import { loadArchive, mergeAnchor, saveArchive } from './archive.js';
import { config } from './config.js';
import { eventFilters, groupByAnchor, scanEvents } from './events.js';
import { FALLBACK_CONCURRENCY, PRIMARY_CONCURRENCY, provider, RpcPool } from './rpc.js';
import { formatReport, verifyArchive } from './verify.js';

// archive   every collection round: the last 7 days from the public RPC,
//           or from the backup when the public RPC is down.
// backfill  the backup's whole window (~70 days), every configured
//           deployment; reports what was missing, then merges it in.
// verify    the same read as backfill, but changes nothing.
const mode = process.argv[2] ?? 'archive';

function pool(): RpcPool {
  const fallback = config.fallbackRpcUrl && provider('backup', config.fallbackRpcUrl, FALLBACK_CONCURRENCY);
  if (mode === 'archive') {
    return new RpcPool([provider('public', config.rpcUrl, PRIMARY_CONCURRENCY), ...(fallback ? [fallback] : [])]);
  }
  if (!fallback) throw new Error(`${mode} needs SOROBAN_RPC_FALLBACK_URL (the long-retention RPC)`);
  return new RpcPool([fallback]);
}

async function main() {
  if (!['archive', 'backfill', 'verify'].includes(mode)) throw new Error(`unknown mode "${mode}"`);
  const rpcPool = pool();
  const contracts = mode === 'archive' ? config.contracts().slice(0, 1) : config.contracts();

  const health = await rpcPool.call((s) => s.getHealth());
  const end = health.latestLedger + 1;
  const start = mode === 'archive' ? Math.max(health.oldestLedger + 1, end - config.lookbackLedgers) : health.oldestLedger + 1;
  const first = await rpcPool.call((s) => s.getLedgers({ startLedger: start, pagination: { limit: 1 } }));
  const windowStart = new Date(Number(first.ledgers[0]?.ledgerCloseTime ?? 0) * 1000).toISOString();

  const t0 = Date.now();
  const events = await scanEvents(rpcPool, eventFilters(contracts), start, end);
  const byAnchor = groupByAnchor(events);
  console.log(
    `[history-archiver] ${mode}: read ${events.length} event(s) for ${byAnchor.size} anchor(s) from ${windowStart} ` +
      `via ${rpcPool.active.name} RPC in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );

  const archive = loadArchive(config.archivePath);
  if (mode !== 'archive') {
    const report = verifyArchive(archive, byAnchor, windowStart);
    console.log(formatReport(report));
    if (mode === 'verify') return;
  }

  let added = 0;
  for (const [anchorId, incoming] of byAnchor) {
    const before = archive.anchors[anchorId];
    const merged = mergeAnchor(before, incoming);
    added +=
      merged.scoreHistory.length - (before?.scoreHistory.length ?? 0) +
      (merged.slashEvents.length - (before?.slashEvents.length ?? 0)) +
      ((merged.riskEvents?.length ?? 0) - (before?.riskEvents?.length ?? 0));
    archive.anchors[anchorId] = merged;
  }
  archive.updatedAt = new Date().toISOString();
  saveArchive(config.archivePath, archive);

  const totals = Object.values(archive.anchors).reduce((sum, a) => sum + a.scoreHistory.length, 0);
  console.log(`[history-archiver] ${added} new entr(ies), ${totals} score points archived -> ${config.archivePath}`);
}

main().catch((err) => {
  console.error('[history-archiver] fatal error:', err);
  process.exitCode = 1;
});
