'use client';

import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { MARKET_NA_REASON, PILLARS, type MarketNa } from '@/lib/scorecard';
import type { ScoreCardView } from '@/lib/types';

/** The four pillars as a radar/spider chart: a shape, not just a list of
 * bars, so a strong anchor (a filled square) reads at a glance next to a
 * weak one (a pinched diamond). Market plots at 0 when it does not apply;
 * the caption underneath says so, so the shape does not read as a failure. */
export function PillarRadar({ card, marketNa }: { card: ScoreCardView; marketNa?: MarketNa }) {
  const data = PILLARS.map(({ key, label }) => ({
    pillar: label,
    value: card[key] ?? 0,
  }));

  return (
    <div>
      <div className="h-48 w-full sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="rgb(var(--color-border))" />
            <PolarAngleAxis dataKey="pillar" tick={{ fontSize: 11, fill: 'rgb(var(--color-ink-muted))' }} />
            <Radar
              dataKey="value"
              stroke="rgb(var(--color-accent))"
              strokeWidth={2}
              fill="rgb(var(--color-accent))"
              fillOpacity={0.22}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {card.market === null && (
        <p className="text-center text-xs text-ink-faint">
          Market plots at 0: {marketNa ? MARKET_NA_REASON[marketNa] : 'not applicable'}
        </p>
      )}
    </div>
  );
}
