// Builds one anchor's ScoreInputs from its probe history and chain signals.
// Pure: the loaders in load.ts do the reading, so this can be tested, and
// re-run by anyone, on plain data.
import { createHash } from 'node:crypto';
import { METHODOLOGY_VERSION, OUTAGE_PROBES, type IntegrityCheck } from './constants.js';
import type { CheckResult, FlowAggregate, MarketAggregate, MarketNa, ScoreInputs } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** One line of mainnet-probe's JSONL log, as far as scoring reads it. */
export interface ProbeLine {
  anchor_id: string;
  timestamp: string;
  success: boolean;
  inconclusive?: boolean;
  /** Set by `applyIncidents` when a collector incident, not the anchor,
   * explains this failure: the id of the incident that dropped it. */
  excluded_by?: string;
  failed_stage?: string;
  stages: Partial<Record<string, { ok: boolean; ms?: number; policy?: boolean; error?: string }>>;
  stages_expected?: string[];
  checks?: {
    toml_valid: boolean;
    toml_cors?: boolean;
    sep10_advertised?: boolean;
    sep10_signature_valid?: boolean;
    info_valid?: boolean;
    tls_ok?: boolean;
    signing_key?: string;
  };
  evidence_hash?: string;
  /** For log lines written before `checks` existed: the SIGNING_KEY read
   * back from the line's evidence document. */
  signing_key?: string;
}

/** An asset from mainnet-probe's status file. */
export interface AssetInfo {
  code: string;
  issuer?: string;
  anchor_asset_type?: string;
  anchor_asset?: string;
  issuer_home_domain_matches?: boolean;
  issuer_listed_by_home_domain?: boolean;
}

/** One market sampling attempt by passive-monitor. */
export interface MarketSample {
  timestamp: string;
  anchor_id: string;
  code: string;
  issuer: string;
  anchor_asset: string;
  /** Present when the sample is usable. */
  dev_bps?: number;
  reference?: { source: string; date: string; rate: number };
  /** Why there is no usable sample. */
  reason?: 'no_fx_rate' | 'no_liquidity';
}

/** passive-monitor's daily mint/burn buckets for one issued asset. */
export interface FlowHistory {
  code: string;
  issuer: string;
  /** First UTC day the history covers completely. */
  covered_from: string;
  days: Record<string, { mint_count: number; burn_count: number; truncated?: boolean }>;
}

export interface AnchorContext {
  assets: AssetInfo[];
  marketSamples: MarketSample[];
  flows: FlowHistory[];
}

const SEP10_MISMATCH = /not signed by the published SIGNING_KEY/i;

export const isSep10Mismatch = (p: ProbeLine) =>
  p.checks?.sep10_signature_valid === false || SEP10_MISMATCH.test(p.stages.challenge?.error ?? '');

/** Nearest-rank percentile of an ascending list. */
function percentile(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Fixed decimals, so the bundle's bytes do not depend on float noise. */
const fixed = (x: number, digits = 4) => Number(x.toFixed(digits));

/** Mean time of the stages a probe completed, in seconds: comparable
 * between an anchor tested to stage 2 and one tested to stage 5. */
function meanStageSeconds(p: ProbeLine): number | undefined {
  const times = Object.values(p.stages).flatMap((s) => (s?.ok && s.ms !== undefined ? [s.ms] : []));
  return times.length ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : undefined;
}

function coverageOf(p: ProbeLine): number | undefined {
  if (!p.stages_expected?.length) return undefined;
  const ok = p.stages_expected.filter((s) => p.stages[s]?.ok).length;
  return ok / p.stages_expected.length;
}

/**
 * The checklist of section 6.3, from the latest conclusive probe. A check
 * that could not run because an earlier stage failed on the anchor's side
 * fails; one that does not apply, or was declined by policy, is n/a. A
 * check the probe did not record at all (logs from before it existed) is
 * n/a too: it was not measured, and is never assumed to pass.
 */
export function integrityChecks(latest: ProbeLine, history: ProbeLine[], assets: AssetInfo[]): Record<IntegrityCheck, CheckResult> {
  const c = latest.checks;
  const tomlOk = c ? c.toml_valid : latest.stages.toml?.ok === true && latest.failed_stage !== 'toml';
  const verdict = (ok: boolean | undefined): CheckResult => (ok ? 'pass' : 'fail');

  let sep10: CheckResult;
  const challenge = latest.stages.challenge;
  if (!tomlOk) sep10 = 'fail';
  else if (c?.sep10_advertised === false) sep10 = 'na';
  else if (challenge?.policy) sep10 = 'na';
  else if (c?.sep10_signature_valid !== undefined) sep10 = verdict(c.sep10_signature_valid);
  else if (challenge?.ok) sep10 = 'pass';
  else if (!c && !challenge && latest.success) sep10 = 'na'; // older log, SEP-10 not advertised
  else sep10 = 'fail';

  const keyOf = (p: ProbeLine) => p.checks?.signing_key ?? p.signing_key;
  const keys = new Set(history.flatMap((p) => (keyOf(p) ? [keyOf(p)!] : [])));
  const keyed = history.filter(keyOf).length;

  // Only assets with a verdict count: one whose issuer's toml could not be
  // read is unverifiable, which is the issuer's failing, not this anchor's.
  const withIssuer = assets.filter(
    (a) => a.issuer && (a.issuer_home_domain_matches === true || a.issuer_listed_by_home_domain !== undefined),
  );
  const vouched = (a: AssetInfo) => a.issuer_home_domain_matches === true || a.issuer_listed_by_home_domain === true;

  return {
    toml_valid: verdict(tomlOk),
    toml_cors: c ? (tomlOk ? verdict(c.toml_cors) : 'fail') : 'na',
    sep10_signed: sep10,
    info_valid: !tomlOk ? 'fail' : c ? verdict(c.info_valid) : verdict(latest.stages.info?.ok),
    tls_ok: c?.tls_ok === undefined ? 'na' : verdict(c.tls_ok),
    signing_key_stable: keyed < 2 ? 'na' : verdict(keys.size === 1),
    issuer_home_domain_matches: withIssuer.length === 0 ? 'na' : verdict(withIssuer.every(vouched)),
  };
}

/** Longest stretch, in hours, of consecutive samples above `bps`. */
export function longestRunHours(samples: { timestamp: string; dev_bps: number }[], bps: number): number {
  let longest = 0;
  let start: number | undefined;
  for (const s of samples) {
    const t = Date.parse(s.timestamp);
    if (s.dev_bps > bps) {
      start ??= t;
      longest = Math.max(longest, (t - start) / HOUR_MS);
    } else {
      start = undefined;
    }
  }
  return fixed(longest, 2);
}

function marketAggregates(issuedFiat: AssetInfo[], samples: MarketSample[], windowEnd: number): { market: MarketAggregate[]; na?: MarketNa } {
  const since = windowEnd - 7 * DAY_MS;
  const inWindow = samples
    .filter((s) => Date.parse(s.timestamp) > since && Date.parse(s.timestamp) <= windowEnd)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const market: MarketAggregate[] = [];
  let fxMissingOnly = true;
  for (const asset of issuedFiat) {
    const mine = inWindow.filter((s) => s.code === asset.code && s.issuer === asset.issuer);
    if (mine.some((s) => s.reason !== 'no_fx_rate')) fxMissingOnly = false;
    const usable = mine.flatMap((s) => (s.dev_bps !== undefined && s.reference ? [{ ...s, dev_bps: s.dev_bps, reference: s.reference }] : []));
    if (usable.length === 0) continue;
    const devs = usable.map((s) => s.dev_bps);
    market.push({
      code: asset.code,
      issuer: asset.issuer!,
      anchor_asset: asset.anchor_asset!,
      samples: usable.length,
      median_bps: fixed(median(devs), 2),
      share_outside_50: fixed(devs.filter((d) => d > 50).length / devs.length),
      longest_run_gt100_hours: longestRunHours(usable, 100),
      longest_run_gt300_hours: longestRunHours(usable, 300),
      reference: usable[usable.length - 1].reference,
    });
  }
  if (market.length > 0) return { market };
  // Every attempt failed for want of a reference rate: we cannot judge the
  // peg, which is not the same as the anchor having no market.
  const anyAttempt = inWindow.some((s) => issuedFiat.some((a) => a.code === s.code && a.issuer === s.issuer));
  return { market, na: anyAttempt && fxMissingOnly ? 'no_fiat_reference' : 'no_market' };
}

function flowAggregates(histories: FlowHistory[], windowEnd: number): FlowAggregate[] {
  const sum = (h: FlowHistory, days: number) => {
    const from = new Date(windowEnd - days * DAY_MS).toISOString().slice(0, 10);
    const to = new Date(windowEnd).toISOString().slice(0, 10);
    let mint = 0;
    let burn = 0;
    let truncated = h.covered_from > from;
    for (const [date, d] of Object.entries(h.days)) {
      if (date < from || date > to) continue;
      mint += d.mint_count;
      burn += d.burn_count;
      if (d.truncated) truncated = true;
    }
    return { mint, burn, truncated };
  };
  return histories.map((h) => {
    const d14 = sum(h, 14);
    const d30 = sum(h, 30);
    return {
      code: h.code,
      issuer: h.issuer,
      mint_count_14d: d14.mint,
      burn_count_14d: d14.burn,
      mint_count_30d: d30.mint,
      burn_count_30d: d30.burn,
      truncated_14d: d14.truncated,
      truncated_30d: d30.truncated,
    };
  });
}

/** SHA-256 of one day's results for an anchor, so the bundle's per-day
 * counts can be checked against the published probe log. */
export function dayDigest(probes: ProbeLine[]): string {
  const lines = probes.map((p) => `${p.timestamp}|${p.success}|${p.evidence_hash ?? ''}`).sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * The inputs for one anchor's card over the 30 days ending at `windowEnd`
 * (unix ms). `probes` may contain anything; only this anchor's conclusive
 * probes inside the window are used. Returns null when there are none.
 */
export function buildInputs(anchorId: string, probes: ProbeLine[], windowEnd: number, ctx: AnchorContext): ScoreInputs | null {
  const since30 = windowEnd - 30 * DAY_MS;
  const since7 = windowEnd - 7 * DAY_MS;
  const inWindow = probes.filter(
    (p) => p.anchor_id === anchorId && Date.parse(p.timestamp) > since30 && Date.parse(p.timestamp) <= windowEnd,
  );
  const history = inWindow.filter((p) => !p.inconclusive).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (history.length === 0) return null;
  const week = history.filter((p) => Date.parse(p.timestamp) > since7);
  const weekOk = week.filter((p) => p.success);

  const speeds = weekOk.flatMap((p) => {
    const s = meanStageSeconds(p);
    return s === undefined ? [] : [s];
  });
  speeds.sort((a, b) => a - b);
  const coverages = weekOk.flatMap((p) => {
    const c = coverageOf(p);
    return c === undefined ? [] : [c];
  });

  const issued = ctx.assets.filter((a) => a.issuer && a.issuer_home_domain_matches === true);
  const issuedFiat = issued.filter((a) => a.anchor_asset_type === 'fiat' && a.anchor_asset);
  let market: MarketAggregate[] = [];
  let marketNa: MarketNa | undefined;
  if (issued.length === 0) marketNa = 'not_issuer';
  else if (issuedFiat.length === 0) marketNa = 'no_fiat_reference';
  else ({ market, na: marketNa } = marketAggregates(issuedFiat, ctx.marketSamples, windowEnd));

  const issuedKeys = new Set(issued.map((a) => `${a.code}:${a.issuer}`));
  const flows = flowAggregates(
    ctx.flows.filter((f) => issuedKeys.has(`${f.code}:${f.issuer}`)),
    windowEnd,
  );

  // What a collector incident took out of this window, so the card says so
  // rather than quietly resting on a shorter history.
  const dropped = new Map<string, number>();
  for (const p of inWindow) if (p.excluded_by) dropped.set(p.excluded_by, (dropped.get(p.excluded_by) ?? 0) + 1);
  const excluded = [...dropped].sort().map(([incident, count]) => ({ incident, probes: count }));

  const byDay = new Map<string, ProbeLine[]>();
  for (const p of history) {
    const day = p.timestamp.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), p]);
  }

  return {
    methodology_version: METHODOLOGY_VERSION,
    anchor_id: anchorId,
    window_end: Math.floor(windowEnd / 1000),
    uptime: { n7: week.length, ok7: weekOk.length, n30: history.length, ok30: history.filter((p) => p.success).length },
    speed: { p95_seconds: speeds.length ? fixed(percentile(speeds, 0.95), 3) : null, samples: speeds.length },
    integrity: integrityChecks(history[history.length - 1], history, ctx.assets),
    coverage: coverages.length ? fixed(median(coverages)) : null,
    monitored_days: fixed((windowEnd - Date.parse(history[0].timestamp)) / DAY_MS),
    recent: history
      .slice(-OUTAGE_PROBES)
      .reverse()
      .map((p) => ({ success: p.success, sep10_mismatch: isSep10Mismatch(p) })),
    market,
    ...(marketNa ? { market_na: marketNa } : {}),
    fiat_issued_assets: issuedFiat.length,
    flows,
    days: Array.from(byDay, ([date, ps]) => ({ date, n: ps.length, ok: ps.filter((p) => p.success).length, digest: dayDigest(ps) })),
    ...(excluded.length > 0 ? { excluded } : {}),
  };
}

/** The top of the hour at or before `now`: at most one card an hour, and a
 * window anyone can reproduce. */
export const floorToHour = (now: number) => Math.floor(now / HOUR_MS) * HOUR_MS;
