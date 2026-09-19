import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendSubmission,
  decideSubmission,
  ingestSubmissions,
  normalizeDomainInput,
  readSubmissions,
  type OnboardingCandidate,
  type OnboardingFile,
} from './candidates.js';

describe('normalizeDomainInput', () => {
  it('reduces a pasted URL to its hostname', () => {
    expect(normalizeDomainInput('https://Anchor.Example.com/.well-known/stellar.toml')).toBe('anchor.example.com');
    expect(normalizeDomainInput('  example.org.  ')).toBe('example.org');
    expect(normalizeDomainInput('example.com?x=1')).toBe('example.com');
  });

  it('refuses anything that is not a plain public hostname', () => {
    for (const bad of [
      '',
      'localhost',
      '127.0.0.1',
      'http://10.0.0.1/',
      'example.com:8080',
      'user@example.com',
      'exa mple.com',
      '-bad.example.com',
      '[::1]',
      'a'.repeat(300) + '.com',
      42,
      null,
    ]) {
      expect(normalizeDomainInput(bad), String(bad)).toBeNull();
    }
  });
});

const file = (candidates: OnboardingCandidate[], ingested_through?: string): OnboardingFile => ({
  updated_at: '2026-09-19T00:00:00Z',
  ...(ingested_through ? { ingested_through } : {}),
  thresholds: { min_age_days: 7, min_transfers: 100 },
  candidates,
});

const cand = (domain: string, status: OnboardingCandidate['status'], extra: Partial<OnboardingCandidate> = {}): OnboardingCandidate => ({
  domain,
  status,
  submitted_at: '2026-09-18T00:00:00Z',
  attempts: 0,
  checks: [],
  ...extra,
});

describe('decideSubmission', () => {
  const now = new Date('2026-09-19T12:00:00Z');

  it('accepts a domain it has never seen', () => {
    expect(decideSubmission('a.com', null, [], now, 24)).toEqual({ kind: 'new' });
  });

  it('reports a submission the round has not read yet as pending', () => {
    const subs = [{ domain: 'a.com', submitted_at: '2026-09-19T11:00:00Z' }];
    expect(decideSubmission('a.com', file([], '2026-09-19T10:00:00Z'), subs, now, 24)).toEqual({ kind: 'existing', status: 'pending' });
  });

  it('never queues a received, accepted or already-tracked domain twice', () => {
    for (const status of ['received', 'accepted', 'already_tracked'] as const) {
      expect(decideSubmission('a.com', file([cand('a.com', status)]), [], now, 24)).toEqual({ kind: 'existing', status });
    }
  });

  it('lets a rejected domain apply again only after the cooldown', () => {
    const recent = file([cand('a.com', 'rejected', { checked_at: '2026-09-19T06:00:00Z' })]);
    expect(decideSubmission('a.com', recent, [], now, 24)).toEqual({ kind: 'cooldown', retry_after: '2026-09-20T06:00:00.000Z' });
    const old = file([cand('a.com', 'rejected', { checked_at: '2026-09-18T06:00:00Z' })]);
    expect(decideSubmission('a.com', old, [], now, 24)).toEqual({ kind: 'new' });
  });
});

describe('ingestSubmissions', () => {
  it('adds new domains as received and advances the watermark', () => {
    const subs = [
      { domain: 'a.com', submitted_at: '2026-09-19T01:00:00Z' },
      { domain: 'b.com', submitted_at: '2026-09-19T02:00:00Z' },
    ];
    const { candidates, ingestedThrough } = ingestSubmissions([], subs);
    expect(candidates.map((c) => [c.domain, c.status])).toEqual([
      ['b.com', 'received'],
      ['a.com', 'received'],
    ]);
    expect(ingestedThrough).toBe('2026-09-19T02:00:00Z');
  });

  it('ignores submissions already read', () => {
    const subs = [{ domain: 'a.com', submitted_at: '2026-09-19T01:00:00Z' }];
    const { candidates } = ingestSubmissions([], subs, '2026-09-19T01:00:00Z');
    expect(candidates).toEqual([]);
  });

  it('restarts a rejected domain submitted again after its check, and nothing else', () => {
    const existing = [
      cand('a.com', 'rejected', { checked_at: '2026-09-18T05:00:00Z', reason: 'too new', attempts: 2 }),
      cand('b.com', 'accepted', { anchor_id: 'b_com' }),
    ];
    const subs = [
      { domain: 'a.com', submitted_at: '2026-09-19T01:00:00Z' },
      { domain: 'b.com', submitted_at: '2026-09-19T01:30:00Z' },
    ];
    const { candidates } = ingestSubmissions(existing, subs, '2026-09-18T23:00:00Z');
    const a = candidates.find((c) => c.domain === 'a.com')!;
    expect(a).toMatchObject({ status: 'received', attempts: 0, submitted_at: '2026-09-19T01:00:00Z' });
    expect(a.reason).toBeUndefined();
    expect(candidates.find((c) => c.domain === 'b.com')!.status).toBe('accepted');
  });
});

describe('submissions file', () => {
  it('round-trips, skipping lines that do not parse or validate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-'));
    const p = path.join(dir, 'submissions.jsonl');
    appendSubmission(p, { domain: 'a.com', submitted_at: '2026-09-19T01:00:00Z' });
    fs.appendFileSync(p, 'not json\n{"domain":"localhost","submitted_at":"x"}\n');
    appendSubmission(p, { domain: 'b.com', submitted_at: '2026-09-19T02:00:00Z' });
    expect(readSubmissions(p).map((s) => s.domain)).toEqual(['a.com', 'b.com']);
  });
});
