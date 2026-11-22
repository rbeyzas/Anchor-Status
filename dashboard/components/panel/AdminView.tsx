'use client';

import type { ChipTone } from '@/components/StatusChip';
import { StatusChip } from '@/components/StatusChip';
import type { ContractGovernance, GovernanceData, GovernanceEvent } from '@/lib/governance';
import { WAITING_GUIDE } from './guides';
import { AccountLink, Field, humanDuration, Section, shortKey, Stat, TxLink, When } from './parts';
import { QueuePanel, type Queue } from './QueuePanel';

const hours = humanDuration;

/** What each governance event means, and how it reads in the history. */
const EVENT: Record<string, { label: string; tone: ChipTone }> = {
  admin_proposed: { label: 'Admin proposed', tone: 'amber' },
  admin_changed: { label: 'Admin accepted', tone: 'signal' },
  upgrade_proposed: { label: 'Upgrade proposed', tone: 'amber' },
  upgrade_executed: { label: 'Upgrade executed', tone: 'signal' },
  upgrade_cancelled: { label: 'Upgrade cancelled', tone: 'neutral' },
  upgrade_delay_set: { label: 'Time lock set', tone: 'pulse' },
  quorum_config_set: { label: 'Quorum set', tone: 'pulse' },
  reporter_authorized: { label: 'Reporter authorized', tone: 'signal' },
  reporter_revoked: { label: 'Reporter revoked', tone: 'danger' },
  dispute_config_set: { label: 'Dispute rules set', tone: 'pulse' },
  anchor_deactivated: { label: 'Anchor deactivated', tone: 'neutral' },
  anchor_reactivated: { label: 'Anchor reactivated', tone: 'signal' },
  anchor_removed: { label: 'Anchor removed', tone: 'neutral' },
  anchor_claimed: { label: 'Anchor claimed', tone: 'pulse' },
};

/** The fields worth a glance; addresses and hashes shortened. */
function eventSummary(e: GovernanceEvent): string {
  return Object.entries(e.details)
    .map(([k, v]) => {
      const short = /^[GC][A-Z2-7]{55}$/.test(v) ? shortKey(v) : /^[0-9a-f]{64}$/.test(v) ? `${v.slice(0, 8)}…` : v;
      const when = /(_at|_time)$/.test(k) && /^\d{9,}$/.test(v) ? new Date(Number(v) * 1000).toISOString().slice(0, 16).replace('T', ' ') : short;
      return k.startsWith('topic') ? when : `${k.replace(/_/g, ' ')} ${when}`;
    })
    .join(' · ');
}

type Waiting = { contract: string; what: string; detail: string; at?: string; ready?: boolean };

function waitingOn(name: string, c: ContractGovernance): Waiting[] {
  const now = Date.now();
  const out: Waiting[] = [];
  if (c.pendingAdmin) out.push({ contract: name, what: 'Admin handover', detail: `to ${shortKey(c.pendingAdmin)}: waits for its accept_admin` });
  if (c.pendingUpgrade) {
    const ready = Date.parse(c.pendingUpgrade.executableAt) <= now;
    out.push({ contract: name, what: 'Upgrade', detail: `to wasm ${c.pendingUpgrade.wasmHash.slice(0, 8)}…`, at: c.pendingUpgrade.executableAt, ready });
  }
  if (c.pendingDelay) out.push({ contract: name, what: 'Shorter time lock', detail: hours(c.pendingDelay.seconds), at: c.pendingDelay.effectiveAt });
  return out;
}

/** `transactions`: what is waiting and the multisig's queue; `contracts`:
 * the contracts' settings, signers and history. */
export function AdminView({ address, governance: g, part, queue }: { address: string; governance: GovernanceData; part: 'transactions' | 'contracts'; queue: Queue }) {
  const waiting = [
    ...waitingOn('Registry', g.registry),
    ...waitingOn('Oracle', g.oracle),
    ...(g.oracle.pendingQuorum
      ? [{ contract: 'Oracle', what: 'Lower quorum threshold', detail: `threshold ${g.oracle.pendingQuorum.threshold}`, at: g.oracle.pendingQuorum.effectiveAt }]
      : []),
  ];

  if (part === 'contracts') return <ContractsView address={address} governance={g} />;

  return (
    <div className="flex flex-col gap-6">
      <QueuePanel address={address} governance={g} queue={queue} />

      <Section title="Time-locked changes" aside="proposed on-chain, not yet in force" guide={WAITING_GUIDE}>
        {waiting.length === 0 ? (
          <p className="text-sm text-as-ink-muted">Nothing is waiting: no proposed admin, upgrade or time-lock change.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {waiting.map((w) => (
              <li key={w.contract + w.what} className="flex flex-wrap items-center gap-2 text-sm">
                <StatusChip tone={w.ready ? 'signal' : 'amber'} dot>
                  {w.ready ? 'Ready' : 'Waiting'}
                </StatusChip>
                <span className="font-medium text-as-ink">
                  {w.contract}: {w.what}
                </span>
                <span className="text-as-ink-muted">{w.detail}</span>
                {w.at && (
                  <span className="text-as-ink-faint">
                    · {w.ready ? 'executable since' : 'executable'} <When iso={w.at} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ContractsView({ address, governance: g }: { address: string; governance: GovernanceData }) {
  const o = g.oracle;
  const testnetReporters = g.reporters.RealTestnet?.length ?? 0;
  return (
    <div className="flex flex-col gap-6">
      <Section title="Who signs" aside="read from Horizon">
        <ul className="flex flex-col gap-4 text-sm">
          {g.admins.map((a) => {
            const single = a.signers.length === 1 && a.signers[0].key === a.address;
            const signers = a.signers.filter((s) => s.weight > 0);
            return (
              <li key={a.address} className="flex flex-col gap-2">
                <p className="text-as-ink-muted">
                  Admin account <AccountLink address={a.address} />{' '}
                  {single ? (
                    'is a single key: it signs alone.'
                  ) : (
                    <>
                      acts when signers worth <span className="font-medium text-as-ink">{a.medThreshold}</span> of{' '}
                      {signers.reduce((n, s) => n + s.weight, 0)} sign. Its own key cannot sign.
                    </>
                  )}
                </p>
                {!single && (
                  <ul className="grid gap-2 sm:grid-cols-3">
                    {signers.map((s) => (
                      <li key={s.key} className={`flex items-center justify-between gap-2 rounded-as-md border px-3 py-2 ${s.key === address ? 'border-as-signal/50 bg-as-signal-soft' : 'border-as-hairline'}`}>
                        <AccountLink address={s.key} />
                        <span className="flex items-center gap-2 text-xs text-as-ink-muted">
                          weight {s.weight}
                          {s.key === address && <StatusChip tone="signal">you</StatusChip>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="How scores and disputes are set">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Quorum"
            value={`${o.quorum.threshold} of ${Math.max(testnetReporters, o.quorum.threshold)}`}
            sub={o.quorum.threshold === 1 ? 'one reporter makes a card final' : 'reporters must agree before a card is final'}
          />
          <Stat label="Max spread" value={o.quorum.maxSpread} sub="points between reporters before a card is flagged" />
          <Stat label="Round" value={o.quorum.roundSeconds ? humanDuration(o.quorum.roundSeconds) : 'Any window'} sub="card windows align to it" />
          <Stat label="Dispute rules" value={`${o.dispute.minStakeXlm} XLM`} sub={`stake needed; ${humanDuration(o.dispute.cooldownSeconds)} wait after a rejection`} />
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {Object.entries(g.reporters).map(([type, keys]) => (
            <Field key={type} label={`Reporters, ${type}`}>
              {keys.length === 0 ? (
                <span className="text-as-ink-faint">none</span>
              ) : (
                <span className="flex flex-wrap gap-2">
                  {keys.map((k) => (
                    <AccountLink key={k} address={k} />
                  ))}
                </span>
              )}
            </Field>
          ))}
        </dl>
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        {[
          { name: 'AnchorRegistry', what: 'anchors, claims and stake', c: g.registry },
          { name: 'PerformanceOracle', what: 'score cards, quorum and disputes', c: g.oracle },
        ].map(({ name, what, c }) => (
          <Section key={name} title={name} aside={<AccountLink address={c.id} />}>
            <p className="mb-3 text-xs text-as-ink-muted">Holds {what}.</p>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Admin">
                <AccountLink address={c.admin} />
              </Field>
              <Field label="Upgrade time lock">{hours(c.delaySeconds)}</Field>
            </dl>
          </Section>
        ))}
      </div>

      <Section title="History" aside="governance events, last 7 days">
        {g.history.length === 0 ? (
          <p className="text-sm text-as-ink-muted">No governance event in the last 7 days.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-as-hairline">
            {g.history.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="w-16 text-xs text-as-ink-faint">
                  <When iso={e.at} />
                </span>
                <StatusChip tone={EVENT[e.topic]?.tone ?? 'neutral'}>{EVENT[e.topic]?.label ?? e.topic}</StatusChip>
                <span className="text-xs text-as-ink-faint">{e.contract}</span>
                <span className="min-w-0 flex-1 truncate text-as-ink-muted" title={eventSummary(e)}>
                  {eventSummary(e)}
                </span>
                <TxLink hash={e.txHash} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
