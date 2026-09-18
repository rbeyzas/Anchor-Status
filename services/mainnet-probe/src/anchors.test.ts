import { describe, expect, it } from 'vitest';
import {
  anchorIdFor,
  cleanDirectoryName,
  dedupeByTransferHost,
  isDormant,
  listingFrom,
  mergeAnchors,
  type Candidate,
  type MainnetAnchor,
} from './anchors.js';

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

const candidate = (id: string, extra: Partial<Candidate> = {}): Candidate => ({
  anchor_id: id,
  name: id,
  domain: `${id}.example`,
  live: true,
  ...extra,
});

describe('mergeAnchors', () => {
  it('keeps an anchor that stopped answering, so its outage keeps being measured', () => {
    const merged = mergeAnchors([anchor('mykobo')], [], '2026-09-18T00:00:00Z');
    expect(merged.map((a) => a.anchor_id)).toEqual(['mykobo']);
  });

  it('adds newly live anchors and marks them seen', () => {
    const merged = mergeAnchors([], [candidate('anclap')], '2026-09-18T00:00:00Z');
    expect(merged[0]).toMatchObject({ anchor_id: 'anclap', last_seen_live: '2026-09-18T00:00:00Z' });
  });

  it('adds a dead directory anchor with its label instead of leaving it out', () => {
    const merged = mergeAnchors(
      [],
      [candidate('cowrie_exchange', { live: false, listing: 'abandoned', fromDirectory: true })],
      'now',
    );
    expect(merged[0]).toMatchObject({ anchor_id: 'cowrie_exchange', listing: 'abandoned' });
    expect(merged[0].last_seen_live).toBeUndefined();
  });

  it('refreshes a directory label, and clears it when the directory stops flagging', () => {
    const flagged = mergeAnchors([anchor('x')], [candidate('x', { live: false, listing: 'unsafe', fromDirectory: true })], 'now');
    expect(flagged[0].listing).toBe('unsafe');
    const cleared = mergeAnchors(flagged, [candidate('x', { live: false, fromDirectory: true })], 'now');
    expect(cleared[0].listing).toBeUndefined();
  });

  it('does not duplicate an operator seen again under another domain', () => {
    const known = [anchor('sl8_online', { transfer_host: 'api.sl8.online' })];
    const merged = mergeAnchors(known, [candidate('uaf_sl8_online', { transfer_host: 'api.sl8.online' })], 'now');
    expect(merged.map((a) => a.anchor_id)).toEqual(['sl8_online']);
  });
});

describe('directory labels', () => {
  it('reads abandoned and discontinued from the directory name', () => {
    expect(listingFrom('CowrieExchange - Abandoned')).toBe('abandoned');
    expect(listingFrom('nTokens - Discontinued')).toBe('abandoned');
    expect(listingFrom('Anclap')).toBeUndefined();
  });

  it('reads the unsafe tag', () => {
    expect(listingFrom('VCBear', ['anchor', 'issuer', 'unsafe'])).toBe('unsafe');
  });

  it('strips the status suffix from the display name', () => {
    expect(cleanDirectoryName('CowrieExchange - Abandoned')).toBe('CowrieExchange');
    expect(cleanDirectoryName('Papaya - Discontinued')).toBe('Papaya');
  });
});

describe('isDormant', () => {
  const now = new Date('2026-09-18T12:00:00Z');
  it('is dormant when never seen answering, or not for over a week', () => {
    expect(isDormant(anchor('a'), now)).toBe(true);
    expect(isDormant(anchor('a', { last_seen_live: '2026-09-01T00:00:00Z' }), now)).toBe(true);
    expect(isDormant(anchor('a', { last_seen_live: '2026-09-17T00:00:00Z' }), now)).toBe(false);
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
