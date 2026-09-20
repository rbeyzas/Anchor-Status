'use client';

import { motion } from 'framer-motion';
import { Lightning, TrendDown, TrendUp, Vault, WarningCircle } from '@phosphor-icons/react';
import { formatStakeXlm } from '@/lib/format';
import { hasRecentSignificantDrop } from '@/lib/analysis';
import { RISK_LABEL } from '@/lib/health';
import { CONFIDENCE_TO_SHOW } from '@/lib/scorecard';
import { hasEnoughData, headlineScore, LISTING_LABEL } from '@/lib/status-labels';
import type { AnchorViewModel } from '@/lib/types';
import { scoreTier } from '@/lib/types';
import { ConfidenceChip, FlagChips, PillarDots } from './ScoreCardParts';
import { ScoreValue } from './ScoreValue';
import { Sparkline } from './Sparkline';
import { SourceBadge } from './SourceBadge';
import { StatusChip } from './StatusChip';

export function AnchorCard({
  anchor,
  onSelect,
}: {
  anchor: AnchorViewModel;
  onSelect: (anchor: AnchorViewModel) => void;
}) {
  const score = headlineScore(anchor);
  const card = anchor.card;
  // Only for per-report scores: a card's history starts where the EMA's
  // ended, and that switch of method is not a drop in the anchor.
  const recentDrop = !card && hasEnoughData(anchor) && hasRecentSignificantDrop(anchor.scoreHistory, score);
  // The oracle's own risk verdict when available; the score tier is only a
  // fallback for contracts deployed before health tracking.
  const riskLabel = anchor.health
    ? RISK_LABEL[anchor.health.riskReason]
    : scoreTier(score) === 'low'
      ? 'Risky anchor'
      : null;
  const badge = riskLabel ?? (recentDrop ? 'Sharp drop in 24h' : null);
  const trend = anchor.health?.trend;
  const enoughData = hasEnoughData(anchor);
  const status = anchor.status;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(anchor)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
      className={`as-panel as-panel--hover as-card h-full min-h-[160px] focus:outline-none ${badge ? 'as-panel--danger' : ''}`}
    >
      {badge && (
        <span className="as-card__risk">
          <StatusChip tone="danger" dot>
            <Lightning size={11} weight="fill" aria-hidden="true" className="-ml-0.5" />
            {badge}
          </StatusChip>
        </span>
      )}

      {/* Top-right, mirroring the risk badge on the left: a card can carry
          both, and neither should push the other out of view. */}
      {anchor.imported && (
        <span className="as-card__tag">
          <StatusChip tone="pulse">Imported</StatusChip>
        </span>
      )}

      <div className="as-card__main">
        <span className="as-card__name">{anchor.name}</span>
        <SourceBadge sourceType={anchor.sourceType} />
        {(status?.listing || status?.policyNote || status?.dormant || status?.aliasOf) && (
          <div className="flex flex-wrap gap-1.5">
            {status?.aliasOf && (
              <StatusChip tone="pulse">Same operator as {status.aliasOf.domain}</StatusChip>
            )}
            {status?.listing && (
              <StatusChip tone={status.listing === 'unsafe' ? 'amber' : 'neutral'}>
                {LISTING_LABEL[status.listing]}
              </StatusChip>
            )}
            {status?.policyNote && <StatusChip tone="neutral">{status.policyNote}</StatusChip>}
            {status?.dormant && !status?.aliasOf && <StatusChip tone="neutral">Checked every 6h</StatusChip>}
          </div>
        )}
        {card && <FlagChips flags={card.flags} limit={2} />}
        {status?.problem && (
          <span className="flex items-center gap-1 text-xs font-medium text-as-danger">
            <WarningCircle size={13} weight="bold" aria-hidden="true" className="flex-shrink-0" />
            <span className="truncate">{status.problem}</span>
          </span>
        )}
        {/* Stake is optional and nothing scores on it; "0 XLM" on every card
            only added noise. Shown when an operator has actually staked. */}
        {anchor.stake > 0 && (
          <span className="as-mono flex items-center gap-1.5 text-sm text-as-ink-muted">
            <Vault size={14} className="text-as-ink-faint" aria-hidden="true" />
            {formatStakeXlm(anchor.stake)} staked
          </span>
        )}
      </div>

      <div className="as-card__side">
        {enoughData ? (
          <>
            <ScoreValue score={score} size={52} />
            <Sparkline history={anchor.scoreHistory} currentScore={score} anchorId={anchor.anchorId} />
            {card && <PillarDots card={card} />}
          </>
        ) : card && !status?.aliasOf ? (
          // Withheld: show how far the card is from having a number to show.
          <span
            className="as-mono flex w-[88px] flex-col items-center gap-1 text-center text-[11px] leading-tight text-as-ink-faint"
            title={`A score is shown from a confidence of ${CONFIDENCE_TO_SHOW}`}
          >
            <span className="as-label">Confidence</span>
            <span className="text-lg text-as-ink-muted">
              {card.confidence}
              <span className="text-xs text-as-ink-faint"> / {CONFIDENCE_TO_SHOW}</span>
            </span>
            <span className="h-1 w-full overflow-hidden rounded-pill bg-as-surface-2" aria-hidden="true">
              <span
                className="block h-full rounded-pill bg-as-signal"
                style={{ width: `${Math.min(100, (card.confidence / CONFIDENCE_TO_SHOW) * 100)}%` }}
              />
            </span>
            <span>needed for a score</span>
          </span>
        ) : (
          <span className="flex h-[52px] w-[88px] flex-col items-center justify-center text-center text-[11px] leading-tight text-as-ink-faint">
            <span className="as-mono text-lg text-as-ink-muted">-</span>
            {status?.aliasOf
              ? `Scored as ${status.aliasOf.domain}`
              : anchor.sourceType === 'RealMainnet'
                ? 'No score card yet'
                : 'Not enough checks yet'}
          </span>
        )}
        {card && enoughData && <ConfidenceChip confidence={card.confidence} />}
        {trend === 'Degrading' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-as-danger">
            <TrendDown size={12} weight="bold" aria-hidden="true" /> Degrading
          </span>
        )}
        {trend === 'Improving' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-as-signal">
            <TrendUp size={12} weight="bold" aria-hidden="true" /> Improving
          </span>
        )}
      </div>
    </motion.button>
  );
}
