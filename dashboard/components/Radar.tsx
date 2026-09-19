// The hero's ambience: rings, a rotating scan wedge, a signal dot per ring.
// Replaces v1's orbit trails: it says "scanning", not "orbiting". Pure
// decoration — no data — masked to fade at the edges. Use once, on the
// home hero, behind the leaderboard. Absolute inside a `relative` parent
// with `overflow: hidden`.
export function Radar({ size = 900 }: { size?: number }) {
  const rings = [110, 190, 270, 350];
  return (
    <div className="as-radar" aria-hidden="true">
      <svg viewBox="0 0 800 800" width={size} height={size}>
        <line className="as-radar__cross" x1={400} y1={20} x2={400} y2={780} />
        <line className="as-radar__cross" x1={20} y1={400} x2={780} y2={400} />
        {rings.map((r) => (
          <circle key={r} className="as-radar__ring" cx={400} cy={400} r={r} />
        ))}
        <path className="as-radar__wedge" d="M400 400 L780 400 A380 380 0 0 0 729 210 Z" />
        {rings.map((r, i) => (
          <circle key={`d${r}`} className="as-radar__dot" cx={400 + r} cy={400} r={i === 1 ? 4 : 3} />
        ))}
      </svg>
    </div>
  );
}
