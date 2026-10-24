import { describe, expect, it } from 'vitest';
import { formatRelativeTime, xlmToStroops } from './format';

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  it('reads past and future times', () => {
    expect(formatRelativeTime('2026-10-24T11:30:00Z', now)).toBe('30m ago');
    expect(formatRelativeTime('2026-10-22T12:00:00Z', now)).toBe('2d ago');
    expect(formatRelativeTime('2026-10-24T12:00:30Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-10-24T15:00:00Z', now)).toBe('in 3h');
    expect(formatRelativeTime('2026-10-31T12:00:00Z', now)).toBe('in 7d');
  });
});

describe('xlmToStroops', () => {
  it('converts exactly, and refuses what is not an amount', () => {
    expect(xlmToStroops('10')).toBe(100_000_000n);
    expect(xlmToStroops('0.0000001')).toBe(1n);
    expect(xlmToStroops(' 1.5 ')).toBe(15_000_000n);
    expect(xlmToStroops('0')).toBeNull();
    expect(xlmToStroops('1.12345678')).toBeNull();
    expect(xlmToStroops('-1')).toBeNull();
    expect(xlmToStroops('1e3')).toBeNull();
  });
});
