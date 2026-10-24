import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { stroopsToXlm } from './format';
import { flagsFromMask } from './scorecard';
import type {
  AnchorHealth,
  ClaimView,
  WithdrawalView,
  DisputeStatus,
  DisputeView,
  LifecycleView,
  PendingRoundView,
  QuorumView,
  RiskReason,
  ScoreCardView,
  SourceType,
  Trend,
} from './types';

// The contracts' storage layout, read directly instead of through one
// simulated call per anchor. These keys mirror the `DataKey` enums in
// contracts/anchor-registry/src/types.rs and
// contracts/performance-oracle/src/types.rs: a #[contracttype] enum variant
// is stored as a vector of its name followed by its fields.

function contractDataKey(contractId: string, key: xdr.ScVal, durability = xdr.ContractDataDurability.persistent): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability,
    }),
  );
}

const enumKey = (variant: string, ...fields: xdr.ScVal[]) =>
  xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), ...fields]);

/** The contract instance entry, which holds its instance storage. */
export const instanceKey = (contractId: string) =>
  contractDataKey(contractId, xdr.ScVal.scvLedgerKeyContractInstance());

/** Registry `DataKey::Anchor(id)` → AnchorInfo. */
export const anchorInfoKey = (registryId: string, anchorId: string) =>
  contractDataKey(registryId, enumKey('Anchor', xdr.ScVal.scvSymbol(anchorId)));

/** Registry `DataKey::AnchorAt(i)` → the i-th anchor id (paged layout). */
export const anchorAtKey = (registryId: string, index: number) =>
  contractDataKey(registryId, enumKey('AnchorAt', xdr.ScVal.scvU32(index)));

/** Oracle `DataKey::Health(id)` → AnchorHealth. */
export const healthKey = (oracleId: string, anchorId: string) =>
  contractDataKey(oracleId, enumKey('Health', xdr.ScVal.scvSymbol(anchorId)));

/** Oracle `DataKey::Card(id)` → ScoreCard. */
export const cardKey = (oracleId: string, anchorId: string) =>
  contractDataKey(oracleId, enumKey('Card', xdr.ScVal.scvSymbol(anchorId)));

/** Registry `DataKey::Status(id)` → AnchorStatus; absent means active. */
export const lifecycleKey = (registryId: string, anchorId: string) =>
  contractDataKey(registryId, enumKey('Status', xdr.ScVal.scvSymbol(anchorId)));

/** Registry `DataKey::Claim(id)` → ClaimInfo, once the operator claimed it. */
export const claimKey = (registryId: string, anchorId: string) =>
  contractDataKey(registryId, enumKey('Claim', xdr.ScVal.scvSymbol(anchorId)));

/** Registry `DataKey::WithdrawalRequest(id)` → a stake withdrawal waiting
 * out its cooldown. */
export const withdrawalKey = (registryId: string, anchorId: string) =>
  contractDataKey(registryId, enumKey('WithdrawalRequest', xdr.ScVal.scvSymbol(anchorId)));

/** Oracle `DataKey::Reporters(source_type)` → every reporter authorized for it. */
export const reportersKey = (oracleId: string, sourceType: SourceType) =>
  contractDataKey(oracleId, enumKey('Reporters', xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(sourceType)])));

/** Oracle `DataKey::Quorum(id)` → QuorumInfo behind the current card. */
export const quorumKey = (oracleId: string, anchorId: string) =>
  contractDataKey(oracleId, enumKey('Quorum', xdr.ScVal.scvSymbol(anchorId)));

/** Oracle `DataKey::Round(id)` → PendingRound. Temporary storage: a round
 * that never reaches the threshold expires. */
export const roundKey = (oracleId: string, anchorId: string) =>
  contractDataKey(oracleId, enumKey('Round', xdr.ScVal.scvSymbol(anchorId)), xdr.ContractDataDurability.temporary);

/** Oracle `DataKey::Dispute(id)` → the anchor's latest Dispute. */
export const disputeKey = (oracleId: string, anchorId: string) =>
  contractDataKey(oracleId, enumKey('Dispute', xdr.ScVal.scvSymbol(anchorId)));

export const keyId = (key: xdr.LedgerKey) => key.toXDR('base64');

/** The value stored in a contract-data ledger entry. */
export function contractDataVal(entry: xdr.LedgerEntryData): xdr.ScVal {
  if (entry.type !== 'contractData') throw new Error(`expected contract data, got ${entry.type}`);
  return entry.contractData.val;
}

/**
 * Where the registry keeps its anchor list, read from its instance storage.
 * Two layouts exist:
 *   ids    the original: every id in one `AnchorIds` vector.
 *   paged  after the upgrade: `AnchorCount` here, each id in its own
 *          persistent `AnchorAt(i)` entry, read with `anchorAtKey`.
 * While `AnchorIds` exists it wins: the migration fills `AnchorAt` over
 * several transactions and only `finalize_migration` removes `AnchorIds`,
 * so the old list is complete until the new one is.
 */
export type RegistryIndex = { layout: 'ids'; ids: string[] } | { layout: 'paged'; count: number };

export function readRegistryIndex(instance: xdr.LedgerEntryData): RegistryIndex {
  const val = contractDataVal(instance);
  if (val.type !== 'scvContractInstance') throw new Error(`expected a contract instance, got ${val.type}`);
  const find = (key: xdr.ScVal) => {
    const wanted = key.toXDR('base64');
    return (val.instance.storage ?? []).find((e) => e.key.toXDR('base64') === wanted);
  };
  const ids = find(enumKey('AnchorIds'));
  if (ids) return { layout: 'ids', ids: (scValToNative(ids.val) as string[]).map(String) };
  const count = find(enumKey('AnchorCount'));
  if (count) return { layout: 'paged', count: Number(scValToNative(count.val)) };
  // A registry with no anchor registered yet has neither.
  return { layout: 'ids', ids: [] };
}

/** The oracle's quorum threshold, from its instance storage. No `QuorumCfg`
 * means 1, the behaviour before quorums. */
export function readQuorumThreshold(instance: xdr.LedgerEntryData): number {
  const val = contractDataVal(instance);
  if (val.type !== 'scvContractInstance') throw new Error(`expected a contract instance, got ${val.type}`);
  const wanted = enumKey('QuorumCfg').toXDR('base64');
  const cfg = (val.instance.storage ?? []).find((e) => e.key.toXDR('base64') === wanted);
  return cfg ? Number((scValToNative(cfg.val) as { threshold: number }).threshold) : 1;
}

/** An `AnchorAt(i)` entry's value: the anchor id. */
export const decodeAnchorAt = (entry: xdr.LedgerEntryData) => String(scValToNative(contractDataVal(entry)));

/** A unit enum variant decodes as `[name]`. */
const tag = (v: unknown) => String(Array.isArray(v) ? v[0] : v);

export interface AnchorInfo {
  operator: string;
  name: string;
  domain: string;
  sourceType: SourceType;
  stake: bigint;
  score: number;
  lastUpdated: bigint;
}

export function decodeAnchorInfo(entry: xdr.LedgerEntryData): AnchorInfo {
  const raw = scValToNative(contractDataVal(entry)) as Record<string, unknown>;
  return {
    operator: String(raw.operator),
    name: String(raw.name),
    domain: String(raw.domain),
    sourceType: tag(raw.source_type) as SourceType,
    stake: BigInt(raw.stake as bigint),
    score: Number(raw.score),
    lastUpdated: BigInt(raw.last_updated as bigint),
  };
}

/** What `get_health` returns for an anchor never reported on
 * (scoring::new_health). */
export const NEW_HEALTH: AnchorHealth = {
  trend: 'Stable',
  riskReason: 'None',
  consecutiveFailures: 0,
  recentSuccessPercent: 100,
  recentCount: 0,
  observations: 0,
};

export function decodeHealth(entry: xdr.LedgerEntryData): AnchorHealth {
  const raw = scValToNative(contractDataVal(entry)) as Record<string, unknown>;
  const count = Number(raw.recent_count);
  const mask = count >= 32 ? 0xffffffff : (1 << count) - 1;
  const successes = ((Number(raw.recent_outcomes) & mask) >>> 0).toString(2).split('').filter((b) => b === '1').length;
  return {
    trend: tag(raw.trend) as Trend,
    riskReason: tag(raw.risk_reason) as RiskReason,
    consecutiveFailures: Number(raw.consecutive_failures),
    recentSuccessPercent: count === 0 ? 100 : Math.floor((successes * 100) / count),
    recentCount: count,
    observations: Number(raw.observations),
  };
}

export function decodeCard(entry: xdr.LedgerEntryData): ScoreCardView {
  const raw = scValToNative(contractDataVal(entry)) as Record<string, unknown>;
  return {
    score: Number(raw.score),
    availability: Number(raw.availability),
    speed: Number(raw.speed),
    integrity: Number(raw.integrity),
    market: raw.market === null || raw.market === undefined ? null : Number(raw.market),
    confidence: Number(raw.confidence),
    flags: flagsFromMask(Number(raw.flags)),
    windowEnd: new Date(Number(raw.window_end) * 1000).toISOString(),
    methodologyVersion: Number(raw.methodology_version),
    inputsHash: Buffer.from(raw.inputs_hash as Uint8Array).toString('hex'),
    publishedAt: new Date(Number(raw.published_at) * 1000).toISOString(),
  };
}

/** A deactivated anchor's on-chain status; undefined while active. */
export function decodeLifecycle(entry: xdr.LedgerEntryData): LifecycleView | undefined {
  const raw = scValToNative(contractDataVal(entry)) as Record<string, unknown>;
  if (tag(raw.state) !== 'Deactivated') return undefined;
  return { reason: String(raw.reason), since: new Date(Number(raw.since) * 1000).toISOString() };
}

export function decodeQuorum(entry: xdr.LedgerEntryData, threshold: number): QuorumView {
  const raw = scValToNative(contractDataVal(entry)) as Record<string, unknown>;
  const outliers = new Set((raw.outliers as string[]).map(String));
  const scores = raw.scores as number[];
  return {
    windowEnd: new Date(Number(raw.window_end) * 1000).toISOString(),
    reporters: (raw.reporters as string[]).map((address, i) => ({
      address: String(address),
      score: Number(scores[i]),
      outlier: outliers.has(String(address)),
    })),
    spread: Number(raw.spread),
    threshold,
  };
}

/** How many reporters have sent a card for the round still collecting. */
export function decodeRound(entry: xdr.LedgerEntryData, threshold: number): PendingRoundView {
  const raw = scValToNative(contractDataVal(entry)) as Record<string, unknown>;
  return {
    windowEnd: new Date(Number(raw.window_end) * 1000).toISOString(),
    submitted: (raw.submissions as unknown[]).length,
    threshold,
  };
}

export function decodeDispute(entry: xdr.LedgerEntryData): DisputeView {
  const raw = scValToNative(contractDataVal(entry)) as Record<string, unknown>;
  const resolvedAt = Number(raw.resolved_at);
  return {
    status: tag(raw.status) as DisputeStatus,
    windowEnd: new Date(Number(raw.window_end) * 1000).toISOString(),
    openedAt: new Date(Number(raw.opened_at) * 1000).toISOString(),
    ...(resolvedAt > 0 ? { resolvedAt: new Date(resolvedAt * 1000).toISOString() } : {}),
    reasonCode: Number(raw.reason_code),
    evidenceHash: Buffer.from(raw.evidence_hash as Uint8Array).toString('hex'),
    upholdVotes: (raw.uphold as unknown[]).length,
    rejectVotes: (raw.reject as unknown[]).length,
  };
}

export function decodeClaim(entry: xdr.LedgerEntryData): ClaimView {
  const raw = scValToNative(contractDataVal(entry)) as Record<string, unknown>;
  return { operator: String(raw.operator), claimedAt: new Date(Number(raw.claimed_at) * 1000).toISOString() };
}

export function decodeWithdrawal(entry: xdr.LedgerEntryData): WithdrawalView {
  const raw = scValToNative(contractDataVal(entry)) as Record<string, unknown>;
  return { amount: stroopsToXlm(raw.amount as bigint), unlockAt: new Date(Number(raw.unlock_time) * 1000).toISOString() };
}
