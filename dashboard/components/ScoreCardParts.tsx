import { WarningCircle } from '@phosphor-icons/react';
import {
  CONFIDENCE_LABEL,
  confidenceBand,
  FLAG_COPY,
  GATE_FLAGS,
  MARKET_NA_REASON,
  PILLARS,
  type ConfidenceBand,
  type FlagName,
  type MarketNa,
} from '@/lib/scorecard';
import type { ScoreCardView } from '@/lib/types';

const BAND_STYLE: Record<ConfidenceBand, string> = {
  insufficient: 'bg-surface-muted text-ink-faint',
  low: 'bg-warning-soft text-warning',
  medium: 'bg-accent-soft text-accent',
  high: 'bg-success-soft text-success',
};

export function ConfidenceChip({ confidence }: { confidence: number }) {
  const band = confidenceBand(confidence);
  return (
    <span className={`tabular rounded-pill px-2 py-0.5 text-[11px] font-medium ${BAND_STYLE[band]}`} title={`Confidence ${confidence}/100`}>
      {CONFIDENCE_LABEL[band]}
    </span>
  );
}

/** Gate flags first (they cap the score), then information flags. */
export function FlagChips({ flags, limit }: { flags: FlagName[]; limit?: number }) {
  const ordered = [...flags].sort((a, b) => Number(GATE_FLAGS.has(b)) - Number(GATE_FLAGS.has(a)));
  const shown = limit === undefined ? ordered : ordered.slice(0, limit);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((flag) => (
        <span
          key={flag}
          className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium ${
            GATE_FLAGS.has(flag) ? 'bg-danger-soft text-danger' : 'bg-surface-muted text-ink-muted'
          }`}
        >
          {GATE_FLAGS.has(flag) && <WarningCircle size={11} weight="bold" aria-hidden="true" />}
          {FLAG_COPY[flag]}
        </span>
      ))}
      {limit !== undefined && ordered.length > limit && (
        <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-faint">
          +{ordered.length - limit} more
        </span>
      )}
    </div>
  );
}

/** The four pillars as a compact row of dots, for the card grid where a
 * full radar or bar list would not fit. Same tier colors as the bars, so
 * the two views never disagree. */
export function PillarDots({ card }: { card: ScoreCardView }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {PILLARS.map(({ key, label }) => {
        const value = card[key];
        return (
          <span
            key={key}
            title={value === null ? `${label}: n/a` : `${label}: ${value}`}
            className={`h-1.5 w-1.5 rounded-full ${
              value === null ? 'bg-surface-muted' : value >= 80 ? 'bg-success' : value >= 55 ? 'bg-warning' : 'bg-danger'
            }`}
          />
        );
      })}
    </div>
  );
}

export function PillarBars({ card, marketNa }: { card: ScoreCardView; marketNa?: MarketNa }) {
  return (
    <ul className="flex flex-col gap-3">
      {PILLARS.map(({ key, label, hint }) => {
        const value = card[key];
        return (
          <li key={key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-ink" title={hint}>
                {label}
              </span>
              <span className="tabular text-ink-muted">
                {value === null ? `n/a${marketNa ? `: ${MARKET_NA_REASON[marketNa]}` : ''}` : value}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-muted" aria-hidden="true">
              {value !== null && (
                <div
                  className={`h-full rounded-pill ${value >= 80 ? 'bg-success' : value >= 55 ? 'bg-warning' : 'bg-danger'}`}
                  style={{ width: `${value}%` }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
