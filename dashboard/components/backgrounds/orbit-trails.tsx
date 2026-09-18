// Concentric hairline orbits with slow-moving trails. Purely decorative:
// ink hairlines, one ultramarine trail, rotation driven by CSS so it stays a
// server component (and stops under prefers-reduced-motion).
const ORBITS = [
  { r: 110, seconds: 140, arc: 0.1, dot: 3, accent: false, reverse: false, phase: 20 },
  { r: 190, seconds: 200, arc: 0.14, dot: 4, accent: true, reverse: false, phase: 140 },
  { r: 270, seconds: 260, arc: 0.08, dot: 3, accent: false, reverse: true, phase: 250 },
  { r: 350, seconds: 320, arc: 0.12, dot: 3.5, accent: false, reverse: false, phase: 60 },
];

export function OrbitTrails({
  className = '',
  tone = 'light',
}: {
  className?: string;
  /** `dark` draws white hairlines and a sky-blue trail, for the indigo hero. */
  tone?: 'light' | 'dark';
}) {
  const ring = tone === 'dark' ? 'rgb(255 255 255 / 0.3)' : 'rgb(var(--color-border-strong))';
  const ink = tone === 'dark' ? '#ffffff' : 'rgb(var(--color-ink))';
  const accent = tone === 'dark' ? '#62aef0' : 'rgb(var(--color-accent))';
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{
        maskImage: 'radial-gradient(circle at center, black 25%, transparent 72%)',
        WebkitMaskImage: 'radial-gradient(circle at center, black 25%, transparent 72%)',
      }}
    >
      <svg viewBox="0 0 800 800" className="absolute left-1/2 top-1/2 h-[135%] w-auto -translate-x-1/2 -translate-y-1/2">
        {ORBITS.map((o) => {
          const c = 2 * Math.PI * o.r;
          const color = o.accent ? accent : ink;
          return (
            <g key={o.r}>
              <circle cx="400" cy="400" r={o.r} fill="none" stroke={ring} strokeWidth="1" opacity="0.9" />
              <g
                className="orbit-spin"
                style={{
                  animationDuration: `${o.seconds}s`,
                  animationDirection: o.reverse ? 'reverse' : 'normal',
                  transform: `rotate(${o.phase}deg)`,
                }}
              >
                {/* trail: a short arc ending at the dot */}
                <circle
                  cx="400"
                  cy="400"
                  r={o.r}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray={`${c * o.arc} ${c}`}
                  strokeDashoffset={-(c - c * o.arc)}
                  opacity={o.accent ? 0.6 : 0.35}
                />
                <circle cx={400 + o.r} cy="400" r={o.dot} fill={color} opacity={o.accent ? 0.95 : 0.6} />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
