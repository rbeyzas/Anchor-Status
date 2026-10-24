import type { ReactNode } from 'react';
import { formatRelativeTime } from '@/lib/format';
import { explorerAccount, explorerTx } from '@/lib/wallet';

export const shortKey = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

export function AccountLink({ address }: { address: string }) {
  return (
    <a href={explorerAccount(address)} target="_blank" rel="noreferrer" className="as-mono text-as-ink underline decoration-as-hairline" title={address}>
      {shortKey(address)}
    </a>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="as-mono text-as-signal underline">
      {hash.slice(0, 8)}
    </a>
  );
}

/** "in 3h" or "3h ago", with the exact UTC time on hover. */
export function When({ iso }: { iso: string }) {
  return <span title={new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'}>{formatRelativeTime(iso)}</span>;
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="as-panel px-5 py-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-as-ink">{title}</h2>
        {aside && <span className="text-xs text-as-ink-faint">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-as-ink-faint">{label}</dt>
      <dd className="text-sm text-as-ink">{children}</dd>
    </div>
  );
}

export const INPUT =
  'as-mono h-9 w-full min-w-0 rounded-as-sm border border-as-border-control bg-as-surface-2 px-3 text-sm text-as-ink placeholder:text-as-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse';
