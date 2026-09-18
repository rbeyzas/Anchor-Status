import { anchorIdFor, dedupeByTransferHost, loadAnchorsFile, mergeAnchors, registeredMainnetAnchors, saveAnchorsFile, type MainnetAnchor } from './anchors.js';
import { mapWithConcurrency } from './concurrency.js';
import { config } from './config.js';
import { timedFetch } from './http.js';
import { fetchAnchorToml } from './toml.js';

/** Issuer home domains of StellarExpert's rated assets. The anchor-tagged
 * directory is too stale to use (most entries are dead or abandoned). */
async function candidateDomains(): Promise<Set<string>> {
  const domains = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < config.discoveryPages; page++) {
    const url = new URL('https://api.stellar.expert/explorer/public/asset');
    url.searchParams.set('sort', 'rating');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);
    const { value: res } = await timedFetch(fetch, url.toString(), { headers: { 'User-Agent': 'anchor-status' } }, 30_000);
    const records = ((await res.json()) as { _embedded?: { records?: Array<{ domain?: string; paging_token?: string }> } })
      ._embedded?.records ?? [];
    if (records.length === 0) break;
    for (const r of records) if (r.domain) domains.add(r.domain.trim().toLowerCase());
    cursor = records[records.length - 1].paging_token;
    if (!cursor) break;
  }
  return domains;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  // --daily: cron calls this every round; only rediscover once a day.
  const existing = loadAnchorsFile(config.anchorsPath);
  if (process.argv.includes('--daily') && existing && Date.now() - Date.parse(existing.generated_at) < DAY_MS) {
    console.log(`[discover] last run ${existing.generated_at}, less than a day ago; skipping`);
    return;
  }
  const registered = registeredMainnetAnchors(config.registeredAnchorsPath);
  const idByDomain = new Map(registered.map((a) => [a.domain, a]));
  const domains = await candidateDomains();
  for (const a of registered) domains.add(a.domain);
  console.log(`[discover] ${domains.size} candidate domain(s)`);

  // A live anchor: its toml advertises SEP-6/24 and that server's /info answers.
  const checked = await mapWithConcurrency(Array.from(domains), 24, async (domain) => {
    try {
      const { value: toml } = await fetchAnchorToml(fetch, domain, config.requestTimeoutMs);
      const server = toml.sep24 ?? toml.sep6;
      if (!server) return null;
      // A real /info is a JSON object. Single-page web apps answer any path
      // with their HTML shell and a 200, which is not an anchor.
      const { value: res } = await timedFetch(fetch, `${server}/info`, {}, config.requestTimeoutMs);
      const info = await res.json().catch(() => null);
      if (!info || typeof info !== 'object' || Array.isArray(info)) return null;
      const reg = idByDomain.get(domain);
      return {
        anchor_id: reg?.anchor_id ?? anchorIdFor(domain),
        name: reg?.name ?? toml.orgName ?? domain,
        domain,
        transfer_host: new URL(server).host,
        registered: Boolean(reg),
      };
    } catch {
      return null;
    }
  });

  const live = dedupeByTransferHost(checked.filter((c): c is NonNullable<typeof c> => c !== null));
  const now = new Date().toISOString();
  const liveAnchors: MainnetAnchor[] = live.map(({ registered: _r, ...a }) => ({ ...a, first_seen: now }));

  // Hand-registered anchors are always tracked, live or not (mykobo's API
  // being down is exactly what we want to measure). They join the known
  // list without being marked live; only a working /info does that.
  const previous = existing?.anchors ?? [];
  const known = [...previous];
  for (const a of registered) {
    if (!known.some((k) => k.anchor_id === a.anchor_id)) known.push({ ...a, first_seen: now });
  }
  const merged = mergeAnchors(known, liveAnchors, now);

  saveAnchorsFile(config.anchorsPath, { generated_at: now, anchors: merged });
  const added = merged.filter((a) => !previous.some((p) => p.anchor_id === a.anchor_id));
  console.log(`[discover] ${live.length} live operator(s); tracking ${merged.length} anchor(s), ${added.length} new`);
  for (const a of added) console.log(`[discover]   + ${a.anchor_id} (${a.domain})`);
}

main().catch((err) => {
  console.error('[discover] fatal:', err);
  process.exitCode = 1;
});
