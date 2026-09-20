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
  /** Which transfer protocol the money flow used. */
  protocol?: 'sep24' | 'sep6';
  asset?: string;
  /** Every step, with its time and, for payments, the ledger transaction. */
  steps?: FlowStep[];
  /** The same public-surface check mainnet anchors get (stellar.toml, /info,
   * SEP-10, deposit start, TLS), run before the money flow. */
  public_checks?: Record<string, unknown>;
}

export interface StellarTomlInfo {
  webAuthEndpoint: string;
  signingKey: string;
  transferServerSep24?: string;
  /** SEP-6 TRANSFER_SERVER. */
  transferServerSep6?: string;
  /** [[CURRENCIES]] entries that declare an on-chain issuer. */
  currencies: Array<{ code: string; issuer: string }>;
  /** ACCOUNTS: the anchor's own Stellar accounts (a deposit is paid from one). */
  accounts: string[];
  networkPassphrase?: string;
  orgName?: string;
}

/** One step of the money-flow check, in order. */
export type FlowStepName =
  | 'toml'
  | 'account'
  | 'trustline'
  | 'sep10'
  | 'deposit'
  | 'deposit_settled'
  | 'deposit_onchain'
  | 'withdraw'
  | 'withdraw_onchain'
  | 'withdraw_settled';

export interface FlowStep {
  step: FlowStepName;
  /** null: does not apply to this anchor. */
  ok: boolean | null;
  ms?: number;
  detail: string;
  /** A Stellar transaction anyone can look up. */
  tx?: string;
  amount?: string;
}
