import { describe, expect, it } from 'vitest';
import type { MainnetAnchor } from './anchors.js';
import type { MainnetProbeResult } from './probe.js';
import { buildStatus } from './status.js';

const anchor = (id: string, extra: Partial<MainnetAnchor> = {}): MainnetAnchor => ({
  anchor_id: id,
  name: id,
  domain: `${id}.example`,
  first_seen: 'x',
  ...extra,
});

const result = (id: string, extra: Partial<MainnetProbeResult> = {}): MainnetProbeResult => ({
  anchor_id: id,
  domain: `${id}.example`,
  source_type: 'RealMainnet',
  timestamp: '2026-09-18T12:00:00.000Z',
  success: true,
  settlement_seconds: 1,
  stages: {},
  ...extra,
});

describe('buildStatus', () => {
  const now = new Date('2026-09-18T12:00:00Z');

  it('records the problem and the directory label for each anchor', () => {
    const status = buildStatus(
      [anchor('zeam_money'), anchor('cowrie_exchange', { listing: 'abandoned' })],
      [
        result('zeam_money', { success: false, failed_stage: 'initiate', error: 'HTTP 404 from ...' }),
        result('cowrie_exchange', { success: false, failed_stage: 'toml', error: 'no transfer server' }),
      ],
      null,
      now,
      () => false,
    );
    expect(status.anchors.zeam_money.last_probe).toMatchObject({ success: false, failed_stage: 'initiate' });
    expect(status.anchors.cowrie_exchange).toMatchObject({ listing: 'abandoned' });
  });

  it('lists the stages an anchor declined by policy', () => {
    const status = buildStatus(
      [anchor('moneygram')],
      [result('moneygram', { stages: { toml: { ok: true }, challenge: { ok: false, policy: true } } })],
      null,
      now,
      () => false,
    );
    expect(status.anchors.moneygram.last_probe?.policy).toEqual(['challenge']);
  });

  it('keeps the previous verdict for an anchor skipped this round', () => {
    const previous = buildStatus([anchor('dead')], [result('dead', { success: false, failed_stage: 'toml' })], null, now, () => true);
    const next = buildStatus([anchor('dead')], [], previous, now, () => true);
    expect(next.anchors.dead).toMatchObject({ dormant: true, last_probe: { failed_stage: 'toml' } });
  });

  it('keeps each stage of the last probe in order, with its time', () => {
    const status = buildStatus(
      [anchor('clpx')],
      [
        result('clpx', {
          settlement_seconds: 1.2,
          stages_expected: ['toml', 'info', 'challenge', 'token', 'initiate'],
          stages: { info: { ok: true, ms: 300 }, toml: { ok: true, ms: 200 }, challenge: { ok: true, ms: 90, policy: true } },
        }),
      ],
      null,
      now,
      () => false,
    );
    expect(status.anchors.clpx.last_probe).toMatchObject({
      settlement_seconds: 1.2,
      stages_expected: ['toml', 'info', 'challenge', 'token', 'initiate'],
      stages: [
        { stage: 'toml', ok: true, ms: 200 },
        { stage: 'info', ok: true, ms: 300 },
        { stage: 'challenge', ok: true, ms: 90, policy: true },
      ],
    });
  });
});
