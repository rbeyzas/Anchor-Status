# Roadmap & SCF plan

**Continuation path:** apply to InstaAward right after the Rise In × Stellar Pro Hackathon, then to an SCF Build Award once the new scoring methodology ([`docs/SCORING.md`](SCORING.md)) is live on mainnet and backed by real transfers.

## Where we are (hackathon, September 2026)

- `AnchorRegistry` and `PerformanceOracle` are deployed on testnet, with reporter authorization per source type, optional stake custody, and an on-chain trend and risk floor per anchor. The oracle publishes; it never slashes.
- `mainnet-probe` is the primary mainnet collector: it discovers every SEP-6/24 anchor on mainnet and checks each one's stellar.toml, `/info`, SEP-10 sign-in and deposit start every 20 minutes, without moving funds, publishing an evidence document per check. `passive-monitor` reads Horizon for context only (payment activity, and chain signals for anchors that issue their own asset); volume is never scored. `testnet-probe` gives every listed testnet anchor the same read-only check and then a real deposit and withdrawal verified on the ledger, and four controlled reference anchors run alongside.
- A read-only dashboard of every discovered mainnet anchor, with its score, confidence, pillars and the evidence behind each report.

## Milestones

| # | When | Deliverable | Success measure |
| --- | --- | --- | --- |
| **M1: New scoring live** | Hackathon + 2 weeks | Phases 1-3 of [`docs/SCORING.md`](SCORING.md) running on the collector host: score cards with availability, speed, integrity and market pillars, a separate confidence, and gates, published on-chain with the hash of their inputs. | Every discovered mainnet anchor, and every admitted testnet anchor, has a score card with a confidence; at least 30 days of history exist; a third party can reproduce one card with `verify-score` |
| **M2: Anchor onboarding** | +1 month | Self-serve anchor registration and staking in the UI. Anchors can dispute a report. Add SEP-6 and SEP-31 probes alongside SEP-24. | 3+ anchors stake collateral voluntarily |
| **M3: Wallet SDK** | +2 months | `@anchor-status/routing` npm package plus a read API, so any wallet can call "best anchor for a given asset or currency". Add passkey smart-wallet onboarding. | 1 wallet partner integrates routing |
| **M4: Mainnet** | +3–4 months | Security review of both contracts, a multi-reporter quorum (no single reporter key can move a score), a Completion pillar from real mainnet transfers ([`docs/SCORING.md`](SCORING.md) section 18), mainnet deploy with USDC stake | Live mainnet routing; first real risk flag published end-to-end |

## Known limitations we are addressing

- **Reporter trust.** Today one authorized key per source type submits reports. In M4 a report only counts when a quorum of independent reporters agrees.
- **No real mainnet transfers yet.** Mainnet checks stop before any money moves, so "does the money arrive" is not measured on mainnet. Anchors that decline an anonymous wallet can only be tested up to that step, which lowers their confidence rather than their score. The Completion pillar (M4) closes this.
- **Probe failures vs. anchor failures.** Early probe runs failed because of bugs in our own form driver (unlabelled inputs, a missing trustline, a mis-targeted Submit button), and those failures were submitted on-chain. The driver is fixed and live runs now complete in ~20s. If the probe cannot render an anchor's form, the run is recorded as *inconclusive* and never submitted. Next step: let an anchor dispute a report (M2).

## Team capacity

The core contracts, collectors and dashboard were built and tested before the event (Rust, TypeScript and Python test suites in every package). That means post-hackathon work goes into integrations and users, not rewrites.
