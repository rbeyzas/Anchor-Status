// Run on a secondary reporter host after discovery and before the probe:
// rewrites the mainnet and testnet anchor lists so they hold exactly the
// anchors registered on-chain. Read-only on-chain; needs no key.
import fs from 'node:fs';
import path from 'node:path';
import { contract } from '@stellar/stellar-sdk';
import { loadAnchorsFile, saveAnchorsFile } from './anchors.js';
import { mainnetFromChain, testnetFromChain, type ChainAnchor, type TestnetListEntry } from './chain-anchors.js';
import { mapWithConcurrency } from './concurrency.js';
import { config, repoRoot } from './config.js';

const PAGE = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = (r: any) => (r && typeof r.unwrap === 'function' ? r.unwrap() : r);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tagOf = (v: any): string => (typeof v === 'string' ? v : v?.tag);

async function readRegistry(): Promise<ChainAnchor[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registry: any = await contract.Client.from({
    contractId: config.registryContractId(),
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
  let ids: string[];
  if (typeof registry.anchor_count === 'function') {
    // Paged index (after the registry upgrade).
    const count = Number(unwrap((await registry.anchor_count()).result));
    ids = [];
    for (let start = 0; start < count; start += PAGE) {
      ids.push(...(unwrap((await registry.list_anchors_page({ start, limit: PAGE })).result) as string[]));
    }
  } else {
    ids = unwrap((await registry.list_anchors()).result) as string[];
  }
  return mapWithConcurrency(ids, 8, async (anchor_id) => {
    const info = unwrap((await registry.get_anchor_info({ anchor_id })).result);
    return { anchor_id, name: info.name, domain: info.domain, source_type: tagOf(info.source_type) as ChainAnchor['source_type'] };
  });
}

function loadTestnetList(file: string): TestnetListEntry[] {
  if (!fs.existsSync(file)) return [];
  try {
    return (JSON.parse(fs.readFileSync(file, 'utf-8')).anchors as TestnetListEntry[]) ?? [];
  } catch {
    return [];
  }
}

async function main() {
  const now = new Date().toISOString();
  const chain = await readRegistry();
  if (chain.length === 0) throw new Error('registry returned no anchors; keeping the current lists');

  const mainnet = mainnetFromChain(chain, loadAnchorsFile(config.anchorsPath)?.anchors ?? [], now);
  saveAnchorsFile(config.anchorsPath, { generated_at: now, anchors: mainnet });

  const testnetPath = path.resolve(repoRoot, process.env.TESTNET_ANCHORS_PATH ?? 'services/testnet-probe/output/testnet-anchors.json');
  const referenceId = process.env.TESTNET_PROBE_ANCHOR_ID ?? 'stellar_test_anchor';
  const testnet = testnetFromChain(chain, loadTestnetList(testnetPath), referenceId, now);
  fs.mkdirSync(path.dirname(testnetPath), { recursive: true });
  fs.writeFileSync(`${testnetPath}.tmp`, JSON.stringify({ updated_at: now, anchors: testnet }, null, 2));
  fs.renameSync(`${testnetPath}.tmp`, testnetPath);

  console.log(`[sync-from-chain] ${chain.length} registered: ${mainnet.length} mainnet, ${testnet.length} testnet (+ reference)`);
}

main().catch((err) => {
  console.error('[sync-from-chain] fatal:', (err as Error).message);
  process.exitCode = 1;
});
