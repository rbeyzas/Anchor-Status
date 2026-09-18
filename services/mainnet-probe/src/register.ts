import { contract, Keypair } from '@stellar/stellar-sdk';
import { loadAnchorsFile } from './anchors.js';
import { config } from './config.js';

/** Registers every tracked mainnet anchor the on-chain registry doesn't know
 * yet. Reports for an unregistered anchor are rejected by the contract, so a
 * newly discovered anchor must be registered before its first report. */
async function main() {
  const file = loadAnchorsFile(config.anchorsPath);
  if (!file) {
    console.log('[register] no anchors file yet; run `npm run discover` first');
    return;
  }
  const keypair = Keypair.fromSecret(config.deployerSecretKey());
  const registry = await contract.Client.from({
    contractId: config.registryContractId(),
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: keypair.publicKey(),
    signTransaction: new contract.KeypairSigner(keypair, config.networkPassphrase),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onChain = new Set(((await (registry as any).list_anchors()).result as string[]) ?? []);
  const missing = file.anchors.filter((a) => !onChain.has(a.anchor_id));
  if (missing.length === 0) {
    console.log(`[register] all ${file.anchors.length} tracked anchor(s) already registered`);
    return;
  }
  for (const a of missing) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (registry as any).register_anchor({
        operator: keypair.publicKey(),
        anchor_id: a.anchor_id,
        name: a.name.slice(0, 64),
        domain: a.domain,
        source_type: { tag: 'RealMainnet' },
      });
      await tx.signAndSend();
      console.log(`[register] registered ${a.anchor_id} (${a.domain})`);
    } catch (err) {
      console.error(`[register] failed to register ${a.anchor_id}: ${(err as Error).message.split('\n')[0]}`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error('[register] fatal:', err);
  process.exitCode = 1;
});
