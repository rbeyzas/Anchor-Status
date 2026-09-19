// The anchor registry on-chain: which ids exist, and registering an
// admitted testnet anchor. Same pattern as services/mainnet-probe/src/register.ts;
// the deployer's key is the operator, as for every anchor admitted by us.
import { contract, Keypair } from '@stellar/stellar-sdk';
import { config } from './config.js';

async function registry() {
  const keypair = Keypair.fromSecret(config.deployerSecretKey());
  const client = await contract.Client.from({
    contractId: config.registryContractId(),
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: keypair.publicKey(),
    signTransaction: new contract.KeypairSigner(keypair, config.networkPassphrase),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, operator: keypair.publicKey() };
}

export async function registeredAnchorIds(): Promise<Set<string>> {
  const { client } = await registry();
  return new Set(((await client.list_anchors()).result as string[]) ?? []);
}

export async function registerTestnetAnchor(a: { anchor_id: string; name: string; domain: string }): Promise<void> {
  const { client, operator } = await registry();
  const tx = await client.register_anchor({
    operator,
    anchor_id: a.anchor_id,
    name: a.name.slice(0, 64),
    domain: a.domain,
    source_type: { tag: 'RealTestnet' },
  });
  await tx.signAndSend();
}
