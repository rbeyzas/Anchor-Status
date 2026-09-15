export interface InteractiveDepositResponse {
  type: string;
  url: string;
  id: string;
}

export interface Sep24Transaction {
  id: string;
  status: string;
  status_eta?: number;
  more_info_url?: string;
}

/** Starts a real SEP-24 interactive deposit. Returns the interactive KYC/amount URL and transaction id. */
export async function initiateInteractiveDeposit(
  transferServerUrl: string,
  token: string,
  assetCode: string,
  amount: string,
): Promise<InteractiveDepositResponse> {
  // SEP-24's deposit/withdraw interactive endpoint is specified as
  // multipart/form-data (to allow optional file fields); testanchor.stellar.org
  // actually enforces this and 500s on x-www-form-urlencoded. Use FormData
  // and let fetch set the Content-Type (with boundary) itself.
  const body = new FormData();
  body.set('asset_code', assetCode);
  body.set('amount', amount);
  const res = await fetch(`${transferServerUrl.replace(/\/$/, '')}/transactions/deposit/interactive`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SEP-24 deposit/interactive failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as InteractiveDepositResponse;
}

export async function getTransactionStatus(
  transferServerUrl: string,
  token: string,
  id: string,
): Promise<Sep24Transaction> {
  const url = new URL(`${transferServerUrl.replace(/\/$/, '')}/transaction`);
  url.searchParams.set('id', id);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`SEP-24 /transaction status check failed: HTTP ${res.status}`);
  }
  const { transaction } = (await res.json()) as { transaction: Sep24Transaction };
  return transaction;
}

const TERMINAL_STATUSES = new Set([
  'completed',
  'refunded',
  'expired',
  'error',
  'no_market',
  'too_small',
  'too_large',
]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Polls /transaction until it reaches a terminal status or `timeoutMs` elapses. */
export async function pollUntilTerminal(
  transferServerUrl: string,
  token: string,
  id: string,
  intervalMs: number,
  timeoutMs: number,
): Promise<Sep24Transaction> {
  const deadline = Date.now() + timeoutMs;
  let last: Sep24Transaction | undefined;
  while (Date.now() < deadline) {
    last = await getTransactionStatus(transferServerUrl, token, id);
    if (isTerminalStatus(last.status)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (last) return last;
  throw new Error('Timed out waiting for SEP-24 transaction status');
}
