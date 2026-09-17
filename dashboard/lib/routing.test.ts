import { describe, expect, it } from 'vitest';
import { loadRampAnchors, MIN_ROUTABLE_SCORE, rankRoutes, type RampAnchorConfig } from './routing';
import type { AnchorViewModel } from './types';

function anchor(anchorId: string, score: number, stake = 1000): AnchorViewModel {
  return {
    anchorId,
    name: anchorId,
    domain: `${anchorId}.example`,
    sourceType: 'RealTestnet',
    stake,
    score,
    scoreHistory: [],
    slashEvents: [],
    lastUpdated: '2026-09-18T00:00:00.000Z',
  };
}

function cfg(anchorId: string): RampAnchorConfig {
  return { anchorId, domain: `${anchorId}.example`, assetCode: 'TRYB', fiat: 'TRY' };
}

describe('rankRoutes', () => {
  it('puts the highest-scoring eligible anchor first', () => {
    const routes = rankRoutes([anchor('a', 70), anchor('b', 95), anchor('c', 60)], [cfg('a'), cfg('b'), cfg('c')]);
    expect(routes.map((r) => r.anchor.anchorId)).toEqual(['b', 'a', 'c']);
    expect(routes.every((r) => r.eligible)).toBe(true);
  });

  it('marks anchors below the slash threshold ineligible and ranks them last', () => {
    const routes = rankRoutes([anchor('bad', 40), anchor('good', 80)], [cfg('bad'), cfg('good')]);
    expect(routes[0].anchor.anchorId).toBe('good');
    expect(routes[1].eligible).toBe(false);
    expect(routes[1].reason).toContain(String(MIN_ROUTABLE_SCORE));
  });

  it('treats a score exactly at the threshold as eligible', () => {
    const [route] = rankRoutes([anchor('edge', MIN_ROUTABLE_SCORE)], [cfg('edge')]);
    expect(route.eligible).toBe(true);
  });

  it('breaks score ties by stake', () => {
    const routes = rankRoutes([anchor('small', 90, 10), anchor('big', 90, 5000)], [cfg('small'), cfg('big')]);
    expect(routes[0].anchor.anchorId).toBe('big');
  });

  it('never offers an anchor that has no on-chain record', () => {
    const routes = rankRoutes([anchor('known', 90)], [cfg('known'), cfg('unregistered')]);
    expect(routes.map((r) => r.anchor.anchorId)).toEqual(['known']);
  });
});

describe('loadRampAnchors', () => {
  it('falls back to the default testnet anchor on missing or malformed config', () => {
    expect(loadRampAnchors(undefined)[0].domain).toBe('testanchor.stellar.org');
    expect(loadRampAnchors('not json')[0].domain).toBe('testanchor.stellar.org');
  });

  it('parses a configured anchor list', () => {
    const list = loadRampAnchors(JSON.stringify([cfg('try_anchor')]));
    expect(list[0].anchorId).toBe('try_anchor');
  });
});
