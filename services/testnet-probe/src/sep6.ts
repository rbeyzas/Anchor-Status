// SEP-6 (non-interactive) deposit and withdrawal, against a testnet anchor.
// The deposit's off-chain leg (a fiat transfer to the anchor) cannot happen
// on testnet; sandboxes let a tester mark it as paid on the transaction's
// more_info_url, and completeSandboxLeg does exactly what that tester would.
const TIMEOUT_MS = 20_000;

const base = (server: string) => server.replace(/\/$/, '');

async function getJson(url: URL | string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${String(url).split('?')[0]}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`not JSON from ${String(url).split('?')[0]}`);
  }
}

type Side = Record<string, { enabled?: boolean; min_amount?: number; fields?: Record<string, { choices?: string[] }>; types?: Record<string, unknown>; funding_methods?: string[] }>;

export interface Sep6Info {
  deposit: Side;
  withdraw: Side;
}

export async function getSep6Info(server: string): Promise<Sep6Info> {
  const res = await fetch(`${base(server)}/info`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`SEP-6 /info answered HTTP ${res.status}`);
  const info = (await res.json()) as Partial<Sep6Info>;
  return { deposit: info.deposit ?? {}, withdraw: info.withdraw ?? {} };
}

/** The `type` a deposit or withdrawal of `code` needs, when /info names one. */
export function transferType(side: Side, code: string): string | undefined {
  const a = side[code];
  return a?.fields?.type?.choices?.[0] ?? Object.keys(a?.types ?? {})[0] ?? a?.funding_methods?.[0];
}

export interface Sep6Deposit {
  id: string;
  how?: string;
}

export async function requestDeposit(
  server: string,
  token: string,
  p: { code: string; account: string; amount: string; type?: string },
): Promise<Sep6Deposit> {
  const url = new URL(`${base(server)}/deposit`);
  url.search = new URLSearchParams({ asset_code: p.code, account: p.account, amount: p.amount, ...(p.type ? { type: p.type } : {}) }).toString();
  const body = await getJson(url, token);
  if (typeof body.id !== 'string') throw new Error('SEP-6 deposit answered without a transaction id');
  return { id: body.id, ...(typeof body.how === 'string' ? { how: body.how } : {}) };
}

export interface Sep6Withdraw {
  id: string;
  account_id: string;
  memo_type?: string;
  memo?: string;
}

export async function requestWithdraw(
  server: string,
  token: string,
  p: { code: string; account: string; amount: string; type?: string },
): Promise<Sep6Withdraw> {
  const url = new URL(`${base(server)}/withdraw`);
  url.search = new URLSearchParams({ asset_code: p.code, account: p.account, amount: p.amount, ...(p.type ? { type: p.type } : {}) }).toString();
  const body = await getJson(url, token);
  if (typeof body.id !== 'string' || typeof body.account_id !== 'string') {
    throw new Error('SEP-6 withdraw answered without an id and an account to pay');
  }
  return {
    id: body.id,
    account_id: body.account_id,
    ...(typeof body.memo_type === 'string' ? { memo_type: body.memo_type } : {}),
    ...(body.memo !== undefined && body.memo !== null ? { memo: String(body.memo) } : {}),
  };
}

// A sandbox's own control for the fiat leg: "Simulate incoming transfer",
// "Mark as paid", "I have sent the payment"... Anything else on the page is
// never pressed.
const SANDBOX_ACTION = /simulat|mark\b[^<]{0,20}\b(paid|received|sent|complete)|i\s*(have|'ve)\s*(paid|sent)|confirm\s+(the\s+)?(payment|transfer|deposit)/i;

export interface SandboxForm {
  action: string;
  fields: Record<string, string>;
  label: string;
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

/** The POST form on a more_info_url page whose button marks the fiat leg as
 * paid, with its hidden fields. Only forms posting to the page's own host. */
export function findSandboxForm(html: string, pageUrl: string): SandboxForm | undefined {
  const page = new URL(pageUrl);
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const [, open, inner] = m;
    if ((attr(open, 'method') ?? 'get').toLowerCase() !== 'post') continue;
    const buttons = [...inner.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((b) => b[1].replace(/<[^>]+>/g, '').trim());
    const inputs = [...inner.matchAll(/<input\b[^>]*>/gi)].map((i) => i[0]);
    const submitValues = inputs.filter((i) => /type\s*=\s*["']submit/i.test(i)).map((i) => attr(i, 'value') ?? '');
    const label = [...buttons, ...submitValues].find((t) => SANDBOX_ACTION.test(t));
    if (!label) continue;
    const action = new URL(attr(open, 'action') ?? page.pathname, page);
    if (action.host !== page.host || action.protocol !== 'https:') continue;
    const fields: Record<string, string> = {};
    for (const i of inputs) {
      const name = attr(i, 'name');
      if (name && /type\s*=\s*["']hidden/i.test(i)) fields[name] = attr(i, 'value') ?? '';
    }
    return { action: action.toString(), fields, label };
  }
  return undefined;
}

/** Presses the sandbox's "the fiat has arrived" control, if its page has
 * one. Returns what was pressed, or undefined when there is none. */
export async function completeSandboxLeg(moreInfoUrl: string): Promise<string | undefined> {
  const page = await fetch(moreInfoUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!page.ok) throw new Error(`more_info_url answered HTTP ${page.status}`);
  const form = findSandboxForm(await page.text(), page.url || moreInfoUrl);
  if (!form) return undefined;
  const res = await fetch(form.action, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form.fields).toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status >= 400) throw new Error(`the sandbox control "${form.label}" answered HTTP ${res.status}`);
  return form.label;
}
