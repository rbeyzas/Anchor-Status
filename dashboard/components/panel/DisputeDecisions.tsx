'use client';

import { useState } from 'react';
import { StatusChip } from '@/components/StatusChip';
import type { DecisionValue, DisputesData } from '@/lib/disputes';
import { decisionMessage } from '@/lib/queue-message';
import { flagsFromMask } from '@/lib/scorecard';
import { DISPUTE_LABEL } from '@/lib/status-labels';
import { signText } from '@/lib/wallet';
import { carried, decisionsFor, disputeSteps } from './dispute-progress';
import type { PanelAnchor } from './Panel';
import { DECISION_GUIDE } from './guides';
import { Notice, Section, shortKey, Steps, When } from './parts';

const SUGGESTION: Record<DecisionValue | 'unclear', { label: string; tone: 'signal' | 'danger' | 'amber' }> = {
  uphold: { label: 'Suggests uphold', tone: 'signal' },
  reject: { label: 'Suggests reject', tone: 'danger' },
  unclear: { label: 'Decide on the evidence', tone: 'amber' },
};

const CHOICE: Record<DecisionValue, { button: string; means: string }> = {
  uphold: { button: 'Uphold', means: 'The card is wrong: withhold its score until the next card.' },
  reject: { button: 'Reject', means: 'The card shows what happened: it stands, and the operator waits out the cooldown.' },
};

/** Disputes for the oracle admin's signers: the open ones to decide, and
 * each anchor's latest decided one. A decision is a signed message; once
 * enough signers agree, the reporters' collectors cast it as their votes in
 * the next round. */
export function DisputeDecisions({
  address,
  anchors,
  oracleId,
  cooldownSeconds,
  disputes,
}: {
  address: string;
  /** Every anchor whose latest dispute is open or was decided recently. */
  anchors: PanelAnchor[];
  oracleId: string;
  cooldownSeconds: number;
  disputes: { data: DisputesData | null; error: string | null; reload: () => Promise<void> };
}) {
  const { data, reload } = disputes;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const open = anchors.filter((a) => a.dispute?.status === 'Open');
  const decided = anchors
    .filter((a) => a.dispute && a.dispute.status !== 'Open')
    .sort((a, b) => Date.parse(b.dispute!.resolvedAt ?? b.dispute!.openedAt) - Date.parse(a.dispute!.resolvedAt ?? a.dispute!.openedAt));

  async function decide(anchor: PanelAnchor, windowEnd: number, decision: DecisionValue) {
    setBusy(`${anchor.anchorId}:${decision}`);
    setError(null);
    try {
      const signature = await signText(decisionMessage(oracleId, anchor.anchorId, windowEnd, decision), address);
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'decide', anchorId: anchor.anchorId, windowEnd, decision, signer: address, signature }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      await reload();
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title={open.length ? `Open disputes (${open.length})` : 'Open disputes'} aside="decided by the admin signers, voted by the reporters" guide={DECISION_GUIDE}>
        {(error ?? disputes.error) && (
          <div className="mb-4">
            <Notice tone="danger" title="Something went wrong">
              {error ?? `Could not load the evidence and comparisons: ${disputes.error}`}
            </Notice>
          </div>
        )}
        {open.length === 0 && <p className="text-sm text-as-ink-muted">No open disputes. When an operator opens one, it shows here and on the admins’ Telegram.</p>}
        <div className="flex flex-col gap-6">
          {open.map((anchor) => {
            const d = anchor.dispute!;
            const windowEnd = Date.parse(d.windowEnd) / 1000;
            const evidence = data?.evidence[d.evidenceHash];
            const comparison = data?.comparisons[`${anchor.anchorId}@${windowEnd}`];
            const decisions = decisionsFor(data, anchor.anchorId, d);
            const done = carried(decisions);
            return (
              <article key={anchor.anchorId} className="flex flex-col gap-5 rounded-as-md border border-as-hairline px-4 py-4">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-base font-semibold text-as-ink">
                      {anchor.name} <span className="text-xs font-normal text-as-ink-faint">{anchor.domain}</span>
                    </h3>
                    <p className="mt-1 text-xs text-as-ink-muted">
                      Card window to <When iso={d.windowEnd} /> · opened <When iso={d.openedAt} /> · reason code {d.reasonCode} · {anchor.stake} XLM staked
                    </p>
                  </div>
                  <StatusChip tone={done ? 'signal' : 'amber'} dot className="max-w-full !h-auto !whitespace-normal py-1">
                    {done
                      ? 'Decided: reporters vote next'
                      : decisions.some((x) => x.signers.includes(address))
                        ? 'You signed: waiting for another signer'
                        : 'Waiting for your decision'}
                  </StatusChip>
                </header>

                <Steps label="Dispute progress" steps={disputeSteps(d, decisions, cooldownSeconds)} />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-as-ink-faint">1 · The operator’s evidence</h4>
                    {evidence ? (
                      <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-as-md bg-as-surface-2 px-4 py-3 text-sm leading-relaxed text-as-ink">{evidence.text}</p>
                    ) : (
                      <p className="rounded-as-md bg-as-surface-2 px-4 py-3 text-sm text-as-ink-muted">
                        {data ? (
                          <>
                            Not stored with us; on-chain there is only its hash <span className="as-mono break-all">{d.evidenceHash}</span>.
                          </>
                        ) : (
                          'Loading…'
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-as-ink-faint">2 · What each reporter measured</h4>
                    {comparison ? (
                      <div className="flex flex-col gap-3 rounded-as-md bg-as-surface-2 px-4 py-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-as-ink-faint">
                              <th className="pb-1 font-normal">Reporter</th>
                              <th className="pb-1 font-normal">Score</th>
                              <th className="pb-1 font-normal">Flags</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparison.hosts.map((h) => (
                              <tr key={h.host} className="border-t border-as-hairline">
                                <td className="py-1.5 text-as-ink">{h.host}</td>
                                <td className="as-mono py-1.5 text-as-ink">{h.score ?? <span className="text-as-ink-faint">no card</span>}</td>
                                <td className="py-1.5 text-as-ink-muted">{h.flags ? flagsFromMask(h.flags).join(', ') : 'none'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-sm">
                          <StatusChip tone={SUGGESTION[comparison.recommendation].tone}>{SUGGESTION[comparison.recommendation].label}</StatusChip>{' '}
                          <span className="text-as-ink-muted">{comparison.reason}</span>
                        </p>
                      </div>
                    ) : (
                      <p className="rounded-as-md bg-as-surface-2 px-4 py-3 text-sm text-as-ink-muted">
                        {data ? 'Compared in the next collection round (every 20 minutes).' : 'Loading…'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium uppercase tracking-wide text-as-ink-faint">3 · Your decision</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(['uphold', 'reject'] as const).map((value) => {
                      const dec = decisions.find((x) => x.decision === value);
                      const signed = dec?.signers.includes(address);
                      return (
                        <div key={value} className={`flex flex-col gap-3 rounded-as-md border px-4 py-3 ${signed ? 'border-as-signal/50 bg-as-signal-soft' : 'border-as-hairline'}`}>
                          <p className="text-sm text-as-ink-muted">{CHOICE[value].means}</p>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              disabled={!!busy || signed}
                              onClick={() => decide(anchor, windowEnd, value)}
                              className={`as-btn as-btn--sm disabled:opacity-60 ${value === 'uphold' ? 'as-btn--primary' : 'as-btn--outline'}`}
                            >
                              {busy === `${anchor.anchorId}:${value}` ? 'Signing…' : signed ? `You signed ${value}` : CHOICE[value].button}
                            </button>
                            <span className="text-xs text-as-ink-muted" title={dec?.signers.join('\n')}>
                              {dec
                                ? `${dec.weight} of ${dec.threshold} signatures${dec.signers.length ? ` (${dec.signers.map(shortKey).join(', ')})` : ''}`
                                : 'no signature yet'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-as-ink-faint">
                    Your wallet signs a message, not a transaction: no fee. When one choice reaches the threshold, the reporters vote that way in their
                    next round. On-chain votes so far: {d.upholdVotes} uphold, {d.rejectVotes} reject.
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section title="Decided" aside="each anchor’s latest dispute">
        {decided.length === 0 ? (
          <p className="text-sm text-as-ink-muted">No dispute has been decided yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-as-hairline">
            {decided.map((a) => {
              const d = a.dispute!;
              return (
                <li key={a.anchorId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                  <StatusChip tone={d.status === 'Upheld' ? 'danger' : 'neutral'} dot>
                    {DISPUTE_LABEL[d.status]}
                  </StatusChip>
                  <span className="font-medium text-as-ink">{a.name}</span>
                  <span className="text-xs text-as-ink-muted">
                    card window to <When iso={d.windowEnd} /> · {d.resolvedAt ? <>decided <When iso={d.resolvedAt} /></> : 'decided'} · votes {d.upholdVotes} uphold,{' '}
                    {d.rejectVotes} reject
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
