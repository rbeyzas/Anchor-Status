// Every request names the probe and how to reach us (SOW 3.1), so an
// anchor's operator who finds us in their logs can write instead of
// blocking an unknown bot. Installed on the global fetch, so every call
// site carries it, including ones added later. Imported first by config.ts.
export const USER_AGENT = 'MonaRank-probe/1.0 (+https://monarank.xyz; monarank@protonmail.com)';

/** `f`, with USER_AGENT added to every request that doesn't set its own. */
export function withUserAgent(f: typeof fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('user-agent')) headers.set('user-agent', USER_AGENT);
    return f(input, { ...init, headers });
  };
}

globalThis.fetch = withUserAgent(globalThis.fetch);
