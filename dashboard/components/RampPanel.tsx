'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  CircleNotch,
  Circle,
  ShieldCheck,
  ShieldWarning,
  Wallet,
  XCircle,
} from '@phosphor-icons/react';
import {
  accountExists,
  authenticate,
  ensureTrustline,
  fetchToml,
  fundWithFriendbot,
  getBalance,
  getLimits,
  getTransaction,
  NETWORK_PASSPHRASE,
  payWithdrawal,
  resolveAsset,
  startInteractive,
  TERMINAL_STATUSES,
  type Sep24Transaction,
} from '@/lib/anchor-client';
import { formatStakeXlm } from '@/lib/format';
import { loadRampAnchors, rankRoutes, type RouteCandidate } from '@/lib/routing';
import type { AnchorViewModel } from '@/lib/types';
import { ScoreValue } from './ScoreValue';

type Mode = 'deposit' | 'withdraw';
type StepState = 'idle' | 'active' | 'done' | 'error';

const STEPS: Record<Mode, string[]> = {
  deposit: ['Connect wallet', 'Pick the safest anchor', 'Sign in to anchor', 'Enable the asset', 'Pay with your bank', 'Money arrives in wallet'],
  withdraw: ['Connect wallet', 'Pick the safest anchor', 'Sign in to anchor', 'Enable the asset', 'Enter bank details', 'Send & receive to bank'],
};

// Stellar Wallets Kit touches `window` at import time, so it is loaded lazily
// on the client only (skills/dapp/SKILL.md → "Stellar Wallets Kit").
type Kit = typeof import('@creit-tech/stellar-wallets-kit').StellarWalletsKit;
let kitPromise: Promise<Kit> | null = null;
function loadKit(): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = (async () => {
      const [{ StellarWalletsKit, Networks }, { defaultModules }] = await Promise.all([
        import('@creit-tech/stellar-wallets-kit'),
        import('@creit-tech/stellar-wallets-kit/modules/utils'),
      ]);
      StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET });
      return StellarWalletsKit;
    })();
  }
  return kitPromise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function shortAddress(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function RampPanel({ anchors }: { anchors: AnchorViewModel[] }) {
  const routes = useMemo(() => rankRoutes(anchors, loadRampAnchors()), [anchors]);
  const best = routes.find((r) => r.eligible);

  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('10');
  const [address, setAddress] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepState[]>(() => STEPS.deposit.map(() => 'idle'));
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<Sep24Transaction | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => void (cancelled.current = true), []);

  const mark = useCallback((i: number, state: StepState) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? state : idx < i && state !== 'error' ? 'done' : s)));
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const kit = await loadKit();
      const { address: addr } = await kit.authModal();
      setAddress(addr);
      return addr;
    } catch (err) {
      setError((err as Error).message || 'Wallet connection was cancelled');
      return null;
    }
  }, []);

  const run = useCallback(
    async (route: RouteCandidate) => {
      // Open the anchor window synchronously inside the click handler, before
      // any await, or popup blockers will kill it.
      const popup = window.open('', 'anchor-flow', 'width=480,height=720');
      popup?.document.write('<p style="font-family:sans-serif;padding:24px">Preparing secure anchor session…</p>');
      setRunning(true);
      setError(null);
      setTx(null);
      setBalance(null);
      setSteps(STEPS[mode].map(() => 'idle'));
      let current = 0;
      try {
        mark(0, 'active');
        const account = address ?? (await connect());
        if (!account) throw new Error('Connect a wallet to continue');
        const kit = await loadKit();
        const sign = async (xdr: string) =>
          (await kit.signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address: account })).signedTxXdr;

        if (!(await accountExists(account))) {
          setMessage('New testnet wallet — funding it with test XLM…');
          await fundWithFriendbot(account);
        }

        current = 1;
        mark(1, 'active');
        setMessage(`Routing through ${route.anchor.name} (score ${route.anchor.score}/100)`);
        const toml = await fetchToml(route.config.domain);
        const asset = resolveAsset(toml, route.config.assetCode);
        const { min, max } = await getLimits(toml, mode, route.config.assetCode);
        const value = Number(amount);
        if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
          throw new Error(`${route.anchor.name} accepts ${min ?? 0}–${max ?? '∞'} ${route.config.fiat} per transaction`);
        }

        current = 2;
        mark(2, 'active');
        setMessage('Approve the sign-in request in your wallet (no funds move)');
        const token = await authenticate(toml, account, sign);

        current = 3;
        mark(3, 'active');
        setMessage(`Checking your wallet can hold ${route.config.assetCode}…`);
        if (await ensureTrustline(account, asset, sign)) {
          setMessage(`${route.config.assetCode} enabled in your wallet`);
        }

        current = 4;
        mark(4, 'active');
        const interactive = await startInteractive(toml, token, mode, route.config.assetCode, account, amount);
        if (popup) popup.location.href = interactive.url;
        else window.open(interactive.url, '_blank');
        setMessage(`Complete the form in the ${route.anchor.name} window`);

        let paid = false;
        let latest: Sep24Transaction | null = null;
        const deadline = Date.now() + 15 * 60 * 1000;
        while (!cancelled.current && Date.now() < deadline) {
          latest = await getTransaction(toml, token, interactive.id);
          setTx(latest);
          if (latest.status !== 'incomplete' && current === 4) {
            current = 5;
            mark(5, 'active');
            setMessage(mode === 'deposit' ? 'Anchor is processing your payment…' : 'Sending funds to the anchor…');
          }
          if (mode === 'withdraw' && !paid && latest.status === 'pending_user_transfer_start') {
            setMessage('Approve the transfer to the anchor in your wallet');
            await payWithdrawal(account, asset, latest, sign);
            paid = true;
            setMessage('Sent — waiting for the anchor to pay out to your bank…');
          }
          if (TERMINAL_STATUSES.has(latest.status)) break;
          await sleep(3000);
        }

        if (latest?.status !== 'completed') {
          throw new Error(
            latest ? `Anchor ended the transaction with status "${latest.status}"` : 'Timed out waiting for the anchor',
          );
        }
        setSteps(STEPS[mode].map(() => 'done'));
        setBalance(await getBalance(account, asset));
        setMessage(mode === 'deposit' ? 'Done — the money is in your wallet' : 'Done — the anchor has paid out');
      } catch (err) {
        popup?.close();
        mark(current, 'error');
        setError((err as Error).message);
        setMessage(null);
      } finally {
        setRunning(false);
      }
    },
    [address, amount, connect, mark, mode],
  );

  const blocked = routes.filter((r) => !r.eligible);

  return (
    <section className="glass-panel mb-8 rounded-card p-5 shadow-glow sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 rounded-pill bg-surface-muted p-1" role="tablist">
            {(['deposit', 'withdraw'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                disabled={running}
                onClick={() => {
                  setMode(m);
                  setSteps(STEPS[m].map(() => 'idle'));
                  setError(null);
                  setMessage(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-pill px-3 py-2 text-sm font-medium transition ${
                  mode === m ? 'bg-surface-glass text-ink shadow-card' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {m === 'deposit' ? <ArrowDown size={15} weight="bold" /> : <ArrowUp size={15} weight="bold" />}
                {m === 'deposit' ? 'Add money' : 'Cash out'}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-muted">Amount</span>
            <div className="flex items-center gap-2 rounded-card border border-border bg-surface-muted px-4 py-3 focus-within:border-accent">
              <input
                inputMode="decimal"
                value={amount}
                disabled={running}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="tabular w-full bg-transparent font-heading text-2xl font-semibold text-ink outline-none"
                aria-label="Amount"
              />
              <span className="font-heading text-lg font-semibold text-ink-muted">{best?.config.fiat ?? 'TRY'}</span>
            </div>
          </label>

          {best ? (
            <div className="flex min-w-0 items-center gap-3 rounded-card border border-success/40 bg-success-soft/30 p-3">
              <ScoreValue score={best.anchor.score} size={44} />
              <div className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-ink">
                  <ShieldCheck size={15} weight="fill" className="text-success" /> Best route: {best.anchor.name}
                </span>
                <span className="truncate text-xs text-ink-muted">
                  {best.config.domain} · {formatStakeXlm(best.anchor.stake)} staked · delivers {best.config.assetCode}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-card border border-danger/40 bg-danger-soft/30 p-3 text-sm text-danger">
              <ShieldWarning size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
              <span>
                No anchor currently meets the safety bar, so we won&apos;t route your money. This is the oracle doing its
                job.
              </span>
            </div>
          )}

          {blocked.length > 0 && (
            <ul className="flex min-w-0 flex-col gap-1 break-words text-xs text-ink-faint">
              {blocked.map((r) => (
                <li key={r.anchor.anchorId} className="flex items-center gap-1.5">
                  <XCircle size={13} className="text-danger" /> {r.anchor.name} blocked — {r.reason}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={running || !best || !Number(amount)}
              onClick={() => best && run(best)}
              className="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow-accent transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? <CircleNotch size={16} className="animate-spin" /> : <Wallet size={16} weight="bold" />}
              {running ? 'Working…' : mode === 'deposit' ? `Add ${amount || 0} ${best?.config.fiat ?? 'TRY'}` : `Cash out ${amount || 0} ${best?.config.fiat ?? 'TRY'}`}
            </button>
            {address ? (
              <span className="tabular rounded-pill bg-surface-muted px-3 py-1.5 font-mono text-xs text-ink-muted">
                {shortAddress(address)}
              </span>
            ) : (
              <button
                type="button"
                onClick={connect}
                disabled={running}
                className="rounded-pill border border-border px-4 py-2 text-sm font-medium text-ink-muted hover:border-border-strong hover:text-ink"
              >
                Connect wallet
              </button>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-card bg-surface-muted/60 p-4">
          <ol className="flex flex-col gap-2.5">
            {STEPS[mode].map((label, i) => (
              <li key={label} className="flex items-center gap-2.5 text-sm">
                {steps[i] === 'done' && <CheckCircle size={18} weight="fill" className="text-success" />}
                {steps[i] === 'active' && <CircleNotch size={18} className="animate-spin text-accent" />}
                {steps[i] === 'error' && <XCircle size={18} weight="fill" className="text-danger" />}
                {steps[i] === 'idle' && <Circle size={18} className="text-ink-faint" />}
                <span className={steps[i] === 'idle' ? 'text-ink-faint' : 'text-ink'}>{label}</span>
              </li>
            ))}
          </ol>
          {message && <p className="text-sm text-ink-muted" aria-live="polite">{message}</p>}
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {tx && (
            <p className="tabular font-mono text-xs text-ink-faint">
              anchor tx {tx.id.slice(0, 8)} · status {tx.status}
              {tx.more_info_url && (
                <>
                  {' · '}
                  <a href={tx.more_info_url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                    receipt
                  </a>
                </>
              )}
            </p>
          )}
          {balance !== null && (
            <p className="text-sm font-semibold text-success">
              Wallet balance: {balance} {best?.config.assetCode}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
