// The hero's ambience: rings, a rotating scan wedge, and blips scattered
// across the field that light up as the beam reaches them and fade behind
// it. Replaces v1's orbit trails: it says "scanning", not "orbiting". Pure
// decoration — no data — masked to fade at the edges. Use once, on the home
// hero, behind the leaderboard. Absolute inside a `relative` parent with
// `overflow: hidden`.

/** One turn of the beam; the blips share it through their delays. */
const PERIOD_S = 24;
const CENTER = 400;

/** Scattered, but the same scatter on the server and in the browser: the
 * golden angle spreads the angles, a fixed wobble breaks up the spiral. */
function blips(count: number) {
  const golden = 137.508;
  return Array.from({ length: count }, (_, i) => {
    const wobble = Math.sin(i * 12.9898) * 43758.5453;
    const jitter = wobble - Math.floor(wobble); // 0..1, deterministic
    const angle = (i * golden + jitter * 18) % 360;
    // Between the leaderboard that covers the middle and the mask that fades
    // the rim: outside this band a blip is never actually seen.
    const radius = 135 + ((i * 97) % 100) * 2.0 + jitter * 20;
    const radians = (angle * Math.PI) / 180;
    return {
      cx: CENTER + radius * Math.cos(radians),
      cy: CENTER + radius * Math.sin(radians),
      r: 2.4 + jitter * 2.2,
      // Lit when the beam's leading edge reaches this angle.
      delay: (angle / 360) * PERIOD_S,
    };
  });
}

const BLIPS = blips(48);

export function Radar({ size = 900 }: { size?: number }) {
  const rings = [110, 190, 270, 350];
  return (
    <div className="as-radar" aria-hidden="true">
      <svg viewBox="0 0 800 800" width={size} height={size}>
        <line className="as-radar__cross" x1={CENTER} y1={20} x2={CENTER} y2={780} />
        <line className="as-radar__cross" x1={20} y1={CENTER} x2={780} y2={CENTER} />
        {rings.map((r) => (
          <circle key={r} className="as-radar__ring" cx={CENTER} cy={CENTER} r={r} />
        ))}
        <path className="as-radar__wedge" d="M400 400 L780 400 A380 380 0 0 0 729 210 Z" />
        {BLIPS.map((b, i) => (
          <circle
            key={i}
            className="as-radar__blip"
            cx={b.cx.toFixed(1)}
            cy={b.cy.toFixed(1)}
            r={b.r.toFixed(1)}
            style={{ animationDelay: `${b.delay.toFixed(2)}s` }}
          />
        ))}
      </svg>
    </div>
  );
}
