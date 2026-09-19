import { describe, expect, it } from 'vitest';
import { matchesQuery } from './search';

const a = { name: 'Grupo Anchor S.A.', domain: 'api.anclap.com', anchorId: 'api_anclap_com' };

describe('matchesQuery', () => {
  it('matches name, domain or id, in any case', () => {
    for (const q of ['grupo', 'ANCHOR', 'anclap', 'api.anclap.com', 'api_anclap', 'grupo anclap']) {
      expect(matchesQuery(a, q), q).toBe(true);
    }
  });
  it('ignores punctuation and accents', () => {
    expect(matchesQuery(a, 'anchor sa')).toBe(true);
    expect(matchesQuery(a, 'S.A.')).toBe(true);
    expect(matchesQuery({ name: 'Muyu Nétwork', domain: 'muyu.io', anchorId: 'muyu' }, 'network')).toBe(true);
  });
  it('requires every word', () => {
    expect(matchesQuery(a, 'grupo moneygram')).toBe(false);
    expect(matchesQuery(a, 'moneygram')).toBe(false);
  });
  it('matches everything on an empty query', () => {
    expect(matchesQuery(a, '   ')).toBe(true);
  });
});
