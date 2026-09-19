import path from 'node:path';
import { config, scoreCardsStatePath } from '../config.js';
import { publishScoreCard, ScoreCardsUnsupported } from '../contract.js';
import { computeCard, flagNames } from './engine.js';
import { buildInputs, floorToHour } from './inputs.js';
import {
  contextFor,
  fillLegacySigningKeys,
  readAliases,
  readAssets,
  readFlows,
  readMarketSamples,
  readProbeHistory,
  writeInputsBundle,
} from './load.js';
import { loadPublished, savePublished, selectToPublish, writeSummary, type Candidate } from './publisher.js';
import type { ScoreInputs } from './types.js';

export interface ScoringResult {
  cards: (Candidate & { inputs: ScoreInputs })[];
  published: number;
  failed: number;
}

/**
 * Computes every RealMainnet anchor's card and publishes the ones due. With
 * `dryRun`, computes and returns them without writing a bundle or sending a
 * transaction.
 */
export async function runScoring({ dryRun = false, now = Date.now() } = {}): Promise<ScoringResult> {
  const windowEnd = floorToHour(now);
  const probes = await readProbeHistory(config.mainnetProbeResultsDir, windowEnd);
  fillLegacySigningKeys(probes, config.evidenceDir);
  const assets = readAssets(config.mainnetStatusPath);
  const samples = await readMarketSamples(config.marketSamplesDir, windowEnd);
  const flows = readFlows(config.flowsPath);

  const aliases = readAliases(config.mainnetStatusPath);
  const anchorIds = [...new Set(probes.map((p) => p.anchor_id))].filter((id) => !aliases.has(id)).sort();
  const cards: ScoringResult['cards'] = [];
  for (const anchorId of anchorIds) {
    const inputs = buildInputs(anchorId, probes, windowEnd, contextFor(anchorId, assets, samples, flows));
    if (inputs) cards.push({ anchorId, card: computeCard(inputs), inputs });
  }
  if (dryRun) return { cards, published: 0, failed: 0 };

  const statePath = scoreCardsStatePath();
  const state = loadPublished(statePath);
  const due = selectToPublish(cards, state, now);
  console.log(`[aggregator] score cards: ${cards.length} computed, ${due.length} due for publishing`);

  let published = 0;
  let failed = 0;
  for (const { anchorId, card } of due) {
    const inputs = cards.find((c) => c.anchorId === anchorId)!.inputs;
    const inputsHash = writeInputsBundle(config.evidenceDir, inputs);
    try {
      await publishScoreCard(anchorId, card, inputsHash);
      state[anchorId] = {
        published_at: new Date(now).toISOString(),
        inputs_hash: inputsHash,
        card,
        summary: {
          monitored_days: inputs.monitored_days,
          n30: inputs.uptime.n30,
          coverage: inputs.coverage,
          ...(inputs.market_na ? { market_na: inputs.market_na } : {}),
        },
      };
      savePublished(statePath, state);
      published++;
      const flags = flagNames(card.flags);
      console.log(
        `[aggregator] card ${anchorId}: ${card.score} (A${card.availability} S${card.speed} I${card.integrity} M${card.market ?? 'n/a'}, ` +
          `confidence ${card.confidence}${flags.length ? `, ${flags.join(' ')}` : ''}) inputs ${inputsHash.slice(0, 12)}`,
      );
    } catch (err) {
      if (err instanceof ScoreCardsUnsupported) {
        console.warn('[aggregator] PerformanceOracle has no publish_score_card yet (not upgraded); skipping score cards');
        break;
      }
      failed++;
      console.error(`[aggregator] failed to publish the card for ${anchorId}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  // Beside mainnet-probe's status file; the collector host serves both.
  writeSummary(path.join(path.dirname(config.mainnetStatusPath), 'score-summary.json'), state, now);
  return { cards, published, failed };
}
