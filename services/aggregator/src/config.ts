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
  mockAnchorsLogsDir: path.resolve(repoRoot, 'services/mock-anchors/logs'),

  statePath: path.resolve(
    repoRoot,
    process.env.AGGREGATOR_STATE_PATH ?? 'services/aggregator/state.json',
  ),
};
