// HTTP entry point. Everything is configured from the environment; the
// secrets (signing key, distribution key, JWT secret) are fly.io secrets.
import http from 'node:http';
import { Asset, Keypair, Networks } from '@stellar/stellar-sdk';
import { createAnchor } from './anchor.js';
import { horizonChain } from './chain.js';

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

const networkPassphrase = process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET;
const distribution = Keypair.fromSecret(need('DISTRIBUTION_SECRET'));
const assetCode = process.env.ASSET_CODE ?? 'MONAREF';
const issuer = need('ISSUER_PUBLIC');

const anchor = createAnchor(
  {
    homeDomain: process.env.HOME_DOMAIN ?? 'ref1.monarank.xyz',
    networkPassphrase,
    signingKey: Keypair.fromSecret(need('SIGNING_SECRET')),
    distribution: distribution.publicKey(),
    assetCode,
    issuer,
    jwtSecret: need('JWT_SECRET'),
    orgName: process.env.ORG_NAME ?? 'MonaRank reference anchor 1 (testnet)',
    minAmount: Number(process.env.MIN_AMOUNT ?? 1),
    maxAmount: Number(process.env.MAX_AMOUNT ?? 100),
  },
  horizonChain({
    horizonUrl: process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
    networkPassphrase,
    distribution,
    asset: new Asset(assetCode, issuer),
  }),
);

const port = Number(process.env.PORT ?? 8080);
http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 64_000) return void res.writeHead(413).end();
    }
    try {
      const out = await anchor.handle({
        method: req.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        headers: { authorization: req.headers.authorization, 'content-type': req.headers['content-type'] },
        body,
      });
      res.writeHead(out.status, out.headers).end(out.body);
    } catch (err) {
      console.error(`[reference-anchor] ${req.method} ${url.pathname}: ${(err as Error).message}`);
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'internal error' }));
    }
  })
  .listen(port, () => console.log(`[reference-anchor] listening on ${port}`));
