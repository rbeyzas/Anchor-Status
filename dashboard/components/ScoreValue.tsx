'use client';

import { useEffect, useRef, useState } from 'react';
import { scoreTier } from '@/lib/types';

const TIER_TEXT_CLASS: Record<string, string> = {
  high: 'text-as-score-high',
  medium: 'text-as-score-medium',
  low: 'text-as-score-low',
};

const TIER_STROKE_VAR: Record<string, string> = {
  high: 'var(--as-score-high)',
  medium: 'var(--as-score-medium)',
  low: 'var(--as-score-low)',
};

export function scoreColorClass(score: number): string {
  return TIER_TEXT_CLASS[scoreTier(score)];
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Counts from 0 to `to` over `ms`, once, ease-out — "reveal" motion
 * (design-system v2): a reading arriving, not a decoration. */
function useCountUp(to: number, ms: number): number {
  const [n, setN] = useState(() => (reducedMotion() ? to : 0));
  const first = useRef(true);
  useEffect(() => {
    if (reducedMotion()) {
      setN(to);
      return;
    }
    // A later re-score (not the first mount) jumps straight to the new
    // value; only the initial reveal counts up.
    if (!first.current) {
      setN(to);
      return;
    }
    first.current = false;
    let raf: number;
    let start: number | null = null;
    function step(t: number) {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(to * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return n;
}

/** Circular gauge showing 0-100 score as an arc, with the number centered.
 * The arc draws and the numeral counts up once, on mount (duration-reveal). */
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
  const strokeWidth = 4;
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const [mounted, setMounted] = useState(reducedMotion());
  const n = useCountUp(clamped, 700);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(id);
  }, []);

  const shown = mounted ? clamped : 0;
  const dash = (shown / 100) * circumference;

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${Math.round(clamped)}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(var(--as-hairline-strong))" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`rgb(${stroke})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.2, 0, 0, 1)' }}
        />
      </svg>
      <span
        className={`as-mono absolute inset-0 flex items-center justify-center font-medium tabular-nums tracking-[-0.02em] ${TIER_TEXT_CLASS[tier]}`}
        style={{ fontSize: size * 0.32 }}
      >
        {Math.round(n)}
      </span>
    </div>
  );
}
