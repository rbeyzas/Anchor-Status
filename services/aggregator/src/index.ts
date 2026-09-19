import { config } from './config.js';
import { submitReport } from './contract.js';
import { dedupKey } from './normalize.js';
import { readMainnetProbeReports, readMockAnchorReports, readPassiveMonitorReports, readTestnetProbeReports } from './sources.js';
import { runScoring } from './scoring/run.js';
import { loadState, saveState } from './state.js';
import type { NormalizedReport } from './types.js';

async function main() {
  const all: NormalizedReport[] = [
    ...readMainnetProbeReports(config.mainnetProbeResultsDir),
    ...(config.submitPassiveMonitor ? readPassiveMonitorReports(config.passiveMonitorProfilesPath) : []),
    ...readTestnetProbeReports(config.testnetProbeLogPath),
    ...(config.skipMock ? [] : readMockAnchorReports(config.mockAnchorsLogsDir)),
  ];
  const cutoff = Date.now() - config.maxReportAgeMs;
  const reports = all.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  console.log(
    `[aggregator] read ${all.length} report(s) across all sources, ${all.length - reports.length} too old to submit`,
  );

  const submitted = loadState(config.statePath);
  const pending = reports.filter((r) => !submitted.has(dedupKey(r)));
  console.log(`[aggregator] ${pending.length} new report(s) to submit (${reports.length - pending.length} already submitted)`);

  let succeeded = 0;
  let failed = 0;
  for (const report of pending) {
    const key = dedupKey(report);
    try {
      await submitReport(report);
      submitted.add(key);
      saveState(config.statePath, submitted); // persist after every success so a crash mid-run doesn't resubmit
      succeeded++;
      console.log(`[aggregator] submitted ${key} (success=${report.success}, ${report.settlement_seconds.toFixed(1)}s)`);
    } catch (err) {
      failed++;
      console.error(`[aggregator] failed to submit ${key}: ${(err as Error).message}`);
    }
  }

  console.log(`[aggregator] done: ${succeeded} submitted, ${failed} failed, ${reports.length - pending.length} skipped (already sent)`);

  // Score cards come after the reports, so a card never lands before the
  // report that its window already counts.
  const scoring = await runScoring().catch((err) => {
    console.error(`[aggregator] scoring failed: ${(err as Error).message}`);
    return { published: 0, failed: 1 };
  });
  if (failed > 0 || scoring.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[aggregator] fatal error:', err);
  process.exitCode = 1;
});
