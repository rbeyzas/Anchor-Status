// The testnet onboarding step of the collection round: reads new testnet
// applications, runs the money-flow check on a few, and adds the ones that
// pass to the testnet anchor list. register.ts, next, puts them on-chain.
//
//   npm run onboard                               process the queue
//   npm run onboard -- --dry-run --domain x.com   check one domain, record nothing
import path from 'node:path';
import { loadTestnetAnchors, saveTestnetAnchors, type TestnetAnchor } from './anchors.js';
import {
  ingestSubmissions,
  loadOnboardingFile,
  normalizeDomainInput,
  readSubmissions,
  saveOnboardingFile,
  type OnboardingCandidate,
} from './candidates.js';
import { registeredAnchorIds } from './chain.js';
import { config } from './config.js';
import { runMoneyFlow } from './flow.js';
import { ADMISSION_RULE, evaluateTestnetCandidate, type OnboardingDeps } from './onboarding.js';
import { liveDeps, REFERENCE_ANCHOR } from './probe.js';
import { resolvesToPublicAddress } from './public-host.js';

/** True when we, not the anchor, are offline. */
async function networkDown(): Promise<boolean> {
  try {
    const res = await fetch(config.horizonTestnetUrl, { signal: AbortSignal.timeout(10_000) });
    return !res.ok;
  } catch {
    return true;
  }
}

const deps: OnboardingDeps = {
  isPublic: (domain) => resolvesToPublicAddress(domain),
  runFlow: (target) => runMoneyFlow(target, liveDeps(target)),
  networkDown,
};

async function main() {
  const listed = loadTestnetAnchors(config.anchorsPath, REFERENCE_ANCHOR);
  const onChain = await registeredAnchorIds();

  const domainArg = process.argv.indexOf('--domain');
  if (domainArg !== -1) {
    if (!process.argv.includes('--dry-run')) throw new Error('--domain is only for --dry-run');
    const domain = normalizeDomainInput(process.argv[domainArg + 1]);
    if (!domain) throw new Error('not a plain public hostname');
    const ev = await evaluateTestnetCandidate(domain, listed, onChain, deps);
    console.log(JSON.stringify({ domain, ...ev }, null, 2));
    return;
  }

  const now = new Date().toISOString();
  const files = {
    submissions: path.join(config.onboardingDir, 'submissions.jsonl'),
    candidates: path.join(config.onboardingDir, 'onboarding.json'),
  };
  const file = loadOnboardingFile(files.candidates);
  const ingested = ingestSubmissions(file?.candidates ?? [], readSubmissions(files.submissions), file?.ingested_through);
  const candidates: OnboardingCandidate[] = ingested.candidates;
  const due = candidates.filter((c) => c.status === 'received').slice(-config.onboardingMaxPerRun);

  // The file holds admitted anchors only; the reference anchor is added on load.
  let admitted: TestnetAnchor[] = listed.filter((a) => a.origin === 'applied');
  let added = 0;
  for (const c of [...due].reverse()) {
    const ev = await evaluateTestnetCandidate(c.domain, [REFERENCE_ANCHOR, ...admitted], onChain, deps);
    c.checked_at = now;
    c.checks = ev.checks;
    delete c.reason;
    if (ev.outcome === 'accepted') {
      admitted = [...admitted, { ...ev.anchor, first_seen: now, origin: 'applied' }];
      c.status = 'accepted';
      c.anchor_id = ev.anchor.anchor_id;
      c.name = ev.anchor.name;
      added++;
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
    console.log(`[testnet-onboard] ${c.domain}: ${c.status}${c.reason ? ` (${c.reason})` : ''}`);
  }

  if (added > 0) saveTestnetAnchors(config.anchorsPath, admitted);
  saveOnboardingFile(files.candidates, {
    updated_at: now,
    ingested_through: ingested.ingestedThrough,
    rule: ADMISSION_RULE,
    candidates,
  });
  console.log(`[testnet-onboard] checked ${due.length}, admitted ${added}; ${candidates.filter((c) => c.status === 'received').length} waiting`);
}

main().catch((err) => {
  console.error('[testnet-onboard] fatal:', err);
  process.exitCode = 1;
});
