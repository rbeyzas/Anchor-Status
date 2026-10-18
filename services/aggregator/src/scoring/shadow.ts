// Shadow mode, before the reporter quorum is switched on: every collector
// host computes the cards it would publish, every round, and keeps them
// locally; nothing goes on-chain. Comparing two hosts' files shows how far
// independent measurements of the same anchor and window drift apart,
// which is what the oracle's max_spread must allow.
//
//   npm run shadow -- record                 append this round's cards
//   npm run shadow -- compare <a> <b> [--json]   spread between two hosts
import fs from 'node:fs';
import path from 'node:path';
import { readQuorumConfig } from '../contract.js';
import { runScoring } from './run.js';

export interface ShadowRow {
  anchor_id: string;
  window_end: number;
  score: number;
  confidence: number;
  flags: number;
  methodology_version: number;
  recorded_at: string;
}

const key = (r: Pick<ShadowRow, 'anchor_id' | 'window_end'>) => `${r.anchor_id}@${r.window_end}`;

export function readShadow(file: string): ShadowRow[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ShadowRow);
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

export interface SpreadReport {
  pairs: number;
  /** Same methodology, both confident enough to show (>= 40). */
  shown_pairs: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  /** Share of shown pairs further apart than each candidate max_spread. */
  over: Record<string, number>;
  worst: { anchor_id: string; window_end: number; a: number; b: number }[];
}

/**
 * Pairs the two hosts' cards by anchor and window and measures the score
 * gap. Only cards both hosts would show (confidence 40 or more, same
 * methodology) count toward the percentiles: a withheld card has no
 * headline to disagree about.
 */
export function compareShadow(a: ShadowRow[], b: ShadowRow[], candidates = [5, 10, 15, 20, 25]): SpreadReport {
  const byKey = new Map(b.map((r) => [key(r), r]));
  const gaps: { anchor_id: string; window_end: number; a: number; b: number; gap: number }[] = [];
  let pairs = 0;
  for (const ra of a) {
    const rb = byKey.get(key(ra));
    if (!rb) continue;
    pairs++;
    if (ra.methodology_version !== rb.methodology_version || ra.confidence < 40 || rb.confidence < 40) continue;
    gaps.push({ anchor_id: ra.anchor_id, window_end: ra.window_end, a: ra.score, b: rb.score, gap: Math.abs(ra.score - rb.score) });
  }
  const sorted = gaps.map((g) => g.gap).sort((x, y) => x - y);
  const at = (p: number) => (sorted.length ? percentile(sorted, p) : 0);
  return {
    pairs,
    shown_pairs: gaps.length,
    p50: at(50),
    p90: at(90),
    p95: at(95),
    p99: at(99),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    over: Object.fromEntries(candidates.map((c) => [String(c), gaps.length ? sorted.filter((g) => g > c).length / gaps.length : 0])),
    worst: gaps
      .sort((x, y) => y.gap - x.gap)
      .slice(0, 5)
      .map(({ anchor_id, window_end, a: sa, b: sb }) => ({ anchor_id, window_end, a: sa, b: sb })),
  };
}

function shadowPath(): string {
  return path.resolve(process.env.SHADOW_CARDS_PATH ?? path.join(path.dirname(process.env.AGGREGATOR_STATE_PATH ?? 'state.json'), 'shadow-cards.jsonl'));
}

async function record() {
  const file = shadowPath();
  const quorum = await readQuorumConfig().catch(() => null);
  const { cards } = await runScoring({ dryRun: true, quorum });
  const seen = new Set(readShadow(file).slice(-5000).map(key));
  const now = new Date().toISOString();
  const rows = cards
    .map(({ anchorId, card }) => ({
      anchor_id: anchorId,
      window_end: card.window_end,
      score: card.score,
      confidence: card.confidence,
      flags: card.flags,
      methodology_version: card.methodology_version,
      recorded_at: now,
    }))
    .filter((r) => !seen.has(key(r)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  console.log(`[shadow] ${rows.length} new card(s) recorded in ${file} (${cards.length - rows.length} already there)`);
}

function compare(fileA: string, fileB: string, json: boolean) {
  const report = compareShadow(readShadow(fileA), readShadow(fileB));
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`${report.pairs} anchor-windows on both hosts, ${report.shown_pairs} shown by both`);
  console.log(`score gap: p50 ${report.p50}  p90 ${report.p90}  p95 ${report.p95}  p99 ${report.p99}  max ${report.max}`);
  for (const [c, share] of Object.entries(report.over)) console.log(`  over ${c.padStart(2)}: ${(share * 100).toFixed(1)}%`);
  for (const w of report.worst) console.log(`  ${w.anchor_id} @ ${new Date(w.window_end * 1000).toISOString()}: ${w.a} vs ${w.b}`);
}

if (process.argv[1]?.endsWith('shadow.ts')) {
  const [cmd, a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  if (cmd === 'record') await record();
  else if (cmd === 'compare' && a && b) compare(a, b, process.argv.includes('--json'));
  else {
    console.error('usage: npm run shadow -- record | compare <a.jsonl> <b.jsonl> [--json]');
    process.exitCode = 2;
  }
}
