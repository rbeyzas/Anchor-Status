import { Keypair } from '@stellar/stellar-sdk';

/** Creates a fresh testnet keypair and funds it via Friendbot. */
export async function createAndFundAccount(friendbotUrl: string): Promise<Keypair> {
  const keypair = Keypair.random();
  const res = await fetch(`${friendbotUrl}/?addr=${encodeURIComponent(keypair.publicKey())}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Friendbot funding failed (HTTP ${res.status}): ${body}`);
  }
  return keypair;
}
