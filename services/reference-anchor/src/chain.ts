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

    async findPayment(memo, amount, since) {
      // Newest first, back to when the withdrawal was asked for: payments
      // others send us (anyone can, cheaply) cannot push it out of view.
      let page = await server.payments().forAccount(me).order('desc').limit(200).join('transactions').call();
      for (let pages = 0; pages < 10 && page.records.length; pages++) {
        for (const p of page.records) {
          if (Date.parse(p.created_at) < since.getTime()) return undefined;
          if (p.type !== 'payment' || p.to !== me || p.from === me) continue;
          if (p.asset_code !== opts.asset.getCode() || p.asset_issuer !== opts.asset.getIssuer() || !same(p.amount, amount)) continue;
          const tx = (await p.transaction()) as unknown as { memo_type?: string; memo?: string; successful?: boolean };
          if (tx.successful !== false && tx.memo_type === Memo.text('x').type && tx.memo === memo) {
            return { hash: p.transaction_hash, from: p.from };
          }
        }
        page = await page.next();
      }
      return undefined;
    },

    async balance() {
      const account = await server.loadAccount(me);
      const b = account.balances.find(
        (x) => 'asset_code' in x && x.asset_code === opts.asset.getCode() && 'asset_issuer' in x && x.asset_issuer === opts.asset.getIssuer(),
      );
      return b ? Number(b.balance) : 0;
    },
  };
}
