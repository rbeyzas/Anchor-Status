export interface ScorePoint {
  /** ISO 8601, from the ledger close time. */
  timestamp: string;
  score: number;
  /** SHA-256 (hex) of the evidence document published with this report. */
  evidence?: string;
}

export interface SlashEvent {
  timestamp: string;
  /** Amount slashed, in stroops (converted for display by the dashboard). */
  amountStroops: string;
}

/** A change in PerformanceOracle's risk verdict for one anchor. */
export interface RiskEvent {
  timestamp: string;
  /** "None" when the anchor left risk. */
  riskReason: string;
  score: number;
  trend: string;
}

export interface AnchorArchive {
  scoreHistory: ScorePoint[];
  /** Only from the oracle version that slashed; nothing new is ever added. */
  slashEvents: SlashEvent[];
  /** Absent in archives written before risk tracking existed. */
  riskEvents?: RiskEvent[];
}

/** The persisted file. `anchors` grows forever; nothing is ever dropped. */
export interface Archive {
  /** Schema version, so a future format change can migrate rather than reset. */
  version: 1;
  updatedAt: string;
  anchors: Record<string, AnchorArchive>;
}

export function emptyArchive(): Archive {
  return { version: 1, updatedAt: new Date(0).toISOString(), anchors: {} };
}
