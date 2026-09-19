import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveOnboardingDir } from './candidates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '../../..');

loadDotenv({ path: path.join(__dirname, '..', '.env') });
loadDotenv({ path: path.join(repoRoot, '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const resolve = (p: string) => path.resolve(repoRoot, p);

export const config = {
  // Where discovery writes the anchor list and the probe reads it. On the
  // collector host both live under /var/lib/anchor-status, outside the
  // deployed tree, like the rest of the collected data.
  anchorsPath: resolve(process.env.MAINNET_ANCHORS_PATH ?? 'services/mainnet-probe/output/anchors.json'),
  resultsDir: resolve(process.env.MAINNET_PROBE_RESULTS_DIR ?? 'services/mainnet-probe/results'),
  // Latest verdict per anchor, with its directory label: what the dashboard
  // shows next to each anchor. Served next to the history archive.
  statusPath: resolve(process.env.MAINNET_STATUS_PATH ?? 'services/mainnet-probe/output/status.json'),
  // Issuer accounts read from Horizon, cached for a day, beside the status.
  issuersCachePath: path.join(
    path.dirname(resolve(process.env.MAINNET_STATUS_PATH ?? 'services/mainnet-probe/output/status.json')),
    'issuers.json',
  ),
  horizonUrl: (process.env.HORIZON_MAINNET_URL ?? 'https://horizon.stellar.org').replace(/\/$/, ''),
  // Content-addressed evidence documents (<sha256>.json), published as-is.
  evidenceDir: resolve(process.env.EVIDENCE_DIR ?? 'services/mainnet-probe/evidence'),
  // Anchors not seen answering for a week are still probed, just this often.
  dormantIntervalMs: Number(process.env.MAINNET_DORMANT_INTERVAL_HOURS ?? '6') * 60 * 60 * 1000,
  // Anchors registered by hand (existing ids win over derived ones).
  registeredAnchorsPath: resolve('contracts/registered-anchors.json'),

  // Discovery: rated assets from StellarExpert, 200 per page.
  discoveryPages: Number(process.env.MAINNET_DISCOVERY_PAGES ?? '10'),

  // Per-request and per-anchor budgets. One slow anchor never holds up the
  // rest. 20s per request is about what a wallet waits before giving up;
  // 12s flagged sofizpay's deposit start as an outage when it was just slow.
  requestTimeoutMs: Number(process.env.MAINNET_PROBE_REQUEST_TIMEOUT_MS ?? '20000'),
  anchorTimeoutMs: Number(process.env.MAINNET_PROBE_ANCHOR_TIMEOUT_MS ?? '90000'),
  concurrency: Number(process.env.MAINNET_PROBE_CONCURRENCY ?? '12'),

  mainnetPassphrase: 'Public Global Stellar Network ; September 2015',

  // Self-service onboarding: applicants are measured once against these
  // thresholds, then tracked like every other anchor.
  onboardingDir: resolveOnboardingDir(),
  onboardingMinAgeDays: Number(process.env.ONBOARDING_MIN_AGE_DAYS ?? '7'),
  // Payments of its own assets on the network, as StellarExpert counts them.
  onboardingMinTransfers: Number(process.env.ONBOARDING_MIN_TRANSFERS ?? '100'),
  // Each applicant costs a full probe (up to anchorTimeoutMs): a few per
  // round keeps the 20-minute round short whatever the queue holds.
  onboardingMaxPerRun: Number(process.env.ONBOARDING_MAX_PER_RUN ?? '5'),
  // Rounds that fail on our side before an applicant is turned away.
  onboardingMaxAttempts: Number(process.env.ONBOARDING_MAX_ATTEMPTS ?? '6'),

  // On-chain registration of newly discovered anchors (testnet contracts).
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase: process.env.SOROBAN_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  registryContractId: () => required('ANCHOR_REGISTRY_CONTRACT_ID'),
  deployerSecretKey: () => required('DEPLOYER_SECRET_KEY'),
};
