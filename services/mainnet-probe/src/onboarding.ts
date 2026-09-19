// Decides whether an applicant anchor is admitted to measurement. Admission
// only adds it to anchors.json; the rest of the round (register.ts, the
// probe, the aggregator) already takes every anchor listed there from
// on-chain registration to a published score card.
import { anchorIdFor, type MainnetAnchor } from './anchors.js';
import type { CheckResult } from './candidates.js';
import { issuerMatches, type IssuerRecord } from './issuers.js';
import type { MainnetProbeResult, ProbeTarget } from './probe.js';
import type { AnchorToml } from './toml.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Thresholds {
  minAgeDays: number;
  minTransfers: number;
}

export interface OnboardingDeps {
  isPublic: (domain: string) => Promise<boolean>;
  /** Throws when the toml cannot be fetched or parsed. */
  fetchToml: (domain: string) => Promise<AnchorToml>;
  probe: (target: ProbeTarget) => Promise<MainnetProbeResult>;
  /** Throws when Horizon gives no clear answer. */
  lookupIssuer: (issuer: string) => Promise<IssuerRecord>;
  /** Payments of one asset on the network (StellarExpert). Throws when unknown. */
  assetPayments: (code: string, issuer: string) => Promise<number>;
  /** Asked only after a failure: was it ours? */
  networkDown: () => Promise<boolean>;
  now: Date;
}

export type Evaluation =
  | { outcome: 'accepted'; anchor_id: string; name: string; transfer_host: string; checks: CheckResult[] }
  | { outcome: 'already_tracked'; anchor_id: string; name: string; checks: CheckResult[] }
  | { outcome: 'rejected'; reason: string; checks: CheckResult[]; name?: string }
  /** The failure was ours (network, Horizon): try again next round. */
  | { outcome: 'inconclusive'; reason: string; checks: CheckResult[] };

/** An error as one short line of text: first line only, and nothing from
 * an HTML error page the anchor sent back (it ends up on a public page). */
export function plainError(err: unknown): string {
  const text = (err instanceof Error ? err.message : String(err)).split('\n')[0];
  const cut = text.indexOf('<');
  return (cut === -1 ? text : text.slice(0, cut)).replace(/\s+/g, ' ').replace(/[\s:]+$/, '').slice(0, 200);
}
const firstLine = plainError;

/** A name from someone else's toml, fit for a list and an on-chain String. */
export function cleanName(name: string | undefined, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = (name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
  return cleaned || fallback;
}

/** anchorIdFor, made unique: two domains can map to one Symbol ("a-b.com", "a.b.com"). */
export function uniqueAnchorId(domain: string, known: MainnetAnchor[]): string {
  const taken = new Set(known.map((a) => a.anchor_id));
  const base = anchorIdFor(domain);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base.slice(0, 32 - `_${n}`.length).replace(/_+$/, '')}_${n}`;
    if (!taken.has(id)) return id;
  }
}

export async function evaluateCandidate(
  domain: string,
  known: MainnetAnchor[],
  thresholds: Thresholds,
  deps: OnboardingDeps,
): Promise<Evaluation> {
  const checks: CheckResult[] = [];
  let down: boolean | undefined;
  const ours = async () => (down ??= await deps.networkDown());

  const tracked = known.find((a) => a.domain === domain);
  if (tracked) return { outcome: 'already_tracked', anchor_id: tracked.anchor_id, name: tracked.name, checks };

  // Prerequisites: nothing else can be checked without them.
  if (!(await deps.isPublic(domain))) {
    if (await ours()) return { outcome: 'inconclusive', reason: 'our network was down', checks };
    checks.push({ name: 'public_host', passed: false, detail: 'The domain does not resolve, or resolves to a private address.' });
    return { outcome: 'rejected', reason: 'the domain does not resolve to a public address', checks };
  }
  checks.push({ name: 'public_host', passed: true, detail: 'Resolves to a public address.' });

  let toml: AnchorToml;
  try {
    toml = await deps.fetchToml(domain);
  } catch (err) {
    if (await ours()) return { outcome: 'inconclusive', reason: 'our network was down', checks };
    checks.push({ name: 'stellar_toml', passed: false, detail: `stellar.toml could not be read: ${firstLine(err)}` });
    return { outcome: 'rejected', reason: 'stellar.toml could not be read', checks };
  }
  checks.push({ name: 'stellar_toml', passed: true, detail: 'stellar.toml fetched and parsed.' });
  const name = cleanName(toml.orgName, domain);

  const server = toml.sep24 ?? toml.sep6;
  let transferHost: string | undefined;
  try {
    transferHost = server ? new URL(server).host : undefined;
  } catch {
    transferHost = undefined;
  }
  if (!transferHost) {
    checks.push({
      name: 'transfer_server',
      passed: false,
      detail: 'stellar.toml advertises no valid TRANSFER_SERVER_SEP0024 or TRANSFER_SERVER.',
    });
    return { outcome: 'rejected', reason: 'no SEP-6 or SEP-24 transfer server in stellar.toml', checks, name };
  }
  checks.push({ name: 'transfer_server', passed: true, detail: `Transfer server at ${transferHost}.` });

  // One operator behind another domain we already measure: same backend, same score.
  const sameOperator = known.find((a) => a.transfer_host === transferHost);
  if (sameOperator) return { outcome: 'already_tracked', anchor_id: sameOperator.anchor_id, name: sameOperator.name, checks };

  const anchorId = uniqueAnchorId(domain, known);
  const inconclusive: string[] = [];

  // The live check: the same probe every tracked anchor gets each round.
  const result = await deps.probe({ anchor_id: anchorId, domain });
  if (result.success) {
    const declined = Object.entries(result.stages).find(([, s]) => s?.policy)?.[0];
    checks.push({
      name: 'live_probe',
      passed: true,
      detail: declined
        ? `Answered every step up to ${declined}, where it declined an anonymous wallet by policy (that counts as up).`
        : 'Answered every step it advertises, from stellar.toml to the deposit start.',
    });
  } else if (await ours()) {
    inconclusive.push('our network was down during the live check');
  } else {
    checks.push({
      name: 'live_probe',
      passed: false,
      detail: `Failed at the ${result.failed_stage ?? 'unknown'} step: ${plainError(result.error ?? 'no detail')}`,
    });
  }

  // Age and transfers are measured on the assets it issues itself.
  const byIssuer = new Map<string, string[]>();
  for (const c of toml.currencies) if (c.issuer) byIssuer.set(c.issuer, [...(byIssuer.get(c.issuer) ?? []), c.code]);
  const own: Array<{ issuer: string; codes: string[]; record: IssuerRecord }> = [];
  let issuerUnread = false;
  for (const [issuer, codes] of byIssuer) {
    try {
      const record = await deps.lookupIssuer(issuer);
      if (issuerMatches(record, domain)) own.push({ issuer, codes, record });
    } catch (err) {
      issuerUnread = true;
      inconclusive.push(`could not read issuer ${issuer.slice(0, 4)}…${issuer.slice(-4)}: ${firstLine(err)}`);
    }
  }

  if (own.length === 0 && !issuerUnread) {
    const na = 'It issues no asset of its own (its issuers do not point back at this domain), so there is none to measure.';
    checks.push({ name: 'issuer_age', passed: null, detail: na });
    checks.push({ name: 'transfer_count', passed: null, detail: na });
  } else if (own.length > 0) {
    const created = own.map((o) => o.record.created_at).filter((t): t is string => Boolean(t)).sort()[0];
    if (!created) {
      inconclusive.push('the issuer account’s creation date could not be read');
    } else {
      const days = Math.floor((deps.now.getTime() - Date.parse(created)) / DAY_MS);
      checks.push({
        name: 'issuer_age',
        passed: days >= thresholds.minAgeDays,
        value: days,
        threshold: thresholds.minAgeDays,
        detail: `Its oldest issuer account was opened ${days} day${days === 1 ? '' : 's'} ago (at least ${thresholds.minAgeDays} needed).`,
      });
    }

    // Summed over its own assets, stopping once the threshold is met.
    let total = 0;
    let counted = true;
    for (const [code, issuer] of own.flatMap((o) => o.codes.map((c) => [c, o.issuer] as const))) {
      if (total >= thresholds.minTransfers) break;
      try {
        total += await deps.assetPayments(code, issuer);
      } catch (err) {
        inconclusive.push(`could not read how often ${code} is used: ${firstLine(err)}`);
        counted = false;
        break;
      }
    }
    if (counted) {
      const met = total >= thresholds.minTransfers;
      const n = met ? `At least ${thresholds.minTransfers}` : String(total);
      checks.push({
        name: 'transfer_count',
        passed: met,
        value: total,
        threshold: thresholds.minTransfers,
        detail: `${n} payment${total === 1 ? '' : 's'} of its own assets on the network${met ? '' : ` (at least ${thresholds.minTransfers} needed)`}.`,
      });
    }
  }

  const failed = checks.filter((c) => c.passed === false);
  if (failed.length > 0) {
    const reason = failed.map((c) => c.name.replace(/_/g, ' ')).join(', ');
    return { outcome: 'rejected', reason: `did not pass: ${reason}`, checks, name };
  }
  if (inconclusive.length > 0) return { outcome: 'inconclusive', reason: inconclusive.join('; '), checks };
  return { outcome: 'accepted', anchor_id: anchorId, name, transfer_host: transferHost, checks };
}
