'use client';

import { Broadcast, Globe, Robot, Rows } from '@phosphor-icons/react';
import type { SourceType } from '@/lib/types';

export type FilterValue = 'all' | SourceType;

const FILTERS: Array<{ value: FilterValue; label: string; icon: typeof Rows }> = [
  { value: 'all', label: 'All', icon: Rows },
  { value: 'RealMainnet', label: 'Live mainnet', icon: Globe },
  { value: 'RealTestnet', label: 'Live testnet', icon: Broadcast },
  { value: 'SimulatedMock', label: 'Simulated', icon: Robot },
];

export function FilterBar({
  active,
  onChange,
}: {
  active: FilterValue;
  onChange: (value: FilterValue) => void;
}) {
  return (
    <div
      className="glass-panel inline-flex flex-wrap gap-1 rounded-pill p-1"
      role="tablist"
      aria-label="Anchor source filter"
    >
      {FILTERS.map((filter) => {
        const isActive = filter.value === active;
        const Icon = filter.icon;
        return (
          <button
            key={filter.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(filter.value)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ${
              isActive
                ? 'bg-accent text-white shadow-glow-accent dark:text-[#04131f]'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Icon size={14} weight="bold" aria-hidden="true" />
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
