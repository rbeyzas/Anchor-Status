import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Account, Keypair, Operation, TransactionBuilder, nativeToScVal, Networks } from '@stellar/stellar-sdk';
import { inspect, mergeSignatures, rejectMessage, validSigners, verifyMessage, viewOf, weightOf, type QueueItem } from './admin-queue';

const REGISTRY = 'CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB';
const multisig = Keypair.random();
const [k1, k2, k3] = [Keypair.random(), Keypair.random(), Keypair.random()];
const account = {
  signers: [k1, k2, k3].map((k) => ({ key: k.publicKey(), weight: 1 })),
  threshold: 2,
  sequence: 100n,
};

/** An unsigned set_upgrade_delay call from the multisig, sequence 101. */
function call(maxTimeSeconds = 0) {
  return new TransactionBuilder(new Account(multisig.publicKey(), '100'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.invokeContractFunction({ contract: REGISTRY, function: 'set_upgrade_delay', args: [nativeToScVal(60n, { type: 'u64' })] }))
    .setTimeout(maxTimeSeconds)
    .build();
}

describe('admin queue checks', () => {
  it('reads the one contract call a transaction makes', () => {
    const info = inspect(call().toXDR(), Networks.TESTNET);
    expect(info).toMatchObject({ source: multisig.publicKey(), contract: REGISTRY, method: 'set_upgrade_delay', args: '60', sequence: 101n });
  });

  it('refuses anything but a single contract call', () => {
    const payment = new TransactionBuilder(new Account(multisig.publicKey(), '100'), { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.bumpSequence({ bumpTo: '200' }))
      .setTimeout(0)
      .build();
    expect(() => inspect(payment.toXDR(), Networks.TESTNET)).toThrow(/one contract call/);
  });

  it('counts only valid signatures from the signers, and merges them', () => {
    const a = call();
    a.sign(k1);
    const b = TransactionBuilder.fromXDR(a.toXDR(), Networks.TESTNET) as typeof a;
    b.sign(k2);
    const stranger = TransactionBuilder.fromXDR(a.toXDR(), Networks.TESTNET) as typeof a;
    stranger.sign(Keypair.random());
    const keys = account.signers.map((s) => s.key);
    expect(validSigners(a, keys)).toEqual([k1.publicKey()]);
    expect(validSigners(stranger, keys)).toEqual([k1.publicKey()]);
    const merged = mergeSignatures(a, b);
    expect(validSigners(merged, keys).sort()).toEqual([k1.publicKey(), k2.publicKey()].sort());
    expect(weightOf(validSigners(merged, keys), account)).toBe(2);
    // Merging the same signatures again adds nothing.
    expect(mergeSignatures(merged, b).signatures).toHaveLength(2);
  });

  it('refuses to merge a different transaction', () => {
    expect(() => mergeSignatures(call(), call(600))).toThrow(/same transaction/);
  });

  it('weighs an item and marks it stale once its sequence is used or its time is out', () => {
    const tx = call();
    tx.sign(k1);
    const item = { id: 'x', status: 'open', source: multisig.publicKey(), xdr: tx.toXDR() } as QueueItem;
    expect(viewOf(item, account)).toMatchObject({ weight: 1, threshold: 2, stale: false, method: 'set_upgrade_delay', args: '60' });
    // What is shown comes from the envelope: a stored field that says
    // otherwise, or a signer listed without a signature, is overridden.
    const tampered = { ...item, method: 'harmless', contract: 'C', signers: [k2.publicKey()] };
    expect(viewOf(tampered, account)).toMatchObject({ method: 'set_upgrade_delay', contract: REGISTRY, signers: [k1.publicKey()] });
    expect(viewOf(item, { ...account, sequence: 101n }).stale).toBe(true);
    const expiring = call(60);
    const timed = { ...item, xdr: expiring.toXDR() };
    expect(viewOf(timed, account, Date.now() + 3_600_000).stale).toBe(true);
  });

  it('checks a SEP-53 signed rejection', () => {
    const message = rejectMessage('abc');
    const sig = Buffer.from(k3.sign(createHash('sha256').update(`Stellar Signed Message:\n${message}`).digest())).toString('base64');
    expect(verifyMessage(k3.publicKey(), message, sig)).toBe(true);
    expect(verifyMessage(k2.publicKey(), message, sig)).toBe(false);
    expect(verifyMessage(k3.publicKey(), rejectMessage('other'), sig)).toBe(false);
  });
});
