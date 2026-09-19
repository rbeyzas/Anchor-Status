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
import { StatusChip, type ChipTone } from './StatusChip';

const BAND_TONE: Record<ConfidenceBand, ChipTone> = {
  insufficient: 'neutral',
  low: 'amber',
  medium: 'pulse',
  high: 'signal',
};

export function ConfidenceChip({ confidence }: { confidence: number }) {
  const band = confidenceBand(confidence);
  return (
    <StatusChip tone={BAND_TONE[band]} className="normal-case tracking-normal">
      <span title={`Confidence ${confidence}/100`}>{CONFIDENCE_LABEL[band]}</span>
    </StatusChip>
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
        <StatusChip key={flag} tone={GATE_FLAGS.has(flag) ? 'danger' : 'neutral'} className="normal-case tracking-normal">
          {GATE_FLAGS.has(flag) && <WarningCircle size={11} weight="bold" aria-hidden="true" />}
          {FLAG_COPY[flag]}
        </StatusChip>
      ))}
      {limit !== undefined && ordered.length > limit && (
        <StatusChip tone="neutral" className="normal-case tracking-normal">
          +{ordered.length - limit} more
        </StatusChip>
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
              value === null
                ? 'bg-as-surface-2'
                : value >= 80
                  ? 'bg-as-score-high'
                  : value >= 55
                    ? 'bg-as-score-medium'
                    : 'bg-as-score-low'
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
              <span className="font-medium text-as-ink" title={hint}>
                {label}
              </span>
              <span className="as-mono text-as-ink-muted">
                {value === null ? `n/a${marketNa ? `: ${MARKET_NA_REASON[marketNa]}` : ''}` : value}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-pill bg-as-surface-2" aria-hidden="true">
              {value !== null && (
                <div
                  className={`h-full rounded-pill ${
                    value >= 80 ? 'bg-as-score-high' : value >= 55 ? 'bg-as-score-medium' : 'bg-as-score-low'
                  }`}
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
