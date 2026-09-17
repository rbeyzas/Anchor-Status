import { contract, rpc } from '@stellar/stellar-sdk';
import { loadArchive, mergeAnchor, saveArchive } from './archive.js';
import { config } from './config.js';
import { fetchAnchorEvents } from './events.js';

async function main() {
  const server = new rpc.Server(config.rpcUrl);
  const registry = await contract.Client.from({
    contractId: config.registryContractId(),
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: config.readerPublicKey(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listTx = await (registry as any).list_anchors();
  const anchorIds = listTx.result as string[];

  const latest = await server.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - config.lookbackLedgers);

  const archive = loadArchive(config.archivePath);
  let added = 0;

  for (const anchorId of anchorIds) {
    try {
      const incoming = await fetchAnchorEvents(
        server,
        startLedger,
        config.oracleContractId(),
        config.registryContractId(),
        anchorId,
      );
      const before = archive.anchors[anchorId];
      const merged = mergeAnchor(before, incoming);
      added +=
        merged.scoreHistory.length - (before?.scoreHistory.length ?? 0) +
        (merged.slashEvents.length - (before?.slashEvents.length ?? 0));
      archive.anchors[anchorId] = merged;
    } catch (err) {
      // One anchor failing must not cost us the other anchors' merges.
      console.error(`[history-archiver] ${anchorId}: ${(err as Error).message}`);
    }
  }

  archive.updatedAt = new Date().toISOString();
  saveArchive(config.archivePath, archive);

  const totals = Object.values(archive.anchors).reduce(
    (sum, a) => sum + a.scoreHistory.length,
    0,
  );
  console.log(
    `[history-archiver] ${anchorIds.length} anchor(s), ${added} new entr(ies), ${totals} score points archived -> ${config.archivePath}`,
  );
}

main().catch((err) => {
  console.error('[history-archiver] fatal error:', err);
  process.exitCode = 1;
});
