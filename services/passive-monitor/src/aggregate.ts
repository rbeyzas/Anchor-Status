import type { AssetVolume, PaymentRecord, VolumeStats } from './types.js';

function statsFor(records: PaymentRecord[], lookbackDays: number): VolumeStats {
  const txCount = records.length;
  const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
  const avgAmount = txCount === 0 ? 0 : totalAmount / txCount;
  const avgFrequencyPerDay = lookbackDays === 0 ? 0 : txCount / lookbackDays;
  return { txCount, avgAmount, totalAmount, avgFrequencyPerDay };
}

/** Computes overall volume/frequency stats plus a per-asset breakdown. */
export function aggregatePayments(
  records: PaymentRecord[],
  lookbackDays: number,
): { overall: VolumeStats; byAsset: AssetVolume[] } {
  const overall = statsFor(records, lookbackDays);

  const byAssetMap = new Map<string, PaymentRecord[]>();
  for (const record of records) {
    const bucket = byAssetMap.get(record.assetCode) ?? [];
    bucket.push(record);
    byAssetMap.set(record.assetCode, bucket);
  }

  const byAsset: AssetVolume[] = Array.from(byAssetMap.entries())
    .map(([assetCode, assetRecords]) => ({
      assetCode,
      ...statsFor(assetRecords, lookbackDays),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return { overall, byAsset };
}
