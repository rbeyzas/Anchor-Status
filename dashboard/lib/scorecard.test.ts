import { describe, expect, it } from 'vitest';
import { Address, xdr } from '@stellar/stellar-sdk';
import { decodeCard } from './contract-state';
import { confidenceBand, FLAG_COPY, flagsFromMask, isWithheld } from './scorecard';
import { mergeCardContext } from './score-summary';
import type { AnchorViewModel } from './types';

describe('flagsFromMask', () => {
  it('reads the on-chain bitmask in bit order', () => {
    expect(flagsFromMask(0)).toEqual([]);
    expect(flagsFromMask(0b1000_0001)).toEqual(['OUTAGE', 'NO_MARKET']);
    expect(flagsFromMask(1 << 6)).toEqual(['LOW_COVERAGE']);
  });

  it('has copy for every flag, without em dashes', () => {
    for (const text of Object.values(FLAG_COPY)) expect(text).not.toMatch(/—/);
  });
});

describe('confidence bands', () => {
  it('withholds the number below 40', () => {
    expect([39, 40, 69, 70, 89, 90].map(confidenceBand)).toEqual(['insufficient', 'low', 'low', 'medium', 'medium', 'high']);
    expect(isWithheld({ confidence: 39 })).toBe(true);
    expect(isWithheld({ confidence: 40 })).toBe(false);
  });
});

describe('decodeCard', () => {
  it('decodes a stored ScoreCard, with market n/a', () => {
    const field = (key: string, val: xdr.ScVal) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });
    const u32 = (n: number) => xdr.ScVal.scvU32(n);
    const u64 = (n: number) => xdr.ScVal.scvU64(BigInt(n) as never);
    const val = xdr.ScVal.scvMap([
      field('availability', u32(100)),
      field('confidence', u32(61)),
      field('flags', u32(0b100_0000)),
      field('inputs_hash', xdr.ScVal.scvBytes(new Uint8Array(32).fill(0xab))),
      field('integrity', u32(92)),
      field('market', xdr.ScVal.scvVoid()),
      field('methodology_version', u32(1)),
      field('published_at', u64(1_789_812_000)),
      field('score', u32(81)),
      field('speed', u32(97)),
      field('window_end', u64(1_789_808_400)),
    ]);
    const entry = xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: xdr.ExtensionPoint.fromXdrObject({ v: 0 } as never),
        contract: new Address('CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU').toScAddress(),
        key: xdr.ScVal.scvVoid(),
        durability: xdr.ContractDataDurability.persistent,
        val,
      }),
    );
    expect(decodeCard(entry)).toEqual({
      score: 81,
      availability: 100,
      speed: 97,
      integrity: 92,
      market: null,
      confidence: 61,
      flags: ['LOW_COVERAGE'],
      windowEnd: '2026-09-19T09:00:00.000Z',
      methodologyVersion: 1,
      inputsHash: 'ab'.repeat(32),
      publishedAt: '2026-09-19T10:00:00.000Z',
    });
  });
});

describe('mergeCardContext', () => {
  const card = { inputsHash: 'aa'.repeat(32) } as AnchorViewModel['card'];
  const anchor = { anchorId: 'a', card } as AnchorViewModel;
  const summary = (hash: string) => ({
    generated_at: '',
    anchors: { a: { inputs_hash: hash, monitored_days: 3.2, n30: 216, coverage: 0.4, market_na: 'not_issuer' as const } },
  });

  it('attaches the factors of the bundle the on-chain card names', () => {
    expect(mergeCardContext([anchor], summary('aa'.repeat(32)))[0].cardContext).toEqual({
      inputsHash: 'aa'.repeat(32),
      monitoredDays: 3.2,
      checks30d: 216,
      coverage: 0.4,
      marketNa: 'not_issuer',
    });
  });

  it('ignores a summary about a different bundle', () => {
    expect(mergeCardContext([anchor], summary('bb'.repeat(32)))[0].cardContext).toBeUndefined();
  });
});
