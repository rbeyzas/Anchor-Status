import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { HttpError, timedFetch, type Fetch } from './http.js';
import { fetchAnchorToml, type AnchorToml, type TomlCurrency } from './toml.js';
import { sha256Hex } from './evidence.js';
import { checkTls, type TlsResult } from './tls.js';

export type StageName = 'toml' | 'info' | 'challenge' | 'token' | 'initiate';

export interface StageResult {
  ok: boolean;
  ms?: number;
  /** The anchor answered, but declined us by policy (4xx) — e.g. it requires
   * a client_domain or KYC first. Recorded, never counted as an outage. */
  policy?: boolean;
  error?: string;
}

/** Raw integrity observations. Whether each one passes, fails or does not
 * apply is decided by the scorer (docs/SCORING.md section 6.3), which also
 * needs to know which earlier stage failed. */
export interface ProbeChecks {
  /** stellar.toml fetched, parsed, and advertises a SEP-6/24 transfer server. */
  toml_valid: boolean;
  /** The toml response carried Access-Control-Allow-Origin. Absent when no
   * response came back at all. */
  toml_cors?: boolean;
  /** WEB_AUTH_ENDPOINT and SIGNING_KEY are both published. */
  sep10_advertised?: boolean;
  /** The challenge was received and checked: true when signed by the
   * published SIGNING_KEY, false when it was not. Absent when no challenge
   * came back (not advertised, declined by policy, or an HTTP failure). */
  sep10_signature_valid?: boolean;
  /** /info parsed as JSON and lists at least one enabled asset. */
  info_valid?: boolean;
  tls_ok?: boolean;
  tls_days_left?: number;
  tls_error?: string;
  signing_key?: string;
}

export interface MainnetProbeResult {
  anchor_id: string;
  domain: string;
  source_type: 'RealMainnet';
  timestamp: string;
  success: boolean;
  /** Total time spent on the anchor's API, in seconds. */
  settlement_seconds: number;
  failed_stage?: StageName | 'timeout';
  error?: string;
  /** Set by the runner when the failure was ours, not the anchor's. Never submitted. */
  inconclusive?: boolean;
  stages: Partial<Record<StageName, StageResult>>;
  /** The stages this anchor's own toml says a full check should reach:
   * toml and info always, the SEP-10 pair when it publishes an auth
   * endpoint and key, the deposit start when it offers SEP-24 deposits.
   * `ok` stages over these is how deep we could test (confidence). */
  stages_expected?: StageName[];
  checks?: ProbeChecks;
  /** The toml's [[CURRENCIES]], for the issuer verification. */
  assets?: TomlCurrency[];
  /** Raw material for the evidence document; the runner publishes it and
   * replaces it with `evidence_hash` before the result is logged. */
  transcript?: ProbeTranscript;
  /** SHA-256 of the published evidence document. */
  evidence_hash?: string;
}

/** What an outside party needs to check a probe independently. */
export interface ProbeTranscript {
  /** Throwaway wallet key the probe signed in as. */
  probe_account?: string;
  stellar_toml?: { sha256: string; signing_key?: string; web_auth_endpoint?: string; transfer_server?: string };
  info_sha256?: string;
  /** The SEP-10 challenge exactly as the anchor returned it, signed with its
   * SIGNING_KEY: proof, checkable by anyone, that the anchor's auth server
   * answered within the challenge's time bounds. */
  sep10_challenge?: { xdr: string; network_passphrase: string };
}

export interface ProbeTarget {
  anchor_id: string;
  domain: string;
}

export interface ProbeOptions {
  fetchImpl: Fetch;
  requestTimeoutMs: number;
  networkPassphrase: string;
  now?: () => Date;
  /** Injected in tests; the real check opens its own TLS connection. */
  tlsCheck?: (domain: string) => Promise<TlsResult>;
}

class StageFailure extends Error {
  constructor(
    readonly stage: StageName,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The anchor understood the request and declined it (400/401/403/429...):
 * it is up, it just won't serve an anonymous wallet — MoneyGram, for
 * instance, answers "client_domain is required". 404 and 410 are excluded:
 * those mean the advertised endpoint doesn't exist, which is broken, not policy.
 */
export function isPolicyRejection(err: unknown): boolean {
  return err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 404 && err.status !== 410;
}
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** True when a SEP-6/24 /info response lists at least one enabled asset. */
export function infoListsEnabledAsset(info: unknown): boolean {
  const sides = info as { deposit?: Record<string, { enabled?: boolean }>; withdraw?: Record<string, { enabled?: boolean }> } | null;
  return [sides?.deposit, sides?.withdraw].some(
    (side) => side && typeof side === 'object' && Object.values(side).some((v) => v?.enabled !== false),
  );
}

/** First deposit-enabled asset code from a SEP-6/24 /info response. */
export function firstDepositAsset(info: unknown): string | undefined {
  const deposit = (info as { deposit?: Record<string, { enabled?: boolean }> } | null)?.deposit;
  if (!deposit || typeof deposit !== 'object') return undefined;
  return Object.entries(deposit).find(([, v]) => v?.enabled !== false)?.[0];
}

/**
 * Probes one mainnet anchor's public surface without moving funds:
 *
 *   1. SEP-1   fetch stellar.toml                           (required)
 *   2. SEP-6/24 GET /info                                    (required)
 *   3. SEP-10  GET a challenge and check the anchor signed it (required if declared)
 *   4. SEP-10  sign it and exchange it for a token           (extended)
 *   5. SEP-24  start an interactive deposit, never finish it (extended)
 *
 * Any step failing with a 5xx, no answer, or a missing endpoint (404/410) is
 * an outage. A step the anchor declines by policy (see isPolicyRejection)
 * ends the probe as a success: the anchor answered, it just won't serve an
 * anonymous wallet past that point.
 */
export async function probeAnchor(target: ProbeTarget, opts: ProbeOptions): Promise<MainnetProbeResult> {
  // A separate connection, run alongside the probe: its time is not the
  // anchor's API latency and must not be added to settlement_seconds.
  const tls = (opts.tlsCheck ?? ((d) => checkTls(d, opts.requestTimeoutMs)))(target.domain).catch(
    (err): TlsResult => ({ ok: false, error: message(err) }),
  );
  const result = await runProbe(target, opts);
  const t = await tls;
  result.checks = {
    ...result.checks!,
    tls_ok: t.ok,
    ...(t.daysLeft !== undefined ? { tls_days_left: t.daysLeft } : {}),
    ...(t.error ? { tls_error: t.error } : {}),
  };
  return result;
}

async function runProbe(target: ProbeTarget, opts: ProbeOptions): Promise<MainnetProbeResult> {
  const startedAt = (opts.now ?? (() => new Date()))();
  const stages: Partial<Record<StageName, StageResult>> = {};
  const transcript: ProbeTranscript = {};
  const checks: ProbeChecks = { toml_valid: false };
  let expected: StageName[] = ['toml', 'info'];
  let assets: TomlCurrency[] | undefined;
  let totalMs = 0;
  const record = (stage: StageName, ms: number, extra: Omit<StageResult, 'ms'> = { ok: true }) => {
    stages[stage] = { ...extra, ms };
    totalMs += ms;
  };

  const result = (success: boolean, failed?: StageFailure): MainnetProbeResult => ({
    anchor_id: target.anchor_id,
    domain: target.domain,
    source_type: 'RealMainnet',
    timestamp: startedAt.toISOString(),
    success,
    settlement_seconds: totalMs / 1000,
    ...(failed ? { failed_stage: failed.stage, error: failed.message } : {}),
    stages,
    stages_expected: expected,
    checks,
    ...(assets ? { assets } : {}),
    transcript,
  });

  try {
    // 1. SEP-1
    let toml: AnchorToml;
    try {
      const t = await fetchAnchorToml(opts.fetchImpl, target.domain, opts.requestTimeoutMs);
      toml = t.value;
      checks.toml_cors = t.cors;
      assets = toml.currencies;
      if (toml.signingKey) checks.signing_key = toml.signingKey;
      transcript.stellar_toml = {
        sha256: t.sha256,
        ...(toml.signingKey ? { signing_key: toml.signingKey } : {}),
        ...(toml.webAuthEndpoint ? { web_auth_endpoint: toml.webAuthEndpoint } : {}),
        ...((toml.sep24 ?? toml.sep6) ? { transfer_server: toml.sep24 ?? toml.sep6 } : {}),
      };
      record('toml', t.ms);
    } catch (err) {
      stages.toml = { ok: false, error: message(err) };
      // An HTTP error still means the server answered, with or without CORS.
      if (err instanceof HttpError) checks.toml_cors = false;
      throw new StageFailure('toml', `stellar.toml unreachable: ${message(err)}`);
    }
    const transferServer = toml.sep24 ?? toml.sep6;
    if (!transferServer) {
      stages.toml = { ...stages.toml, ok: false, error: 'no TRANSFER_SERVER_SEP0024 or TRANSFER_SERVER' };
      throw new StageFailure('toml', 'stellar.toml no longer advertises a SEP-6/24 transfer server');
    }
    checks.toml_valid = true;
    checks.sep10_advertised = Boolean(toml.webAuthEndpoint && toml.signingKey);
    if (checks.sep10_advertised) expected = ['toml', 'info', 'challenge', 'token'];

    // 2. /info
    let depositAsset: string | undefined;
    try {
      const { value: res, ms } = await timedFetch(opts.fetchImpl, `${transferServer}/info`, {}, opts.requestTimeoutMs);
      const text = await res.text();
      const info = JSON.parse(text);
      transcript.info_sha256 = sha256Hex(text);
      depositAsset = firstDepositAsset(info);
      checks.info_valid = infoListsEnabledAsset(info);
      if (toml.sep24 && depositAsset && checks.sep10_advertised) expected = [...expected, 'initiate'];
      record('info', ms);
    } catch (err) {
      stages.info = { ok: false, error: message(err) };
      throw new StageFailure('info', `transfer server /info failed: ${message(err)}`);
    }

    // 3. SEP-10 challenge
    if (!toml.webAuthEndpoint || !toml.signingKey) {
      if (toml.sep24) {
        // SEP-24 cannot work without SEP-10, so this is a broken setup.
        throw new StageFailure('challenge', 'SEP-24 is advertised without WEB_AUTH_ENDPOINT/SIGNING_KEY');
      }
      return result(true);
    }
    const wallet = Keypair.random();
    transcript.probe_account = wallet.publicKey();
    let challengeTx: Transaction;
    try {
      const url = new URL(toml.webAuthEndpoint);
      url.searchParams.set('account', wallet.publicKey());
      const { value: res, ms } = await timedFetch(opts.fetchImpl, url.toString(), {}, opts.requestTimeoutMs);
      const body = (await res.json()) as { transaction: string; network_passphrase?: string };
      const passphrase = body.network_passphrase ?? opts.networkPassphrase;
      challengeTx = new Transaction(body.transaction, passphrase);
      transcript.sep10_challenge = { xdr: body.transaction, network_passphrase: passphrase };
      const signedByAnchor = challengeTx.signatures.some((sig) =>
        Keypair.fromPublicKey(toml.signingKey!).verify(challengeTx.hash(), sig.signature),
      );
      checks.sep10_signature_valid = signedByAnchor;
      if (!signedByAnchor) {
        stages.challenge = { ok: false, ms, error: 'challenge not signed by the published SIGNING_KEY' };
        throw new StageFailure('challenge', 'SEP-10 challenge is not signed by the anchor\'s published SIGNING_KEY');
      }
      record('challenge', ms);
    } catch (err) {
      if (err instanceof StageFailure) throw err;
      if (isPolicyRejection(err)) {
        stages.challenge = { ok: false, policy: true, error: message(err) };
        return result(true);
      }
      stages.challenge = { ok: false, error: message(err) };
      throw new StageFailure('challenge', `SEP-10 challenge failed: ${message(err)}`);
    }

    // 4. SEP-10 token (extended)
    challengeTx.sign(wallet);
    let token: string;
    try {
      const { value: res, ms } = await timedFetch(
        opts.fetchImpl,
        toml.webAuthEndpoint,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction: challengeTx.toXDR() }) },
        opts.requestTimeoutMs,
      );
      token = ((await res.json()) as { token: string }).token;
      record('token', ms);
    } catch (err) {
      if (isPolicyRejection(err)) {
        stages.token = { ok: false, policy: true, error: message(err) };
        return result(true);
      }
      stages.token = { ok: false, error: message(err) };
      throw new StageFailure('token', `SEP-10 token exchange failed: ${message(err)}`);
    }

    // 5. SEP-24 interactive deposit, started and abandoned (extended)
    if (!toml.sep24 || !depositAsset) return result(true);
    try {
      const form = new FormData();
      form.set('asset_code', depositAsset);
      form.set('account', wallet.publicKey());
      const { value: res, ms } = await timedFetch(
        opts.fetchImpl,
        `${toml.sep24}/transactions/deposit/interactive`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
        opts.requestTimeoutMs,
      );
      const body = (await res.json()) as { url?: string };
      if (!body.url) throw new Error('response has no interactive url');
      record('initiate', ms);
    } catch (err) {
      if (isPolicyRejection(err)) {
        stages.initiate = { ok: false, policy: true, error: message(err) };
        return result(true);
      }
      stages.initiate = { ok: false, error: message(err) };
      throw new StageFailure('initiate', `SEP-24 deposit initiation failed: ${message(err)}`);
    }
    return result(true);
  } catch (err) {
    if (err instanceof StageFailure) return result(false, err);
    throw err;
  }
}
