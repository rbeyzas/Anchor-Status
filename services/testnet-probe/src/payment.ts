import { Asset, BASE_FEE, Horizon, Keypair, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

/** A memo as SEP-6 hands it over: its type decides the encoding. */
export function memoFor(type: string | undefined, value: string | undefined): Memo {
  if (value === undefined || value === '') return Memo.none();
  switch (type) {
    case 'id':
      return Memo.id(value);
    case 'hash':
      return Memo.hash(Buffer.from(value, /^[0-9a-f]{64}$/i.test(value) ? 'hex' : 'base64'));
    default:
      return Memo.text(value);
  }
}

/** Sends `amount` of `code:issuer` to `destination` on testnet; returns the transaction hash. */
export async function sendPayment(
  horizonUrl: string,
  keypair: Keypair,
  p: { destination: string; code: string; issuer: string; amount: string; memo: Memo },
  networkPassphrase: string,
): Promise<string> {
  const server = new Horizon.Server(horizonUrl);
  const tx = new TransactionBuilder(await server.loadAccount(keypair.publicKey()), { fee: BASE_FEE, networkPassphrase })
    .addOperation(Operation.payment({ destination: p.destination, asset: new Asset(p.code, p.issuer), amount: p.amount }))
    .addMemo(p.memo)
    .setTimeout(60)
    .build();
  tx.sign(keypair);
  return (await server.submitTransaction(tx)).hash;
}

/** The account's balance of `code:issuer`, as a decimal string. */
export async function balanceOf(horizonUrl: string, account: string, code: string, issuer: string): Promise<string> {
  const res = await fetch(`${horizonUrl}/accounts/${account}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Horizon answered HTTP ${res.status} for ${account}`);
  const balances = ((await res.json()) as { balances: Array<{ asset_code?: string; asset_issuer?: string; balance: string }> }).balances;
  return balances.find((b) => b.asset_code === code && b.asset_issuer === issuer)?.balance ?? '0';
}
