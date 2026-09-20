// npm run calibrate
//
// What a threshold would catch, before it is allowed to catch anything. It
// computes every anchor's card twice from the same inputs, once with the
// supply and trade measures present and once with them stripped, and prints
// the difference. It writes nothing and sends nothing.
//
// Read the difference for what it is: the contribution of those measures
// alone, with everything else held equal. It is not a diff against the code
// running on the collector, because both halves run this checkout. When the
// question is "what changes when I deploy this", score the same data with
// both checkouts and diff the two outputs; anything else quietly compares a
// change against itself. Doing that caught a filter here whose whole effect
// was invisible to this report, and an anchor that gained seven points from
// it.
//
// One trap if you do run this from a copy of the tree: the testnet probe log
// is the one input with no env override, so it is found relative to the
// source file. A copy at the wrong depth reads an empty log and silently
// scores two fewer anchors.
import { config } from '../config.js';
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
  readSupplySamples,
  readTestnetProbeLines,
} from './load.js';
import type { ScoreInputs } from './types.js';

/** The same inputs as today's methodology sees: no supply, and the market
 * measures the new sampler added zeroed out. */
function asToday(inputs: ScoreInputs): ScoreInputs {
  return {
    ...inputs,
    supply: [],
    market: inputs.market.map((m) => ({ ...m, median_bps_signed: 0, share_below_peg: 0, max_drawdown_pct: 0 })),
  };
}

async function main() {
  const windowEnd = floorToHour(Date.now());
  const probes = await readProbeHistory(config.mainnetProbeResultsDir, windowEnd);
  fillLegacySigningKeys(probes, config.evidenceDir);
  probes.push(...readTestnetProbeLines(config.testnetProbeLogPath));
  const assets = readAssets(config.mainnetStatusPath);
  const samples = await readMarketSamples(config.marketSamplesDir, windowEnd);
  const supply = await readSupplySamples(config.supplySamplesDir, windowEnd);
  const flows = readFlows(config.flowsPath);
  const aliases = readAliases(config.mainnetStatusPath);

  const ids = [...new Set(probes.map((p) => p.anchor_id))].filter((id) => !aliases.has(id)).sort();
  const rows: { id: string; before: number; after: number; gained: string[]; note: string }[] = [];

  for (const id of ids) {
    const inputs = buildInputs(id, probes, windowEnd, contextFor(id, assets, samples, flows, supply));
    if (!inputs) continue;
    const after = computeCard(inputs);
    const before = computeCard(asToday(inputs));
    const gained = flagNames(after.flags).filter((f) => !flagNames(before.flags).includes(f));
    const note = inputs.market
      .map((m) => `${m.code} ${m.median_bps_signed >= 0 ? '+' : ''}${m.median_bps_signed}bps dd${m.max_drawdown_pct}%`)
      .join('; ');
    rows.push({ id, before: before.score, after: after.score, gained, note });
  }

  const changed = rows.filter((r) => r.before !== r.after || r.gained.length > 0);
  console.log(`${rows.length} cards computed, ${changed.length} would change.\n`);
  if (changed.length) {
    console.log('anchor                          before  after   gained            evidence');
    for (const r of changed.sort((a, b) => a.after - a.before - (b.after - b.before))) {
      console.log(
        `${r.id.padEnd(30)} ${String(r.before).padStart(6)} ${String(r.after).padStart(6)}   ` +
          `${r.gained.join(',').padEnd(16)}  ${r.note}`,
      );
    }
  }

  // DEPEG is not new, but it has never fired: there were no usable market
  // samples for it to read. Now that there are, it will trip as soon as a
  // run over 300 bps has lasted a day, so the report says who that will be
  // rather than letting it arrive as a surprise.
  const pending: string[] = [];
  for (const id of ids) {
    const inputs = buildInputs(id, probes, windowEnd, contextFor(id, assets, samples, flows, supply));
    if (!inputs) continue;
    const off = inputs.market.filter((m) => m.median_bps > 300 && m.longest_run_gt300_hours <= 24);
    if (off.length === 0) continue;
    const now = computeCard(inputs);
    const capped = Math.min(now.score, 50);
    if (capped < now.score) {
      pending.push(`${id.padEnd(30)} ${String(now.score).padStart(6)} ${String(capped).padStart(6)}   DEPEG in ~24h     ${off.map((m) => `${m.code} ${m.median_bps}bps`).join('; ')}`);
    }
  }
  if (pending.length) {
    console.log(`\n${pending.length} anchor(s) will hit the existing DEPEG gate once a run over 300 bps lasts a day:`);
    console.log('anchor                          now     then    gate              evidence');
    for (const line of pending) console.log(line);
  }

  // Supply is the signal that needs a window behind it; say how far along it is.
  const spans = ids
    .flatMap((id) => buildInputs(id, probes, windowEnd, contextFor(id, assets, samples, flows, supply))?.supply ?? [])
    .map((s) => ({ samples: s.samples, span: s.span_days, frozen: s.distinct_values === 1 }));
  if (spans.length) {
    const ready = spans.filter((s) => s.samples >= 200 && s.span >= 7);
    console.log(
      `\nsupply: ${spans.length} asset(s) with readings, ` +
        `${ready.length} with enough history to judge (${spans.filter((s) => s.frozen).length} have not moved so far, ` +
        `longest watched ${Math.max(...spans.map((s) => s.span)).toFixed(2)} days)`,
    );
  }
}

main().catch((err) => {
  console.error(`calibrate: ${(err as Error).message}`);
  process.exitCode = 1;
});
