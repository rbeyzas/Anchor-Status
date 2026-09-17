# Roadmap & SCF plan

**Continuation path:** apply to InstaAward right after the Rise In × Stellar Pro Hackathon, then to an SCF Build Award once a TRY anchor is routing live traffic on mainnet.

## Where we are (hackathon, September 2026)

- `AnchorRegistry` and `PerformanceOracle` are deployed on testnet, with reporter authorization per source type, stake custody and automatic slashing.
- Three collectors run: mainnet activity (read-only), live SEP-10 + SEP-24 testnet probes, and four controlled reference anchors.
- Ramp: users connect with Stellar Wallets Kit and deposit or withdraw through the highest-scoring anchor via SEP-10 and SEP-24. Anchors below the safety bar are never offered.

## Milestones

| # | When | Deliverable | Success measure |
| --- | --- | --- | --- |
| **M1: TRY live on testnet** | Hackathon + 2 weeks | Register the event's TRY anchor on-chain and route the ramp's default TRY flow through it. Run the probe continuously on a hosted schedule. Add a Turkish UI. | 20+ real users complete a TRY deposit on testnet; probe success rate is tracked |
| **M2: Anchor onboarding** | +1 month | Self-serve anchor registration and staking in the UI. Anchors can dispute a report. Add SEP-6 and SEP-31 probes alongside SEP-24. | 3+ anchors stake collateral voluntarily |
| **M3: Wallet SDK** | +2 months | `@anchor-status/routing` npm package plus a read API, so any wallet can call "best anchor for TRY/EUR/…". Add passkey smart-wallet onboarding. | 1 wallet partner integrates routing |
| **M4: Mainnet** | +3–4 months | Security review of both contracts, a multi-reporter quorum (no single reporter key can move a score), mainnet deploy with USDC stake | Live mainnet routing; first real slash handled end-to-end |

## Known limitations we are addressing

- **Reporter trust.** Today one authorized key per source type submits reports. In M4 a report only counts when a quorum of independent reporters agrees.
- **Mainnet signal is a proxy.** Horizon payment frequency is a liveness proxy, not settlement latency. SEP-24 probes remain the primary latency signal.
- **Probe failures vs. anchor failures.** Early probe runs failed because of bugs in our own form driver (unlabelled inputs, a missing trustline, a mis-targeted Submit button), and those failures were submitted on-chain. The driver is fixed and live runs now complete in ~20s. If the probe cannot render an anchor's form, the run is recorded as *inconclusive* and never submitted. Next step: let an anchor dispute a report (M2).

## Team capacity

The core contracts, collectors and dashboard were built and tested before the event (Rust, TypeScript and Python test suites in every package). That means post-hackathon work goes into integrations and users, not rewrites.
