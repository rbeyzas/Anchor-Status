import type { OnboardingFile } from './onboarding';
import type { TestnetOnboardingFile } from './onboarding-testnet';

/** Each network's applications, served beside anchor-status.json on the
 * collector host and fetched server-side for the same reason (plain HTTP). */
const beside = (file: string) => (process.env.ANCHOR_STATUS_URL ?? '').replace(/anchor-status\.json$/, file);
const MAINNET_URL = process.env.ONBOARDING_STATUS_URL ?? beside('onboarding.json');
const TESTNET_URL = process.env.ONBOARDING_TESTNET_STATUS_URL ?? beside('onboarding-testnet.json');
const FETCH_TIMEOUT_MS = Number(process.env.HISTORY_FETCH_TIMEOUT_MS ?? '5000');

async function fetchFile<T extends { candidates: unknown[] }>(url: string, name: string): Promise<T | null> {
  if (!url || !url.endsWith(name)) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 60 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = (await res.json()) as T;
    if (!Array.isArray(parsed?.candidates)) throw new Error('unrecognized format');
    return parsed;
  } catch (err) {
    console.warn(`[dashboard] applications unavailable (${url}):`, (err as Error).message);
    return null;
  }
}

export async function fetchOnboarding(): Promise<OnboardingFile | null> {
  const f = await fetchFile<OnboardingFile>(MAINNET_URL, 'onboarding.json');
  return f && typeof f.thresholds === 'object' ? f : null;
}

export const fetchTestnetOnboarding = () => fetchFile<TestnetOnboardingFile>(TESTNET_URL, 'onboarding-testnet.json');
