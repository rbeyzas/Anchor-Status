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
  // Caps pagination for very high-traffic accounts (e.g. an exchange hot
  // wallet can produce tens of thousands of payments/day) so one anchor
  // can't make the whole scan take minutes. The resulting volume/frequency
  // stats become a sample of the most recent activity rather than exhaustive.
  maxPaymentPages: Number(process.env.PASSIVE_MONITOR_MAX_PAGES ?? '10'),
  outputPath: path.join(__dirname, '..', 'output', 'base-profiles.json'),
};

export function loadAnchorsFile(anchorsPath: string) {
  if (!fs.existsSync(anchorsPath)) {
    throw new Error(
      `Anchors config not found at ${anchorsPath}. Copy anchors.example.json to anchors.json and fill in real mainnet anchors first.`,
    );
  }
  const raw = fs.readFileSync(anchorsPath, 'utf-8');
  return JSON.parse(raw) as { anchors: Array<Record<string, string>> };
}
