'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WarningCircle } from '@phosphor-icons/react';
import type { AnchorViewModel, DataSource, SourceType, UnreadableAnchor } from '@/lib/types';
import { hasEnoughData, headlineScore, statusRank } from '@/lib/status-labels';
import { AnchorCard } from './AnchorCard';
import { AnchorDetailModal } from './AnchorDetailModal';
import { FilterBar, type FilterValue } from './FilterBar';
import { StatsBar } from './StatsBar';
import { OrbitTrails } from './backgrounds/orbit-trails';
import { SiteNav } from './SiteNav';

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
      // Reachable first, then failing, then not yet checked; then shown
      // scores highest first, then those without a score yet.
      const statusDiff = statusRank(a) - statusRank(b);
      if (statusDiff !== 0) return statusDiff;
      const shownDiff = Number(hasEnoughData(b)) - Number(hasEnoughData(a));
      return shownDiff !== 0 ? shownDiff : headlineScore(b) - headlineScore(a);
    });
  }, [anchors, filter]);

  return (
    <div>
      {/* Same indigo band as the landing hero. */}
      <div className="relative overflow-hidden rounded-b-[28px] bg-secondary text-white">
        <OrbitTrails tone="dark" className="absolute inset-y-0 left-[45%] right-[-15%] hidden md:block" />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <SiteNav onDark showCta={false} />

          <header className="flex flex-col gap-8 pb-12 pt-8 md:pt-12">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-heading text-4xl font-bold leading-[1.05] tracking-[-0.033em] sm:text-5xl">
                  Live scores
                </h1>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-white/75">
                  Reliability scores from live mainnet, live testnet, and simulated sources.
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold ${
                  dataSource === 'live' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    dataSource === 'live' ? 'bg-success animate-pulse-dot' : 'bg-danger'
                  }`}
                  aria-hidden="true"
                />
                {dataSource === 'live' ? 'Live' : 'Chain unreachable'}
              </span>
            </div>

            {dataSource === 'unavailable' && (
              <p className="flex items-start gap-2.5 rounded-card bg-surface-glass px-4 py-3 text-sm text-danger">
                <WarningCircle size={18} weight="bold" className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>
                  Could not read the contracts from Soroban RPC just now
                  {liveError ? ` (${liveError})` : ''}. Nothing is shown rather than stale or
                  made-up scores. Try again in a minute.
                </span>
              </p>
            )}

            {unreadable.length > 0 && (
              <p className="flex items-start gap-2.5 rounded-card bg-surface-glass px-4 py-3 text-sm text-warning">
                <WarningCircle size={18} weight="bold" className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>
                  {unreadable.length} registered anchor{unreadable.length === 1 ? '' : 's'} could not be read from
                  the chain this time and {unreadable.length === 1 ? 'is' : 'are'} not shown:{' '}
                  <span className="font-mono text-xs">{unreadable.map((u) => u.anchorId).join(', ')}</span>
                </span>
              </p>
            )}

            <StatsBar anchors={anchors} />
          </header>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <FilterBar active={filter} onChange={setFilter} />
        <span className="tabular hidden text-xs text-ink-faint sm:inline">
          {filtered.length} anchors shown
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-card px-6 py-12 text-center text-sm text-ink-muted">
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
  );
}
