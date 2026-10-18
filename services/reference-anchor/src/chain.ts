// The ledger side: paying deposits out and finding withdrawal payments.
import { Asset, Horizon, Keypair, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Chain } from './anchor.js';

export function horizonChain(opts: {
  horizonUrl: string;
  networkPassphrase: string;
  distribution: Keypair;
  asset: Asset;
}): Chain {
  const server = new Horizon.Server(opts.horizonUrl);
  const me = opts.distribution.publicKey();
  const same = (a: string, b: string) => Math.abs(Number(a) - Number(b)) < 1e-7;
  // One payout at a time: two in parallel would race for the same sequence number.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    pay(to, amount) {
      const run = queue.then(async () => {
        const account = await server.loadAccount(me);
        const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase: opts.networkPassphrase })
          .addOperation(Operation.payment({ destination: to, asset: opts.asset, amount }))
          .setTimeout(60)
          .build();
        tx.sign(opts.distribution);
        return (await server.submitTransaction(tx)).hash;
      });
      queue = run.catch(() => undefined);
      return run;
    },

    async findPayment(memo, amount) {
      // Recent payments to us; a withdrawal is paid within minutes of being asked for.
      const page = await server.payments().forAccount(me).order('desc').limit(100).join('transactions').call();
      for (const p of page.records) {
        if (p.type !== 'payment' || p.to !== me || p.from === me) continue;
        if (p.asset_code !== opts.asset.getCode() || p.asset_issuer !== opts.asset.getIssuer() || !same(p.amount, amount)) continue;
        const tx = (await p.transaction()) as unknown as { memo_type?: string; memo?: string; successful?: boolean };
        if (tx.successful !== false && tx.memo_type === Memo.text('x').type && tx.memo === memo) {
          return { hash: p.transaction_hash, from: p.from };
        }
      }
      return undefined;
    },
  };
}
