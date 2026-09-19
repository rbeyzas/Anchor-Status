import { describe, expect, it } from 'vitest';
import type { AnchorEvents } from './events.js';
import type { Archive } from './types.js';
import { verifyArchive } from './verify.js';

const chain = (points: AnchorEvents['scoreHistory']): AnchorEvents => ({ scoreHistory: points, slashEvents: [], riskEvents: [] });
const archiveOf = (points: Archive['anchors'][string]['scoreHistory']): Archive => ({
  version: 1,
  updatedAt: '2026-09-19T00:00:00Z',
  anchors: { moneygram: { scoreHistory: points, slashEvents: [] } },
});

describe('verifyArchive', () => {
  it('passes an archive that matches the chain', () => {
    const points = [
      { timestamp: '2026-09-18T12:00:00Z', score: 90, evidence: 'aa' },
      { timestamp: '2026-09-18T12:20:00Z', score: 92 },
    ];
    const r = verifyArchive(archiveOf(points), new Map([['moneygram', chain(points)]]), '2026-09-01T00:00:00Z');
    expect(r).toMatchObject({ chainPoints: 2, archivedInWindow: 2, missingFromArchive: [], notOnChain: [], evidenceMismatch: [] });
  });

  it('lists on-chain reports the archive lacks', () => {
    const onChain = [
      { timestamp: '2026-09-18T12:00:00Z', score: 90 },
      { timestamp: '2026-09-18T12:20:00Z', score: 92 },
    ];
    const r = verifyArchive(archiveOf(onChain.slice(1)), new Map([['moneygram', chain(onChain)]]), '2026-09-01T00:00:00Z');
    expect(r.missingFromArchive).toEqual([{ anchorId: 'moneygram', point: onChain[0] }]);
  });

  it('flags archived reports inside the window that the chain never emitted', () => {
    const invented = { timestamp: '2026-09-18T12:10:00Z', score: 100 };
    const r = verifyArchive(archiveOf([invented]), new Map(), '2026-09-01T00:00:00Z');
    expect(r.notOnChain).toEqual([{ anchorId: 'moneygram', point: invented }]);
  });

  it('does not judge archived reports older than the window it can see', () => {
    const old = { timestamp: '2026-06-01T00:00:00Z', score: 70 };
    const r = verifyArchive(archiveOf([old]), new Map(), '2026-07-11T00:00:00Z');
    expect(r).toMatchObject({ archivedInWindow: 0, notOnChain: [] });
  });

  it('catches an evidence hash that differs from the one on chain', () => {
    const r = verifyArchive(
      archiveOf([{ timestamp: '2026-09-18T12:00:00Z', score: 90, evidence: 'aa' }]),
      new Map([['moneygram', chain([{ timestamp: '2026-09-18T12:00:00Z', score: 90, evidence: 'bb' }])]]),
      '2026-09-01T00:00:00Z',
    );
    expect(r.evidenceMismatch).toHaveLength(1);
  });
});
