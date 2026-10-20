// Operator claims and disputes (SOW deliverable 3), from the command line.
//
// On a reporter server (uses its own reporter key for the anchor's type):
//   npm run d3 -- attest <anchor_id>             read the anchor's stellar.toml
//                                                SIGNING_KEY and attest it
//   npm run d3 -- dispute-vote <anchor_id> uphold|reject
// By the anchor's operator:
//   npm run d3 -- claim-message <anchor_id> <operator G...>   the bytes to sign
//   CLAIM_SIGNATURE=<128 hex> OPERATOR_SECRET=S... npm run d3 -- claim <anchor_id>
//     (or CLAIM_SIGNING_SECRET=S... to sign here; the signature is safer to
//     pass around than the anchor's secret: it is good for one claim only)
//   OPERATOR_SECRET=S... npm run d3 -- dispute-open <anchor_id> <reason_code> <evidence_sha256>
// Read-only, anyone:
//   npm run d3 -- show <anchor_id>
import { contract, Keypair, StrKey } from '@stellar/stellar-sdk';
import { config } from './config.js';

type SourceType = 'RealMainnet' | 'RealTestnet';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;
const unwrap = (r: unknown) => (r && typeof (r as { unwrap?: unknown }).unwrap === 'function' ? (r as { unwrap(): unknown }).unwrap() : r);
const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? Buffer.from(x).toString('hex') : x));

async function client(contractId: string, signer?: Keypair): Promise<Client> {
  return contract.Client.from({
    contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    ...(signer ? { publicKey: signer.publicKey(), signTransaction: new contract.KeypairSigner(signer, config.networkPassphrase) } : {}),
  });
}
const registry = (signer?: Keypair) => client(config.anchorRegistryContractId(), signer);
const oracle = (signer?: Keypair) => client(config.performanceOracleContractId(), signer);

async function anchorInfo(anchorId: string): Promise<{ domain: string; source_type: SourceType; stake: bigint; operator: string }> {
  const info = unwrap((await (await registry()).get_anchor_info({ anchor_id: anchorId })).result) as {
    domain: string;
    source_type: { tag: SourceType } | SourceType;
    stake: bigint;
    operator: string;
  };
  const t = typeof info.source_type === 'string' ? info.source_type : info.source_type.tag;
  return { ...info, source_type: t };
}

/** The SIGNING_KEY an anchor publishes in its stellar.toml, read directly. */
export function signingKeyFromToml(toml: string): string | null {
  return /^\s*SIGNING_KEY\s*=\s*"(G[A-Z2-7]{55})"/m.exec(toml)?.[1] ?? null;
}

function reporterKey(sourceType: SourceType): Keypair {
  return Keypair.fromSecret(config.reporterSecretKeys[sourceType]());
}

function secret(name: string): Keypair {
  const v = process.env[name];
  if (!v) throw new Error(`set ${name}`);
  return Keypair.fromSecret(v);
}

async function send(tx: { signAndSend(): Promise<{ sendTransactionResponse?: { hash?: string }; result: unknown }> }) {
  const sent = await tx.signAndSend();
  return { hash: sent.sendTransactionResponse?.hash ?? '?', result: unwrap(sent.result) };
}

async function attest(anchorId: string) {
  const info = await anchorInfo(anchorId);
  const res = await fetch(`https://${info.domain}/.well-known/stellar.toml`);
  if (!res.ok) throw new Error(`stellar.toml of ${info.domain}: HTTP ${res.status}`);
  const key = signingKeyFromToml(await res.text());
  if (!key) throw new Error(`no SIGNING_KEY in the stellar.toml of ${info.domain}`);
  const reporter = reporterKey(info.source_type);
  const tx = await (await oracle(reporter)).attest_signing_key({
    reporter: reporter.publicKey(),
    anchor_id: anchorId,
    signing_key: Buffer.from(StrKey.decodeEd25519PublicKey(key)),
  });
  const { hash, result } = await send(tx);
  console.log(`attested ${key} for ${anchorId} (${info.domain}): ${result} reporter(s) agree; tx ${hash}`);
}

async function claimMessage(anchorId: string, operator: string) {
  const message = (await (await registry()).claim_message({ anchor_id: anchorId, operator })).result as Uint8Array;
  console.log(Buffer.from(message).toString('hex'));
}

async function claim(anchorId: string) {
  const operator = secret('OPERATOR_SECRET');
  const reg = await registry(operator);
  let signature: Buffer;
  if (process.env.CLAIM_SIGNATURE) {
    signature = Buffer.from(process.env.CLAIM_SIGNATURE.trim(), 'hex');
    if (signature.length !== 64) throw new Error('CLAIM_SIGNATURE must be 64 bytes (128 hex characters)');
  } else {
    const message = (await reg.claim_message({ anchor_id: anchorId, operator: operator.publicKey() })).result as Uint8Array;
    signature = Buffer.from(secret('CLAIM_SIGNING_SECRET').sign(Buffer.from(message)));
  }
  const { hash } = await send(await reg.claim_anchor({ anchor_id: anchorId, operator: operator.publicKey(), signature }));
  console.log(`${anchorId} claimed by ${operator.publicKey()}; tx ${hash}`);
}

async function disputeOpen(anchorId: string, reasonCode: string, evidenceHash: string) {
  const operator = secret('OPERATOR_SECRET');
  const card = unwrap((await (await oracle()).get_score_card({ anchor_id: anchorId })).result) as { window_end: bigint } | undefined;
  if (!card) throw new Error(`${anchorId} has no card to dispute`);
  const tx = await (await oracle(operator)).open_dispute({
    operator: operator.publicKey(),
    anchor_id: anchorId,
    window_end: card.window_end,
    reason_code: Number(reasonCode),
    evidence_hash: Buffer.from(evidenceHash, 'hex'),
  });
  const { hash } = await send(tx);
  console.log(`dispute opened on ${anchorId}'s card ending ${new Date(Number(card.window_end) * 1000).toISOString()}; tx ${hash}`);
}

async function disputeVote(anchorId: string, vote: string) {
  if (vote !== 'uphold' && vote !== 'reject') throw new Error('vote is uphold or reject');
  const reporter = reporterKey((await anchorInfo(anchorId)).source_type);
  const tx = await (await oracle(reporter)).vote_dispute({ reporter: reporter.publicKey(), anchor_id: anchorId, uphold: vote === 'uphold' });
  const { hash, result } = await send(tx);
  console.log(`voted ${vote} on ${anchorId}: dispute ${json(result)}; tx ${hash}`);
}

async function show(anchorId: string) {
  const reg = await registry();
  const ora = await oracle();
  // A contract from before deliverable 3 has no such function yet.
  const read = async (c: Client, fn: string) =>
    typeof c[fn] === 'function' ? unwrap((await c[fn]({ anchor_id: anchorId })).result) : '(not on this contract yet)';
  const key = await read(reg, 'get_signing_key');
  console.log(`signing key: ${key instanceof Uint8Array ? StrKey.encodeEd25519PublicKey(Buffer.from(key)) : (key ?? '-')}`);
  console.log(`claim:       ${json((await read(reg, 'get_claim')) ?? null)}`);
  console.log(`verdict:     ${json(await read(ora, 'get_verdict'))}`);
  console.log(`dispute:     ${json((await read(ora, 'get_dispute')) ?? null)}`);
}

if (process.argv[1]?.endsWith('d3.ts')) {
  const [cmd, ...args] = process.argv.slice(2);
  const run: Record<string, () => Promise<void>> = {
    attest: () => attest(args[0]),
    claim: () => claim(args[0]),
    'claim-message': () => claimMessage(args[0], args[1]),
    'dispute-open': () => disputeOpen(args[0], args[1], args[2]),
    'dispute-vote': () => disputeVote(args[0], args[1]),
    show: () => show(args[0]),
  };
  if (!run[cmd] || !args[0]) {
    console.error('usage: npm run d3 -- attest|claim-message|claim|dispute-open|dispute-vote|show <anchor_id> ...');
    process.exitCode = 2;
  } else {
    await run[cmd]().catch((err) => {
      console.error(`[d3] ${cmd} failed: ${(err as Error).message.split('\n')[0]}`);
      process.exitCode = 1;
    });
  }
}
