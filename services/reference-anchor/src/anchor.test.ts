// Drives the anchor the way testnet-probe does, with testnet-probe's own
// parsers, so passing here means the probe's checks pass too. The ledger is
// faked; the live run against testnet is in the README.
import { Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { findSandboxForm, transferType } from '../../testnet-probe/src/sep6.js';
import { parseAnchorToml } from '../../testnet-probe/src/toml.js';
import { createAnchor, type Chain, type Request } from './anchor.js';

const DOMAIN = 'ref1.monarank.xyz';
const signingKey = Keypair.random();
const distribution = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();

function setup(chainOverrides: Partial<Chain> = {}) {
  const paid: { to: string; amount: string }[] = [];
  const chain: Chain = {
    pay: async (to, amount) => {
      paid.push({ to, amount });
      return 'ab'.repeat(32);
    },
    findPayment: async () => undefined,
    ...chainOverrides,
  };
  const anchor = createAnchor(
    {
      homeDomain: DOMAIN,
      networkPassphrase: Networks.TESTNET,
      signingKey,
      distribution,
      assetCode: 'MONAREF',
      issuer,
      jwtSecret: 'test-secret',
      orgName: 'MonaRank reference anchor 1 (testnet)',
      minAmount: 1,
      maxAmount: 100,
    },
    chain,
  );
  const call = async (method: string, target: string, opts: { token?: string; body?: string } = {}) => {
    const url = new URL(target, `https://${DOMAIN}`);
    const req: Request = {
      method,
      path: url.pathname,
      query: url.searchParams,
      headers: { authorization: opts.token ? `Bearer ${opts.token}` : undefined },
      body: opts.body ?? '',
    };
    const res = await anchor.handle(req);
    return { ...res, json: () => JSON.parse(res.body) };
  };
  return { call, paid };
}

/** SEP-10 as the probe does it: check the anchor's signature, sign, exchange. */
async function login(call: ReturnType<typeof setup>['call'], wallet = Keypair.random()) {
  const challenge = (await call('GET', `/auth?account=${wallet.publicKey()}`)).json();
  const tx = new Transaction(challenge.transaction, challenge.network_passphrase);
  expect(tx.signatures.some((s) => signingKey.verify(tx.hash(), s.signature))).toBe(true);
  expect(tx.operations[0]?.source).toBe(wallet.publicKey());
  tx.sign(wallet);
  const res = await call('POST', '/auth', { body: JSON.stringify({ transaction: tx.toXDR() }) });
  expect(res.status).toBe(200);
  return { wallet, token: res.json().token as string };
}

describe('reference anchor', () => {
  it('serves a stellar.toml testnet-probe accepts, with CORS', async () => {
    const { call } = setup();
    const res = await call('GET', '/.well-known/stellar.toml');
    expect(res.headers?.['access-control-allow-origin']).toBe('*');
    const toml = parseAnchorToml(DOMAIN, res.body);
    expect(toml).toMatchObject({
      signingKey: signingKey.publicKey(),
      webAuthEndpoint: `https://${DOMAIN}/auth`,
      transferServerSep6: `https://${DOMAIN}/sep6`,
      currencies: [{ code: 'MONAREF', issuer }],
      accounts: [distribution],
      networkPassphrase: Networks.TESTNET,
      orgName: 'MonaRank reference anchor 1 (testnet)',
    });
    expect(toml.transferServerSep24).toBeUndefined();
  });

  it('issues a token only for a challenge the client signed', async () => {
    const { call } = setup();
    await login(call);

    const wallet = Keypair.random();
    const challenge = (await call('GET', `/auth?account=${wallet.publicKey()}`)).json();
    const tx = new Transaction(challenge.transaction, challenge.network_passphrase);
    tx.sign(Keypair.random());
    expect((await call('POST', '/auth', { body: JSON.stringify({ transaction: tx.toXDR() }) })).status).toBe(400);
    expect((await call('GET', '/auth?account=nope')).status).toBe(400);
  });

  it('pays a deposit out once its sandbox button is pressed, and only once', async () => {
    const { call, paid } = setup();
    const { wallet, token } = await login(call);
    const info = (await call('GET', '/sep6/info')).json();
    expect(transferType(info.deposit, 'MONAREF')).toBeUndefined();

    const deposit = (await call('GET', `/sep6/deposit?asset_code=MONAREF&account=${wallet.publicKey()}&amount=10`, { token })).json();
    const before = (await call('GET', `/sep6/transaction?id=${deposit.id}`, { token })).json().transaction;
    expect(before.status).toBe('pending_user_transfer_start');

    // The probe opens more_info_url and presses the sandbox control.
    const page = await call('GET', before.more_info_url);
    const form = findSandboxForm(page.body, before.more_info_url);
    expect(form?.label).toBe('Simulate incoming transfer');
    const press = () => call('POST', new URL(form!.action).pathname, { body: new URLSearchParams(form!.fields).toString() });
    expect((await press()).status).toBe(303);
    await press();

    const after = (await call('GET', `/sep6/transaction?id=${deposit.id}`, { token })).json().transaction;
    expect(after).toMatchObject({ status: 'completed', amount_out: '10', stellar_transaction_id: 'ab'.repeat(32) });
    expect(paid).toEqual([{ to: wallet.publicKey(), amount: '10' }]);
  });

  it('completes a withdrawal once the payment with its memo is on the ledger', async () => {
    let onLedger: { hash: string; from: string } | undefined;
    const asked: string[] = [];
    const { call } = setup({
      findPayment: async (memo, amount) => {
        asked.push(`${memo}:${amount}`);
        return onLedger;
      },
    });
    const { wallet, token } = await login(call);
    const info = (await call('GET', '/sep6/info')).json();
    expect(transferType(info.withdraw, 'MONAREF')).toBe('bank_account');

    const w = (await call('GET', `/sep6/withdraw?asset_code=MONAREF&account=${wallet.publicKey()}&amount=10&type=bank_account`, { token })).json();
    expect(w).toMatchObject({ account_id: distribution, memo_type: 'text' });
    expect(Buffer.byteLength(w.memo)).toBeLessThanOrEqual(28);

    const status = async () => (await call('GET', `/sep6/transaction?id=${w.id}`, { token })).json().transaction.status;
    expect(await status()).toBe('pending_user_transfer_start');
    // Someone else paying with the same memo does not count.
    onLedger = { hash: 'cd'.repeat(32), from: Keypair.random().publicKey() };
    expect(await status()).toBe('pending_user_transfer_start');
    onLedger = { hash: 'cd'.repeat(32), from: wallet.publicKey() };
    expect(await status()).toBe('completed');
    expect(asked[0]).toBe(`${w.memo}:10`);
  });

  it('refuses transfers without a token, for someone else, or out of range', async () => {
    const { call } = setup();
    const { wallet, token } = await login(call);
    const q = (amount: number) => `/sep6/deposit?asset_code=MONAREF&account=${wallet.publicKey()}&amount=${amount}`;
    expect((await call('GET', q(10))).status).toBe(403);
    expect((await call('GET', q(1000), { token })).status).toBe(400);
    expect((await call('GET', `/sep6/deposit?asset_code=USDC&amount=10`, { token })).status).toBe(400);
    expect((await call('GET', `/sep6/deposit?asset_code=MONAREF&account=${Keypair.random().publicKey()}&amount=10`, { token })).status).toBe(403);

    const id = (await call('GET', q(10), { token })).json().id;
    const other = await login(call);
    expect((await call('GET', `/sep6/transaction?id=${id}`, { token: other.token })).status).toBe(404);
  });
});
