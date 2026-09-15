import fs from 'node:fs';
import path from 'node:path';

/** Local dedup ledger of dedup_ids already submitted to PerformanceOracle. */
export function loadState(statePath: string): Set<string> {
  if (!fs.existsSync(statePath)) {
    return new Set();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

export function saveState(statePath: string, submitted: Set<string>): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(Array.from(submitted), null, 2));
}
