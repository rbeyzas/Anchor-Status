import { Broadcast, Globe, Robot } from '@phosphor-icons/react/dist/ssr';
import { sourceLabel } from '@/lib/format';
import type { SourceType } from '@/lib/types';

// Source is a role, not a hue: signal = live mainnet, pulse = chain/testnet,
// neutral = simulated. Matches the console design system's StatusChip.
const STYLES: Record<SourceType, string> = {
  RealMainnet: 'bg-as-signal-soft text-as-signal',
  RealTestnet: 'bg-as-pulse-soft text-as-pulse',
  SimulatedMock: 'bg-as-surface-2 text-as-ink-muted',
};

const ICONS: Record<SourceType, typeof Globe> = {
  RealMainnet: Globe,
  RealTestnet: Broadcast,
  SimulatedMock: Robot,
};

export function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  const Icon = ICONS[sourceType];
  return (
    <span
      className={`as-mono inline-flex w-fit self-start items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] ${STYLES[sourceType]}`}
    >
      <Icon size={12} weight="bold" aria-hidden="true" />
      {sourceLabel(sourceType)}
    </span>
  );
}
