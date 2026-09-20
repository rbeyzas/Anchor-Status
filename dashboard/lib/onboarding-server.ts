import type { OnboardingFile } from './onboarding';
import type { TestnetOnboardingFile } from './onboarding-testnet';
import type { AnchorViewModel } from './types';

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

/** Ids of anchors that came in through /apply. Read from the applications
 * files rather than from anchors.json because they are already published
 * for both networks and already fetched here; adding an `origin` field to
 * the anchor list and threading it through the status file would need
 * changes in two probes for the same answer. `already_tracked` is left out
 * on purpose: that anchor was measured before anyone applied for it. */
export function acceptedAnchorIds(...files: Array<{ candidates: Array<{ status: string; anchor_id?: string }> } | null>): Set<string> {
  const ids = files.flatMap((f) => f?.candidates ?? []).flatMap((c) => (c.status === 'accepted' && c.anchor_id ? [c.anchor_id] : []));
  return new Set(ids);
}

export async function fetchImportedAnchorIds(): Promise<Set<string>> {
  // Both files are optional enrichment: a missing one just means no tag.
  return acceptedAnchorIds(...(await Promise.all([fetchOnboarding(), fetchTestnetOnboarding()])));
}

/** Tags the anchors in `ids` so the card can say they were imported. */
export function mergeImportedInto(anchors: AnchorViewModel[], ids: Set<string>): AnchorViewModel[] {
  return anchors.map((a) => (ids.has(a.anchorId) ? { ...a, imported: true } : a));
}
