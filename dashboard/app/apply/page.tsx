import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { ApplyForm } from '@/components/ApplyForm';
import { Logo } from '@/components/Logo';
import { NetworkSwitch } from '@/components/NetworkSwitch';
import { SiteNav } from '@/components/SiteNav';
import { StatusChip } from '@/components/StatusChip';
import { formatRelativeTime } from '@/lib/format';
import { CHECK_LABEL, normalizeDomainInput, STATUS_COPY, type Application, type ApplicationCheck } from '@/lib/onboarding';
import { fetchOnboarding } from '@/lib/onboarding-server';

export const metadata: Metadata = {
  title: 'Add your mainnet anchor: Anchor Status',
  description: 'Apply to have your Stellar mainnet anchor measured: what is checked, and where each application stands.',
};

const RECENT = 20;

function CheckRow({ check }: { check: ApplicationCheck }) {
  const chip =
    check.passed === true
      ? { tone: 'signal' as const, label: 'Passed' }
      : check.passed === false
        ? { tone: 'danger' as const, label: 'Failed' }
        : { tone: 'neutral' as const, label: 'Does not apply' };
  return (
    <li className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-36 flex-shrink-0 text-sm font-medium text-as-ink">{CHECK_LABEL[check.name] ?? check.name}</span>
      <span className="w-32 flex-shrink-0">
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
      </span>
      <span className="min-w-0 break-words text-sm text-as-ink-muted">{check.detail}</span>
    </li>
  );
}

function ApplicationDetail({ app }: { app: Application }) {
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
        {app.checked_at ? `, checked ${formatRelativeTime(app.checked_at)}` : ', not checked yet (checks run every 20 minutes)'}.
        {app.reason ? ` ${app.reason.charAt(0).toUpperCase()}${app.reason.slice(1)}.` : ''}
      </p>
      {app.checks.length > 0 && <ul className="mt-2 divide-y divide-as-hairline">{app.checks.map((c) => <CheckRow key={c.name} check={c} />)}</ul>}
      {(app.status === 'accepted' || app.status === 'already_tracked') && (
        <p className="mt-4 text-sm text-as-ink-muted">
          {app.status === 'accepted'
            ? 'It is registered on-chain and measured every 20 minutes. Its score appears once there is enough data to show it, usually within a few days.'
            : 'This anchor was already being measured before it applied.'}{' '}
          <Link href="/scores" className="inline-flex items-center gap-1 font-medium text-as-signal hover:underline">
            See the scores <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
          </Link>
        </p>
      )}
      {app.status === 'rejected' && (
        <p className="mt-4 text-sm text-as-ink-muted">Fix what failed and apply again: the same domain can be checked again 24 hours after its last check.</p>
      )}
    </div>
  );
}

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const [{ domain: domainParam }, file] = await Promise.all([searchParams, fetchOnboarding()]);
  const lookup = domainParam ? normalizeDomainInput(domainParam) : null;
  const found = lookup ? file?.candidates.find((c) => c.domain === lookup) : undefined;
  const recent = file?.candidates.slice(0, RECENT) ?? [];
  const t = file?.thresholds;

  const checks = [
    ['Public domain', 'Your domain resolves to a public address.'],
    ['stellar.toml', 'It serves a valid stellar.toml at /.well-known/stellar.toml.'],
    ['Network', 'The toml names the public network, or none. A testnet anchor applies on the testnet page.'],
    ['Transfer server', 'The toml advertises a SEP-24 (TRANSFER_SERVER_SEP0024) or SEP-6 (TRANSFER_SERVER) transfer server.'],
    [
      'Live check',
      'The same read-only check every anchor gets each round: stellar.toml, /info, a SEP-10 sign-in, and a SEP-24 deposit started and abandoned before any money moves. Declining an anonymous wallet by policy counts as up.',
    ],
    [
      'Issuer age',
      t
        ? `If you issue your own asset: your oldest issuer account is at least ${t.min_age_days} days old.`
        : 'If you issue your own asset: your oldest issuer account is old enough.',
    ],
    [
      'Payments',
      t
        ? `If you issue your own asset: at least ${t.min_transfers.toLocaleString('en-US')} payments of it on the network, as StellarExpert counts them.`
        : 'If you issue your own asset: enough payments of it on the network, as StellarExpert counts them.',
    ],
  ] as const;

  return (
    <div className="as-grid-ground min-h-screen">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SiteNav />

        <header className="pb-10 pt-8 md:pt-14">
          <NetworkSwitch current="mainnet" />
          <h1 className="mt-5 max-w-3xl font-heading text-5xl font-bold leading-[1.02] tracking-[-0.03em] text-as-ink sm:text-6xl">
            Add your mainnet anchor.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-as-ink-muted">
            Apply with your domain. If your anchor passes the checks below, it is measured every 20 minutes like every
            other anchor, and its score card is published on-chain. Nothing else is asked of you: everything is read
            from your stellar.toml and the public network, and nothing here moves funds.
          </p>
        </header>

        <section className="as-panel as-panel--lg p-5 sm:p-8" aria-label="Apply">
          <span className="as-label">Your anchor’s domain</span>
          <div className="mt-3">
            <ApplyForm network="mainnet" />
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
                  ? `No checked application for ${lookup} yet. Applications are checked every 20 minutes; if you just applied, look again shortly.`
                  : 'Application status is not available right now.'}
              </p>
            )}
          </section>
        )}

        <section className="grid gap-10 py-14 md:grid-cols-2 md:py-20">
          <div>
            <h2 className="font-heading text-3xl font-bold tracking-[-0.025em] text-as-ink">What we check.</h2>
            <ol className="mt-6 flex flex-col gap-4">
              {checks.map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="as-mono w-6 flex-shrink-0 pt-0.5 text-sm text-as-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="font-medium text-as-ink">{title}.</span>{' '}
                    <span className="text-[15px] leading-relaxed text-as-ink-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm leading-relaxed text-as-ink-muted">
              An anchor that only distributes someone else’s asset (USDC, for instance) has no asset of its own to age or
              count, so it is admitted on the first five checks.
            </p>
          </div>
          <div>
            <h2 className="font-heading text-3xl font-bold tracking-[-0.025em] text-as-ink">What happens next.</h2>
            <ul className="mt-6 flex flex-col gap-4 text-[15px] leading-relaxed text-as-ink-muted">
              <li>
                <span className="font-medium text-as-ink">Admitted:</span> it is registered on-chain in the same round and
                measured from then on. A score is shown once there is enough data behind it, usually within a few days; the{' '}
                <Link href="/methodology#confidence" className="font-medium text-as-signal hover:underline">
                  methodology
                </Link>{' '}
                explains why.
              </li>
              <li>
                <span className="font-medium text-as-ink">Not admitted:</span> this page says which check failed and what
                was measured. Fix it and apply again, 24 hours or more after the last check.
              </li>
              <li>
                <span className="font-medium text-as-ink">Already measured:</span> your domain, or another domain in front of
                the same transfer server, is on the scores page already.
              </li>
            </ul>
          </div>
        </section>

        <section className="pb-16" aria-label="Recent applications">
          <h2 className="font-heading text-2xl font-bold tracking-[-0.02em] text-as-ink">Recent applications</h2>
          {!file ? (
            <p className="mt-4 text-sm text-as-ink-muted">Application status is not available right now.</p>
          ) : recent.length === 0 ? (
            <p className="mt-4 text-sm text-as-ink-muted">No applications yet.</p>
          ) : (
            <ul className="as-panel mt-5 divide-y divide-as-hairline">
              {recent.map((a) => {
                const s = STATUS_COPY[a.status];
                return (
                  <li key={a.domain}>
                    <Link
                      href={`/apply?domain=${encodeURIComponent(a.domain)}`}
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
            <Logo size={18} /> Anchor Status
          </span>
          <span>Every application and its checks are public, like every score.</span>
        </footer>
      </div>
    </div>
  );
}
