import fs from 'node:fs';
import path from 'node:path';
import type { Archive, AnchorArchive, RiskEvent, ScorePoint, SlashEvent } from './types.js';
import { emptyArchive } from './types.js';

/** Reads the archive, or returns an empty one when the file doesn't exist
 * yet. A corrupt file is never silently discarded — losing accumulated
 * history is worse than failing loudly. */
export function loadArchive(filePath: string): Archive {
  if (!fs.existsSync(filePath)) return emptyArchive();
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as Archive;
  if (parsed.version !== 1 || typeof parsed.anchors !== 'object' || parsed.anchors === null) {
    throw new Error(`Unrecognized archive format at ${filePath}`);
  }
  return parsed;
}

/** Writes via a temp file + rename so a crash mid-write can't truncate the
 * archive, and keeps one .bak copy of the previous contents. */
export function saveArchive(filePath: string, archive: Archive): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  }
  const tmp = `${filePath}.tmp`;
  // Compact: the file is read by programs, and holds tens of thousands of points.
  fs.writeFileSync(tmp, JSON.stringify(archive));
  fs.renameSync(tmp, filePath);
}

function mergeSorted<T>(existing: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  const byKey = new Map(existing.map((item) => [keyOf(item), item]));
  for (const item of incoming) {
    byKey.set(keyOf(item), item);
  }
  return Array.from(byKey.values()).sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

export const scorePointKey = (p: ScorePoint) => `${p.timestamp}|${p.score}`;
export const slashEventKey = (e: SlashEvent) => `${e.timestamp}|${e.amountStroops}`;
export const riskEventKey = (e: RiskEvent) => `${e.timestamp}|${e.riskReason}`;

/** Merges one anchor's freshly-read events into what's already archived.
 * Existing entries are never removed — a run that reads nothing (RPC
 * hiccup, pruned window) leaves the archive intact. */
export function mergeAnchor(
  existing: AnchorArchive | undefined,
  incoming: { scoreHistory: ScorePoint[]; slashEvents: SlashEvent[]; riskEvents?: RiskEvent[] },
): AnchorArchive {
  const base: AnchorArchive = existing ?? { scoreHistory: [], slashEvents: [] };
  return {
    scoreHistory: mergeSorted(base.scoreHistory, incoming.scoreHistory, scorePointKey),
    slashEvents: mergeSorted(base.slashEvents, incoming.slashEvents, slashEventKey),
    riskEvents: mergeSorted(base.riskEvents ?? [], incoming.riskEvents ?? [], riskEventKey),
  };
}
