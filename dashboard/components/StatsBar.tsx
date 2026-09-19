import { ChartLineUp, Coins, Lightning, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { formatStakeXlm } from '@/lib/format';
import { GATE_FLAGS } from '@/lib/scorecard';
import { hasEnoughData, headlineScore } from '@/lib/status-labels';
import type { AnchorViewModel } from '@/lib/types';

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function StatsBar({ anchors }: { anchors: AnchorViewModel[] }) {
  // Only numbers the page actually shows: a withheld score must not move
  // the average either.
  const scored = anchors.filter(hasEnoughData);
  const avgScore = average(scored.map(headlineScore));
  const totalStake = anchors.reduce((sum, a) => sum + a.stake, 0);
  // The oracle's risk verdict, or a gate on the score card.
  const atRisk = anchors.filter(
    (a) => (a.health && a.health.riskReason !== 'None') || a.card?.flags.some((f) => GATE_FLAGS.has(f)),
  ).length;

  const stats = [
    { label: 'Anchors tracked', value: String(anchors.length), icon: ShieldCheck, tone: 'text-as-pulse' },
    {
      label: scored.length ? `Average score (${scored.length} scored)` : 'Average score',
      value: scored.length ? Math.round(avgScore).toString() : '-',
      icon: ChartLineUp,
      tone: 'text-as-signal',
    },
    { label: 'Total stake', value: formatStakeXlm(totalStake), icon: Coins, tone: 'text-as-amber' },
    {
      label: 'Active risk alerts',
      value: String(atRisk),
      icon: Lightning,
      tone: atRisk > 0 ? 'text-as-danger' : 'text-as-ink-faint',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="as-panel flex items-center gap-3 px-4 py-3.5">
          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-as-surface-2 ${stat.tone}`}>
            <stat.icon size={17} weight="bold" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="as-mono truncate text-lg font-medium text-as-ink">{stat.value}</span>
            <span className="as-label truncate">{stat.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
