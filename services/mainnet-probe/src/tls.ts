import tls from 'node:tls';

/** Certificates this close to expiry fail the check: a renewal that has not
 * happened two weeks out is a renewal that may not happen in time. */
export const TLS_MIN_DAYS_LEFT = 14;

export interface TlsResult {
  ok: boolean;
  daysLeft?: number;
  error?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The verdict for one certificate, separate from the socket so it can be
 * tested with any certificate. */
export function tlsVerdict(authorized: boolean, authorizationError: string | undefined, validTo: string, now: Date): TlsResult {
  const daysLeft = Math.floor((Date.parse(validTo) - now.getTime()) / DAY_MS);
  if (!authorized) return { ok: false, daysLeft, error: authorizationError ?? 'certificate not trusted' };
  if (!(daysLeft >= TLS_MIN_DAYS_LEFT)) return { ok: false, daysLeft, error: `certificate expires in ${daysLeft} day(s)` };
  return { ok: true, daysLeft };
}

/** Opens a TLS connection to the domain and checks its certificate. */
export function checkTls(domain: string, timeoutMs: number, now: () => Date = () => new Date()): Promise<TlsResult> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: domain, port: 443, servername: domain, rejectUnauthorized: false, timeout: timeoutMs });
    const done = (r: TlsResult) => {
      socket.destroy();
      resolve(r);
    };
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert?.valid_to) return done({ ok: false, error: 'no certificate presented' });
      const authError = socket.authorizationError ? String(socket.authorizationError) : undefined;
      done(tlsVerdict(socket.authorized, authError, cert.valid_to, now()));
    });
    socket.once('timeout', () => done({ ok: false, error: `no TLS handshake within ${timeoutMs} ms` }));
    socket.once('error', (err) => done({ ok: false, error: err.message }));
  });
}
