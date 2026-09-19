import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ContractPair } from './events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

loadDotenv({ path: path.join(__dirname, '..', '.env') });
loadDotenv({ path: path.join(repoRoot, '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** "ORACLE_ID:REGISTRY_ID,ORACLE_ID:REGISTRY_ID" */
function parsePairs(value: string | undefined): ContractPair[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [oracle, registry] = s.split(':');
      if (!oracle || !registry) throw new Error(`HISTORY_PREVIOUS_CONTRACTS: expected ORACLE:REGISTRY, got "${s}"`);
      return { oracle, registry };
    });
}

export const config = {
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  // Alchemy, whose URL carries the API key: keep it in .env, never in git.
  // Used when the public RPC fails, and by `backfill`/`verify`, because it
  // keeps ~70 days of events against the public RPC's 7.
  fallbackRpcUrl: process.env.SOROBAN_RPC_FALLBACK_URL,

  /** The current deployment first, then any earlier ones to read history from. */
  contracts: (): ContractPair[] => [
    { oracle: required('PERFORMANCE_ORACLE_CONTRACT_ID'), registry: required('ANCHOR_REGISTRY_CONTRACT_ID') },
    ...parsePairs(process.env.HISTORY_PREVIOUS_CONTRACTS),
  ],

  // Deliberately outside the checked-out code, so a redeploy (git pull,
  // rsync, fresh clone) can never wipe the accumulated history.
  archivePath:
    process.env.HISTORY_ARCHIVE_PATH ?? '/var/lib/anchor-status/history.json',

  // Each run re-reads the public RPC's whole event retention (7 days) and
  // merges, so a run can be missed for days without leaving a gap.
  lookbackLedgers: Number(process.env.HISTORY_LOOKBACK_LEDGERS ?? '120960'),
};
