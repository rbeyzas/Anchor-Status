'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusChip } from '@/components/StatusChip';
import { xlmToStroops } from '@/lib/format';
import type { GovernanceData } from '@/lib/governance';
import { DISPUTE_COPY, DISPUTE_LABEL } from '@/lib/status-labels';
import { evidenceHash, invoke } from '@/lib/wallet';
import type { PanelAnchor } from './Panel';
import { disputeGuide, stakeGuide } from './guides';
import { Field, Guide, hexToBytes, INPUT, Section, TxLink, When } from './parts';

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

function AnchorOperations({
  address,
  anchor,
  minStakeXlm,
  disputeCooldownSeconds,
  registryId,
  oracleId,
}: {
  address: string;
  anchor: PanelAnchor;
  minStakeXlm: number;
  disputeCooldownSeconds: number;
  registryId: string;
  oracleId: string;
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
  const cannotDispute = !anchor.cardWindowEnd
    ? 'There is no score card to dispute yet.'
    : anchor.stake < minStakeXlm
      ? `A dispute needs at least ${minStakeXlm} XLM staked on the record (it is checked, never moved).`
      : disputeOnCard
        ? 'This card has a dispute already: one per card.'
        : null;

  return (
    <Section title={anchor.name} aside={`${anchor.domain} · claimed`}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Claimed">{anchor.claim && <When iso={anchor.claim.claimedAt} />}</Field>
        <Field label="Stake">{anchor.stake} XLM</Field>
        <Field label="Withdrawal">
          {w ? (
            <>
              {w.amount} XLM, {unlocked ? 'unlocked' : <>unlocks <When iso={w.unlockAt} /></>}
            </>
          ) : (
            <span className="text-as-ink-faint">none requested</span>
          )}
        </Field>
        <Field label="Current card">
          {anchor.cardWindowEnd ? (
            <>
              score {anchor.cardScore}, window to <When iso={anchor.cardWindowEnd} />
            </>
          ) : (
            <span className="text-as-ink-faint">none yet</span>
          )}
        </Field>
      </dl>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-as-ink">Stake</h3>
          <Guide {...stakeGuide(minStakeXlm, '7 days')} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const amount = xlmToStroops(stakeIn);
              if (amount) run('stake', () => invoke(address, registryId, 'stake', { anchor_id: id, amount }));
            }}
          >
            <input className={INPUT} placeholder="XLM to add" inputMode="decimal" value={stakeIn} onChange={(e) => setStakeIn(e.target.value)} />
            <button type="submit" disabled={!!state.busy || !xlmToStroops(stakeIn) || !!anchor.deactivated} className="as-btn as-btn--primary as-btn--sm shrink-0 disabled:opacity-50">
              Add stake
            </button>
          </form>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const amount = xlmToStroops(withdrawIn);
              if (amount) run('withdrawal', () => invoke(address, registryId, 'request_withdrawal', { anchor_id: id, amount }));
            }}
          >
            <input className={INPUT} placeholder="XLM to withdraw" inputMode="decimal" value={withdrawIn} onChange={(e) => setWithdrawIn(e.target.value)} />
            <button type="submit" disabled={!!state.busy || !xlmToStroops(withdrawIn)} className="as-btn as-btn--outline as-btn--sm shrink-0 disabled:opacity-50">
              Request
            </button>
          </form>
          {w && (
            <button
              type="button"
              disabled={!!state.busy || !unlocked}
              onClick={() => run('withdraw', () => invoke(address, registryId, 'withdraw_stake', { anchor_id: id }))}
              className="as-btn as-btn--outline as-btn--sm self-start disabled:opacity-50"
            >
              Withdraw {w.amount} XLM
            </button>
          )}
          <p className="text-xs text-as-ink-faint">A withdrawal waits out a cooldown after the request. Nothing scores on stake.</p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-as-ink">Dispute the current card</h3>
          <Guide {...disputeGuide(disputeCooldownSeconds)} />
          {dispute && (
            <p className="text-sm text-as-ink-muted">
              <StatusChip tone={dispute.status === 'Upheld' ? 'danger' : dispute.status === 'Open' ? 'amber' : 'neutral'} dot>
                {DISPUTE_LABEL[dispute.status]}
              </StatusChip>{' '}
              {disputeOnCard ? 'on this card' : 'on an earlier card'}, opened <When iso={dispute.openedAt} />: {DISPUTE_COPY[dispute.status]} Votes{' '}
              {dispute.upholdVotes} uphold, {dispute.rejectVotes} reject.
            </p>
          )}
          {cannotDispute ? (
            <p className="text-xs text-as-ink-faint">{cannotDispute}</p>
          ) : (
            <form
              className="flex flex-col gap-2"
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
              <input className={INPUT} placeholder="Reason code" inputMode="numeric" value={reason} onChange={(e) => setReason(e.target.value.replace(/\D/g, ''))} />
              <textarea
                className={`${INPUT} h-20 py-2`}
                placeholder="Evidence: links (status page, announcement, logs) and what they show"
                maxLength={2000}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
              <button type="submit" disabled={!!state.busy || !evidence.trim() || !reason} className="as-btn as-btn--primary as-btn--sm self-start disabled:opacity-50">
                Open dispute
              </button>
              <p className="text-xs text-as-ink-faint">
                Your text goes to the admins with a comparison of both reporters&apos; measurements; on-chain there is
                only its SHA-256. The admins decide and the reporters cast the vote; an upheld dispute withholds this
                card&apos;s score.
              </p>
            </form>
          )}
        </div>
      </div>

      {(state.busy || state.tx || state.error) && (
        <p className="mt-4 text-sm" aria-live="polite">
          {state.busy && <span className="text-as-ink-muted">Waiting for your wallet and the network ({state.busy})…</span>}
          {state.tx && (
            <span className="text-as-signal">
              Done: transaction <TxLink hash={state.tx} />. The page refreshes with the new state.
            </span>
          )}
          {state.error && <span className="text-as-danger">Refused: {state.error}</span>}
        </p>
      )}
    </Section>
  );
}

export function OperatorView({
  address,
  anchors,
  minStakeXlm,
  governance,
}: {
  address: string;
  anchors: PanelAnchor[];
  minStakeXlm: number;
  governance: GovernanceData;
}) {
  return (
    <div className="flex flex-col gap-6">
      {anchors.map((a) => (
        <AnchorOperations key={a.anchorId} address={address} anchor={a} minStakeXlm={minStakeXlm} disputeCooldownSeconds={governance.oracle.dispute.cooldownSeconds} registryId={governance.registry.id} oracleId={governance.oracle.id} />
      ))}
    </div>
  );
}
