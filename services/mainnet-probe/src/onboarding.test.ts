import { describe, expect, it } from 'vitest';
import type { MainnetAnchor } from './anchors.js';
import type { IssuerRecord } from './issuers.js';
import { cleanName, evaluateCandidate, plainError, uniqueAnchorId, type OnboardingDeps } from './onboarding.js';
import type { MainnetProbeResult } from './probe.js';
import type { AnchorToml } from './toml.js';

const NOW = new Date('2026-09-19T12:00:00Z');
const thresholds = { minAgeDays: 7, minTransfers: 100 };
const ISSUER = 'GISSUERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER = 'GCIRCLEBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

const toml = (extra: Partial<AnchorToml> = {}): AnchorToml => ({
  orgName: 'New Anchor Ltd',
  sep24: 'https://api.new-anchor.com/sep24',
  currencies: [{ code: 'NUSD', issuer: ISSUER }],
  ...extra,
});

const probeOk = (target: { anchor_id: string; domain: string }): MainnetProbeResult => ({
  ...target,
  source_type: 'RealMainnet',
  timestamp: NOW.toISOString(),
  success: true,
  settlement_seconds: 2,
  stages: { toml: { ok: true, ms: 100 }, info: { ok: true, ms: 100 } },
});

const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function deps(over: Partial<OnboardingDeps> = {}): OnboardingDeps {
  return {
    isPublic: async () => true,
    fetchToml: async () => toml(),
    probe: async (t) => probeOk(t),
    lookupIssuer: async (issuer): Promise<IssuerRecord> =>
      issuer === ISSUER
        ? { checked_at: NOW.toISOString(), exists: true, home_domain: 'new-anchor.com', created_at: daysAgo(30) }
        : { checked_at: NOW.toISOString(), exists: true, home_domain: 'centre.io', created_at: daysAgo(2000) },
    assetPayments: async () => 530_674,
    networkDown: async () => false,
    now: NOW,
    ...over,
  };
}

const known: MainnetAnchor[] = [
  { anchor_id: 'old_anchor_com', name: 'Old', domain: 'old-anchor.com', transfer_host: 'api.old-anchor.com', first_seen: daysAgo(90) },
];

describe('evaluateCandidate', () => {
  it('accepts an anchor that clears every threshold', async () => {
    const ev = await evaluateCandidate('new-anchor.com', known, thresholds, deps());
    expect(ev).toMatchObject({ outcome: 'accepted', anchor_id: 'new_anchor_com', name: 'New Anchor Ltd', transfer_host: 'api.new-anchor.com' });
    expect(ev.checks.map((c) => [c.name, c.passed])).toEqual([
      ['public_host', true],
      ['stellar_toml', true],
      ['transfer_server', true],
      ['live_probe', true],
      ['issuer_age', true],
      ['transfer_count', true],
    ]);
  });

  it('rejects on age and transfers together, reporting both with their numbers', async () => {
    const ev = await evaluateCandidate(
      'new-anchor.com',
      known,
      thresholds,
      deps({
        lookupIssuer: async () => ({ checked_at: '', exists: true, home_domain: 'new-anchor.com', created_at: daysAgo(3) }),
        assetPayments: async () => 12,
      }),
    );
    expect(ev.outcome).toBe('rejected');
    const age = ev.checks.find((c) => c.name === 'issuer_age')!;
    const count = ev.checks.find((c) => c.name === 'transfer_count')!;
    expect(age).toMatchObject({ passed: false, value: 3, threshold: 7 });
    expect(count).toMatchObject({ passed: false, value: 12, threshold: 100 });
    expect(ev.outcome === 'rejected' && ev.reason).toBe('did not pass: issuer age, transfer count');
  });

  it('passes exactly at the thresholds', async () => {
    const ev = await evaluateCandidate(
      'new-anchor.com',
      known,
      thresholds,
      deps({
        lookupIssuer: async () => ({ checked_at: '', exists: true, home_domain: 'new-anchor.com', created_at: daysAgo(7) }),
        assetPayments: async () => 100,
      }),
    );
    expect(ev.outcome).toBe('accepted');
  });

  it('marks age and transfers not applicable when it issues no asset of its own', async () => {
    const ev = await evaluateCandidate(
      'new-anchor.com',
      known,
      thresholds,
      deps({ fetchToml: async () => toml({ currencies: [{ code: 'USDC', issuer: OTHER }] }) }),
    );
    expect(ev.outcome).toBe('accepted');
    expect(ev.checks.filter((c) => c.passed === null).map((c) => c.name)).toEqual(['issuer_age', 'transfer_count']);
  });

  it('adds up payments across its own assets, and stops asking once the threshold is met', async () => {
    const SECOND = 'GSECONDCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const currencies = [
      { code: 'NUSD', issuer: ISSUER },
      { code: 'NEUR', issuer: SECOND },
      { code: 'NGBP', issuer: SECOND },
    ];
    const asked: string[] = [];
    const ev = await evaluateCandidate(
      'new-anchor.com',
      known,
      thresholds,
      deps({
        fetchToml: async () => toml({ currencies }),
        lookupIssuer: async () => ({ checked_at: '', exists: true, home_domain: 'new-anchor.com', created_at: daysAgo(30) }),
        assetPayments: async (code) => {
          asked.push(code);
          return 60;
        },
      }),
    );
    expect(asked).toEqual(['NUSD', 'NEUR']);
    expect(ev.checks.find((c) => c.name === 'transfer_count')).toMatchObject({ passed: true, value: 120 });
  });

  it('counts only the assets it issues itself', async () => {
    const asked: string[] = [];
    await evaluateCandidate(
      'new-anchor.com',
      known,
      thresholds,
      deps({
        fetchToml: async () => toml({ currencies: [{ code: 'NUSD', issuer: ISSUER }, { code: 'USDC', issuer: OTHER }] }),
        assetPayments: async (code) => (asked.push(code), 500),
      }),
    );
    expect(asked).toEqual(['NUSD']);
  });

  it('says a domain or an operator is already measured, without probing it', async () => {
    let probed = false;
    const d = deps({ probe: async (t) => ((probed = true), probeOk(t)) });
    expect(await evaluateCandidate('old-anchor.com', known, thresholds, d)).toMatchObject({ outcome: 'already_tracked', anchor_id: 'old_anchor_com' });
    const alias = await evaluateCandidate(
      'old-anchor.io',
      known,
      thresholds,
      deps({ ...d, fetchToml: async () => toml({ sep24: 'https://api.old-anchor.com/sep24' }) }),
    );
    expect(alias).toMatchObject({ outcome: 'already_tracked', anchor_id: 'old_anchor_com' });
    expect(probed).toBe(false);
  });

  it('rejects a name that resolves into a private network before fetching anything', async () => {
    let fetched = false;
    const ev = await evaluateCandidate(
      'internal.example.com',
      known,
      thresholds,
      deps({ isPublic: async () => false, fetchToml: async () => ((fetched = true), toml()) }),
    );
    expect(ev.outcome).toBe('rejected');
    expect(fetched).toBe(false);
  });

  it('rejects a toml with no transfer server, and a failing live check', async () => {
    const noServer = await evaluateCandidate('new-anchor.com', known, thresholds, deps({ fetchToml: async () => toml({ sep24: undefined }) }));
    expect(noServer).toMatchObject({ outcome: 'rejected', reason: 'no SEP-6 or SEP-24 transfer server in stellar.toml' });

    const failing = await evaluateCandidate(
      'new-anchor.com',
      known,
      thresholds,
      deps({ probe: async (t) => ({ ...probeOk(t), success: false, failed_stage: 'token', error: 'HTTP 500 from /auth' }) }),
    );
    expect(failing.outcome).toBe('rejected');
    expect(failing.checks.find((c) => c.name === 'live_probe')).toMatchObject({ passed: false });
  });

  it('decides nothing when the failure was ours', async () => {
    const down = { networkDown: async () => true };
    expect((await evaluateCandidate('new-anchor.com', known, thresholds, deps({ ...down, fetchToml: async () => { throw new Error('fetch failed'); } }))).outcome).toBe('inconclusive');
    expect((await evaluateCandidate('new-anchor.com', known, thresholds, deps({ ...down, probe: async (t) => ({ ...probeOk(t), success: false }) }))).outcome).toBe('inconclusive');
    const horizon = await evaluateCandidate(
      'new-anchor.com',
      known,
      thresholds,
      deps({ lookupIssuer: async () => { throw new Error('Horizon answered 503'); } }),
    );
    expect(horizon.outcome).toBe('inconclusive');
  });

  it('still rejects on a definite failure even when another check could not run', async () => {
    const ev = await evaluateCandidate(
      'new-anchor.com',
      known,
      thresholds,
      deps({
        lookupIssuer: async () => ({ checked_at: '', exists: true, home_domain: 'new-anchor.com', created_at: daysAgo(1) }),
        assetPayments: async () => { throw new Error('StellarExpert answered 503'); },
      }),
    );
    expect(ev.outcome).toBe('rejected');
  });
});

describe('helpers', () => {
  it('uniqueAnchorId avoids an id another domain already maps to', () => {
    const taken: MainnetAnchor[] = [{ anchor_id: 'a_b_com', name: 'x', domain: 'a-b.com', first_seen: '' }];
    expect(uniqueAnchorId('a.b.com', taken)).toBe('a_b_com_2');
    expect(uniqueAnchorId('c.com', taken)).toBe('c_com');
    const long = 'a'.repeat(40) + '.com';
    const id = uniqueAnchorId(long, [{ anchor_id: uniqueAnchorId(long, []), name: 'x', domain: 'y', first_seen: '' }]);
    expect(id.length).toBeLessThanOrEqual(32);
    expect(id.endsWith('_2')).toBe(true);
  });

  it('plainError keeps the status and drops the HTML error page', () => {
    expect(plainError(new Error('HTTP 404 from https://circle.com/.well-known/stellar.toml: <!DOCTYPE html><html>'))).toBe(
      'HTTP 404 from https://circle.com/.well-known/stellar.toml',
    );
    expect(plainError('SEP-10 token exchange failed: HTTP 500 from https://x.com/auth: serverError\nstack')).toBe(
      'SEP-10 token exchange failed: HTTP 500 from https://x.com/auth: serverError',
    );
  });

  it('cleanName strips control characters and falls back to the domain', () => {
    expect(cleanName('  Acme  Pay\n', 'acme.com')).toBe('Acme Pay');
    expect(cleanName(undefined, 'acme.com')).toBe('acme.com');
    expect(cleanName('x'.repeat(100), 'acme.com')).toHaveLength(64);
  });
});
