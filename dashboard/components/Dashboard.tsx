'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Anchor as AnchorIcon, WarningCircle } from '@phosphor-icons/react';
import type { AnchorViewModel, DataSource, SourceType } from '@/lib/types';
import { AnchorCard } from './AnchorCard';
import { AnchorDetailModal } from './AnchorDetailModal';
import { FilterBar, type FilterValue } from './FilterBar';
import { RampPanel } from './RampPanel';
import { StatsBar } from './StatsBar';
import { ThemeToggle } from './ThemeToggle';

const SOURCE_ORDER: Record<SourceType, number> = {
  RealMainnet: 0,
  RealTestnet: 1,
  SimulatedMock: 2,
};

export function Dashboard({
  anchors,
  dataSource,
  liveError,
}: {
  anchors: AnchorViewModel[];
  dataSource: DataSource;
  liveError?: string;
}) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [selected, setSelected] = useState<AnchorViewModel | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const filtered = useMemo(() => {
    const scoped = filter === 'all' ? anchors : anchors.filter((a) => a.sourceType === filter);
    return [...scoped].sort((a, b) => SOURCE_ORDER[a.sourceType] - SOURCE_ORDER[b.sourceType]);
  }, [anchors, filter]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-glow-accent">
              <AnchorIcon size={22} weight="bold" aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <h1 className="font-heading text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                Anchor Reliability Oracle Network
              </h1>
              <p className="text-sm text-ink-muted">
                Reliability scores compiled from live mainnet, live testnet, and simulated sources
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`hidden items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium sm:inline-flex ${
                dataSource === 'live' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  dataSource === 'live' ? 'bg-success animate-pulse-dot' : 'bg-warning animate-pulse-dot'
                }`}
                aria-hidden="true"
              />
              {dataSource === 'live' ? 'Testnet live' : 'Demo data'}
            </span>
            <ThemeToggle />
          </div>
        </div>

        {dataSource === 'mock' && (
          <p className="glass-panel flex items-start gap-2.5 rounded-card px-4 py-3 text-sm text-warning">
            <WarningCircle size={18} weight="bold" className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>
              Showing demo data — could not connect to the testnet contracts
              {liveError ? ` (${liveError})` : ''}. For live data, check the contract
              IDs and RPC access in the root <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs">.env</code> file.
            </span>
          </p>
        )}

        <StatsBar anchors={anchors} />
      </header>

      <RampPanel anchors={anchors} />

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
  );
}
