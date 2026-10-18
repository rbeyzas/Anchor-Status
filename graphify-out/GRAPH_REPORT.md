# Graph Report - Anchor-Status  (2026-10-18)

## Corpus Check
- 134 files · ~403,198 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2065 nodes · 4214 edges · 120 communities (99 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.83)
- Token cost: 133,679 input · 0 output

## Community Hubs (Navigation)
- History Archive Merging
- Scores Page & Contract State
- AnchorRegistry Contract
- Mainnet Candidate Intake
- Oracle Contract Tests
- Registry Contract Tests
- Dashboard Dependencies
- Landing Page Content
- PerformanceOracle Contract
- Anchor Detail Modal
- Payment Aggregation
- Testnet Accounts & Payments
- Reference Anchor Server
- Scoring Constants
- Rust EMA Scoring
- Score Card Publishing
- Scoring Calibration
- Anchor Aliases & Dormancy
- Methodology Page
- Dashboard TS Config
- Landing & Dashboard Shell
- History Archiver Package
- Mainnet Probe Core
- Passive Monitor Package
- Testnet Money Flow
- Contract Fixtures & Dashboard Docs
- Scoring Spec Sections
- Chain Anchor Sync
- HTTP Fetch Utilities
- Anchor Card & Score Journey
- Mainnet Probe Docs
- Mainnet Anchor Discovery
- Chain Signals & Issued Assets
- Registry Client Interface
- Registry Events
- Score Input Builder
- Testnet Candidates
- Aggregator Config & Evidence
- Mainnet Onboarding
- Reflector Price Feeds
- Testnet Anchors File
- Aggregator Run Limits
- Architecture Diagram
- Mainnet Probe Package
- Scoring Engine Core
- Mainnet Evidence Hashing
- Roadmap & SCF Plan
- Aggregator TS Config
- Archiver TS Config
- Mainnet Probe TS Config
- Passive Monitor TS Config
- Home Page Data
- FX Rates & Chain Tests
- Oracle Types & Events
- Onboarding API Routes
- Scoring Inputs & Verifiability
- Testnet Probe TS Config
- Anchor Status Fetch
- Dashboard History Charts
- AMM Market Quotes
- Reference Anchor Package
- Registry Lifecycle Docs
- InstaAward Evidence Log
- Apply Page
- Testnet Apply Page
- Asset Flow Bucketing
- Testnet Probe Package
- Archive Backup & Demo Scripts
- Collector Incidents
- Testnet Registry Chain
- Score Pillars & Confidence
- Demo Walkthrough Steps
- Scoring v2 Prompt
- Aggregator Package
- Mainnet Probe Scripts
- Reference Anchor TS Config
- Testnet Probe Dev Deps
- SEP-6 Sandbox Flow
- Structure Page & Branding
- Onboarding Server
- Passive Monitor Config
- Apply Form & Status
- Interactive Flow & User Agent
- Full System Setup Guide
- Horizon Payment Verify
- Root Layout & Theme
- Graph Sync Script
- Aggregator Scripts
- Trade History Drawdown
- Reference Anchor Setup
- SEP-24 Deposit Flow
- Registry Upgrade Test
- Upgrades & No-Slashing
- Dashboard Search
- Dev Deps (A)
- Dev Deps (B)
- Reference Anchor Scripts
- Testnet Evidence Hashing
- Shared Runtime Deps
- Orbit Trails
- Collect Script
- Server Autodeploy
- Registry Errors
- Oracle Errors
- Next Config
- Next Env Types
- Tailwind Config
- Contract Names
- Deploy-to-Server Script
- Setup Secondary Script
- AnchorInfo Type
- Registry DataKey
- AnchorHealth Type
- Oracle DataKey
- Scoring v2 Prompt Ref
- Roadmap Ref
- Soroban Vec

## God Nodes (most connected - your core abstractions)
1. `setup()` - 37 edges
2. `setup()` - 34 edges
3. `AnchorRegistry` - 26 edges
4. `vitest` - 22 edges
5. `main()` - 21 edges
6. `register_and_stake()` - 21 edges
7. `Scoring methodology (v1)` - 20 edges
8. `mainnet_anchor()` - 20 edges
9. `runScoring()` - 19 edges
10. `AnchorViewModel` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Time-locked upgrades` --semantically_similar_to--> `No slashing design decision`  [INFERRED] [semantically similar]
  contracts/anchor-registry/README.md → README.md
- `passive-monitor` --conceptually_related_to--> `Market pillar`  [INFERRED]
  services/passive-monitor/README.md → docs/SCORING.md
- `Data layer` --shares_data_with--> `score-summary.json`  [EXTRACTED]
  dashboard/README.md → services/aggregator/README.md
- `Hackathon judging criteria` --conceptually_related_to--> `Mona (Soroban SEP-24 reliability oracle)`  [INFERRED]
  judging-criteria.md → README.md
- `performance_oracle_live.wasm` --conceptually_related_to--> `PerformanceOracle contract`  [EXTRACTED]
  contracts/fixtures/README.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three evidence sources feeding one on-chain score** — assets_readme_hero_real_mainnet, assets_readme_hero_real_testnet, assets_readme_hero_mock_anchors, assets_readme_hero_onchain_score [EXTRACTED 1.00]
- **Four collectors feeding the aggregator** — assets_readme_architecture_mainnet_probe, assets_readme_architecture_testnet_probe, assets_readme_architecture_passive_monitor, assets_readme_hero_mock_anchors, assets_readme_architecture_aggregator [EXTRACTED 1.00]
- **Aggregator publishes scores across two Soroban contracts** — assets_readme_architecture_aggregator, assets_readme_architecture_performance_oracle, assets_readme_architecture_anchor_registry, assets_readme_architecture_dashboard [EXTRACTED 1.00]
- **Collector to aggregator to oracle to registry to dashboard flow** — readme_mainnet_probe, readme_testnet_probe, readme_passive_monitor, readme_aggregator, readme_performance_oracle, readme_anchor_registry, readme_dashboard [EXTRACTED 0.95]
- **Score card pillars, confidence and gates compose the headline** — docs_scoring_availability, docs_scoring_speed, docs_scoring_integrity, docs_scoring_market, docs_scoring_confidence, docs_scoring_gates, docs_scoring_headline_formula [EXTRACTED 0.95]
- **Verifiable score chain: bundle, engine, on-chain card, verify-score** — docs_scoring_inputs_bundle, docs_scoring_engine, contracts_performance_oracle_readme_publish_score_card, services_aggregator_readme_verify_score [INFERRED 0.85]

## Communities (120 total, 21 thin omitted)

### Community 0 - "History Archive Merging"
Cohesion: 0.07
Nodes (42): loadArchive(), mergeAnchor(), mergeSorted(), riskEventKey(), saveArchive(), scoreCardKey(), scorePointKey(), slashEventKey() (+34 more)

### Community 1 - "Scores Page & Contract State"
Cohesion: 0.08
Nodes (44): Page(), revalidate, Dashboard(), anchorAtKey(), AnchorInfo, anchorInfoKey(), cardKey(), contractDataKey() (+36 more)

### Community 2 - "AnchorRegistry Contract"
Cohesion: 0.13
Nodes (32): AnchorRegistry, bump_instance(), bump_persistent(), DAY_IN_LEDGERS, INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD, is_deactivated(), MAX_PAGE (+24 more)

### Community 3 - "Mainnet Candidate Intake"
Cohesion: 0.08
Nodes (41): loadAnchorsFile(), appendSubmission(), CandidateStatus, CheckName, CheckResult, decideSubmission(), Decision, __dirname (+33 more)

### Community 4 - "Oracle Contract Tests"
Cohesion: 0.11
Nodes (52): a_card_for_an_unregistered_anchor_is_rejected(), a_card_from_an_unauthorized_reporter_is_rejected(), a_card_must_come_from_a_reporter_for_the_anchors_own_source_type(), a_card_whose_window_ends_in_the_future_is_rejected(), a_deactivated_anchor_gets_no_report_or_card_until_reactivated(), a_published_card_has_its_ttl_extended(), a_replayed_or_older_card_is_rejected(), a_report_does_not_put_a_withheld_cards_score_into_the_registry() (+44 more)

### Community 5 - "Registry Contract Tests"
Cohesion: 0.12
Nodes (43): Client, a_pending_withdrawal_blocks_removal(), a_score_update_keeps_the_index_entries_alive(), an_upgrade_waits_out_the_delay_and_can_be_cancelled(), assert_event(), caps_a_page_at_max_page(), deactivates_with_a_reason_and_reactivates(), double_init_fails() (+35 more)

### Community 6 - "Dashboard Dependencies"
Cohesion: 0.05
Nodes (41): dependencies, framer-motion, next, next-themes, @phosphor-icons/react, react, react-dom, recharts (+33 more)

### Community 7 - "Landing Page Content"
Cohesion: 0.07
Nodes (30): EMPTY, EVIDENCE, HomeSnapshot, revalidate, STEPS, TIER_TEXT, ProbeTimeline(), STATE (+22 more)

### Community 8 - "PerformanceOracle Contract"
Cohesion: 0.14
Nodes (27): AnchorHealth, bump_instance(), bump_persistent(), DAY_IN_LEDGERS, floor_score(), INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD, MAX_FUTURE_SKEW_SECONDS (+19 more)

### Community 9 - "Anchor Detail Modal"
Cohesion: 0.12
Nodes (30): PillarRadar(), BAND_TONE, ConfidenceChip(), FlagChips(), PillarBars(), describeHealth(), RISK_LABEL, healthy (+22 more)

### Community 10 - "Payment Aggregation"
Cohesion: 0.11
Nodes (26): aggregatePayments(), statsFor(), loadAnchorsFile(), fetchRecentPayments(), isHistoryMissing(), PAYMENT_TYPES, RecentPayments, sleep() (+18 more)

### Community 11 - "Testnet Accounts & Payments"
Cohesion: 0.10
Nodes (23): anchor(), loadTestnetAnchors(), createAndFundAccount(), balanceOf(), memoFor(), sendPayment(), appendResult(), isProbeEnvironmentError() (+15 more)

### Community 12 - "Reference Anchor Server"
Cohesion: 0.09
Nodes (27): AnchorConfig, b64url(), Chain, createAnchor(), account(), handle(), newTransfer(), prune() (+19 more)

### Community 13 - "Scoring Constants"
Cohesion: 0.11
Nodes (32): AVAILABILITY_RECENT_SHARE, CONFIDENCE_FULL_DAYS, CONFIDENCE_FULL_SAMPLES, CONFIDENCE_INSUFFICIENT, CONFIDENCE_LOW, CONFIDENCE_MEDIUM, COVERAGE_UNKNOWN, DEPEG_HOURS (+24 more)

### Community 14 - "Rust EMA Scoring"
Cohesion: 0.13
Nodes (26): a_steady_anchor_below_100_does_not_read_as_degrading_from_the_start(), consecutive_failures_reset_on_success(), decay(), ema_converges_toward_observation(), ema_update(), ema_weights_real_sources_more_than_mock(), ema_with_weight(), feed() (+18 more)

### Community 15 - "Score Card Publishing"
Cohesion: 0.17
Nodes (22): clientCache, getReporterClient(), publishScoreCard(), ScoreCardsUnsupported, submitReport(), toContractArgs(), main(), dedupKey() (+14 more)

### Community 16 - "Scoring Calibration"
Cohesion: 0.21
Nodes (26): config, scoreCardsStatePath(), asToday(), main(), flagNames(), AssetInfo, floorToHour(), AnchorFlowHistory (+18 more)

### Community 17 - "Anchor Aliases & Dormancy"
Cohesion: 0.14
Nodes (23): assignAliases(), operatorKey(), isDormant(), Listing, mapWithConcurrency(), ourNetworkIsDown(), AssetStatus, listDomainAssets() (+15 more)

### Community 18 - "Methodology Page"
Cohesion: 0.14
Nodes (21): metadata, MethodologyPage(), PILLAR_COPY, STAGES, PILLAR_LABEL, PRESETS, ScoreCalculator(), CONFIDENCE_BANDS (+13 more)

### Community 19 - "Dashboard TS Config"
Cohesion: 0.07
Nodes (27): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+19 more)

### Community 20 - "Landing & Dashboard Shell"
Cohesion: 0.13
Nodes (22): LandingPage(), loadSnapshot(), AnchorCard(), AnchorDetailModal(), SOURCE_ORDER, FilterBar(), FILTERS, FilterValue (+14 more)

### Community 21 - "History Archiver Package"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+18 more)

### Community 22 - "Mainnet Probe Core"
Cohesion: 0.12
Nodes (21): firstDepositAsset(), infoListsEnabledAsset(), isPolicyRejection(), message(), probeAnchor(), ProbeChecks, ProbeOptions, ProbeTranscript (+13 more)

### Community 23 - "Passive Monitor Package"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node (+18 more)

### Community 24 - "Testnet Money Flow"
Cohesion: 0.13
Nodes (23): floor7(), FlowDeps, msg(), runMoneyFlow(), step(), short(), StepFailure, TERMINAL (+15 more)

### Community 25 - "Contract Fixtures & Dashboard Docs"
Cohesion: 0.12
Nodes (24): Live contract fixtures README, performance_oracle_live.wasm, anchor_registry_live.wasm, dashboard README, Applications, dashboard, Data layer, Mona design system (as-* tokens) (+16 more)

### Community 26 - "Scoring Spec Sections"
Cohesion: 0.08
Nodes (25): 10. Worked examples (golden tests), 11. Signals deliberately not scored, 12. On-chain design (PerformanceOracle), 13. Off-chain design, 14. Verifiability, 15. Dashboard, 16. Gaming and failure modes, 17. Tunable constants (+17 more)

### Community 27 - "Chain Anchor Sync"
Cohesion: 0.14
Nodes (17): ChainAnchor, mainnetFromChain(), chain, testnetFromChain(), TestnetListEntry, config, __dirname, repoRoot (+9 more)

### Community 28 - "HTTP Fetch Utilities"
Cohesion: 0.15
Nodes (16): Fetch, HttpError, Timed, timedFetch(), DomainListing, fresh(), ISSUER_CACHE_MS, IssuerCache (+8 more)

### Community 29 - "Anchor Card & Score Journey"
Cohesion: 0.14
Nodes (16): LABEL, ScoreJourney(), tone(), PillarDots(), reducedMotion(), scoreColorClass(), ScoreValue(), TIER_STROKE_VAR (+8 more)

### Community 30 - "Mainnet Probe Docs"
Cohesion: 0.09
Nodes (21): End-to-end demo walkthrough, Applications — `npm run onboard` and `npm run intake`, Anchor discovery, Discovery — `npm run discover`, Evidence documents (SHA-256 on-chain), Evidence — `npm run verify -- <sha256>`, Inconclusive rounds (collector-side failure), mainnet-probe (+13 more)

### Community 31 - "Mainnet Anchor Discovery"
Cohesion: 0.15
Nodes (15): anchorIdFor(), AnchorsFile, Candidate, cleanDirectoryName(), dedupeByTransferHost(), listingFrom(), MainnetAnchor, mergeAnchors() (+7 more)

### Community 32 - "Chain Signals & Issued Assets"
Cohesion: 0.14
Nodes (15): issuedAssets(), IssuedFiat, runChainSignals(), StatusFile, IssuedAsset, appendSamples(), sample(), ReferenceRates (+7 more)

### Community 33 - "Registry Client Interface"
Cohesion: 0.15
Nodes (17): AnchorRegistryInterface, Address, AnchorInfo, Env, Error, Result, Symbol, AnchorInfo (+9 more)

### Community 34 - "Registry Events"
Cohesion: 0.14
Nodes (22): AdminChanged, AdminProposed, AnchorDeactivated, AnchorReactivated, AnchorRegistered, AnchorRemoved, IndexFinalized, IndexMigrated (+14 more)

### Community 35 - "Score Input Builder"
Cohesion: 0.17
Nodes (21): METHODOLOGY_VERSION, buildInputs(), coverageOf(), fixed(), flowAggregates(), FlowHistory, integrityChecks(), isSep10Mismatch() (+13 more)

### Community 36 - "Testnet Candidates"
Cohesion: 0.13
Nodes (16): CandidateStatus, CheckName, HOSTNAME, ingestSubmissions(), loadOnboardingFile(), normalizeDomainInput(), OnboardingCandidate, OnboardingFile (+8 more)

### Community 37 - "Aggregator Config & Evidence"
Cohesion: 0.15
Nodes (15): __dirname, repoRoot, canonicalJson(), SCORE_INPUTS_SCHEMA, sha256Hex(), writeDocument(), inputs(), dayDigest() (+7 more)

### Community 38 - "Mainnet Onboarding"
Cohesion: 0.18
Nodes (19): IssuerRecord, cleanName(), evaluateCandidate(), Evaluation, MAINNET_PASSPHRASE, OnboardingDeps, plainError(), daysAgo() (+11 more)

### Community 39 - "Reflector Price Feeds"
Cohesion: 0.18
Nodes (13): AssetKey, assetName(), assetScVal(), contractAsset(), FEEDS, Invoke, Reflector, ReflectorOptions (+5 more)

### Community 40 - "Testnet Anchors File"
Cohesion: 0.16
Nodes (17): saveTestnetAnchors(), TestnetAnchor, testnetAnchorId(), TestnetAnchorsFile, CheckResult, FlowResult, FlowTarget, ADMISSION_RULE (+9 more)

### Community 41 - "Aggregator Run Limits"
Cohesion: 0.13
Nodes (18): MAX_CARDS_PER_RUN, REPUBLISH_AFTER_MS, AnchorContext, at(), checks, empty, END, failed() (+10 more)

### Community 42 - "Architecture Diagram"
Cohesion: 0.12
Nodes (19): Oracle Pipeline Architecture Diagram, aggregator, AnchorRegistry (Soroban contract), /apply onboarding intake, dashboard, mainnet-probe, passive-monitor, PerformanceOracle (Soroban contract) (+11 more)

### Community 43 - "Mainnet Probe Package"
Cohesion: 0.12
Nodes (18): node-schedule, description, tsx, vitest, name, private, type, version (+10 more)

### Community 44 - "Scoring Engine Core"
Cohesion: 0.21
Nodes (17): activeFlags(), assetMarketScore(), availabilityScore(), computeCard(), confidenceScore(), flagsMask(), headline(), integrityScore() (+9 more)

### Community 45 - "Mainnet Evidence Hashing"
Cohesion: 0.20
Nodes (14): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence(), Check, EvidenceDoc, findPayout(), HorizonOperation (+6 more)

### Community 46 - "Roadmap & SCF Plan"
Cohesion: 0.11
Nodes (16): Known limitations we are addressing, Milestones, Roadmap & SCF plan, Team capacity, Where we are (hackathon, September 2026), Hackathon judging criteria, Deployed testnet contracts, Design notes (+8 more)

### Community 47 - "Aggregator TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 48 - "Archiver TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 49 - "Mainnet Probe TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 50 - "Passive Monitor TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 51 - "Home Page Data"
Cohesion: 0.21
Nodes (12): counters, mainnet(), probeExample, proofChain, scoreJourney, STAGE_WORD, STAGES, tickerItems() (+4 more)

### Community 52 - "FX Rates & Chain Tests"
Cohesion: 0.18
Nodes (10): vitest, ARST, CURRENCY_API, EXCHANGERATE_API, FxSource, FxTable, loadFxTable(), usdPerUnit() (+2 more)

### Community 53 - "Oracle Types & Events"
Cohesion: 0.24
Nodes (15): AnchorHealth, DataKey, ReportSubmittedEvent, RiskReason, RiskStatusChangedEvent, Address, BytesN, Option (+7 more)

### Community 54 - "Onboarding API Routes"
Cohesion: 0.19
Nodes (10): dynamic, POST(), base, dynamic, POST(), normalizeDomainInput(), handleApplication(), json() (+2 more)

### Community 55 - "Scoring Inputs & Verifiability"
Cohesion: 0.13
Nodes (16): Collector incidents, Scoring engine computeCard, Inputs bundle (score-inputs/v1), Issuer rule (score only issued assets), Market pillar, Verifiability (verify-score), passive-monitor service, Reflector SEP-40 price oracle (+8 more)

### Community 56 - "Testnet Probe TS Config"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 57 - "Anchor Status Fetch"
Cohesion: 0.22
Nodes (12): describeProblem(), FETCH_TIMEOUT_MS, fetchAnchorStatus(), issuedAssets(), LastProbe, lastProbeView(), mergeStatusInto(), policyNote() (+4 more)

### Community 58 - "Dashboard History Charts"
Cohesion: 0.22
Nodes (11): ArchiveFile, FETCH_TIMEOUT_MS, MAX_CHART_POINTS, mergeArchiveInto(), scoreKey(), slashKey(), thinHistory(), toSlashEvents() (+3 more)

### Community 59 - "AMM Market Quotes"
Cohesion: 0.16
Nodes (14): AmmQuote, assetParams(), DEPTH_BAND, fetchQuotes(), Level, MarketSample, MAX_SPREAD, MIN_DEPTH_USD (+6 more)

### Community 60 - "Reference Anchor Package"
Cohesion: 0.13
Nodes (14): dependencies, @stellar/stellar-sdk, tsx, description, devDependencies, @types/node, typescript, vitest (+6 more)

### Community 61 - "Registry Lifecycle Docs"
Cohesion: 0.18
Nodes (14): anchor-registry README, Two-step admin handover, anchor-registry, Anchor deactivate/reactivate/remove lifecycle, Stake and withdrawal cooldown, update_score (oracle-only), performance-oracle README, authorize_reporter (+6 more)

### Community 62 - "InstaAward Evidence Log"
Cohesion: 0.16
Nodes (14): Paged anchor index and migration, Upgrade test (tests/upgrade.rs), InstaAward evidence log, Off-host archive backup (server B), Leaked testnet keys remediation, Live registry and oracle upgrade (18 Oct), Secondary collector server B, stellar.toml at monarank.xyz (+6 more)

### Community 63 - "Apply Page"
Cohesion: 0.20
Nodes (8): metadata, NetworkSwitch(), Application, ApplicationCheck, CHECK_LABEL, CheckName, HOSTNAME, STATUS_COPY

### Community 64 - "Testnet Apply Page"
Cohesion: 0.20
Nodes (9): metadata, STEPS, ApplicationStatus, TESTNET_CHECK_LABEL, TestnetApplication, TestnetCheck, TestnetCheckName, TestnetOnboardingFile (+1 more)

### Community 65 - "Asset Flow Bucketing"
Cohesion: 0.21
Nodes (13): AssetFlows, assetKey(), bucketize(), classify(), DayBucket, emptyBucket(), FLOW_DAYS, FlowsFile (+5 more)

### Community 66 - "Testnet Probe Package"
Cohesion: 0.14
Nodes (13): description, name, private, scripts, build, onboard, probe, register (+5 more)

### Community 67 - "Archive Backup & Demo Scripts"
Cohesion: 0.21
Nodes (10): log(), push(), backup-archive.sh script, snapshot(), demo.sh script, scripts README, Collector host: the onboarding intake, Collector host: the public files (+2 more)

### Community 68 - "Collector Incidents"
Cohesion: 0.24
Nodes (11): applyIncidents(), COLLECTOR_INCIDENTS, CollectorIncident, IncidentExclusion, isConnectionFailure(), INCIDENT, probe(), proof() (+3 more)

### Community 69 - "Testnet Registry Chain"
Cohesion: 0.24
Nodes (9): registeredAnchorIds(), registerTestnetAnchor(), registry(), config, __dirname, repoRoot, REFERENCE_ANCHOR, anchors (+1 more)

### Community 70 - "Score Pillars & Confidence"
Cohesion: 0.25
Nodes (10): get_verdict, Score card display and confidence withholding, Availability pillar, Confidence, Gates and flags, Headline formula (shrinkage toward prior 50), Integrity pillar, Signals deliberately not scored (volume, age, stake) (+2 more)

### Community 71 - "Demo Walkthrough Steps"
Cohesion: 0.18
Nodes (10): 1) Introduce the three layers, 2) Open the dashboard, 3) Show the filters, 4) Click an anchor to open its detail view, 5) Show risk detection live (the actual "wow" moment), 6) Closing, End-to-End Demo — Presentation Walkthrough, Prerequisites (+2 more)

### Community 72 - "Scoring v2 Prompt"
Cohesion: 0.18
Nodes (10): Context you must know, Ground rules, Part A: remove the TRY focus, Part B: implementation, Phase 1: contract, engine and publisher on existing data, Phase 2: integrity checklist, Phase 3: chain signals (Market and flows), Phase 4: docs and handoff (+2 more)

### Community 73 - "Aggregator Package"
Cohesion: 0.18
Nodes (10): dependencies, dotenv, @stellar/stellar-sdk, description, tsx, vitest, name, private (+2 more)

### Community 74 - "Mainnet Probe Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, discover, intake, onboard, probe, register, sync-from-chain (+3 more)

### Community 75 - "Reference Anchor TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+2 more)

### Community 76 - "Testnet Probe Dev Deps"
Cohesion: 0.18
Nodes (11): devDependencies, tsx, @types/node, @types/node-schedule, typescript, vitest, tsx, @types/node (+3 more)

### Community 77 - "SEP-6 Sandbox Flow"
Cohesion: 0.31
Nodes (10): attr(), base(), completeSandboxLeg(), findSandboxForm(), getJson(), getSep6Info(), requestDeposit(), requestWithdraw() (+2 more)

### Community 78 - "Structure Page & Branding"
Cohesion: 0.31
Nodes (5): metadata, Logo(), Wordmark(), SiteNav(), ThemeToggle()

### Community 79 - "Onboarding Server"
Cohesion: 0.29
Nodes (8): OnboardingFile, acceptedAnchorIds(), FETCH_TIMEOUT_MS, fetchFile(), fetchImportedAnchorIds(), fetchOnboarding(), fetchTestnetOnboarding(), mergeImportedInto()

### Community 80 - "Passive Monitor Config"
Cohesion: 0.27
Nodes (5): config, __dirname, repoRoot, USER_AGENT, withUserAgent()

### Community 81 - "Apply Form & Status"
Cohesion: 0.36
Nodes (7): ApplyForm(), submit(), dateTime(), Outcome, outcomeFor(), ChipTone, StatusChip()

### Community 82 - "Interactive Flow & User Agent"
Cohesion: 0.36
Nodes (5): completeInteractiveFlow(), preinstalledChromiumPath(), tryFillAndSubmit(), USER_AGENT, withUserAgent()

### Community 83 - "Full System Setup Guide"
Cohesion: 0.22
Nodes (9): 1. Prerequisites, 2. Configure the environment, 3. Deploy the contracts, 4. Run the collectors, 5. Run the dashboard, 6. Everything at once, 7. Continuous collection (the deployed setup), `mock-anchors` behavior profiles (+1 more)

### Community 84 - "Horizon Payment Verify"
Cohesion: 0.33
Nodes (6): checkOperations(), Operation, same(), USDC, Transfer, verifyPayment()

### Community 85 - "Root Layout & Theme"
Cohesion: 0.29
Nodes (5): metadata, mono, sans, ThemeProvider(), next

### Community 86 - "Graph Sync Script"
Cohesion: 0.25
Nodes (6): chrome, cut, html, nodes, out, src

### Community 87 - "Aggregator Scripts"
Cohesion: 0.25
Nodes (8): scripts, aggregate, build, calibrate, score, test, typecheck, verify-score

### Community 88 - "Trade History Drawdown"
Cohesion: 0.43
Nodes (5): assetParams(), Candle, fetchTradeHistory(), maxDrawdownPct(), TradeHistory

### Community 89 - "Reference Anchor Setup"
Cohesion: 0.25
Nodes (5): asset, distribution, horizon, issuer, signing

### Community 90 - "SEP-24 Deposit Flow"
Cohesion: 0.36
Nodes (6): getTransactionStatus(), initiateInteractiveDeposit(), InteractiveDepositResponse, isTerminalStatus(), pollUntilTerminal(), TERMINAL_STATUSES

### Community 91 - "Registry Upgrade Test"
Cohesion: 0.33
Nodes (6): Bytes, ANCHORS, BATCH, new_wasm(), Env, upgrades_the_live_registry_and_migrates_its_index()

### Community 92 - "Upgrades & No-Slashing"
Cohesion: 0.38
Nodes (5): Time-locked upgrades, No slashing design decision, admin_call(), upgrade-contracts.sh script, usage()

### Community 93 - "Dashboard Search"
Cohesion: 0.60
Nodes (3): fold(), matchesQuery(), a

### Community 94 - "Dev Deps (A)"
Cohesion: 0.40
Nodes (5): devDependencies, tsx, @types/node, typescript, vitest

### Community 95 - "Dev Deps (B)"
Cohesion: 0.40
Nodes (5): devDependencies, tsx, @types/node, typescript, vitest

### Community 96 - "Reference Anchor Scripts"
Cohesion: 0.40
Nodes (5): scripts, setup, start, test, typecheck

### Community 97 - "Testnet Evidence Hashing"
Cohesion: 0.60
Nodes (4): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence()

### Community 98 - "Shared Runtime Deps"
Cohesion: 0.50
Nodes (4): dependencies, dotenv, smol-toml, @stellar/stellar-sdk

## Knowledge Gaps
- **603 isolated node(s):** `DomainListing`, `Evaluation`, `AnchorFlowHistory`, `RecentPayments`, `FakePage` (+598 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 740 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `FX Rates & Chain Tests` to `History Archive Merging`, `Scores Page & Contract State`, `Chain Signals & Issued Assets`, `Collector Incidents`, `Aggregator Config & Evidence`, `Dashboard Dependencies`, `Reflector Price Feeds`, `Aggregator Run Limits`, `Payment Aggregation`, `Scoring Engine Core`, `Reference Anchor Server`, `Score Card Publishing`, `Passive Monitor Config`, `Interactive Flow & User Agent`, `Trade History Drawdown`, `Anchor Status Fetch`, `Chain Anchor Sync`?**
  _High betweenness centrality (0.230) - this node is a cross-community bridge._
- **Why does `dotenv` connect `Mainnet Probe Package` to `Testnet Registry Chain`, `Aggregator Config & Evidence`, `Aggregator Package`, `Passive Monitor Config`, `Chain Anchor Sync`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `anchor()` connect `Testnet Accounts & Payments` to `Anchor Status Fetch`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `DomainListing`, `Evaluation`, `AnchorFlowHistory` to the rest of the system?**
  _603 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `History Archive Merging` be split into smaller, more focused modules?**
  _Cohesion score 0.07373271889400922 - nodes in this community are weakly interconnected._
- **Should `Scores Page & Contract State` be split into smaller, more focused modules?**
  _Cohesion score 0.07890122735242548 - nodes in this community are weakly interconnected._
- **Should `AnchorRegistry Contract` be split into smaller, more focused modules?**
  _Cohesion score 0.13006654567453116 - nodes in this community are weakly interconnected._