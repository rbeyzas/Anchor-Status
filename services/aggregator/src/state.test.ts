import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadState, saveState } from './state.js';

describe('state', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns an empty set when the state file does not exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agg-state-'));
    const state = loadState(path.join(tmpDir, 'missing.json'));
    expect(state.size).toBe(0);
  });

  it('round-trips a set of keys through save and load', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agg-state-'));
    const statePath = path.join(tmpDir, 'state.json');
    saveState(statePath, new Set(['a', 'b', 'c']));
    const loaded = loadState(statePath);
    expect(Array.from(loaded).sort()).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty set for a corrupted state file rather than throwing', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agg-state-'));
    const statePath = path.join(tmpDir, 'state.json');
    fs.writeFileSync(statePath, '{not valid json');
    expect(loadState(statePath).size).toBe(0);
  });
});
