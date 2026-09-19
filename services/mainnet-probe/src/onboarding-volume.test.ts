import { describe, expect, it } from 'vitest';
import { assetPaymentCount } from './onboarding-volume.js';
import { isPrivateAddress, resolvesToPublicAddress } from './public-host.js';

const ISSUER = 'GDYSPBVZHPQTYMGSYNOHRZQNLB3ZWFVQ2F7EP7YBOLRGD42XIC3QUX5G';

function expert(status: number, body: unknown) {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

describe('assetPaymentCount', () => {
  it('reads StellarExpert\'s payment count for CODE-ISSUER', async () => {
    const { fetchImpl, urls } = expert(200, { asset: `CLPX-${ISSUER}-1`, payments: 530674, trades: 901874 });
    expect(await assetPaymentCount(fetchImpl, 'CLPX', ISSUER, 1000, 'https://expert.test')).toBe(530674);
    expect(urls).toEqual([`https://expert.test/asset/CLPX-${ISSUER}`]);
  });

  it('counts an asset StellarExpert has never seen as zero', async () => {
    const { fetchImpl } = expert(404, { error: 'not found' });
    expect(await assetPaymentCount(fetchImpl, 'NEW', ISSUER, 1000)).toBe(0);
  });

  it('throws rather than guessing when the answer is unclear', async () => {
    await expect(assetPaymentCount(expert(503, {}).fetchImpl, 'CLPX', ISSUER, 1000)).rejects.toThrow('503');
    await expect(assetPaymentCount(expert(200, { trades: 5 }).fetchImpl, 'CLPX', ISSUER, 1000)).rejects.toThrow('no payment count');
  });
});

describe('public host check', () => {
  it('knows the private, loopback and link-local ranges', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', 'not-an-ip']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('requires every resolved address to be public', async () => {
    expect(await resolvesToPublicAddress('x.com', async () => ['8.8.8.8'])).toBe(true);
    expect(await resolvesToPublicAddress('x.com', async () => ['8.8.8.8', '10.0.0.1'])).toBe(false);
    expect(await resolvesToPublicAddress('x.com', async () => [])).toBe(false);
    expect(await resolvesToPublicAddress('x.com', async () => { throw new Error('ENOTFOUND'); })).toBe(false);
  });
});
