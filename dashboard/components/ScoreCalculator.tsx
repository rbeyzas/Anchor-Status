'use client';

import { useState } from 'react';
import { GATES, headline, PRIOR, shares, type Pillar } from '@/lib/methodology';

const PILLAR_LABEL: Record<Pillar, string> = {
  availability: 'Availability',
  speed: 'Speed',
  integrity: 'Integrity',
  market: 'Market',
};

const PRESETS = [
  { name: 'Flawless, 30 days', pillars: { availability: 100, speed: 100, integrity: 100, market: 100 }, market: false, confidence: 100, gates: [] as string[] },
  { name: 'Flaky', pillars: { availability: 71, speed: 68, integrity: 83, market: 100 }, market: false, confidence: 100, gates: [] },
  { name: 'New but clean', pillars: { availability: 100, speed: 100, integrity: 100, market: 100 }, market: false, confidence: 61, gates: [] },
  { name: 'Down right now', pillars: { availability: 64, speed: 100, integrity: 100, market: 100 }, market: false, confidence: 100, gates: ['OUTAGE'] },
  { name: 'Depegged issuer', pillars: { availability: 100, speed: 100, integrity: 100, market: 0 }, market: true, confidence: 100, gates: ['DEPEG'] },
];

function Slider({ label, value, onChange, disabled, hint }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${disabled ? 'opacity-40' : ''}`}>
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-as-ink">{label}</span>
        <span className="tabular font-mono text-as-ink-muted">{disabled ? 'n/a' : value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[rgb(var(--as-signal))]"
      />
      {hint && <span className="text-xs text-as-ink-faint">{hint}</span>}
    </label>
  );
}

/** Move a pillar, the confidence or a gate and watch the headline follow,
 * computed exactly as the published cards are. */
export function ScoreCalculator() {
  const [pillars, setPillars] = useState(PRESETS[0].pillars);
  const [marketApplies, setMarketApplies] = useState(false);
  const [confidence, setConfidence] = useState(100);
  const [gates, setGates] = useState<string[]>([]);

  const caps = GATES.filter((g) => gates.includes(g.flag)).map((g) => g.cap);
  const result = headline({ ...pillars, market: marketApplies ? pillars.market : null }, confidence, caps);
  const share = shares(marketApplies);
  const withheld = confidence < 40;
  const cappedBy = caps.length && result.score < result.shrunk ? GATES.find((g) => g.cap === result.score && gates.includes(g.flag)) : undefined;

  return (
    <div className="grid gap-8 rounded-as-md border border-as-hairline bg-as-surface-1 p-6 shadow-as-panel md:grid-cols-[1.2fr_1fr] md:p-8">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setPillars(p.pillars);
                setMarketApplies(p.market);
                setConfidence(p.confidence);
                setGates(p.gates);
              }}
              className="rounded-pill border border-as-hairline px-3 py-1 text-xs font-medium text-as-ink-muted transition-colors hover:border-as-border-control hover:text-as-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
            >
              {p.name}
            </button>
          ))}
        </div>
        {(['availability', 'speed', 'integrity'] as const).map((key) => (
          <Slider
            key={key}
            label={PILLAR_LABEL[key]}
            value={pillars[key]}
            onChange={(v) => setPillars({ ...pillars, [key]: v })}
            hint={`${Math.round(share[key] * 100)}% of the score`}
          />
        ))}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-as-ink-muted">
            <input type="checkbox" checked={marketApplies} onChange={(e) => setMarketApplies(e.target.checked)} />
            It issues its own fiat asset with a liquid market (Market applies)
          </label>
          <Slider
            label="Market"
            value={pillars.market}
            onChange={(v) => setPillars({ ...pillars, market: v })}
            disabled={!marketApplies}
            hint={marketApplies ? `${Math.round(share.market * 100)}% of the score` : 'Not applicable: its 15% is spread over the other three'}
          />
        </div>
        <Slider
          label="Confidence"
          value={confidence}
          onChange={setConfidence}
          hint="How much we measured: days watched, number of checks, and how deep we could test"
        />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-as-ink">Gates</legend>
          {GATES.map((g) => (
            <label key={g.flag} className="flex items-center gap-2 text-sm text-as-ink-muted">
              <input
                type="checkbox"
                checked={gates.includes(g.flag)}
                onChange={(e) => setGates(e.target.checked ? [...gates, g.flag] : gates.filter((x) => x !== g.flag))}
              />
              <span className="font-mono text-xs text-as-ink">{g.flag}</span> caps at {g.cap}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="flex flex-col justify-center gap-5 rounded-as-md bg-as-surface-2/60 p-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-as-ink-faint">Score</span>
          <div className="tabular mt-1 font-heading text-6xl font-bold tracking-tight text-as-ink">
            {withheld ? <span className="text-as-ink-faint">-</span> : result.score}
          </div>
          {withheld && (
            <p className="mt-1 text-sm text-as-ink-muted">
              Withheld: confidence under 40. On-chain it would be {result.score}; the page shows the flags only.
            </p>
          )}
        </div>
        <ol className="flex flex-col gap-2 text-sm text-as-ink-muted">
          <li>
            <span className="font-medium text-as-ink">1. Weighted pillars:</span>{' '}
            <span className="tabular font-mono">{result.raw.toFixed(2)}</span>
          </li>
          <li>
            <span className="font-medium text-as-ink">2. Pulled toward {PRIOR} by confidence {confidence}:</span>{' '}
            <span className="tabular font-mono">
              {confidence}% × {result.raw.toFixed(2)} + {100 - confidence}% × {PRIOR} = {result.shrunk}
            </span>
          </li>
          <li>
            <span className="font-medium text-as-ink">3. Gates:</span>{' '}
            {cappedBy ? (
              <span>
                capped at <span className="tabular font-mono">{result.score}</span> by{' '}
                <span className="font-mono text-xs text-as-ink">{cappedBy.flag}</span>
              </span>
            ) : (
              <span>{caps.length ? 'active, but above the score already' : 'none active'}</span>
            )}
          </li>
        </ol>
      </div>
    </div>
  );
}
