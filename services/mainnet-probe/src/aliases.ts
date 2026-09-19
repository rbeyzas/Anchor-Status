// Several domains can front one operator: anclap.com and api.anclap.com
// publish the same transfer server and the same SIGNING_KEY. Measuring both
// would count one anchor twice. The later ones become aliases of one
// canonical entry: never dropped (they stay registered, with their history),
// but no longer scored on their own.
import type { MainnetAnchor } from './anchors.js';
import type { StatusFile } from './status.js';

/** One operator: the transfer server its toml names and the key it signs
 * with. Both must match, so two tenants of a shared platform with their own
 * keys stay separate. */
export function operatorKey(transferServer: string | undefined, signingKey: string | undefined): string | undefined {
  if (!transferServer) return undefined;
  const url = transferServer.trim().toLowerCase().replace(/\/+$/, '');
  return `${url}|${signingKey?.trim() ?? ''}`;
}

/**
 * Sets `alias_of` on every anchor that shares its operator with another,
 * pointing at the canonical one, and clears it where the operator no longer
 * matches. An existing pairing is kept, so the canonical entry does not
 * flip back and forth; for a new group it is the one we measure every
 * round (not dormant), then the one found first, then the shortest domain.
 */
export function assignAliases(status: StatusFile, anchors: MainnetAnchor[], isDormant: (a: MainnetAnchor) => boolean): void {
  const byId = new Map(anchors.map((a) => [a.anchor_id, a]));
  const groups = new Map<string, string[]>();
  for (const [id, s] of Object.entries(status.anchors)) {
    if (!s.operator || !byId.has(id)) continue;
    groups.set(s.operator, [...(groups.get(s.operator) ?? []), id]);
  }

  const aliased = new Set<string>();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const kept = ids.map((id) => status.anchors[id].alias_of).find((t) => t && ids.includes(t) && !status.anchors[t].alias_of);
    const canonical =
      kept ??
      [...ids].sort((x, y) => {
        const a = byId.get(x)!;
        const b = byId.get(y)!;
        return (
          Number(isDormant(a)) - Number(isDormant(b)) ||
          a.first_seen.localeCompare(b.first_seen) ||
          a.domain.length - b.domain.length ||
          x.localeCompare(y)
        );
      })[0];
    for (const id of ids) {
      if (id === canonical) continue;
      status.anchors[id].alias_of = canonical;
      aliased.add(id);
    }
  }
  for (const [id, s] of Object.entries(status.anchors)) {
    if (!aliased.has(id)) delete s.alias_of;
  }
  const canonicals = new Set([...aliased].map((id) => status.anchors[id].alias_of!));
  for (const id of canonicals) delete status.anchors[id].alias_of;
}
