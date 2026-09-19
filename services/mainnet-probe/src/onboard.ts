// The onboarding step of the collection round: reads new applications,
// checks a few, and adds the ones that qualify to anchors.json. register.ts,
// next in the round, puts them on-chain; the probe measures them from then on.
//
//   npm run onboard                               process the queue
//   npm run onboard -- --dry-run --domain x.com   check one domain, write nothing
import { loadAnchorsFile, mergeAnchors, saveAnchorsFile, type MainnetAnchor } from './anchors.js';
import {
  ingestSubmissions,
  loadOnboardingFile,
  normalizeDomainInput,
  onboardingPaths,
  readSubmissions,
  saveOnboardingFile,
  type OnboardingCandidate,
} from './candidates.js';
import { config } from './config.js';
import { ourNetworkIsDown } from './http.js';
import { lookupIssuer } from './issuers.js';
import { evaluateCandidate, type OnboardingDeps, type Thresholds } from './onboarding.js';
import { assetPaymentCount } from './onboarding-volume.js';
import { probeAnchor } from './probe.js';
import { resolvesToPublicAddress } from './public-host.js';
import { fetchAnchorToml } from './toml.js';

function deps(now: Date): OnboardingDeps {
  return {
    isPublic: (domain) => resolvesToPublicAddress(domain),
    fetchToml: async (domain) => (await fetchAnchorToml(fetch, domain, config.requestTimeoutMs)).value,
    probe: (target) =>
      probeAnchor(target, {
        fetchImpl: fetch,
        requestTimeoutMs: config.requestTimeoutMs,
        networkPassphrase: config.mainnetPassphrase,
      }),
    lookupIssuer: (issuer) => lookupIssuer(fetch, config.horizonUrl, issuer, now, config.requestTimeoutMs),
    assetPayments: (code, issuer) => assetPaymentCount(fetch, code, issuer, config.requestTimeoutMs),
    networkDown: ourNetworkIsDown,
    now,
  };
}

const thresholds: Thresholds = {
  minAgeDays: config.onboardingMinAgeDays,
  minTransfers: config.onboardingMinTransfers,
};

async function dryRun(input: string) {
  const domain = normalizeDomainInput(input);
  if (!domain) throw new Error(`not a plain public hostname: ${input}`);
  const known = loadAnchorsFile(config.anchorsPath)?.anchors ?? [];
  const now = new Date();
  const ev = await evaluateCandidate(domain, known, thresholds, deps(now));
  console.log(JSON.stringify({ domain, thresholds, ...ev }, null, 2));
}

async function main() {
  const domainArg = process.argv.indexOf('--domain');
  if (domainArg !== -1) {
    if (!process.argv.includes('--dry-run')) throw new Error('--domain is only for --dry-run');
    await dryRun(process.argv[domainArg + 1] ?? '');
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const paths = onboardingPaths(config.onboardingDir);
  const file = loadOnboardingFile(paths.candidates);
  const ingested = ingestSubmissions(file?.candidates ?? [], readSubmissions(paths.submissions), file?.ingested_through);
  const candidates: OnboardingCandidate[] = ingested.candidates;
  const due = candidates.filter((c) => c.status === 'received').slice(-config.onboardingMaxPerRun);

  const anchorsFile = loadAnchorsFile(config.anchorsPath);
  let known: MainnetAnchor[] = anchorsFile?.anchors ?? [];
  let admitted = 0;

  // Oldest first: the list is newest first, and `due` is its tail.
  for (const c of [...due].reverse()) {
    const ev = await evaluateCandidate(c.domain, known, thresholds, deps(now));
    c.checked_at = nowIso;
    c.checks = ev.checks;
    delete c.reason;
    if (ev.outcome === 'accepted') {
      known = mergeAnchors(
        known,
        [{ anchor_id: ev.anchor_id, name: ev.name, domain: c.domain, transfer_host: ev.transfer_host, live: true }],
        nowIso,
      );
      c.status = 'accepted';
      c.anchor_id = ev.anchor_id;
      c.name = ev.name;
      admitted++;
    } else if (ev.outcome === 'already_tracked') {
      c.status = 'already_tracked';
      c.anchor_id = ev.anchor_id;
      c.name = ev.name;
    } else if (ev.outcome === 'rejected') {
      c.status = 'rejected';
      c.reason = ev.reason;
      if (ev.name) c.name = ev.name;
    } else {
      c.attempts += 1;
      if (c.attempts >= config.onboardingMaxAttempts) {
        c.status = 'rejected';
        c.reason = `could not be checked on our side (${ev.reason}); submit again later`;
      } else {
        c.reason = `not decided yet: ${ev.reason}`;
      }
    }
    console.log(`[onboard] ${c.domain}: ${c.status}${c.reason ? ` (${c.reason})` : ''}`);
  }

  if (admitted > 0) {
    // generated_at is discovery's own clock (it rediscovers once a day); an
    // admission must not push that back.
    saveAnchorsFile(config.anchorsPath, { generated_at: anchorsFile?.generated_at ?? new Date(0).toISOString(), anchors: known });
  }
  saveOnboardingFile(paths.candidates, {
    updated_at: nowIso,
    ingested_through: ingested.ingestedThrough,
    thresholds: { min_age_days: thresholds.minAgeDays, min_transfers: thresholds.minTransfers },
    candidates,
  });
  const waiting = candidates.filter((c) => c.status === 'received').length;
  console.log(`[onboard] checked ${due.length}, admitted ${admitted}; ${waiting} waiting`);
}

main().catch((err) => {
  console.error('[onboard] fatal:', err);
  process.exitCode = 1;
});
