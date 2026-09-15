'use client';

import { Area, AreaChart } from 'recharts';
import { scoreTier } from '@/lib/types';
import type { ScorePoint } from '@/lib/types';

const TIER_STROKE: Record<string, string> = {
  high: 'rgb(var(--color-success))',
  medium: 'rgb(var(--color-warning))',
  low: 'rgb(var(--color-danger))',
};

export function Sparkline({
  history,
  currentScore,
  anchorId,
}: {
  history: ScorePoint[];
  currentScore: number;
  anchorId: string;
}) {
  const stroke = TIER_STROKE[scoreTier(currentScore)];
  const data = history.map((p, i) => ({ i, score: p.score }));
  const gradientId = `spark-gradient-${anchorId}`;

  return (
    // A fixed `id` keeps recharts' internal clip-path id stable between the
    // server-rendered and client-hydrated markup (it otherwise falls back to
    // an auto-incrementing counter that differs per render, causing a
    // hydration mismatch warning).
    <AreaChart
      id={`sparkline-${anchorId}`}
      width={92}
      height={32}
      data={data}
      margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area
        type="monotone"
        dataKey="score"
        stroke={stroke}
        strokeWidth={1.75}
        fill={`url(#${gradientId})`}
        dot={false}
        isAnimationActive={false}
      />
    </AreaChart>
  );
}
