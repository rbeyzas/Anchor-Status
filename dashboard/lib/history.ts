import { stroopsToXlm } from './format';
import type { AnchorViewModel, ScorePoint, SlashEvent } from './types';

/** Soroban RPC only serves contract events for roughly the last 12 hours, so
 * a chart built from RPC alone can never show more than that. The
 * history-archiver service on the collector host merges every run's events
 * into a durable file and serves it over HTTP; this reads that file and
 * unions it with whatever the live read returned.
 *
 * Fetched server-side only (the URL is plain HTTP on the collector host, so
 * a browser on an HTTPS page would refuse it as mixed content). */
const ARCHIVE_URL = process.env.HISTORY_ARCHIVE_URL ?? '';
const FETCH_TIMEOUT_MS = Number(process.env.HISTORY_FETCH_TIMEOUT_MS ?? '5000');

interface ArchiveFile {
  version: number;
  updatedAt: string;
  anchors: Record<
    string,
    {
      scoreHistory: Array<{ timestamp: string; score: number; evidence?: string }>;
      slashEvents: Array<{ timestamp: string; amountStroops: string }>;
    }
  >;
}

export async function fetchArchive(): Promise<ArchiveFile | null> {
  if (!ARCHIVE_URL) return null;
  try {
    const res = await fetch(ARCHIVE_URL, {
      // Cached with the page; `no-store` would force every request dynamic.
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = (await res.json()) as ArchiveFile;
    if (parsed.version !== 1 || typeof parsed.anchors !== 'object' || parsed.anchors === null) {
      throw new Error('unrecognized archive format');
    }
    return parsed;
  } catch (err) {
    // The archive is an enrichment, never a requirement: a live dashboard
    // with a short chart beats no dashboard at all.
    console.warn(`[dashboard] history archive unavailable (${ARCHIVE_URL}):`, (err as Error).message);
    return null;
  }
}

function unionBy<T>(a: T[], b: T[], keyOf: (item: T) => string): T[] {
  const byKey = new Map(a.map((item) => [keyOf(item), item]));
  for (const item of b) byKey.set(keyOf(item), item);
  return Array.from(byKey.values()).sort((x, y) => keyOf(x).localeCompare(keyOf(y)));
}

/** Skips entries an older archive may hold in a shape we can't read. The
 * archive enriches the live view; it must never be able to break it. */
function toSlashEvents(entries: Array<{ timestamp: string; amountStroops: string }>): SlashEvent[] {
  return entries.flatMap((e) => {
    if (!/^-?\d+$/.test(String(e.amountStroops))) return [];
    return [{ timestamp: e.timestamp, amount: stroopsToXlm(BigInt(e.amountStroops)) }];
  });
}

const scoreKey = (p: ScorePoint) => `${p.timestamp}|${p.score}`;
const slashKey = (e: SlashEvent) => `${e.timestamp}|${e.amount}`;

/** Unions archived history into the live anchors. Live data wins nothing and
 * loses nothing — both sides are merged, so a gap in either is filled by the
 * other. */
export function mergeArchiveInto(
  anchors: AnchorViewModel[],
  archive: ArchiveFile | null,
): AnchorViewModel[] {
  if (!archive) return anchors;
  return anchors.map((anchor) => {
    const archived = archive.anchors[anchor.anchorId];
    if (!archived) return anchor;
    return {
      ...anchor,
      scoreHistory: unionBy(anchor.scoreHistory, archived.scoreHistory, scoreKey),
      slashEvents: unionBy(anchor.slashEvents, toSlashEvents(archived.slashEvents), slashKey),
    };
  });
}
