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
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    process.env.SOROBAN_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  registryContractId: () => required('ANCHOR_REGISTRY_CONTRACT_ID'),
  oracleContractId: () => required('PERFORMANCE_ORACLE_CONTRACT_ID'),
  // Only used as the unsigned source account for read-only simulation.
  readerPublicKey: () => required('DEPLOYER_PUBLIC_KEY'),

  // Deliberately outside the checked-out code, so a redeploy (git pull,
  // rsync, fresh clone) can never wipe the accumulated history.
  archivePath:
    process.env.HISTORY_ARCHIVE_PATH ?? '/var/lib/anchor-status/history.json',

  // Soroban RPC only serves events for roughly the last 12 hours, so each
  // run re-reads that window and merges. Running more often than the window
  // is what keeps the archive gap-free.
  lookbackLedgers: Number(process.env.HISTORY_LOOKBACK_LEDGERS ?? '9000'),
};
