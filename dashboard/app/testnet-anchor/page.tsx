import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { CopyButton } from '@/components/CopyButton';
import { SiteNav } from '@/components/SiteNav';
import { StatusChip } from '@/components/StatusChip';

export const metadata: Metadata = {
  title: 'Mona Testnet Anchor',
  description:
    'ref1.monarank.xyz: a Stellar testnet anchor (SEP-1, SEP-10, SEP-6) to integrate into your wallet or app, with a ready prompt for an AI coding assistant.',
};

// The live stellar.toml is read at most every 5 minutes.
export const revalidate = 300;

const DOMAIN = 'ref1.monarank.xyz';
const BASE = `https://${DOMAIN}`;
const CODE = 'https://github.com/rbeyzas/Anchor-Status/tree/main/services/reference-anchor';

/** What the anchor publishes right now; null if it does not answer. */
async function liveToml() {
  try {
    const res = await fetch(`${BASE}/.well-known/stellar.toml`, { next: { revalidate }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const toml = await res.text();
    const field = (name: string) => new RegExp(`^\\s*${name}\\s*=\\s*"([^"]+)"`, 'm').exec(toml)?.[1];
    return { signingKey: field('SIGNING_KEY'), auth: field('WEB_AUTH_ENDPOINT'), transfer: field('TRANSFER_SERVER'), code: field('code'), issuer: field('issuer') };
  } catch {
    return null;
  }
}

const PROMPT = `Add the Mona testnet anchor to my project as a Stellar deposit and withdrawal (on/off-ramp), through the standard SEP path, so that the same code later works with a production anchor by changing only the home domain, the asset and the network.

The anchor
- Home domain: ${DOMAIN}, on the Stellar testnet. Discover everything from ${BASE}/.well-known/stellar.toml (SEP-1): WEB_AUTH_ENDPOINT, TRANSFER_SERVER, SIGNING_KEY and the asset (code MONAREF, its issuer in [[CURRENCIES]]). Read the endpoints from the stellar.toml instead of hard-coding them.
- Network passphrase "Test SDF Network ; September 2015"; Horizon https://horizon-testnet.stellar.org.
- MONAREF is a test asset with no value. Deposits and withdrawals of 1 to 100, no fee. There is no bank and no KYC: a deposit is paid when its sandbox button is pressed.
- Fair-use limits: 5 deposits per account and 20 per IP address a day, 3 transfers in flight per account, 120 requests a minute. Over a limit the anchor answers HTTP 429 (or 503 when busy) with {"error": "..."}; handle it and do not retry in a tight loop.

First look at my project: its language and framework, and how it already handles Stellar accounts (a browser wallet such as Freighter or Stellar Wallets Kit, or a server-side keypair). Use the official Stellar SDK for that language. Tell me your plan and the files you will change before you write code.

Implement
1. SEP-1: fetch and parse the stellar.toml.
2. Trustline: the user's account must trust MONAREF (code and issuer from the stellar.toml) before a deposit; this anchor does not pay accounts without one. Offer to add it with a changeTrust operation signed by the user.
3. SEP-10 sign-in: GET <WEB_AUTH_ENDPOINT>?account=<G...> returns {"transaction": ...}. Check it is a valid challenge signed by the stellar.toml SIGNING_KEY for home domain ${DOMAIN} (the SDK's WebAuth.readChallengeTx does this), have the user sign it, POST {"transaction": "<signed XDR>"} as JSON to the same endpoint, and keep the returned token. In a browser app the wallet signs: never ask for or touch the user's secret key.
4. SEP-6 deposit: GET <TRANSFER_SERVER>/deposit?asset_code=MONAREF&account=<G...>&amount=<1-100> with "Authorization: Bearer <token>". Keep the returned id. Then GET <TRANSFER_SERVER>/transaction?id=<id> (same header); its more_info_url is the sandbox page. The user presses "Simulate incoming transfer" there, or the app POSTs the form field id=<id> to <TRANSFER_SERVER>/more_info. Poll the transaction until its status is "completed" and show stellar_transaction_id.
5. SEP-6 withdrawal: GET <TRANSFER_SERVER>/withdraw?asset_code=MONAREF&type=bank_account&amount=<1-100> with the token. The answer has account_id, memo_type "text" and memo. Send a payment of exactly that amount of MONAREF to account_id with that text memo, signed by the user, then poll <TRANSFER_SERVER>/transaction?id=<id> until "completed".
6. Show the statuses (pending_user_transfer_start, pending_anchor, completed, error) and the anchor's errors, which come as {"error": "..."}.

Keep the home domain, the asset code and the network in configuration. Add a small script or test that runs the whole flow against ${DOMAIN} with a fresh testnet account funded by Friendbot (https://friendbot.stellar.org/?addr=<G...>). Testnet only: never use mainnet keys or real funds.`;

const QUICKSTART = `export BASE=${BASE}
export G=G...          # your testnet account (fund it: https://friendbot.stellar.org/?addr=$G)

# 1) SEP-1: everything else is read from here
curl -s $BASE/.well-known/stellar.toml

# 2) Trustline from $G to MONAREF (issuer in the stellar.toml), from your wallet or SDK

# 3) SEP-10: get a challenge, sign it with your key, exchange it for a token
curl -s "$BASE/auth?account=$G"
curl -s -X POST $BASE/auth -H 'content-type: application/json' \\
  -d '{"transaction":"<signed challenge XDR>"}'
export JWT=...

# 4) SEP-6 deposit: no bank here, the sandbox button plays it
curl -s -H "Authorization: Bearer $JWT" \\
  "$BASE/sep6/deposit?asset_code=MONAREF&account=$G&amount=10"
curl -s -X POST $BASE/sep6/more_info -d id=<ID>     # "Simulate incoming transfer"
curl -s -H "Authorization: Bearer $JWT" "$BASE/sep6/transaction?id=<ID>"
#    -> status "completed", stellar_transaction_id

# 5) SEP-6 withdrawal: pay the amount to account_id with the text memo it gives
curl -s -H "Authorization: Bearer $JWT" \\
  "$BASE/sep6/withdraw?asset_code=MONAREF&type=bank_account&amount=10"
#    -> {"id":"...","account_id":"G...","memo_type":"text","memo":"..."}
curl -s -H "Authorization: Bearer $JWT" "$BASE/sep6/transaction?id=<ID>"
#    -> "completed" once your payment is on the ledger`;

const REAL = [
  ['SEP-1, SEP-10, SEP-6', 'Real', 'Standard endpoints any Stellar SDK or wallet can use'],
  ['MONAREF payments', 'Real (testnet)', 'Paid on the testnet ledger; a withdrawal completes only when your payment is found there'],
  ['Incoming bank transfer', 'Simulated', 'The "Simulate incoming transfer" button on the transaction page'],
  ['KYC, quotes, fees', 'None', 'No SEP-12 or SEP-38; no fee'],
] as const;

const LIMITS = [
  'Fair use: 5 deposits per account and 20 per address a day, up to 3 transfers in flight per account, 120 requests a minute. Over a limit you get HTTP 429 with the reason.',
  'Your account needs a trustline to MONAREF before a deposit; there are no claimable balances.',
  'Transfers are kept in memory: one in flight when the anchor restarts is lost. Start a new one.',
  'The testnet is reset from time to time; after a reset the asset is issued again, so read the issuer from the stellar.toml rather than storing it.',
  'It is a sandbox with no value and no guarantee. For production, use a real SEP anchor: the same code, another home domain.',
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[170px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold text-as-ink-faint">{label}</dt>
      <dd className="as-mono min-w-0 break-all text-sm text-as-ink">{children}</dd>
    </div>
  );
}

function SectionHead({ title, lead }: { title: string; lead?: React.ReactNode }) {
  return (
    <>
      <h2 className="max-w-2xl font-heading text-3xl font-medium tracking-[-0.025em] text-as-ink md:text-4xl">{title}</h2>
      {lead && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-as-ink-muted">{lead}</p>}
    </>
  );
}

export default async function TestnetAnchorPage() {
  const live = await liveToml();

  return (
    <div className="as-grid-ground min-h-screen">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SiteNav />

        <header className="pb-6 pt-10 md:pt-16">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <StatusChip tone={live ? 'signal' : 'danger'} live={!!live} dot={!live}>
              {live ? 'Online' : 'Not answering right now'}
            </StatusChip>
            <span className="rounded-pill border border-as-hairline bg-as-surface-1 px-3 py-1 text-xs font-semibold text-as-ink-muted">
              Stellar testnet · SEP-1 · SEP-10 · SEP-6
            </span>
          </div>
          <h1 className="max-w-3xl font-heading text-5xl font-medium leading-[1.02] tracking-[-0.033em] text-as-ink sm:text-6xl">
            Mona Testnet Anchor
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-as-ink-muted">
            Add deposits and withdrawals to your wallet or app before you have a real anchor. <span className="as-mono text-as-ink">{DOMAIN}</span>{' '}
            speaks the standard SEP path, so code you write against it moves to any production SEP anchor by changing the home domain and the
            asset. Every payment is real on the testnet ledger, and we measure the anchor every 20 minutes like any other.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CopyButton text={PROMPT}>Copy for Claude</CopyButton>
            <a href="#quickstart" className="as-btn as-btn--outline">
              Quickstart
            </a>
          </div>
        </header>

        <section id="connect" className="scroll-mt-8 py-12 md:py-16">
          <SectionHead
            title="Two values to connect it"
            lead={
              <>
                The home domain and the asset. Your wallet or SDK reads everything else from the anchor&apos;s stellar.toml, read live below.
              </>
            }
          />
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="as-panel px-5 py-2">
              <dl className="divide-y divide-as-hairline">
                <Row label="Home domain">{DOMAIN}</Row>
                <Row label="Asset">{live?.code ?? 'MONAREF'}</Row>
                <Row label="Issuer">{live?.issuer ?? '(in the stellar.toml)'}</Row>
                <Row label="Network">Test SDF Network ; September 2015</Row>
                <Row label="SEP-10 auth">{live?.auth ?? `${BASE}/auth`}</Row>
                <Row label="SEP-6 transfer server">{live?.transfer ?? `${BASE}/sep6`}</Row>
                <Row label="SIGNING_KEY">{live?.signingKey ?? '(in the stellar.toml)'}</Row>
                <Row label="Amounts">1 to 100 per transfer, no fee</Row>
              </dl>
            </div>
            <div className="as-panel px-5 py-5">
              <h3 className="mb-3 font-heading text-lg font-semibold text-as-ink">What is real</h3>
              <ul className="flex flex-col divide-y divide-as-hairline text-sm">
                {REAL.map(([what, status, detail]) => (
                  <li key={what} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-as-ink">{what}</span>
                      <StatusChip tone={status.startsWith('Real') ? 'signal' : status === 'Simulated' ? 'amber' : 'neutral'}>{status}</StatusChip>
                    </div>
                    <p className="mt-1 text-as-ink-muted">{detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="quickstart" className="scroll-mt-8 py-12 md:py-16">
          <SectionHead
            title="The whole flow, by hand"
            lead="Sign in, deposit, withdraw. Signing the challenge and the payments is your wallet's or SDK's job; the rest is plain HTTP."
          />
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="as-panel min-w-0 px-5 py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-heading text-lg font-semibold text-as-ink">Quickstart</h3>
                <CopyButton text={QUICKSTART} className="as-btn as-btn--outline as-btn--sm">
                  Copy
                </CopyButton>
              </div>
              <pre className="as-mono overflow-x-auto rounded-as-md bg-as-surface-2 px-4 py-3 text-xs leading-relaxed text-as-ink">{QUICKSTART}</pre>
            </div>
            <div className="flex flex-col gap-6">
              <div className="as-panel px-5 py-5">
                <h3 className="mb-3 font-heading text-lg font-semibold text-as-ink">Good to know</h3>
                <ul className="flex flex-col gap-2 text-sm leading-relaxed text-as-ink-muted">
                  {LIMITS.map((l) => (
                    <li key={l} className="flex gap-2">
                      <span aria-hidden="true" className="text-as-signal">
                        ·
                      </span>
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="as-panel px-5 py-5 text-sm text-as-ink-muted">
                <p>
                  Open source:{' '}
                  <a href={CODE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-as-ink underline decoration-as-hairline">
                    the anchor&apos;s code <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                  . Its availability and speed are on{' '}
                  <Link href="/scores" className="text-as-ink underline decoration-as-hairline">
                    the live scores
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="ai" className="scroll-mt-8 py-12 md:py-16">
          <SectionHead
            title="Or let your AI assistant do it"
            lead="Copy the instructions and paste them into Claude Code, or any assistant that works in your project. It reads your code first, tells you its plan, then adds sign-in, deposit and withdrawal through the standard SEP calls, with the home domain and asset in configuration."
          />
          <div className="mt-8 as-panel px-5 py-5">
            <CopyButton text={PROMPT}>Copy for Claude</CopyButton>
            <details className="group mt-5 rounded-as-md border border-as-hairline bg-as-surface-2">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-as-ink [&::-webkit-details-marker]:hidden">
                Read what gets copied
                <span aria-hidden="true" className="text-as-ink-faint transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <pre className="as-mono max-h-[28rem] overflow-auto whitespace-pre-wrap border-t border-as-hairline px-4 py-3 text-xs leading-relaxed text-as-ink-muted">
                {PROMPT}
              </pre>
            </details>
          </div>
        </section>

        <div className="h-16" />
      </div>
    </div>
  );
}
