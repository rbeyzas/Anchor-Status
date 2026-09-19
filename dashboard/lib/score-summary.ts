import type { AnchorViewModel, ScoreCardContext } from './types';
import type { MarketNa } from './scorecard';

/** The aggregator's summary of what each published card was computed from.
 * Served beside anchor-status.json on the collector host, fetched
 * server-side for the same reason (plain HTTP). */
const SUMMARY_URL =
  process.env.SCORE_SUMMARY_URL ?? (process.env.ANCHOR_STATUS_URL ?? '').replace(/anchor-status\.json$/, 'score-summary.json');
const FETCH_TIMEOUT_MS = Number(process.env.HISTORY_FETCH_TIMEOUT_MS ?? '5000');

interface SummaryFile {
  generated_at: string;
  anchors: Record<
    string,
    {
      inputs_hash: string;
      monitored_days: number;
      n30: number;
      coverage: number | null;
      market_na?: MarketNa;
      excluded?: { incident: string; probes: number }[];
    }
  >;
}

export async function fetchScoreSummary(): Promise<SummaryFile | null> {
  if (!SUMMARY_URL || !/score-summary\.json$/.test(SUMMARY_URL)) return null;
  try {
    const res = await fetch(SUMMARY_URL, { next: { revalidate: 60 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = (await res.json()) as SummaryFile;
    if (typeof parsed?.anchors !== 'object' || parsed.anchors === null) throw new Error('unrecognized summary format');
    return parsed;
  } catch (err) {
    console.warn(`[dashboard] score summary unavailable (${SUMMARY_URL}):`, (err as Error).message);
    return null;
  }
}

/** Attaches each card's confidence factors, but only when the summary
 * describes the very bundle the on-chain card names: a summary a round
 * ahead of or behind the chain would explain a different number. */
export function mergeCardContext(anchors: AnchorViewModel[], summary: SummaryFile | null): AnchorViewModel[] {
  if (!summary) return anchors;
  return anchors.map((anchor) => {
    const s = summary.anchors[anchor.anchorId];
    if (!anchor.card || !s || s.inputs_hash !== anchor.card.inputsHash) return anchor;
    const context: ScoreCardContext = {
      inputsHash: s.inputs_hash,
      monitoredDays: s.monitored_days,
      checks30d: s.n30,
      coverage: s.coverage,
      ...(s.market_na ? { marketNa: s.market_na } : {}),
      ...(s.excluded?.length ? { excluded: s.excluded } : {}),
    };
    return { ...anchor, cardContext: context };
  });
}
