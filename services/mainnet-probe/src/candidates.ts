// Self-service onboarding: anchors applying to be measured. Two files, so
// that the always-on intake server and the cron round never write the same
// file: the intake only appends to submissions.jsonl; the cron round is the
// only writer of onboarding.json, which is published as-is (nothing in it is
// private: a domain its owner submitted, and what we measured).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type CandidateStatus = 'received' | 'accepted' | 'rejected' | 'already_tracked';

export type CheckName = 'public_host' | 'stellar_toml' | 'network' | 'transfer_server' | 'live_probe' | 'issuer_age' | 'transfer_count';

export interface CheckResult {
  name: CheckName;
  /** false: failed, the reason to reject. null: does not apply to this anchor. */
  passed: boolean | null;
  /** What was measured, against which threshold, in a sentence. */
  detail: string;
  value?: number;
  threshold?: number;
}

export interface OnboardingCandidate {
  domain: string;
  status: CandidateStatus;
  submitted_at: string;
  checked_at?: string;
  /** Rounds that could not decide because the failure was on our side. */
  attempts: number;
  /** The tracked anchor, once accepted or when it already was. */
  anchor_id?: string;
  name?: string;
  checks: CheckResult[];
  /** One line, when rejected. */
  reason?: string;
}

export interface OnboardingFile {
  updated_at: string;
  /** Latest submitted_at read from submissions.jsonl: anything later is unread. */
  ingested_through?: string;
  thresholds: { min_age_days: number; min_transfers: number };
  candidates: OnboardingCandidate[];
}

export interface Submission {
  domain: string;
  submitted_at: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Shared by the cron round and the intake server, which loads no .env of
 * its own (it is the one process facing the internet, and needs no secret). */
export function resolveOnboardingDir(): string {
  return path.resolve(__dirname, '../../..', process.env.ONBOARDING_DIR ?? 'services/mainnet-probe/output/onboarding');
}

export const onboardingPaths = (dir: string) => ({
  submissions: path.join(dir, 'submissions.jsonl'),
  candidates: path.join(dir, 'onboarding.json'),
});

// A hostname with a public-looking TLD, 253 characters at most. No ports,
// paths, IP literals or single-label names: we only ever fetch
// https://<domain>/.well-known/stellar.toml from it.
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

export function loadOnboardingFile(filePath: string): OnboardingFile | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as OnboardingFile;
  } catch {
    return null;
  }
}

export function saveOnboardingFile(filePath: string, file: OnboardingFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, filePath);
}

export function readSubmissions(filePath: string): Submission[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .flatMap((line) => {
      try {
        const s = JSON.parse(line) as Submission;
        const domain = normalizeDomainInput(s.domain);
        return domain && typeof s.submitted_at === 'string' ? [{ domain, submitted_at: s.submitted_at }] : [];
      } catch {
        return [];
      }
    });
}

export function appendSubmission(filePath: string, s: Submission): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(s)}\n`);
}

const HOUR_MS = 60 * 60 * 1000;

export type Decision =
  | { kind: 'new' }
  | { kind: 'existing'; status: CandidateStatus | 'pending' }
  | { kind: 'cooldown'; retry_after: string };

/**
 * What a new submission of `domain` means, given what is already known. A
 * domain is checked once: again only once it was rejected, and not sooner
 * than `cooldownHours` after that check (it is what changes an age or a
 * transfer count). `pending` is a submission the cron round has not read yet.
 */
export function decideSubmission(
  domain: string,
  file: OnboardingFile | null,
  submissions: Submission[],
  now: Date,
  cooldownHours: number,
): Decision {
  const existing = file?.candidates.find((c) => c.domain === domain);
  const readUpTo = file?.ingested_through ?? '';
  if (submissions.some((s) => s.domain === domain && s.submitted_at > readUpTo)) return { kind: 'existing', status: 'pending' };
  if (!existing) return { kind: 'new' };
  if (existing.status !== 'rejected') return { kind: 'existing', status: existing.status };
  const retryAt = Date.parse(existing.checked_at ?? existing.submitted_at) + cooldownHours * HOUR_MS;
  return now.getTime() >= retryAt ? { kind: 'new' } : { kind: 'cooldown', retry_after: new Date(retryAt).toISOString() };
}

/** Folds the unread submissions into the candidate list: a new domain, or a
 * rejected one submitted again after its check, starts over as received. */
export function ingestSubmissions(
  candidates: OnboardingCandidate[],
  submissions: Submission[],
  ingestedThrough = '',
): { candidates: OnboardingCandidate[]; ingestedThrough: string } {
  const byDomain = new Map(candidates.map((c) => [c.domain, c]));
  const unread = submissions
    .filter((s) => s.submitted_at > ingestedThrough)
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  for (const s of unread) {
    const c = byDomain.get(s.domain);
    const resubmitted = c?.status === 'rejected' && s.submitted_at > (c.checked_at ?? c.submitted_at);
    if (!c || resubmitted) {
      byDomain.set(s.domain, { domain: s.domain, status: 'received', submitted_at: s.submitted_at, attempts: 0, checks: [] });
    }
  }
  return {
    candidates: Array.from(byDomain.values()).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)),
    ingestedThrough: unread.length ? unread[unread.length - 1].submitted_at : ingestedThrough,
  };
}
