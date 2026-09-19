// Self-service applications: the shape of the collector's public
// onboarding.json, the words the page uses for it, and the domain rule the
// form and the /api/onboarding proxy apply (the intake applies it again: it
// is the trust boundary). Safe to import from client components.

export type ApplicationStatus = 'received' | 'accepted' | 'rejected' | 'already_tracked';
export type CheckName = 'public_host' | 'stellar_toml' | 'transfer_server' | 'live_probe' | 'issuer_age' | 'transfer_count';

export interface ApplicationCheck {
  name: CheckName;
  /** null: does not apply to this anchor. */
  passed: boolean | null;
  detail: string;
  value?: number;
  threshold?: number;
}

export interface Application {
  domain: string;
  status: ApplicationStatus;
  submitted_at: string;
  checked_at?: string;
  attempts: number;
  anchor_id?: string;
  name?: string;
  checks: ApplicationCheck[];
  reason?: string;
}

export interface OnboardingFile {
  updated_at: string;
  thresholds: { min_age_days: number; min_transfers: number };
  candidates: Application[];
}

// Same rule as services/mainnet-probe/src/candidates.ts.
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOSTNAME = new RegExp(`^(?=.{4,253}$)(?:${LABEL}\\.)+[a-z]{2,63}$`);

/** "https://Example.com/.well-known/stellar.toml" → "example.com"; null when
 * what is left is not a plain public hostname. */
export function normalizeDomainInput(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (s.length === 0 || s.length > 300) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0];
  s = s.replace(/\.$/, '');
  if (s.includes('@') || s.includes(':')) return null;
  return HOSTNAME.test(s) ? s : null;
}

export const CHECK_LABEL: Record<CheckName, string> = {
  public_host: 'Public domain',
  stellar_toml: 'stellar.toml',
  transfer_server: 'Transfer server',
  live_probe: 'Live check',
  issuer_age: 'Issuer age',
  transfer_count: 'Payments',
};

export const STATUS_COPY: Record<ApplicationStatus, { label: string; tone: 'signal' | 'pulse' | 'amber' | 'danger' | 'neutral' }> = {
  received: { label: 'Waiting for a check', tone: 'neutral' },
  accepted: { label: 'Admitted', tone: 'signal' },
  already_tracked: { label: 'Already measured', tone: 'pulse' },
  rejected: { label: 'Not admitted', tone: 'danger' },
};
