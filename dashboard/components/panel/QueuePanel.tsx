'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusChip, type ChipTone } from '@/components/StatusChip';
import type { QueueView } from '@/lib/admin-queue';
import { buildArgs, METHODS } from '@/lib/admin-calls';
import type { GovernanceData } from '@/lib/governance';
import { rejectMessage } from '@/lib/queue-message';
import { buildAdminCall, signEnvelope, signText } from '@/lib/wallet';
import { QUEUE_GUIDE } from './guides';
import { AccountLink, INPUT, Section, TxLink, When } from './parts';

async function api(body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch('/api/admin-queue', body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`));
  return data;
}

function statusOf(i: QueueView): { label: string; tone: ChipTone } {
  if (i.status === 'executed') return { label: 'Executed', tone: 'signal' };
  if (i.status === 'failed') return { label: 'Failed', tone: 'danger' };
  if (i.status === 'rejected') return { label: 'Rejected', tone: 'neutral' };
  if (i.stale) return { label: 'Stale', tone: 'neutral' };
  return i.weight >= i.threshold ? { label: 'Ready to send', tone: 'signal' } : { label: `Signed ${i.weight}/${i.threshold}`, tone: 'amber' };
}

export function QueuePanel({ address, governance: g }: { address: string; governance: GovernanceData }) {
  const [items, setItems] = useState<QueueView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState<'registry' | 'oracle'>('oracle');
  const [method, setMethod] = useState('set_quorum_config');
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(((await api()).items as QueueView[]) ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(what: string, fn: () => Promise<unknown>, done: string) {
    setBusy(what);
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: done });
      await load();
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
    <Section title="Transactions to sign" aside="each needs the admin account's threshold of signatures" guide={QUEUE_GUIDE}>
      <form
        className="mb-6 grid gap-2 rounded-as-md border border-as-hairline p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          propose();
        }}
      >
        <select
          className={INPUT}
          value={target}
          onChange={(e) => {
            const t = e.target.value as 'registry' | 'oracle';
            setTarget(t);
            setMethod(METHODS[t][0].method);
            setValues({});
          }}
        >
          <option value="oracle">PerformanceOracle</option>
          <option value="registry">AnchorRegistry</option>
        </select>
        <select
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
        {spec.args.map((a) => (
          <input
            key={a.name}
            className={INPUT}
            placeholder={a.label}
            aria-label={a.label}
            value={values[a.name] ?? ''}
            onChange={(e) => setValues({ ...values, [a.name]: e.target.value })}
          />
        ))}
        <input className={`${INPUT} sm:col-span-2`} placeholder="What it is for (shown to the other signers)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={!!busy} className="as-btn as-btn--primary as-btn--sm disabled:opacity-50">
            {busy === 'propose' ? 'Waiting for your wallet…' : 'Propose and sign'}
          </button>
          <span className="text-xs text-as-ink-faint">
            From {source ? <AccountLink address={source} /> : 'no proposed admin'} to {target === 'registry' ? 'AnchorRegistry' : 'PerformanceOracle'}.{' '}
            The transaction is simulated now and stays valid for 7 days, until another admin transaction uses its sequence number.
          </span>
        </div>
      </form>

      {message && <p className={`mb-4 text-sm ${message.ok ? 'text-as-signal' : 'text-as-danger'}`} aria-live="polite">{message.text}</p>}
      {loadError && <p className="text-sm text-as-danger">The queue is unavailable: {loadError}</p>}
      {items && items.length === 0 && <p className="text-sm text-as-ink-muted">Nothing has been proposed yet.</p>}
      {items && items.length > 0 && (
        <ul className="flex flex-col divide-y divide-as-hairline">
          {items.map((i) => {
            const st = statusOf(i);
            const open = i.status === 'open' && !i.stale;
            const mine = i.signers.includes(address);
            return (
              <li key={i.id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={st.tone} dot>
                    {st.label}
                  </StatusChip>
                  <span className="font-medium text-as-ink">{i.label}</span>
                  <span className="text-xs text-as-ink-faint">
                    proposed <When iso={i.createdAt} />
                  </span>
                  {i.txHash && <TxLink hash={i.txHash} />}
                </div>
                {/* Read from the transaction itself: this is what a signature approves. */}
                <code className="as-mono block overflow-x-auto rounded bg-as-surface-2 px-2 py-1 text-xs text-as-ink">
                  {i.contract === g.registry.id ? 'AnchorRegistry' : i.contract === g.oracle.id ? 'PerformanceOracle' : i.contract}.{i.method}({i.args})
                </code>
                <div className="flex flex-wrap items-center gap-2 text-xs text-as-ink-muted">
                  Signed by{' '}
                  {i.signers.map((s) => (
                    <AccountLink key={s} address={s} />
                  ))}
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
                      onClick={() =>
                        act(i.id, async () => api({ action: 'reject', id: i.id, signer: address, signature: await signText(rejectMessage(i.id), address) }), 'Rejected.')
                      }
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
