import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { ApplyForm } from '@/components/ApplyForm';
import { Logo } from '@/components/Logo';
import { NetworkSwitch } from '@/components/NetworkSwitch';
import { SiteNav } from '@/components/SiteNav';
import { StatusChip } from '@/components/StatusChip';
import { formatRelativeTime } from '@/lib/format';
import { shortHash } from '@/lib/home';
import { normalizeDomainInput, STATUS_COPY } from '@/lib/onboarding';
import { fetchTestnetOnboarding } from '@/lib/onboarding-server';
import { TESTNET_CHECK_LABEL, testnetTxUrl, type TestnetApplication, type TestnetCheck } from '@/lib/onboarding-testnet';

export const metadata: Metadata = {
  title: 'Add your testnet anchor: Mona',
  description: 'Apply to have your Stellar testnet anchor tested with a real money flow: deposit and withdrawal, every payment checked on the ledger.',
};

const RECENT = 20;

function CheckRow({ check }: { check: TestnetCheck }) {
  const chip =
    check.passed === true
      ? { tone: 'signal' as const, label: 'Passed' }
      : check.passed === false
        ? { tone: 'danger' as const, label: 'Failed' }
        : { tone: 'neutral' as const, label: 'Does not apply' };
  return (
    <li className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-40 flex-shrink-0 text-sm font-medium text-as-ink">{TESTNET_CHECK_LABEL[check.name] ?? check.name}</span>
      <span className="w-32 flex-shrink-0">
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
      </span>
      <span className="min-w-0 break-words text-sm text-as-ink-muted">
        {check.detail}
        {check.ms !== undefined && <span className="as-timestamp ml-2">{(check.ms / 1000).toFixed(1)} s</span>}
        {check.tx && (
          <a
            href={testnetTxUrl(check.tx)}
            target="_blank"
            rel="noreferrer"
            className="as-mono ml-2 inline-flex items-center gap-0.5 text-xs text-as-pulse hover:underline"
          >
            tx {shortHash(check.tx)} <ArrowUpRight size={11} weight="bold" aria-hidden="true" />
          </a>
        )}
      </span>
    </li>
  );
}

function ApplicationDetail({ app }: { app: TestnetApplication }) {
  const status = STATUS_COPY[app.status];
  return (
    <div className="as-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-xl font-semibold text-as-ink">{app.name ?? app.domain}</h2>
          <span className="as-mono text-xs text-as-ink-faint">{app.domain}</span>
        </div>
        <StatusChip tone={status.tone} dot>
          {status.label}
        </StatusChip>
      </div>
      <p className="mt-3 text-sm text-as-ink-muted">
        Applied {formatRelativeTime(app.submitted_at)}
        {app.checked_at ? `, tested ${formatRelativeTime(app.checked_at)}` : ', not tested yet (tests run every 20 minutes)'}.
        {app.reason ? ` ${app.reason.charAt(0).toUpperCase()}${app.reason.slice(1)}.` : ''}
      </p>
      {app.checks.length > 0 && (
        <ul className="mt-2 divide-y divide-as-hairline">
          {app.checks.map((c) => (
            <CheckRow key={c.name} check={c} />
          ))}
        </ul>
      )}
      {(app.status === 'accepted' || app.status === 'already_tracked') && (
        <p className="mt-4 text-sm text-as-ink-muted">
          {app.status === 'accepted'
            ? 'It is registered on-chain as a testnet anchor, the same test runs on it every 20 minutes, and it gets a score card by the same methodology as a mainnet anchor.'
            : 'This testnet anchor was already being tested before it applied.'}{' '}
          <Link href={app.anchor_id ? `/scores?anchor=${encodeURIComponent(app.anchor_id)}` : '/scores'} className="inline-flex items-center gap-1 font-medium text-as-signal hover:underline">
            See the scores <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
          </Link>
        </p>
      )}
      {app.status === 'rejected' && (
        <p className="mt-4 text-sm text-as-ink-muted">Fix the step that failed and apply again: the same domain can be tested again 24 hours after its last test.</p>
      )}
    </div>
  );
}

const STEPS = [
  ['Public domain', 'Your domain resolves to a public address. A name pointing into a private network is never fetched.'],
  ['The read-only check', 'The same check every mainnet anchor gets: stellar.toml, /info, a SEP-10 sign-in, and a SEP-24 deposit start. If this fails, the money flow is not attempted.'],
  ['stellar.toml', 'It names the testnet (or no network) and advertises SEP-10 and a SEP-24 or SEP-6 transfer server.'],
  ['Test wallet', 'A fresh testnet account, funded by Friendbot, opens a trustline to your asset.'],
  ['SEP-10 sign-in', 'The challenge must be signed by the SIGNING_KEY your toml publishes.'],
  [
    'Deposit',
    'SEP-24: the interactive page is filled in. SEP-6: the deposit is requested, then your sandbox’s own control marks the fiat as paid (a button on the transaction’s more_info_url, like “Simulate incoming transfer”).',
  ],
  ['Deposit on the ledger', 'The transaction must complete, and its payment to our wallet must be on the testnet ledger, for the amount you report.'],
  ['Withdrawal', 'SEP-6 only: we request a withdrawal and pay you what we received, with your memo; you must see it and complete the withdrawal.'],
] as const;

export default async function ApplyTestnetPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const [{ domain: domainParam }, file] = await Promise.all([searchParams, fetchTestnetOnboarding()]);
  const lookup = domainParam ? normalizeDomainInput(domainParam) : null;
  const found = lookup ? file?.candidates.find((c) => c.domain === lookup) : undefined;
  const recent = file?.candidates.slice(0, RECENT) ?? [];

  return (
    <div className="as-grid-ground min-h-screen">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SiteNav />

        <header className="pb-10 pt-8 md:pt-14">
          <NetworkSwitch current="testnet" />
          <h1 className="mt-5 max-w-3xl font-heading text-5xl font-bold leading-[1.02] tracking-[-0.03em] text-as-ink sm:text-6xl">
            Add your testnet anchor.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-as-ink-muted">
            On testnet, money moves. A fresh wallet deposits with your anchor and withdraws back, and every payment is
            checked on the ledger, not taken from your API’s word. Pass once and the same test runs every 20 minutes,
            and your anchor is scored by the same methodology as a mainnet one.
          </p>
        </header>

        <section className="as-panel as-panel--lg p-5 sm:p-8" aria-label="Apply">
          <span className="as-label">Your testnet anchor’s domain</span>
          <div className="mt-3">
            <ApplyForm network="testnet" />
          </div>
        </section>

        {domainParam && (
          <section className="pt-10" aria-label="Your application">
            {!lookup ? (
              <p className="as-panel p-5 text-sm text-as-ink-muted">“{domainParam.slice(0, 80)}” is not a plain domain name.</p>
            ) : found ? (
              <ApplicationDetail app={found} />
            ) : (
              <p className="as-panel p-5 text-sm text-as-ink-muted">
                {file
                  ? `No tested application for ${lookup} yet. Tests run every 20 minutes; if you just applied, look again shortly.`
                  : 'Application status is not available right now.'}
              </p>
            )}
          </section>
        )}

        <section className="py-14 md:py-20">
          <h2 className="font-heading text-3xl font-bold tracking-[-0.025em] text-as-ink">The money-flow test.</h2>
          <ol className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="as-panel p-5">
                <span className="as-label">Step {i + 1}</span>
                <h3 className="mt-2 font-heading text-lg font-semibold text-as-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-as-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-as-ink-muted">
            Admitted when every step that applies passes. A failure on our side (Friendbot down, our browser) decides
            nothing and is retried. Testnet anchors are scored by the same engine and the same numbers as mainnet ones; the card says which network it came from.
          </p>
        </section>

        <section className="pb-16" aria-label="Recent testnet applications">
          <h2 className="font-heading text-2xl font-bold tracking-[-0.02em] text-as-ink">Recent testnet applications</h2>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-as-ink-muted">No testnet applications yet.</p>
          ) : (
            <ul className="as-panel mt-5 divide-y divide-as-hairline">
              {recent.map((a) => {
                const s = STATUS_COPY[a.status];
                return (
                  <li key={a.domain}>
                    <Link
                      href={`/apply/testnet?domain=${encodeURIComponent(a.domain)}`}
                      className="flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-as-surface-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-as-ink">{a.name ?? a.domain}</span>
                        <span className="as-mono block truncate text-xs text-as-ink-faint">{a.domain}</span>
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-3">
                        <span className="as-timestamp">{formatRelativeTime(a.checked_at ?? a.submitted_at)}</span>
                        <StatusChip tone={s.tone} dot>
                          {s.label}
                        </StatusChip>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="flex flex-col gap-3 border-t border-as-hairline py-8 text-sm text-as-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2 font-medium text-as-ink">
            <Logo size={18} /> Mona
          </span>
          <span>Every testnet application, its steps and its ledger transactions are public.</span>
        </footer>
      </div>
    </div>
  );
}
