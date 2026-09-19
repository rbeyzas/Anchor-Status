import { Broadcast, Globe, Robot } from '@phosphor-icons/react/dist/ssr';
import { sourceLabel } from '@/lib/format';
import type { SourceType } from '@/lib/types';

const STYLES: Record<SourceType, string> = {
  RealMainnet: 'bg-success-soft text-success',
  RealTestnet: 'bg-accent-soft text-accent',
  SimulatedMock: 'bg-neutral-soft text-neutral',
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
      className={`inline-flex w-fit self-start items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium ${STYLES[sourceType]}`}
    >
      <Icon size={13} weight="bold" aria-hidden="true" />
      {sourceLabel(sourceType)}
    </span>
  );
}
