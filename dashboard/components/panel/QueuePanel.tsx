'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusChip, type ChipTone } from '@/components/StatusChip';
import type { QueueView } from '@/lib/admin-queue';
import { buildArgs, METHODS } from '@/lib/admin-calls';
import type { GovernanceData } from '@/lib/governance';
import { rejectMessage } from '@/lib/queue-message';
import { buildAdminCall, signEnvelope, signText } from '@/lib/wallet';
import { QUEUE_GUIDE } from './guides';
import { AccountLink, FormField, humanDuration, INPUT, Notice, Section, TxLink, When } from './parts';

async function api(body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch('/api/admin-queue', body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`));
  return data;
}

/** The multisig's queue, loaded once and again after every action. */
export function useQueue(enabled: boolean) {
  const [items, setItems] = useState<QueueView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setItems(((await api()).items as QueueView[]) ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);
  return { items, error, reload };
}
export type Queue = ReturnType<typeof useQueue>;

/** Still collecting signatures, or ready to send. */
export const isPending = (i: QueueView) => i.status === 'open' && !i.stale;

function statusOf(i: QueueView): { label: string; tone: ChipTone } {
  if (i.status === 'executed') return { label: 'Executed', tone: 'signal' };
  if (i.status === 'failed') return { label: 'Failed', tone: 'danger' };
  if (i.status === 'rejected') return { label: 'Rejected', tone: 'neutral' };
  if (i.stale) return { label: 'Stale', tone: 'neutral' };
  return i.weight >= i.threshold ? { label: 'Ready to send', tone: 'signal' } : { label: `Signed ${i.weight} of ${i.threshold}`, tone: 'amber' };
}

/** What each action does, in a sentence, for whoever proposes or signs it. */
const ACTION_HELP: Record<string, string> = {
  propose_upgrade: 'Announces new contract code. It can be executed only after the time lock.',
  execute_upgrade: 'Switches the contract to the proposed code once the time lock has passed.',
  cancel_upgrade: 'Drops the proposed upgrade.',
  set_upgrade_delay: 'Sets how long upgrades wait. A longer time lock applies at once; a shorter one waits out the current one.',
  propose_admin: 'Names a new admin. Nothing changes until the new admin accepts.',
  accept_admin: 'Taken by the proposed admin: completes the handover.',
  deactivate_anchor: 'Stops measuring an anchor and shows it greyed on the dashboard, with the reason.',
  reactivate_anchor: 'Measures a deactivated anchor again.',
  set_quorum_config: 'How many reporters must agree before a card is final, how far apart they may be, and the round length. A lower threshold waits out the time lock.',
  authorize_reporter: 'Lets a reporter key publish cards for one kind of anchor.',
  revoke_reporter: 'Removes a reporter key.',
  set_dispute_config: 'The stake an operator needs to open a dispute, and the wait after a rejected one.',
};

const SECONDS_ARGS = new Set(['seconds', 'config.round_seconds', 'config.cooldown_seconds']);

/** The value on-chain now, beside the field that changes it. */
function currentValue(method: string, arg: string, target: 'registry' | 'oracle', g: GovernanceData): string | null {
  const o = g.oracle;
  const c = target === 'registry' ? g.registry : g.oracle;
  const map: Record<string, string> = {
    'set_quorum_config:config.threshold': String(o.quorum.threshold),
    'set_quorum_config:config.max_spread': String(o.quorum.maxSpread),
    'set_quorum_config:config.round_seconds': `${o.quorum.roundSeconds}${o.quorum.roundSeconds ? ` (${humanDuration(o.quorum.roundSeconds)})` : ' (any window)'}`,
    'set_dispute_config:config.min_stake': `${o.dispute.minStakeXlm} XLM`,
    'set_dispute_config:config.cooldown_seconds': `${o.dispute.cooldownSeconds} (${humanDuration(o.dispute.cooldownSeconds)})`,
    'set_upgrade_delay:seconds': `${c.delaySeconds} (${humanDuration(c.delaySeconds)})`,
  };
  return map[`${method}:${arg}`] ?? null;
}

const contractName = (id: string, g: GovernanceData) => (id === g.registry.id ? 'AnchorRegistry' : id === g.oracle.id ? 'PerformanceOracle' : id);
const actionLabel = (method: string) => [...METHODS.registry, ...METHODS.oracle].find((m) => m.method === method)?.label ?? method;

function QueueItemRow({ i, address, g, busy, act }: { i: QueueView; address: string; g: GovernanceData; busy: string | null; act: (what: string, fn: () => Promise<unknown>, done: string) => void }) {
  const st = statusOf(i);
  const open = isPending(i);
  const mine = i.signers.includes(address);
  return (
    <li className="flex flex-col gap-3 py-4 text-sm first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={st.tone} dot>
          {st.label}
        </StatusChip>
        {/* Read from the transaction itself: this is what a signature approves. */}
        <span className="font-medium text-as-ink">
          {contractName(i.contract, g)}: {actionLabel(i.method)}
        </span>
        <span className="text-xs text-as-ink-faint">
          proposed <When iso={i.createdAt} />
        </span>
        {i.txHash && <TxLink hash={i.txHash} />}
      </div>
      <code className="as-mono block whitespace-pre-wrap break-all rounded-as-sm bg-as-surface-2 px-3 py-2 text-xs text-as-ink">
        {contractName(i.contract, g)}.{i.method}({i.args})
      </code>
      {i.label && (
        <p className="text-xs text-as-ink-muted">
          <span className="text-as-ink-faint">Proposer’s note (not part of what you sign):</span> {i.label}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-as-ink-muted">
        Signed by{' '}
        {i.signers.length ? i.signers.map((s) => <AccountLink key={s} address={s} />) : 'nobody yet'}
        {mine && <StatusChip tone="signal">you</StatusChip>}
        {i.rejectedBy && (
          <>
            · rejected by <AccountLink address={i.rejectedBy} />
          </>
        )}
        {i.error && <span className="text-as-danger">· {i.error}</span>}
      </div>
      {open && (
        <div className="flex flex-wrap gap-2">
          {!mine && (
            <button
              type="button"
              disabled={!!busy}
              className="as-btn as-btn--primary as-btn--sm disabled:opacity-50"
              onClick={() => act(i.id, async () => api({ action: 'sign', id: i.id, xdr: await signEnvelope(i.xdr, address) }), 'Signed.')}
            >
              Sign
            </button>
          )}
          {i.weight >= i.threshold && (
            <button
              type="button"
              disabled={!!busy}
              className="as-btn as-btn--primary as-btn--sm disabled:opacity-50"
              onClick={() => act(i.id, () => api({ action: 'submit', id: i.id }), 'Sent: see its status above.')}
            >
              {busy === i.id ? 'Sending…' : 'Send to the network'}
            </button>
          )}
          <button
            type="button"
            disabled={!!busy}
            className="as-btn as-btn--outline as-btn--sm disabled:opacity-50"
            onClick={() => act(i.id, async () => api({ action: 'reject', id: i.id, signer: address, signature: await signText(rejectMessage(i.id), address) }), 'Rejected.')}
          >
            Reject
          </button>
        </div>
      )}
    </li>
  );
}

/** The queue to sign (first: it is what needs the signers), then the form to
 * propose a change, then what was sent or dropped before. */
export function QueuePanel({ address, governance: g, queue }: { address: string; governance: GovernanceData; queue: Queue }) {
  const { items, error: loadError, reload } = queue;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState<'registry' | 'oracle'>('oracle');
  const [method, setMethod] = useState('set_quorum_config');
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');

  async function act(what: string, fn: () => Promise<unknown>, done: string) {
    setBusy(what);
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: done });
      await reload();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message.split('\n')[0].slice(0, 300) });
    } finally {
      setBusy(null);
    }
  }

  const contract = target === 'registry' ? g.registry : g.oracle;
  const spec = METHODS[target].find((m) => m.method === method) ?? METHODS[target][0];
  // accept_admin is signed by the proposed admin, everything else by the admin.
  const source = spec.method === 'accept_admin' ? contract.pendingAdmin : contract.admin;
  const pending = (items ?? []).filter(isPending);
  const adminAccount = g.admins.find((a) => a.address === contract.admin);
  const signerRule = adminAccount && adminAccount.signers.length > 1
    ? `changes need signatures worth ${adminAccount.medThreshold} of ${adminAccount.signers.filter((s) => s.weight > 0).length} admin signers`
    : 'each needs the admin account’s threshold of signatures';
  const earlier = (items ?? []).filter((i) => !isPending(i));

  function propose() {
    if (!source) {
      setMessage({ ok: false, text: 'No admin is proposed on this contract: there is nothing to accept.' });
      return;
    }
    void act(
      'propose',
      async () => {
        const args = buildArgs(spec, values);
        const unsigned = await buildAdminCall(source, contract.id, spec.method, args);
        const signed = await signEnvelope(unsigned, address);
        await api({ action: 'create', label: label.trim() || `${target}: ${spec.label}`, xdr: signed });
      },
      'Proposed and signed. The other signers can sign it here now.',
    );
  }

  return (
    <>
      <Section title={pending.length ? `Waiting for signatures (${pending.length})` : 'Waiting for signatures'} aside={signerRule} guide={QUEUE_GUIDE}>
        {message && (
          <div className="mb-4" aria-live="polite">
            <Notice tone={message.ok ? 'signal' : 'danger'} title={message.ok ? 'Done' : 'Refused'}>
              {message.text}
            </Notice>
          </div>
        )}
        {loadError && <Notice tone="danger" title="The queue is unavailable">{loadError}</Notice>}
        {!loadError && !items && <p className="text-sm text-as-ink-muted">Loading the queue…</p>}
        {items && pending.length === 0 && <p className="text-sm text-as-ink-muted">Nothing is waiting for a signature. Propose a change below when one is needed.</p>}
        {pending.length > 0 && (
          <ul className="flex flex-col divide-y divide-as-hairline">
            {pending.map((i) => (
              <QueueItemRow key={i.id} i={i} address={address} g={g} busy={busy} act={act} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Propose a change" aside="your wallet signs it; nothing is sent until enough signers have signed">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            propose();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-medium text-as-ink">1 · Contract</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {(['oracle', 'registry'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={target === t}
                  onClick={() => {
                    setTarget(t);
                    setMethod(METHODS[t][0].method);
                    setValues({});
                  }}
                  className={`as-btn as-btn--sm !h-auto min-h-8 !whitespace-normal py-1.5 text-left ${target === t ? 'as-btn--primary' : 'as-btn--outline'}`}
                >
                  {t === 'oracle' ? 'PerformanceOracle (scores, quorum, disputes)' : 'AnchorRegistry (anchors, stake)'}
                </button>
              ))}
            </div>
          </fieldset>

          <FormField label="2 · Action" htmlFor="q-method" hint={ACTION_HELP[spec.method]}>
            <select
              id="q-method"
              className={INPUT}
              value={spec.method}
              onChange={(e) => {
                setMethod(e.target.value);
                setValues({});
              }}
            >
              {METHODS[target].map((m) => (
                <option key={m.method} value={m.method}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>

          {spec.args.length > 0 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-xs font-medium text-as-ink">3 · Values</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {spec.args.map((a) => {
                  const now = currentValue(spec.method, a.name, target, g);
                  const typed = values[a.name] ?? '';
                  const seconds = SECONDS_ARGS.has(a.name) && /^\d+$/.test(typed.trim()) ? humanDuration(Number(typed.trim())) : null;
                  return (
                    <FormField
                      key={a.name}
                      label={a.label}
                      htmlFor={`q-${a.name}`}
                      hint={
                        now || seconds ? (
                          <>
                            {now && <>Now: {now}.</>} {seconds && <>You typed {seconds}.</>}
                          </>
                        ) : undefined
                      }
                    >
                      <input id={`q-${a.name}`} className={INPUT} value={typed} onChange={(e) => setValues({ ...values, [a.name]: e.target.value })} />
                    </FormField>
                  );
                })}
              </div>
            </fieldset>
          )}

          <FormField label={`${spec.args.length ? '4' : '3'} · What it is for`} htmlFor="q-label" hint="Shown to the other signers beside the call. It is a note: what they sign is the call itself.">
            <input id="q-label" className={INPUT} placeholder="quorum 2, max_spread 15" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} />
          </FormField>

          {pending.length > 0 && (
            <Notice tone="amber" title="Another change is already waiting">
              Changes go one at a time: they share the admin account’s next sequence number, so when one is sent the others turn Stale and must be
              proposed again. Finish or reject the waiting one first.
            </Notice>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!!busy} className="as-btn as-btn--primary as-btn--sm disabled:opacity-50">
              {busy === 'propose' ? 'Waiting for your wallet…' : 'Propose and sign'}
            </button>
            <span className="text-xs text-as-ink-faint">
              From {source ? <AccountLink address={source} /> : 'no proposed admin'} to {contractName(contract.id, g)}. It is simulated now and stays valid for 7
              days.
            </span>
          </div>
        </form>
      </Section>

      {earlier.length > 0 && (
        <details className="as-panel group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-as-ink [&::-webkit-details-marker]:hidden">
            Earlier changes ({earlier.length}): sent, rejected or stale
            <span aria-hidden="true" className="ml-auto text-as-ink-faint transition-transform group-open:rotate-90">›</span>
          </summary>
          <ul className="mt-4 flex flex-col divide-y divide-as-hairline">
            {earlier.map((i) => (
              <QueueItemRow key={i.id} i={i} address={address} g={g} busy={busy} act={act} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
