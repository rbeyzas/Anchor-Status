import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appendResult, isProbeEnvironmentError } from './probe.js';
import type { ProbeResult } from './types.js';

function sampleResult(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    anchor_id: 'testanchor.stellar.org',
    domain: 'testanchor.stellar.org',
    source_type: 'RealTestnet',
    success: true,
    settlement_seconds: 12.3,
    timestamp: new Date().toISOString(),
    final_transaction_status: 'completed',
    ...overrides,
  };
}

describe('appendResult', () => {
  let tmpFile: string;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
    }
  });

  it('creates the results file with a single-element array on first write', () => {
    tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'probe-')), 'log.json');
    appendResult(sampleResult(), tmpFile);
    const written = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    expect(written).toHaveLength(1);
  });

  it('appends to an existing results array rather than overwriting it', () => {
    tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'probe-')), 'log.json');
    appendResult(sampleResult({ success: true }), tmpFile);
    appendResult(sampleResult({ success: false }), tmpFile);
    const written: ProbeResult[] = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    expect(written).toHaveLength(2);
    expect(written[0].success).toBe(true);
    expect(written[1].success).toBe(false);
  });
});

describe('isProbeEnvironmentError', () => {
  it('flags a missing Playwright browser as our problem, not the anchor\'s', () => {
    expect(
      isProbeEnvironmentError(
        "browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell",
      ),
    ).toBe(true);
  });

  it('flags Friendbot being down as our problem', () => {
    expect(isProbeEnvironmentError('Friendbot funding failed (HTTP 503): try again later')).toBe(true);
  });

  it('does not flag a real anchor failure', () => {
    expect(isProbeEnvironmentError('SEP-24 deposit/interactive failed (HTTP 500)')).toBe(false);
    expect(isProbeEnvironmentError('Failed to fetch stellar.toml from https://x/.well-known/stellar.toml: HTTP 404')).toBe(false);
  });
});
