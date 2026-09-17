'use client';

import { motion } from 'framer-motion';
import { Lightning, Vault } from '@phosphor-icons/react';
import { formatStakeXlm } from '@/lib/format';
import { hasRecentSignificantDrop } from '@/lib/analysis';
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
  const isRisky = scoreTier(anchor.score) === 'low';

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(anchor)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`glass-panel relative flex w-full cursor-pointer items-center justify-between gap-4 rounded-card p-4 text-left shadow-card transition-shadow duration-300 hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-5 ${RING_SHADOW[anchor.sourceType]}`}
    >
      {(recentDrop || isRisky) && (
        <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-pill bg-danger-soft px-2.5 py-1 text-[11px] font-semibold text-danger shadow-glow-danger">
          <Lightning size={11} weight="fill" aria-hidden="true" />
          {recentDrop ? 'Recent slashing' : 'Risky anchor'}
        </span>
      )}

      <div className="flex min-w-0 flex-col gap-2">
        <span className="truncate font-heading text-base font-semibold text-ink">{anchor.name}</span>
        <SourceBadge sourceType={anchor.sourceType} />
        <span className="tabular flex items-center gap-1.5 text-sm text-ink-muted">
          <Vault size={14} className="text-ink-faint" aria-hidden="true" />
          {formatStakeXlm(anchor.stake)}
        </span>
      </div>

      <div className="flex flex-shrink-0 flex-col items-center gap-2">
        <ScoreValue score={anchor.score} size={52} />
        <Sparkline history={anchor.scoreHistory} currentScore={anchor.score} anchorId={anchor.anchorId} />
      </div>
    </motion.button>
  );
}
