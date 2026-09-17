export interface ScorePoint {
  /** ISO 8601, from the ledger close time. */
  timestamp: string;
  score: number;
}

export interface SlashEvent {
  timestamp: string;
  /** Amount slashed, in stroops (converted for display by the dashboard). */
  amountStroops: string;
}

export interface AnchorArchive {
  scoreHistory: ScorePoint[];
  slashEvents: SlashEvent[];
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
