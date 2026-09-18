import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Keypair, Networks, WebAuth } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { writeEvidence } from './evidence.js';
import { findPayout, verifyOffline } from './verify.js';

const anchorKey = Keypair.random();
const probeKey = Keypair.random();

function evidence(signer = anchorKey, startedAt = new Date().toISOString()) {
  return {
    kind: 'mainnet-probe',
    network: 'mainnet',
    anchor_id: 'a',
    domain: 'anchor.example',
    started_at: startedAt,
    verdict: { success: true },
    probe_account: probeKey.publicKey(),
    stellar_toml: { sha256: 'x', signing_key: anchorKey.publicKey() },
    sep10_challenge: {
      xdr: WebAuth.buildChallengeTx(signer, probeKey.publicKey(), 'anchor.example', 300, Networks.PUBLIC, 'anchor.example'),
      network_passphrase: Networks.PUBLIC,
    },
  };
}

describe('verifyOffline', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const publish = (doc: object) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'));
    const hash = writeEvidence(dir, doc as Record<string, unknown>);
    return { hash, bytes: fs.readFileSync(path.join(dir, `${hash}.json`)) };
  };

  it('passes a genuine document', () => {
    const { hash, bytes } = publish(evidence());
    const { checks } = verifyOffline(bytes, hash);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it('catches a document edited after publication', () => {
    const { hash, bytes } = publish(evidence());
    const tampered = Buffer.from(bytes.toString().replace('"success":true', '"success":false'));
    expect(verifyOffline(tampered, hash).checks.find((c) => c.name === 'Document matches its hash')?.ok).toBe(false);
  });

  it('catches a challenge not signed by the anchor', () => {
    const { hash, bytes } = publish(evidence(Keypair.random()));
    expect(verifyOffline(bytes, hash).checks.find((c) => c.name === 'Anchor signed the SEP-10 challenge')?.ok).toBe(false);
  });

  it('catches a signature from a different time than claimed', () => {
    const { hash, bytes } = publish(evidence(anchorKey, '2020-01-01T00:00:00.000Z'));
    expect(verifyOffline(bytes, hash).checks.find((c) => c.name === 'Signature is from the time of the check')?.ok).toBe(false);
  });
});

describe('findPayout', () => {
  const probe = 'GPROBE';
  it('finds a classic payment', () => {
    expect(findPayout([{ type: 'payment', to: probe, amount: '9.0', asset_code: 'SRT' }], probe)).toEqual({ amount: '9.0', asset: 'SRT' });
  });

  it('finds a Stellar Asset Contract transfer, as the SDF test anchor pays out', () => {
    const op = {
      type: 'invoke_host_function',
      asset_balance_changes: [{ type: 'transfer', from: 'GANCHOR', to: probe, amount: '9.0000000', asset_code: 'SRT' }],
    };
    expect(findPayout([op], probe)).toEqual({ amount: '9.0000000', asset: 'SRT' });
  });

  it('ignores money moving to someone else', () => {
    expect(findPayout([{ type: 'payment', to: 'GSOMEONE', amount: '9', asset_code: 'SRT' }], probe)).toBeUndefined();
  });
});
