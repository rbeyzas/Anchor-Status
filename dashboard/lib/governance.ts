import { scValToNative, xdr } from '@stellar/stellar-sdk';
import { contractDataVal, instanceKey, keyId, reportersKey } from './contract-state';
import { createRpcPool } from './rpc';
import { fetchEntries, fetchRecentEvents, ORACLE_CONTRACT_ID, REGISTRY_CONTRACT_ID } from './soroban';
import { stroopsToXlm } from './format';
import type { SourceType } from './types';

// Who runs the contracts and what is waiting to change, for /panel. Read
// from the contracts' storage and events, and the admin account's signers
// from Horizon: nothing here is ours to vouch for.

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const SOURCE_TYPES: SourceType[] = ['RealMainnet', 'RealTestnet', 'SimulatedMock'];

/** The governance events both contracts publish. */
export const GOVERNANCE_TOPICS = [
  'admin_proposed',
  'admin_changed',
  'upgrade_proposed',
  'upgrade_executed',
  'upgrade_cancelled',
  'upgrade_delay_set',
  'quorum_config_set',
  'reporter_authorized',
  'reporter_revoked',
  'dispute_config_set',
  'anchor_deactivated',
  'anchor_reactivated',
  'anchor_removed',
  'anchor_claimed',
] as const;

export interface ContractGovernance {
  id: string;
  admin: string;
  pendingAdmin?: string;
  delaySeconds: number;
  /** A shorter delay, in force from effectiveAt. */
  pendingDelay?: { seconds: number; effectiveAt: string };
  pendingUpgrade?: { wasmHash: string; executableAt: string };
}

export interface OracleGovernance extends ContractGovernance {
  quorum: { threshold: number; maxSpread: number; roundSeconds: number };
  /** A lower threshold waiting out the upgrade delay. */
  pendingQuorum?: { threshold: number; maxSpread: number; roundSeconds: number; effectiveAt: string };
  dispute: { minStakeXlm: number; cooldownSeconds: number };
}

export interface GovernanceEvent {
  id: string;
  contract: 'registry' | 'oracle';
  topic: string;
  at: string;
  txHash: string;
  /** The event's topics after its name, then its fields, as text. */
  details: Record<string, string>;
}

/** An admin account and who may sign for it (Horizon). A plain key signs
 * for itself; a multisig lists its signers and the medium threshold. */
export interface AdminAccount {
  address: string;
  signers: { key: string; weight: number }[];
  medThreshold: number;
}

export interface GovernanceData {
  registry: ContractGovernance;
  oracle: OracleGovernance;
  reporters: Record<SourceType, string[]>;
  /** The admins and any proposed admin, with their signers. */
  admins: AdminAccount[];
  /** The last 7 days, newest first. */
  history: GovernanceEvent[];
}

const iso = (seconds: unknown) => new Date(Number(seconds) * 1000).toISOString();
const hex = (v: unknown) => Buffer.from(v as Uint8Array).toString('hex');

/** Instance storage as { variant name: native value }. */
export function instanceStorage(entry: xdr.LedgerEntryData): Record<string, unknown> {
  const val = contractDataVal(entry);
  if (val.type !== 'scvContractInstance') throw new Error(`expected a contract instance, got ${val.type}`);
  const out: Record<string, unknown> = {};
  for (const e of val.instance.storage ?? []) {
    const key = scValToNative(e.key) as unknown;
    out[String(Array.isArray(key) ? key[0] : key)] = scValToNative(e.val);
  }
  return out;
}

export function decodeContractGovernance(id: string, s: Record<string, unknown>): ContractGovernance {
  const delay = s.PendingDelay as { seconds: bigint; effective_at: bigint } | undefined;
  const upgrade = s.PendingUpgrade as { wasm_hash: Uint8Array; executable_at: bigint } | undefined;
  return {
    id,
    admin: String(s.Admin),
    ...(s.PendingAdmin ? { pendingAdmin: String(s.PendingAdmin) } : {}),
    delaySeconds: Number(s.UpgradeDelay ?? 0),
    ...(delay ? { pendingDelay: { seconds: Number(delay.seconds), effectiveAt: iso(delay.effective_at) } } : {}),
    ...(upgrade ? { pendingUpgrade: { wasmHash: hex(upgrade.wasm_hash), executableAt: iso(upgrade.executable_at) } } : {}),
  };
}

type RawQuorum = { threshold: number; max_spread: number; round_seconds: bigint };
const quorumOf = (q: RawQuorum) => ({ threshold: Number(q.threshold), maxSpread: Number(q.max_spread), roundSeconds: Number(q.round_seconds) });

export function decodeOracleGovernance(id: string, s: Record<string, unknown>): OracleGovernance {
  const pending = s.PendingQuorumCfg as { config: RawQuorum; effective_at: bigint } | undefined;
  const dispute = s.DisputeCfg as { min_stake: bigint; cooldown_seconds: bigint } | undefined;
  return {
    ...decodeContractGovernance(id, s),
    // The contracts' defaults when nothing was ever set.
    quorum: s.QuorumCfg ? quorumOf(s.QuorumCfg as RawQuorum) : { threshold: 1, maxSpread: 100, roundSeconds: 0 },
    ...(pending ? { pendingQuorum: { ...quorumOf(pending.config), effectiveAt: iso(pending.effective_at) } } : {}),
    dispute: dispute
      ? { minStakeXlm: stroopsToXlm(dispute.min_stake), cooldownSeconds: Number(dispute.cooldown_seconds) }
      : { minStakeXlm: 10, cooldownSeconds: 7 * 24 * 3600 },
  };
}

/** An event as name + text fields, for the history list. */
export function describeEvent(contract: 'registry' | 'oracle', e: { id: string; ledgerClosedAt: string; txHash: string; topic: xdr.ScVal[]; value: xdr.ScVal }): GovernanceEvent {
  const text = (v: unknown): string =>
    v instanceof Uint8Array ? Buffer.from(v).toString('hex') : Array.isArray(v) ? v.map(text).join(', ') : String(v);
  const [name, ...rest] = e.topic.map((t) => scValToNative(t) as unknown);
  const details: Record<string, string> = {};
  rest.forEach((t, i) => (details[`topic${i + 1}`] = text(t)));
  const value = scValToNative(e.value) as unknown;
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array)) {
    for (const [k, v] of Object.entries(value)) details[k] = text(v);
  } else if (value !== undefined && value !== null) {
    details.value = text(value);
  }
  return { id: e.id, contract, topic: String(name), at: e.ledgerClosedAt, txHash: e.txHash, details };
}

async function adminAccount(address: string): Promise<AdminAccount> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const a = (await res.json()) as { signers: { key: string; weight: number }[]; thresholds: { med_threshold: number } };
    return { address, signers: a.signers.filter((s) => s.weight > 0), medThreshold: a.thresholds.med_threshold };
  } catch (err) {
    console.warn(`[panel] signers of ${address} unavailable:`, (err as Error).message);
    // Without Horizon, assume a plain key: it signs for itself.
    return { address, signers: [{ key: address, weight: 1 }], medThreshold: 0 };
  }
}

export async function getGovernanceData(): Promise<GovernanceData> {
  const pool = createRpcPool();
  const keys = [
    instanceKey(REGISTRY_CONTRACT_ID),
    instanceKey(ORACLE_CONTRACT_ID),
    ...SOURCE_TYPES.map((t) => reportersKey(ORACLE_CONTRACT_ID, t)),
  ];
  const [{ entries }, events] = await Promise.all([
    fetchEntries(pool, keys),
    fetchRecentEvents(pool, [REGISTRY_CONTRACT_ID, ORACLE_CONTRACT_ID], [...GOVERNANCE_TOPICS]).catch((err) => {
      console.warn('[panel] governance history unavailable:', err);
      return [];
    }),
  ]);
  const read = (key: xdr.LedgerKey) => entries.get(keyId(key))?.val;
  const registryInstance = read(keys[0]);
  const oracleInstance = read(keys[1]);
  if (!registryInstance || !oracleInstance) throw new Error('contract instances not found');
  const registry = decodeContractGovernance(REGISTRY_CONTRACT_ID, instanceStorage(registryInstance));
  const oracle = decodeOracleGovernance(ORACLE_CONTRACT_ID, instanceStorage(oracleInstance));

  const reporters = {} as Record<SourceType, string[]>;
  SOURCE_TYPES.forEach((t, i) => {
    const val = read(keys[2 + i]);
    reporters[t] = val ? (scValToNative(contractDataVal(val)) as string[]).map(String) : [];
  });

  // A proposed admin's signers count too: they are the ones who sign its
  // accept_admin, from the panel's queue.
  const candidates = [registry.admin, oracle.admin, registry.pendingAdmin, oracle.pendingAdmin].filter((a): a is string => !!a);
  const admins = await Promise.all([...new Set(candidates)].map(adminAccount));
  const history = events
    .map((e) => describeEvent(e.contractId?.toString() === REGISTRY_CONTRACT_ID ? 'registry' : 'oracle', e))
    .reverse();
  return { registry, oracle, reporters, admins, history };
}

/** Whether `address` may sign for an admin: the admin key itself, or one
 * of a multisig admin's signers. */
export function isAdminSigner(address: string, admins: AdminAccount[]): boolean {
  return admins.some((a) => a.address === address || a.signers.some((s) => s.key === address));
}
