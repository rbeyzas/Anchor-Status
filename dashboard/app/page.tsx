import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Broadcast, ChartLineUp, Stamp } from '@phosphor-icons/react/dist/ssr';
import { OrbitTrails } from '@/components/backgrounds/orbit-trails';
import { Logo } from '@/components/Logo';
import { SiteNav } from '@/components/SiteNav';
import { SourceBadge } from '@/components/SourceBadge';
import { getDashboardData } from '@/lib/soroban';
import type { AnchorViewModel } from '@/lib/types';
import { scoreTier } from '@/lib/types';

// Same cadence as /scores: at most one chain read a minute.
export const revalidate = 60;

const TIER_TEXT = { high: 'text-success', medium: 'text-warning', low: 'text-danger' } as const;

async function loadPreview(): Promise<AnchorViewModel[]> {
  try {
    const { anchors, dataSource } = await getDashboardData();
    if (dataSource !== 'live') return [];
    // Only anchors with a real score history are worth previewing.
    return [...anchors]
      .filter((a) => a.sourceType === 'RealMainnet')
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  } catch {
    return [];
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
    body: 'A Soroban contract blends every report into one weighted score, a trend, and a risk flag. Real sources move it faster than simulated ones.',
  },
  {
    n: '03',
    icon: Stamp,
    sticker: 'bg-sticker-teal',
    title: 'Publish',
    body: 'The verdict is written on-chain and read straight back by the dashboard. Anyone can check it. The contract never touches an anchor’s stake.',
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
  const preview = await loadPreview();

  return (
    <div>
      {/* Hero: the single dark "night" island on an otherwise daylight page. */}
      <div className="relative overflow-hidden rounded-b-[28px] bg-secondary text-white">
        <OrbitTrails tone="dark" className="absolute inset-y-0 left-[40%] right-[-12%] hidden md:block" />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <SiteNav onDark />

          <header className="grid gap-12 pb-20 pt-12 md:grid-cols-[1.25fr_1fr] md:items-end md:pb-28 md:pt-20">
            <div>
              <p className="mb-6 inline-block rounded-pill border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold">
                Stellar SEP-24 reliability oracle
              </p>
              <h1 className="font-heading text-5xl font-bold leading-[1] tracking-[-0.033em] sm:text-6xl lg:text-[64px]">
                Which anchor
                <br />
                will <span className="text-sticker-sky">hold?</span>
              </h1>
              <p className="mt-7 max-w-md text-base leading-relaxed text-white/75 sm:text-lg">
                Anyone can claim an anchor is reliable. We measure it, from evidence
                a wallet can’t fake, and publish the score on-chain.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  href="/scores"
                  className="btn btn-md btn-white group focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
                >
                  See the live scores
                  <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <a
                  href="#method"
                  className="btn btn-md btn-ghost-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  How it works
                </a>
              </div>
            </div>

            {/* Real mainnet scores when the chain is reachable, otherwise the mark alone. */}
            <aside className="relative rounded-card bg-surface-glass p-6 text-ink shadow-glow" aria-label="Live mainnet scores">
              {preview.length > 0 ? (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-muted">Top mainnet anchors</span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" aria-hidden="true" />
                      Live
                    </span>
                  </div>
                  <ol className="divide-y divide-border">
                    {preview.map((a) => (
                      <li key={a.anchorId} className="flex items-center justify-between gap-4 py-3.5">
                        <span className="truncate text-sm font-medium">{a.name}</span>
                        <span className={`tabular font-heading text-3xl font-bold tracking-tight ${TIER_TEXT[scoreTier(a.score)]}`}>
                          {Math.round(a.score)}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <Link href="/scores" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                    All anchors <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
                  <Logo size={64} />
                  <p className="max-w-[16rem] text-sm text-ink-muted">
                    Scores are read from the chain when you open the dashboard.
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
          <h2 className="max-w-xl font-heading text-4xl font-bold tracking-[-0.025em] text-ink">
            Measured three times, published once.
          </h2>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-card border border-border bg-surface-glass p-6 shadow-card">
                <span className={`flex h-11 w-11 items-center justify-center rounded-card text-black ${s.sticker}`}>
                  <s.icon size={22} weight="bold" aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-heading text-[22px] font-bold tracking-[-0.011em] text-ink">
                  <span className="mr-2 text-sm font-semibold text-ink-faint">{s.n}</span>
                  {s.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Evidence */}
        <section id="evidence" className="scroll-mt-8 pb-20 md:pb-28">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="font-heading text-4xl font-bold tracking-[-0.025em] text-ink">
                Three kinds of evidence.
              </h2>
              <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-ink-muted">
                Every score says where it came from. Simulated data is always labelled as simulated.
              </p>
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-glass shadow-card">
              {EVIDENCE.map((e) => (
                <li key={e.type} className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:gap-8">
                  <div className="sm:w-40 sm:flex-shrink-0">
                    <SourceBadge sourceType={e.type} />
                  </div>
                  <div>
                    <h3 className="font-heading text-xl font-bold tracking-[-0.01em] text-ink">{e.title}</h3>
                    <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-ink-muted">{e.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="mb-16 rounded-card border border-border bg-surface-glass px-8 py-16 text-center shadow-card sm:px-14 md:mb-24">
          <h2 className="mx-auto max-w-lg font-heading text-4xl font-bold leading-tight tracking-[-0.025em] text-ink">
            Check an anchor before you route money through it.
          </h2>
          <Link
            href="/scores"
            className="btn btn-md btn-primary mt-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Open the scores
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
        </section>

        <footer className="flex flex-col gap-3 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2 font-medium text-ink">
            <Logo size={18} /> Anchor Status
          </span>
          <span>Read-only. Nothing here trades or moves real assets. Writes happen on testnet only.</span>
        </footer>
      </div>
    </div>
  );
}
