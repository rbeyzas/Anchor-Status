import { rpc, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { cursorLedger, eventFilters, groupByAnchor, ledgerRanges, slashAmountStroops } from './events.js';

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
    expect(filters[0].topics).toHaveLength(4);
  });
});

describe('groupByAnchor score cards', () => {
  // The shape ScoreCardPublishedEvent has on the ledger: topics
  // [name, anchor_id], the remaining fields as a symbol-keyed map.
  const cardEvent = (fields: [string, xdr.ScVal][]) =>
    ({
      id: '1',
      ledger: 1,
      ledgerClosedAt: '2026-10-18T10:00:00Z',
      topic: [xdr.ScVal.scvSymbol('score_card_published'), xdr.ScVal.scvSymbol('anchor_x')],
      value: xdr.ScVal.scvMap(fields.map(([key, val]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val }))),
    }) as unknown as rpc.Api.EventResponse;
  const hash = Buffer.alloc(32, 0xab);

  it('reads a published card, inputs hash included', () => {
    const byAnchor = groupByAnchor([
      cardEvent([
        ['confidence', xdr.ScVal.scvU32(64)],
        ['flags', xdr.ScVal.scvU32(2)],
        ['inputs_hash', xdr.ScVal.scvBytes(hash)],
        ['methodology_version', xdr.ScVal.scvU32(1)],
        ['score', xdr.ScVal.scvU32(81)],
      ]),
    ]);
    expect(byAnchor.get('anchor_x')?.scoreCards).toEqual([
      { timestamp: '2026-10-18T10:00:00Z', score: 81, confidence: 64, flags: 2, methodologyVersion: 1, inputsHash: 'ab'.repeat(32) },
    ]);
  });

  it('skips a card without an inputs hash rather than archiving it', () => {
    const byAnchor = groupByAnchor([cardEvent([['score', xdr.ScVal.scvU32(81)]])]);
    expect(byAnchor.get('anchor_x')?.scoreCards ?? []).toEqual([]);
  });
});
