import { Horizon } from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { aggregatePayments } from './aggregate.js';
import { config, loadAnchorsFile } from './config.js';
import { fetchRecentPayments, sleep } from './horizon.js';
import { fetchAnchorInfo } from './sep.js';
import type { AnchorConfig, BaseProfile } from './types.js';

function validateAnchor(raw: Record<string, string>): AnchorConfig {
  for (const field of ['anchor_id', 'name', 'domain', 'distribution_account']) {
    if (!raw[field]) {
      throw new Error(`anchors.json entry missing required field "${field}": ${JSON.stringify(raw)}`);
    }
  }
  return raw as unknown as AnchorConfig;
}

async function buildProfile(
  server: Horizon.Server,
  anchor: AnchorConfig,
  lookbackDays: number,
  delayMs: number,
  maxPages: number,
): Promise<BaseProfile> {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  console.log(`[passive-monitor] ${anchor.anchor_id}: fetching payments since ${cutoff.toISOString()}`);
  const { records, truncated, oldestScannedAt } = await fetchRecentPayments(
    server,
    anchor.distribution_account,
    cutoff,
    delayMs,
    maxPages,
  );
  // When truncated, stats cover only the window actually scanned, so
  // per-day frequency (and the aggregator's settlement estimate) stay honest.
  const windowDays =
    truncated && oldestScannedAt
      ? Math.max((Date.now() - new Date(oldestScannedAt).getTime()) / (24 * 60 * 60 * 1000), 1 / (24 * 60))
      : lookbackDays;
  if (truncated) {
    console.log(
      `[passive-monitor] ${anchor.anchor_id}: hit ${maxPages}-page cap, measuring over the last ${(windowDays * 24).toFixed(2)}h (${records.length} payments)`,
    );
  }
  const { overall, byAsset } = aggregatePayments(records, windowDays);

  await sleep(delayMs);
  console.log(`[passive-monitor] ${anchor.anchor_id}: fetching stellar.toml + SEP-24 /info from ${anchor.domain}`);
  let anchorInfo: BaseProfile['anchor_info'];
  try {
    anchorInfo = await fetchAnchorInfo(anchor.domain);
  } catch (err) {
    console.warn(`[passive-monitor] ${anchor.anchor_id}: SEP-1/SEP-24 fetch failed: ${(err as Error).message}`);
    anchorInfo = { currencies: [] };
  }

  return {
    anchor_id: anchor.anchor_id,
    name: anchor.name,
    domain: anchor.domain,
    source_type: 'RealMainnet',
    lookback_days: windowDays,
    truncated,
    overall,
    by_asset: byAsset,
    anchor_info: anchorInfo,
    generated_at: new Date().toISOString(),
  };
}

async function main() {
  const { anchors } = loadAnchorsFile(config.anchorsConfigPath);
  if (anchors.length === 0) {
    console.warn('[passive-monitor] anchors.json has no anchors configured, nothing to do.');
    return;
  }

  const server = new Horizon.Server(config.horizonMainnetUrl, { allowHttp: false });

  const profiles: BaseProfile[] = [];
  for (const raw of anchors) {
    const anchor = validateAnchor(raw);
    try {
      const profile = await buildProfile(server, anchor, config.lookbackDays, config.requestDelayMs, config.maxPages);
      profiles.push(profile);
    } catch (err) {
      console.error(`[passive-monitor] ${anchor.anchor_id}: failed: ${(err as Error).message}`);
    }
    // Space out anchor-to-anchor requests too, not just pagination within one.
    await sleep(config.requestDelayMs);
  }

  fs.mkdirSync(path.dirname(config.outputPath), { recursive: true });
  fs.writeFileSync(config.outputPath, JSON.stringify(profiles, null, 2));
  console.log(`[passive-monitor] wrote ${profiles.length} profile(s) to ${config.outputPath}`);
}

main().catch((err) => {
  console.error('[passive-monitor] fatal error:', err);
  process.exitCode = 1;
});
