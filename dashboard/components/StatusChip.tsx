import type { ReactNode } from 'react';

export type ChipTone = 'signal' | 'pulse' | 'amber' | 'danger' | 'neutral';

export function StatusChip({
  tone = 'neutral',
  dot = false,
  live = false,
  className = '',
  children,
}: {
  tone?: ChipTone;
  /** Shows a static dot before the label. */
  dot?: boolean;
  /** Shows the heartbeat dot and the signal glow: only for something live
   * right now. One per panel. */
  live?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={`as-chip as-chip--${tone} ${live ? 'as-chip--live' : ''} ${className}`}>
      {dot || live ? <span className={`as-dot ${live ? 'as-dot--beat' : ''}`} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
