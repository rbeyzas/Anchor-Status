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

/** 604800 → "7 days", 21600 → "6 hours", 90 → "90 seconds". */
export function humanDuration(seconds: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (seconds > 0 && seconds % 86400 === 0) return unit(seconds / 86400, 'day');
  if (seconds > 0 && seconds % 3600 === 0) return unit(seconds / 3600, 'hour');
  if (seconds > 0 && seconds % 60 === 0) return unit(seconds / 60, 'minute');
  return unit(seconds, 'second');
}

type Tone = 'signal' | 'amber' | 'danger' | 'neutral' | 'pulse';
const TONE_TEXT: Record<Tone, string> = {
  signal: 'text-as-signal',
  amber: 'text-as-amber',
  danger: 'text-as-danger',
  neutral: 'text-as-ink',
  pulse: 'text-as-pulse',
};
const TONE_BOX: Record<Tone, string> = {
  signal: 'border-as-signal/40 bg-as-signal-soft',
  amber: 'border-as-amber/40 bg-as-amber-soft',
  danger: 'border-as-danger/40 bg-as-danger-soft',
  neutral: 'border-as-hairline bg-as-surface-2',
  pulse: 'border-as-pulse/40 bg-as-pulse-soft',
};

/** One figure with its label and a line under it. */
export function Stat({ label, value, sub, tone = 'neutral' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-as-md border border-as-hairline bg-as-surface-2 px-4 py-3">
      <span className="text-xs text-as-ink-faint">{label}</span>
      <span className={`font-heading text-xl font-semibold leading-tight ${TONE_TEXT[tone]}`}>{value}</span>
      {sub && <span className="text-xs text-as-ink-muted">{sub}</span>}
    </div>
  );
}

/** A boxed message: what is going on, in one or two lines. */
export function Notice({ tone = 'neutral', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`rounded-as-md border px-4 py-3 text-sm ${TONE_BOX[tone]}`}>
      {title && <p className={`font-medium ${TONE_TEXT[tone]}`}>{title}</p>}
      {children && <div className={`text-as-ink-muted ${title ? 'mt-1' : ''}`}>{children}</div>}
    </div>
  );
}

/** A form control with a visible label and an optional hint under it. */
export function FormField({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-as-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-as-ink-faint">{hint}</p>}
    </div>
  );
}

/** A requirement and whether it is met. */
export function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-2 text-sm">
      <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${ok ? 'bg-as-signal-soft text-as-signal' : 'bg-as-surface-2 text-as-ink-faint'}`}>
        {ok ? '✓' : '·'}
      </span>
      <span className={ok ? 'text-as-ink' : 'text-as-ink-muted'}>
        <span className="sr-only">{ok ? 'Met: ' : 'Not met: '}</span>
        {children}
      </span>
    </li>
  );
}

export type StepState = 'done' | 'current' | 'todo' | 'failed';

/** Where a process stands: done steps, the current one, what comes next. */
export function Steps({ steps, label }: { steps: { title: string; detail?: ReactNode; state: StepState }[]; label: string }) {
  const mark: Record<StepState, string> = {
    done: 'border-as-signal bg-as-signal text-as-on-signal',
    current: 'border-as-amber bg-as-amber-soft text-as-amber',
    todo: 'border-as-hairline-strong text-as-ink-faint',
    failed: 'border-as-danger bg-as-danger-soft text-as-danger',
  };
  return (
    <ol aria-label={label} className="grid gap-3 sm:grid-flow-col sm:auto-cols-fr">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3 sm:flex-col sm:gap-2" aria-current={s.state === 'current' ? 'step' : undefined}>
          <div className="flex items-center gap-2 sm:w-full">
            <span className={`as-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${mark[s.state]}`}>
              {s.state === 'done' ? '✓' : s.state === 'failed' ? '✕' : i + 1}
            </span>
            {i < steps.length - 1 && <span aria-hidden="true" className={`hidden h-px flex-1 sm:block ${s.state === 'done' ? 'bg-as-signal/60' : 'bg-as-hairline'}`} />}
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${s.state === 'todo' ? 'text-as-ink-muted' : 'text-as-ink'}`}>{s.title}</p>
            {s.detail && <p className="mt-0.5 text-xs leading-relaxed text-as-ink-muted">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
