import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { flagsFromMask } from './scorecard';
import type { AnchorHealth, RiskReason, ScoreCardView, SourceType, Trend } from './types';

// The contracts' storage layout, read directly instead of through one
// simulated call per anchor. These keys mirror the `DataKey` enums in
// contracts/anchor-registry/src/types.rs and
// contracts/performance-oracle/src/types.rs: a #[contracttype] enum variant
// is stored as a vector of its name followed by its fields.

function contractDataKey(contractId: string, key: xdr.ScVal): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
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

/** Oracle `DataKey::Health(id)` → AnchorHealth. */
export const healthKey = (oracleId: string, anchorId: string) =>
  contractDataKey(oracleId, enumKey('Health', xdr.ScVal.scvSymbol(anchorId)));

/** Oracle `DataKey::Card(id)` → ScoreCard. */
export const cardKey = (oracleId: string, anchorId: string) =>
  contractDataKey(oracleId, enumKey('Card', xdr.ScVal.scvSymbol(anchorId)));

export const keyId = (key: xdr.LedgerKey) => key.toXDR('base64');

/** The value stored in a contract-data ledger entry. */
function contractDataVal(entry: xdr.LedgerEntryData): xdr.ScVal {
  if (entry.type !== 'contractData') throw new Error(`expected contract data, got ${entry.type}`);
  return entry.contractData.val;
}

/** Registry `DataKey::AnchorIds`, kept in instance storage. */
export function readAnchorIds(instance: xdr.LedgerEntryData): string[] {
  const val = contractDataVal(instance);
  if (val.type !== 'scvContractInstance') throw new Error(`expected a contract instance, got ${val.type}`);
  const wanted = enumKey('AnchorIds').toXDR('base64');
  const entry = (val.instance.storage ?? []).find((e) => e.key.toXDR('base64') === wanted);
  return entry ? (scValToNative(entry.val) as string[]).map(String) : [];
}

/** A unit enum variant decodes as `[name]`. */
const tag = (v: unknown) => String(Array.isArray(v) ? v[0] : v);

export interface AnchorInfo {
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
