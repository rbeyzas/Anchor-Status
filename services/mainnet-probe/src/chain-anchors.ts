// The anchor lists a secondary reporter host measures, taken from the
// on-chain registry instead of the primary host's files. Every reporter must
// score the same anchor ids, and the registry is the one list both hosts can
// read without trusting each other. Discovery still runs on the secondary,
// read-only, because it decides which anchors are dormant (probed every 6 h
// instead of every 20 min); this module keeps that liveness and drops every
// id the registry does not hold.
import type { MainnetAnchor } from './anchors.js';

export interface ChainAnchor {
  anchor_id: string;
  name: string;
  domain: string;
  source_type: 'RealMainnet' | 'RealTestnet' | 'SimulatedMock';
}

/** A testnet anchor as testnet-probe's anchors file stores it. */
export interface TestnetListEntry {
  anchor_id: string;
  name: string;
  domain: string;
  asset_code?: string;
  first_seen: string;
  origin: 'reference' | 'applied';
}

/** The registry's mainnet anchors, carrying over what this host's own
 * discovery learnt about each (liveness, transfer host, directory flag),
 * matched by id first and by domain when discovery derived another id. */
export function mainnetFromChain(chain: ChainAnchor[], local: MainnetAnchor[], now: string): MainnetAnchor[] {
  const byId = new Map(local.map((a) => [a.anchor_id, a]));
  const byDomain = new Map(local.map((a) => [a.domain, a]));
  return chain
    .filter((c) => c.source_type === 'RealMainnet')
    .map((c) => {
      const seen = byId.get(c.anchor_id) ?? byDomain.get(c.domain);
      return { ...(seen ?? { first_seen: now }), anchor_id: c.anchor_id, name: c.name, domain: c.domain };
    })
    .sort((x, y) => x.anchor_id.localeCompare(y.anchor_id));
}

/** The registry's testnet anchors other than the reference one, which
 * testnet-probe always adds itself. An asset already chosen for an anchor
 * is kept; otherwise the probe picks the first depositable one. */
export function testnetFromChain(
  chain: ChainAnchor[],
  local: TestnetListEntry[],
  referenceId: string,
  now: string,
): TestnetListEntry[] {
  const byId = new Map(local.map((a) => [a.anchor_id, a]));
  return chain
    .filter((c) => c.source_type === 'RealTestnet' && c.anchor_id !== referenceId)
    .map((c) => {
      const seen = byId.get(c.anchor_id);
      return {
        anchor_id: c.anchor_id,
        name: c.name,
        domain: c.domain,
        ...(seen?.asset_code ? { asset_code: seen.asset_code } : {}),
        first_seen: seen?.first_seen ?? now,
        origin: 'applied' as const,
      };
    })
    .sort((x, y) => x.anchor_id.localeCompare(y.anchor_id));
}
