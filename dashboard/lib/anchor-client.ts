'use client';

import { Asset, Horizon, Memo, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { parse as parseToml } from 'smol-toml';

/**
 * Browser-side SEP-1 / SEP-10 / SEP-24 client. Every signature comes from the
 * user's own wallet via the `sign` callback (Stellar Wallets Kit) — this file
 * never sees a secret key.
 *
 * References: skills/standards/SKILL.md (SEP-1/10/24 selection) and
 * skills/dapp/SKILL.md (wallet signing, transaction building/submission).
 */

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';
const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

export type SignFn = (xdr: string) => Promise<string>;

export interface AnchorToml {
  webAuthEndpoint: string;
  signingKey: string;
  transferServerSep24: string;
  currencies: Array<{ code: string; issuer?: string }>;
}

export interface Sep24Transaction {
  id: string;
  kind: 'deposit' | 'withdrawal';
  status: string;
  amount_in?: string;
  amount_out?: string;
  more_info_url?: string;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: 'text' | 'id' | 'hash';
  stellar_transaction_id?: string;
  message?: string;
}

export const TERMINAL_STATUSES = new Set(['completed', 'refunded', 'expired', 'error', 'no_market', 'too_small', 'too_large']);

export async function fetchToml(domain: string): Promise<AnchorToml> {
  const res = await fetch(`https://${domain}/.well-known/stellar.toml`, { headers: { Accept: '*/*' } });
  if (!res.ok) throw new Error(`Could not reach ${domain} (HTTP ${res.status})`);
  const parsed = parseToml(await res.text()) as Record<string, unknown>;
  const webAuthEndpoint = parsed.WEB_AUTH_ENDPOINT as string | undefined;
  const signingKey = parsed.SIGNING_KEY as string | undefined;
  const transferServerSep24 = parsed.TRANSFER_SERVER_SEP0024 as string | undefined;
  if (!webAuthEndpoint || !signingKey || !transferServerSep24) {
    throw new Error(`${domain} does not support SEP-10 + SEP-24`);
  }
  const currencies = ((parsed.CURRENCIES as Array<Record<string, unknown>> | undefined) ?? []).map((c) => ({
    code: String(c.code),
    issuer: typeof c.issuer === 'string' ? c.issuer : undefined,
  }));
  return { webAuthEndpoint, signingKey, transferServerSep24, currencies };
}

/** SEP-10: fetch the challenge, check the anchor signed it and that it is
 * addressed to the user, have the wallet co-sign, exchange for a JWT. */
export async function authenticate(toml: AnchorToml, account: string, sign: SignFn): Promise<string> {
  const url = new URL(toml.webAuthEndpoint);
  url.searchParams.set('account', account);
  const challengeRes = await fetch(url);
  if (!challengeRes.ok) throw new Error(`Anchor login failed (HTTP ${challengeRes.status})`);
  const { transaction, network_passphrase } = (await challengeRes.json()) as {
    transaction: string;
    network_passphrase?: string;
  };

  const tx = new Transaction(transaction, network_passphrase ?? NETWORK_PASSPHRASE);
  if (tx.source !== toml.signingKey) {
    throw new Error('Login challenge was not issued by this anchor — refusing to sign');
  }
  if (tx.operations[0]?.source !== account) {
    throw new Error('Login challenge is not addressed to your account — refusing to sign');
  }

  const signed = await sign(transaction);
  const tokenRes = await fetch(toml.webAuthEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signed }),
  });
  if (!tokenRes.ok) throw new Error(`Anchor rejected the login signature (HTTP ${tokenRes.status})`);
  return ((await tokenRes.json()) as { token: string }).token;
}

export function resolveAsset(toml: AnchorToml, assetCode: string): Asset {
  if (assetCode === 'native' || assetCode === 'XLM') return Asset.native();
  const currency = toml.currencies.find((c) => c.code === assetCode && c.issuer);
  if (!currency?.issuer) throw new Error(`Anchor does not publish an issuer for ${assetCode}`);
  return new Asset(assetCode, currency.issuer);
}

const horizon = () => new Horizon.Server(HORIZON_URL);

export async function accountExists(account: string): Promise<boolean> {
  try {
    await horizon().loadAccount(account);
    return true;
  } catch {
    return false;
  }
}

export async function getBalance(account: string, asset: Asset): Promise<string | null> {
  const acc = await horizon().loadAccount(account);
  const line = acc.balances.find((b) =>
    asset.isNative()
      ? b.asset_type === 'native'
      : 'asset_code' in b && b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer(),
  );
  return line ? line.balance : null;
}

/** A wallet can only receive an anchored asset after opening a trustline to it. */
export async function ensureTrustline(account: string, asset: Asset, sign: SignFn): Promise<boolean> {
  if (asset.isNative() || (await getBalance(account, asset)) !== null) return false;
  const source = await horizon().loadAccount(account);
  const tx = new TransactionBuilder(source, { fee: '1000', networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(180)
    .build();
  await submit(await sign(tx.toXDR()));
  return true;
}

async function submit(signedXdr: string) {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  return horizon().submitTransaction(tx);
}

/** SEP-24 /info: per-asset min/max so we can reject a bad amount before the
 * user signs anything. */
export async function getLimits(
  toml: AnchorToml,
  kind: 'deposit' | 'withdraw',
  assetCode: string,
): Promise<{ min?: number; max?: number }> {
  const res = await fetch(`${toml.transferServerSep24.replace(/\/$/, '')}/info`);
  if (!res.ok) return {};
  const info = (await res.json()) as Record<string, Record<string, { min_amount?: number; max_amount?: number }>>;
  const entry = info[kind]?.[assetCode];
  return { min: entry?.min_amount, max: entry?.max_amount };
}

export async function startInteractive(
  toml: AnchorToml,
  token: string,
  kind: 'deposit' | 'withdraw',
  assetCode: string,
  account: string,
  amount?: string,
): Promise<{ url: string; id: string }> {
  const body = new FormData();
  body.set('asset_code', assetCode);
  body.set('account', account);
  if (amount) body.set('amount', amount);
  const res = await fetch(`${toml.transferServerSep24.replace(/\/$/, '')}/transactions/${kind}/interactive`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error(`Anchor could not start the ${kind} (HTTP ${res.status}): ${await res.text()}`);
  return (await res.json()) as { url: string; id: string };
}

export async function getTransaction(toml: AnchorToml, token: string, id: string): Promise<Sep24Transaction> {
  const res = await fetch(`${toml.transferServerSep24.replace(/\/$/, '')}/transaction?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not read transaction status (HTTP ${res.status})`);
  return ((await res.json()) as { transaction: Sep24Transaction }).transaction;
}

/** SEP-24 withdrawal, step 2: once the anchor is `pending_user_transfer_start`
 * the user sends the asset to the anchor's account with the given memo. */
export async function payWithdrawal(account: string, asset: Asset, tx: Sep24Transaction, sign: SignFn): Promise<string> {
  if (!tx.withdraw_anchor_account || !tx.amount_in) {
    throw new Error('Anchor did not provide a withdrawal destination yet');
  }
  const source = await horizon().loadAccount(account);
  let builder = new TransactionBuilder(source, { fee: '1000', networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: tx.withdraw_anchor_account, asset, amount: tx.amount_in }))
    .setTimeout(180);
  if (tx.withdraw_memo) {
    const memo =
      tx.withdraw_memo_type === 'id'
        ? Memo.id(tx.withdraw_memo)
        : tx.withdraw_memo_type === 'hash'
          ? Memo.hash(base64ToHex(tx.withdraw_memo))
          : Memo.text(tx.withdraw_memo);
    builder = builder.addMemo(memo);
  }
  const result = await submit(await sign(builder.build().toXDR()));
  return result.hash;
}

function base64ToHex(b64: string): string {
  return Array.from(atob(b64), (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

export async function fundWithFriendbot(account: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(account)}`);
  if (!res.ok) throw new Error(`Friendbot funding failed (HTTP ${res.status})`);
}
