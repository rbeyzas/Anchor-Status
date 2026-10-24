#!/usr/bin/env node
// Each server watches the other and tells the admins on Telegram when the
// other one stops serving its files or stops updating them. Added after
// nginx on A stayed down for 2.5 days (21–24 Oct 2026) and nobody noticed.
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
//
//   node scripts/watch-peer.mjs --test       send a test message now
//   node scripts/watch-peer.mjs --selftest   check the alert logic, sends nothing
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';

// Two failed checks in a row before an alert, so one slow answer is not one.
const FAILURES_TO_ALERT = 2;

/** The next state, and the message to send if any. Pure, for --selftest. */
export function step(state, problem, name, now) {
  if (problem) {
    const failures = state.failures + 1;
    const since = state.since ?? now;
    if (failures >= FAILURES_TO_ALERT && !state.alerted) {
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
  console.log('selftest ok');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const name = process.env.WATCH_NAME ?? process.env.WATCH_URL;
  if (process.argv.includes('--test')) return send(`Test: this server watches ${name}.`);

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

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
