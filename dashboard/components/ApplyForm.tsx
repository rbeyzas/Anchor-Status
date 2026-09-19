'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { normalizeDomainInput } from '@/lib/onboarding';
import { StatusChip, type ChipTone } from './StatusChip';

interface Outcome {
  tone: ChipTone;
  chip: string;
  text: string;
  /** Link to this domain's application, once there is one. */
  domain?: string;
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

function outcomeFor(status: number, body: { domain?: string; status?: string; retry_after?: string; error?: string }): Outcome {
  const domain = body.domain;
  if (status === 202) {
    return { tone: 'signal', chip: 'Received', text: 'It is checked in the next round, within 20 minutes.', domain };
  }
  if (status === 200) {
    switch (body.status) {
      case 'accepted':
        return { tone: 'signal', chip: 'Admitted', text: 'It was admitted and is being measured.', domain };
      case 'already_tracked':
        return { tone: 'pulse', chip: 'Already measured', text: 'We already measure this anchor.', domain };
      default:
        return { tone: 'neutral', chip: 'Waiting', text: 'Already received; waiting for its check.', domain };
    }
  }
  if (status === 429 && body.retry_after) {
    return {
      tone: 'amber',
      chip: 'Checked recently',
      text: `It was checked recently and not admitted. You can apply again after ${dateTime(body.retry_after)}.`,
      domain,
    };
  }
  if (status === 429) return { tone: 'amber', chip: 'Slow down', text: 'Too many applications from your address. Try again in an hour.' };
  return { tone: 'danger', chip: 'Not sent', text: body.error ?? 'Something went wrong. Try again in a few minutes.' };
}

export function ApplyForm() {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const domain = normalizeDomainInput(value);
    if (!domain) {
      setOutcome({ tone: 'danger', chip: 'Not sent', text: 'Enter a plain domain name, like anchor.example.com.' });
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      setOutcome(outcomeFor(res.status, await res.json().catch(() => ({}))));
    } catch {
      setOutcome({ tone: 'danger', chip: 'Not sent', text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row" noValidate>
        <label htmlFor="apply-domain" className="sr-only">
          Your anchor’s domain
        </label>
        <input
          id="apply-domain"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="anchor.example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={300}
          className="as-mono h-10 w-full min-w-0 rounded-as-sm sm:flex-1 border border-as-border-control bg-as-surface-2 px-3 text-sm text-as-ink placeholder:text-as-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
        />
        <button
          type="submit"
          disabled={sending}
          className="as-btn as-btn--primary disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
        >
          {sending ? 'Sending…' : 'Apply'}
          {!sending && <ArrowRight size={16} weight="bold" aria-hidden="true" />}
        </button>
      </form>
      <div aria-live="polite">
        {outcome && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-as-ink-muted">
            <StatusChip tone={outcome.tone} dot>
              {outcome.chip}
            </StatusChip>
            <span>{outcome.text}</span>
            {outcome.domain && (
              <Link href={`/apply?domain=${encodeURIComponent(outcome.domain)}`} className="font-medium text-as-signal hover:underline">
                See its checks
              </Link>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
