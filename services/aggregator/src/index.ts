import { config } from './config.js';
import { submitReport } from './contract.js';
import { dedupKey } from './normalize.js';
import { readMockAnchorReports, readPassiveMonitorReports, readTestnetProbeReports } from './sources.js';
import { loadState, saveState } from './state.js';
import type { NormalizedReport } from './types.js';

async function main() {
  const reports: NormalizedReport[] = [
    ...readPassiveMonitorReports(config.passiveMonitorProfilesPath),
    ...readTestnetProbeReports(config.testnetProbeLogPath),
    ...readMockAnchorReports(config.mockAnchorsLogsDir),
  ];
  console.log(`[aggregator] read ${reports.length} report(s) across all sources`);

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
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[aggregator] fatal error:', err);
  process.exitCode = 1;
});
