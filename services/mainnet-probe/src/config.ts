import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
  // Anchors registered by hand (existing ids win over derived ones).
  registeredAnchorsPath: resolve('contracts/registered-anchors.json'),

  // Discovery: rated assets from StellarExpert, 200 per page.
  discoveryPages: Number(process.env.MAINNET_DISCOVERY_PAGES ?? '10'),

  // Per-request and per-anchor budgets. One slow anchor never holds up the
  // rest. 20s per request is about what a wallet waits before giving up;
  // 12s flagged sofizpay's deposit start as an outage when it was just slow.
  requestTimeoutMs: Number(process.env.MAINNET_PROBE_REQUEST_TIMEOUT_MS ?? '20000'),
  anchorTimeoutMs: Number(process.env.MAINNET_PROBE_ANCHOR_TIMEOUT_MS ?? '90000'),
  concurrency: Number(process.env.MAINNET_PROBE_CONCURRENCY ?? '6'),

  mainnetPassphrase: 'Public Global Stellar Network ; September 2015',

  // On-chain registration of newly discovered anchors (testnet contracts).
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase: process.env.SOROBAN_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  registryContractId: () => required('ANCHOR_REGISTRY_CONTRACT_ID'),
  deployerSecretKey: () => required('DEPLOYER_SECRET_KEY'),
};
