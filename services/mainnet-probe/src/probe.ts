import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { HttpError, timedFetch, type Fetch } from './http.js';
import { fetchAnchorToml, type AnchorToml } from './toml.js';
import { sha256Hex } from './evidence.js';

export type StageName = 'toml' | 'info' | 'challenge' | 'token' | 'initiate';

export interface StageResult {
  ok: boolean;
  ms?: number;
  /** The anchor answered, but declined us by policy (4xx) — e.g. it requires
   * a client_domain or KYC first. Recorded, never counted as an outage. */
  policy?: boolean;
  error?: string;
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
  const startedAt = (opts.now ?? (() => new Date()))();
  const stages: Partial<Record<StageName, StageResult>> = {};
  const transcript: ProbeTranscript = {};
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
    transcript,
  });

  try {
    // 1. SEP-1
    let toml: AnchorToml;
    try {
      const t = await fetchAnchorToml(opts.fetchImpl, target.domain, opts.requestTimeoutMs);
      toml = t.value;
      transcript.stellar_toml = {
        sha256: t.sha256,
        ...(toml.signingKey ? { signing_key: toml.signingKey } : {}),
        ...(toml.webAuthEndpoint ? { web_auth_endpoint: toml.webAuthEndpoint } : {}),
        ...((toml.sep24 ?? toml.sep6) ? { transfer_server: toml.sep24 ?? toml.sep6 } : {}),
      };
      record('toml', t.ms);
    } catch (err) {
      stages.toml = { ok: false, error: message(err) };
      throw new StageFailure('toml', `stellar.toml unreachable: ${message(err)}`);
    }
    const transferServer = toml.sep24 ?? toml.sep6;
    if (!transferServer) {
      stages.toml = { ...stages.toml, ok: false, error: 'no TRANSFER_SERVER_SEP0024 or TRANSFER_SERVER' };
      throw new StageFailure('toml', 'stellar.toml no longer advertises a SEP-6/24 transfer server');
    }

    // 2. /info
    let depositAsset: string | undefined;
    try {
      const { value: res, ms } = await timedFetch(opts.fetchImpl, `${transferServer}/info`, {}, opts.requestTimeoutMs);
      const text = await res.text();
      const info = JSON.parse(text);
      transcript.info_sha256 = sha256Hex(text);
      depositAsset = firstDepositAsset(info);
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
