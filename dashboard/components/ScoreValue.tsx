import { scoreTier } from '@/lib/types';

const TIER_TEXT_CLASS: Record<string, string> = {
  high: 'text-success',
  medium: 'text-warning',
  low: 'text-danger',
};

const TIER_STROKE_VAR: Record<string, string> = {
  high: 'var(--color-success)',
  medium: 'var(--color-warning)',
  low: 'var(--color-danger)',
};

export function scoreColorClass(score: number): string {
  return TIER_TEXT_CLASS[scoreTier(score)];
}

/** Circular gauge showing 0-100 score as an arc, with the number centered. */
export function ScoreValue({
  score,
  size = 56,
  className = '',
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const tier = scoreTier(score);
  const stroke = TIER_STROKE_VAR[tier];
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--color-border))"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`rgb(${stroke})`}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{ transition: 'stroke-dasharray 500ms ease-out', filter: `drop-shadow(0 0 6px rgb(${stroke} / 0.55))` }}
        />
      </svg>
      <span
        className={`tabular absolute inset-0 flex items-center justify-center font-heading font-semibold ${TIER_TEXT_CLASS[tier]}`}
        style={{ fontSize: size * 0.32 }}
      >
        {Math.round(score)}
      </span>
    </div>
  );
}
