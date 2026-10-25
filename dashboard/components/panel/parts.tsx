import type { ReactNode } from 'react';
import { formatRelativeTime } from '@/lib/format';
import { explorerAccount, explorerTx } from '@/lib/wallet';

export const hexToBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
export const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

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

export interface GuideContent {
  /** The summary line, e.g. "How to claim". */
  title: string;
  steps: ReactNode[];
  note?: ReactNode;
}

/** A closed-by-default how-to: numbered steps and a note. */
export function Guide({ title, steps, note, open }: GuideContent & { open?: boolean }) {
  return (
    <details open={open} className="group mb-5 rounded-as-md border border-as-hairline bg-as-surface-2 px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-as-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-as-signal-soft text-xs text-as-signal">?</span>
        {title}
        <span aria-hidden="true" className="ml-auto text-as-ink-faint transition-transform group-open:rotate-90">›</span>
      </summary>
      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-as-ink-muted">
            <span className="as-mono mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-as-hairline-strong text-xs text-as-ink">{i + 1}</span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
      {note && <p className="mt-3 border-t border-as-hairline pt-3 text-xs leading-relaxed text-as-ink-faint">{note}</p>}
    </details>
  );
}

export function Section({ title, aside, guide, children }: { title: string; aside?: ReactNode; guide?: GuideContent; children: ReactNode }) {
  return (
    <section className="as-panel px-5 py-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-as-ink">{title}</h2>
        {aside && <span className="text-xs text-as-ink-faint">{aside}</span>}
      </div>
      {guide && <Guide {...guide} />}
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
