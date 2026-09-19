import { describe, expect, it } from 'vitest';
import { tlsVerdict } from './tls.js';

const now = new Date('2026-09-19T00:00:00Z');

describe('tlsVerdict', () => {
  it('passes a trusted certificate with time left', () => {
    expect(tlsVerdict(true, undefined, 'Dec 18 00:00:00 2026 GMT', now)).toEqual({ ok: true, daysLeft: 90 });
  });

  it('fails a certificate expiring within two weeks', () => {
    expect(tlsVerdict(true, undefined, 'Sep 29 00:00:00 2026 GMT', now)).toMatchObject({ ok: false, daysLeft: 10 });
  });

  it('fails an untrusted certificate however long it is valid', () => {
    expect(tlsVerdict(false, 'SELF_SIGNED_CERT_IN_CHAIN', 'Dec 18 00:00:00 2027 GMT', now)).toMatchObject({
      ok: false,
      error: 'SELF_SIGNED_CERT_IN_CHAIN',
    });
  });

  it('fails an expired certificate', () => {
    expect(tlsVerdict(true, undefined, 'Sep 01 00:00:00 2026 GMT', now)).toMatchObject({ ok: false, daysLeft: -18 });
  });
});
