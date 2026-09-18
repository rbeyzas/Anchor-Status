import fs from 'node:fs';
import path from 'node:path';

/** How StellarExpert's directory lists the anchor, if it flags it. */
export type Listing = 'abandoned' | 'unsafe';

export interface MainnetAnchor {
  anchor_id: string;
  name: string;
  domain: string;
  /** Transfer server host, used to recognise one operator behind several domains. */
  transfer_host?: string;
  first_seen: string;
  /** Last time discovery found its /info answering. */
  last_seen_live?: string;
  /** Directory flag. Anchors are tracked whatever their listing — flagged,
   * not dropped — so the dashboard can say why one is failing. */
  listing?: Listing;
}

/** One discovery observation: an anchor candidate, live or not. */
export interface Candidate extends Omit<MainnetAnchor, 'first_seen' | 'last_seen_live'> {
  live: boolean;
  /** true when the directory was consulted for this domain, so an absent
   * `listing` means "no longer flagged" rather than "unknown". */
  fromDirectory?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Not seen answering for a week (or ever): probed less often, never dropped. */
export function isDormant(a: MainnetAnchor, now: Date): boolean {
  return !a.last_seen_live || now.getTime() - Date.parse(a.last_seen_live) > 7 * DAY_MS;
}

/** Directory name → listing flag: "CowrieExchange - Abandoned", "nTokens - Discontinued". */
export function listingFrom(name: string | undefined, tags: string[] = []): Listing | undefined {
  if (name && /abandon|discontinu|deprecat|defunct|shut ?down|closed|inactive/i.test(name)) return 'abandoned';
  if (tags.some((t) => t === 'unsafe' || t === 'malicious')) return 'unsafe';
  return undefined;
}

/** "CowrieExchange - Abandoned" → "CowrieExchange": the status is shown as a label. */
export function cleanDirectoryName(name: string): string {
  return name.replace(/\s*[-–(]\s*(abandoned|discontinued|deprecated|defunct|inactive)\)?\s*$/i, '').trim();
}

export interface AnchorsFile {
  generated_at: string;
  anchors: MainnetAnchor[];
}

/** Soroban Symbol-safe id from a domain: [a-z0-9_], at most 32 chars. */
export function anchorIdFor(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
    .replace(/_+$/, '');
}

export function loadAnchorsFile(filePath: string): AnchorsFile | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AnchorsFile;
}

export function saveAnchorsFile(filePath: string, file: AnchorsFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, filePath);
}

/**
 * Merges this run's candidates into the known list. Anchors are only ever
 * added: one that stops answering must stay on the list, or its outage would
 * never be measured and its score would simply freeze at its last value.
 * Live candidates refresh `last_seen_live`; directory listings are refreshed
 * whenever the directory was consulted.
 */
export function mergeAnchors(known: MainnetAnchor[], candidates: Candidate[], now: string): MainnetAnchor[] {
  const byId = new Map(known.map((a) => [a.anchor_id, { ...a }]));
  const knownHosts = new Map(known.filter((a) => a.transfer_host).map((a) => [a.transfer_host!, a.anchor_id]));
  for (const { live, fromDirectory, ...c } of candidates) {
    // Same operator already tracked under another domain: refresh, don't duplicate.
    const id = byId.has(c.anchor_id) ? c.anchor_id : (c.transfer_host && knownHosts.get(c.transfer_host)) || c.anchor_id;
    let entry = byId.get(id);
    if (!entry) {
      entry = { ...c, first_seen: now };
      if (!entry.listing) delete entry.listing;
      byId.set(id, entry);
      if (c.transfer_host) knownHosts.set(c.transfer_host, id);
    } else {
      entry.transfer_host ??= c.transfer_host;
      if (fromDirectory) {
        if (c.listing) entry.listing = c.listing;
        else delete entry.listing;
      }
    }
    if (live) entry.last_seen_live = now;
  }
  return Array.from(byId.values()).sort((x, y) => x.anchor_id.localeCompare(y.anchor_id));
}

/** One entry per transfer server: several domains in front of the same
 * backend are one operator. Prefers an already-registered id, then the
 * shortest domain. */
export function dedupeByTransferHost<T extends { domain: string; transfer_host?: string; registered?: boolean }>(
  candidates: T[],
): T[] {
  const groups = new Map<string, T[]>();
  for (const c of candidates) {
    const key = c.transfer_host ?? c.domain;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return Array.from(groups.values()).map((group) =>
    group.sort((a, b) => Number(Boolean(b.registered)) - Number(Boolean(a.registered)) || a.domain.length - b.domain.length)[0],
  );
}

interface RegisteredAnchorsFile {
  anchors: Array<{ anchor_id: string; name: string; domain: string; source_type: string }>;
}

/** Mainnet anchors registered by hand in contracts/registered-anchors.json. */
export function registeredMainnetAnchors(filePath: string): Array<{ anchor_id: string; name: string; domain: string }> {
  const file = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RegisteredAnchorsFile;
  return file.anchors.filter((a) => a.source_type === 'RealMainnet');
}
