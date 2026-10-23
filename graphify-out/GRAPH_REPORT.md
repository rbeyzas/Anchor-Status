# Graph Report - Anchor-Status  (2026-10-23)

## Corpus Check
- 115 files · ~494,255 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2300 nodes · 4913 edges · 126 communities (99 shown, 27 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.85)
- Token cost: 93,893 input · 0 output

## Community Hubs (Navigation)
- PerformanceOracle Contract
- Oracle Contract Tests
- AnchorRegistry Contract
- Scores Page & Contract State
- History Archive Merging
- Apply Pages
- Registry Tests & Claims
- Scoring Constants
- Mainnet Candidate Intake
- Root Layout & Shared UI
- Aggregator Config
- Anchor Detail Modal
- Reference Anchor Server
- Payment Aggregation
- Landing Page Content
- Landing & Dashboard Shell
- Testnet Money Flow
- Rust EMA Scoring
- Security & Evidence Log
- Score Input Builder
- Anchor Aliases & Dormancy
- Methodology Page
- Dashboard TS Config
- History Archiver Package
- Mainnet Probe Core
- Passive Monitor Package
- Registry Events
- Testnet Accounts & Payments
- Chain Anchor Sync
- HTTP Fetch Utilities
- Anchor Card & Score Journey
- Mainnet Probe Docs
- Aggregator Evidence Docs
- Mainnet Anchor Discovery
- Chain Signals & Issued Assets
- Mainnet Probe Package
- Oracle Property Tests
- Report Normalization
- Dashboard Filters
- Mainnet Onboarding
- Reflector Price Feeds
- Scoring Calibration
- Reference Anchor Package
- Architecture Diagram
- Mainnet Evidence Hashing
- Testnet Candidates
- Contract Docs & Verdicts
- D3 Claims & Disputes
- Aggregator TS Config
- Archiver TS Config
- Mainnet Probe TS Config
- Passive Monitor TS Config
- FX Rates & Chain Tests
- Testnet Anchors File
- Anchor Status Fetch
- Testnet Probe TS Config
- Registry Client Interface
- Oracle Events
- Onboarding API Routes
- AMM Market Quotes
- Aggregator Package
- Asset Flow Bucketing
- Testnet Probe Package
- Live Contract Fixtures
- D3 Rehearsal Script
- Collector Incidents
- Project README
- Testnet Registry Chain
- Demo Walkthrough Steps
- Scoring v2 Prompt
- Mainnet Probe Scripts
- Reference Anchor TS Config
- Testnet Probe Dev Deps
- SEP-6 Sandbox Flow
- Registry Property Tests
- Dashboard Docs
- Collection Round
- Aggregator Scripts
- Passive Monitor Config
- Interactive Flow
- Full System Setup Guide
- Collector Host Docs
- Horizon Payment Verify
- Registry Lifecycle Docs
- Graph Sync Script
- Trade History Drawdown
- Reference Anchor Setup
- SEP-24 Deposit Flow
- Registry Upgrade Test
- Oracle Fuzz Target
- Upgrade Rehearsal Script
- Roadmap & SCF Plan
- Public Host Check
- Archive Backup Script
- Contract Upgrade Script
- Testnet Scoring Tests
- Dev Deps
- Testnet Evidence Hashing
- Orbit Trails
- Contract Crates
- Collect Script
- Server Autodeploy
- Registry Errors
- Oracle Errors
- Next Config
- Next Env Types
- Tailwind Config
- Deploy-to-Server Script
- Setup Secondary Script
- AnchorHealth Type
- AnchorInfo Type
- Soroban Bytes
- Soroban Client
- AnchorInfo Ref (A)
- AnchorInfo Ref (B)
- AnchorHealth Ref
- ScoreCardInput Ref (A)
- ScoreCardInput Ref (B)
- Scoring v2 Prompt Ref
- Roadmap Ref
- ScoreCard Type
- Soroban Vec
- Verdict Type

## God Nodes (most connected - your core abstractions)
1. `setup()` - 71 edges
2. `setup()` - 41 edges
3. `PerformanceOracle` - 32 edges
4. `AnchorRegistry` - 31 edges
5. `quorum_setup()` - 25 edges
6. `vitest` - 24 edges
7. `register_and_stake()` - 24 edges
8. `main()` - 21 edges
9. `card()` - 21 edges
10. `mainnet_anchor()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Time-locked upgrades` --semantically_similar_to--> `No slashing design decision`  [INFERRED] [semantically similar]
  contracts/anchor-registry/README.md → README.md
- `Data layer` --shares_data_with--> `score-summary.json`  [EXTRACTED]
  dashboard/README.md → services/aggregator/README.md
- `include` --extends--> `tsx`  [EXTRACTED]
  dashboard/tsconfig.json → services/aggregator/package.json
- `Hackathon judging criteria` --conceptually_related_to--> `Mona (Soroban SEP-24 reliability oracle)`  [INFERRED]
  judging-criteria.md → README.md
- `performance_oracle_live.wasm` --conceptually_related_to--> `PerformanceOracle contract`  [EXTRACTED]
  contracts/fixtures/README.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Collector to aggregator to oracle to registry to dashboard flow** — readme_mainnet_probe, readme_testnet_probe, readme_passive_monitor, readme_aggregator, readme_performance_oracle, readme_anchor_registry, readme_dashboard [EXTRACTED 0.95]
- **Three evidence sources feeding one on-chain score** — assets_readme_hero_real_mainnet, assets_readme_hero_real_testnet, assets_readme_hero_mock_anchors, assets_readme_hero_onchain_score [EXTRACTED 1.00]
- **Four collectors feeding the aggregator** — assets_readme_architecture_mainnet_probe, assets_readme_architecture_testnet_probe, assets_readme_architecture_passive_monitor, assets_readme_hero_mock_anchors, assets_readme_architecture_aggregator [EXTRACTED 1.00]
- **Aggregator publishes scores across two Soroban contracts** — assets_readme_architecture_aggregator, assets_readme_architecture_performance_oracle, assets_readme_architecture_anchor_registry, assets_readme_architecture_dashboard [EXTRACTED 1.00]
- **Mainnet readiness documentation set** — docs_mainnet_runbook, docs_security, docs_instaward_evidence [EXTRACTED 1.00]
- **Safe upgrade flow (timelock, rehearsal, reproducible build)** — docs_security_timelocked_upgrade, docs_instaward_evidence_rehearsal, docs_mainnet_runbook_reproducible_build, docs_instaward_evidence_upgrade_scripts [INFERRED 0.85]

## Communities (126 total, 27 thin omitted)

### Community 0 - "PerformanceOracle Contract"
Cohesion: 0.07
Nodes (73): card(), Env, bump_instance(), bump_persistent(), DAY_IN_LEDGERS, DEFAULT_DISPUTE_COOLDOWN_SECONDS, DEFAULT_DISPUTE_MIN_STAKE, dispute_config() (+65 more)

### Community 1 - "Oracle Contract Tests"
Cohesion: 0.06
Nodes (96): a_card_for_an_unregistered_anchor_is_rejected(), a_card_from_an_unauthorized_reporter_is_rejected(), a_card_must_come_from_a_reporter_for_the_anchors_own_source_type(), a_card_whose_window_ends_in_the_future_is_rejected(), a_deactivated_anchor_gets_no_report_or_card_until_reactivated(), a_dispute_names_the_current_card(), a_dispute_needs_the_minimum_stake(), a_flag_holds_when_most_reporters_raise_it() (+88 more)

### Community 2 - "AnchorRegistry Contract"
Cohesion: 0.09
Nodes (46): AnchorRegistry, bump_instance(), bump_persistent(), claim_message_bytes(), DAY_IN_LEDGERS, INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD, is_deactivated() (+38 more)

### Community 3 - "Scores Page & Contract State"
Cohesion: 0.06
Nodes (55): Page(), revalidate, anchorAtKey(), AnchorInfo, anchorInfoKey(), cardKey(), contractDataKey(), contractDataVal() (+47 more)

### Community 4 - "History Archive Merging"
Cohesion: 0.07
Nodes (42): loadArchive(), mergeAnchor(), mergeSorted(), riskEventKey(), saveArchive(), scoreCardKey(), scorePointKey(), slashEventKey() (+34 more)

### Community 5 - "Apply Pages"
Cohesion: 0.07
Nodes (38): metadata, metadata, STEPS, metadata, ApplyForm(), submit(), dateTime(), Outcome (+30 more)

### Community 6 - "Registry Tests & Claims"
Cohesion: 0.10
Nodes (55): a_claim_signature_works_once(), a_claim_signed_by_another_key_fails(), a_claim_signed_for_another_network_or_operator_fails(), a_deactivated_anchor_cannot_be_claimed(), a_pending_withdrawal_blocks_removal(), a_record_holding_a_stake_cannot_be_claimed(), a_score_update_keeps_the_index_entries_alive(), an_upgrade_waits_out_the_delay_and_can_be_cancelled() (+47 more)

### Community 7 - "Scoring Constants"
Cohesion: 0.08
Nodes (50): AVAILABILITY_RECENT_SHARE, CONFIDENCE_FULL_DAYS, CONFIDENCE_FULL_SAMPLES, CONFIDENCE_INSUFFICIENT, CONFIDENCE_LOW, CONFIDENCE_MEDIUM, COVERAGE_UNKNOWN, DEPEG_HOURS (+42 more)

### Community 8 - "Mainnet Candidate Intake"
Cohesion: 0.08
Nodes (41): loadAnchorsFile(), appendSubmission(), CandidateStatus, CheckName, CheckResult, decideSubmission(), Decision, __dirname (+33 more)

### Community 9 - "Root Layout & Shared UI"
Cohesion: 0.04
Nodes (45): metadata, mono, sans, ThemeProvider(), dependencies, framer-motion, next, next-themes (+37 more)

### Community 10 - "Aggregator Config"
Cohesion: 0.08
Nodes (40): config, __dirname, repoRoot, scoreCardsStatePath(), clientCache, getReporterClient(), publishScoreCard(), QuorumSettings (+32 more)

### Community 11 - "Anchor Detail Modal"
Cohesion: 0.12
Nodes (30): PillarRadar(), BAND_TONE, ConfidenceChip(), FlagChips(), PillarBars(), PillarDots(), describeHealth(), RISK_LABEL (+22 more)

### Community 12 - "Reference Anchor Server"
Cohesion: 0.08
Nodes (29): AnchorConfig, b64url(), Chain, createAnchor(), account(), handle(), newTransfer(), prune() (+21 more)

### Community 13 - "Payment Aggregation"
Cohesion: 0.11
Nodes (26): aggregatePayments(), statsFor(), loadAnchorsFile(), fetchRecentPayments(), isHistoryMissing(), PAYMENT_TYPES, RecentPayments, sleep() (+18 more)

### Community 14 - "Landing Page Content"
Cohesion: 0.09
Nodes (25): EMPTY, EVIDENCE, HomeSnapshot, revalidate, STEPS, TIER_TEXT, ProbeTimeline(), STATE (+17 more)

### Community 15 - "Landing & Dashboard Shell"
Cohesion: 0.12
Nodes (26): LandingPage(), loadSnapshot(), AnchorCard(), AnchorDetailModal(), Dashboard(), average(), StatsBar(), counters (+18 more)

### Community 16 - "Testnet Money Flow"
Cohesion: 0.10
Nodes (29): floor7(), FlowDeps, msg(), runMoneyFlow(), step(), short(), StepFailure, TERMINAL (+21 more)

### Community 17 - "Rust EMA Scoring"
Cohesion: 0.13
Nodes (26): a_steady_anchor_below_100_does_not_read_as_degrading_from_the_start(), consecutive_failures_reset_on_success(), decay(), ema_converges_toward_observation(), ema_update(), ema_weights_real_sources_more_than_mock(), ema_with_weight(), feed() (+18 more)

### Community 18 - "Security & Evidence Log"
Cohesion: 0.10
Nodes (33): Evidence log, Operator claims and disputes (D3), 24-hour time lock live, Property tests and cargo-fuzz run, Reporter quorum implementation, Reference anchor ref1.monarank.xyz, Registry paged index live upgrade, Rehearsal on fresh testnet contracts (+25 more)

### Community 19 - "Score Input Builder"
Cohesion: 0.12
Nodes (29): METHODOLOGY_VERSION, AnchorContext, buildInputs(), coverageOf(), dayDigest(), fixed(), flowAggregates(), FlowHistory (+21 more)

### Community 20 - "Anchor Aliases & Dormancy"
Cohesion: 0.14
Nodes (23): assignAliases(), operatorKey(), isDormant(), Listing, mapWithConcurrency(), ourNetworkIsDown(), AssetStatus, listDomainAssets() (+15 more)

### Community 21 - "Methodology Page"
Cohesion: 0.14
Nodes (21): metadata, MethodologyPage(), PILLAR_COPY, STAGES, PILLAR_LABEL, PRESETS, ScoreCalculator(), CONFIDENCE_BANDS (+13 more)

### Community 22 - "Dashboard TS Config"
Cohesion: 0.07
Nodes (27): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+19 more)

### Community 23 - "History Archiver Package"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+18 more)

### Community 24 - "Mainnet Probe Core"
Cohesion: 0.12
Nodes (21): firstDepositAsset(), infoListsEnabledAsset(), isPolicyRejection(), message(), probeAnchor(), ProbeChecks, ProbeOptions, ProbeTranscript (+13 more)

### Community 25 - "Passive Monitor Package"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node (+18 more)

### Community 26 - "Registry Events"
Cohesion: 0.14
Nodes (24): AdminChanged, AdminProposed, AnchorClaimed, AnchorDeactivated, AnchorReactivated, AnchorRegistered, AnchorRemoved, IndexFinalized (+16 more)

### Community 27 - "Testnet Accounts & Payments"
Cohesion: 0.15
Nodes (17): anchor(), loadTestnetAnchors(), createAndFundAccount(), balanceOf(), memoFor(), sendPayment(), appendResult(), isProbeEnvironmentError() (+9 more)

### Community 28 - "Chain Anchor Sync"
Cohesion: 0.14
Nodes (17): ChainAnchor, mainnetFromChain(), chain, testnetFromChain(), TestnetListEntry, config, __dirname, repoRoot (+9 more)

### Community 29 - "HTTP Fetch Utilities"
Cohesion: 0.15
Nodes (16): Fetch, HttpError, Timed, timedFetch(), DomainListing, fresh(), ISSUER_CACHE_MS, IssuerCache (+8 more)

### Community 30 - "Anchor Card & Score Journey"
Cohesion: 0.14
Nodes (16): LABEL, ScoreJourney(), tone(), reducedMotion(), scoreColorClass(), ScoreValue(), TIER_STROKE_VAR, TIER_TEXT_CLASS (+8 more)

### Community 31 - "Mainnet Probe Docs"
Cohesion: 0.09
Nodes (21): End-to-end demo walkthrough, Applications — `npm run onboard` and `npm run intake`, Anchor discovery, Discovery — `npm run discover`, Evidence documents (SHA-256 on-chain), Evidence — `npm run verify -- <sha256>`, Inconclusive rounds (collector-side failure), mainnet-probe (+13 more)

### Community 32 - "Aggregator Evidence Docs"
Cohesion: 0.18
Nodes (19): canonicalJson(), SCORE_INPUTS_SCHEMA, sha256Hex(), writeDocument(), checkQuorum(), combineCards(), evidenceUrlsFromToml(), FLAG_REPORTER_DISAGREEMENT (+11 more)

### Community 33 - "Mainnet Anchor Discovery"
Cohesion: 0.15
Nodes (15): anchorIdFor(), AnchorsFile, Candidate, cleanDirectoryName(), dedupeByTransferHost(), listingFrom(), MainnetAnchor, mergeAnchors() (+7 more)

### Community 34 - "Chain Signals & Issued Assets"
Cohesion: 0.14
Nodes (15): issuedAssets(), IssuedFiat, runChainSignals(), StatusFile, IssuedAsset, appendSamples(), sample(), ReferenceRates (+7 more)

### Community 35 - "Mainnet Probe Package"
Cohesion: 0.09
Nodes (22): node-schedule, dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, tsx, vitest (+14 more)

### Community 36 - "Oracle Property Tests"
Cohesion: 0.13
Nodes (20): Card, CASES, round(), Address, Env, Option, StdVec, Strategy (+12 more)

### Community 37 - "Report Normalization"
Cohesion: 0.25
Nodes (14): dedupKey(), normalizeMainnetProbeResult(), normalizePassiveMonitorProfile(), normalizeTestnetProbeResult(), readJsonArray(), readMainnetProbeReports(), readPassiveMonitorReports(), readTestnetProbeReports() (+6 more)

### Community 38 - "Dashboard Filters"
Cohesion: 0.13
Nodes (16): SOURCE_ORDER, FilterBar(), FILTERS, FilterValue, Stat(), StatStrip(), useCountUp(), fold() (+8 more)

### Community 39 - "Mainnet Onboarding"
Cohesion: 0.18
Nodes (19): IssuerRecord, cleanName(), evaluateCandidate(), Evaluation, MAINNET_PASSPHRASE, OnboardingDeps, plainError(), daysAgo() (+11 more)

### Community 40 - "Reflector Price Feeds"
Cohesion: 0.18
Nodes (13): AssetKey, assetName(), assetScVal(), contractAsset(), FEEDS, Invoke, Reflector, ReflectorOptions (+5 more)

### Community 41 - "Scoring Calibration"
Cohesion: 0.25
Nodes (18): asToday(), main(), AssetInfo, floorToHour(), AnchorFlowHistory, contextFor(), dates(), fillLegacySigningKeys() (+10 more)

### Community 42 - "Reference Anchor Package"
Cohesion: 0.10
Nodes (19): dependencies, @stellar/stellar-sdk, tsx, description, devDependencies, @types/node, typescript, vitest (+11 more)

### Community 43 - "Architecture Diagram"
Cohesion: 0.12
Nodes (19): Oracle Pipeline Architecture Diagram, aggregator, AnchorRegistry (Soroban contract), /apply onboarding intake, dashboard, mainnet-probe, passive-monitor, PerformanceOracle (Soroban contract) (+11 more)

### Community 44 - "Mainnet Evidence Hashing"
Cohesion: 0.20
Nodes (14): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence(), Check, EvidenceDoc, findPayout(), HorizonOperation (+6 more)

### Community 45 - "Testnet Candidates"
Cohesion: 0.15
Nodes (15): saveTestnetAnchors(), CandidateStatus, CheckName, CheckResult, HOSTNAME, ingestSubmissions(), loadOnboardingFile(), normalizeDomainInput() (+7 more)

### Community 46 - "Contract Docs & Verdicts"
Cohesion: 0.14
Nodes (18): Anchor deactivate/reactivate/remove lifecycle, update_score (oracle-only), performance-oracle README, authorize_reporter, get_verdict, performance-oracle, publish_score_card, Risk floor (+10 more)

### Community 47 - "D3 Claims & Disputes"
Cohesion: 0.27
Nodes (17): anchorInfo(), attest(), claim(), claimMessage(), Client, disputeOpen(), disputeVote(), json() (+9 more)

### Community 48 - "Aggregator TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 49 - "Archiver TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 50 - "Mainnet Probe TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 51 - "Passive Monitor TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 52 - "FX Rates & Chain Tests"
Cohesion: 0.18
Nodes (10): vitest, ARST, CURRENCY_API, EXCHANGERATE_API, FxSource, FxTable, loadFxTable(), usdPerUnit() (+2 more)

### Community 53 - "Testnet Anchors File"
Cohesion: 0.22
Nodes (13): TestnetAnchor, testnetAnchorId(), TestnetAnchorsFile, FlowResult, FlowTarget, checksFromFlow(), cleanName(), CONTROL (+5 more)

### Community 54 - "Anchor Status Fetch"
Cohesion: 0.21
Nodes (13): describeProblem(), FETCH_TIMEOUT_MS, fetchAnchorStatus(), issuedAssets(), LastProbe, lastProbeView(), mergeStatusInto(), policyNote() (+5 more)

### Community 55 - "Testnet Probe TS Config"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 56 - "Registry Client Interface"
Cohesion: 0.30
Nodes (8): AnchorRegistryInterface, Address, BytesN, Env, Error, Option, Result, Symbol

### Community 57 - "Oracle Events"
Cohesion: 0.21
Nodes (14): AdminChanged, AdminProposed, DisputeConfigSet, Initialized, QuorumConfigSet, ReporterAuthorized, ReporterRevoked, Address (+6 more)

### Community 58 - "Onboarding API Routes"
Cohesion: 0.19
Nodes (9): dynamic, POST(), base, dynamic, POST(), handleApplication(), json(), ProxyOptions (+1 more)

### Community 59 - "AMM Market Quotes"
Cohesion: 0.16
Nodes (14): AmmQuote, assetParams(), DEPTH_BAND, fetchQuotes(), Level, MarketSample, MAX_SPREAD, MIN_DEPTH_USD (+6 more)

### Community 60 - "Aggregator Package"
Cohesion: 0.14
Nodes (13): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+5 more)

### Community 61 - "Asset Flow Bucketing"
Cohesion: 0.21
Nodes (13): AssetFlows, assetKey(), bucketize(), classify(), DayBucket, emptyBucket(), FLOW_DAYS, FlowsFile (+5 more)

### Community 62 - "Testnet Probe Package"
Cohesion: 0.14
Nodes (13): description, name, private, scripts, build, onboard, probe, register (+5 more)

### Community 63 - "Live Contract Fixtures"
Cohesion: 0.24
Nodes (12): Live contract fixtures README, performance_oracle_live.wasm, anchor_registry_live.wasm, Data layer, AnchorRegistry contract, Persistent state in /var/lib/anchor-status, dashboard (Next.js), history-archiver service (+4 more)

### Community 64 - "D3 Rehearsal Script"
Cohesion: 0.27
Nodes (7): addr(), call(), log(), publish(), raw(), refused(), rehearse-d3.sh script

### Community 65 - "Collector Incidents"
Cohesion: 0.24
Nodes (11): applyIncidents(), COLLECTOR_INCIDENTS, CollectorIncident, IncidentExclusion, isConnectionFailure(), INCIDENT, probe(), proof() (+3 more)

### Community 66 - "Project README"
Cohesion: 0.17
Nodes (11): Hackathon judging criteria, Deployed testnet contracts, Design notes, How it works, License, Mona (Soroban SEP-24 reliability oracle), Quick start, Repository layout (+3 more)

### Community 67 - "Testnet Registry Chain"
Cohesion: 0.27
Nodes (8): registeredAnchorIds(), registerTestnetAnchor(), registry(), config, __dirname, repoRoot, anchors, missing

### Community 68 - "Demo Walkthrough Steps"
Cohesion: 0.18
Nodes (10): 1) Introduce the three layers, 2) Open the dashboard, 3) Show the filters, 4) Click an anchor to open its detail view, 5) Show risk detection live (the actual "wow" moment), 6) Closing, End-to-End Demo — Presentation Walkthrough, Prerequisites (+2 more)

### Community 69 - "Scoring v2 Prompt"
Cohesion: 0.18
Nodes (10): Context you must know, Ground rules, Part A: remove the TRY focus, Part B: implementation, Phase 1: contract, engine and publisher on existing data, Phase 2: integrity checklist, Phase 3: chain signals (Market and flows), Phase 4: docs and handoff (+2 more)

### Community 70 - "Mainnet Probe Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, discover, intake, onboard, probe, register, sync-from-chain (+3 more)

### Community 71 - "Reference Anchor TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+2 more)

### Community 72 - "Testnet Probe Dev Deps"
Cohesion: 0.18
Nodes (11): devDependencies, tsx, @types/node, @types/node-schedule, typescript, vitest, tsx, @types/node (+3 more)

### Community 73 - "SEP-6 Sandbox Flow"
Cohesion: 0.31
Nodes (10): attr(), base(), completeSandboxLeg(), findSandboxForm(), getJson(), getSep6Info(), requestDeposit(), requestWithdraw() (+2 more)

### Community 74 - "Registry Property Tests"
Cohesion: 0.22
Nodes (9): id(), listed(), Op, AnchorRegistryClient, Env, StdVec, Strategy, Symbol (+1 more)

### Community 75 - "Dashboard Docs"
Cohesion: 0.22
Nodes (10): dashboard README, Applications, dashboard, Mona design system (as-* tokens), Home page live-data (lib/home.ts), Score card display and confidence withholding, Score cards, Setup and running (+2 more)

### Community 76 - "Collection Round"
Cohesion: 0.24
Nodes (10): aggregator service, scripts/collect.sh collection round, mainnet-probe service, passive-monitor service, Reflector SEP-40 price oracle, testnet-probe service, reference-anchor README, fly.io deployment (+2 more)

### Community 77 - "Aggregator Scripts"
Cohesion: 0.20
Nodes (10): scripts, aggregate, build, calibrate, d3, score, shadow, test (+2 more)

### Community 78 - "Passive Monitor Config"
Cohesion: 0.27
Nodes (5): config, __dirname, repoRoot, USER_AGENT, withUserAgent()

### Community 79 - "Interactive Flow"
Cohesion: 0.36
Nodes (5): completeInteractiveFlow(), preinstalledChromiumPath(), tryFillAndSubmit(), USER_AGENT, withUserAgent()

### Community 80 - "Full System Setup Guide"
Cohesion: 0.22
Nodes (9): 1. Prerequisites, 2. Configure the environment, 3. Deploy the contracts, 4. Run the collectors, 5. Run the dashboard, 6. Everything at once, 7. Continuous collection (the deployed setup), `mock-anchors` behavior profiles (+1 more)

### Community 81 - "Collector Host Docs"
Cohesion: 0.22
Nodes (7): demo.sh script, scripts README, Collector host: the onboarding intake, Collector host: the public files, nginx public files config, scripts, setup-env.sh script

### Community 82 - "Horizon Payment Verify"
Cohesion: 0.33
Nodes (6): checkOperations(), Operation, same(), USDC, Transfer, verifyPayment()

### Community 83 - "Registry Lifecycle Docs"
Cohesion: 0.25
Nodes (8): anchor-registry README, Two-step admin handover, anchor-registry, Paged anchor index and migration, Stake and withdrawal cooldown, Time-locked upgrades, Upgrade test (tests/upgrade.rs), No slashing design decision

### Community 84 - "Graph Sync Script"
Cohesion: 0.25
Nodes (6): chrome, cut, html, nodes, out, src

### Community 85 - "Trade History Drawdown"
Cohesion: 0.43
Nodes (5): assetParams(), Candle, fetchTradeHistory(), maxDrawdownPct(), TradeHistory

### Community 86 - "Reference Anchor Setup"
Cohesion: 0.25
Nodes (5): asset, distribution, horizon, issuer, signing

### Community 87 - "SEP-24 Deposit Flow"
Cohesion: 0.36
Nodes (6): getTransactionStatus(), initiateInteractiveDeposit(), InteractiveDepositResponse, isTerminalStatus(), pollUntilTerminal(), TERMINAL_STATUSES

### Community 88 - "Registry Upgrade Test"
Cohesion: 0.33
Nodes (6): ANCHORS, BATCH, new_wasm(), Bytes, Env, upgrades_the_live_registry_and_migrates_its_index()

### Community 89 - "Oracle Fuzz Target"
Cohesion: 0.43
Nodes (6): Input, lower_median(), NOW, ROUND, Vec, Step

### Community 90 - "Upgrade Rehearsal Script"
Cohesion: 0.67
Nodes (6): call(), has_timelock(), log(), read_call(), rehearse-upgrade.sh script, snapshot()

### Community 91 - "Roadmap & SCF Plan"
Cohesion: 0.33
Nodes (5): Known limitations we are addressing, Milestones, Roadmap & SCF plan, Team capacity, Where we are (hackathon, September 2026)

### Community 92 - "Public Host Check"
Cohesion: 0.47
Nodes (4): isPrivateAddress(), Resolver, resolvesToPublicAddress(), v4Private()

### Community 93 - "Archive Backup Script"
Cohesion: 0.80
Nodes (4): log(), push(), backup-archive.sh script, snapshot()

### Community 94 - "Contract Upgrade Script"
Cohesion: 0.60
Nodes (3): admin_call(), upgrade-contracts.sh script, usage()

### Community 95 - "Testnet Scoring Tests"
Cohesion: 0.40
Nodes (3): inputs(), checks, stages

### Community 96 - "Dev Deps"
Cohesion: 0.40
Nodes (5): devDependencies, tsx, @types/node, typescript, vitest

### Community 97 - "Testnet Evidence Hashing"
Cohesion: 0.60
Nodes (4): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence()

### Community 99 - "Contract Crates"
Cohesion: 1.00
Nodes (3): anchor-registry, performance-oracle, performance-oracle-fuzz

## Knowledge Gaps
- **598 isolated node(s):** `AnchorInfo`, `RegistryIndex`, `Provider`, `Entry`, `RecentPayments` (+593 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 761 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `FX Rates & Chain Tests` to `Scores Page & Contract State`, `History Archive Merging`, `Scoring Constants`, `Root Layout & Shared UI`, `Reference Anchor Server`, `Payment Aggregation`, `Score Input Builder`, `Chain Anchor Sync`, `Aggregator Evidence Docs`, `Chain Signals & Issued Assets`, `Report Normalization`, `Reflector Price Feeds`, `Anchor Status Fetch`, `Aggregator Package`, `Collector Incidents`, `Passive Monitor Config`, `Interactive Flow`, `Trade History Drawdown`, `Testnet Scoring Tests`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **Why does `dotenv` connect `Mainnet Probe Package` to `Testnet Registry Chain`, `Aggregator Config`, `Chain Anchor Sync`, `Passive Monitor Config`, `Aggregator Package`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `anchor()` connect `Testnet Accounts & Payments` to `Anchor Status Fetch`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `AnchorInfo`, `RegistryIndex`, `Provider` to the rest of the system?**
  _598 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PerformanceOracle Contract` be split into smaller, more focused modules?**
  _Cohesion score 0.0664869721473495 - nodes in this community are weakly interconnected._
- **Should `Oracle Contract Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.06225520511234797 - nodes in this community are weakly interconnected._
- **Should `AnchorRegistry Contract` be split into smaller, more focused modules?**
  _Cohesion score 0.09324009324009325 - nodes in this community are weakly interconnected._