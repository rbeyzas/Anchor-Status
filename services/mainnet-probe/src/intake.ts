// The one always-on, internet-facing piece of the collector: takes an
// application from the dashboard's /api/onboarding proxy and appends it to
// that network's submissions.jsonl. POST / (or /mainnet) is a mainnet
// application, POST /testnet a testnet one: separate directories, separate
// queues, checked by separate services. It reads onboarding.json but never
// writes it, holds no key, and does no network I/O of its own.
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  appendSubmission,
  decideSubmission,
  loadOnboardingFile,
  normalizeDomainInput,
  readSubmissions,
} from './candidates.js';

export type Network = 'mainnet' | 'testnet';

export interface IntakeOptions {
  /** Each network's queue: its own submissions.jsonl and onboarding.json. */
  paths: Record<Network, { submissions: string; candidates: string }>;
  /** Shared with the dashboard: only its proxy may submit. */
  token: string;
  /** How soon a rejected domain may apply again, per network: a mainnet
   * anchor's age and payments change slowly, a testnet anchor being fixed
   * changes in minutes. */
  cooldownHours: Record<Network, number>;
  /** Unchecked applications beyond this are refused until the queue drains. */
  maxPending: number;
  /** Requests per client per window, the client as the proxy reports it. */
  perClient: { max: number; windowMs: number };
  now?: () => Date;
}

const MAX_BODY_BYTES = 2048;

function send(res: ServerResponse, status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function tokenMatches(given: string | string[] | undefined, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The body, or null past MAX_BODY_BYTES: the rest is discarded unread, and
 * the reply closes the connection. */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) resolve(null);
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export function createIntakeHandler(opts: IntakeOptions) {
  const now = opts.now ?? (() => new Date());
  const seen = new Map<string, number[]>();

  /** In memory only: no client address is ever written to disk. */
  function allow(client: string): { ok: true } | { ok: false; retryAfterS: number } {
    const t = now().getTime();
    const recent = (seen.get(client) ?? []).filter((x) => t - x < opts.perClient.windowMs);
    if (recent.length >= opts.perClient.max) {
      seen.set(client, recent);
      return { ok: false, retryAfterS: Math.ceil((recent[0] + opts.perClient.windowMs - t) / 1000) };
    }
    recent.push(t);
    seen.set(client, recent);
    if (seen.size > 10_000) seen.clear(); // bounded memory under a flood
    return { ok: true };
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://intake');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
      const network: Network | undefined =
        url.pathname === '/' || url.pathname === '/mainnet' ? 'mainnet' : url.pathname === '/testnet' ? 'testnet' : undefined;
      if (req.method !== 'POST' || !network) return send(res, 404, { error: 'not found' });
      const paths = opts.paths[network];
      if (!tokenMatches(req.headers['x-onboarding-token'], opts.token)) return send(res, 401, { error: 'unauthorized' });

      const clientHeader = req.headers['x-client-ip'];
      const client = (typeof clientHeader === 'string' && clientHeader.slice(0, 64)) || req.socket.remoteAddress || 'unknown';
      const gate = allow(client);
      if (!gate.ok) {
        return send(res, 429, { error: 'too many requests' }, { 'retry-after': String(gate.retryAfterS) });
      }

      const raw = await readBody(req);
      if (raw === null) return send(res, 413, { error: 'request too large' }, { connection: 'close' });
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: 'expected a JSON body' });
      }
      const domain = normalizeDomainInput((body as { domain?: unknown } | null)?.domain);
      if (!domain) return send(res, 400, { error: 'enter a plain domain name, like anchor.example.com' });

      const at = now();
      const file = loadOnboardingFile(paths.candidates);
      const submissions = readSubmissions(paths.submissions);
      const decision = decideSubmission(domain, file, submissions, at, opts.cooldownHours[network]);
      if (decision.kind === 'existing') return send(res, 200, { network, domain, status: decision.status });
      if (decision.kind === 'cooldown') {
        return send(res, 429, { network, domain, status: 'rejected', retry_after: decision.retry_after });
      }

      const readUpTo = file?.ingested_through ?? '';
      const pending =
        new Set(submissions.filter((s) => s.submitted_at > readUpTo).map((s) => s.domain)).size +
        (file?.candidates.filter((c) => c.status === 'received').length ?? 0);
      if (pending >= opts.maxPending) return send(res, 503, { error: 'the queue is full; try again in an hour' });

      appendSubmission(paths.submissions, { domain, submitted_at: at.toISOString() });
      return send(res, 202, { network, domain, status: 'received' });
    } catch (err) {
      console.error('[intake] error:', (err as Error).message);
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
    }
  };
}
