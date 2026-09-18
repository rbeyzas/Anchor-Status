import { describe, expect, it } from 'vitest';
import { anchorIdFor, dedupeByTransferHost, mergeAnchors, type MainnetAnchor } from './anchors.js';

describe('anchorIdFor', () => {
  it('produces a Soroban Symbol-safe id', () => {
    expect(anchorIdFor('pubnet-sep.latamex.com')).toBe('pubnet_sep_latamex_com');
    expect(anchorIdFor('API.Anclap.com')).toBe('api_anclap_com');
  });

  it('caps the id at 32 characters without a trailing underscore', () => {
    const id = anchorIdFor('a-very-long-subdomain.of-some-anchor.example.com');
    expect(id.length).toBeLessThanOrEqual(32);
    expect(id.endsWith('_')).toBe(false);
  });
});

const anchor = (id: string, extra: Partial<MainnetAnchor> = {}): MainnetAnchor => ({
  anchor_id: id,
  name: id,
  domain: `${id}.example`,
  first_seen: '2026-09-01T00:00:00Z',
  ...extra,
});

describe('mergeAnchors', () => {
  it('keeps an anchor that stopped answering, so its outage keeps being measured', () => {
    const merged = mergeAnchors([anchor('mykobo')], [], '2026-09-18T00:00:00Z');
    expect(merged.map((a) => a.anchor_id)).toEqual(['mykobo']);
  });

  it('adds newly live anchors and marks them seen', () => {
    const merged = mergeAnchors([], [anchor('anclap')], '2026-09-18T00:00:00Z');
    expect(merged[0]).toMatchObject({ anchor_id: 'anclap', last_seen_live: '2026-09-18T00:00:00Z' });
  });

  it('does not duplicate an operator seen again under another domain', () => {
    const known = [anchor('sl8_online', { transfer_host: 'api.sl8.online' })];
    const merged = mergeAnchors(known, [anchor('uaf_sl8_online', { transfer_host: 'api.sl8.online' })], 'now');
    expect(merged.map((a) => a.anchor_id)).toEqual(['sl8_online']);
  });
});

describe('dedupeByTransferHost', () => {
  it('keeps one domain per backend, preferring a registered one, then the shortest', () => {
    const picked = dedupeByTransferHost([
      { domain: 'sslx.sl8.online', transfer_host: 'x' },
      { domain: 'sl8.online', transfer_host: 'x' },
      { domain: 'kbtrading.org', transfer_host: 'y' },
      { domain: 'clpx.finance', transfer_host: 'y', registered: true },
    ]);
    expect(picked.map((c) => c.domain).sort()).toEqual(['clpx.finance', 'sl8.online']);
  });
});
