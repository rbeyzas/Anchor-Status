// Issuance and redemption of the assets an anchor issues itself: a payment
// of the asset from its issuer is a mint, one to its issuer is a burn. The
// scorer reads these as daily counts (docs/SCORING.md, ONE_WAY_FLOW and
// SILENT). Redemptions that do not go back to the issuer account are a
// known blind spot.
import fs from 'node:fs';
import path from 'node:path';
import type { PaymentRecord } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days of history the scorer needs, plus today. */
export const FLOW_DAYS = 30;

export interface DayBucket {
  mint_amount: number;
  mint_count: number;
  burn_amount: number;
  burn_count: number;
  /** The payment history ran out of pages inside this day: the counts are
   * lower bounds. */
  truncated?: boolean;
}

export interface AssetFlows {
  anchor_id: string;
  code: string;
  issuer: string;
  /** First UTC day the history covers completely. */
  covered_from: string;
  /** The last UTC day recomputed; the next run starts again from it. */
  updated_through: string;
  days: Record<string, DayBucket>;
}

export interface FlowsFile {
  updated_at: string;
  assets: Record<string, AssetFlows>;
}

export interface IssuedAsset {
  anchor_id: string;
  code: string;
  issuer: string;
}

export const assetKey = (a: { code: string; issuer: string }) => `${a.code}:${a.issuer}`;
const utcDay = (t: number | string) => new Date(t).toISOString().slice(0, 10);

/** Mint, burn, or neither, for one payment and one issued asset. */
export function classify(p: PaymentRecord, asset: { code: string; issuer: string }): 'mint' | 'burn' | null {
  const gave = p.sourceAssetCode !== undefined
    ? { code: p.sourceAssetCode, issuer: p.sourceAssetIssuer }
    : { code: p.assetCode, issuer: p.assetIssuer };
  if (p.from === asset.issuer && gave.code === asset.code && gave.issuer === asset.issuer) return 'mint';
  if (p.to === asset.issuer && p.assetCode === asset.code && p.assetIssuer === asset.issuer) return 'burn';
  return null;
}

const emptyBucket = (): DayBucket => ({ mint_amount: 0, mint_count: 0, burn_amount: 0, burn_count: 0 });

/**
 * Daily buckets for every UTC day from `fromDay` through `toDay`, including
 * days with no payment at all (a zero is a measurement too). Days before the
 * oldest payment actually scanned are marked truncated when the scan was.
 */
export function bucketize(
  payments: PaymentRecord[],
  asset: { code: string; issuer: string },
  fromDay: string,
  toDay: string,
  scan: { truncated: boolean; oldestScannedAt?: string },
): Record<string, DayBucket> {
  const days: Record<string, DayBucket> = {};
  for (let t = Date.parse(fromDay); utcDay(t) <= toDay; t += DAY_MS) days[utcDay(t)] = emptyBucket();
  for (const p of payments) {
    const day = utcDay(p.createdAt);
    const bucket = days[day];
    if (!bucket) continue;
    const kind = classify(p, asset);
    if (kind === 'mint') {
      bucket.mint_count++;
      bucket.mint_amount += p.sourceAmount ?? p.amount;
    } else if (kind === 'burn') {
      bucket.burn_count++;
      bucket.burn_amount += p.amount;
    }
  }
  if (scan.truncated) {
    const oldest = scan.oldestScannedAt ? utcDay(scan.oldestScannedAt) : toDay;
    for (const day of Object.keys(days)) if (day <= oldest) days[day].truncated = true;
  }
  for (const b of Object.values(days)) {
    b.mint_amount = Number(b.mint_amount.toFixed(7));
    b.burn_amount = Number(b.burn_amount.toFixed(7));
  }
  return days;
}

export type ScanIssuer = (
  issuer: string,
  cutoff: Date,
) => Promise<{ records: PaymentRecord[]; truncated: boolean; oldestScannedAt?: string; historyMissing?: boolean }>;

/**
 * Brings every issued asset's history up to today. A new asset is
 * backfilled over FLOW_DAYS; a known one recomputes only the days since its
 * last update (normally yesterday and today), so a missed run leaves no gap
 * and nothing is counted twice. Each issuer's payments are read once for
 * all of its assets. At most `maxBackfills` new issuers per run, so a first
 * run cannot hold up the collection round.
 */
export async function updateFlows(
  file: FlowsFile,
  assets: IssuedAsset[],
  now: number,
  scan: ScanIssuer,
  maxBackfills: number,
): Promise<{ scanned: number; waiting: number; failures: { issuer: string; message: string }[] }> {
  const today = utcDay(now);
  const oldestKept = utcDay(now - FLOW_DAYS * DAY_MS);
  const byIssuer = new Map<string, IssuedAsset[]>();
  for (const a of assets) byIssuer.set(a.issuer, [...(byIssuer.get(a.issuer) ?? []), a]);

  let backfills = 0;
  let scanned = 0;
  let waiting = 0;
  const failures: { issuer: string; message: string }[] = [];
  for (const [issuer, issued] of byIssuer) {
    const known = issued.map((a) => file.assets[assetKey(a)]);
    const isNew = known.some((k) => !k);
    if (isNew && backfills >= maxBackfills) {
      waiting++;
      continue;
    }
    if (isNew) backfills++;
    // From the earliest day any of this issuer's assets needs again.
    const fromDay = isNew
      ? oldestKept
      : known.map((k) => k!.updated_through).reduce((a, b) => (a < b ? a : b));
    const fromClamped = fromDay < oldestKept ? oldestKept : fromDay;
    // One issuer we cannot read must not cost every other issuer its round:
    // this loop's caller only saves the file after the loop returns, so an
    // exception here used to throw away the whole scan. Leaving the asset
    // untouched keeps its `updated_through` where it was, so the next run
    // picks the same range up again and no day is silently skipped.
    let result;
    try {
      result = await scan(issuer, new Date(Date.parse(fromClamped)));
    } catch (err) {
      if (isNew) backfills--;
      failures.push({ issuer, message: (err as Error).message });
      continue;
    }
    scanned++;
    for (const asset of issued) {
      const key = assetKey(asset);
      const fresh = bucketize(result.records, asset, fromClamped, today, result);
      const previous = file.assets[key];
      const days = { ...(previous?.days ?? {}), ...fresh };
      for (const day of Object.keys(days)) if (day < oldestKept) delete days[day];
      // Complete coverage starts after the last truncated day, if any.
      const truncatedDays = Object.keys(fresh).filter((d) => fresh[d].truncated).sort();
      const firstFull = truncatedDays.length
        ? utcDay(Date.parse(truncatedDays[truncatedDays.length - 1]) + DAY_MS)
        : undefined;
      const coveredFrom = previous && !firstFull ? previous.covered_from : (firstFull ?? fromClamped);
      file.assets[key] = {
        anchor_id: asset.anchor_id,
        code: asset.code,
        issuer: asset.issuer,
        covered_from: coveredFrom < oldestKept ? oldestKept : coveredFrom,
        updated_through: today,
        days,
      };
    }
  }
  file.updated_at = new Date(now).toISOString();
  return { scanned, waiting, failures };
}

export function loadFlows(filePath: string): FlowsFile {
  if (!fs.existsSync(filePath)) return { updated_at: new Date(0).toISOString(), assets: {} };
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FlowsFile;
}

export function saveFlows(filePath: string, file: FlowsFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file));
  fs.renameSync(tmp, filePath);
}
