// Reads what the scorer needs from the collectors' output files. Everything
// here is I/O; the arithmetic is in inputs.ts and engine.ts.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { SCORE_INPUTS_SCHEMA, writeDocument } from '../evidence.js';
import type { AnchorContext, AssetInfo, FlowHistory, MarketSample, ProbeLine } from './inputs.js';
import type { ScoreInputs } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC dates from `days - 1` days before `end` through `end`. */
function dates(end: number, days: number): string[] {
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

async function readJsonLines<T>(file: string, into: T[]): Promise<void> {
  if (!fs.existsSync(file)) return;
  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      into.push(JSON.parse(line) as T);
    } catch {
      console.warn(`[aggregator] skipping unparseable line in ${file}`);
    }
  }
}

/** mainnet-probe's daily logs covering the 30 days that end at `windowEnd`. */
export async function readProbeHistory(dir: string, windowEnd: number): Promise<ProbeLine[]> {
  const lines: ProbeLine[] = [];
  for (const day of dates(windowEnd, 31)) await readJsonLines(path.join(dir, `probe-${day}.jsonl`), lines);
  return lines;
}

/**
 * Log lines from before the probe recorded `checks` have no SIGNING_KEY of
 * their own, but their evidence document does. Fills it in, reading each
 * document once.
 */
export function fillLegacySigningKeys(lines: ProbeLine[], evidenceDir: string): void {
  for (const line of lines) {
    if (line.checks || !line.evidence_hash) continue;
    const file = path.join(evidenceDir, `${line.evidence_hash}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(file, 'utf-8')) as { stellar_toml?: { signing_key?: string } };
      if (doc.stellar_toml?.signing_key) line.signing_key = doc.stellar_toml.signing_key;
    } catch {
      // An unreadable document just leaves the key unknown.
    }
  }
}

interface StatusFile {
  anchors: Record<string, { assets?: AssetInfo[]; alias_of?: string }>;
}

/** Anchors that are another domain of an operator measured under a
 * different id (anchor id → canonical id). They get no reports and no card
 * of their own, or the operator would be counted twice. */
export function readAliases(statusPath: string): Map<string, string> {
  if (!fs.existsSync(statusPath)) return new Map();
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8')) as StatusFile;
  return new Map(Object.entries(status.anchors).flatMap(([id, a]) => (a.alias_of ? [[id, a.alias_of] as [string, string]] : [])));
}

export function readAssets(statusPath: string): Map<string, AssetInfo[]> {
  if (!fs.existsSync(statusPath)) return new Map();
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8')) as StatusFile;
  return new Map(Object.entries(status.anchors).map(([id, a]) => [id, a.assets ?? []]));
}

/** passive-monitor's market samples for the 7 days ending at `windowEnd`. */
export async function readMarketSamples(dir: string, windowEnd: number): Promise<MarketSample[]> {
  const samples: MarketSample[] = [];
  for (const day of dates(windowEnd, 8)) await readJsonLines(path.join(dir, `market-${day}.jsonl`), samples);
  return samples;
}

export type AnchorFlowHistory = FlowHistory & { anchor_id: string };

/** passive-monitor's flows file: one history per issued asset. */
export function readFlows(flowsPath: string): AnchorFlowHistory[] {
  if (!fs.existsSync(flowsPath)) return [];
  const file = JSON.parse(fs.readFileSync(flowsPath, 'utf-8')) as { assets: Record<string, AnchorFlowHistory> };
  return Object.values(file.assets);
}

export function contextFor(
  anchorId: string,
  assets: Map<string, AssetInfo[]>,
  samples: MarketSample[],
  flows: AnchorFlowHistory[],
): AnchorContext {
  return {
    assets: assets.get(anchorId) ?? [],
    marketSamples: samples.filter((s) => s.anchor_id === anchorId),
    flows: flows.filter((f) => f.anchor_id === anchorId),
  };
}

/** Publishes the inputs as a content-addressed bundle; returns its hash. */
export function writeInputsBundle(dir: string, inputs: ScoreInputs): string {
  return writeDocument(dir, { schema: SCORE_INPUTS_SCHEMA, ...inputs });
}
