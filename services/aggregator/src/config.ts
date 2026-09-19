import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

loadDotenv({ path: path.join(__dirname, '..', '.env') });
loadDotenv({ path: path.join(repoRoot, '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    process.env.SOROBAN_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  performanceOracleContractId: () => required('PERFORMANCE_ORACLE_CONTRACT_ID'),

  reporterSecretKeys: {
    RealMainnet: () => required('REPORTER_MAINNET_SECRET_KEY'),
    RealTestnet: () => required('REPORTER_TESTNET_SECRET_KEY'),
    SimulatedMock: () => required('REPORTER_MOCK_SECRET_KEY'),
  } as const,

  passiveMonitorProfilesPath: path.resolve(
    repoRoot,
    'services/passive-monitor/output/base-profiles.json',
  ),
  testnetProbeLogPath: path.resolve(repoRoot, 'services/testnet-probe/results/probe-log.json'),
  mainnetProbeResultsDir: path.resolve(
    repoRoot,
    process.env.MAINNET_PROBE_RESULTS_DIR ?? 'services/mainnet-probe/results',
  ),
  // passive-monitor's payment-frequency profiles encoded transaction volume
  // as a latency, so a busy anchor outscored a reliable quiet one. Mainnet
  // scores now come from mainnet-probe; set "true" only to restore the old
  // volume-based signal.
  submitPassiveMonitor: process.env.AGGREGATOR_SUBMIT_PASSIVE_MONITOR === 'true',
  // PerformanceOracle rejects reports older than 2 days; skipping them here
  // avoids a failed transaction per stale report on every run.
  maxReportAgeMs: 47 * 60 * 60 * 1000,
  mockAnchorsLogsDir: path.resolve(repoRoot, 'services/mock-anchors/logs'),
  // Set to "true" to submit only real mainnet/testnet reports.
  skipMock: process.env.AGGREGATOR_SKIP_MOCK === 'true',

  statePath: path.resolve(
    repoRoot,
    process.env.AGGREGATOR_STATE_PATH ?? 'services/aggregator/state.json',
  ),

  // --- Score cards (docs/SCORING.md) ---
  // mainnet-probe's status file: the assets each anchor lists and issues.
  mainnetStatusPath: path.resolve(
    repoRoot,
    process.env.MAINNET_STATUS_PATH ?? 'services/mainnet-probe/output/status.json',
  ),
  // Where inputs bundles are published, beside the probes' own evidence.
  evidenceDir: path.resolve(repoRoot, process.env.EVIDENCE_DIR ?? 'services/mainnet-probe/evidence'),
  // passive-monitor's chain signals.
  marketSamplesDir: path.resolve(
    repoRoot,
    process.env.PASSIVE_MONITOR_MARKET_DIR ?? 'services/passive-monitor/output/market',
  ),
  flowsPath: path.resolve(repoRoot, process.env.PASSIVE_MONITOR_FLOWS_PATH ?? 'services/passive-monitor/output/flows.json'),
};

/** The last card published per anchor, beside the report dedup state. */
export const scoreCardsStatePath = () => path.join(path.dirname(config.statePath), 'score-cards.json');
