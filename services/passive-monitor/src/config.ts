import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

// Service-local .env (if present) takes priority over the shared repo-root .env.
loadDotenv({ path: path.join(__dirname, '..', '.env') });
loadDotenv({ path: path.join(repoRoot, '.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  horizonMainnetUrl: required('HORIZON_MAINNET_URL', 'https://horizon.stellar.org'),
  anchorsConfigPath: path.resolve(
    repoRoot,
    process.env.PASSIVE_MONITOR_ANCHORS_CONFIG ?? './services/passive-monitor/anchors.json',
  ),
  lookbackDays: Number(process.env.PASSIVE_MONITOR_LOOKBACK_DAYS ?? '7'),
  requestDelayMs: Number(process.env.PASSIVE_MONITOR_REQUEST_DELAY_MS ?? '1500'),
  // 200 payments/page; caps very high-volume accounts at ~5,000 payments.
  maxPages: Number(process.env.PASSIVE_MONITOR_MAX_PAGES ?? '25'),
  outputPath: path.join(__dirname, '..', 'output', 'base-profiles.json'),

  // --- Chain signals for the score cards ---
  // mainnet-probe's status file: which assets each anchor issues.
  statusPath: path.resolve(repoRoot, process.env.MAINNET_STATUS_PATH ?? 'services/mainnet-probe/output/status.json'),
  // Durable on the collector host (under /var/lib/anchor-status), like the
  // rest of the collected data.
  flowsPath: path.resolve(repoRoot, process.env.PASSIVE_MONITOR_FLOWS_PATH ?? 'services/passive-monitor/output/flows.json'),
  marketDir: path.resolve(repoRoot, process.env.PASSIVE_MONITOR_MARKET_DIR ?? 'services/passive-monitor/output/market'),
  // Total outstanding per issued asset, one reading a round. See supply.ts.
  supplyDir: path.resolve(repoRoot, process.env.PASSIVE_MONITOR_SUPPLY_DIR ?? 'services/passive-monitor/output/supply'),
  // Reflector's feeds live on pubnet; this project writes to testnet, so
  // the read-only RPC for them is configured on its own. Unset means the
  // HTTP currency table is the only reference source.
  reflectorRpcUrl: process.env.SOROBAN_PUBNET_RPC_URL ?? 'https://mainnet.sorobanrpc.com',
  // A 30-day backfill of a busy issuer takes minutes; this many new issuers
  // per round keeps a first run from holding up the 20-minute collection.
  maxBackfillsPerRun: Number(process.env.PASSIVE_MONITOR_MAX_BACKFILLS_PER_RUN ?? '5'),
  requestTimeoutMs: 20_000,
  get fxCachePath() {
    return fxCachePathFor(this.flowsPath);
  },
};

/** Today's FX table, cached beside the flows. */
export const fxCachePathFor = (flowsPath: string) => path.join(path.dirname(flowsPath), 'fx.json');

export function loadAnchorsFile(anchorsPath: string) {
  if (!fs.existsSync(anchorsPath)) {
    throw new Error(
      `Anchors config not found at ${anchorsPath}. Copy anchors.example.json to anchors.json and fill in real mainnet anchors first.`,
    );
  }
  const raw = fs.readFileSync(anchorsPath, 'utf-8');
  return JSON.parse(raw) as { anchors: Array<Record<string, string>> };
}
