import { describe, expect, it } from 'vitest';
import { needsAttest } from './attest-keys.js';

describe('needsAttest', () => {
  it('attests a published key the registry lacks or holds differently', () => {
    expect(needsAttest('GNEW', null, null)).toBe(true);
    expect(needsAttest('GNEW', 'GOLD', null)).toBe(true);
  });
  it('does nothing without a key, when it is on-chain, or already attested by us', () => {
    expect(needsAttest(null, null, null)).toBe(false);
    expect(needsAttest('GKEY', 'GKEY', null)).toBe(false);
    expect(needsAttest('GKEY', null, 'GKEY')).toBe(false);
  });
});
