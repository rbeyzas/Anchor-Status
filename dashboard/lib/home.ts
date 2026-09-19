// What the home page shows, built from the same live data as /scores. Every
// number here is read from the chain or the collector; where a picture
// cannot be drawn from real data it is left out, never filled in.
import { GATES, headline, PRIOR, shares, type Pillar } from './methodology';
import { GATE_FLAGS } from './scorecard';
import { evidenceUrl, hasEnoughData, headlineScore, latestEvidence } from './status-labels';
import type { AnchorViewModel, ProbeStage } from './types';

export const STAGES: Array<{ stage: ProbeStage; title: string; request: string }> = [
  { stage: 'toml', title: 'stellar.toml', request: 'GET /.well-known/stellar.toml' },
  { stage: 'info', title: '/info', request: 'GET {TRANSFER_SERVER}/info' },
  { stage: 'challenge', title: 'SEP-10 challenge', request: 'GET /auth?account=G…' },
  { stage: 'token', title: 'SEP-10 token', request: 'POST /auth {signed challenge}' },
  { stage: 'initiate', title: 'SEP-24 deposit', request: 'POST /transactions/deposit/interactive' },
];

export interface Counters {
  /** Mainnet anchors measured. */
  anchors: number;
  /** Reports the oracle has received, all sources (its own count). */
  reports: number;
  /** Mainnet score cards on-chain. */
  cards: number;
  lastPublishedAt: string | null;
}

export type StepState = 'ok' | 'declined' | 'failed' | 'not_run' | 'not_advertised';

export interface ProbeExample {
  name: string;
  domain: string;
  at: string;
  seconds?: number;
  steps: Array<{ stage: ProbeStage; title: string; request: string; state: StepState; ms?: number }>;
}

export interface ScoreJourney {
  name: string;
  anchorId: string;
  pillars: Array<{ key: Pillar; value: number | null; share: number }>;
  /** Weighted average of the pillars that apply. */
  raw: number;
  confidence: number;
  /** After the pull toward the prior. */
  shrunk: number;
  prior: number;
  caps: Array<{ flag: string; cap: number }>;
  score: number;
}

export interface ProofChain {
  name: string;
  anchorId: string;
  evidence: { hash: string; url: string; at: string };
  bundle: { hash: string; url: string };
  card: { score: number; publishedAt: string };
}

export interface TickerItem {
  name: string;
  /** The last step it reached. */
  stage: string;
  ok: boolean;
  ms?: number;
  at: string;
}

const mainnet = (anchors: AnchorViewModel[]) => anchors.filter((a) => a.sourceType === 'RealMainnet' && !a.status?.aliasOf);

export function counters(anchors: AnchorViewModel[]): Counters {
  const m = anchors.filter((a) => a.sourceType === 'RealMainnet');
  const published = m.map((a) => a.card?.publishedAt).filter((t): t is string => Boolean(t)).sort();
  return {
    anchors: m.length,
    reports: anchors.reduce((sum, a) => sum + (a.health?.observations ?? 0), 0),
    cards: m.filter((a) => a.card).length,
    lastPublishedAt: published.at(-1) ?? null,
  };
}

/** The most recent passing check that went all the way its toml allows,
 * preferring the one that reached the most steps. */
export function probeExample(anchors: AnchorViewModel[]): ProbeExample | undefined {
  const candidates = mainnet(anchors).filter((a) => a.status?.lastProbe?.success);
  const depth = (a: AnchorViewModel) => a.status!.lastProbe!.stages.filter((s) => s.ok).length;
  const best = candidates.sort((a, b) => depth(b) - depth(a) || b.status!.lastProbe!.at.localeCompare(a.status!.lastProbe!.at))[0];
  if (!best) return undefined;
  const probe = best.status!.lastProbe!;
  return {
    name: best.name,
    domain: best.domain,
    at: probe.at,
    ...(probe.seconds !== undefined ? { seconds: probe.seconds } : {}),
    steps: STAGES.map(({ stage, title, request }) => {
      const s = probe.stages.find((x) => x.stage === stage);
      const state: StepState = s
        ? s.policy
          ? 'declined'
          : s.ok
            ? 'ok'
            : 'failed'
        : probe.expected.includes(stage)
          ? 'not_run'
          : 'not_advertised';
      return { stage, title, request, state, ...(s?.ms !== undefined ? { ms: s.ms } : {}) };
    }),
  };
}

/** The top shown card, recomputed step by step with the published
 * methodology. Undefined unless the recomputation lands exactly on the
 * on-chain score: the page never shows arithmetic that does not add up. */
export function scoreJourney(anchors: AnchorViewModel[]): ScoreJourney | undefined {
  const shown = mainnet(anchors)
    .filter((a) => a.card && hasEnoughData(a))
    .sort((a, b) => headlineScore(b) - headlineScore(a));
  for (const a of shown) {
    const card = a.card!;
    const caps = card.flags
      .filter((f) => GATE_FLAGS.has(f))
      .flatMap((f) => GATES.filter((g) => g.flag === f).map((g) => ({ flag: f as string, cap: g.cap })));
    const h = headline(
      { availability: card.availability, speed: card.speed, integrity: card.integrity, market: card.market },
      card.confidence,
      caps.map((c) => c.cap),
    );
    if (h.score !== card.score) continue;
    const share = shares(card.market !== null);
    return {
      name: a.name,
      anchorId: a.anchorId,
      pillars: (['availability', 'speed', 'integrity', 'market'] as Pillar[]).map((key) => ({
        key,
        value: card[key],
        share: share[key],
      })),
      raw: h.raw,
      confidence: card.confidence,
      shrunk: h.shrunk,
      prior: PRIOR,
      caps,
      score: card.score,
    };
  }
  return undefined;
}

/** From one check to the chain, with the real hashes: the latest report's
 * evidence, the bundle the card was computed from, and the card itself. */
export function proofChain(anchors: AnchorViewModel[], preferred?: string): ProofChain | undefined {
  const withCard = mainnet(anchors).filter((a) => a.card && latestEvidence(a));
  const a = withCard.find((x) => x.anchorId === preferred) ?? withCard.sort((x, y) => headlineScore(y) - headlineScore(x))[0];
  if (!a) return undefined;
  const ev = latestEvidence(a)!;
  return {
    name: a.name,
    anchorId: a.anchorId,
    evidence: { hash: ev.hash, url: ev.url, at: ev.timestamp },
    bundle: { hash: a.card!.inputsHash, url: evidenceUrl(a.card!.inputsHash) },
    card: { score: a.card!.score, publishedAt: a.card!.publishedAt },
  };
}

const STAGE_WORD: Record<ProbeStage, string> = {
  toml: 'toml',
  info: 'info',
  challenge: 'sign-in',
  token: 'sign-in',
  initiate: 'deposit',
};

/** The latest checks, newest first: each anchor's last result. */
export function tickerItems(anchors: AnchorViewModel[], max = 10): TickerItem[] {
  return mainnet(anchors)
    .filter((a) => a.status?.lastProbe && !a.status.dormant)
    .map((a) => {
      const p = a.status!.lastProbe!;
      const last = p.stages.at(-1);
      return {
        name: a.name,
        stage: last ? STAGE_WORD[last.stage] : 'toml',
        ok: p.success,
        ...(p.seconds !== undefined ? { ms: Math.round(p.seconds * 1000) } : {}),
        at: p.at,
      };
    })
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, max);
}

/** "3f9a…c21e": first and last four, as the design system writes hashes. */
export const shortHash = (h: string) => (h.length > 12 ? `${h.slice(0, 4)}…${h.slice(-4)}` : h);
