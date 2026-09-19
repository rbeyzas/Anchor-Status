'use client';

import { useEffect, useState } from 'react';

/** The real value in the server HTML (what a crawler, a link preview or a
 * reader without JavaScript sees), then a count-up from 0 once in the
 * browser, unless motion is reduced. */
function useCountUp(to: number, ms = 700): number {
  const [n, setN] = useState(to);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let start: number | null = null;
    const step = (t: number) => {
      start ??= t;
      const p = Math.min(1, (t - start) / ms);
      setN(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setN(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return n;
}

function Stat({ label, value, text, hint }: { label: string; value?: number; text?: string; hint: string }) {
  const n = useCountUp(value ?? 0);
  return (
    <div className="as-panel as-stat">
      <span className="as-label">{label}</span>
      <span className="as-stat__value">{value !== undefined ? Math.round(n).toLocaleString('en-US') : text}</span>
      <span className="text-xs text-as-ink-faint">{hint}</span>
    </div>
  );
}

/** Four readings, each straight from the chain or the collector. */
export function StatStrip({
  anchors,
  reports,
  cards,
  lastPublished,
}: {
  anchors: number;
  reports: number;
  cards: number;
  /** Already relative ("12m ago"): rendered on the server, like the rest. */
  lastPublished: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Mainnet anchors" value={anchors} hint="measured every 20 minutes" />
      <Stat label="Reports on-chain" value={reports} hint="the oracle’s own count" />
      <Stat label="Score cards" value={cards} hint="published on-chain" />
      <Stat label="Last publish" text={lastPublished ?? '-'} hint="to the oracle contract" />
    </div>
  );
}
