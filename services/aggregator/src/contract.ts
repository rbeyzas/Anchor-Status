import { contract, Keypair } from '@stellar/stellar-sdk';
import { config } from './config.js';
import type { NormalizedReport, SourceType } from './types.js';
import type { ScoreCard } from './scoring/types.js';

const clientCache = new Map<string, Promise<contract.Client>>();

function getReporterClient(sourceType: SourceType): Promise<contract.Client> {
  const secretKey = config.reporterSecretKeys[sourceType]();
  const cacheKey = `${sourceType}:${secretKey}`;

  let cached = clientCache.get(cacheKey);
  if (!cached) {
    const keypair = Keypair.fromSecret(secretKey);
    cached = contract.Client.from({
      contractId: config.performanceOracleContractId(),
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      publicKey: keypair.publicKey(),
      signTransaction: new contract.KeypairSigner(keypair, config.networkPassphrase),
    });
    clientCache.set(cacheKey, cached);
  }
  return cached;
}

/** Rust's u64 has no fractional part; we round settlement_seconds and floor
 * the timestamp to whole seconds before sending, since the contract's
 * `submit_report` takes both as u64. */
function toContractArgs(report: NormalizedReport, reporterPublicKey: string) {
  return {
    reporter: reporterPublicKey,
    anchor_id: report.anchor_id,
    success: report.success,
    settlement_seconds: BigInt(Math.max(0, Math.round(report.settlement_seconds))),
    timestamp: BigInt(Math.floor(new Date(report.timestamp).getTime() / 1000)),
    source_type: { tag: report.source_type } as unknown,
  };
}

/** Submits one report to PerformanceOracle.submit_report() on testnet,
 * signed by the reporter authorized for that report's source_type. */
export async function submitReport(report: NormalizedReport): Promise<void> {
  const client = await getReporterClient(report.source_type);
  const reporterPublicKey = Keypair.fromSecret(
    config.reporterSecretKeys[report.source_type](),
  ).publicKey();

  const args = toContractArgs(report, reporterPublicKey);
  // The dynamically-generated client exposes one method per contract
  // function; TS can't know its shape statically since it's fetched from
  // the on-chain spec at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  // With evidence, the hash is published in the on-chain report event, so the
  // score change and the document proving it are tied together.
  const assembled = report.evidence_hash
    ? await c.submit_report_with_evidence({ ...args, evidence: Buffer.from(report.evidence_hash, 'hex') })
    : await c.submit_report(args);
  await assembled.signAndSend();
}

/** Thrown when the deployed oracle predates score cards. */
export class ScoreCardsUnsupported extends Error {}

/**
 * Publishes a score card with PerformanceOracle.publish_score_card, signed
 * by the reporter of the anchor's source type (the contract checks it
 * against the source type in the registry).
 */
export async function publishScoreCard(
  anchorId: string,
  card: ScoreCard,
  inputsHash: string,
  sourceType: 'RealMainnet' | 'RealTestnet' = 'RealMainnet',
): Promise<void> {
  const client = await getReporterClient(sourceType);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  if (typeof c.publish_score_card !== 'function') throw new ScoreCardsUnsupported('the oracle has no publish_score_card yet');
  const reporter = Keypair.fromSecret(config.reporterSecretKeys[sourceType]()).publicKey();
  const assembled = await c.publish_score_card({
    reporter,
    anchor_id: anchorId,
    card: {
      score: card.score,
      availability: card.availability,
      speed: card.speed,
      integrity: card.integrity,
      market: card.market ?? undefined,
      confidence: card.confidence,
      flags: card.flags,
      window_end: BigInt(card.window_end),
      methodology_version: card.methodology_version,
      inputs_hash: Buffer.from(inputsHash, 'hex'),
    },
  });
  await assembled.signAndSend();
}
