// An anchor saying "completed" is a claim; the payment on the ledger is the
// fact. Reads the transaction from Horizon and checks it moved the asset
// where it should.
const TIMEOUT_MS = 20_000;

export interface PaymentCheck {
  asset: { code: string; issuer: string };
  to: string;
  /** Senders that count (the anchor's accounts); empty: anyone. */
  from?: string[];
  /** Expected amount, when known exactly. */
  amount?: string;
}

export interface VerifiedPayment {
  ok: boolean;
  detail: string;
  amount?: string;
  from?: string;
}

interface Transfer {
  type?: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_code?: string;
  asset_issuer?: string;
}

interface Operation extends Transfer {
  type: string;
  transaction_successful?: boolean;
  /** A Soroban call's effect on classic assets (a Stellar Asset Contract
   * transfer or mint): how anchors paying from a contract show up. */
  asset_balance_changes?: Transfer[];
}

const same = (a: string, b: string) => Math.abs(Number(a) - Number(b)) < 1e-7;

export function checkOperations(ops: Operation[], want: PaymentCheck): VerifiedPayment {
  if (ops.some((o) => o.transaction_successful === false)) return { ok: false, detail: 'the transaction failed on the ledger' };
  const matches = (t: Transfer) => t.to === want.to && t.asset_code === want.asset.code && t.asset_issuer === want.asset.issuer;
  const transfers: Transfer[] = ops.flatMap((o) => [
    ...(o.type === 'payment' || o.type.startsWith('path_payment') ? [o] : []),
    ...(o.type === 'invoke_host_function' ? (o.asset_balance_changes ?? []).filter((c) => c.type === 'transfer' || c.type === 'mint') : []),
  ]);
  const pay = transfers.find(matches);
  if (!pay) return { ok: false, detail: `no payment of ${want.asset.code} to ${want.to.slice(0, 4)}…${want.to.slice(-4)} in the transaction` };
  if (want.amount && pay.amount && !same(pay.amount, want.amount)) {
    return { ok: false, detail: `paid ${pay.amount}, not the ${want.amount} reported`, amount: pay.amount };
  }
  // SEP-1's ACCOUNTS is optional and often incomplete (the reference anchor
  // pays from an account it does not list): said, not failed.
  const sender = pay.from
    ? want.from?.length && !want.from.includes(pay.from)
      ? ` from ${pay.from.slice(0, 4)}…${pay.from.slice(-4)} (not in its stellar.toml ACCOUNTS)`
      : ` from ${pay.from.slice(0, 4)}…${pay.from.slice(-4)}`
    : '';
  return { ok: true, detail: `${pay.amount} ${want.asset.code} on the ledger${sender}`, ...(pay.amount ? { amount: pay.amount } : {}), ...(pay.from ? { from: pay.from } : {}) };
}

export async function verifyPayment(horizonUrl: string, txHash: string, want: PaymentCheck): Promise<VerifiedPayment> {
  if (!/^[0-9a-f]{64}$/i.test(txHash)) return { ok: false, detail: `"${txHash.slice(0, 20)}" is not a transaction hash` };
  const res = await fetch(`${horizonUrl}/transactions/${txHash}/operations?limit=200`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return { ok: false, detail: 'the reported transaction is not on the testnet ledger' };
  if (!res.ok) throw new Error(`Horizon answered HTTP ${res.status}`);
  const ops = ((await res.json()) as { _embedded?: { records?: Operation[] } })._embedded?.records ?? [];
  return checkOperations(ops, want);
}
