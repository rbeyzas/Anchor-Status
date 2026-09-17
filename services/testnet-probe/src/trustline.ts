import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

/**
 * Opens a trustline from `keypair` to `code:issuer` on testnet. A SEP-24
 * deposit pays the asset out to the user's account; without a trustline the
 * anchor can't deliver it and the transaction ends in `error` (or stalls in
 * `pending_trust`), which would be the probe's fault, not the anchor's.
 */
export async function addTrustline(
  horizonUrl: string,
  keypair: Keypair,
  code: string,
  issuer: string,
  networkPassphrase: string,
): Promise<void> {
  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(Operation.changeTrust({ asset: new Asset(code, issuer) }))
    .setTimeout(60)
    .build();
  tx.sign(keypair);
  await server.submitTransaction(tx);
}
