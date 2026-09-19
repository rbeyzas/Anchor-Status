import { describe, expect, it } from 'vitest';
import { parseAnchorToml } from './toml.js';

describe('parseAnchorToml', () => {
  it('reads an anchor with no currencies', () => {
    const t = parseAnchorToml('TRANSFER_SERVER_SEP0024 = "https://a.example/sep24/"');
    expect(t).toMatchObject({ sep24: 'https://a.example/sep24', currencies: [] });
  });

  it('reads currencies, skipping entries without a code', () => {
    const t = parseAnchorToml(`
[[CURRENCIES]]
code = "USDC"
issuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"

[[CURRENCIES]]
code = "ARST"
issuer = "GCSAZVWXZKWS4XS223M5F54H2B6XPIIXZZGP7KEAIU6YSL5HDRGCI3DG"
anchor_asset_type = "FIAT"
anchor_asset = "ARS"
is_asset_anchored = true

[[CURRENCIES]]
name = "no code"
`);
    expect(t.currencies).toEqual([
      { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
      {
        code: 'ARST',
        issuer: 'GCSAZVWXZKWS4XS223M5F54H2B6XPIIXZZGP7KEAIU6YSL5HDRGCI3DG',
        anchor_asset_type: 'fiat',
        anchor_asset: 'ARS',
        is_asset_anchored: true,
      },
    ]);
  });
});
