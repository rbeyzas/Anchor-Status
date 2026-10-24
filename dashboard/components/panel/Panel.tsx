'use client';

import { useState } from 'react';
import { Wallet } from '@phosphor-icons/react';
import type { GovernanceData } from '@/lib/governance';
import type { AnchorViewModel } from '@/lib/types';
import { connectWallet, disconnectWallet } from '@/lib/wallet';
import { AdminView } from './AdminView';
import { OperatorView } from './OperatorView';
import { shortKey } from './parts';

export type PanelAnchor = Pick<
  AnchorViewModel,
  'anchorId' | 'name' | 'domain' | 'sourceType' | 'operator' | 'stake' | 'claim' | 'withdrawal' | 'dispute' | 'deactivated'
> & { cardWindowEnd?: string; cardScore?: number };

/** The admin key itself, or one of a multisig admin's signers. */
const isAdminSigner = (address: string, g: GovernanceData) =>
  g.admins.some((a) => a.address === address || a.signers.some((s) => s.key === address));

export function Panel({ anchors, governance }: { anchors: PanelAnchor[]; governance: GovernanceData }) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  }

  // An operator is whoever claimed the record: before a claim the operator
  // field is still the admin, which is not an operator role.
  const operated = address ? anchors.filter((a) => a.claim?.operator === address) : [];
  const admin = address ? isAdminSigner(address, governance) : false;

  return (
    <div className="flex flex-col gap-6">
      <div className="as-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        {address ? (
          <>
            <span className="flex items-center gap-2 text-sm text-as-ink-muted">
              <Wallet size={16} aria-hidden="true" />
              Connected as <span className="as-mono text-as-ink" title={address}>{shortKey(address)}</span>
              {admin && <span className="as-chip as-chip--signal">Admin signer</span>}
              {operated.length > 0 && (
                <span className="as-chip as-chip--pulse">
                  Operator of {operated.length} anchor{operated.length === 1 ? '' : 's'}
                </span>
              )}
            </span>
            <button type="button" onClick={disconnect} className="as-btn as-btn--outline as-btn--sm">
              Disconnect
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-as-ink-muted">No wallet connected.</span>
            <button type="button" onClick={connect} disabled={busy} className="as-btn as-btn--primary as-btn--sm disabled:opacity-60">
              {busy ? 'Connecting…' : 'Connect wallet'}
            </button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-as-danger">{error}</p>}

      {address && operated.length > 0 && (
        <OperatorView address={address} anchors={operated} minStakeXlm={governance.oracle.dispute.minStakeXlm} governance={governance} />
      )}
      {address && admin && <AdminView address={address} governance={governance} />}
      {address && !admin && operated.length === 0 && (
        <p className="as-panel px-5 py-4 text-sm text-as-ink-muted">
          This account is not an admin signer and has not claimed an anchor. An anchor&apos;s operator claims its record
          with a signature from the SIGNING_KEY in its stellar.toml; ask us for the claim message.
        </p>
      )}
    </div>
  );
}
