import { describe, expect, it } from 'vitest';
import { assignAliases, operatorKey } from './aliases.js';
import type { MainnetAnchor } from './anchors.js';
import type { StatusFile } from './status.js';

const anchor = (id: string, domain: string, first_seen: string): MainnetAnchor => ({ anchor_id: id, name: id, domain, first_seen });
const ANCLAP = operatorKey('https://api.anclap.com/transfer24', 'GDVHOU4AF2QINLYETV2YFC7YWPRVXN4SKR6SOJZ7LAWODJIZJ7ZPJUER')!;

function status(entries: Record<string, { operator?: string; alias_of?: string }>): StatusFile {
  return {
    generated_at: '',
    anchors: Object.fromEntries(Object.entries(entries).map(([id, e]) => [id, { domain: id, dormant: false, ...e }])),
  };
}

describe('operatorKey', () => {
  it('ignores case and a trailing slash, and needs the same signing key', () => {
    expect(operatorKey('https://API.anclap.com/transfer24/', 'GDVHOU4AF2QINLYETV2YFC7YWPRVXN4SKR6SOJZ7LAWODJIZJ7ZPJUER')).toBe(ANCLAP);
    expect(operatorKey('https://api.anclap.com/transfer24', 'GOTHER')).not.toBe(ANCLAP);
    expect(operatorKey(undefined, 'G')).toBeUndefined();
  });
});

describe('assignAliases', () => {
  const anchors = [
    anchor('api_anclap_com', 'api.anclap.com', '2026-09-18T12:49:53Z'),
    anchor('anclap_com', 'anclap.com', '2026-09-18T19:06:35Z'),
    anchor('moneygram', 'stellar.moneygram.com', '2026-09-17T00:00:00Z'),
  ];
  const dormant = (a: MainnetAnchor) => a.anchor_id === 'anclap_com';

  it('makes the later, dormant domain an alias of the one measured every round', () => {
    const s = status({ api_anclap_com: { operator: ANCLAP }, anclap_com: { operator: ANCLAP }, moneygram: { operator: 'mg|G' } });
    assignAliases(s, anchors, dormant);
    expect(s.anchors.anclap_com.alias_of).toBe('api_anclap_com');
    expect(s.anchors.api_anclap_com.alias_of).toBeUndefined();
    expect(s.anchors.moneygram.alias_of).toBeUndefined();
  });

  it('keeps an existing pairing even when the other side would now win the tie-break', () => {
    const s = status({ api_anclap_com: { operator: ANCLAP, alias_of: 'anclap_com' }, anclap_com: { operator: ANCLAP } });
    assignAliases(s, anchors, () => false);
    expect(s.anchors.api_anclap_com.alias_of).toBe('anclap_com');
  });

  it('clears the alias when the operators diverge', () => {
    const s = status({ api_anclap_com: { operator: ANCLAP }, anclap_com: { operator: 'somewhere-else|G', alias_of: 'api_anclap_com' } });
    assignAliases(s, anchors, dormant);
    expect(s.anchors.anclap_com.alias_of).toBeUndefined();
  });

  it('leaves anchors without a known operator alone', () => {
    const s = status({ api_anclap_com: { operator: ANCLAP }, anclap_com: {} });
    assignAliases(s, anchors, dormant);
    expect(s.anchors.anclap_com.alias_of).toBeUndefined();
  });
});
