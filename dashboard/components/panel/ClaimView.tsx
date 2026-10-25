'use client';

import { useEffect, useState } from 'react';
import { StrKey } from '@stellar/stellar-sdk';
import { invoke, read } from '@/lib/wallet';
import { useAction } from './OperatorView';
import type { PanelAnchor } from './Panel';
import { CLAIM_GUIDE } from './guides';
import { bytesToHex, Field, hexToBytes, INPUT, Section, TxLink } from './parts';

type Lookup = { signingKey: string | null; message: string } | { error: string };

/** Signs the claim message with the SIGNING_KEY's secret, on the operator's
 * own machine: run from services/aggregator, where the SDK is installed. The
 * secret is read without echo and passed in the environment, not argv. */
const signCommand = (message: string) =>
  `read -rs S && S="$S" node -e "const {Keypair}=require('@stellar/stellar-sdk');console.log(Buffer.from(Keypair.fromSecret(process.env.S).sign(Buffer.from(process.argv[1],'hex'))).toString('hex'))" ${message}`;

/** The claim, step by step: the anchor's attested SIGNING_KEY, the bytes it
 * must sign for this wallet, and the signed claim. */
export function ClaimView({ address, anchors, registryId }: { address: string; anchors: PanelAnchor[]; registryId: string }) {
  const { state, run } = useAction();
  const [anchorId, setAnchorId] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [signature, setSignature] = useState('');
  const choices = anchors.filter((a) => !a.deactivated && a.claim?.operator !== address).sort((a, b) => a.name.localeCompare(b.name));
  const anchor = anchors.find((a) => a.anchorId === anchorId);
  const sig = signature.trim().toLowerCase();
  const sigOk = /^[0-9a-f]{128}$/.test(sig);

  // The claim message names the operator and the claim count, so it is read
  // for this wallet, and again after every claim.
  useEffect(() => {
    setLookup(null);
    setSignature('');
    if (!anchorId) return;
    let live = true;
    Promise.all([
      read(registryId, 'get_signing_key', { anchor_id: anchorId }),
      read(registryId, 'claim_message', { anchor_id: anchorId, operator: address }),
    ])
      .then(([key, message]) => {
        if (!live) return;
        setLookup({
          signingKey: key ? StrKey.encodeEd25519PublicKey(Buffer.from(key as Uint8Array)) : null,
          message: bytesToHex(message as Uint8Array),
        });
      })
      .catch((err: Error) => live && setLookup({ error: (err.message ?? String(err)).split('\n')[0] }));
    return () => {
      live = false;
    };
  }, [address, anchorId, registryId, state.tx]);

  const blocked = !anchor
    ? null
    : anchor.stake !== 0
      ? `The record holds ${anchor.stake} XLM of stake; its current operator must withdraw it before the record can change hands.`
      : anchor.withdrawal
        ? 'A stake withdrawal is pending on the record; it must complete first.'
        : null;

  return (
    <Section title="Claim an anchor" aside="for the anchor's own operator" guide={CLAIM_GUIDE}>
      <select className={INPUT} value={anchorId} onChange={(e) => setAnchorId(e.target.value)} aria-label="Anchor to claim">
        <option value="">Choose an anchor…</option>
        {choices.map((a) => (
          <option key={a.anchorId} value={a.anchorId}>
            {a.name} · {a.domain}
          </option>
        ))}
      </select>

      {anchor && (
        <div className="mt-5 flex flex-col gap-5">
          {!lookup && <p className="text-sm text-as-ink-muted">Reading the registry…</p>}
          {lookup && 'error' in lookup && <p className="text-sm text-as-danger">Could not read the registry: {lookup.error}</p>}
          {lookup && !('error' in lookup) && (
            <>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="1. SIGNING_KEY attested on-chain">
                  {lookup.signingKey ? (
                    <span className="as-mono break-all">{lookup.signingKey}</span>
                  ) : (
                    <span className="text-as-amber">
                      Not yet. Our reporters read{' '}
                      <a href={`https://${anchor.domain}/.well-known/stellar.toml`} target="_blank" rel="noreferrer" className="underline">
                        {anchor.domain}/.well-known/stellar.toml
                      </a>{' '}
                      every 20 minutes and record its SIGNING_KEY here. If the file has none, add one; if it has one, check back
                      within the hour.
                    </span>
                  )}
                </Field>
                <Field label="Current operator">
                  <span className="as-mono break-all">{anchor.claim ? anchor.claim.operator : 'unclaimed (held by the admin)'}</span>
                </Field>
              </dl>

              {lookup.signingKey && (
                <>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-as-ink">2. Sign this message with the SIGNING_KEY</h3>
                    <textarea readOnly className={`${INPUT} h-24 py-2`} value={lookup.message} onFocus={(e) => e.target.select()} aria-label="Claim message, hex" />
                    <p className="text-xs text-as-ink-faint">
                      It names this wallet as the new operator, so connect the wallet that should operate the anchor first. Sign
                      the raw bytes (ed25519, not a Stellar signed message) where the secret lives, for example from{' '}
                      <span className="as-mono">services/aggregator</span>:
                    </p>
                    <textarea readOnly className={`${INPUT} h-20 py-2 text-xs`} value={signCommand(lookup.message)} onFocus={(e) => e.target.select()} aria-label="Signing command" />
                  </div>

                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run('claim', () => invoke(address, registryId, 'claim_anchor', { anchor_id: anchorId, operator: address, signature: hexToBytes(sig) }));
                    }}
                  >
                    <h3 className="text-sm font-medium text-as-ink">3. Paste the signature and claim</h3>
                    <input className={INPUT} placeholder="Signature, 128 hex characters" value={signature} onChange={(e) => setSignature(e.target.value)} aria-label="Signature" />
                    {blocked && <p className="text-xs text-as-amber">{blocked}</p>}
                    <button type="submit" disabled={!!state.busy || !sigOk || !!blocked} className="as-btn as-btn--primary as-btn--sm self-start disabled:opacity-50">
                      Claim {anchor.name}
                    </button>
                  </form>
                </>
              )}
            </>
          )}

          {(state.busy || state.tx || state.error) && (
            <p className="text-sm" aria-live="polite">
              {state.busy && <span className="text-as-ink-muted">Waiting for your wallet and the network…</span>}
              {state.tx && (
                <span className="text-as-signal">
                  Claimed: transaction <TxLink hash={state.tx} />. The page refreshes with the anchor under your operations.
                </span>
              )}
              {state.error && (
                <span className="text-as-danger">
                  Refused: {state.error}
                  {state.error.includes('Error(Crypto') || state.error.includes('InvalidInput') ? ' (the signature does not match this message and key)' : ''}
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
