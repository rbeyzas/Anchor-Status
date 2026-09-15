export interface AnchorConfig {
  anchor_id: string;
  name: string;
  domain: string;
  distribution_account: string;
}

export interface AnchorsFile {
  anchors: AnchorConfig[];
}

/** A single payment-like operation pulled from Horizon's /payments endpoint. */
export interface PaymentRecord {
  createdAt: string; // ISO 8601
  assetCode: string; // "XLM" for native
  amount: number;
}

export interface VolumeStats {
  txCount: number;
  avgAmount: number;
  totalAmount: number;
  avgFrequencyPerDay: number;
}

export interface AssetVolume extends VolumeStats {
  assetCode: string;
}

export interface Sep24Currency {
  code: string;
  minAmount?: number;
  maxAmount?: number;
  depositEnabled?: boolean;
  withdrawEnabled?: boolean;
}

export interface AnchorInfo {
  transferServerSep24?: string;
  currencies: Sep24Currency[];
}

/** The normalized "base profile" this service produces per anchor. */
export interface BaseProfile {
  anchor_id: string;
  name: string;
  domain: string;
  source_type: 'RealMainnet';
  lookback_days: number;
  overall: VolumeStats;
  by_asset: AssetVolume[];
  anchor_info: AnchorInfo;
  generated_at: string;
}
