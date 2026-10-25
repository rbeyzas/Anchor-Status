import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { cardFor, carried, decisionMessage, recommend } from './disputes.js';
import type { ShadowRow } from './scoring/shadow.js';

const OUTAGE = 1;
const row = (window_end: number, score: number, flags = 0): ShadowRow => ({
  anchor_id: 'ref1', window_end, score, flags, confidence: 75, methodology_version: 2, recorded_at: '',
});

describe('recommend', () => {
  it('upholds when only one reporter saw the failures', () => {
    const r = recommend({ host: 'A', score: 48, flags: OUTAGE }, { host: 'B', score: 88, flags: 0 });
    expect(r.recommendation).toBe('uphold');
    expect(r.reason).toMatch(/^A saw failures that B did not/);
  });

  it('leaves a real outage both saw to the evidence (maintenance?)', () => {
    expect(recommend({ host: 'A', score: 45, flags: OUTAGE }, { host: 'B', score: 47, flags: OUTAGE }).recommendation).toBe('unclear');
  });

  it('rejects when both agree and neither saw an outage', () => {
    expect(recommend({ host: 'A', score: 85 }, { host: 'B', score: 88 }).recommendation).toBe('reject');
  });

  it('says so when a reporter has no card', () => {
    expect(recommend({ host: 'A', score: 85 }, { host: 'B' })).toMatchObject({ recommendation: 'unclear', reason: expect.stringMatching(/^Only A/) });
  });
});

describe('cardFor', () => {
  it('takes the latest card at or before the window, within two hours', () => {
    const rows = [row(1000, 80), row(4600, 70), row(9000, 60)];
    expect(cardFor(rows, 'ref1', 8000)?.score).toBe(70);
    expect(cardFor(rows.slice(0, 2), 'ref1', 4600 + 7201)).toBeUndefined();
    expect(cardFor(rows, 'other', 9000)).toBeUndefined();
  });
});

describe('carried', () => {
  const ORACLE = 'C'.repeat(56);
  const [a, b] = [Keypair.random(), Keypair.random()];
  const account = { signers: [{ key: a.publicKey(), weight: 1 }, { key: b.publicKey(), weight: 1 }], threshold: 2 };
  const dispute = { anchorId: 'ref1', windowEnd: 1792926000, openedAt: 0, reasonCode: 1, evidenceHash: '', voters: [] };
  const sig = (kp: Keypair, decision: 'uphold' | 'reject') => ({
    signer: kp.publicKey(),
    signature: Buffer.from(kp.sign(createHash('sha256').update(`Stellar Signed Message:\n${decisionMessage(ORACLE, 'ref1', 1792926000, decision)}`).digest())).toString('base64'),
  });
  const decision = (value: 'uphold' | 'reject', signatures: ReturnType<typeof sig>[]) => ({ anchorId: 'ref1', windowEnd: 1792926000, decision: value, signatures });

  it('needs the threshold of valid signatures', () => {
    expect(carried(dispute, [decision('uphold', [sig(a, 'uphold')])], account, ORACLE)).toBeNull();
    expect(carried(dispute, [decision('uphold', [sig(a, 'uphold'), sig(b, 'uphold')])], account, ORACLE)).toBe('uphold');
  });

  it('does not count a signature made for the other decision', () => {
    expect(carried(dispute, [decision('reject', [sig(a, 'reject'), sig(b, 'uphold')])], account, ORACLE)).toBeNull();
  });

  it('refuses to vote when both decisions were carried', () => {
    const both = [decision('uphold', [sig(a, 'uphold'), sig(b, 'uphold')]), decision('reject', [sig(a, 'reject'), sig(b, 'reject')])];
    expect(carried(dispute, both, account, ORACLE)).toBe('both');
  });
});
