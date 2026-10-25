// Every round (`npm run attest-keys`): read each registered anchor's
// stellar.toml and attest its SIGNING_KEY when the registry does not hold
// that key yet, so an operator can claim the record within a round of
// publishing the key. The same as `npm run d3 -- attest <id>`, for all.
//
// Nobody can set a key by hand: the contract takes it only from the
// reporters' attestations, and the reporters only from the anchor's own
// domain. A key already attested by this reporter and waiting for the
// quorum is not attested again. A secondary host attests only once it
// publishes (SECONDARY_PUBLISH=true).
//
//   npm run attest-keys -- --dry-run   what it would attest; sends nothing
import { contract, Keypair, rpc, StrKey } from '@stellar/stellar-sdk';
import { config } from './config.js';
import { signingKeyFromToml } from './d3.js';
import { readPerAnchor } from './ledger.js';

type SourceType = 'RealMainnet' | 'RealTestnet';

const gKey = (raw: unknown) => (raw ? StrKey.encodeEd25519PublicKey(Buffer.from(raw as Uint8Array)) : null);

/** Whether to attest `toml`: there is one, the registry holds another (or
 * none), and this reporter's own pending attestation is not already it. */
export const needsAttest = (toml: string | null, onChain: string | null, pendingMine: string | null) =>
  !!toml && toml !== onChain && toml !== pendingMine;

async function tomlKey(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${domain}/.well-known/stellar.toml`, { signal: AbortSignal.timeout(10_000), redirect: 'follow' });
    return res.ok ? signingKeyFromToml(await res.text()) : null;
  } catch {
    return null;
  }
}

/** `fn` over `items`, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const primary = (process.env.COLLECTOR_ROLE ?? 'primary') === 'primary';
  if (!dry && !primary && process.env.SECONDARY_PUBLISH !== 'true') {
    console.log('[attest-keys] skipped: secondary not publishing yet');
    return;
  }
  const registryId = config.anchorRegistryContractId();
  const oracleId = config.performanceOracleContractId();
  const server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const reporters = Object.fromEntries(
    // A dry run needs no keys: it only reports what is due.
    (['RealMainnet', 'RealTestnet'] as const).map((t) => [t, dry ? Keypair.random() : Keypair.fromSecret(config.reporterSecretKeys[t]())]),
  ) as Record<SourceType, Keypair>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registry: any = await contract.Client.from({ contractId: registryId, networkPassphrase: config.networkPassphrase, rpcUrl: config.rpcUrl });
  const anchorIds = ((await registry.list_anchors()).result as string[]).map(String);
  const [infos, keys, pending] = await Promise.all([
    readPerAnchor(server, registryId, 'Anchor', anchorIds),
    readPerAnchor(server, registryId, 'SigningKey', anchorIds),
    readPerAnchor(server, oracleId, 'Attestations', anchorIds, 'temporary'),
  ]);

  const anchors = anchorIds
    .filter((id) => infos.has(id))
    .map((id) => {
      const info = infos.get(id) as { domain: string; source_type: unknown };
      const sourceType = (Array.isArray(info.source_type) ? info.source_type[0] : info.source_type) as SourceType;
      const reporter = reporters[sourceType];
      const mine = ((pending.get(id) as { reporter: string; signing_key: Uint8Array }[] | undefined) ?? []).find((a) => String(a.reporter) === reporter?.publicKey());
      return { id, domain: String(info.domain), reporter, onChain: gKey(keys.get(id)), pendingMine: gKey(mine?.signing_key) };
    })
    .filter((a) => a.reporter);

  const tomls = await pool(anchors, 8, (a) => tomlKey(a.domain));
  const due = anchors.map((a, i) => ({ ...a, toml: tomls[i] })).filter((a) => needsAttest(a.toml, a.onChain, a.pendingMine));
  console.log(
    `[attest-keys] ${anchors.length} anchor(s): ${tomls.filter(Boolean).length} publish a SIGNING_KEY, ${anchors.filter((a) => a.onChain).length} on-chain, ${due.length} to attest`,
  );

  for (const a of due) {
    if (dry) {
      console.log(`[attest-keys] would attest ${a.id} (${a.domain}): ${a.toml}${a.onChain ? ` (on-chain ${a.onChain})` : ''}`);
      continue;
    }
    try {
      const oracle = await contract.Client.from({
        contractId: oracleId,
        networkPassphrase: config.networkPassphrase,
        rpcUrl: config.rpcUrl,
        publicKey: a.reporter.publicKey(),
        signTransaction: new contract.KeypairSigner(a.reporter, config.networkPassphrase),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (oracle as any).attest_signing_key({
        reporter: a.reporter.publicKey(),
        anchor_id: a.id,
        signing_key: Buffer.from(StrKey.decodeEd25519PublicKey(a.toml!)),
      });
      const sent = await tx.signAndSend();
      console.log(`[attest-keys] ${a.id} (${a.domain}): attested ${a.toml}${a.onChain ? ` (was ${a.onChain})` : ''}; tx ${sent.sendTransactionResponse?.hash ?? '?'}`);
    } catch (err) {
      console.error(`[attest-keys] ${a.id}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
}

if (process.argv[1]?.endsWith('attest-keys.ts')) {
  await main().catch((err) => {
    console.error(`[attest-keys] ${(err as Error).message.split('\n')[0]}`);
    process.exitCode = 1;
  });
}
