// Onboarding fetches from a domain anyone can submit, from a host that also
// holds our signing keys: a name resolving into a private network must never
// be fetched. (DNS could change between this check and the fetch; this stops
// the plain case, and nothing here is fetched with credentials.)
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function v4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Loopback, private, link-local, CGNAT, multicast and reserved ranges. */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return v4Private(ip);
  if (family !== 6) return true;
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  return (
    v6 === '::' ||
    v6 === '::1' ||
    /^f[cd]/.test(v6) || // unique local
    /^fe[89ab]/.test(v6) || // link-local
    v6.startsWith('ff') // multicast
  );
}

export type Resolver = (host: string) => Promise<string[]>;

const systemResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Every address the name resolves to is public; false when it resolves to
 * nothing, or to any private one. */
export async function resolvesToPublicAddress(host: string, resolve: Resolver = systemResolver): Promise<boolean> {
  try {
    const addresses = await resolve(host);
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a));
  } catch {
    return false;
  }
}
