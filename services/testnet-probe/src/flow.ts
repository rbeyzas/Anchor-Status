// The testnet money-flow check: a fresh wallet deposits with the anchor and,
// where the anchor offers it over SEP-6, withdraws back. Every payment is
// checked on the ledger, not taken from the anchor's word.
//
//   toml -> account -> trustline -> sep10 -> deposit -> deposit_settled ->
//   deposit_onchain -> withdraw -> withdraw_settled -> withdraw_onchain
import type { Keypair } from '@stellar/stellar-sdk';
import type { PaymentCheck, VerifiedPayment } from './horizon-verify.js';
import { transferType, type Sep6Deposit, type Sep6Info, type Sep6Withdraw } from './sep6.js';
import type { Sep24Transaction } from './sep24.js';
import type { FlowStep, FlowStepName, StellarTomlInfo } from './types.js';

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

export interface FlowTarget {
  anchor_id: string;
  domain: string;
  /** Asset to move; otherwise the first deposit-enabled one with an issuer. */
  asset_code?: string;
}

export interface FlowDeps {
  fetchToml: (domain: string) => Promise<StellarTomlInfo>;
  createAccount: () => Promise<Keypair>;
  addTrustline: (kp: Keypair, code: string, issuer: string) => Promise<void>;
  sep10: (toml: StellarTomlInfo, kp: Keypair) => Promise<{ token: string; challenge: { xdr: string; network_passphrase: string } }>;
  // SEP-24
  sep24Deposit?: (server: string, token: string, code: string, amount: string) => Promise<{ id: string; url: string }>;
  sep24Interactive?: (url: string, amount: string) => Promise<boolean>;
  // SEP-6
  sep6Info: (server: string) => Promise<Sep6Info>;
  sep6Deposit: (server: string, token: string, p: { code: string; account: string; amount: string; type?: string }) => Promise<Sep6Deposit>;
  sep6Withdraw: (server: string, token: string, p: { code: string; account: string; amount: string; type?: string }) => Promise<Sep6Withdraw>;
  sandbox: (moreInfoUrl: string) => Promise<string | undefined>;
  /** Polls /transaction (the same endpoint in SEP-6 and SEP-24). */
  poll: (server: string, token: string, id: string, until: (s: string) => boolean) => Promise<Sep24Transaction & Record<string, unknown>>;
  getTransaction: (server: string, token: string, id: string) => Promise<Sep24Transaction & Record<string, unknown>>;
  pay: (kp: Keypair, p: { destination: string; code: string; issuer: string; amount: string; memoType?: string; memo?: string }) => Promise<string>;
  verify: (txHash: string, want: PaymentCheck) => Promise<VerifiedPayment>;
  balance: (account: string, code: string, issuer: string) => Promise<string>;
  depositAmount: string;
  now: () => number;
}

export interface FlowResult {
  success: boolean;
  /** The failure was ours (Friendbot, our browser): decides nothing. */
  inconclusive: boolean;
  protocol?: 'sep24' | 'sep6';
  asset?: string;
  steps: FlowStep[];
  seconds: number;
  final_transaction_status: string | null;
  error?: string;
  orgName?: string;
  /** Raw material for the evidence document. */
  evidence: Record<string, unknown>;
}

class StepFailure extends Error {
  constructor(readonly inconclusive = false, message = '') {
    super(message);
  }
}

const TERMINAL = new Set(['completed', 'refunded', 'expired', 'error', 'no_market', 'too_small', 'too_large']);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const msg = (err: unknown) => (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 240);

/** Largest amount with at most 7 decimals not above `x`. */
const floor7 = (x: number) => (Math.floor(x * 1e7) / 1e7).toFixed(7).replace(/\.?0+$/, '');

export async function runMoneyFlow(target: FlowTarget, deps: FlowDeps): Promise<FlowResult> {
  const t0 = deps.now();
  const steps: FlowStep[] = [];
  const evidence: Record<string, unknown> = {};
  const out = (partial: Partial<FlowResult>): FlowResult => ({
    success: false,
    inconclusive: false,
    steps,
    seconds: (deps.now() - t0) / 1000,
    final_transaction_status: null,
    evidence,
    ...partial,
  });

  // Runs one step; a thrown error fails it (or, marked ours, makes the run inconclusive).
  async function step<T>(name: FlowStepName, run: () => Promise<{ value: T; detail: string; tx?: string; amount?: string }>): Promise<T> {
    const started = deps.now();
    try {
      const r = await run();
      steps.push({ step: name, ok: true, ms: deps.now() - started, detail: r.detail, ...(r.tx ? { tx: r.tx } : {}), ...(r.amount ? { amount: r.amount } : {}) });
      return r.value;
    } catch (err) {
      steps.push({ step: name, ok: false, ms: deps.now() - started, detail: msg(err) });
      throw err instanceof StepFailure ? err : new StepFailure(false, msg(err));
    }
  }
  const skip = (name: FlowStepName, detail: string) => steps.push({ step: name, ok: null, detail });

  let protocol: 'sep24' | 'sep6' | undefined;
  let assetLabel: string | undefined;
  let orgName: string | undefined;
  let finalStatus: string | null = null;
  try {
    const { toml, server, sep6, currency } = await step('toml', async () => {
      const t = await deps.fetchToml(target.domain);
      if (t.networkPassphrase && t.networkPassphrase !== TESTNET_PASSPHRASE) {
        throw new Error(`stellar.toml declares "${t.networkPassphrase}", not testnet`);
      }
      // SEP-24 when offered (the reference anchor's path); SEP-6 otherwise.
      protocol = t.transferServerSep24 ? 'sep24' : 'sep6';
      const srv = (protocol === 'sep24' ? t.transferServerSep24 : t.transferServerSep6)!;
      let info: Sep6Info | undefined;
      if (protocol === 'sep6') {
        try {
          info = await deps.sep6Info(srv);
        } catch (err) {
          throw new Error(`SEP-6 /info: ${msg(err)}`);
        }
      }
      const depositable = (code: string) => (info ? Boolean(info.deposit[code]) && info.deposit[code].enabled !== false : true);
      const c = target.asset_code
        ? t.currencies.find((x) => x.code === target.asset_code)
        : t.currencies.find((x) => depositable(x.code));
      if (!c) throw new Error(target.asset_code ? `stellar.toml lists no issuer for ${target.asset_code}` : 'no depositable asset with an issuer in stellar.toml');
      return {
        value: { toml: t, server: srv, sep6: info, currency: c },
        detail: `${protocol === 'sep24' ? 'SEP-24' : 'SEP-6'} transfer server and SEP-10 advertised; testing ${c.code}`,
      };
    });
    orgName = toml.orgName;
    assetLabel = `${currency.code}:${currency.issuer}`;

    const kp = await step('account', async () => {
      try {
        const k = await deps.createAccount();
        evidence.probe_account = k.publicKey();
        return { value: k, detail: `fresh testnet account ${short(k.publicKey())}, funded by Friendbot` };
      } catch (err) {
        throw new StepFailure(true, `Friendbot funding failed: ${msg(err)}`);
      }
    });

    await step('trustline', async () => {
      await deps.addTrustline(kp, currency.code, currency.issuer);
      return { value: undefined, detail: `trusts ${currency.code} from ${short(currency.issuer)}` };
    });

    const { token } = await step('sep10', async () => {
      const r = await deps.sep10(toml, kp);
      evidence.sep10_challenge = r.challenge;
      return { value: r, detail: 'challenge signed by the published SIGNING_KEY; token issued' };
    });

    // ---- Deposit: the anchor pays us.
    let depositId: string;
    if (protocol === 'sep24') {
      depositId = await step('deposit', async () => {
        const d = await deps.sep24Deposit!(server, token, currency.code, deps.depositAmount);
        const filled = await deps.sep24Interactive!(d.url, deps.depositAmount);
        if (!filled) throw new StepFailure(true, 'the interactive page did not render in our headless browser');
        return { value: d.id, detail: `interactive deposit of ${deps.depositAmount} ${currency.code} filled in` };
      });
    } else {
      depositId = await step('deposit', async () => {
        const min = sep6!.deposit[currency.code]?.min_amount;
        const amount = String(Math.max(Number(deps.depositAmount), Number(min ?? 0)));
        const d = await deps.sep6Deposit(server, token, {
          code: currency.code,
          account: kp.publicKey(),
          amount,
          type: transferType(sep6!.deposit, currency.code),
        });
        // The fiat leg: a sandbox lets a tester mark it as paid on more_info_url.
        const tx = await deps.getTransaction(server, token, d.id);
        const url = typeof tx.more_info_url === 'string' ? tx.more_info_url : undefined;
        const pressed = url ? await deps.sandbox(url) : undefined;
        if (!pressed) {
          throw new Error(
            'the deposit waits for an off-chain transfer, and its more_info_url offers no sandbox control to mark it as paid',
          );
        }
        return { value: d.id, detail: `deposit of ${amount} requested; the sandbox's "${pressed}" pressed` };
      });
    }
    evidence.deposit_transaction_id = depositId;

    const deposited = await step('deposit_settled', async () => {
      const tx = await deps.poll(server, token, depositId, (s) => TERMINAL.has(s));
      finalStatus = tx.status;
      if (tx.status !== 'completed') throw new Error(`the deposit ended "${tx.status}", not completed`);
      if (!tx.stellar_transaction_id) throw new Error('completed, but no stellar_transaction_id to check');
      return { value: tx, detail: 'completed', tx: tx.stellar_transaction_id };
    });

    const received = await step('deposit_onchain', async () => {
      const v = await deps.verify(deposited.stellar_transaction_id!, {
        asset: currency,
        to: kp.publicKey(),
        ...(toml.accounts.length ? { from: toml.accounts } : {}),
        ...(typeof deposited.amount_out === 'string' ? { amount: deposited.amount_out } : {}),
      });
      if (!v.ok) throw new Error(v.detail);
      evidence.deposit_stellar_transaction_id = deposited.stellar_transaction_id;
      return { value: v.amount ?? String(deposited.amount_out ?? ''), detail: `${v.detail}, paid to our account`, tx: deposited.stellar_transaction_id, amount: v.amount };
    });

    // ---- Withdrawal: we pay the anchor back.
    const w = sep6?.withdraw[currency.code];
    if (protocol === 'sep24') {
      skip('withdraw', 'SEP-24 withdrawal is interactive; this check deposits only');
    } else if (!w || w.enabled === false) {
      skip('withdraw', `the anchor does not offer SEP-6 withdrawal of ${currency.code}`);
    } else {
      const have = Number(await deps.balance(kp.publicKey(), currency.code, currency.issuer));
      const amount = floor7(Math.min(have, Number(received) || have));
      if (!(Number(amount) > 0) || (w.min_amount && Number(amount) < w.min_amount)) {
        skip('withdraw', `received ${amount || '0'} ${currency.code}, below its minimum withdrawal`);
      } else {
        const request = await step('withdraw', async () => {
          const r = await deps.sep6Withdraw(server, token, {
            code: currency.code,
            account: kp.publicKey(),
            amount,
            type: transferType(sep6!.withdraw, currency.code),
          });
          const hash = await deps.pay(kp, {
            destination: r.account_id,
            code: currency.code,
            issuer: currency.issuer,
            amount,
            ...(r.memo_type ? { memoType: r.memo_type } : {}),
            ...(r.memo !== undefined ? { memo: r.memo } : {}),
          });
          evidence.withdraw_transaction_id = r.id;
          evidence.withdraw_stellar_transaction_id = hash;
          return { value: { ...r, hash }, detail: `sent ${amount} ${currency.code} to ${short(r.account_id)} with memo ${r.memo ?? '(none)'}`, tx: hash, amount };
        });
        await step('withdraw_onchain', async () => {
          const v = await deps.verify(request.hash, { asset: currency, to: request.account_id, amount });
          if (!v.ok) throw new Error(v.detail);
          return { value: undefined, detail: `${v.detail}, paid to the anchor`, tx: request.hash };
        });
        await step('withdraw_settled', async () => {
          const tx = await deps.poll(server, token, request.id, (s) => TERMINAL.has(s));
          finalStatus = tx.status;
          if (tx.status !== 'completed') throw new Error(`the withdrawal ended "${tx.status}", not completed`);
          return { value: undefined, detail: 'the anchor saw our payment and completed the withdrawal' };
        });
      }
    }
    return out({ success: true, protocol, asset: assetLabel, final_transaction_status: finalStatus, orgName });
  } catch (err) {
    const inconclusive = err instanceof StepFailure && err.inconclusive;
    return out({
      success: false,
      inconclusive,
      ...(protocol ? { protocol } : {}),
      ...(assetLabel ? { asset: assetLabel } : {}),
      ...(orgName ? { orgName } : {}),
      final_transaction_status: finalStatus,
      error: msg(err),
    });
  }
}

