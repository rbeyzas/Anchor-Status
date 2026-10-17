import { describe, expect, it } from 'vitest';
import { mainnetFromChain, testnetFromChain, type ChainAnchor } from './chain-anchors.js';

const NOW = '2026-10-17T00:00:00.000Z';
const chain: ChainAnchor[] = [
  { anchor_id: 'mykobo', name: 'Mykobo', domain: 'mykobo.co', source_type: 'RealMainnet' },
  { anchor_id: 'zeam_money', name: 'Zeam Money', domain: 'zeam.money', source_type: 'RealMainnet' },
  { anchor_id: 'stellar_test_anchor', name: 'Stellar Test Anchor', domain: 'testanchor.stellar.org', source_type: 'RealTestnet' },
  { anchor_id: 'tr_mock_anchor_fly_dev_testnet', name: 'TR Mock', domain: 'tr-mock-anchor.fly.dev', source_type: 'RealTestnet' },
  { anchor_id: 'mock_anchor_1', name: 'Mock 1', domain: 'mock-anchor-1.local', source_type: 'SimulatedMock' },
];

describe('mainnetFromChain', () => {
  it('keeps only registered mainnet anchors, with the ids the registry uses', () => {
    const out = mainnetFromChain(chain, [], NOW);
    expect(out.map((a) => a.anchor_id)).toEqual(['mykobo', 'zeam_money']);
    expect(out[0]).toEqual({ anchor_id: 'mykobo', name: 'Mykobo', domain: 'mykobo.co', first_seen: NOW });
  });

  it('carries over liveness found by this host, matched by id or by domain', () => {
    const local = [
      { anchor_id: 'mykobo', name: 'x', domain: 'mykobo.co', first_seen: 'a', last_seen_live: 'live-1', transfer_host: 'api.mykobo.co' },
      // discovery derived another id for the same domain
      { anchor_id: 'zeam', name: 'x', domain: 'zeam.money', first_seen: 'b', last_seen_live: 'live-2' },
      // discovered but not registered: must not be probed, its reports would be rejected
      { anchor_id: 'unregistered_co', name: 'x', domain: 'unregistered.co', first_seen: 'c', last_seen_live: 'live-3' },
    ];
    const out = mainnetFromChain(chain, local, NOW);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ anchor_id: 'mykobo', last_seen_live: 'live-1', transfer_host: 'api.mykobo.co', first_seen: 'a' });
    expect(out[1]).toMatchObject({ anchor_id: 'zeam_money', name: 'Zeam Money', last_seen_live: 'live-2' });
  });
});

describe('testnetFromChain', () => {
  it('lists registered testnet anchors except the reference, keeping a chosen asset', () => {
    const local = [
      { anchor_id: 'tr_mock_anchor_fly_dev_testnet', name: 'x', domain: 'tr-mock-anchor.fly.dev', asset_code: 'USDC', first_seen: 'old', origin: 'applied' as const },
    ];
    expect(testnetFromChain(chain, local, 'stellar_test_anchor', NOW)).toEqual([
      { anchor_id: 'tr_mock_anchor_fly_dev_testnet', name: 'TR Mock', domain: 'tr-mock-anchor.fly.dev', asset_code: 'USDC', first_seen: 'old', origin: 'applied' },
    ]);
  });

  it('leaves the asset to the probe when none was chosen yet', () => {
    expect(testnetFromChain(chain, [], 'stellar_test_anchor', NOW)[0]).not.toHaveProperty('asset_code');
  });
});
