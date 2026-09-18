'use client';

import { motion } from 'framer-motion';
import { Lightning, TrendDown, TrendUp, Vault, WarningCircle } from '@phosphor-icons/react';
import { formatStakeXlm } from '@/lib/format';
import { hasRecentSignificantDrop } from '@/lib/analysis';
import { RISK_LABEL } from '@/lib/health';
import { hasEnoughData, LISTING_LABEL } from '@/lib/status-labels';
import type { AnchorViewModel } from '@/lib/types';
import { scoreTier } from '@/lib/types';
import { ScoreValue } from './ScoreValue';
import { Sparkline } from './Sparkline';
import { SourceBadge } from './SourceBadge';

const RING_SHADOW: Record<string, string> = {
  RealMainnet: 'hover:shadow-glow-success',
  RealTestnet: 'hover:shadow-glow-accent',
  SimulatedMock: 'hover:shadow-card',
};

export function AnchorCard({
  anchor,
  onSelect,
}: {
  anchor: AnchorViewModel;
  onSelect: (anchor: AnchorViewModel) => void;
}) {
  const recentDrop = hasRecentSignificantDrop(anchor.scoreHistory, anchor.score);
  // The oracle's own risk verdict when available; the score tier is only a
  // fallback for contracts deployed before health tracking.
  const riskLabel = anchor.health
    ? RISK_LABEL[anchor.health.riskReason]
    : scoreTier(anchor.score) === 'low'
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
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`glass-panel relative flex w-full cursor-pointer items-center justify-between gap-4 rounded-card p-4 text-left shadow-card transition-shadow duration-300 hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-5 ${RING_SHADOW[anchor.sourceType]}`}
    >
      {badge && (
        <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-pill bg-danger-soft px-2.5 py-1 text-[11px] font-semibold text-danger shadow-glow-danger">
          <Lightning size={11} weight="fill" aria-hidden="true" />
          {badge}
        </span>
      )}

      <div className="flex min-w-0 flex-col gap-2">
        <span className="truncate font-heading text-base font-semibold text-ink">{anchor.name}</span>
        <SourceBadge sourceType={anchor.sourceType} />
        {(status?.listing || status?.policyNote || status?.dormant) && (
          <div className="flex flex-wrap gap-1.5">
            {status?.listing && (
              <span
                className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                  status.listing === 'unsafe' ? 'bg-warning-soft text-warning' : 'bg-surface-muted text-ink-muted'
                }`}
              >
                {LISTING_LABEL[status.listing]}
              </span>
            )}
            {status?.policyNote && (
              <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                {status.policyNote}
              </span>
            )}
            {status?.dormant && (
              <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-faint">
                Checked every 6h
              </span>
            )}
          </div>
        )}
        {status?.problem && (
          <span className="flex items-center gap-1 text-xs font-medium text-danger">
            <WarningCircle size={13} weight="bold" aria-hidden="true" className="flex-shrink-0" />
            <span className="truncate">{status.problem}</span>
          </span>
        )}
        {/* Stake is optional and nothing scores on it; "0 XLM" on every card
            only added noise. Shown when an operator has actually staked. */}
        {anchor.stake > 0 && (
          <span className="tabular flex items-center gap-1.5 text-sm text-ink-muted">
            <Vault size={14} className="text-ink-faint" aria-hidden="true" />
            {formatStakeXlm(anchor.stake)} staked
          </span>
        )}
      </div>

      <div className="flex flex-shrink-0 flex-col items-center gap-2">
        {enoughData ? (
          <>
            <ScoreValue score={anchor.score} size={52} />
            <Sparkline history={anchor.scoreHistory} currentScore={anchor.score} anchorId={anchor.anchorId} />
          </>
        ) : (
          <span className="flex h-[52px] w-[88px] flex-col items-center justify-center text-center text-[11px] leading-tight text-ink-faint">
            <span className="font-heading text-lg text-ink-muted">-</span>
            Not enough checks yet
          </span>
        )}
        {trend === 'Degrading' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-danger">
            <TrendDown size={12} weight="bold" aria-hidden="true" /> Degrading
          </span>
        )}
        {trend === 'Improving' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
            <TrendUp size={12} weight="bold" aria-hidden="true" /> Improving
          </span>
        )}
      </div>
    </motion.button>
  );
}
