// What /api/onboarding does: validate, then forward to the collector's
// intake. Server-side only: the intake's address and the token it requires
// never reach the browser.
import { normalizeDomainInput } from './onboarding';

export interface ProxyOptions {
  intakeUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });

const NOT_OPEN = 'Applications are not open yet.';

export async function handleApplication(request: Request, opts: ProxyOptions): Promise<Response> {
  if (!opts.intakeUrl || !opts.token) return json(503, { error: NOT_OPEN });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Expected a JSON body.' });
  }
  const domain = normalizeDomainInput((body as { domain?: unknown } | null)?.domain);
  if (!domain) return json(400, { error: 'Enter a plain domain name, like anchor.example.com.' });

  // The intake limits requests per client; behind this proxy it would see
  // only our own address, so the caller's is passed on (never stored).
  const client = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';

  try {
    const res = await (opts.fetchImpl ?? fetch)(opts.intakeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-onboarding-token': opts.token, 'x-client-ip': client },
      body: JSON.stringify({ domain }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // A wrong token is our misconfiguration, not the applicant's problem.
    if (res.status === 401) {
      console.error('[onboarding] the intake refused our token: ONBOARDING_INTAKE_TOKEN differs from the collector’s');
      return json(503, { error: NOT_OPEN });
    }
    const retry = res.headers.get('retry-after');
    return json(res.status, payload, retry ? { 'retry-after': retry } : {});
  } catch {
    return json(502, { error: 'The collector did not answer. Try again in a few minutes.' });
  }
}
