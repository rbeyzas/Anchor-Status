import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

loadDotenv({ path: path.join(__dirname, '..', '.env') });
loadDotenv({ path: path.join(repoRoot, '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  anchorDomain: process.env.TESTNET_PROBE_ANCHOR_DOMAIN ?? 'testanchor.stellar.org',
  // Soroban's `Symbol` type (used for AnchorRegistry/PerformanceOracle's
  // `anchor_id`) only allows [A-Za-z0-9_], max 32 chars — a raw domain like
  // "testanchor.stellar.org" is rejected at the host level ("byte is not
  // allowed in Symbol", the '.'). anchor_id is therefore a separate slug;
  // the actual domain is still reported (and used for SEP-10/24) via
  // anchorDomain/domain.
  anchorId: process.env.TESTNET_PROBE_ANCHOR_ID ?? 'stellar_test_anchor',
  assetCode: process.env.TESTNET_PROBE_ASSET_CODE ?? 'SRT',
  depositAmount: process.env.TESTNET_PROBE_DEPOSIT_AMOUNT ?? '10',
  friendbotUrl: process.env.FRIENDBOT_URL ?? 'https://friendbot.stellar.org',
  horizonTestnetUrl: process.env.HORIZON_TESTNET_URL ?? 'https://horizon-testnet.stellar.org',
  networkPassphrase: process.env.SOROBAN_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  scheduleCron: process.env.TESTNET_PROBE_SCHEDULE_CRON ?? '0 * * * *',
  pollIntervalMs: Number(process.env.TESTNET_PROBE_POLL_INTERVAL_MS ?? '4000'),
  pollTimeoutMs: Number(process.env.TESTNET_PROBE_POLL_TIMEOUT_MS ?? String(5 * 60 * 1000)),
  interactiveTimeoutMs: Number(process.env.TESTNET_PROBE_INTERACTIVE_TIMEOUT_MS ?? '60000'),
  // Headless works against testanchor.stellar.org. PROBE_HEADLESS=false opens
  // a visible browser, which is useful for debugging a new anchor's UI.
  headless: process.env.PROBE_HEADLESS !== 'false',
  resultsPath: path.join(__dirname, '..', 'results', 'probe-log.json'),
  // Every testnet anchor measured each round (the reference anchor is
  // always added). On the collector host it lives with the other data.
  anchorsPath: path.resolve(repoRoot, process.env.TESTNET_ANCHORS_PATH ?? 'services/testnet-probe/output/testnet-anchors.json'),
  // Testnet applications: kept apart from mainnet's (ONBOARDING_DIR).
  onboardingDir: path.resolve(
    repoRoot,
    process.env.ONBOARDING_TESTNET_DIR ?? path.join(process.env.ONBOARDING_DIR ?? 'services/mainnet-probe/output/onboarding', 'testnet'),
  ),
  onboardingMaxPerRun: Number(process.env.ONBOARDING_TESTNET_MAX_PER_RUN ?? '3'),
  onboardingMaxAttempts: Number(process.env.ONBOARDING_MAX_ATTEMPTS ?? '6'),
  // On-chain registration of admitted testnet anchors.
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  registryContractId: () => required('ANCHOR_REGISTRY_CONTRACT_ID'),
  deployerSecretKey: () => required('DEPLOYER_SECRET_KEY'),
  // Content-addressed evidence documents; on the collector host this is the
  // same published directory mainnet-probe writes to.
  evidenceDir: path.resolve(repoRoot, process.env.EVIDENCE_DIR ?? 'services/testnet-probe/evidence'),
};
