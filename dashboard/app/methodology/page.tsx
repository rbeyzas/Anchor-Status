import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { Logo } from '@/components/Logo';
import { ScoreCalculator } from '@/components/ScoreCalculator';
import { SiteNav } from '@/components/SiteNav';
import {
  CONFIDENCE_BANDS,
  GATES,
  INFO_FLAGS,
  INTEGRITY_CHECKS,
  MARKET_CURVE,
  METHODOLOGY_VERSION,
  shares,
  SPEED_CURVE,
  UPTIME_CURVE,
} from '@/lib/methodology';

export const metadata: Metadata = {
  title: 'How we measure: Mona',
  description: 'How an anchor score card is measured and computed: the checks, the four pillars, confidence, gates, and how to verify a score yourself.',
};

const SPEC_URL = 'https://github.com/rbeyzas/Anchor-Status/blob/main/docs/SCORING.md';

const STAGES = [
  { stage: 'stellar.toml', what: 'Fetch the anchor’s SEP-1 file. It must still advertise a SEP-6 or SEP-24 transfer server.' },
  { stage: '/info', what: 'Ask the transfer server what it supports. It must answer with JSON.' },
  { stage: 'Sign-in challenge', what: 'Request a SEP-10 challenge and check that the anchor’s published key signed it.' },
  { stage: 'Sign-in token', what: 'Sign the challenge with a throwaway wallet and exchange it for a session token.' },
  { stage: 'Deposit start', what: 'Start a SEP-24 interactive deposit, receive its URL, then abandon it. No money moves.' },
];

/** What a testnet anchor gets on top of the five above. */
const TESTNET_EXTRA =
  'On testnet the same five steps run first, and then money actually moves: a fresh wallet funded by Friendbot opens a trustline, deposits with the anchor and withdraws back, and every payment is checked on the ledger rather than taken from the anchor’s word.';

const PILLAR_COPY = [
  {
    key: 'availability' as const,
    title: 'Availability',
    question: 'Does it answer?',
    body: 'The share of checks that got an answer, over the last 7 days and the last 30, blended half and half so a fresh outage counts without forgetting the month. An anchor that answers but declines an anonymous wallet is up: that costs test depth (confidence), not availability.',
    curveTitle: 'Uptime to score',
    curve: [...UPTIME_CURVE].reverse().map(([x, y]) => [`${x}%`, y] as const),
    note: 'Shaped by “nines”: 95% uptime means an hour and a quarter down every day, a poor anchor, not a 95.',
  },
  {
    key: 'speed' as const,
    title: 'Speed',
    question: 'How fast does each step answer?',
    body: 'For every successful check, the average time of the steps it completed, so an anchor we can test to step 2 compares fairly with one we test to step 5. Then the 95th percentile over 7 days: the slow tail a wallet actually waits through, not the average.',
    curveTitle: 'p95 seconds per step to score',
    curve: SPEED_CURVE.map(([x, y]) => [`${x}s`, y] as const),
    note: 'Straight line between the two points, flat outside. No successful check in 7 days scores 0.',
  },
  {
    key: 'integrity' as const,
    title: 'Integrity',
    question: 'Does what it publishes hold up?',
    body: 'A weighted checklist, from the latest check (the signing key over 30 days). A check that could not run because an earlier step failed on the anchor’s side fails; one that does not apply, or that the anchor declined by policy, is left out of both sides of the ratio.',
    curveTitle: '',
    curve: [],
    note: '',
  },
  {
    key: 'market' as const,
    title: 'Market',
    question: 'Does its own asset hold its peg?',
    body: 'Only for a fiat asset the anchor issues itself (its issuer points back at the anchor). The price against USDC on the Stellar DEX, from the order book and the AMM pool, compared with a daily reference rate. A sample counts only on a liquid market: both sides of the book, a spread under 5%, and at least $500 within 1% of the price.',
    curveTitle: 'Median deviation to score',
    curve: MARKET_CURVE.map(([x, y]) => [`${x} bps`, y] as const),
    note: 'Minus 20 if over a quarter of samples are more than 0.5% off, minus 20 if a gap over 1% lasted more than 6 hours: a gap arbitrage cannot close is the failure users feel. Not applicable (n/a) for anchors that only distribute someone else’s asset, have no fiat reference, or no liquid market; its weight then moves to the other three.',
  },
];

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 py-14 md:py-20">
      <h2 className="max-w-2xl font-heading text-3xl font-bold tracking-[-0.025em] text-as-ink md:text-4xl">{title}</h2>
      {lead && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-as-ink-muted">{lead}</p>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

function CurveTable({ title, rows }: { title: string; rows: readonly (readonly [string, number])[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left text-xs font-semibold text-as-ink-faint">{title}</caption>
      <tbody className="divide-y divide-as-hairline">
        {rows.map(([x, y]) => (
          <tr key={x}>
            <td className="tabular py-1.5 font-mono text-as-ink-muted">{x}</td>
            <td className="py-1.5">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-pill bg-as-surface-2" aria-hidden="true">
                  <div className="h-full rounded-pill bg-as-signal" style={{ width: `${y}%` }} />
                </div>
                <span className="tabular font-mono text-as-ink">{y}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function MethodologyPage() {
  const withMarket = shares(true);
  const withoutMarket = shares(false);
  const integrityTotal = INTEGRITY_CHECKS.reduce((s, c) => s + c.weight, 0);

  return (
    <div className="as-grid-ground min-h-screen">
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <SiteNav />

      <header className="pb-6 pt-10 md:pt-16">
        <p className="mb-5 inline-block rounded-pill border border-as-hairline bg-as-surface-1 px-3 py-1 text-xs font-semibold text-as-ink-muted">
          Methodology version {METHODOLOGY_VERSION}
        </p>
        <h1 className="max-w-3xl font-heading text-5xl font-bold leading-[1.02] tracking-[-0.033em] text-as-ink sm:text-6xl">
          How we measure an anchor.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-as-ink-muted">
          Every anchor we measure, on mainnet and on testnet, gets a score card built from 30 days of checks, by the
          same engine and the same numbers. It says how well the anchor did on what we measured, and, as a separate
          number, how much we measured. Nothing is guessed, traffic never adds points, and every number can be
          recomputed by anyone from what we publish.
        </p>
        <nav className="mt-8 flex flex-wrap gap-2 text-sm" aria-label="On this page">
          {[
            ['#checks', 'The checks'],
            ['#pillars', 'Four pillars'],
            ['#confidence', 'Confidence'],
            ['#score', 'The score'],
            ['#gates', 'Gates and flags'],
            ['#not-scored', 'Not scored'],
            ['#verify', 'Verify it'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-pill border border-as-hairline px-3 py-1 text-as-ink-muted transition-colors hover:border-as-border-control hover:text-as-ink">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section
        id="checks"
        title="A check like a wallet’s, every 20 minutes."
        lead="We call each anchor’s public API the way a wallet would, from a fresh throwaway wallet each time. On mainnet we stop before any money moves. An anchor that has not answered for a week is checked every six hours instead, until it answers again. Which steps apply depends on what the anchor’s own stellar.toml advertises."
      >
        <ol className="grid gap-3 md:grid-cols-5">
          {STAGES.map((s, i) => (
            <li key={s.stage} className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
              <span className="text-xs font-semibold text-as-ink-faint">Step {i + 1}</span>
              <h3 className="mt-1 font-heading text-lg font-bold text-as-ink">{s.stage}</h3>
              <p className="mt-2 text-sm leading-relaxed text-as-ink-muted">{s.what}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 rounded-as-md border border-as-pulse/30 bg-as-pulse-soft p-4 text-sm leading-relaxed text-as-ink-muted">
          <span className="font-medium text-as-ink">On testnet, further.</span> {TESTNET_EXTRA}
        </p>
        <div className="mt-6 grid gap-3 text-sm text-as-ink-muted md:grid-cols-3">
          <p className="rounded-as-md border border-as-hairline p-4">
            <span className="font-medium text-as-danger">Failure:</span> no answer, a server error, or an endpoint the anchor
            advertises that does not exist.
          </p>
          <p className="rounded-as-md border border-as-hairline p-4">
            <span className="font-medium text-as-signal">Up, but declined:</span> the anchor understood and said no (for
            example “client_domain is required”). It is up; we just could not test further.
          </p>
          <p className="rounded-as-md border border-as-hairline p-4">
            <span className="font-medium text-as-ink">Inconclusive:</span> when our own network is down, the check is
            thrown away. Our outage is never recorded as theirs.
          </p>
        </div>
      </Section>

      <Section
        id="pillars"
        title="Four pillars, weighted."
        lead="Each pillar is a number from 0 to 100. The weights say how much each moves the score. Market applies only to an anchor that issues its own fiat asset and trades on a market we can measure; when it does not, its weight is spread over the other three."
      >
        <div className="mb-10 grid gap-4 md:grid-cols-2">
          {[
            { title: 'When Market applies', s: withMarket },
            { title: 'When it does not', s: withoutMarket },
          ].map(({ title, s }) => (
            <div key={title} className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
              <span className="text-xs font-semibold text-as-ink-faint">{title}</span>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-pill" aria-hidden="true">
                <div className="bg-as-signal" style={{ width: `${s.availability * 100}%` }} />
                <div className="bg-as-pulse" style={{ width: `${s.speed * 100}%` }} />
                <div className="bg-as-amber" style={{ width: `${s.integrity * 100}%` }} />
                <div className="bg-as-danger" style={{ width: `${s.market * 100}%` }} />
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-as-ink-muted">
                <li>Availability <span className="tabular font-mono text-as-ink">{Math.round(s.availability * 100)}%</span></li>
                <li>Speed <span className="tabular font-mono text-as-ink">{Math.round(s.speed * 100)}%</span></li>
                <li>Integrity <span className="tabular font-mono text-as-ink">{Math.round(s.integrity * 100)}%</span></li>
                <li>Market <span className="tabular font-mono text-as-ink">{s.market ? `${Math.round(s.market * 100)}%` : 'n/a'}</span></li>
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {PILLAR_COPY.map((p) => (
            <article key={p.key} className="grid gap-6 rounded-as-md border border-as-hairline bg-as-surface-1 p-6 shadow-as-panel md:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="flex items-baseline gap-3">
                  <h3 className="font-heading text-2xl font-bold text-as-ink">{p.title}</h3>
                  <span className="text-sm text-as-ink-faint">
                    {Math.round(withMarket[p.key] * 100)}% of the score
                    {p.key !== 'market' && `, ${Math.round(withoutMarket[p.key] * 100)}% without Market`}
                  </span>
                </div>
                <p className="mt-1 font-medium text-as-ink">{p.question}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-as-ink-muted">{p.body}</p>
                {p.note && <p className="mt-3 text-sm leading-relaxed text-as-ink-faint">{p.note}</p>}
              </div>
              <div>
                {p.key === 'integrity' ? (
                  <table className="w-full text-sm">
                    <caption className="mb-2 text-left text-xs font-semibold text-as-ink-faint">
                      Checklist (weights out of {integrityTotal})
                    </caption>
                    <tbody className="divide-y divide-as-hairline">
                      {INTEGRITY_CHECKS.map((c) => (
                        <tr key={c.key}>
                          <td className="py-2 pr-3 align-top">
                            <span className="font-medium text-as-ink">{c.label}</span>
                            <span className="block text-xs text-as-ink-faint">{c.passes}</span>
                          </td>
                          <td className="tabular py-2 text-right align-top font-mono text-as-ink">{c.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <CurveTable title={p.curveTitle} rows={p.curve} />
                )}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="confidence"
        title="Confidence: how much we measured."
        lead="A score from three days of checks and one from a month are not equally sure. Confidence is a second number, from 0 to 100, and it is what separates ‘we know little’ from ‘it is failing’."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="min-w-0 rounded-as-md border border-as-hairline bg-as-surface-1 p-6 shadow-as-panel">
            <h3 className="font-heading text-lg font-bold text-as-ink">What goes into it</h3>
            <ul className="mt-3 flex flex-col gap-3 text-[15px] text-as-ink-muted">
              <li>
                <span className="font-medium text-as-ink">Time watched</span>: full after 14 days of monitoring.
              </li>
              <li>
                <span className="font-medium text-as-ink">Number of checks</span>: full at 100 conclusive checks in 30 days.
              </li>
              <li>
                <span className="font-medium text-as-ink">Test depth</span>: the share of its own steps we could complete.
                An anchor that declines anonymous wallets at sign-in can only be tested to step 2 of 5.
              </li>
            </ul>
            <pre className="mt-4 overflow-x-auto rounded bg-as-surface-2 px-3 py-2 font-mono text-xs text-as-ink">
{`sufficiency = ½·min(1, days/14) + ½·min(1, checks/100)
depth       = ½ + ½·(steps tested / steps expected)
confidence  = 100 · sufficiency · depth`}
            </pre>
          </div>
          <div className="min-w-0 rounded-as-md border border-as-hairline bg-as-surface-1 p-6 shadow-as-panel">
            <h3 className="font-heading text-lg font-bold text-as-ink">What it changes</h3>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-as-hairline">
                {CONFIDENCE_BANDS.map((b) => (
                  <tr key={b.label}>
                    <td className="tabular py-2 pr-3 font-mono text-as-ink-muted">
                      {b.from} to {b.to}
                    </td>
                    <td className="py-2">
                      <span className="font-medium text-as-ink">{b.label}</span>
                      {'note' in b && b.note && <span className="block text-xs text-as-ink-faint">{b.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm leading-relaxed text-as-ink-muted">
              Confidence also pulls the score toward the middle (see below), so a new anchor lands near 50, not at 100.
              Traffic enters here and nowhere else: more checks make us surer, never make the score higher.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="score"
        title="From pillars to one score."
        lead="Three steps, in whole numbers, so anyone can check a published score from the card alone."
      >
        <ol className="mb-10 grid gap-3 md:grid-cols-3">
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="text-xs font-semibold text-as-ink-faint">1. Weigh</span>
            <p className="mt-2 text-sm leading-relaxed text-as-ink-muted">
              Weighted average of the pillars that apply, with the weights above.
            </p>
          </li>
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="text-xs font-semibold text-as-ink-faint">2. Pull toward 50</span>
            <p className="mt-2 text-sm leading-relaxed text-as-ink-muted">
              Mix with a neutral 50 by confidence: at confidence 100 the pillars decide alone, at 0 the score is 50.
              Unknown is not perfect.
            </p>
          </li>
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="text-xs font-semibold text-as-ink-faint">3. Cap</span>
            <p className="mt-2 text-sm leading-relaxed text-as-ink-muted">
              A hard failure caps the score whatever the average says. With several, the lowest cap wins.
            </p>
          </li>
        </ol>
        <h3 className="mb-4 font-heading text-xl font-bold text-as-ink">Try it</h3>
        <ScoreCalculator />
      </Section>

      <Section
        id="gates"
        title="Gates and flags."
        lead="A gate is a hard cap for a failure no average should hide. Information flags cap nothing; they explain the card. Both are always shown, whatever the confidence."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <table className="w-full overflow-hidden rounded-as-md border border-as-hairline bg-as-surface-1 text-sm shadow-as-panel">
            <thead>
              <tr className="text-left text-xs text-as-ink-faint">
                <th className="px-4 pb-2 pt-4 font-semibold">Gate</th>
                <th className="px-4 pb-2 pt-4 font-semibold">When</th>
                <th className="px-4 pb-2 pt-4 text-right font-semibold">Cap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-as-hairline">
              {GATES.map((g) => (
                <tr key={g.flag}>
                  <td className="px-4 py-2.5 align-top font-mono text-xs text-as-danger">{g.flag}</td>
                  <td className="px-4 py-2.5 text-as-ink-muted">{g.when}</td>
                  <td className="tabular px-4 py-2.5 text-right align-top font-mono text-as-ink">{g.cap}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full overflow-hidden rounded-as-md border border-as-hairline bg-as-surface-1 text-sm shadow-as-panel">
            <thead>
              <tr className="text-left text-xs text-as-ink-faint">
                <th className="px-4 pb-2 pt-4 font-semibold">Information</th>
                <th className="px-4 pb-2 pt-4 font-semibold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-as-hairline">
              {INFO_FLAGS.map((f) => (
                <tr key={f.flag}>
                  <td className="px-4 py-2.5 align-top font-mono text-xs text-as-ink">{f.flag}</td>
                  <td className="px-4 py-2.5 text-as-ink-muted">{f.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="not-scored" title="What never adds points." lead="Some signals are easy to show and easy to fake. They are context at most.">
        <ul className="grid gap-3 md:grid-cols-2">
          {[
            ['Transaction volume', 'A payment on Stellar costs a fraction of a cent, so volume can be inflated by anyone, and a busy anchor is not a reliable one. It feeds the SILENT flag only.'],
            ['Age', 'An old, abandoned anchor is old. “On-chain since” is shown as context; our own monitoring time feeds confidence.'],
            ['Stake', 'Optional, and nobody is ever slashed. Shown only where an operator has staked.'],
            ['Machine learning', 'There is no labelled ground truth and the score must be explainable to the anchor it describes. Plain statistics: windows, percentiles, and a pull toward the middle.'],
          ].map(([title, body]) => (
            <li key={title} className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
              <h3 className="font-heading text-lg font-bold text-as-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-as-ink-muted">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="incidents"
        title="When we are the ones who broke."
        lead="A check that failed because our own collector could not reach anything says nothing about the anchor. Counting it would be a lie about somebody else’s service, so we drop those rounds and publish what happened."
      >
        <ul className="flex flex-col gap-3 text-[15px] text-as-ink-muted">
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="font-medium text-as-ink">A round is only dropped for an anchor that answered us later.</span>{' '}
            Each incident names a window and a later window in which the collector is known to have worked. An anchor that
            never answered us keeps its failures: we cannot tell an outage of ours from an anchor that is genuinely gone,
            so we do not pretend to.
          </li>
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="font-medium text-as-ink">A failure the anchor answered with always counts.</span> A 404 or a
            500 came from the anchor’s own server, so our side of the connection worked. Only failures where we never got
            an answer at all can be ours.
          </li>
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="font-medium text-as-ink">The list decides nothing by name.</span> It names rounds, never
            anchors: which checks come out is worked out from the published probe log by a rule anyone can re-run. Dropping
            checks also costs the anchor a little confidence, because confidence counts how much we actually measured.
          </li>
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="font-medium text-as-ink">Every card says so.</span> A card whose window lost checks lists the
            incident in its published inputs bundle, and its page says how many. The incidents themselves are at{' '}
            <code className="rounded bg-as-surface-2 px-1.5 py-0.5 font-mono text-xs text-as-ink">/incidents.json</code>,
            beside the probe logs.
          </li>
        </ul>
      </Section>

      <Section
        id="verify"
        title="Don’t take our word for it."
        lead="Every score card goes on-chain with the SHA-256 of the inputs it was computed from, and the inputs are published. Nothing in the chain of evidence depends on trusting us."
      >
        <ol className="flex flex-col gap-3 text-[15px] text-as-ink-muted">
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="font-medium text-as-ink">The headline</span> can be checked from the on-chain card alone: its
            pillars, confidence and flags are stored with it.
          </li>
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="font-medium text-as-ink">The pillars</span> can be recomputed from the inputs bundle, whose hash
            is on-chain:
            <code className="mt-2 block overflow-x-auto rounded bg-as-surface-2 px-3 py-2 font-mono text-xs text-as-ink">
              cd services/aggregator && npm run verify-score -- &lt;bundle hash&gt; --anchor &lt;anchor id&gt;
            </code>
          </li>
          <li className="rounded-as-md border border-as-hairline bg-as-surface-1 p-5 shadow-as-panel">
            <span className="font-medium text-as-ink">The bundle</span> holds a digest of each day’s checks, which can be
            recomputed from the raw probe logs we publish, and each check has its own evidence document: the anchor’s
            own signed sign-in challenge.
          </li>
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/scores" className="as-btn as-btn--primary focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse">
            See the live scores
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
          <a
            href={SPEC_URL}
            target="_blank"
            rel="noreferrer"
            className="as-btn as-btn--outline focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
          >
            The full specification
            <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
          </a>
        </div>
      </Section>

      <footer className="flex flex-col gap-3 border-t border-as-hairline py-8 text-sm text-as-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-2 font-medium text-as-ink">
          <Logo size={18} /> Mona
        </span>
        <span>Changing any number on this page means a new methodology version. This is version {METHODOLOGY_VERSION}.</span>
      </footer>
    </div>
    </div>
  );
}
