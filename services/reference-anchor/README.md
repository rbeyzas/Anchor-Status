# reference-anchor

A small testnet anchor we control, at `https://ref1.monarank.xyz`. It is
registered as `RealTestnet` and measured like any other anchor: testnet-probe
signs in with SEP-10, deposits and withdraws over SEP-6, and checks every
payment on the ledger. Because its stellar.toml and `SIGNING_KEY` are ours,
the operator claim and dispute flows (D3) can be shown on it end to end.

| Path | |
| --- | --- |
| `GET /.well-known/stellar.toml` | SEP-1, with CORS |
| `GET /auth?account=`, `POST /auth` | SEP-10 challenge and token |
| `GET /sep6/info` | One asset, `MONAREF`, 1–100 per transfer, no fee |
| `GET /sep6/deposit`, `/sep6/withdraw`, `/sep6/transaction` | SEP-6, with the token |
| `GET /sep6/more_info?id=`, `POST /sep6/more_info` | The sandbox page: "Simulate incoming transfer" pays the deposit out |

There is no fiat. A deposit is paid from the distribution account once its
sandbox button is pressed; a withdrawal completes once a payment of the
amount, with its text memo, from the account that asked, is on the ledger.
Transfers are kept in memory, so a restart drops the ones in flight.
`MONAREF` has no value; the issuer's `home_domain` is `ref1.monarank.xyz`.

## Fair-use limits

It is a public sandbox, so nobody may drain the asset, flood the one-at-a-time
payout queue or memory, or crowd out our own reporters' probes
(`DEFAULT_LIMITS` in `src/anchor.ts`):

| Limit | Default |
| --- | --- |
| Deposits per account / per IP address, per day | 5 / 20 |
| Transfers in flight per account | 3 |
| Requests per IP address, per minute (not `stellar.toml`) | 120 |
| Transfers kept in memory | 5,000 |
| Payouts waiting at once | 10 |
| Reserve: below this `MONAREF` balance only trusted clients get deposits | 50,000 |

`TRUSTED_IPS` (in `fly.toml`) lists the reporters' addresses; they skip every
limit. A withdrawal's payment is searched for back to when it was asked for
(not only the last 100 payments, which anyone could push out), at most every
5 s. `GET /health` reports the balance (`low` under the reserve), transfers
and payouts in flight.

Tests: `npm test`. They drive the anchor with testnet-probe's own parsers
(stellar.toml, the sandbox form, SEP-10 signature checks), with the ledger
faked.

## Setup (once)

```bash
npm install
npm run setup -- .env.ref1
```

creates new issuer, distribution and signing keys, funds them with
Friendbot, sets the issuer's `home_domain`, and sends the distribution
account 1,000,000 `MONAREF`. The secrets are written only to `.env.ref1`
(mode 600, git-ignored). The issuer's secret is not needed to run the anchor
and is not sent to the server.

## Deploy (fly.io)

```bash
fly apps create monarank-ref1
grep -v '^ISSUER_SECRET=' .env.ref1 | fly secrets import -a monarank-ref1
fly deploy
fly certs add ref1.monarank.xyz -a monarank-ref1
```

then point `ref1.monarank.xyz` at the app (a `CNAME` to
`monarank-ref1.fly.dev`, in the DNS for `monarank.xyz`). The machine stays
on (`auto_stop_machines = "off"`): a stopped one would fail probe rounds.
