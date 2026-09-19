import { describe, expect, it } from 'vitest';
import { headline, interp, MARKET_CURVE, shares, SPEED_CURVE, UPTIME_CURVE } from './methodology';

// The worked examples of docs/SCORING.md section 10: the page's calculator
// must land on the same numbers as the published cards.
describe('headline, against the worked examples', () => {
  it('1: flawless → 100', () => {
    expect(headline({ availability: 100, speed: 100, integrity: 100, market: null }, 100).score).toBe(100);
  });
  it('2: flaky → 73', () => {
    const h = headline({ availability: 71, speed: 68, integrity: 83, market: null }, 100);
    expect(h.raw).toBeCloseTo(73.12, 2);
    expect(h.score).toBe(73);
  });
  it('3: down → 50 by the OUTAGE cap', () => {
    expect(headline({ availability: 64, speed: 100, integrity: 100, market: null }, 100, [50]).score).toBe(50);
  });
  it('4: new but clean → 81', () => {
    expect(headline({ availability: 100, speed: 100, integrity: 100, market: null }, 61).score).toBe(81);
  });
  it('5: partly testable → 85', () => {
    expect(headline({ availability: 100, speed: 100, integrity: 100, market: null }, 70).score).toBe(85);
  });
  it('6: depegged → 50', () => {
    const h = headline({ availability: 100, speed: 100, integrity: 100, market: 0 }, 100, [50]);
    expect(h.raw).toBe(85);
    expect(h.score).toBe(50);
  });
});

describe('curves', () => {
  it('match the derivations in the spec', () => {
    expect(interp(UPTIME_CURVE, 92)).toBe(45);
    expect(interp(UPTIME_CURVE, 98)).toBe(82.5);
    expect(interp(SPEED_CURVE, 3.0)).toBeCloseTo(68.24, 2);
    expect(interp(MARKET_CURVE, 350)).toBe(18.75);
  });
});

describe('shares', () => {
  it('spreads Market\'s weight over the others when it does not apply', () => {
    expect(shares(true)).toEqual({ availability: 0.45, speed: 0.2, integrity: 0.2, market: 0.15 });
    const s = shares(false);
    expect(s.availability).toBeCloseTo(450 / 850);
    expect(s.market).toBe(0);
  });
});
