import fs from 'node:fs';
import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { EVIDENCE_SCHEMA, sha256Hex } from './evidence.js';
import { fetchAnchorToml } from './toml.js';

/**
 * Independently checks one evidence document. Needs nothing from us beyond
 * the document itself: every check is against the anchor's own signature,
 * the anchor's own stellar.toml, or the Stellar ledger.
 *
 *   npm run verify -- <sha256>            (fetched from EVIDENCE_BASE_URL)
 *   npm run verify -- <url or local file>
 */

interface EvidenceDoc {
  schema: string;
  kind: 'mainnet-probe' | 'testnet-probe';
  network: 'mainnet' | 'testnet';
  anchor_id: string;
  domain: string;
  started_at: string;
  verdict: { success: boolean };
  probe_account?: string;
  stellar_toml?: { signing_key?: string };
  sep10_challenge?: { xdr: string; network_passphrase: string };
  stellar_transaction_id?: string;
}

export interface Check {
  name: string;
  ok: boolean | null; // null: could not be checked
  detail: string;
}

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? 'http://37.221.76.23/evidence/';

async function load(arg: string): Promise<{ bytes: Buffer; expectedHash?: string }> {
  if (/^[0-9a-f]{64}$/.test(arg)) {
    const res = await fetch(`${BASE_URL}${arg}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching evidence ${arg}`);
    return { bytes: Buffer.from(await res.arrayBuffer()), expectedHash: arg };
  }
  const expectedHash = arg.match(/([0-9a-f]{64})\.json$/)?.[1];
  if (/^https?:\/\//.test(arg)) {
    const res = await fetch(arg);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${arg}`);
    return { bytes: Buffer.from(await res.arrayBuffer()), expectedHash };
  }
  return { bytes: fs.readFileSync(arg), expectedHash };
}

/** Checks that need no network: hash and the anchor's signature. */
export function verifyOffline(bytes: Buffer, expectedHash?: string): { doc: EvidenceDoc; checks: Check[] } {
  const checks: Check[] = [];
  const actual = sha256Hex(bytes);
  if (expectedHash) {
    checks.push({
      name: 'Document matches its hash',
      ok: actual === expectedHash,
      detail: actual === expectedHash ? `sha256 ${actual}` : `sha256 is ${actual}, expected ${expectedHash}`,
    });
  }
  const doc = JSON.parse(bytes.toString('utf-8')) as EvidenceDoc;
  checks.push({ name: 'Known evidence schema', ok: doc.schema === EVIDENCE_SCHEMA, detail: doc.schema });

  const challenge = doc.sep10_challenge;
  const signingKey = doc.stellar_toml?.signing_key;
  if (challenge && signingKey) {
    const tx = new Transaction(challenge.xdr, challenge.network_passphrase);
    const signed = tx.signatures.some((sig) => Keypair.fromPublicKey(signingKey).verify(tx.hash(), sig.signature));
    checks.push({
      name: "Anchor signed the SEP-10 challenge",
      ok: signed,
      detail: signed ? `signature by ${signingKey}` : `no valid signature by ${signingKey}`,
    });
    const started = Date.parse(doc.started_at) / 1000;
    const min = Number(tx.timeBounds?.minTime ?? 0);
    const max = Number(tx.timeBounds?.maxTime ?? 0);
    // The challenge is issued moments after the probe starts.
    const inWindow = min <= started + 120 && (max === 0 || started <= max);
    checks.push({
      name: 'Signature is from the time of the check',
      ok: inWindow,
      detail: `challenge valid ${new Date(min * 1000).toISOString()} – ${max ? new Date(max * 1000).toISOString() : '∞'}, check started ${doc.started_at}`,
    });
    if (doc.probe_account) {
      const addressed = tx.operations[0]?.source === doc.probe_account;
      checks.push({
        name: 'Challenge was issued to the probe',
        ok: addressed,
        detail: addressed ? doc.probe_account : `addressed to ${tx.operations[0]?.source}`,
      });
    }
  }
  return { doc, checks };
}

interface HorizonOperation {
  type: string;
  to?: string;
  amount?: string;
  asset_code?: string;
  asset_balance_changes?: Array<{ type: string; from?: string; to?: string; amount: string; asset_code?: string }>;
}

/**
 * Finds a payout to `account` in a transaction's operations. Anchors pay out
 * either with a classic payment op or — like the SDF reference anchor —
 * through the Stellar Asset Contract (`invoke_host_function`), which
 * Horizon reports as `asset_balance_changes` rather than a payment.
 */
export function findPayout(ops: HorizonOperation[], account: string): { amount: string; asset: string } | undefined {
  for (const op of ops) {
    if (/payment/.test(op.type) && op.to === account && op.amount) {
      return { amount: op.amount, asset: op.asset_code ?? 'XLM' };
    }
    for (const change of op.asset_balance_changes ?? []) {
      if ((change.type === 'transfer' || change.type === 'mint') && change.to === account && change.from !== account) {
        return { amount: change.amount, asset: change.asset_code ?? 'XLM' };
      }
    }
  }
  return undefined;
}

/** Checks against the live world: the anchor's current toml, the ledger. */
async function verifyOnline(doc: EvidenceDoc): Promise<Check[]> {
  const checks: Check[] = [];
  if (doc.stellar_toml?.signing_key) {
    try {
      const { value } = await fetchAnchorToml(fetch, doc.domain, 15_000);
      const same = value.signingKey === doc.stellar_toml.signing_key;
      checks.push({
        name: `${doc.domain} still publishes that SIGNING_KEY`,
        ok: same ? true : null,
        detail: same ? 'yes' : `now publishes ${value.signingKey ?? 'none'} (rotated since, or the toml changed)`,
      });
    } catch (err) {
      checks.push({ name: `${doc.domain} still publishes that SIGNING_KEY`, ok: null, detail: `toml unreachable: ${(err as Error).message}` });
    }
  }
  if (doc.stellar_transaction_id && doc.probe_account) {
    const horizon = doc.network === 'testnet' ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org';
    try {
      const res = await fetch(`${horizon}/transactions/${doc.stellar_transaction_id}/operations`);
      const ops = ((await res.json()) as { _embedded?: { records?: HorizonOperation[] } })._embedded?.records ?? [];
      const payout = findPayout(ops, doc.probe_account);
      checks.push({
        name: 'Anchor paid the probe on the ledger',
        ok: Boolean(payout),
        detail: payout
          ? `${payout.amount} ${payout.asset} to ${doc.probe_account} in tx ${doc.stellar_transaction_id}`
          : `no payout to ${doc.probe_account} in tx ${doc.stellar_transaction_id}`,
      });
    } catch (err) {
      checks.push({ name: 'Anchor paid the probe on the ledger', ok: null, detail: (err as Error).message });
    }
  }
  return checks;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: npm run verify -- <sha256 | url | file>');
    process.exitCode = 2;
    return;
  }
  const { bytes, expectedHash } = await load(arg);
  const { doc, checks } = verifyOffline(bytes, expectedHash);
  checks.push(...(await verifyOnline(doc)));

  console.log(`${doc.kind} of ${doc.anchor_id} (${doc.domain}) at ${doc.started_at}: claims ${doc.verdict.success ? 'SUCCESS' : 'FAILURE'}`);
  for (const c of checks) {
    const mark = c.ok === true ? '✓' : c.ok === false ? '✗' : '?';
    console.log(`  ${mark} ${c.name} — ${c.detail}`);
  }
  if (checks.some((c) => c.ok === false)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[verify] fatal:', (err as Error).message);
    process.exitCode = 1;
  });
}
