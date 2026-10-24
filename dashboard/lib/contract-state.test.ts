import { describe, expect, it } from 'vitest';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import {
  anchorAtKey,
  anchorInfoKey,
  decodeAnchorAt,
  decodeAnchorInfo,
  decodeDispute,
  decodeHealth,
  decodeLifecycle,
  decodeQuorum,
  decodeRound,
  healthKey,
  keyId,
  readQuorumThreshold,
  readRegistryIndex,
  roundKey,
} from './contract-state';
import { cursorLedger, ledgerRanges } from './soroban';

const REGISTRY = 'CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB';
const ORACLE = 'CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU';
const OPERATOR = 'GARNK5UJIU6ZUQ6P3VB6BAE4OZHB44IJ6J7ZQLCW3J5ITIULYY7R3OD3';

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const variant = (name: string) => xdr.ScVal.scvVec([sym(name)]);
const u32 = (n: number) => xdr.ScVal.scvU32(n);
const u64 = (n: number) => nativeToScVal(BigInt(n), { type: 'u64' });
// A #[contracttype] struct is a map with its fields sorted by name.
const struct = (fields: Record<string, xdr.ScVal>) =>
  xdr.ScVal.scvMap(
    Object.keys(fields)
      .sort()
      .map((k) => new xdr.ScMapEntry({ key: sym(k), val: fields[k] })),
  );
const dataEntry = (contractId: string, key: xdr.ScVal, val: xdr.ScVal) =>
  xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: xdr.ExtensionPoint.fromXdrObject({ v: 0 } as never),
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
      val,
    }),
  );

describe('ledger keys', () => {
  it('builds the registry and oracle keys the way the contracts store them', () => {
    // The keys the testnet RPC returned for these entries.
    expect(keyId(anchorInfoKey(REGISTRY, 'moneygram'))).toBe(
      'AAAABgAAAAFgZtEX7kcHE9UIzzLuUrSE1mFb+SXRBxScAEH9q8uKQgAAABAAAAABAAAAAgAAAA8AAAAGQW5jaG9yAAAAAAAPAAAACW1vbmV5Z3JhbQAAAAAAAAE=',
    );
    expect(keyId(healthKey(ORACLE, 'moneygram'))).toBe(
      'AAAABgAAAAFGMLu4pthIjT9ZQdii5XRt06NtUxXvzN2b3dhP3GdNSwAAABAAAAABAAAAAgAAAA8AAAAGSGVhbHRoAAAAAAAPAAAACW1vbmV5Z3JhbQAAAAAAAAE=',
    );
  });
});

describe('decodeAnchorInfo', () => {
  it('reads an AnchorInfo record', () => {
    const entry = dataEntry(
      REGISTRY,
      sym('ignored'),
      struct({
        name: xdr.ScVal.scvString('MoneyGram'),
        domain: xdr.ScVal.scvString('stellar.moneygram.com'),
        source_type: variant('RealMainnet'),
        operator: new Address(OPERATOR).toScVal(),
        stake: nativeToScVal(0n, { type: 'i128' }),
        score: u32(98),
        registered_at: u64(1789733637),
        last_updated: u64(1789808487),
      }),
    );
    expect(decodeAnchorInfo(entry)).toEqual({
      name: 'MoneyGram',
      domain: 'stellar.moneygram.com',
      sourceType: 'RealMainnet',
      stake: 0n,
      score: 98,
      lastUpdated: 1789808487n,
    });
  });
});

describe('decodeHealth', () => {
  const health = (outcomes: number, count: number) =>
    dataEntry(
      ORACLE,
      sym('ignored'),
      struct({
        fast_score: u32(80),
        slow_score: u32(90),
        trend: variant('Degrading'),
        consecutive_failures: u32(2),
        recent_outcomes: u32(outcomes),
        recent_count: u32(count),
        observations: u64(40),
        risk_reason: variant('None'),
        last_report_at: u64(1789808487),
      }),
    );

  it('counts successes only within the recent window', () => {
    // 4 outcomes: 0b1101 → 3 successes; the high bits are outside the window.
    expect(decodeHealth(health(0b1111_0000_1101, 4))).toEqual({
      trend: 'Degrading',
      riskReason: 'None',
      consecutiveFailures: 2,
      recentSuccessPercent: 75,
      recentCount: 4,
      observations: 40,
    });
  });

  it('handles a full 32-report window', () => {
    expect(decodeHealth(health(0xffffffff, 32)).recentSuccessPercent).toBe(100);
  });
});

describe('readRegistryIndex', () => {
  const registry = (...storage: [string, xdr.ScVal][]) =>
    dataEntry(
      REGISTRY,
      xdr.ScVal.scvLedgerKeyContractInstance(),
      xdr.ScVal.scvContractInstance(
        new xdr.ScContractInstance({
          executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
          storage: [
            new xdr.ScMapEntry({ key: variant('Admin'), val: new Address(OPERATOR).toScVal() }),
            ...storage.map(([name, val]) => new xdr.ScMapEntry({ key: variant(name), val })),
          ],
        }),
      ),
    );
  const ids = xdr.ScVal.scvVec([sym('moneygram'), sym('zeam_money')]);

  it('reads the original layout: every id in AnchorIds', () => {
    expect(readRegistryIndex(registry(['AnchorIds', ids]))).toEqual({ layout: 'ids', ids: ['moneygram', 'zeam_money'] });
  });

  it('reads the paged layout: only AnchorCount, ids in their own entries', () => {
    expect(readRegistryIndex(registry(['AnchorCount', u32(110)]))).toEqual({ layout: 'paged', count: 110 });
  });

  it('keeps the old list mid-migration, while the paged one is still filling', () => {
    // AnchorCount is set before AnchorIds is removed by finalize_migration.
    expect(readRegistryIndex(registry(['AnchorCount', u32(40)], ['AnchorIds', ids]))).toEqual({
      layout: 'ids',
      ids: ['moneygram', 'zeam_money'],
    });
  });

  it('reads a registry with nothing registered as empty', () => {
    expect(readRegistryIndex(registry())).toEqual({ layout: 'ids', ids: [] });
  });

  it('builds AnchorAt(i) as a variant with a u32 field and reads the id back', () => {
    const scKey = xdr.ScVal.scvVec([sym('AnchorAt'), u32(7)]);
    const expected = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(REGISTRY).toScAddress(),
        key: scKey,
        durability: xdr.ContractDataDurability.persistent,
      }),
    );
    expect(keyId(anchorAtKey(REGISTRY, 7))).toBe(keyId(expected));
    expect(decodeAnchorAt(dataEntry(REGISTRY, scKey, sym('moneygram')))).toBe('moneygram');
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
    expect(ledgerRanges(100, 100, 10)).toEqual([]);
  });
});

const addr = (a: string) => new Address(a).toScVal();
const vec = (items: xdr.ScVal[]) => xdr.ScVal.scvVec(items);
const bytes = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));
const R1 = 'GBWXKNZBCZYKCMLGUBWQBBVLYTZ6OYMXVATDH6UWNRELHS2D2C5MHPQG';
const R2 = 'GBN2RFNKQVMHOZ2FWC3JKBDJICW46435MIJA6HU3SXDHG5VWSDX7J2RB';

describe('quorum, round, dispute and lifecycle records', () => {
  it('keys a round in temporary storage', () => {
    const key = roundKey(ORACLE, 'moneygram');
    expect((key.value as xdr.LedgerKeyContractData).durability).toBe(xdr.ContractDataDurability.temporary);
  });

  it('reads the quorum behind a card, marking outliers', () => {
    const entry = dataEntry(
      ORACLE,
      sym('ignored'),
      struct({
        window_end: u64(1792753200),
        reporters: vec([addr(R1), addr(R2)]),
        scores: vec([u32(74), u32(95)]),
        inputs_hashes: vec([bytes('00'.repeat(32)), bytes('11'.repeat(32))]),
        spread: u32(21),
        outliers: vec([addr(R2)]),
      }),
    );
    expect(decodeQuorum(entry, 2)).toEqual({
      windowEnd: '2026-10-23T11:00:00.000Z',
      reporters: [
        { address: R1, score: 74, outlier: false },
        { address: R2, score: 95, outlier: true },
      ],
      spread: 21,
      threshold: 2,
    });
  });

  it('counts the cards a pending round holds', () => {
    const entry = dataEntry(
      ORACLE,
      sym('ignored'),
      struct({ window_end: u64(1792753200), methodology_version: u32(1), submissions: vec([variant('x')]) }),
    );
    expect(decodeRound(entry, 2)).toMatchObject({ submitted: 1, threshold: 2 });
  });

  it('reads a dispute with its votes', () => {
    const entry = dataEntry(
      ORACLE,
      sym('ignored'),
      struct({
        operator: addr(OPERATOR),
        window_end: u64(1792753200),
        opened_at: u64(1792760000),
        reason_code: u32(1),
        evidence_hash: bytes('ab'.repeat(32)),
        status: variant('Upheld'),
        uphold: vec([addr(R1), addr(R2)]),
        reject: vec([]),
        resolved_at: u64(1792761000),
      }),
    );
    expect(decodeDispute(entry)).toMatchObject({ status: 'Upheld', upholdVotes: 2, rejectVotes: 0, reasonCode: 1 });
  });

  it('reads a deactivation, and nothing for an active anchor', () => {
    const status = (state: string, reason: string) =>
      dataEntry(REGISTRY, sym('ignored'), struct({ state: variant(state), reason: xdr.ScVal.scvString(reason), since: u64(1792753200) }));
    expect(decodeLifecycle(status('Deactivated', 'mock retired'))).toEqual({
      reason: 'mock retired',
      since: '2026-10-23T11:00:00.000Z',
    });
    expect(decodeLifecycle(status('Active', ''))).toBeUndefined();
  });

  it('reads the threshold from the oracle instance, 1 without a config', () => {
    const instance = (storage: xdr.ScMapEntry[]) =>
      dataEntry(
        ORACLE,
        xdr.ScVal.scvLedgerKeyContractInstance(),
        xdr.ScVal.scvContractInstance(
          new xdr.ScContractInstance({ executable: xdr.ContractExecutable.contractExecutableStellarAsset(), storage }),
        ),
      );
    expect(readQuorumThreshold(instance([]))).toBe(1);
    const cfg = new xdr.ScMapEntry({
      key: variant('QuorumCfg'),
      val: struct({ threshold: u32(2), max_spread: u32(15), round_seconds: u64(21600) }),
    });
    expect(readQuorumThreshold(instance([cfg]))).toBe(2);
  });
});
