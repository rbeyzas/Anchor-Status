'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WarningCircle } from '@phosphor-icons/react';
import type { AnchorViewModel, DataSource, SourceType, UnreadableAnchor } from '@/lib/types';
import { compareAnchors } from '@/lib/status-labels';
import { AnchorCard } from './AnchorCard';
import { AnchorDetailModal } from './AnchorDetailModal';
import { FilterBar, type FilterValue } from './FilterBar';
import { StatsBar } from './StatsBar';
import { SiteNav } from './SiteNav';
import { StatusChip } from './StatusChip';

const SOURCE_ORDER: Record<SourceType, number> = {
  RealMainnet: 0,
  RealTestnet: 1,
  SimulatedMock: 2,
};

export function Dashboard({
  anchors,
  dataSource,
  liveError,
  unreadable,
}: {
  anchors: AnchorViewModel[];
  dataSource: DataSource;
  liveError?: string;
  unreadable: UnreadableAnchor[];
}) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [selected, setSelected] = useState<AnchorViewModel | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const filtered = useMemo(() => {
    const scoped = filter === 'all' ? anchors : anchors.filter((a) => a.sourceType === filter);
    return [...scoped].sort((a, b) => {
      const sourceDiff = SOURCE_ORDER[a.sourceType] - SOURCE_ORDER[b.sourceType];
      if (sourceDiff !== 0) return sourceDiff;
      return compareAnchors(a, b);
    });
  }, [anchors, filter]);

  return (
    <div className="as-grid-ground min-h-screen">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SiteNav showCta={false} />

        <header className="flex flex-col gap-8 pb-12 pt-2 md:pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-heading text-4xl font-bold leading-[1.02] tracking-[-0.025em] text-as-ink sm:text-[44px]">
                Live scores
              </h1>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-as-ink-muted">
                Reliability scores from live mainnet, live testnet, and simulated sources.
              </p>
            </div>
            <StatusChip tone={dataSource === 'live' ? 'signal' : 'danger'} live={dataSource === 'live'} dot>
              {dataSource === 'live' ? 'Live' : 'Chain unreachable'}
            </StatusChip>
          </div>

          {dataSource === 'unavailable' && (
            <p className="as-panel flex items-start gap-2.5 px-4 py-3 text-sm text-as-danger">
              <WarningCircle size={18} weight="bold" className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>
                Could not read the contracts from Soroban RPC just now
                {liveError ? ` (${liveError})` : ''}. Nothing is shown rather than stale or
                made-up scores. Try again in a minute.
              </span>
            </p>
          )}

          {unreadable.length > 0 && (
            <p className="as-panel flex items-start gap-2.5 px-4 py-3 text-sm text-as-amber">
              <WarningCircle size={18} weight="bold" className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>
                {unreadable.length} registered anchor{unreadable.length === 1 ? '' : 's'} could not be read from
                the chain this time and {unreadable.length === 1 ? 'is' : 'are'} not shown:{' '}
                <span className="as-code">{unreadable.map((u) => u.anchorId).join(', ')}</span>
              </span>
            </p>
          )}

          <StatsBar anchors={anchors} />
        </header>

      <div className="pb-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <FilterBar active={filter} onChange={setFilter} />
        <span className="as-mono hidden text-xs text-as-ink-faint sm:inline">
          {filtered.length} anchors shown
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="as-panel px-6 py-12 text-center text-sm text-as-ink-muted">
          No anchors match this filter.
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          initial={prefersReducedMotion ? 'visible' : 'hidden'}
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: prefersReducedMotion ? 0 : 0.05 } } }}
        >
          {filtered.map((anchor) => (
            <motion.div
              className="h-full"
              key={anchor.anchorId}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: 'easeOut' }}
            >
              <AnchorCard anchor={anchor} onSelect={setSelected} />
            </motion.div>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {selected && <AnchorDetailModal anchor={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
      </div>
      </div>
    </div>
  );
}
