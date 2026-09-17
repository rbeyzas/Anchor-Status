import { describe, expect, it } from 'vitest';
import { slashAmountStroops } from './events.js';

describe('slashAmountStroops', () => {
  it('reads the named `amount` field the contract actually emits', () => {
    expect(slashAmountStroops({ amount: 12500000n, reason: 'score below threshold' })).toBe('12500000');
  });

  it('still reads the tuple shape', () => {
    expect(slashAmountStroops([12500000n, 'score below threshold'])).toBe('12500000');
  });

  it('returns null for a shape it cannot read, rather than the string "undefined"', () => {
    expect(slashAmountStroops({ reason: 'no amount' })).toBeNull();
    expect(slashAmountStroops(undefined)).toBeNull();
    expect(slashAmountStroops({ amount: 'not-a-number' })).toBeNull();
  });
});
