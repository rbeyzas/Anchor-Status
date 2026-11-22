'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusChip } from '@/components/StatusChip';
import type { DisputesData } from '@/lib/disputes';
import { xlmToStroops } from '@/lib/format';
import type { GovernanceData } from '@/lib/governance';
import { DISPUTE_LABEL } from '@/lib/status-labels';
import { evidenceHash, invoke } from '@/lib/wallet';
import { carried, cooldownUntil, decisionsFor, disputeSteps } from './dispute-progress';
import type { PanelAnchor } from './Panel';
import { disputeGuide, stakeGuide } from './guides';
import { Check, FormField, Guide, hexToBytes, humanDuration, INPUT, Notice, Stat, Steps, TxLink, When } from './parts';

/** One action's state: running, its transaction, or why it failed. */
export function useAction() {
  const router = useRouter();
  const [state, setState] = useState<{ busy?: string; tx?: string; error?: string }>({});
  async function run(label: string, fn: () => Promise<string>) {
    setState({ busy: label });
    try {
      const tx = await fn();
      setState({ tx });
      router.refresh();
    } catch (err) {
      // Contract errors arrive as "Error(Contract, #n)" inside a long message.
      const msg = (err as Error).message ?? String(err);
      setState({ error: /Error\(Contract, #\d+\)/.exec(msg)?.[0] ?? msg.split('\n')[0].slice(0, 300) });
    }
  }
  return { state, run };
}

/** What the operator's next step is, in one line. */
function nextStep(anchor: PanelAnchor, minStakeXlm: number, disputes: DisputesData | null, cooling: string | null) {
  const d = anchor.dispute;
  if (anchor.deactivated) return { tone: 'neutral' as const, title: 'This anchor is deactivated', body: 'It is no longer measured; you can still withdraw its stake.' };
  if (d?.status === 'Open') {
    const decided = carried(decisionsFor(disputes, anchor.anchorId, d));
    return decided
      ? { tone: 'amber' as const, title: 'Your dispute is decided; the reporters vote next', body: 'The result shows here within about 20 minutes. Nothing to do.' }
      : { tone: 'amber' as const, title: 'Your dispute is with the admins', body: 'They compare your evidence with both reporters’ measurements. Nothing to do now.' };
  }
  const onCard = d && anchor.cardWindowEnd && d.windowEnd === anchor.cardWindowEnd;
  if (onCard && d.status === 'Upheld')
    return { tone: 'neutral' as const, title: 'Your dispute on the current card was upheld', body: 'Its score is withheld until the next card. One dispute per card: if a later card is wrong, you can dispute that one.' };
  if (onCard && d.status === 'Rejected' && !cooling)
    return { tone: 'neutral' as const, title: 'Your dispute on the current card was rejected', body: 'The card stands. One dispute per card: if a later card is wrong, you can dispute that one.' };
  if (anchor.stake < minStakeXlm)
    return { tone: 'amber' as const, title: `Add stake to be able to dispute`, body: `A dispute needs at least ${minStakeXlm} XLM on the record. It is only checked, never taken.` };
  if (cooling) return { tone: 'neutral' as const, title: 'A dispute was rejected recently', body: <>You can open the next one <When iso={cooling} />.</> };
  if (!anchor.cardWindowEnd) return { tone: 'neutral' as const, title: 'No score card yet', body: 'A dispute needs a card; the first one follows the first measurements.' };
  return { tone: 'signal' as const, title: 'All set', body: 'Your anchor is claimed and staked. If the current card is wrong, you can dispute it below.' };
}

function AnchorOperations({
  address,
  anchor,
  minStakeXlm,
  disputeCooldownSeconds,
  registryId,
  oracleId,
  disputes,
}: {
  address: string;
  anchor: PanelAnchor;
  minStakeXlm: number;
  disputeCooldownSeconds: number;
  registryId: string;
  oracleId: string;
  disputes: DisputesData | null;
}) {
  const { state, run } = useAction();
  const [stakeIn, setStakeIn] = useState('');
  const [withdrawIn, setWithdrawIn] = useState('');
  const [reason, setReason] = useState('1');
  const [evidence, setEvidence] = useState('');
  const id = anchor.anchorId;
  const w = anchor.withdrawal;
  const unlocked = w ? Date.parse(w.unlockAt) <= Date.now() : false;
  const dispute = anchor.dispute;
  const disputeOnCard = dispute && anchor.cardWindowEnd && dispute.windowEnd === anchor.cardWindowEnd ? dispute : undefined;
  const cooling = cooldownUntil(dispute, disputeCooldownSeconds);
  const withheld = disputeOnCard?.status === 'Upheld';
  const checks = {
    card: !!anchor.cardWindowEnd,
    stake: anchor.stake >= minStakeXlm,
    free: !disputeOnCard,
    cooled: !cooling,
  };
  const canDispute = checks.card && checks.stake && checks.free && checks.cooled && !anchor.deactivated;
  const step = nextStep(anchor, minStakeXlm, disputes, cooling);

  return (
    <section className="as-panel flex flex-col gap-6 px-5 py-5" aria-labelledby={`${id}-title`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="font-heading text-xl font-semibold text-as-ink">
            {anchor.name}
          </h2>
          <p className="mt-1 text-sm text-as-ink-muted">
            {anchor.domain} · you operate it
          </p>
        </div>
        <a href="/scores" className="as-btn as-btn--outline as-btn--sm">
          See its public card
        </a>
      </header>

      <Notice tone={step.tone} title={step.title}>
        {step.body}
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Current card"
          value={withheld ? 'Withheld' : anchor.cardWindowEnd ? anchor.cardScore : '–'}
          tone={withheld ? 'danger' : 'neutral'}
          sub={anchor.cardWindowEnd ? <>window to <When iso={anchor.cardWindowEnd} /></> : 'no card yet'}
        />
        <Stat
          label="Stake"
          value={`${anchor.stake} XLM`}
          tone={checks.stake ? 'signal' : 'amber'}
          sub={checks.stake ? 'enough to dispute' : `${minStakeXlm} XLM needed to dispute`}
        />
        <Stat
          label="Withdrawal"
          value={w ? `${w.amount} XLM` : 'None'}
          sub={w ? (unlocked ? 'unlocked: withdraw it below' : <>unlocks <When iso={w.unlockAt} /></>) : 'nothing requested'}
        />
        <Stat label="Claimed" value={anchor.claim ? <When iso={anchor.claim.claimedAt} /> : '–'} sub="by this wallet" />
      </div>

      {dispute && (
        <div className="rounded-as-md border border-as-hairline px-4 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-as-ink">Latest dispute</h3>
            <StatusChip tone={dispute.status === 'Upheld' ? 'danger' : dispute.status === 'Open' ? 'amber' : 'neutral'} dot>
              {DISPUTE_LABEL[dispute.status]}
            </StatusChip>
            <span className="text-xs text-as-ink-faint">
              {disputeOnCard ? 'on the current card' : 'on an earlier card'} · window to <When iso={dispute.windowEnd} /> · reason code {dispute.reasonCode}
            </span>
          </div>
          <Steps label="Dispute progress" steps={disputeSteps(dispute, decisionsFor(disputes, id, dispute), disputeCooldownSeconds)} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-as-md border border-as-hairline px-4 py-4">
          <h3 className="font-heading text-base font-semibold text-as-ink">Stake</h3>
          <Guide {...stakeGuide(minStakeXlm, '7 days')} />
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const amount = xlmToStroops(stakeIn);
              if (amount) run('stake', () => invoke(address, registryId, 'stake', { anchor_id: id, amount }));
            }}
          >
            <FormField label="Add stake (XLM)" htmlFor={`${id}-stake`} hint="Approve the transaction in your wallet. Stake does not change the score.">
              <div className="flex gap-2">
                <input id={`${id}-stake`} className={INPUT} placeholder="e.g. 10" inputMode="decimal" value={stakeIn} onChange={(e) => setStakeIn(e.target.value)} />
                <button type="submit" disabled={!!state.busy || !xlmToStroops(stakeIn) || !!anchor.deactivated} className="as-btn as-btn--primary as-btn--sm shrink-0 disabled:opacity-50">
                  Add stake
                </button>
              </div>
            </FormField>
          </form>

          <div className="border-t border-as-hairline pt-4">
            <h4 className="text-sm font-medium text-as-ink">Take stake back</h4>
            <p className="mt-1 text-xs text-as-ink-muted">Two steps: request an amount, then withdraw it once the cooldown (7 days) has passed.</p>
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                const amount = xlmToStroops(withdrawIn);
                if (amount) run('withdrawal', () => invoke(address, registryId, 'request_withdrawal', { anchor_id: id, amount }));
              }}
            >
              <FormField label="Amount to withdraw (XLM)" htmlFor={`${id}-withdraw`}>
                <div className="flex gap-2">
                  <input id={`${id}-withdraw`} className={INPUT} placeholder="e.g. 10" inputMode="decimal" value={withdrawIn} onChange={(e) => setWithdrawIn(e.target.value)} />
                  <button type="submit" disabled={!!state.busy || !xlmToStroops(withdrawIn)} className="as-btn as-btn--outline as-btn--sm shrink-0 disabled:opacity-50">
                    Request withdrawal
                  </button>
                </div>
              </FormField>
            </form>
            {w && (
              <button
                type="button"
                disabled={!!state.busy || !unlocked}
                onClick={() => run('withdraw', () => invoke(address, registryId, 'withdraw_stake', { anchor_id: id }))}
                className="as-btn as-btn--outline as-btn--sm mt-3 disabled:opacity-50"
              >
                {unlocked ? `Withdraw ${w.amount} XLM` : `Withdraw ${w.amount} XLM (after the cooldown)`}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-as-md border border-as-hairline px-4 py-4">
          <h3 className="font-heading text-base font-semibold text-as-ink">Dispute the current card</h3>
          <Guide {...disputeGuide(disputeCooldownSeconds)} />
          <ul className="flex flex-col gap-1.5" aria-label="Before you can dispute">
            <Check ok={checks.card}>
              {checks.card ? (
                <>
                  There is a card to dispute: score {anchor.cardScore}, window to <When iso={anchor.cardWindowEnd!} />
                </>
              ) : (
                'There is a score card to dispute'
              )}
            </Check>
            <Check ok={checks.stake}>At least {minStakeXlm} XLM staked (now {anchor.stake} XLM)</Check>
            <Check ok={checks.free}>No dispute on this card yet (one per card)</Check>
            <Check ok={checks.cooled}>
              {cooling ? (
                <>
                  Cooldown after a rejected dispute ends <When iso={cooling} />
                </>
              ) : (
                `No cooldown running (${humanDuration(disputeCooldownSeconds)} after a rejected dispute)`
              )}
            </Check>
          </ul>

          {canDispute && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                run('dispute', async () => {
                  const hash = await evidenceHash(evidence);
                  // The text itself is kept with us for the admins; on-chain
                  // there is only its hash. A bare hash has no text to keep.
                  if (hash !== evidence.trim().toLowerCase()) {
                    const res = await fetch('/api/disputes', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ action: 'evidence', text: evidence.trim() }),
                    });
                    const stored = (await res.json().catch(() => ({}))) as { hash?: string; error?: string };
                    if (stored.hash !== hash) throw new Error(stored.error ?? 'Could not store the evidence; try again.');
                  }
                  return invoke(address, oracleId, 'open_dispute', {
                    operator: address,
                    anchor_id: id,
                    window_end: BigInt(Date.parse(anchor.cardWindowEnd!) / 1000),
                    reason_code: Number(reason),
                    evidence_hash: hexToBytes(hash),
                  });
                });
              }}
            >
              <FormField
                label="Evidence"
                htmlFor={`${id}-evidence`}
                hint={`What shows the card is wrong: links (status page, announcement, logs) and what each one shows. The admins read this text; on-chain there is only its SHA-256. ${evidence.length}/2000`}
              >
                <textarea
                  id={`${id}-evidence`}
                  className={`${INPUT.replace('as-mono ', '')} h-36 py-2 leading-relaxed`}
                  placeholder="Our anchor was up the whole time. Between … and … UTC only one reporter could not reach it: …"
                  maxLength={2000}
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </FormField>
              <FormField label="Reason code" htmlFor={`${id}-reason`} hint="A number recorded on-chain with the dispute. Use 1 unless you agreed another code with the admins.">
                <input id={`${id}-reason`} className={`${INPUT} max-w-[8rem]`} inputMode="numeric" value={reason} onChange={(e) => setReason(e.target.value.replace(/\D/g, ''))} />
              </FormField>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={!!state.busy || !evidence.trim() || !reason} className="as-btn as-btn--primary as-btn--sm disabled:opacity-50">
                  Open dispute
                </button>
                <span className="text-xs text-as-ink-faint">Then: the admins decide, the reporters vote, and the result shows above.</span>
              </div>
            </form>
          )}
        </div>
      </div>

      {(state.busy || state.tx || state.error) && (
        <div aria-live="polite">
          {state.busy && <Notice title="Waiting for your wallet and the network…">Approve the request in your wallet ({state.busy}).</Notice>}
          {state.tx && (
            <Notice tone="signal" title="Done">
              Transaction <TxLink hash={state.tx} />. The page refreshes with the new state.
            </Notice>
          )}
          {state.error && (
            <Notice tone="danger" title="Refused">
              {state.error}
            </Notice>
          )}
        </div>
      )}
    </section>
  );
}

export function OperatorView({
  address,
  anchors,
  minStakeXlm,
  governance,
  disputes,
}: {
  address: string;
  anchors: PanelAnchor[];
  minStakeXlm: number;
  governance: GovernanceData;
  disputes: DisputesData | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {anchors.map((a) => (
        <AnchorOperations
          key={a.anchorId}
          address={address}
          anchor={a}
          minStakeXlm={minStakeXlm}
          disputeCooldownSeconds={governance.oracle.dispute.cooldownSeconds}
          registryId={governance.registry.id}
          oracleId={governance.oracle.id}
          disputes={disputes}
        />
      ))}
    </div>
  );
}
