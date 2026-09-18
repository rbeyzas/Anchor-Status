import {
  anchorIdFor,
  cleanDirectoryName,
  dedupeByTransferHost,
  listingFrom,
  loadAnchorsFile,
  mergeAnchors,
  registeredMainnetAnchors,
  saveAnchorsFile,
  type Candidate,
  type Listing,
} from './anchors.js';
import { mapWithConcurrency } from './concurrency.js';
import { config } from './config.js';
import { timedFetch } from './http.js';
import { fetchAnchorToml } from './toml.js';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Paged<T> {
  _embedded?: { records?: T[] };
}

async function fetchAllPages<T extends { paging_token?: string }>(base: string, maxPages: number): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(base);
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);
    const { value: res } = await timedFetch(fetch, url.toString(), { headers: { 'User-Agent': 'anchor-status' } }, 30_000);
    const records = ((await res.json()) as Paged<T>)._embedded?.records ?? [];
    out.push(...records);
    cursor = records[records.length - 1]?.paging_token;
    if (records.length < 200 || !cursor) break;
  }
  return out;
}

/** Issuer home domains of StellarExpert's top-rated assets: finds anchors that
 * are live and actually used, whether or not anyone tagged them. */
async function ratedAssetDomains(): Promise<Set<string>> {
  const records = await fetchAllPages<{ domain?: string; paging_token?: string }>(
    'https://api.stellar.expert/explorer/public/asset?sort=rating&order=desc',
    config.discoveryPages,
  );
  return new Set(records.map((r) => r.domain?.trim().toLowerCase()).filter((d): d is string => Boolean(d)));
}

/** StellarExpert's anchor-tagged directory, with its flags. Mostly stale, but
 * that is the point: abandoned and unsafe anchors are tracked and labeled,
 * not left out. */
async function directoryAnchors(): Promise<Map<string, { name?: string; listing?: Listing }>> {
  const records = await fetchAllPages<{ domain?: string; name?: string; tags?: string[]; paging_token?: string }>(
    'https://api.stellar.expert/explorer/directory?tag[]=anchor',
    10,
  );
  const byDomain = new Map<string, { name?: string; listing?: Listing; tags: Set<string> }>();
  for (const r of records) {
    const domain = r.domain?.trim().toLowerCase();
    if (!domain) continue;
    const entry = byDomain.get(domain) ?? { name: r.name, tags: new Set<string>() };
    for (const t of r.tags ?? []) entry.tags.add(t);
    // One domain can have several accounts; any flagged one flags the domain.
    entry.listing = listingFrom(r.name, [...entry.tags]) ?? entry.listing;
    byDomain.set(domain, entry);
  }
  return new Map([...byDomain].map(([d, e]) => [d, { name: e.name, listing: e.listing }]));
}

async function main() {
  // --daily: cron calls this every round; only rediscover once a day.
  const existing = loadAnchorsFile(config.anchorsPath);
  if (process.argv.includes('--daily') && existing && Date.now() - Date.parse(existing.generated_at) < DAY_MS) {
    console.log(`[discover] last run ${existing.generated_at}, less than a day ago; skipping`);
    return;
  }

  const registered = registeredMainnetAnchors(config.registeredAnchorsPath);
  const registeredByDomain = new Map(registered.map((a) => [a.domain, a]));
  const [rated, directory] = await Promise.all([ratedAssetDomains(), directoryAnchors()]);
  const domains = new Set([...rated, ...directory.keys(), ...registeredByDomain.keys()]);
  console.log(`[discover] ${domains.size} candidate domain(s) (${directory.size} from the anchor directory)`);

  const checked = await mapWithConcurrency(Array.from(domains), 24, async (domain): Promise<Candidate | null> => {
    const reg = registeredByDomain.get(domain);
    const dir = directory.get(domain);
    // A domain is an anchor we track if someone says it is one: our own
    // registry or the directory. Rated-asset domains only count once their
    // toml and /info prove it.
    const known = Boolean(reg || dir);
    const base = {
      anchor_id: reg?.anchor_id ?? anchorIdFor(domain),
      domain,
      ...(dir ? { listing: dir.listing, fromDirectory: true } : {}),
    };
    const nameFor = (orgName?: string) =>
      reg?.name ?? (dir?.name ? cleanDirectoryName(dir.name) : undefined) ?? orgName ?? domain;
    try {
      const { value: toml } = await fetchAnchorToml(fetch, domain, config.requestTimeoutMs);
      const server = toml.sep24 ?? toml.sep6;
      if (server) {
        // A real /info is a JSON object. Single-page web apps answer any path
        // with their HTML shell and a 200, which is not an anchor.
        const res = await timedFetch(fetch, `${server}/info`, {}, config.requestTimeoutMs).catch(() => null);
        const info = res ? await res.value.json().catch(() => null) : null;
        if (info && typeof info === 'object' && !Array.isArray(info)) {
          return { ...base, name: nameFor(toml.orgName), transfer_host: new URL(server).host, live: true };
        }
      }
      return known ? { ...base, name: nameFor(toml.orgName), live: false } : null;
    } catch {
      return known ? { ...base, name: nameFor(), live: false } : null;
    }
  });

  const candidates = checked.filter((c): c is Candidate => c !== null);
  // Collapse domains fronting one live backend; dead ones stay one per domain.
  const live = dedupeByTransferHost(
    candidates.filter((c) => c.live).map((c) => ({ ...c, registered: registeredByDomain.has(c.domain) })),
  ).map(({ registered: _r, ...c }) => c);
  const dead = candidates.filter((c) => !c.live);

  const now = new Date().toISOString();
  const previous = existing?.anchors ?? [];
  const merged = mergeAnchors(previous, [...live, ...dead], now);
  saveAnchorsFile(config.anchorsPath, { generated_at: now, anchors: merged });

  const added = merged.filter((a) => !previous.some((p) => p.anchor_id === a.anchor_id));
  const count = (l: string) => merged.filter((a) => a.listing === l).length;
  console.log(
    `[discover] ${live.length} live operator(s); tracking ${merged.length} anchor(s) ` +
      `(${count('abandoned')} abandoned, ${count('unsafe')} flagged unsafe), ${added.length} new`,
  );
}

main().catch((err) => {
  console.error('[discover] fatal:', err);
  process.exitCode = 1;
});
