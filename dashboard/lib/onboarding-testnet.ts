// Testnet applications: their own file (onboarding-testnet.json), their own
// checks (a real money flow), apart from mainnet's (lib/onboarding.ts).
// Safe to import from client components.
import type { ApplicationStatus } from './onboarding';

export type TestnetCheckName =
  | 'public_host'
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

export interface TestnetCheck {
  name: TestnetCheckName;
  /** null: does not apply to this anchor. */
  passed: boolean | null;
  detail: string;
  ms?: number;
  /** A testnet ledger transaction anyone can look up. */
  tx?: string;
  amount?: string;
}

export interface TestnetApplication {
  domain: string;
  status: ApplicationStatus;
  submitted_at: string;
  checked_at?: string;
  attempts: number;
  anchor_id?: string;
  name?: string;
  checks: TestnetCheck[];
  reason?: string;
}

export interface TestnetOnboardingFile {
  updated_at: string;
  rule: string;
  candidates: TestnetApplication[];
}

export const TESTNET_CHECK_LABEL: Record<TestnetCheckName, string> = {
  public_host: 'Public domain',
  toml: 'stellar.toml',
  account: 'Test wallet',
  trustline: 'Trustline',
  sep10: 'SEP-10 sign-in',
  deposit: 'Deposit',
  deposit_settled: 'Deposit completed',
  deposit_onchain: 'Deposit on-ledger',
  withdraw: 'Withdrawal',
  withdraw_onchain: 'Withdrawal on-ledger',
  withdraw_settled: 'Withdrawal completed',
};

export const testnetTxUrl = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
