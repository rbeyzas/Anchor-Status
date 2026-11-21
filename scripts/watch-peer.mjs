#!/usr/bin/env node
// Each server watches the other and tells the admins on Telegram when the
// other one stops serving its files or stops updating them. Added after
// nginx on A stayed down for 2.5 days (21–24 Oct 2026) and nobody noticed.
//
// It also reads this server's own collect.log and reports a collection step
// that failed in several rounds in a row. Added after history-archiver failed
// every round for 11 days (10–21 Nov 2026) while the files stayed fresh, so
// the peer check saw nothing.
//
// Run from cron every 10 minutes, with the server's .env:
//   */10 * * * * root node --env-file=/opt/anchor-status/.env /opt/anchor-status/scripts/watch-peer.mjs
//
// .env:
//   TELEGRAM_BOT_TOKEN   the bot's token (from @BotFather)
//   TELEGRAM_CHAT_IDS    the admins' chat ids, comma-separated; nobody else
//                        is ever messaged
//   WATCH_NAME           how the message names the other server, e.g. "A (37.221.76.23)"
//   WATCH_URL            a file the other server updates every round
//   WATCH_MAX_AGE_MIN    older than this counts as stopped (A: 60, B: 130;
//                        B records its shadow cards once an hour)
//   WATCH_STEPS_LOG      this server's collect log (default
//                        /var/log/anchor-status/collect.log)
//   WATCH_STEPS_ROUNDS   failed rounds in a row before an alert (default 3,
//                        one hour at a round every 20 minutes)
//
//   node scripts/watch-peer.mjs --test       send a test message now
//   node scripts/watch-peer.mjs --selftest   check the alert logic, sends nothing
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Two failed checks in a row before an alert, so one slow answer is not one.
const FAILURES_TO_ALERT = 2;

/** The next state, and the message to send if any. Pure, for --selftest. */
export function step(state, problem, name, now, threshold = FAILURES_TO_ALERT) {
  if (problem) {
    const failures = state.failures + 1;
    const since = state.since ?? now;
    if (failures >= threshold && !state.alerted) {
      return { state: { failures, since, alerted: true }, message: `⚠️ ${name}: ${problem}` };
    }
    return { state: { ...state, failures, since }, message: null };
  }
  if (state.alerted) {
    const minutes = Math.round((Date.parse(now) - Date.parse(state.since)) / 60000);
    return { state: { failures: 0, since: null, alerted: false }, message: `✅ ${name} is back (down about ${minutes} min).` };
  }
  return { state: { failures: 0, since: null, alerted: false }, message: null };
}

/** What is wrong with the other server, or null. */
async function check(url, maxAgeMin) {
  let res;
  try {
    res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    // Node puts the socket error in cause, or in cause.errors when it tried
    // several addresses.
    return `not reachable (${err.cause?.code ?? err.cause?.errors?.[0]?.code ?? err.cause?.message ?? err.name})`;
  }
  if (!res.ok) return `${url} answers HTTP ${res.status}`;
  const modified = Date.parse(res.headers.get('last-modified') ?? '');
  if (Number.isNaN(modified)) return `${url} has no Last-Modified header`;
  const ageMin = Math.round((Date.now() - modified) / 60000);
  return ageMin > maxAgeMin ? `${url} not updated for ${ageMin} min (limit ${maxAgeMin}): its collector may have stopped` : null;
}

// collect.sh logs every line of its own as `[collect <time>] [<role>] <text>`,
// a failed step as `<step> failed` (or `<step> failed, <what it did instead>`),
// and ends a round with `round complete`.
const COLLECT_LINE = /^\[collect (\S+)\] \[\w+\] (.*)$/;
const STEP_FAILED = /^(.+?) (?:failed|reported a failure)(?:,|$)/;
// testnet-probe also exits non-zero when one anchor fails its money flow:
// that is the anchor's score, not a broken step. Only a round in which it
// printed no verdict at all means the probe itself broke.
const TESTNET_VERDICT = /^\[testnet-probe\] \S+ +(?:SUCCESS|FAILURE|INCONCLUSIVE)\b/;
// A round is ~20 KB of log; the tail holds dozens of them.
const LOG_TAIL_BYTES = 1_000_000;

/**
 * The completed rounds in a piece of collect.log, oldest first:
 * [{ end, failed: [step, …] }]. The first round is left out: it may be cut
 * off by the read or by log rotation, and a round left out changes no count
 * (a round wrongly read as clean would reset one). Pure, for --selftest.
 */
export function parseRounds(text) {
  const rounds = [];
  let failed = new Set();
  let verdicts = 0;
  let complete = false;
  for (const line of text.split('\n')) {
    if (TESTNET_VERDICT.test(line)) verdicts++;
    const m = COLLECT_LINE.exec(line);
    if (!m) continue;
    const [, time, message] = m;
    if (message === 'round complete') {
      if (complete) rounds.push({ end: time, failed: [...failed].sort() });
      failed = new Set();
      verdicts = 0;
      complete = true;
      continue;
    }
    const f = STEP_FAILED.exec(message);
    if (!f) continue;
    if (f[1] === 'testnet-probe' && verdicts > 0) continue;
    failed.add(f[1]);
  }
  return rounds;
}

/**
 * Feeds the rounds newer than state.lastRound through step() per collection
 * step. Returns the next state and the messages to send. Pure, for --selftest.
 */
export function stepRounds(state, rounds, threshold) {
  const steps = { ...(state.steps ?? {}) };
  const messages = [];
  let lastRound = state.lastRound ?? null;
  for (const round of rounds) {
    if (lastRound && round.end <= lastRound) continue;
    for (const name of new Set([...Object.keys(steps), ...round.failed])) {
      const problem = round.failed.includes(name) ? `failed in ${threshold} rounds in a row; see collect.log` : null;
      const r = step(steps[name] ?? { failures: 0, since: null, alerted: false }, problem, `collect step "${name}"`, round.end, threshold);
      if (r.message) messages.push(r.message);
      if (r.state.failures === 0 && !r.state.alerted) delete steps[name];
      else steps[name] = r.state;
    }
    lastRound = round.end;
  }
  return { state: { lastRound, steps }, messages };
}

function readTail(file, bytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

async function watchSteps() {
  const logFile = process.env.WATCH_STEPS_LOG ?? '/var/log/anchor-status/collect.log';
  const threshold = Number(process.env.WATCH_STEPS_ROUNDS ?? '3');
  const stateFile = process.env.WATCH_STEPS_STATE ?? '/var/lib/anchor-status/watch-steps.json';
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    // First run, or unreadable: start clean.
  }
  const next = stepRounds(state, parseRounds(readTail(logFile, LOG_TAIL_BYTES)), threshold);
  // As for the peer: send first, so an unsent alert is tried again next run.
  for (const message of next.messages) await send(message);
  fs.writeFileSync(stateFile, JSON.stringify(next.state));
  for (const [name, s] of Object.entries(next.state.steps)) {
    console.log(`${new Date().toISOString()} collect step "${name}" failing for ${s.failures} round(s) since ${s.since}`);
  }
}

async function send(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = (process.env.TELEGRAM_CHAT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!token || chats.length === 0) throw new Error('set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS');
  for (const chat_id of chats) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id, text: `[from ${os.hostname()}] ${text}` }),
      signal: AbortSignal.timeout(20_000),
    });
    // The token is in the URL: report the status only, never the request.
    if (!res.ok) console.error(`telegram: chat ${chat_id} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

function selftest() {
  const t0 = '2026-10-24T12:00:00Z';
  const t1 = '2026-10-24T12:10:00Z';
  const t2 = '2026-10-24T12:40:00Z';
  const fresh = { failures: 0, since: null, alerted: false };
  let r = step(fresh, 'down', 'A', t0);
  assert.equal(r.message, null, 'one failure is not an alert');
  r = step(r.state, 'down', 'A', t1);
  assert.equal(r.message, '⚠️ A: down', 'the second failure alerts');
  r = step(r.state, 'down', 'A', t2);
  assert.equal(r.message, null, 'no repeat while still down');
  r = step(r.state, null, 'A', t2);
  assert.equal(r.message, '✅ A is back (down about 40 min).', 'recovery is reported once, timed from the first failure');
  assert.deepEqual(r.state, fresh);
  assert.equal(step(step(fresh, 'down', 'A', t0).state, null, 'A', t1).message, null, 'a single blip is never reported');

  // Collection steps, from collect.log.
  const round = (time, lines) =>
    [`[collect ${time}] [primary] mainnet-probe (…)`, ...lines.map((l) => (l.startsWith('[') ? l : `[collect ${time}] [primary] ${l}`)), `[collect ${time}] [primary] round complete`].join('\n');
  const verdict = '[testnet-probe] ref1_monarank_xyz_testnet    SUCCESS      21.5s sep6 ';
  const log = [
    '[aggregator] tail of a round cut off by the read',
    '[collect 2026-11-21T19:30:00Z] [primary] history-archiver failed',
    '[collect 2026-11-21T19:30:01Z] [primary] round complete',
    round('2026-11-21T19:50:00Z', ['history-archiver failed', verdict, 'testnet-probe reported a failure']),
    round('2026-11-21T20:10:00Z', ['registry sync failed, keeping the last list', 'testnet-probe reported a failure', 'history-archiver failed']),
    '[collect 2026-11-21T20:30:00Z] [primary] history-archiver failed',
  ].join('\n');
  assert.deepEqual(parseRounds(log), [
    { end: '2026-11-21T19:50:00Z', failed: ['history-archiver'] },
    { end: '2026-11-21T20:10:00Z', failed: ['history-archiver', 'registry sync', 'testnet-probe'] },
  ], 'a cut-off first round and an unfinished last one are left out; testnet-probe counts only without any verdict');

  const ok = (end) => ({ end, failed: [] });
  const bad = (end) => ({ end, failed: ['history-archiver'] });
  let s = stepRounds({}, [bad('t1'), bad('t2')], 3);
  assert.deepEqual(s.messages, [], 'two failed rounds are not an alert');
  s = stepRounds(s.state, [bad('t1'), bad('t2'), bad('t3')], 3);
  assert.deepEqual(s.messages, ['⚠️ collect step "history-archiver": failed in 3 rounds in a row; see collect.log'], 'the third alerts; rounds already seen are not counted twice');
  s = stepRounds(s.state, [bad('t4'), bad('t5')], 3);
  assert.deepEqual(s.messages, [], 'no repeat while still failing');
  s = stepRounds(s.state, [ok('t6')], 3);
  assert.equal(s.messages.length, 1, 'recovery is reported once');
  assert.match(s.messages[0], /^✅ collect step "history-archiver" is back/);
  assert.deepEqual(s.state, { lastRound: 't6', steps: {} });
  assert.deepEqual(stepRounds({}, [bad('t1'), ok('t2'), bad('t3'), bad('t4')], 3).messages, [], 'a clean round resets the count');
  console.log('selftest ok');
}

async function watchPeer() {
  const name = process.env.WATCH_NAME ?? process.env.WATCH_URL;
  const url = process.env.WATCH_URL;
  const maxAgeMin = Number(process.env.WATCH_MAX_AGE_MIN ?? '60');
  if (!url) throw new Error('set WATCH_URL');
  const stateFile = process.env.WATCH_STATE ?? '/var/lib/anchor-status/watch-peer.json';
  let state = { failures: 0, since: null, alerted: false };
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    // First run, or unreadable: start clean.
  }
  const problem = await check(url, maxAgeMin);
  const next = step(state, problem, name, new Date().toISOString());
  // Send first: if Telegram is unreachable the alert is not marked as sent,
  // so the next run tries again.
  if (next.message) await send(next.message);
  fs.writeFileSync(stateFile, JSON.stringify(next.state));
  if (problem) console.log(`${new Date().toISOString()} ${problem}`);
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (process.argv.includes('--test')) return send(`Test: this server watches ${process.env.WATCH_NAME ?? process.env.WATCH_URL}.`);
  // The two checks are independent: one failing must not skip the other.
  for (const [label, check] of [['peer', watchPeer], ['steps', watchSteps]]) {
    try {
      await check();
    } catch (err) {
      console.error(`${label}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

// Run only as a script, so --selftest's functions can be imported elsewhere.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
