import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeMainnetProbeResult,
  normalizePassiveMonitorProfile,
  normalizeTestnetProbeResult,
} from './normalize.js';
import type {
  MainnetProbeResult,
  NormalizedReport,
  PassiveMonitorProfile,
  TestnetProbeResult,
} from './types.js';

function readJsonArray<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`[aggregator] source file not found, skipping: ${filePath}`);
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.warn(`[aggregator] failed to parse ${filePath}: ${(err as Error).message}`);
    return [];
  }
}

export function readPassiveMonitorReports(baseProfilesPath: string): NormalizedReport[] {
  const profiles = readJsonArray<PassiveMonitorProfile>(baseProfilesPath);
  return profiles.map(normalizePassiveMonitorProfile);
}

/** Reads mainnet-probe's daily JSON-lines files for the last `days` UTC days
 * (older reports would be rejected by the contract anyway). */
export function readMainnetProbeReports(dir: string, now: Date = new Date(), days = 3): NormalizedReport[] {
  if (!fs.existsSync(dir)) {
    console.warn(`[aggregator] mainnet-probe results dir not found, skipping: ${dir}`);
    return [];
  }
  const results: MainnetProbeResult[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const file = path.join(dir, `probe-${day}.jsonl`);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        results.push(JSON.parse(line) as MainnetProbeResult);
      } catch {
        console.warn(`[aggregator] skipping unparseable line in ${file}`);
      }
    }
  }
  const conclusive = results.filter((r) => !r.inconclusive);
  if (conclusive.length < results.length) {
    console.log(`[aggregator] skipping ${results.length - conclusive.length} inconclusive mainnet probe run(s)`);
  }
  return conclusive.map(normalizeMainnetProbeResult);
}

export function readTestnetProbeReports(probeLogPath: string): NormalizedReport[] {
  const results = readJsonArray<TestnetProbeResult>(probeLogPath);
  const conclusive = results.filter((r) => !r.inconclusive);
  if (conclusive.length < results.length) {
    console.log(`[aggregator] skipping ${results.length - conclusive.length} inconclusive testnet probe run(s)`);
  }
  return conclusive.map(normalizeTestnetProbeResult);
}
