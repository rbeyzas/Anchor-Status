import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Broadcast, ChartLineUp, Stamp } from '@phosphor-icons/react/dist/ssr';
import { Logo } from '@/components/Logo';
import { Radar } from '@/components/Radar';
import { SiteNav } from '@/components/SiteNav';
import { SourceBadge } from '@/components/SourceBadge';
import { Sparkline } from '@/components/Sparkline';
import { StatusChip } from '@/components/StatusChip';
import { formatRelativeTime } from '@/lib/format';
import { getDashboardData } from '@/lib/soroban';
import { hasEnoughData, headlineScore } from '@/lib/status-labels';
import type { AnchorViewModel } from '@/lib/types';
import { scoreTier } from '@/lib/types';

// Same cadence as /scores: at most one chain read a minute.
export const revalidate = 60;

const TIER_TEXT = { high: 'text-as-score-high', medium: 'text-as-score-medium', low: 'text-as-score-low' } as const;

interface HomeSnapshot {
  top: AnchorViewModel[];
  mainnetCount: number;
  lastPublishedAt: string | null;
}

async function loadSnapshot(): Promise<HomeSnapshot> {
  try {
    const { anchors, dataSource } = await getDashboardData();
    if (dataSource !== 'live') return { top: [], mainnetCount: 0, lastPublishedAt: null };
    const mainnet = anchors.filter((a) => a.sourceType === 'RealMainnet');
    // Only scores the dashboard would show: a card with enough confidence.
    const top = [...mainnet].filter(hasEnoughData).sort((a, b) => headlineScore(b) - headlineScore(a)).slice(0, 5);
    const publishedTimes = mainnet.map((a) => a.card?.publishedAt).filter((t): t is string => Boolean(t));
    const lastPublishedAt = publishedTimes.length
      ? publishedTimes.reduce((latest, t) => (t > latest ? t : latest))
      : null;
    return { top, mainnetCount: mainnet.length, lastPublishedAt };
  } catch {
    return { top: [], mainnetCount: 0, lastPublishedAt: null };
  }
}

const STEPS = [
  {
    n: '01',
    icon: Broadcast,
    sticker: 'bg-sticker-sky',
    title: 'Probe',
    body: 'Independent collectors call each anchor the way a wallet would: stellar.toml, transfer server, SEP-10 challenge, SEP-24 deposit. No funds move.',
  },
  {
    n: '02',
    icon: ChartLineUp,
    sticker: 'bg-sticker-purple',
    title: 'Score',
    body: 'Thirty days of checks become a score card: availability, speed, integrity and, for anchors that issue their own asset, how well it holds its peg. A separate confidence says how much we measured; hard failures cap the score.',
  },
  {
    n: '03',
    icon: Stamp,
    sticker: 'bg-sticker-teal',
    title: 'Publish',
    body: 'The card goes on-chain with the hash of every input behind it, and the inputs are published. Anyone can recompute the score. The contract never touches an anchor’s stake.',
  },
];

const EVIDENCE = [
  {
    type: 'RealMainnet' as const,
    title: 'Does it answer today?',
    body: 'Every live SEP-6/24 anchor on mainnet, discovered automatically and checked read-only.',
  },
  {
    type: 'RealTestnet' as const,
    title: 'Does a deposit finish?',
    body: 'A real SEP-10 login and SEP-24 interactive deposit, run end to end against a live testnet anchor.',
  },
  {
    type: 'SimulatedMock' as const,
    title: 'Is the math honest?',
    body: 'A known-good and a known-bad reference anchor, so the scoring can be checked against ground truth.',
  },
];

export default async function LandingPage() {
  const { top, mainnetCount, lastPublishedAt } = await loadSnapshot();

  return (
    <div className="as-grid-ground">
      {/* Hero: the console's ambience — a radar sweep, not an orbit trail. */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-[46%] right-[-10%] hidden md:block">
          <Radar size={820} />
        </div>
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <SiteNav />

          <header className="grid grid-cols-1 gap-12 pb-20 pt-12 md:grid-cols-[1.25fr_1fr] md:items-center md:pb-28 md:pt-16">
            <div className="min-w-0">
              <div className="mb-6 flex flex-wrap gap-2">
                <StatusChip tone="signal" live>
                  Mainnet · {mainnetCount} anchor{mainnetCount === 1 ? '' : 's'}
                </StatusChip>
                {lastPublishedAt && (
                  <StatusChip tone="pulse" dot>
                    Last publish {formatRelativeTime(lastPublishedAt)}
                  </StatusChip>
                )}
              </div>
              <h1 className="font-heading text-5xl font-bold leading-[0.96] tracking-[-0.03em] text-as-ink sm:text-6xl lg:text-[72px]">
                Which anchor
                <br />
                will <span className="text-as-signal">hold?</span>
              </h1>
              <p className="mt-7 max-w-md text-base leading-relaxed text-as-ink-muted sm:text-lg">
                Anyone can claim an anchor is reliable. We measure it, from evidence
                a wallet can’t fake, and publish the score on-chain.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link href="/scores" className="as-btn as-btn--primary group focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse">
                  See the live scores
                  <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <a href="#method" className="as-btn as-btn--outline focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse">
                  How it works
                </a>
              </div>
            </div>

            {/* Real mainnet scores when the chain is reachable, otherwise the mark alone. */}
            <aside className="as-panel as-panel--lg relative p-6" aria-label="Live mainnet scores">
              {top.length > 0 ? (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="as-label">Top mainnet anchors</span>
                    <StatusChip tone="signal" live>
                      Live
                    </StatusChip>
                  </div>
                  <ol className="as-rows">
                    {top.map((a, i) => {
                      const score = Math.round(headlineScore(a));
                      const history = a.scoreHistory.map((p) => p.score);
                      return (
                        <li key={a.anchorId} className="as-row">
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="as-timestamp w-[18px]">{String(i + 1).padStart(2, '0')}</span>
                            <span className="as-row__name">{a.name}</span>
                          </span>
                          <span className="flex items-center gap-3">
                            {history.length >= 2 && <Sparkline history={a.scoreHistory} currentScore={score} anchorId={`home-${a.anchorId}`} />}
                            <span className={`as-row__num ${TIER_TEXT[scoreTier(score)]}`}>{score}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <Link href="/scores" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-as-signal hover:underline">
                    All anchors <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
                  <Logo size={64} />
                  <p className="max-w-[16rem] text-sm text-as-ink-muted">
                    No mainnet anchor has been measured long enough for a score yet. The checks behind it are live on the dashboard.
                  </p>
                </div>
              )}
            </aside>
          </header>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Method */}
        <section id="method" className="scroll-mt-8 py-20 md:py-28">
          <h2 className="max-w-xl font-heading text-[44px] font-bold leading-[1.02] tracking-[-0.025em] text-as-ink">
            Measured three times, published once.
          </h2>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="as-panel p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-as-md bg-as-signal-soft text-as-signal">
                  <s.icon size={22} weight="bold" aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-heading text-[22px] font-bold tracking-[-0.011em] text-as-ink">
                  <span className="as-mono mr-2 text-sm text-as-ink-faint">{s.n}</span>
                  {s.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-as-ink-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <Link href="/methodology" className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-as-signal hover:underline">
            How each check is weighed, and how to verify a score <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </Link>
        </section>

        {/* Evidence */}
        <section id="evidence" className="scroll-mt-8 pb-20 md:pb-28">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="font-heading text-4xl font-bold tracking-[-0.025em] text-as-ink">
                Three kinds of evidence.
              </h2>
              <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-as-ink-muted">
                Every score says where it came from. Simulated data is always labelled as simulated.
              </p>
            </div>
            <ul className="as-panel divide-y divide-as-hairline overflow-hidden">
              {EVIDENCE.map((e) => (
                <li key={e.type} className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:gap-8">
                  <div className="sm:w-40 sm:flex-shrink-0">
                    <SourceBadge sourceType={e.type} />
                  </div>
                  <div>
                    <h3 className="font-heading text-xl font-bold tracking-[-0.01em] text-as-ink">{e.title}</h3>
                    <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-as-ink-muted">{e.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="as-panel as-panel--lg as-panel--live mb-16 px-8 py-16 text-center sm:px-14 md:mb-24">
          <h2 className="mx-auto max-w-lg font-heading text-4xl font-bold leading-tight tracking-[-0.025em] text-as-ink">
            Check an anchor before you route money through it.
          </h2>
          <Link
            href="/scores"
            className="as-btn as-btn--primary mt-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
          >
            Open the scores
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
          <p className="mt-6 text-sm text-as-ink-muted">
            Run an anchor?{' '}
            <Link href="/apply" className="font-medium text-as-signal hover:underline">
              Apply to have it measured
            </Link>
            .
          </p>
        </section>

        <footer className="flex flex-col gap-3 py-8 text-sm text-as-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2 font-medium text-as-ink">
            <Logo size={18} /> Anchor Status
          </span>
          <span>Read-only. Nothing here trades or moves real assets. Writes happen on testnet only.</span>
        </footer>
      </div>
    </div>
  );
}
