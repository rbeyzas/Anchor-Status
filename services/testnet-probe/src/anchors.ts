// The testnet anchors that get the money-flow check every round: the
// reference anchor, plus every one admitted by application. Kept apart from
// mainnet's list: different network, different check, different file.
import fs from 'node:fs';
import path from 'node:path';

export interface TestnetAnchor {
  anchor_id: string;
  name: string;
  domain: string;
  /** Asset to move; otherwise the first depositable one the toml lists. */
  asset_code?: string;
  first_seen: string;
  /** 'reference': configured; 'applied': admitted through /apply. */
  origin: 'reference' | 'applied';
}

export interface TestnetAnchorsFile {
  updated_at: string;
  anchors: TestnetAnchor[];
}

export function loadTestnetAnchors(filePath: string, reference: TestnetAnchor): TestnetAnchor[] {
  let listed: TestnetAnchor[] = [];
  if (fs.existsSync(filePath)) {
    try {
      listed = (JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TestnetAnchorsFile).anchors ?? [];
    } catch {
      listed = [];
    }
  }
  // The reference anchor is always measured, whatever the file holds.
  return [reference, ...listed.filter((a) => a.anchor_id !== reference.anchor_id)];
}

export function saveTestnetAnchors(filePath: string, anchors: TestnetAnchor[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  const file: TestnetAnchorsFile = { updated_at: new Date().toISOString(), anchors };
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, filePath);
}

/** A Soroban Symbol-safe id for a testnet anchor: [a-z0-9_], at most 32
 * characters, always ending in _testnet so it can never collide with the
 * same domain's mainnet id, and unique among `taken`. */
export function testnetAnchorId(domain: string, taken: Set<string>): string {
  const slug = domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '_testnet' : `_testnet${n}`;
    const id = `${slug.slice(0, 32 - suffix.length).replace(/_+$/, '')}${suffix}`;
    if (!taken.has(id)) return id;
  }
}
