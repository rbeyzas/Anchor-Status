// A small testnet anchor we control, so the claim and dispute flows have
// an anchor whose stellar.toml and SIGNING_KEY are ours. It is measured like
// any other: testnet-probe signs in (SEP-10), deposits and withdraws (SEP-6),
// and checks every payment on the ledger.
//
//   GET  /.well-known/stellar.toml
//   GET  /auth?account=G...            SEP-10 challenge
//   POST /auth {transaction}           SEP-10 token
//   GET  /sep6/info
//   GET  /sep6/deposit?asset_code&account&amount        (token)
//   GET  /sep6/withdraw?asset_code&account&amount       (token)
//   GET  /sep6/transaction?id                           (token)
//   GET  /sep6/more_info?id            the sandbox page: "Simulate incoming transfer"
//   POST /sep6/more_info               pays the deposit out
//
// There is no fiat: a deposit is paid out when the sandbox button is
// pressed, and a withdrawal completes once its payment, with its memo, is
// on the ledger.
import crypto from 'node:crypto';
import { Keypair, WebAuth } from '@stellar/stellar-sdk';

export interface AnchorConfig {
  /** e.g. ref1.monarank.xyz */
  homeDomain: string;
  networkPassphrase: string;
  signingKey: Keypair;
  /** Holds the asset: pays deposits out and receives withdrawals. */
  distribution: string;
  assetCode: string;
  issuer: string;
  /** HMAC key for the SEP-10 JWTs. */
  jwtSecret: string;
  orgName: string;
  minAmount: number;
  maxAmount: number;
}

export interface Chain {
  /** Sends `amount` of the asset from the distribution account to `to`; returns the tx hash. */
  pay(to: string, amount: string): Promise<string>;
  /** A payment of `amount` of the asset to the distribution account with this text memo, if one is on the ledger. */
  findPayment(memo: string, amount: string): Promise<{ hash: string; from: string } | undefined>;
}

type Status = 'pending_user_transfer_start' | 'pending_anchor' | 'completed' | 'error';

interface Transfer {
  id: string;
  kind: 'deposit' | 'withdrawal';
  status: Status;
  account: string;
  amount: string;
  started_at: string;
  completed_at?: string;
  stellar_transaction_id?: string;
  /** Withdrawal memo the payment must carry. */
  memo?: string;
}

export interface Request {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: string;
}

export interface Response {
  status: number;
  headers?: Record<string, string>;
  body: string;
}

const JSON_HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
const json = (status: number, value: unknown): Response => ({ status, headers: JSON_HEADERS, body: JSON.stringify(value) });
const error = (status: number, message: string) => json(status, { error: message });
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const TOKEN_SECONDS = 24 * 60 * 60;
// Transfers are kept in memory; a restart drops the ones in flight, which
// fails at most one probe round.
// ponytail: in-memory store, persist to a volume if transfers must survive restarts
const KEEP_MS = 2 * 24 * 60 * 60 * 1000;

export function createAnchor(cfg: AnchorConfig, chain: Chain, now: () => Date = () => new Date()) {
  const transfers = new Map<string, Transfer>();
  const base = `https://${cfg.homeDomain}`;
  const asset = { code: cfg.assetCode, issuer: cfg.issuer };

  function sign(sub: string): string {
    const iat = Math.floor(now().getTime() / 1000);
    const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ iss: `${base}/auth`, sub, iat, exp: iat + TOKEN_SECONDS }));
    const mac = crypto.createHmac('sha256', cfg.jwtSecret).update(`${head}.${body}`).digest();
    return `${head}.${body}.${b64url(mac)}`;
  }

  /** The account a valid bearer token was issued to. */
  function account(req: Request): string | undefined {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const [head, body, mac] = token?.split('.') ?? [];
    if (!head || !body || !mac) return undefined;
    const want = crypto.createHmac('sha256', cfg.jwtSecret).update(`${head}.${body}`).digest();
    const got = Buffer.from(mac, 'base64url');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return undefined;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as { sub?: string; exp?: number };
    return claims.exp && claims.exp * 1000 > now().getTime() ? claims.sub : undefined;
  }

  function prune() {
    const cutoff = now().getTime() - KEEP_MS;
    for (const [id, t] of transfers) if (Date.parse(t.started_at) < cutoff) transfers.delete(id);
  }

  function view(t: Transfer) {
    return {
      id: t.id,
      kind: t.kind,
      status: t.status,
      amount_in: t.amount,
      amount_out: t.amount,
      amount_fee: '0',
      started_at: t.started_at,
      ...(t.completed_at ? { completed_at: t.completed_at } : {}),
      ...(t.stellar_transaction_id ? { stellar_transaction_id: t.stellar_transaction_id } : {}),
      more_info_url: `${base}/sep6/more_info?id=${t.id}`,
      ...(t.kind === 'withdrawal' ? { withdraw_anchor_account: cfg.distribution, withdraw_memo_type: 'text', withdraw_memo: t.memo } : {}),
    };
  }

  /** The request's asset, account and amount, or why they are not acceptable. */
  function transferParams(req: Request, who: string): { amount: string } | Response {
    if (req.query.get('asset_code') !== cfg.assetCode) return error(400, `only ${cfg.assetCode} is offered`);
    if ((req.query.get('account') ?? who) !== who) return error(403, 'account does not match the token');
    const amount = Number(req.query.get('amount') ?? cfg.minAmount);
    if (!Number.isFinite(amount) || amount < cfg.minAmount || amount > cfg.maxAmount) {
      return error(400, `amount must be between ${cfg.minAmount} and ${cfg.maxAmount}`);
    }
    return { amount: (Math.round(amount * 1e7) / 1e7).toString() };
  }

  function newTransfer(kind: Transfer['kind'], who: string, amount: string): Transfer {
    prune();
    const t: Transfer = {
      id: crypto.randomUUID(),
      kind,
      status: 'pending_user_transfer_start',
      account: who,
      amount,
      started_at: now().toISOString(),
      // A text memo is at most 28 bytes.
      ...(kind === 'withdrawal' ? { memo: crypto.randomBytes(12).toString('hex') } : {}),
    };
    transfers.set(t.id, t);
    return t;
  }

  const toml = [
    '# Reference anchor run by MonaRank, on the Stellar testnet: measured like any',
    '# other anchor, and the one the operator claim and dispute flows are shown on.',
    `NETWORK_PASSPHRASE = "${cfg.networkPassphrase}"`,
    `SIGNING_KEY = "${cfg.signingKey.publicKey()}"`,
    `WEB_AUTH_ENDPOINT = "${base}/auth"`,
    `TRANSFER_SERVER = "${base}/sep6"`,
    `ACCOUNTS = ["${cfg.distribution}"]`,
    '',
    '[DOCUMENTATION]',
    `ORG_NAME = "${cfg.orgName}"`,
    'ORG_URL = "https://monarank.xyz"',
    '',
    '[[CURRENCIES]]',
    `code = "${cfg.assetCode}"`,
    `issuer = "${cfg.issuer}"`,
    'is_asset_anchored = false',
    'status = "test"',
    'desc = "Test asset of the MonaRank reference anchor. It has no value."',
    '',
  ].join('\n');

  async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type' }, body: '' };
    }
    const route = `${req.method} ${req.path.replace(/\/$/, '') || '/'}`;
    switch (route) {
      case 'GET /.well-known/stellar.toml':
        return { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' }, body: toml };

      case 'GET /auth': {
        const client = req.query.get('account') ?? '';
        try {
          Keypair.fromPublicKey(client);
        } catch {
          return error(400, 'account must be a Stellar public key');
        }
        const transaction = WebAuth.buildChallengeTx(
          cfg.signingKey,
          client,
          cfg.homeDomain,
          300,
          cfg.networkPassphrase,
          cfg.homeDomain,
        );
        return json(200, { transaction, network_passphrase: cfg.networkPassphrase });
      }

      case 'POST /auth': {
        let xdr: string | undefined;
        try {
          xdr = (JSON.parse(req.body || '{}') as { transaction?: string }).transaction;
        } catch {
          xdr = new URLSearchParams(req.body).get('transaction') ?? undefined;
        }
        if (!xdr) return error(400, 'transaction is required');
        try {
          const { clientAccountID } = WebAuth.readChallengeTx(
            xdr,
            cfg.signingKey.publicKey(),
            cfg.networkPassphrase,
            cfg.homeDomain,
            cfg.homeDomain,
          );
          // The client's own key must have signed; an account that does not
          // exist yet is signed for by its master key.
          WebAuth.verifyChallengeTxSigners(
            xdr,
            cfg.signingKey.publicKey(),
            cfg.networkPassphrase,
            [clientAccountID],
            cfg.homeDomain,
            cfg.homeDomain,
          );
          return json(200, { token: sign(clientAccountID) });
        } catch (err) {
          return error(400, `invalid challenge: ${(err as Error).message}`);
        }
      }

      case 'GET /sep6/info':
        return json(200, {
          deposit: { [cfg.assetCode]: { enabled: true, authentication_required: true, min_amount: cfg.minAmount, max_amount: cfg.maxAmount, fee_fixed: 0 } },
          withdraw: { [cfg.assetCode]: { enabled: true, authentication_required: true, min_amount: cfg.minAmount, max_amount: cfg.maxAmount, fee_fixed: 0, types: { bank_account: { fields: {} } } } },
          fee: { enabled: false },
          transactions: { enabled: false },
          transaction: { enabled: true, authentication_required: true },
          features: { account_creation: false, claimable_balances: false },
        });

      case 'GET /sep6/deposit':
      case 'GET /sep6/withdraw': {
        const who = account(req);
        if (!who) return error(403, 'a valid SEP-10 token is required');
        const p = transferParams(req, who);
        if ('status' in p) return p;
        if (route === 'GET /sep6/deposit') {
          const t = newTransfer('deposit', who, p.amount);
          return json(200, {
            id: t.id,
            how: `Testnet sandbox: there is no real transfer. Open ${base}/sep6/more_info?id=${t.id} and press "Simulate incoming transfer".`,
            instructions: {},
            eta: 30,
            min_amount: cfg.minAmount,
            max_amount: cfg.maxAmount,
            fee_fixed: 0,
          });
        }
        const t = newTransfer('withdrawal', who, p.amount);
        return json(200, { id: t.id, account_id: cfg.distribution, memo_type: 'text', memo: t.memo, eta: 30, min_amount: cfg.minAmount, max_amount: cfg.maxAmount, fee_fixed: 0 });
      }

      case 'GET /sep6/transaction': {
        const who = account(req);
        if (!who) return error(403, 'a valid SEP-10 token is required');
        const t = transfers.get(req.query.get('id') ?? '');
        if (!t || t.account !== who) return error(404, 'no such transaction');
        // A withdrawal completes once its payment is on the ledger.
        if (t.kind === 'withdrawal' && t.status === 'pending_user_transfer_start') {
          const paid = await chain.findPayment(t.memo!, t.amount);
          if (paid && paid.from === t.account) {
            Object.assign(t, { status: 'completed', stellar_transaction_id: paid.hash, completed_at: now().toISOString() });
          }
        }
        return json(200, { transaction: view(t) });
      }

      case 'GET /sep6/more_info': {
        const t = transfers.get(req.query.get('id') ?? '');
        if (!t) return { status: 404, headers: { 'content-type': 'text/html' }, body: '<p>No such transaction.</p>' };
        const pending = t.kind === 'deposit' && t.status === 'pending_user_transfer_start';
        return {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: [
            '<!doctype html><meta charset="utf-8"><title>MonaRank reference anchor</title>',
            `<h1>${t.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} ${t.id}</h1>`,
            `<p>${t.amount} ${cfg.assetCode} (testnet, no value). Status: ${t.status}.</p>`,
            t.stellar_transaction_id ? `<p>Stellar transaction: ${t.stellar_transaction_id}</p>` : '',
            pending
              ? `<form method="post" action="${base}/sep6/more_info"><input type="hidden" name="id" value="${t.id}"><button type="submit">Simulate incoming transfer</button></form>`
              : '',
          ].join('\n'),
        };
      }

      case 'POST /sep6/more_info': {
        const t = transfers.get(new URLSearchParams(req.body).get('id') ?? '');
        if (!t || t.kind !== 'deposit') return { status: 404, headers: { 'content-type': 'text/html' }, body: '<p>No such deposit.</p>' };
        if (t.status === 'pending_user_transfer_start') {
          // Marked before paying, so a second press cannot pay twice.
          t.status = 'pending_anchor';
          try {
            t.stellar_transaction_id = await chain.pay(t.account, t.amount);
            t.completed_at = now().toISOString();
            t.status = 'completed';
          } catch (err) {
            t.status = 'error';
            console.error(`[reference-anchor] deposit ${t.id} payout failed: ${(err as Error).message}`);
          }
        }
        return { status: 303, headers: { location: `${base}/sep6/more_info?id=${t.id}` }, body: '' };
      }

      default:
        return error(404, 'not found');
    }
  }

  return { handle, asset };
}
