import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeMockAnchorLogEntry,
  normalizePassiveMonitorProfile,
  normalizeTestnetProbeResult,
} from './normalize.js';
import type {
  MockAnchorLogEntry,
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

export function readTestnetProbeReports(probeLogPath: string): NormalizedReport[] {
  const results = readJsonArray<TestnetProbeResult>(probeLogPath);
  return results.map(normalizeTestnetProbeResult);
}

/** mock-anchors writes one logs/anchor{N}-behavior.json per instance; glob
 * over the directory rather than hardcoding N=1..4 so it keeps working if
 * more mock anchors are added later. */
export function readMockAnchorReports(logsDir: string): NormalizedReport[] {
  if (!fs.existsSync(logsDir)) {
    console.warn(`[aggregator] mock-anchors logs dir not found, skipping: ${logsDir}`);
    return [];
  }
  const files = fs.readdirSync(logsDir).filter((f) => f.endsWith('-behavior.json'));
  const reports: NormalizedReport[] = [];
  for (const file of files) {
    const entries = readJsonArray<MockAnchorLogEntry>(path.join(logsDir, file));
    reports.push(...entries.map(normalizeMockAnchorLogEntry));
  }
  return reports;
}
