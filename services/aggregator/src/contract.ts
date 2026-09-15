import { contract, Keypair } from '@stellar/stellar-sdk';
import { config } from './config.js';
import type { NormalizedReport, SourceType } from './types.js';

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
  const assembled = await (client as any).submit_report(args);
  await assembled.signAndSend();
}
