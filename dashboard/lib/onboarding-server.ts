import type { OnboardingFile } from './onboarding';

/** Served beside anchor-status.json on the collector host, fetched
 * server-side for the same reason (plain HTTP). */
const ONBOARDING_URL =
  process.env.ONBOARDING_STATUS_URL ?? (process.env.ANCHOR_STATUS_URL ?? '').replace(/anchor-status\.json$/, 'onboarding.json');
const FETCH_TIMEOUT_MS = Number(process.env.HISTORY_FETCH_TIMEOUT_MS ?? '5000');

export async function fetchOnboarding(): Promise<OnboardingFile | null> {
  if (!ONBOARDING_URL || !/onboarding\.json$/.test(ONBOARDING_URL)) return null;
  try {
    const res = await fetch(ONBOARDING_URL, { next: { revalidate: 60 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = (await res.json()) as OnboardingFile;
    if (!Array.isArray(parsed?.candidates) || typeof parsed?.thresholds !== 'object') throw new Error('unrecognized format');
    return parsed;
  } catch (err) {
    console.warn(`[dashboard] onboarding status unavailable (${ONBOARDING_URL}):`, (err as Error).message);
    return null;
  }
}
