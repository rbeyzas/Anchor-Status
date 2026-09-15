import { ChartLineUp, Coins, Lightning, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { formatStakeXlm } from '@/lib/format';
import { hasRecentSignificantDrop } from '@/lib/analysis';
import type { AnchorViewModel } from '@/lib/types';

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function StatsBar({ anchors }: { anchors: AnchorViewModel[] }) {
  const avgScore = average(anchors.map((a) => a.score));
  const totalStake = anchors.reduce((sum, a) => sum + a.stake, 0);
  const atRisk = anchors.filter((a) => hasRecentSignificantDrop(a.scoreHistory, a.score)).length;

  const stats = [
    { label: 'Anchors tracked', value: String(anchors.length), icon: ShieldCheck, tone: 'text-accent' },
    { label: 'Average score', value: Math.round(avgScore).toString(), icon: ChartLineUp, tone: 'text-success' },
    { label: 'Total stake', value: formatStakeXlm(totalStake), icon: Coins, tone: 'text-warning' },
    { label: 'Active risk alerts', value: String(atRisk), icon: Lightning, tone: atRisk > 0 ? 'text-danger' : 'text-ink-faint' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="glass-panel flex items-center gap-3 rounded-card px-4 py-3.5 shadow-card">
          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted ${stat.tone}`}>
            <stat.icon size={17} weight="bold" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="tabular truncate font-heading text-lg font-semibold text-ink">{stat.value}</span>
            <span className="truncate text-xs text-ink-muted">{stat.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
