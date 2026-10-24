import { describe, expect, it } from 'vitest';
import { buildArgs, convert, METHODS } from './admin-calls';

const spec = (target: 'registry' | 'oracle', method: string) => METHODS[target].find((m) => m.method === method)!;

describe('admin call arguments', () => {
  it('builds a struct argument from its fields', () => {
    const args = buildArgs(spec('oracle', 'set_quorum_config'), {
      'config.threshold': '2',
      'config.max_spread': '15',
      'config.round_seconds': '21600',
    });
    expect(args).toEqual({ config: { threshold: 2, max_spread: 15, round_seconds: 21600n } });
  });

  it('converts XLM to stroops, a hash to bytes, and a source type to its enum', () => {
    expect(buildArgs(spec('oracle', 'set_dispute_config'), { 'config.min_stake': '10', 'config.cooldown_seconds': '60' })).toEqual({
      config: { min_stake: 100_000_000n, cooldown_seconds: 60n },
    });
    expect((convert('bytes32', 'ab'.repeat(32)) as Uint8Array).length).toBe(32);
    expect(convert('sourceType', 'RealTestnet')).toEqual({ tag: 'RealTestnet', values: undefined });
  });

  it('refuses what is not the right kind of value', () => {
    expect(() => convert('u64', '-1')).toThrow();
    expect(() => convert('address', 'GABC')).toThrow();
    expect(() => convert('bytes32', 'xyz')).toThrow();
    expect(() => convert('sourceType', 'Mainnet')).toThrow();
    expect(() => convert('xlm', '0')).toThrow();
  });
});
