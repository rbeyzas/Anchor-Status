export interface Timed<T> {
  value: T;
  ms: number;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    body: string,
  ) {
    super(`HTTP ${status} from ${url}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
}

export type Fetch = typeof fetch;

/** fetch with a hard timeout, returning the elapsed time. Non-2xx throws
 * HttpError so callers can tell "the anchor answered no" from "the anchor
 * didn't answer". */
export async function timedFetch(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Timed<Response>> {
  const started = Date.now();
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new HttpError(res.status, url, await res.text().catch(() => ''));
  }
  return { value: res, ms: Date.now() - started };
}
