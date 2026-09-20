// npm run verify-score -- <bundle sha256 | url | file> [--anchor <id>] [--logs <dir>] [--testnet-log <file>]
//
// Checks that a score-inputs bundle hashes to its name, recomputes the card
// from it, and optionally compares that card with the one on-chain and the
// bundle's per-day digests with a copy of the probe logs. Needs no account
// and trusts nothing but the bundle and the chain.
import fs from 'node:fs';
import path from 'node:path';
import { Address, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { SCORE_INPUTS_SCHEMA, sha256Hex } from '../evidence.js';
import { computeCard, flagNames } from './engine.js';
import { applyIncidents } from './incidents.js';
import { dayDigest, type ProbeLine } from './inputs.js';
import { readTestnetProbeLines } from './load.js';
import type { ScoreCard, ScoreInputs } from './types.js';

const DEFAULT_EVIDENCE_URL = process.env.EVIDENCE_BASE_URL ?? 'http://37.221.76.23/evidence/';

/** Reads the bundle's exact bytes, and the hash it claims to have. */
export async function loadBundle(ref: string, evidenceDir?: string): Promise<{ bytes: string; claimed?: string }> {
  if (/^[0-9a-f]{64}$/.test(ref)) {
    const local = evidenceDir && path.join(evidenceDir, `${ref}.json`);
    if (local && fs.existsSync(local)) return { bytes: fs.readFileSync(local, 'utf-8'), claimed: ref };
    const res = await fetch(`${DEFAULT_EVIDENCE_URL}${ref}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching bundle ${ref}`);
    return { bytes: await res.text(), claimed: ref };
  }
  const claimed = /([0-9a-f]{64})\.json$/.exec(ref)?.[1];
  if (/^https?:\/\//.test(ref)) {
    const res = await fetch(ref);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${ref}`);
    return { bytes: await res.text(), claimed };
  }
  return { bytes: fs.readFileSync(ref, 'utf-8'), claimed };
}

/** Parses a bundle and recomputes its card. Throws if it is not what it
 * claims to be. */
export function recompute(bytes: string, claimed?: string): { inputs: ScoreInputs; card: ScoreCard; hash: string } {
  const hash = sha256Hex(bytes);
  if (claimed && hash !== claimed) throw new Error(`bundle hashes to ${hash}, not ${claimed}: it was altered`);
  const { schema, ...inputs } = JSON.parse(bytes) as ScoreInputs & { schema?: string };
  if (schema !== SCORE_INPUTS_SCHEMA) throw new Error(`not a score-inputs bundle (schema ${schema})`);
  return { inputs, card: computeCard(inputs), hash };
}

/** The card stored on-chain, read straight from the ledger entry. */
export async function onChainCard(rpcUrl: string, oracleId: string, anchorId: string): Promise<(ScoreCard & { inputs_hash: string }) | null> {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(oracleId).toScAddress(),
      key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Card'), xdr.ScVal.scvSymbol(anchorId)]),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
  const { entries } = await new rpc.Server(rpcUrl).getLedgerEntries(key);
  if (entries.length === 0) return null;
  const data = entries[0].val;
  if (data.type !== 'contractData') return null;
  const raw = scValToNative(data.contractData.val) as Record<string, unknown>;
  return {
    score: Number(raw.score),
    availability: Number(raw.availability),
    speed: Number(raw.speed),
    integrity: Number(raw.integrity),
    market: raw.market === null || raw.market === undefined ? null : Number(raw.market),
    confidence: Number(raw.confidence),
    flags: Number(raw.flags),
    window_end: Number(raw.window_end),
    methodology_version: Number(raw.methodology_version),
    inputs_hash: Buffer.from(raw.inputs_hash as Uint8Array).toString('hex'),
  };
}

/**
 * Recomputes the per-day digests from a copy of the probe logs. The same
 * collector incidents the scorer applied are applied here, or every card
 * that cites one would look altered; `applyIncidents` reads its evidence
 * from the log, so it needs every day of it, not one day at a time.
 */
export function checkDays(inputs: ScoreInputs, logsDir: string, testnetLog?: string): string[] {
  const problems: string[] = [];
  const all: ProbeLine[] = [];
  // Every day in the directory, not only the days this card covers: an
  // incident's proof window can fall outside them.
  for (const file of fs.readdirSync(logsDir).filter((f) => /^probe-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))) {
    for (const line of fs.readFileSync(path.join(logsDir, file), 'utf-8').split('\n')) {
      if (line.trim()) all.push(JSON.parse(line) as ProbeLine);
    }
  }
  applyIncidents(all);
  // A testnet anchor's runs are in testnet-probe's single log, not the daily files.
  const testnet = testnetLog ? readTestnetProbeLines(testnetLog) : [];
  all.push(...testnet);
  for (const day of inputs.days) {
    const haveLog = fs.existsSync(path.join(logsDir, `probe-${day.date}.jsonl`)) || testnet.some((p) => p.timestamp.slice(0, 10) === day.date);
    if (!haveLog) {
      problems.push(`${day.date}: no log file`);
      continue;
    }
    const probes = all.filter(
      (p) =>
        p.anchor_id === inputs.anchor_id &&
        !p.inconclusive &&
        p.timestamp.slice(0, 10) === day.date &&
        Date.parse(p.timestamp) <= inputs.window_end * 1000,
    );
    const ok = probes.filter((p) => p.success).length;
    const digest = dayDigest(probes);
    if (probes.length !== day.n || ok !== day.ok || digest !== day.digest) {
      problems.push(`${day.date}: log has ${ok}/${probes.length} (${digest.slice(0, 12)}), bundle says ${day.ok}/${day.n} (${day.digest.slice(0, 12)})`);
    }
  }
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const ref = args.find((a, i) => !a.startsWith('--') && !['--anchor', '--logs', '--testnet-log'].includes(args[i - 1]));
  if (!ref) {
    console.error('usage: npm run verify-score -- <bundle sha256 | url | file> [--anchor <id>] [--logs <dir>] [--testnet-log <file>]');
    process.exitCode = 2;
    return;
  }
  const { config } = await import('../config.js');
  const { bytes, claimed } = await loadBundle(ref, config.evidenceDir);
  const { inputs, card, hash } = recompute(bytes, claimed);
  console.log(`bundle ${hash} (${claimed ? 'hash matches its name' : 'no name to check the hash against'})`);
  console.log(`anchor ${inputs.anchor_id}, window ending ${new Date(inputs.window_end * 1000).toISOString()}, methodology v${inputs.methodology_version}`);
  console.log(
    `recomputed: score ${card.score}  availability ${card.availability}  speed ${card.speed}  integrity ${card.integrity}  ` +
      `market ${card.market ?? 'n/a'}  confidence ${card.confidence}  flags [${flagNames(card.flags).join(' ')}]`,
  );

  let failed = false;
  const anchor = opt('--anchor');
  if (anchor) {
    const stored = await onChainCard(config.rpcUrl, config.performanceOracleContractId(), anchor);
    if (!stored) {
      console.log(`on-chain: ${anchor} has no score card`);
      failed = true;
    } else {
      const fields = ['score', 'availability', 'speed', 'integrity', 'market', 'confidence', 'flags', 'window_end', 'methodology_version'] as const;
      const diffs = fields.filter((f) => stored[f] !== card[f]).map((f) => `${f}: chain ${stored[f]}, recomputed ${card[f]}`);
      if (stored.inputs_hash !== hash) diffs.push(`inputs_hash: chain ${stored.inputs_hash} (a different bundle)`);
      console.log(diffs.length ? `on-chain card DIFFERS:\n  ${diffs.join('\n  ')}` : 'on-chain card matches the recomputed one exactly');
      failed ||= diffs.length > 0;
    }
  }
  const logs = opt('--logs');
  if (logs) {
    const problems = checkDays(inputs, logs, opt('--testnet-log'));
    console.log(problems.length ? `probe logs DIFFER:\n  ${problems.join('\n  ')}` : `probe logs match all ${inputs.days.length} daily digests`);
    failed ||= problems.length > 0;
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`verify-score: ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
