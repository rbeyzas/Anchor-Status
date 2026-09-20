import type { ScoreJourney as Journey } from '@/lib/home';
import { ScoreValue } from '../ScoreValue';

const LABEL = {
  availability: 'Availability',
  speed: 'Speed',
  integrity: 'Integrity',
  market: 'Market',
} as const;
const tone = (v: number) =>
  v >= 80 ? 'bg-as-score-high' : v >= 55 ? 'bg-as-score-medium' : 'bg-as-score-low';

export function ScoreJourney({ journey: j }: { journey: Journey }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
  return (
    <div>
      <span className="as-label mb-3 block">{j.name} · its score card, recomputed</span>
      <ol className="as-flow as-flow--4">
        <li className="as-flow__node as-panel p-4">
          <span className="as-label">1 · Pillars</span>
          <ul className="mt-3 flex flex-col gap-2.5">
            {j.pillars.map((p) => (
              <li key={p.key}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-as-ink">{LABEL[p.key]}</span>
                  <span className="as-mono text-as-ink-muted">
                    {p.value ?? 'n/a'}
                    <span className="text-as-ink-faint"> · {Math.round(p.share * 100)}%</span>
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-pill bg-as-surface-2"
                  aria-hidden="true"
                >
                  {p.value !== null && (
                    <div
                      className={`h-full rounded-pill ${tone(p.value)}`}
                      style={{ width: pct(p.value) }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </li>

        <li className="as-flow__node as-panel flex flex-col justify-between p-4">
          <span className="as-label">2 · Weighted</span>
          <span className="as-mono mt-3 text-4xl font-medium tracking-[-0.03em] text-as-ink">
            {j.raw.toFixed(1)}
          </span>
          <span className="mt-2 text-xs text-as-ink-faint">
            weights in step 1, Market’s share spread over the rest when it does not apply
          </span>
        </li>

        <li className="as-flow__node as-panel flex flex-col justify-between p-4">
          <span className="as-label">3 · Confidence {j.confidence}</span>
          <div className="relative mt-5 h-8" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/2 h-px bg-as-hairline-strong" />
            <div
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-as-ink-faint"
              style={{ left: pct(j.prior) }}
            />
            <div
              className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-as-signal/40"
              style={{
                left: pct(Math.min(j.prior, j.raw)),
                width: `${Math.abs(j.raw - j.prior)}%`,
              }}
            />
            <div
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-as-ink-muted bg-as-surface-1"
              style={{ left: pct(j.raw) }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-as-signal"
              style={{ left: pct(j.shrunk) }}
            />
            <span
              className="as-timestamp absolute -bottom-3 -translate-x-1/2"
              style={{ left: pct(j.prior) }}
            >
              50
            </span>
          </div>
          <span className="as-mono mt-4 text-xs text-as-ink-muted">
            {j.confidence}% × {j.raw.toFixed(1)} + {100 - j.confidence}% × {j.prior} ={' '}
            <span className="text-as-signal">{j.shrunk}</span>
          </span>
        </li>

        <li className="as-flow__node as-panel flex items-center justify-between gap-4 p-4">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="as-label whitespace-nowrap">4 · Gates</span>
            <span className="text-xs text-as-ink-muted">
              {j.caps.length === 0
                ? 'none active'
                : j.caps.map((c) => (
                    <span key={c.flag} className="block">
                      <span className="as-mono text-as-danger">{c.flag}</span> caps at {c.cap}
                    </span>
                  ))}
            </span>
          </div>
          <ScoreValue score={j.score} size={72} />
        </li>
      </ol>
    </div>
  );
}
