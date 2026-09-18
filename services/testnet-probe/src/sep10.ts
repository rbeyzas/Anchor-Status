import { Keypair, Transaction } from '@stellar/stellar-sdk';
import type { StellarTomlInfo } from './types.js';

interface ChallengeResponse {
  transaction: string;
  network_passphrase: string;
}

interface TokenResponse {
  token: string;
}

/**
 * Performs a real SEP-10 web authentication round trip against a live
 * anchor: fetch the challenge transaction, verify it's actually addressed
 * to our account and signed by the anchor's published SIGNING_KEY, sign it
 * with our own keypair, and exchange it for a JWT.
 */
export async function authenticateSep10(
  toml: StellarTomlInfo,
  keypair: Keypair,
  networkPassphrase: string,
): Promise<{ token: string; challenge: { xdr: string; network_passphrase: string } }> {
  const challengeUrl = new URL(toml.webAuthEndpoint);
  challengeUrl.searchParams.set('account', keypair.publicKey());

  const challengeRes = await fetch(challengeUrl.toString());
  if (!challengeRes.ok) {
    throw new Error(`SEP-10 challenge request failed: HTTP ${challengeRes.status}`);
  }
  const challenge = (await challengeRes.json()) as ChallengeResponse;

  const tx = new Transaction(challenge.transaction, challenge.network_passphrase);

  const signedByAnchor = tx.signatures.some((sig) =>
    Keypair.fromPublicKey(toml.signingKey).verify(tx.hash(), sig.signature),
  );
  if (!signedByAnchor) {
    throw new Error('SEP-10 challenge transaction was not signed by the anchor\'s published SIGNING_KEY');
  }

  const sourceAccount = tx.operations[0]?.source;
  if (sourceAccount !== keypair.publicKey()) {
    throw new Error('SEP-10 challenge transaction is not addressed to our account');
  }

  tx.sign(keypair);

  const tokenRes = await fetch(toml.webAuthEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: tx.toXDR() }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`SEP-10 token exchange failed (HTTP ${tokenRes.status}): ${body}`);
  }
  const { token } = (await tokenRes.json()) as TokenResponse;
  // The challenge as the anchor sent it (before our signature): signed with
  // its SIGNING_KEY, it is independent proof the anchor answered.
  return { token, challenge: { xdr: challenge.transaction, network_passphrase: challenge.network_passphrase } };
}
