import { describe, expect, it } from 'vitest';
import { mergeMockDemoInto } from './mock-demo';
import type { AnchorViewModel } from './types';

const base = (anchorId: string, sourceType: AnchorViewModel['sourceType']): AnchorViewModel => ({
  anchorId, name: anchorId, domain: 'x.test', sourceType, stake: 0, score: 1, scoreHistory: [], slashEvents: [], lastUpdated: '',
});

describe('mergeMockDemoInto', () => {
  it('gives each mock anchor a card and 29 days of history', () => {
    const [a] = mergeMockDemoInto([base('mock_anchor_3', 'SimulatedMock')]);
    expect(a.card?.flags).toContain('OUTAGE');
    expect(a.scoreHistory).toHaveLength(29);
  });
  it('never touches a real anchor, even one with a mock id', () => {
    const real = base('mock_anchor_1', 'RealMainnet');
    expect(mergeMockDemoInto([real])[0]).toBe(real);
  });
});
