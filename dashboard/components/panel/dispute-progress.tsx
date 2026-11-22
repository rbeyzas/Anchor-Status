'use client';

// A dispute's way from the operator to the chain, shown the same way to the
// operator and to the admins: opened → admin signers decide → the reporters
// vote in their next round → the result.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { DecisionView, DisputesData } from '@/lib/disputes';
import type { DisputeView } from '@/lib/types';
import { humanDuration, shortKey, When, type StepState } from './parts';

/** The intake's evidence, decisions and comparisons (public, read-only). */
export function useDisputesData() {
  const [data, setData] = useState<DisputesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/disputes', { cache: 'no-store' });
      const body = (await res.json()) as DisputesData & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload };
}

/** The admins' decisions on this dispute's card. */
export function decisionsFor(data: DisputesData | null, anchorId: string, d: DisputeView): DecisionView[] {
  const windowEnd = Date.parse(d.windowEnd) / 1000;
  return (data?.decisions ?? []).filter((x) => x.anchorId === anchorId && x.windowEnd === windowEnd);
}

/** The decision whose signatures reached the threshold, if one did. */
export const carried = (decisions: DecisionView[]) => decisions.find((x) => x.weight >= x.threshold);

/** When a rejected dispute's cooldown ends, if it has not yet. */
export function cooldownUntil(d: DisputeView | undefined, cooldownSeconds: number): string | null {
  if (!d || d.status !== 'Rejected' || !d.resolvedAt) return null;
  const until = Date.parse(d.resolvedAt) + cooldownSeconds * 1000;
  return until > Date.now() ? new Date(until).toISOString() : null;
}

const RESULT: Record<Exclude<DisputeView['status'], 'Open'>, string> = {
  Upheld: 'The card’s score is withheld until the next card.',
  Rejected: 'The card stands.',
  Superseded: 'A newer card became final before the vote.',
};

export function disputeSteps(
  d: DisputeView,
  decisions: DecisionView[],
  cooldownSeconds: number,
): { title: string; detail?: ReactNode; state: StepState }[] {
  const open = d.status === 'Open';
  const decided = carried(decisions);
  const best = [...decisions].sort((a, b) => b.weight - a.weight)[0];
  const cooling = cooldownUntil(d, cooldownSeconds);

  const admins: { detail: ReactNode; state: StepState } = !open
    ? { detail: decided ? `${decided.weight} of ${decided.threshold} signed ${decided.decision}` : 'Done', state: 'done' }
    : decided
      ? { detail: `${decided.weight} of ${decided.threshold} signed ${decided.decision} (${decided.signers.map(shortKey).join(', ')})`, state: 'done' }
      : best
        ? { detail: `${best.weight} of ${best.threshold} signed ${best.decision}: waiting for another signer`, state: 'current' }
        : { detail: 'Waiting for the admin signers to read the evidence and decide', state: 'current' };

  const reporters: { detail: ReactNode; state: StepState } = !open
    ? { detail: `On-chain votes: ${d.upholdVotes} uphold, ${d.rejectVotes} reject`, state: 'done' }
    : decided
      ? { detail: 'In their next collection round, within 20 minutes', state: 'current' }
      : { detail: 'After the admins decide', state: 'todo' };

  const result: { detail: ReactNode; state: StepState } = open
    ? { detail: 'Upheld withholds the card’s score; rejected leaves it', state: 'todo' }
    : {
        detail: (
          <>
            {RESULT[d.status as Exclude<DisputeView['status'], 'Open'>]}
            {d.resolvedAt && (
              <>
                {' '}
                Decided <When iso={d.resolvedAt} />.
              </>
            )}
            {cooling && (
              <>
                {' '}
                Next dispute possible <When iso={cooling} /> ({humanDuration(cooldownSeconds)} cooldown).
              </>
            )}
          </>
        ),
        state: d.status === 'Upheld' ? 'done' : d.status === 'Rejected' ? 'failed' : 'done',
      };

  return [
    { title: 'Opened', detail: <>By the operator, <When iso={d.openedAt} /></>, state: 'done' },
    { title: 'Admins decide', ...admins },
    { title: 'Reporters vote', ...reporters },
    { title: open ? 'Result' : d.status, ...result },
  ];
}
