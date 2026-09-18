export type ProbeStatus = 'success' | 'failure';

export interface ProbeResult {
  anchor_id: string;
  domain: string;
  source_type: 'RealTestnet';
  success: boolean;
  settlement_seconds: number;
  timestamp: string; // ISO 8601, when the probe was initiated
  final_transaction_status: string | null;
  /** SHA-256 of the published evidence document for this run. */
  evidence_hash?: string;
  /** True when the probe itself failed (e.g. headless UI never rendered)
   * before the anchor could succeed or fail. Never submitted on-chain. */
  inconclusive?: boolean;
  error?: string;
}

export interface StellarTomlInfo {
  webAuthEndpoint: string;
  signingKey: string;
  transferServerSep24: string;
  /** [[CURRENCIES]] entries that declare an on-chain issuer. */
  currencies: Array<{ code: string; issuer: string }>;
}
