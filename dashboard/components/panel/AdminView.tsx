'use client';

import type { ChipTone } from '@/components/StatusChip';
import { StatusChip } from '@/components/StatusChip';
import type { ContractGovernance, GovernanceData, GovernanceEvent } from '@/lib/governance';
import { AccountLink, Field, Section, shortKey, TxLink, When } from './parts';
import { QueuePanel } from './QueuePanel';

const hours = (s: number) => (s % 3600 === 0 ? `${s / 3600}h` : `${s}s`);

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

export function AdminView({ address, governance: g }: { address: string; governance: GovernanceData }) {
  const waiting = [
    ...waitingOn('Registry', g.registry),
    ...waitingOn('Oracle', g.oracle),
    ...(g.oracle.pendingQuorum
      ? [{ contract: 'Oracle', what: 'Lower quorum threshold', detail: `threshold ${g.oracle.pendingQuorum.threshold}`, at: g.oracle.pendingQuorum.effectiveAt }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <Section title="Waiting to change" aside="proposed on-chain, not yet in force">
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

      <QueuePanel address={address} governance={g} />

      <div className="grid gap-6 md:grid-cols-2">
        {[
          { name: 'AnchorRegistry', c: g.registry },
          { name: 'PerformanceOracle', c: g.oracle },
        ].map(({ name, c }) => (
          <Section key={name} title={name} aside={<AccountLink address={c.id} />}>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Admin">
                <AccountLink address={c.admin} />
              </Field>
              <Field label="Upgrade time lock">{hours(c.delaySeconds)}</Field>
            </dl>
          </Section>
        ))}
      </div>

      <Section title="Admin signers" aside="from Horizon">
        <ul className="flex flex-col gap-3 text-sm">
          {g.admins.map((a) => (
            <li key={a.address}>
              <span className="text-as-ink-muted">
                <AccountLink address={a.address} />{' '}
                {a.signers.length === 1 && a.signers[0].key === a.address
                  ? 'is a single key: it signs alone.'
                  : `needs signatures worth ${a.medThreshold} from:`}
              </span>
              {!(a.signers.length === 1 && a.signers[0].key === a.address) && (
                <ul className="mt-1 flex flex-wrap gap-3">
                  {a.signers.map((s) => (
                    <li key={s.key} className="text-as-ink-muted">
                      <AccountLink address={s.key} /> weight {s.weight}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Oracle settings">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Quorum threshold">{g.oracle.quorum.threshold}</Field>
          <Field label="Max spread">{g.oracle.quorum.maxSpread}</Field>
          <Field label="Round">{g.oracle.quorum.roundSeconds ? hours(g.oracle.quorum.roundSeconds) : 'any window'}</Field>
          <Field label="Dispute">
            {g.oracle.dispute.minStakeXlm} XLM stake, {hours(g.oracle.dispute.cooldownSeconds)} cooldown
          </Field>
        </dl>
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
                <span className="text-xs uppercase tracking-wide text-as-ink-faint">{e.contract}</span>
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
