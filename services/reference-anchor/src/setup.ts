// One-time testnet setup: new keys, funded accounts, the asset issued to
// the distribution account, and the issuer's home_domain pointing at the
// anchor (so the asset reads as issued by it). Secrets go to a local file,
// mode 600, never to the terminal:
//   npm run setup -- .env.ref1      then: fly secrets import < .env.ref1
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

const out = process.argv[2];
if (!out) throw new Error('usage: npm run setup -- <secrets file>');
if (fs.existsSync(out)) throw new Error(`${out} exists; refusing to replace keys that may already be in use`);

const horizon = new Horizon.Server(process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org');
const homeDomain = process.env.HOME_DOMAIN ?? 'ref1.monarank.xyz';
const code = process.env.ASSET_CODE ?? 'MONAREF';
const supply = process.env.SUPPLY ?? '1000000';

const issuer = Keypair.random();
const distribution = Keypair.random();
const signing = Keypair.random();
const asset = new Asset(code, issuer.publicKey());

async function friendbot(kp: Keypair) {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  if (!res.ok) throw new Error(`Friendbot answered ${res.status}`);
}

async function submit(source: Keypair, ops: ReturnType<typeof Operation.payment>[], signers: Keypair[]) {
  const account = await horizon.loadAccount(source.publicKey());
  const builder = new TransactionBuilder(account, { fee: '10000', networkPassphrase: Networks.TESTNET }).setTimeout(60);
  for (const op of ops) builder.addOperation(op);
  const tx = builder.build();
  tx.sign(...signers);
  return (await horizon.submitTransaction(tx)).hash;
}

// Written first, so a failure half-way leaves the keys to retry with.
fs.writeFileSync(
  out,
  [
    `SIGNING_SECRET=${signing.secret()}`,
    `DISTRIBUTION_SECRET=${distribution.secret()}`,
    `ISSUER_SECRET=${issuer.secret()}`,
    `ISSUER_PUBLIC=${issuer.publicKey()}`,
    `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);

await friendbot(issuer);
await friendbot(distribution);
const setupHash = await submit(
  issuer,
  [
    Operation.setOptions({ homeDomain }),
    Operation.changeTrust({ asset, source: distribution.publicKey() }),
    Operation.payment({ destination: distribution.publicKey(), asset, amount: supply }),
  ],
  [issuer, distribution],
);

console.log(`issuer        ${issuer.publicKey()} (home_domain ${homeDomain})`);
console.log(`distribution  ${distribution.publicKey()} (${supply} ${code})`);
console.log(`signing key   ${signing.publicKey()}`);
console.log(`setup tx      ${setupHash}`);
console.log(`secrets in    ${out} (mode 600)`);
