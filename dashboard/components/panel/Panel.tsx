'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Anchor, Scales, ShieldCheck, Wallet } from '@phosphor-icons/react';
import type { GovernanceData } from '@/lib/governance';
import type { AnchorViewModel } from '@/lib/types';
import { connectWallet, disconnectWallet, restoreWallet } from '@/lib/wallet';
import { AdminView } from './AdminView';
import { ClaimView } from './ClaimView';
import { DisputeDecisions } from './DisputeDecisions';
import { OperatorView } from './OperatorView';
import { shortKey } from './parts';

export type PanelAnchor = Pick<
  AnchorViewModel,
  'anchorId' | 'name' | 'domain' | 'sourceType' | 'operator' | 'stake' | 'claim' | 'withdrawal' | 'dispute' | 'deactivated'
> & { cardWindowEnd?: string; cardScore?: number };

/** The admin key itself, or one of a multisig admin's signers. */
const isAdminSigner = (address: string, g: GovernanceData) =>
  g.admins.some((a) => a.address === address || a.signers.some((s) => s.key === address));

type TabId = 'anchors' | 'disputes' | 'transactions' | 'contracts' | 'claim';

const ROLES: { icon: ReactNode; title: string; who: string; can: string[] }[] = [
  {
    icon: <Anchor size={20} aria-hidden="true" />,
    title: 'Anchor operators',
    who: 'You run an anchor we measure.',
    can: ['Claim its record with your stellar.toml SIGNING_KEY', 'Add or withdraw stake', 'Dispute a score card you believe is wrong'],
  },
  {
    icon: <ShieldCheck size={20} aria-hidden="true" />,
    title: 'Admin signers',
    who: 'You hold one of the contracts’ admin keys.',
    can: ['Decide disputes, with both reporters’ measurements side by side', 'Propose and co-sign contract changes', 'See settings, signers and history'],
  },
  {
    icon: <Scales size={20} aria-hidden="true" />,
    title: 'How it stays fair',
    who: 'Every action is checked on-chain.',
    can: ['Your wallet shows each signature before you approve it', 'Admin changes need two signers', 'Nothing here holds or asks for a secret key'],
  },
];

function Intro({ busy, onConnect }: { busy: boolean; onConnect: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="as-panel flex flex-col items-start gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-as-ink">Start by connecting your wallet.</p>
          <p className="mt-1 text-sm text-as-ink-muted">
            Freighter, xBull, Albedo, LOBSTR, Hana or Rabet. The panel shows what your account can do; connecting signs nothing.
          </p>
        </div>
        <button type="button" onClick={onConnect} disabled={busy} className="as-btn as-btn--primary shrink-0 disabled:opacity-60">
          <Wallet size={16} aria-hidden="true" />
          {busy ? 'Connecting…' : 'Connect wallet'}
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r.title} className="as-panel px-5 py-5">
            <div className="flex items-center gap-2 text-as-signal">
              {r.icon}
              <h2 className="font-heading text-base font-semibold text-as-ink">{r.title}</h2>
            </div>
            <p className="mt-2 text-sm text-as-ink-muted">{r.who}</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-as-ink">
              {r.can.map((c) => (
                <li key={c} className="flex gap-2">
                  <span aria-hidden="true" className="text-as-signal">·</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Panel({ anchors, governance }: { anchors: PanelAnchor[]; governance: GovernanceData }) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId | null>(null);

  // Stay connected across reloads, until Disconnect.
  useEffect(() => {
    void restoreWallet().then((restored) => restored && setAddress((current) => current ?? restored));
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      setAddress(await connectWallet());
    } catch (err) {
      setError((err as Error).message ?? 'Could not connect');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await disconnectWallet().catch(() => undefined);
    setAddress(null);
    setTab(null);
  }

  if (!address) {
    return (
      <>
        <Intro busy={busy} onConnect={connect} />
        {error && <p className="mt-4 text-sm text-as-danger">{error}</p>}
      </>
    );
  }

  // An operator is whoever claimed the record: before a claim the operator
  // field is still the admin, which is not an operator role.
  const operated = anchors.filter((a) => a.claim?.operator === address);
  const admin = isAdminSigner(address, governance);
  const openDisputes = anchors.filter((a) => a.dispute?.status === 'Open');
  const tabs: { id: TabId; label: string; count?: number }[] = [
    ...(operated.length ? [{ id: 'anchors' as const, label: 'My anchors', count: operated.length }] : []),
    ...(admin
      ? [
          { id: 'disputes' as const, label: 'Disputes', count: openDisputes.length },
          { id: 'transactions' as const, label: 'Transactions' },
          { id: 'contracts' as const, label: 'Contracts' },
        ]
      : []),
    { id: 'claim', label: operated.length ? 'Claim another anchor' : 'Claim an anchor' },
  ];
  const current = tabs.find((t) => t.id === tab)?.id ?? tabs[0].id;
  const summary = [
    operated.length ? `operate ${operated.length === 1 ? operated[0].name : `${operated.length} anchors`}` : null,
    admin ? 'decide disputes and co-sign contract changes' : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="as-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-sm text-as-ink-muted">
            <Wallet size={16} aria-hidden="true" />
            Connected as <span className="as-mono text-as-ink" title={address}>{shortKey(address)}</span>
            {admin && <span className="as-chip as-chip--signal">Admin signer</span>}
            {operated.length > 0 && <span className="as-chip as-chip--pulse">Operator</span>}
          </span>
          <span className="text-xs text-as-ink-faint">
            {summary.length ? `With this wallet you can ${summary.join(', and ')}.` : 'This wallet has no role yet: claim your anchor below to manage it.'}
          </span>
        </div>
        <button type="button" onClick={disconnect} className="as-btn as-btn--outline as-btn--sm">
          Disconnect
        </button>
      </div>
      {error && <p className="text-sm text-as-danger">{error}</p>}

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Panel sections" className="-mb-2 flex gap-1 overflow-x-auto border-b border-as-hairline [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={current === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
                current === t.id ? 'border-as-signal font-medium text-as-ink' : 'border-transparent text-as-ink-muted hover:text-as-ink'
              }`}
            >
              {t.label}
              {t.count ? <span className={`as-chip ${t.id === 'disputes' ? 'as-chip--amber' : 'as-chip--neutral'}`}>{t.count}</span> : null}
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel">
        {current === 'anchors' && (
          <OperatorView address={address} anchors={operated} minStakeXlm={governance.oracle.dispute.minStakeXlm} governance={governance} />
        )}
        {current === 'disputes' && <DisputeDecisions address={address} anchors={openDisputes} oracleId={governance.oracle.id} />}
        {current === 'transactions' && <AdminView address={address} governance={governance} part="transactions" />}
        {current === 'contracts' && <AdminView address={address} governance={governance} part="contracts" />}
        {current === 'claim' && <ClaimView address={address} anchors={anchors} registryId={governance.registry.id} />}
      </div>
    </div>
  );
}
