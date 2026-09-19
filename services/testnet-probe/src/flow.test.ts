import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { runMoneyFlow, type FlowDeps } from './flow.js';
import { findSandboxForm } from './sep6.js';
import type { StellarTomlInfo } from './types.js';

const USDC = { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' };
const TREASURY = 'GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6';
const DEP_TX = 'a'.repeat(64);
const WD_TX = 'b'.repeat(64);

const toml = (extra: Partial<StellarTomlInfo> = {}): StellarTomlInfo => ({
  webAuthEndpoint: 'https://mock.test/auth',
  signingKey: 'GSIGN',
  transferServerSep6: 'https://mock.test/sep6',
  currencies: [USDC],
  accounts: [TREASURY],
  networkPassphrase: 'Test SDF Network ; September 2015',
  orgName: 'Mock Anchor',
  ...extra,
});

function deps(over: Partial<FlowDeps> = {}): FlowDeps & { paid: Array<Record<string, unknown>> } {
  const paid: Array<Record<string, unknown>> = [];
  let clock = 0;
  const statuses: Record<string, Record<string, unknown>> = {
    dep1: { id: 'dep1', status: 'completed', stellar_transaction_id: DEP_TX, amount_out: '2.0396090', more_info_url: 'https://mock.test/sep6/tx/dep1' },
    wd1: { id: 'wd1', status: 'completed' },
  };
  return {
    paid,
    fetchToml: async () => toml(),
    createAccount: async () => Keypair.random(),
    addTrustline: async () => undefined,
    sep10: async () => ({ token: 'jwt', challenge: { xdr: 'x', network_passphrase: 'Test SDF Network ; September 2015' } }),
    sep6Info: async () => ({
      deposit: { USDC: { enabled: true, fields: { type: { choices: ['bank_account'] } } } },
      withdraw: { USDC: { enabled: true, types: { bank_account: {} } } },
    }),
    sep6Deposit: async () => ({ id: 'dep1' }),
    sep6Withdraw: async () => ({ id: 'wd1', account_id: TREASURY, memo_type: 'id', memo: '922043198347' }),
    sandbox: async () => 'Simulate incoming TRY transfer',
    poll: async (_s, _t, id) => statuses[id] as never,
    getTransaction: async (_s, _t, id) => statuses[id] as never,
    pay: async (_kp, p) => (paid.push(p), WD_TX),
    verify: async (hash, want) =>
      hash === DEP_TX
        ? { ok: true, detail: '2.0396090 USDC on the ledger', amount: '2.0396090', from: TREASURY }
        : { ok: want.to === TREASURY, detail: 'paid to the anchor', amount: want.amount },
    balance: async () => '2.0396090',
    depositAmount: '10',
    now: () => (clock += 100),
    ...over,
  };
}

const target = { anchor_id: 'mock_testnet', domain: 'mock.test' };

describe('runMoneyFlow', () => {
  it('SEP-6: deposits, checks the payout on the ledger, withdraws it back with the memo', async () => {
    const d = deps();
    const r = await runMoneyFlow(target, d);
    expect(r.success).toBe(true);
    expect(r.protocol).toBe('sep6');
    expect(r.steps.map((s) => [s.step, s.ok])).toEqual([
      ['toml', true],
      ['account', true],
      ['trustline', true],
      ['sep10', true],
      ['deposit', true],
      ['deposit_settled', true],
      ['deposit_onchain', true],
      ['withdraw', true],
      ['withdraw_onchain', true],
      ['withdraw_settled', true],
    ]);
    expect(d.paid).toEqual([{ destination: TREASURY, code: 'USDC', issuer: USDC.issuer, amount: '2.039609', memoType: 'id', memo: '922043198347' }]);
    expect(r.steps.find((s) => s.step === 'deposit_onchain')?.tx).toBe(DEP_TX);
  });

  it('fails a deposit that completes without paying on the ledger', async () => {
    const r = await runMoneyFlow(target, deps({ verify: async () => ({ ok: false, detail: 'no payment of USDC to us in the transaction' }) }));
    expect(r.success).toBe(false);
    expect(r.steps.at(-1)).toMatchObject({ step: 'deposit_onchain', ok: false });
  });

  it('fails a deposit when the sandbox has no control to mark the fiat as paid', async () => {
    const r = await runMoneyFlow(target, deps({ sandbox: async () => undefined }));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/no sandbox control/);
  });

  it('refuses a toml that names another network', async () => {
    const r = await runMoneyFlow(target, deps({ fetchToml: async () => toml({ networkPassphrase: 'Public Global Stellar Network ; September 2015' }) }));
    expect(r.success).toBe(false);
    expect(r.steps).toEqual([expect.objectContaining({ step: 'toml', ok: false })]);
  });

  it('counts a Friendbot failure as ours: inconclusive, not the anchor’s fault', async () => {
    const r = await runMoneyFlow(target, deps({ createAccount: async () => { throw new Error('HTTP 503'); } }));
    expect(r).toMatchObject({ success: false, inconclusive: true });
  });

  it('skips the withdrawal when the anchor offers none, and still passes on the deposit', async () => {
    const r = await runMoneyFlow(
      target,
      deps({ sep6Info: async () => ({ deposit: { USDC: { enabled: true } }, withdraw: {} }) }),
    );
    expect(r.success).toBe(true);
    expect(r.steps.find((s) => s.step === 'withdraw')).toMatchObject({ ok: null });
  });

  it('SEP-24: fills the interactive page, then checks the payout', async () => {
    const r = await runMoneyFlow(
      { ...target, asset_code: 'USDC' },
      deps({
        fetchToml: async () => toml({ transferServerSep24: 'https://mock.test/sep24', transferServerSep6: undefined }),
        sep24Deposit: async () => ({ id: 'dep1', url: 'https://mock.test/interactive' }),
        sep24Interactive: async () => true,
      }),
    );
    expect(r.success).toBe(true);
    expect(r.protocol).toBe('sep24');
    expect(r.steps.find((s) => s.step === 'withdraw')).toMatchObject({ ok: null });
  });
});

describe('findSandboxForm', () => {
  const page = 'https://mock.test/sep6/tx/dep1';
  it('finds the sandbox button’s POST form on the page’s own host, with hidden fields', () => {
    const html = `<form method="post" action="/sep6/tx/dep1/simulate-bank-transfer"><input type="hidden" name="csrf" value="k1"><button class="primary" type="submit">Simulate incoming TRY transfer</button></form>`;
    expect(findSandboxForm(html, page)).toEqual({
      action: 'https://mock.test/sep6/tx/dep1/simulate-bank-transfer',
      fields: { csrf: 'k1' },
      label: 'Simulate incoming TRY transfer',
    });
  });

  it('ignores other forms, GET forms, and forms posting to another host', () => {
    expect(findSandboxForm('<form method="post" action="/cancel"><button>Cancel transaction</button></form>', page)).toBeUndefined();
    expect(findSandboxForm('<form action="/x"><button>Simulate transfer</button></form>', page)).toBeUndefined();
    expect(findSandboxForm('<form method="post" action="https://evil.test/x"><button>Simulate transfer</button></form>', page)).toBeUndefined();
  });
});
