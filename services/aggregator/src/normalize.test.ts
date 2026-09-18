import { describe, expect, it } from 'vitest';
import {
  dedupKey,
  normalizeMockAnchorLogEntry,
  normalizePassiveMonitorProfile,
  normalizeTestnetProbeResult,
} from './normalize.js';
import type { MockAnchorLogEntry, PassiveMonitorProfile, TestnetProbeResult } from './types.js';

describe('normalizePassiveMonitorProfile', () => {
  it('marks an anchor with no observed payments as a failure, using the full lookback window as settlement_seconds', () => {
    const profile: PassiveMonitorProfile = {
      anchor_id: 'anchor_a',
      domain: 'a.example.com',
      source_type: 'RealMainnet',
      lookback_days: 7,
      overall: { txCount: 0, avgFrequencyPerDay: 0 },
      generated_at: '2026-01-01T00:00:00.000Z',
    };
    const report = normalizePassiveMonitorProfile(profile);
    expect(report.success).toBe(false);
    expect(report.settlement_seconds).toBe(7 * 24 * 60 * 60);
    expect(report.source_type).toBe('RealMainnet');
  });

  it('marks an active anchor as a success with a proxy settlement time derived from frequency', () => {
    const profile: PassiveMonitorProfile = {
      anchor_id: 'anchor_a',
      domain: 'a.example.com',
      source_type: 'RealMainnet',
      lookback_days: 7,
      overall: { txCount: 14, avgFrequencyPerDay: 2 },
      generated_at: '2026-01-01T00:00:00.000Z',
    };
    const report = normalizePassiveMonitorProfile(profile);
    expect(report.success).toBe(true);
    // 7 days / 14 tx = 0.5 days between tx = 43200s
    expect(report.settlement_seconds).toBe(43200);
  });

  it('derives a stable dedup key from anchor_id + generated_at', () => {
    const profile: PassiveMonitorProfile = {
      anchor_id: 'anchor_a',
      domain: 'a.example.com',
      source_type: 'RealMainnet',
      lookback_days: 7,
      overall: { txCount: 1, avgFrequencyPerDay: 1 },
      generated_at: '2026-01-01T00:00:00.000Z',
    };
    const report = normalizePassiveMonitorProfile(profile);
    expect(dedupKey(report)).toBe('RealMainnet:anchor_a:2026-01-01T00:00:00.000Z');
  });
});

describe('normalizeTestnetProbeResult', () => {
  it('passes success/settlement_seconds/timestamp through unchanged', () => {
    const result: TestnetProbeResult = {
      anchor_id: 'testanchor.stellar.org',
      domain: 'testanchor.stellar.org',
      source_type: 'RealTestnet',
      success: true,
      settlement_seconds: 12.5,
      timestamp: '2026-02-01T00:00:00.000Z',
      final_transaction_status: 'completed',
    };
    const report = normalizeTestnetProbeResult(result);
    expect(report).toMatchObject({
      anchor_id: 'testanchor.stellar.org',
      success: true,
      settlement_seconds: 12.5,
      source_type: 'RealTestnet',
    });
  });
});

describe('normalizeMockAnchorLogEntry', () => {
  it('uses transaction_id for the dedup key when present', () => {
    const entry: MockAnchorLogEntry = {
      anchor_id: 'mock_anchor_1',
      success: true,
      settlement_seconds: 8,
      timestamp: '2026-03-01T00:00:00.000Z',
      source_type: 'SimulatedMock',
      transaction_id: 'abc-123',
    };
    const report = normalizeMockAnchorLogEntry(entry);
    expect(dedupKey(report)).toBe('SimulatedMock:abc-123');
  });

  it('falls back to anchor_id+timestamp when transaction_id is absent', () => {
    const entry: MockAnchorLogEntry = {
      anchor_id: 'mock_anchor_1',
      success: false,
      settlement_seconds: 8,
      timestamp: '2026-03-01T00:00:00.000Z',
      source_type: 'SimulatedMock',
    };
    const report = normalizeMockAnchorLogEntry(entry);
    expect(dedupKey(report)).toBe('SimulatedMock:mock_anchor_1:2026-03-01T00:00:00.000Z');
  });
});

describe('evidence hashes', () => {
  it('carries the evidence hash through to the report', async () => {
    const { normalizeMainnetProbeResult, normalizeTestnetProbeResult } = await import('./normalize.js');
    const hash = 'ab'.repeat(32);
    expect(
      normalizeMainnetProbeResult({ anchor_id: 'a', success: true, settlement_seconds: 1, timestamp: 't', evidence_hash: hash })
        .evidence_hash,
    ).toBe(hash);
    expect(
      normalizeTestnetProbeResult({
        anchor_id: 'a',
        domain: 'd',
        source_type: 'RealTestnet',
        success: true,
        settlement_seconds: 20,
        timestamp: 't',
        final_transaction_status: 'completed',
        evidence_hash: hash,
      }).evidence_hash,
    ).toBe(hash);
  });
});
