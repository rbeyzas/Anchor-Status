import fs from 'node:fs';
import path from 'node:path';
import { MAX_CARDS_PER_RUN, REPUBLISH_AFTER_MS } from './constants.js';
import type { ScoreCard } from './types.js';

/** What the dashboard shows next to a card, from its bundle. */
export interface CardSummary {
  monitored_days: number;
  n30: number;
  coverage: number | null;
  market_na?: string;
}

/** The last card published per anchor. */
export type PublishedCards = Record<string, { published_at: string; inputs_hash: string; card: ScoreCard; summary?: CardSummary }>;

/** The public summary: for each published card, its bundle hash and the
 * confidence factors. A dashboard reads one small file instead of a bundle
 * per anchor, and shows it only when the hash matches the on-chain card. */
export function writeSummary(filePath: string, state: PublishedCards, now: number): void {
  const anchors = Object.fromEntries(
    Object.entries(state)
      .filter(([, s]) => s.summary)
      .map(([id, s]) => [id, { inputs_hash: s.inputs_hash, ...s.summary! }]),
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ generated_at: new Date(now).toISOString(), anchors }, null, 2));
  fs.renameSync(tmp, filePath);
}

export function loadPublished(filePath: string): PublishedCards {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PublishedCards;
  } catch {
    return {};
  }
}

export function savePublished(filePath: string, state: PublishedCards): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath);
}

/** Same verdict: every field but the window it covers. */
export function sameCard(a: ScoreCard, b: ScoreCard): boolean {
  const { window_end: _a, ...restA } = a;
  const { window_end: _b, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

export interface Candidate {
  anchorId: string;
  card: ScoreCard;
}

/**
 * The cards worth a transaction this run: new anchors, changed verdicts,
 * and unchanged ones older than a day. The contract only accepts a window
 * newer than the stored one, so at most one per anchor per hour. Anchors
 * waiting longest go first, and no more than MAX_CARDS_PER_RUN, so a first
 * run over a hundred anchors spreads over a few rounds.
 */
export function selectToPublish(candidates: Candidate[], published: PublishedCards, now: number): Candidate[] {
  const due = candidates.filter(({ anchorId, card }) => {
    const last = published[anchorId];
    if (!last) return true;
    if (card.window_end <= last.card.window_end) return false;
    return !sameCard(card, last.card) || now - Date.parse(last.published_at) >= REPUBLISH_AFTER_MS;
  });
  const lastAt = (id: string) => (published[id] ? Date.parse(published[id].published_at) : 0);
  return due.sort((a, b) => lastAt(a.anchorId) - lastAt(b.anchorId) || a.anchorId.localeCompare(b.anchorId)).slice(0, MAX_CARDS_PER_RUN);
}
