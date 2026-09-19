// Registers every admitted testnet anchor the on-chain registry does not
// know yet, as RealTestnet: the oracle rejects reports for an unregistered
// anchor, so this runs before the probe in each round.
import { loadTestnetAnchors } from './anchors.js';
import { registerTestnetAnchor, registeredAnchorIds } from './chain.js';
import { config } from './config.js';
import { REFERENCE_ANCHOR } from './probe.js';

const anchors = loadTestnetAnchors(config.anchorsPath, REFERENCE_ANCHOR);
const onChain = await registeredAnchorIds();
const missing = anchors.filter((a) => !onChain.has(a.anchor_id));
if (missing.length === 0) console.log(`[testnet-register] all ${anchors.length} testnet anchor(s) already registered`);
for (const a of missing) {
  try {
    await registerTestnetAnchor(a);
    console.log(`[testnet-register] registered ${a.anchor_id} (${a.domain}) as RealTestnet`);
  } catch (err) {
    console.error(`[testnet-register] failed to register ${a.anchor_id}: ${(err as Error).message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}
