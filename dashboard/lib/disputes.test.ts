import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { weighDecisions, type Decision } from './disputes';
import { decisionMessage } from './queue-message';

const ORACLE = 'C'.repeat(56);
const sep53 = (kp: Keypair, message: string) =>
  Buffer.from(kp.sign(createHash('sha256').update(`Stellar Signed Message:\n${message}`).digest())).toString('base64');

describe('weighDecisions', () => {
  const [a, b, outsider] = [Keypair.random(), Keypair.random(), Keypair.random()];
  const account = { signers: [{ key: a.publicKey(), weight: 1 }, { key: b.publicKey(), weight: 1 }], threshold: 2 };
  const base = { anchorId: 'ref1', windowEnd: 1792926000, decision: 'uphold' as const, createdAt: '', updatedAt: '' };
  const sign = (kp: Keypair, d = base) => ({ signer: kp.publicKey(), signature: sep53(kp, decisionMessage(ORACLE, d.anchorId, d.windowEnd, d.decision)) });

  it('counts only valid signatures from current signers', () => {
    const decision: Decision = {
      ...base,
      signatures: [
        sign(a),
        sign(outsider),
        // b signed the other decision: it must not count toward this one.
        { signer: b.publicKey(), signature: sign(b, { ...base, decision: 'reject' as never }).signature },
      ],
    };
    expect(weighDecisions([decision], account, ORACLE)[0]).toMatchObject({ signers: [a.publicKey()], weight: 1, threshold: 2 });
  });

  it('reaches the threshold with two signers', () => {
    expect(weighDecisions([{ ...base, signatures: [sign(a), sign(b)] }], account, ORACLE)[0].weight).toBe(2);
  });
});
