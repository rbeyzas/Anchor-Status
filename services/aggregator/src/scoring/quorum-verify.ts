// Rebuilding a quorum card off-chain, the way PerformanceOracle builds it
// (contracts/performance-oracle/src/quorum.rs): the field-wise lower median
// of the reporters' cards, majority flags, the market pillar only when most
// reporters measured it, and FLAG_REPORTER_DISAGREEMENT when their scores
// are further apart than max_spread.
import type { ScoreCard } from './types.js';

/** Bit 16 of a card's flags: set by the contract, not by the scorer. */
export const FLAG_REPORTER_DISAGREEMENT = 1 << 16;

/** The on-chain QuorumInfo: who agreed on the current card, with what. */
export interface QuorumInfo {
  window_end: number;
  reporters: string[];
  scores: number[];
  inputs_hashes: string[];
  spread: number;
  outliers: string[];
}

/** The middle value, or the lower of the two middle ones. */
export function lowerMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Each bit set when more than half the masks have it. */
export function majorityFlags(masks: number[]): number {
  let out = 0;
  for (let bit = 0; bit < 32; bit++) {
    const set = masks.filter((m) => (m >>> bit) & 1).length;
    if (set * 2 > masks.length) out |= 1 << bit;
  }
  return out >>> 0;
}

/** The final card the contract makes of these reporters' cards. */
export function combineCards(cards: ScoreCard[], maxSpread: number): { card: ScoreCard; spread: number; median: number } {
  const col = (f: (c: ScoreCard) => number) => cards.map(f);
  const scores = col((c) => c.score);
  const median = lowerMedian(scores);
  const spread = Math.max(...scores) - Math.min(...scores);
  const markets = cards.map((c) => c.market).filter((m): m is number => m !== null);
  let flags = majorityFlags(col((c) => c.flags));
  if (spread > maxSpread) flags = (flags | FLAG_REPORTER_DISAGREEMENT) >>> 0;
  return {
    card: {
      score: median,
      availability: lowerMedian(col((c) => c.availability)),
      speed: lowerMedian(col((c) => c.speed)),
      integrity: lowerMedian(col((c) => c.integrity)),
      market: markets.length * 2 > cards.length ? lowerMedian(markets) : null,
      confidence: lowerMedian(col((c) => c.confidence)),
      flags,
      window_end: cards[0].window_end,
      methodology_version: cards[0].methodology_version,
    },
    spread,
    median,
  };
}

/**
 * Checks a quorum card against the reporters' own cards, each recomputed
 * from its bundle (in the order of `info.reporters`). Returns what differs;
 * empty when everything matches.
 */
export function checkQuorum(
  info: QuorumInfo,
  recomputed: ScoreCard[],
  chain: ScoreCard & { inputs_hash: string },
  maxSpread: number,
): string[] {
  const problems: string[] = [];
  recomputed.forEach((c, i) => {
    if (c.score !== info.scores[i]) problems.push(`reporter ${info.reporters[i]}: submitted ${info.scores[i]}, its bundle gives ${c.score}`);
    if (c.window_end !== info.window_end) problems.push(`reporter ${info.reporters[i]}: bundle window ${c.window_end}, round ${info.window_end}`);
  });
  const { card, spread, median } = combineCards(recomputed, maxSpread);
  const fields = ['score', 'availability', 'speed', 'integrity', 'market', 'confidence', 'flags', 'window_end', 'methodology_version'] as const;
  for (const f of fields) {
    if (chain[f] !== card[f]) problems.push(`${f}: chain ${chain[f]}, rebuilt from the bundles ${card[f]}`);
  }
  if (spread !== info.spread) problems.push(`spread: chain ${info.spread}, rebuilt ${spread}`);
  const fromMedian = info.inputs_hashes[recomputed.findIndex((c) => c.score === median)];
  if (chain.inputs_hash !== fromMedian) problems.push(`inputs_hash: chain ${chain.inputs_hash}, the median reporter's bundle ${fromMedian}`);
  return problems;
}

/**
 * Each reporter's evidence URL, from the [[MONA_REPORTERS]] tables of
 * MonaRank's stellar.toml: reporter address -> URL ending in "/".
 */
export function evidenceUrlsFromToml(toml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of toml.split(/^\[\[MONA_REPORTERS\]\]\s*$/m).slice(1)) {
    const body = block.split(/^\[/m)[0];
    const url = /^evidence\s*=\s*"([^"]+)"/m.exec(body)?.[1];
    if (!url) continue;
    for (const m of body.matchAll(/^(?:mainnet|testnet)\s*=\s*"(G[A-Z2-7]{55})"/gm)) out.set(m[1], url.endsWith('/') ? url : `${url}/`);
  }
  return out;
}
