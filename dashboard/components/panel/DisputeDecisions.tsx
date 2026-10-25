'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusChip } from '@/components/StatusChip';
import type { DecisionValue, DisputesData } from '@/lib/disputes';
import { decisionMessage } from '@/lib/queue-message';
import { flagsFromMask } from '@/lib/scorecard';
import { signText } from '@/lib/wallet';
import type { PanelAnchor } from './Panel';
import { DECISION_GUIDE } from './guides';
import { Field, Section, shortKey, When } from './parts';

const SUGGESTION: Record<DecisionValue | 'unclear', { label: string; tone: 'signal' | 'danger' | 'amber' }> = {
  uphold: { label: 'Suggests uphold', tone: 'signal' },
  reject: { label: 'Suggests reject', tone: 'danger' },
  unclear: { label: 'Decide on the evidence', tone: 'amber' },
};

/** Open disputes, for the oracle admin's signers to decide. The decision is
 * a signed message; once enough signers agree, the reporters' collectors
 * cast it as their votes in the next round. */
export function DisputeDecisions({ address, anchors, oracleId }: { address: string; anchors: PanelAnchor[]; oracleId: string }) {
  const [data, setData] = useState<DisputesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/disputes', { cache: 'no-store' });
      const body = (await res.json()) as DisputesData & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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
      await load();
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Disputes" aside="decided by the admin signers, voted by the reporters" guide={DECISION_GUIDE}>
      {anchors.length === 0 && <p className="text-sm text-as-ink-muted">No open disputes.</p>}
      {error && <p className="mb-3 text-sm text-as-danger">{error}</p>}
      <div className="flex flex-col gap-6">
        {anchors.map((anchor) => {
          const d = anchor.dispute!;
          const windowEnd = Date.parse(d.windowEnd) / 1000;
          const evidence = data?.evidence[d.evidenceHash];
          const comparison = data?.comparisons[`${anchor.anchorId}@${windowEnd}`];
          const decisions = (data?.decisions ?? []).filter((x) => x.anchorId === anchor.anchorId && x.windowEnd === windowEnd);
          return (
            <article key={anchor.anchorId} className="border-t border-as-hairline pt-4 first:border-t-0 first:pt-0">
              <h3 className="font-medium text-as-ink">
                {anchor.name} <span className="text-xs text-as-ink-faint">{anchor.domain}</span>
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Card disputed">window to <When iso={d.windowEnd} /></Field>
                <Field label="Opened"><When iso={d.openedAt} /></Field>
                <Field label="Reason code">{d.reasonCode}</Field>
                <Field label="Stake">{anchor.stake} XLM</Field>
              </dl>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="text-xs text-as-ink-faint">Operator&apos;s evidence</h4>
                  {evidence ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-as-ink">{evidence.text}</p>
                  ) : (
                    <p className="mt-1 text-sm text-as-ink-muted">
                      Not stored with us; on-chain only its hash <span className="as-mono break-all">{d.evidenceHash}</span>.
                    </p>
                  )}
                </div>
                <div>
                  <h4 className="text-xs text-as-ink-faint">Both reporters&apos; cards for that window</h4>
                  {comparison ? (
                    <>
                      <ul className="mt-1 text-sm text-as-ink">
                        {comparison.hosts.map((h) => (
                          <li key={h.host}>
                            {h.host}: {h.score === undefined ? <span className="text-as-ink-faint">no card</span> : <>score {h.score}</>}
                            {h.flags ? <span className="text-as-ink-muted"> · {flagsFromMask(h.flags).join(', ')}</span> : null}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-sm">
                        <StatusChip tone={SUGGESTION[comparison.recommendation].tone}>{SUGGESTION[comparison.recommendation].label}</StatusChip>{' '}
                        <span className="text-as-ink-muted">{comparison.reason}</span>
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-as-ink-muted">{data ? 'Compared in the next collection round (every 20 minutes).' : 'Loading…'}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {(['uphold', 'reject'] as const).map((value) => {
                  const dec = decisions.find((x) => x.decision === value);
                  const signed = dec?.signers.includes(address);
                  return (
                    <div key={value} className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!!busy || signed}
                        onClick={() => decide(anchor, windowEnd, value)}
                        className={`as-btn as-btn--sm disabled:opacity-50 ${value === 'uphold' ? 'as-btn--primary' : 'as-btn--outline'}`}
                      >
                        {busy === `${anchor.anchorId}:${value}` ? 'Signing…' : signed ? `You signed ${value}` : value === 'uphold' ? 'Uphold' : 'Reject'}
                      </button>
                      {dec && (
                        <span className="text-xs text-as-ink-muted" title={dec.signers.join('\n')}>
                          {dec.weight}/{dec.threshold} ({dec.signers.map(shortKey).join(', ') || 'no valid signature'})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-as-ink-faint">
                Signing is a message, not a transaction. Once the signatures reach the threshold, the reporters vote that way
                in their next round. Votes so far on-chain: {d.upholdVotes} uphold, {d.rejectVotes} reject.
              </p>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
