// Decides whether a testnet applicant is admitted: its money flow must work
// end to end, once, with every payment on the ledger. Admission adds it to
// the testnet anchor list; register.ts puts it on-chain as RealTestnet and
// the probe runs the same check on it every round from then on.
import { testnetAnchorId, type TestnetAnchor } from './anchors.js';
import type { CheckResult } from './candidates.js';
import type { FlowResult, FlowTarget } from './flow.js';

export const ADMISSION_RULE =
  'A fresh testnet wallet signs in with SEP-10, deposits (SEP-24, or SEP-6 with the sandbox marking the fiat as paid), ' +
  'and, where SEP-6 withdrawal is offered, withdraws it back. Every payment must be on the testnet ledger.';

export interface OnboardingDeps {
  isPublic: (domain: string) => Promise<boolean>;
  runFlow: (target: FlowTarget) => Promise<FlowResult>;
  networkDown: () => Promise<boolean>;
}

export type Evaluation =
  | { outcome: 'accepted'; anchor: Omit<TestnetAnchor, 'first_seen' | 'origin'>; checks: CheckResult[] }
  | { outcome: 'already_tracked'; anchor_id: string; name: string; checks: CheckResult[] }
  | { outcome: 'rejected'; reason: string; checks: CheckResult[]; name?: string }
  | { outcome: 'inconclusive'; reason: string; checks: CheckResult[] };

const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/** A name from someone else's toml, fit for a list and an on-chain String. */
export function cleanName(name: string | undefined, fallback: string): string {
  const cleaned = (name ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
  return cleaned || fallback;
}

export function checksFromFlow(flow: FlowResult): CheckResult[] {
  return flow.steps.map((s) => ({
    name: s.step,
    passed: s.ok,
    detail: s.detail,
    ...(s.ms !== undefined ? { ms: s.ms } : {}),
    ...(s.tx ? { tx: s.tx } : {}),
    ...(s.amount ? { amount: s.amount } : {}),
  }));
}

export async function evaluateTestnetCandidate(
  domain: string,
  known: TestnetAnchor[],
  takenIds: Set<string>,
  deps: OnboardingDeps,
): Promise<Evaluation> {
  const tracked = known.find((a) => a.domain === domain);
  if (tracked) return { outcome: 'already_tracked', anchor_id: tracked.anchor_id, name: tracked.name, checks: [] };

  const checks: CheckResult[] = [];
  if (!(await deps.isPublic(domain))) {
    if (await deps.networkDown()) return { outcome: 'inconclusive', reason: 'our network was down', checks };
    checks.push({ name: 'public_host', passed: false, detail: 'The domain does not resolve, or resolves to a private address.' });
    return { outcome: 'rejected', reason: 'the domain does not resolve to a public address', checks };
  }
  checks.push({ name: 'public_host', passed: true, detail: 'Resolves to a public address.' });

  const anchorId = testnetAnchorId(domain, new Set([...takenIds, ...known.map((a) => a.anchor_id)]));
  const flow = await deps.runFlow({ anchor_id: anchorId, domain });
  checks.push(...checksFromFlow(flow));
  const name = cleanName(flow.orgName, domain);

  if (flow.success) {
    const asset_code = flow.asset?.split(':')[0];
    return { outcome: 'accepted', anchor: { anchor_id: anchorId, name, domain, ...(asset_code ? { asset_code } : {}) }, checks };
  }
  if (flow.inconclusive || (await deps.networkDown())) {
    return { outcome: 'inconclusive', reason: flow.error ?? 'the check failed on our side', checks };
  }
  const failed = flow.steps.find((s) => s.ok === false);
  return {
    outcome: 'rejected',
    reason: failed ? `failed at ${failed.step.replace(/_/g, ' ')}: ${failed.detail}` : (flow.error ?? 'the money flow did not complete'),
    checks,
    name,
  };
}
