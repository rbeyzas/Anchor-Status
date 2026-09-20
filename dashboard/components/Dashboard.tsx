'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react';
import type { AnchorViewModel, DataSource, SourceType, UnreadableAnchor } from '@/lib/types';
import { matchesQuery } from '@/lib/search';
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
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AnchorViewModel | null>(null);
  const prefersReducedMotion = useReducedMotion();

  // /scores?anchor=<id> (the apply pages link here) opens that anchor's details.
  // Read on the client so the page stays statically cached.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('anchor');
    const target = id ? anchors.find((a) => a.anchorId === id) : undefined;
    if (target) setSelected(target);
  }, [anchors]);

  const filtered = useMemo(() => {
    const scoped = anchors.filter((a) => (filter === 'all' || a.sourceType === filter) && matchesQuery(a, query));
    return [...scoped].sort((a, b) => {
      const sourceDiff = SOURCE_ORDER[a.sourceType] - SOURCE_ORDER[b.sourceType];
      if (sourceDiff !== 0) return sourceDiff;
      return compareAnchors(a, b);
    });
  }, [anchors, filter, query]);

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
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterBar active={filter} onChange={setFilter} />
        <div className="flex items-center gap-4">
          <div className="relative w-full lg:w-72">
            <MagnifyingGlass
              size={16}
              weight="bold"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-as-ink-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder="Search by name or domain"
              aria-label="Search anchors by name or domain"
              spellCheck={false}
              autoComplete="off"
              className="h-10 w-full rounded-pill border border-as-border-control bg-as-surface-2 pl-9 pr-9 text-sm text-as-ink placeholder:text-as-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-as-ink-muted hover:bg-as-surface-1 hover:text-as-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
              >
                <X size={12} weight="bold" aria-hidden="true" />
              </button>
            )}
          </div>
          <span className="as-mono hidden flex-shrink-0 text-xs text-as-ink-faint sm:inline" aria-live="polite">
            {filtered.length} anchor{filtered.length === 1 ? '' : 's'} shown
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="as-panel px-6 py-12 text-center text-sm text-as-ink-muted">
          {query.trim() ? (
            <>
              No anchor matches “{query.trim()}”
              {filter !== 'all' ? ' in this filter' : ''}.{' '}
              <button type="button" onClick={() => setQuery('')} className="font-medium text-as-signal hover:underline">
                Clear the search
              </button>
            </>
          ) : (
            'No anchors match this filter.'
          )}
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
