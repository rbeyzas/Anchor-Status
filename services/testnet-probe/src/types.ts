export type ProbeStatus = 'success' | 'failure';

export interface ProbeResult {
  anchor_id: string;
  domain: string;
  source_type: 'RealTestnet';
  success: boolean;
  settlement_seconds: number;
  timestamp: string; // ISO 8601, when the probe was initiated
  final_transaction_status: string | null;
  error?: string;
}

export interface StellarTomlInfo {
  webAuthEndpoint: string;
  signingKey: string;
  transferServerSep24: string;
}
