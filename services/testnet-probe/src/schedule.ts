import schedule from 'node-schedule';
import { config } from './config.js';
import { appendResult, runProbe } from './probe.js';

console.log(`[testnet-probe] scheduling probe with cron "${config.scheduleCron}"`);

async function tick() {
  const result = await runProbe();
  appendResult(result);
}

schedule.scheduleJob(config.scheduleCron, () => {
  tick().catch((err) => console.error('[testnet-probe] scheduled run failed:', err));
});

// Run once immediately on startup too, so you don't wait a full period to see output.
tick().catch((err) => console.error('[testnet-probe] initial run failed:', err));
