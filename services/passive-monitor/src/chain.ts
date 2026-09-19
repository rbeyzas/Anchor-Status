// Chain signals for the score cards: mint/burn flows of every asset an
// anchor issues, and market samples of the fiat ones. Which assets an anchor
// issues comes from mainnet-probe's status file (issuer home_domain check).
import fs from 'node:fs';
import { Horizon } from '@stellar/stellar-sdk';
import { config } from './config.js';
import { loadFlows, saveFlows, updateFlows, type IssuedAsset } from './flows.js';
import { loadFxTable, usdPerUnit } from './fx.js';
import { fetchRecentPayments, sleep } from './horizon.js';
import { appendSamples, fetchQuotes, sample, USDC, type MarketSample } from './market.js';

interface StatusFile {
  anchors: Record<
    string,
    { dormant?: boolean; assets?: { code: string; issuer?: string; anchor_asset_type?: string; anchor_asset?: string; issuer_home_domain_matches?: boolean }[] }
  >;
}

export interface IssuedFiat extends IssuedAsset {
  anchor_asset: string;
}

/** Assets each anchor issues itself, and which of those are fiat-backed. */
export function issuedAssets(status: StatusFile): { issued: IssuedAsset[]; fiat: IssuedFiat[] } {
  const issued: IssuedAsset[] = [];
  const fiat: IssuedFiat[] = [];
  for (const [anchor_id, a] of Object.entries(status.anchors)) {
    for (const asset of a.assets ?? []) {
      if (!asset.issuer || asset.issuer_home_domain_matches !== true) continue;
      if (asset.code === USDC.code && asset.issuer === USDC.issuer) continue;
      issued.push({ anchor_id, code: asset.code, issuer: asset.issuer });
      if (asset.anchor_asset_type === 'fiat' && asset.anchor_asset) {
        fiat.push({ anchor_id, code: asset.code, issuer: asset.issuer, anchor_asset: asset.anchor_asset });
      }
    }
  }
  return { issued, fiat };
}

export async function runChainSignals(now = Date.now()): Promise<void> {
  if (!fs.existsSync(config.statusPath)) {
    console.warn(`[passive-monitor] no mainnet-probe status at ${config.statusPath}; skipping chain signals`);
    return;
  }
  const { issued, fiat } = issuedAssets(JSON.parse(fs.readFileSync(config.statusPath, 'utf-8')) as StatusFile);
  console.log(`[passive-monitor] chain signals: ${issued.length} issued asset(s), ${fiat.length} fiat`);

  const server = new Horizon.Server(config.horizonMainnetUrl, { allowHttp: false });
  const flows = loadFlows(config.flowsPath);
  const withoutHistory: string[] = [];
  const { scanned, waiting, failures } = await updateFlows(
    flows,
    issued,
    now,
    async (issuer, cutoff) => {
      const result = await fetchRecentPayments(server, issuer, cutoff, config.requestDelayMs, config.maxPages);
      if (result.historyMissing) withoutHistory.push(issuer);
      return result;
    },
    config.maxBackfillsPerRun,
  );
  saveFlows(config.flowsPath, flows);
  console.log(`[passive-monitor] flows: ${scanned} issuer(s) scanned, ${waiting} waiting for a backfill slot`);
  if (withoutHistory.length > 0) {
    // Real zeros, not gaps: Horizon holds no classic operation for these
    // accounts, so they have minted and burned nothing we can see.
    console.log(`[passive-monitor] flows: ${withoutHistory.length} issuer(s) with no payment history at all (${withoutHistory.join(', ')})`);
  }
  for (const f of failures) {
    console.warn(`[passive-monitor] flows: could not read issuer ${f.issuer}, leaving it for the next run: ${f.message}`);
  }
  // A few unreadable issuers are a fact about them. Not one issuer read
  // when there were issuers to read is a fact about us, and the round
  // should say so rather than look healthy.
  if (scanned === 0 && failures.length > 0) {
    throw new Error(`could not read any of the ${failures.length} issuer(s) scanned: ${failures[0].message}`);
  }

  const fx = await loadFxTable(config.fxCachePath, now);
  const samples: MarketSample[] = [];
  for (const asset of fiat) {
    const base = { timestamp: new Date().toISOString(), anchor_id: asset.anchor_id, code: asset.code, issuer: asset.issuer, anchor_asset: asset.anchor_asset };
    try {
      const { book, amm } = await fetchQuotes(fetch, config.horizonMainnetUrl, asset, config.requestTimeoutMs);
      samples.push(sample(base, book, amm, usdPerUnit(fx, asset.anchor_asset)));
    } catch (err) {
      // A Horizon failure is ours: no sample at all, rather than a false
      // "no liquidity".
      console.warn(`[passive-monitor] market ${asset.code}: ${(err as Error).message}`);
    }
    await sleep(config.requestDelayMs);
  }
  appendSamples(config.marketDir, samples);
  const usable = samples.filter((s) => s.dev_bps !== undefined);
  console.log(
    `[passive-monitor] market: ${samples.length} attempt(s), ${usable.length} usable` +
      (usable.length ? ` (${usable.map((s) => `${s.code} ${s.dev_bps}bps`).join(', ')})` : ''),
  );
}
