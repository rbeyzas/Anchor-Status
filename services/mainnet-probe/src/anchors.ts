import fs from 'node:fs';
import path from 'node:path';

export interface MainnetAnchor {
  anchor_id: string;
  name: string;
  domain: string;
  /** Transfer server host, used to recognise one operator behind several domains. */
  transfer_host?: string;
  first_seen: string;
  /** Last time discovery found its /info answering. */
  last_seen_live?: string;
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
 * Merges this run's live anchors into the known list. Anchors are only ever
 * added: one that stops answering must stay on the list, or its outage would
 * never be measured and its score would simply freeze at its last value.
 */
export function mergeAnchors(known: MainnetAnchor[], live: MainnetAnchor[], now: string): MainnetAnchor[] {
  const byId = new Map(known.map((a) => [a.anchor_id, { ...a }]));
  const knownHosts = new Map(known.filter((a) => a.transfer_host).map((a) => [a.transfer_host!, a.anchor_id]));
  for (const a of live) {
    // Same operator already tracked under another domain: refresh, don't duplicate.
    const id = byId.has(a.anchor_id) ? a.anchor_id : (a.transfer_host && knownHosts.get(a.transfer_host)) || a.anchor_id;
    const existing = byId.get(id);
    if (existing) {
      existing.last_seen_live = now;
      existing.transfer_host ??= a.transfer_host;
    } else {
      byId.set(id, { ...a, first_seen: now, last_seen_live: now });
      if (a.transfer_host) knownHosts.set(a.transfer_host, id);
    }
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
