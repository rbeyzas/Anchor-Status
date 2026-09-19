import { describe, expect, it } from 'vitest';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { anchorInfoKey, decodeAnchorInfo, decodeHealth, healthKey, keyId, readAnchorIds } from './contract-state';
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

describe('readAnchorIds', () => {
  it('finds AnchorIds among the other instance storage entries', () => {
    const instance = xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
        storage: [
          new xdr.ScMapEntry({ key: variant('Admin'), val: new Address(OPERATOR).toScVal() }),
          new xdr.ScMapEntry({ key: variant('AnchorIds'), val: xdr.ScVal.scvVec([sym('moneygram'), sym('zeam_money')]) }),
        ],
      }),
    );
    expect(readAnchorIds(dataEntry(REGISTRY, xdr.ScVal.scvLedgerKeyContractInstance(), instance))).toEqual([
      'moneygram',
      'zeam_money',
    ]);
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
