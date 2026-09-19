// `npm run score -- --dry-run`: computes every card from the local data and
// prints it, without writing or sending anything.
import { flagNames } from './engine.js';
import { runScoring } from './run.js';

const dryRun = process.argv.includes('--dry-run');
const { cards, published, failed } = await runScoring({ dryRun });
if (dryRun) {
  for (const { anchorId, card, inputs } of cards) {
    const flags = flagNames(card.flags);
    console.log(
      `${anchorId.padEnd(28)} score ${String(card.score).padStart(3)}  A${card.availability} S${card.speed} I${card.integrity} ` +
        `M${card.market ?? 'n/a'}${inputs.market_na ? `(${inputs.market_na})` : ''}  conf ${card.confidence}  ` +
        `n30 ${inputs.uptime.n30}/${inputs.uptime.ok30} days ${inputs.monitored_days}${flags.length ? `  [${flags.join(' ')}]` : ''}`,
    );
  }
} else {
  console.log(`[aggregator] ${published} card(s) published, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}
