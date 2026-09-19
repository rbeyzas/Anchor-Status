import schedule from 'node-schedule';
import { loadTestnetAnchors } from './anchors.js';
import { config } from './config.js';
import { appendResult, probeAnchor, REFERENCE_ANCHOR } from './probe.js';

console.log(`[testnet-probe] scheduling probe with cron "${config.scheduleCron}"`);

async function tick() {
  for (const anchor of loadTestnetAnchors(config.anchorsPath, REFERENCE_ANCHOR)) {
    appendResult(await probeAnchor(anchor));
  }
}

schedule.scheduleJob(config.scheduleCron, () => {
  tick().catch((err) => console.error('[testnet-probe] scheduled run failed:', err));
});

// Run once immediately on startup too, so you don't wait a full period to see output.
tick().catch((err) => console.error('[testnet-probe] initial run failed:', err));
