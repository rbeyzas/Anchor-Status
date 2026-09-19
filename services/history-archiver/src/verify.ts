import { scorePointKey } from './archive.js';
import type { AnchorEvents } from './events.js';
import type { Archive, ScorePoint } from './types.js';

export interface PointRef {
  anchorId: string;
  point: ScorePoint;
}

export interface VerifyReport {
  /** Oldest ledger close time the chain could be read from (ISO). */
  windowStart: string;
  chainPoints: number;
  archivedInWindow: number;
  /** On-chain reports the archive lacks — a backfill adds these. */
  missingFromArchive: PointRef[];
  /** Archived reports inside the window that none of the scanned contracts
   * emitted: either from a deployment not scanned, or not from the chain. */
  notOnChain: PointRef[];
  /** Same report, different evidence hash. */
  evidenceMismatch: { anchorId: string; archived: ScorePoint; onChain: ScorePoint }[];
}

/** Checks the archive against what the chain itself still serves. Only the
 * part of the archive inside the chain's window can be checked; anything
 * older is reported as outside it, never as verified. */
export function verifyArchive(archive: Archive, chain: Map<string, AnchorEvents>, windowStart: string): VerifyReport {
  const start = Date.parse(windowStart);
  const report: VerifyReport = {
    windowStart,
    chainPoints: 0,
    archivedInWindow: 0,
    missingFromArchive: [],
    notOnChain: [],
    evidenceMismatch: [],
  };
  const anchorIds = new Set([...Object.keys(archive.anchors), ...chain.keys()]);
  for (const anchorId of anchorIds) {
    const onChain = new Map((chain.get(anchorId)?.scoreHistory ?? []).map((p) => [scorePointKey(p), p]));
    const archived = new Map(
      (archive.anchors[anchorId]?.scoreHistory ?? [])
        .filter((p) => Date.parse(p.timestamp) >= start)
        .map((p) => [scorePointKey(p), p]),
    );
    report.chainPoints += onChain.size;
    report.archivedInWindow += archived.size;
    for (const [key, point] of onChain) {
      const kept = archived.get(key);
      if (!kept) report.missingFromArchive.push({ anchorId, point });
      else if ((kept.evidence ?? null) !== (point.evidence ?? null)) {
        report.evidenceMismatch.push({ anchorId, archived: kept, onChain: point });
      }
    }
    for (const [key, point] of archived) {
      if (!onChain.has(key)) report.notOnChain.push({ anchorId, point });
    }
  }
  return report;
}

export function formatReport(r: VerifyReport): string {
  const lines = [
    `chain window starts ${r.windowStart}`,
    `on-chain reports: ${r.chainPoints}, archived reports in the window: ${r.archivedInWindow}`,
    `missing from the archive: ${r.missingFromArchive.length}`,
    `in the archive but not emitted by the scanned contracts: ${r.notOnChain.length}`,
    `evidence hash mismatches: ${r.evidenceMismatch.length}`,
  ];
  for (const { anchorId, point } of r.notOnChain.slice(0, 10)) {
    lines.push(`  not on chain: ${anchorId} ${point.timestamp} score ${point.score}`);
  }
  for (const m of r.evidenceMismatch.slice(0, 10)) {
    lines.push(`  evidence differs: ${m.anchorId} ${m.onChain.timestamp}`);
  }
  return lines.join('\n');
}
