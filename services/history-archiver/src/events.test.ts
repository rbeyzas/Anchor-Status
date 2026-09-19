import { describe, expect, it } from 'vitest';
import { cursorLedger, eventFilters, ledgerRanges, slashAmountStroops } from './events.js';

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

describe('event paging helpers', () => {
  it('reads the ledger out of a getEvents cursor', () => {
    // Seen from the testnet RPC: an empty page stopping at ledger 3,609,999.
    expect(cursorLedger('0015504831938559999-4294967295')).toBe(3_609_999);
  });

  it('splits a window into ranges without gaps or overlap', () => {
    expect(ledgerRanges(100, 125, 10)).toEqual([
      [100, 110],
      [110, 120],
      [120, 125],
    ]);
  });

  it('reads every deployment in as few filters as the RPC allows', () => {
    const pairs = [
      { oracle: 'O1', registry: 'R1' },
      { oracle: 'O2', registry: 'R2' },
      { oracle: 'O3', registry: 'R3' },
    ];
    const filters = eventFilters(pairs);
    expect(filters.map((f) => f.contractIds)).toEqual([['O1', 'R1', 'O2', 'R2', 'O3'], ['R3']]);
    expect(filters[0].topics).toHaveLength(3);
  });
});
