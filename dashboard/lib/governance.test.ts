import { describe, expect, it } from 'vitest';
import { decodeOracleGovernance, describeEvent } from './governance';
import { nativeToScVal, xdr } from '@stellar/stellar-sdk';

const ORACLE = 'CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU';
const ADMIN = 'GARNK5UJIU6ZUQ6P3VB6BAE4OZHB44IJ6J7ZQLCW3J5ITIULYY7R3OD3';

describe('oracle governance', () => {
  it('falls back to the contract defaults when nothing was set', () => {
    const g = decodeOracleGovernance(ORACLE, { Admin: ADMIN });
    expect(g).toMatchObject({ admin: ADMIN, delaySeconds: 0, quorum: { threshold: 1 }, dispute: { minStakeXlm: 10 } });
    expect(g.pendingUpgrade).toBeUndefined();
  });

  it('reads what is waiting', () => {
    const g = decodeOracleGovernance(ORACLE, {
      Admin: ADMIN,
      PendingAdmin: 'GBIJOL2IP77RVO6KSP2T2CTAZU5R2H2JQ6OWTBK5ZNDHP2E5E4GGUDPO',
      UpgradeDelay: 86400n,
      PendingUpgrade: { wasm_hash: new Uint8Array(32).fill(0xab), executable_at: 1792588567n },
      QuorumCfg: { threshold: 2, max_spread: 15, round_seconds: 21600n },
      DisputeCfg: { min_stake: 200_000_000n, cooldown_seconds: 60n },
    });
    expect(g.pendingAdmin).toBe('GBIJOL2IP77RVO6KSP2T2CTAZU5R2H2JQ6OWTBK5ZNDHP2E5E4GGUDPO');
    expect(g.pendingUpgrade).toEqual({ wasmHash: 'ab'.repeat(32), executableAt: '2026-10-21T13:16:07.000Z' });
    expect(g.quorum).toEqual({ threshold: 2, maxSpread: 15, roundSeconds: 21600 });
    expect(g.dispute).toEqual({ minStakeXlm: 20, cooldownSeconds: 60 });
  });
});

describe('describeEvent', () => {
  it('names the event and lists its topics and fields as text', () => {
    const e = describeEvent('oracle', {
      id: '1',
      ledgerClosedAt: '2026-10-23T11:45:07Z',
      txHash: 'aa',
      topic: [xdr.ScVal.scvSymbol('reporter_revoked'), nativeToScVal(ADMIN, { type: 'address' })],
      value: nativeToScVal({ source_type: ['SimulatedMock'] }),
    });
    expect(e).toMatchObject({ contract: 'oracle', topic: 'reporter_revoked', details: { topic1: ADMIN, source_type: 'SimulatedMock' } });
  });
});
