import { describe, expect, it } from 'vitest';
import { loadTestnetAnchors, testnetAnchorId, type TestnetAnchor } from './anchors.js';
import type { FlowResult } from './flow.js';
import { cleanName, evaluateTestnetCandidate, type OnboardingDeps } from './onboarding.js';

const REF: TestnetAnchor = { anchor_id: 'stellar_test_anchor', name: 'ref', domain: 'testanchor.stellar.org', first_seen: '', origin: 'reference' };

const passing: FlowResult = {
  success: true,
  inconclusive: false,
  protocol: 'sep6',
  asset: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  orgName: 'TR Mock Anchor (testnet sandbox)',
  seconds: 32,
  final_transaction_status: 'completed',
  evidence: {},
  steps: [
    { step: 'toml', ok: true, detail: 'ok' },
    { step: 'deposit_onchain', ok: true, detail: '2.0396090 USDC on the ledger', tx: 'a'.repeat(64), amount: '2.0396090' },
    { step: 'withdraw_onchain', ok: true, detail: 'paid to the anchor', tx: 'b'.repeat(64) },
  ],
};

const deps = (over: Partial<OnboardingDeps> = {}): OnboardingDeps => ({
  isPublic: async () => true,
  runFlow: async () => passing,
  networkDown: async () => false,
  ...over,
});

describe('evaluateTestnetCandidate', () => {
  it('admits an anchor whose money flow passes, under a _testnet id that avoids the taken ones', async () => {
    const ev = await evaluateTestnetCandidate('tr-mock-anchor.fly.dev', [REF], new Set(['tr_mock_anchor_fly_dev']), deps());
    expect(ev).toMatchObject({
      outcome: 'accepted',
      anchor: { anchor_id: 'tr_mock_anchor_fly_dev_testnet', name: 'TR Mock Anchor (testnet sandbox)', domain: 'tr-mock-anchor.fly.dev', asset_code: 'USDC' },
    });
    expect(ev.checks[0]).toMatchObject({ name: 'public_host', passed: true });
    expect(ev.checks.find((c) => c.name === 'deposit_onchain')).toMatchObject({ passed: true, tx: 'a'.repeat(64) });
  });

  it('rejects with the failing step and its reason', async () => {
    const failing: FlowResult = {
      ...passing,
      success: false,
      error: 'no payment',
      steps: [{ step: 'toml', ok: true, detail: 'ok' }, { step: 'deposit_onchain', ok: false, detail: 'no payment of USDC to us' }],
    };
    const ev = await evaluateTestnetCandidate('x.test', [REF], new Set(), deps({ runFlow: async () => failing }));
    expect(ev).toMatchObject({ outcome: 'rejected', reason: 'failed at deposit onchain: no payment of USDC to us' });
  });

  it('decides nothing when the failure was ours', async () => {
    const ours: FlowResult = { ...passing, success: false, inconclusive: true, error: 'Friendbot funding failed', steps: [] };
    expect((await evaluateTestnetCandidate('x.test', [REF], new Set(), deps({ runFlow: async () => ours }))).outcome).toBe('inconclusive');
  });

  it('never runs the flow for a private name or one already measured', async () => {
    let ran = false;
    const d = deps({ runFlow: async () => ((ran = true), passing) });
    expect((await evaluateTestnetCandidate('internal.test', [REF], new Set(), { ...d, isPublic: async () => false })).outcome).toBe('rejected');
    expect((await evaluateTestnetCandidate('testanchor.stellar.org', [REF], new Set(), d)).outcome).toBe('already_tracked');
    expect(ran).toBe(false);
  });
});

describe('testnet anchors', () => {
  it('ids end in _testnet, fit a Symbol, and stay unique', () => {
    expect(testnetAnchorId('tr-mock-anchor.fly.dev', new Set())).toBe('tr_mock_anchor_fly_dev_testnet');
    expect(testnetAnchorId('tr-mock-anchor.fly.dev', new Set(['tr_mock_anchor_fly_dev_testnet']))).toBe('tr_mock_anchor_fly_dev_testnet2');
    const long = testnetAnchorId('a-really-long-subdomain.of-an-anchor.example.com', new Set());
    expect(long.length).toBeLessThanOrEqual(32);
    expect(long.endsWith('_testnet')).toBe(true);
  });

  it('always measures the reference anchor, and never twice', () => {
    expect(loadTestnetAnchors('/nonexistent/file.json', REF)).toEqual([REF]);
  });

  it('cleanName strips control characters', () => {
    expect(cleanName('TR Mock\n', 'x')).toBe('TR Mock');
  });
});
