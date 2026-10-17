# Graph Report - Anchor-Status  (2026-10-18)

## Corpus Check
- 63 files · ~334,717 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1942 nodes · 3886 edges · 130 communities (100 shown, 30 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.85)
- Token cost: 224,912 input · 0 output

## Community Hubs (Navigation)
- History Archive Merging
- Mock Anchor Behavior Sim
- Oracle Contract Tests
- PerformanceOracle Contract
- Landing Page Snapshot
- Dashboard Dependencies
- HTTP Fetch Utilities
- Mainnet Candidate Intake
- Contract State Decoding
- Score Card Publishing
- Scoring Constants
- Rust EMA Scoring
- Anchor Aliases & Dormancy
- Issuer Lookup Cache
- Methodology Page
- Scoring Calibration
- Dashboard TS Config
- History Archiver Package
- Passive Monitor Package
- AnchorRegistry Contract
- Testnet Money Flow
- Scoring Spec Sections
- Testnet Account & Interactive Flow
- Anchor Card & Score Journey
- Dashboard Filters & Stats
- Passive Monitor Config
- Score Input Builder
- Chain Signals & Issued Assets
- Contracts & Roadmap Docs
- Anchor Detail Modal
- Health Labels
- Reflector Price Feeds
- Registry Contract Tests
- Aggregator Config & Evidence
- Mainnet Onboarding
- Chain Anchor Sync
- Aggregator Run Limits
- Mainnet Evidence Hashing
- Architecture Diagram
- Scoring Engine Core
- Mainnet Anchor Discovery
- Payment Aggregation & SEP Info
- Testnet Candidates
- Mock Anchor Integrations
- Aggregator TS Config
- Archiver TS Config
- Mainnet Probe TS Config
- Passive Monitor TS Config
- Flow Test Fixtures
- Anchor Status Fetch
- Mainnet Probe Docs
- FX Rates & Chain Tests
- Testnet Anchors & Onboarding
- Onboarding API Routes
- Dashboard History Charts
- RPC Provider Pool
- Scoring Pillars & Gates
- SEP-10 Auth
- Testnet Probe TS Config
- Apply Page
- Collector Host & Incidents Docs
- Asset Flow Bucketing
- AMM Market Quotes
- Testnet Apply Page
- Source Badges & Formatting
- Collector Incidents
- Scores Page & Summary
- Dashboard Docs & Judging
- Mainnet Probe Package
- Testnet Registry Chain
- Structure Page & Branding
- Demo Walkthrough Steps
- Scoring v2 Prompt
- Testnet Probe Deps
- Aggregator Package
- Testnet Probe Scripts
- Testnet Probe Dev Deps
- Onboarding Server
- Scoring Curve Builder
- Apply Form & Status
- TODO Plan (Turkish)
- Full System Setup Guide
- Trade History Drawdown
- SEP-24 Deposit Flow
- Registry Types
- Root Layout & Theme
- Graph Sync Script
- Aggregator Scripts
- Mainnet Probe Scripts
- Mock Anchors Docs
- Testnet Probe Package
- Public Host Check
- Dev Deps (A)
- Dev Deps (B)
- Polaris Asset Seeding
- Testnet Evidence Hashing
- Collect Script
- Contract Deploy Script
- Contract Upgrade Script
- Contracts Concept
- Orbit Trails
- Server Autodeploy
- Run-All Script
- Registry Errors
- Oracle Errors
- Next Config
- Next Env Types
- Tailwind Config
- Contract Names
- Demo Script
- Deploy-to-Server Script
- Setup Env Script
- Setup Secondary Script
- Mock Anchor Settings
- Mock Anchor Requirements
- Bootstrap Issuers
- Load Fixtures
- Stop-All Script
- Mock Anchors Service

## God Nodes (most connected - your core abstractions)
1. `setup()` - 36 edges
2. `main()` - 21 edges
3. `register_and_stake()` - 21 edges
4. `AnchorViewModel` - 20 edges
5. `Scoring methodology (v1)` - 20 edges
6. `runScoring()` - 20 edges
7. `mainnet_anchor()` - 19 edges
8. `setup()` - 18 edges
9. `buildInputs()` - 18 edges
10. `compilerOptions` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Collector incidents` --semantically_similar_to--> `Inconclusive rounds (collector-side failure)`  [INFERRED] [semantically similar]
  docs/SCORING.md → services/mainnet-probe/README.md
- `Hackathon judging criteria` --conceptually_related_to--> `Mona (Anchor-Status) reliability oracle`  [INFERRED]
  judging-criteria.md → README.md
- `Score card` --references--> `Scoring methodology v2`  [EXTRACTED]
  README.md → docs/SCORING.md
- `End-to-end demo walkthrough` --references--> `passive-monitor`  [EXTRACTED]
  docs/DEMO.md → services/passive-monitor/README.md
- `Mona (Anchor-Status) reliability oracle` --references--> `passive-monitor`  [EXTRACTED]
  README.md → services/passive-monitor/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Collectors feeding aggregator** — services_mainnet_probe_readme_mainnet_probe, services_testnet_probe_readme_testnet_probe, services_passive_monitor_readme_passive_monitor, services_aggregator_readme_aggregator [EXTRACTED 1.00]
- **Score card pillars** — docs_scoring_availability, docs_scoring_speed, docs_scoring_integrity, docs_scoring_market [EXTRACTED 1.00]
- **Four collectors feeding the aggregator** — assets_readme_architecture_mainnet_probe, assets_readme_architecture_testnet_probe, assets_readme_architecture_passive_monitor, assets_readme_hero_mock_anchors, assets_readme_architecture_aggregator [EXTRACTED 1.00]
- **Aggregator publishes scores across two Soroban contracts** — assets_readme_architecture_aggregator, assets_readme_architecture_performance_oracle, assets_readme_architecture_anchor_registry, assets_readme_architecture_dashboard [EXTRACTED 1.00]
- **Three evidence sources feeding one on-chain score** — assets_readme_hero_real_mainnet, assets_readme_hero_real_testnet, assets_readme_hero_mock_anchors, assets_readme_hero_onchain_score [EXTRACTED 1.00]

## Communities (130 total, 30 thin omitted)

### Community 0 - "History Archive Merging"
Cohesion: 0.08
Nodes (40): loadArchive(), mergeAnchor(), mergeSorted(), riskEventKey(), saveArchive(), scorePointKey(), slashEventKey(), config (+32 more)

### Community 1 - "Mock Anchor Behavior Sim"
Cohesion: 0.08
Nodes (38): Any, Asset, Path, Random, BehaviorProfile, effective_success_rate(), get_or_create_anchor_started_at(), Observation (+30 more)

### Community 2 - "Oracle Contract Tests"
Cohesion: 0.12
Nodes (49): a_card_for_an_unregistered_anchor_is_rejected(), a_card_from_an_unauthorized_reporter_is_rejected(), a_card_must_come_from_a_reporter_for_the_anchors_own_source_type(), a_card_whose_window_ends_in_the_future_is_rejected(), a_published_card_has_its_ttl_extended(), a_replayed_or_older_card_is_rejected(), a_report_does_not_put_a_withheld_cards_score_into_the_registry(), a_short_recovery_does_not_clear_a_mostly_failing_window() (+41 more)

### Community 3 - "PerformanceOracle Contract"
Cohesion: 0.12
Nodes (32): bump_instance(), bump_persistent(), floor_score(), PerformanceOracle, record_report(), Address, AnchorHealth, BytesN (+24 more)

### Community 4 - "Landing Page Snapshot"
Cohesion: 0.09
Nodes (35): EMPTY, EVIDENCE, HomeSnapshot, LandingPage(), loadSnapshot(), revalidate, STEPS, TIER_TEXT (+27 more)

### Community 5 - "Dashboard Dependencies"
Cohesion: 0.05
Nodes (41): dependencies, framer-motion, next, next-themes, @phosphor-icons/react, react, react-dom, recharts (+33 more)

### Community 6 - "HTTP Fetch Utilities"
Cohesion: 0.09
Nodes (28): fetchAllPages(), Fetch, HttpError, Timed, timedFetch(), firstDepositAsset(), infoListsEnabledAsset(), isPolicyRejection() (+20 more)

### Community 7 - "Mainnet Candidate Intake"
Cohesion: 0.10
Nodes (29): appendSubmission(), CandidateStatus, CheckName, CheckResult, decideSubmission(), Decision, __dirname, HOSTNAME (+21 more)

### Community 8 - "Contract State Decoding"
Cohesion: 0.13
Nodes (28): anchorInfoKey(), cardKey(), contractDataKey(), contractDataVal(), decodeAnchorInfo(), decodeHealth(), enumKey(), healthKey() (+20 more)

### Community 9 - "Score Card Publishing"
Cohesion: 0.16
Nodes (25): clientCache, getReporterClient(), publishScoreCard(), ScoreCardsUnsupported, submitReport(), toContractArgs(), main(), dedupKey() (+17 more)

### Community 10 - "Scoring Constants"
Cohesion: 0.11
Nodes (32): AVAILABILITY_RECENT_SHARE, CONFIDENCE_FULL_DAYS, CONFIDENCE_FULL_SAMPLES, CONFIDENCE_INSUFFICIENT, CONFIDENCE_LOW, CONFIDENCE_MEDIUM, COVERAGE_UNKNOWN, DEPEG_HOURS (+24 more)

### Community 11 - "Rust EMA Scoring"
Cohesion: 0.13
Nodes (26): a_steady_anchor_below_100_does_not_read_as_degrading_from_the_start(), consecutive_failures_reset_on_success(), decay(), ema_converges_toward_observation(), ema_update(), ema_weights_real_sources_more_than_mock(), ema_with_weight(), feed() (+18 more)

### Community 12 - "Anchor Aliases & Dormancy"
Cohesion: 0.14
Nodes (23): assignAliases(), operatorKey(), isDormant(), Listing, MainnetAnchor, mapWithConcurrency(), AssetStatus, listDomainAssets() (+15 more)

### Community 13 - "Issuer Lookup Cache"
Cohesion: 0.12
Nodes (26): DomainListing, fresh(), ISSUER_CACHE_MS, IssuerCache, issuerMatches(), IssuerRecord, normalizeDomain(), now (+18 more)

### Community 14 - "Methodology Page"
Cohesion: 0.13
Nodes (23): metadata, MethodologyPage(), PILLAR_COPY, STAGES, PILLAR_LABEL, PRESETS, ScoreCalculator(), scoreJourney (+15 more)

### Community 15 - "Scoring Calibration"
Cohesion: 0.21
Nodes (26): config, scoreCardsStatePath(), asToday(), main(), flagNames(), AssetInfo, floorToHour(), AnchorFlowHistory (+18 more)

### Community 16 - "Dashboard TS Config"
Cohesion: 0.07
Nodes (27): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+19 more)

### Community 17 - "History Archiver Package"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+18 more)

### Community 18 - "Passive Monitor Package"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node (+18 more)

### Community 19 - "AnchorRegistry Contract"
Cohesion: 0.20
Nodes (15): AnchorInfo, AnchorRegistryInterface, AnchorRegistry, bump_instance(), bump_persistent(), Address, BytesN, DataKey (+7 more)

### Community 20 - "Testnet Money Flow"
Cohesion: 0.13
Nodes (21): floor7(), FlowDeps, msg(), runMoneyFlow(), step(), short(), StepFailure, TERMINAL (+13 more)

### Community 21 - "Scoring Spec Sections"
Cohesion: 0.08
Nodes (25): 10. Worked examples (golden tests), 11. Signals deliberately not scored, 12. On-chain design (PerformanceOracle), 13. Off-chain design, 14. Verifiability, 15. Dashboard, 16. Gaming and failure modes, 17. Tunable constants (+17 more)

### Community 22 - "Testnet Account & Interactive Flow"
Cohesion: 0.15
Nodes (18): loadTestnetAnchors(), createAndFundAccount(), completeInteractiveFlow(), preinstalledChromiumPath(), tryFillAndSubmit(), balanceOf(), memoFor(), sendPayment() (+10 more)

### Community 23 - "Anchor Card & Score Journey"
Cohesion: 0.15
Nodes (16): AnchorCard(), LABEL, ScoreJourney(), tone(), reducedMotion(), scoreColorClass(), ScoreValue(), TIER_STROKE_VAR (+8 more)

### Community 24 - "Dashboard Filters & Stats"
Cohesion: 0.12
Nodes (18): SOURCE_ORDER, FilterBar(), FILTERS, FilterValue, Stat(), StatStrip(), useCountUp(), average() (+10 more)

### Community 25 - "Passive Monitor Config"
Cohesion: 0.14
Nodes (15): config, __dirname, loadAnchorsFile(), repoRoot, fetchRecentPayments(), isHistoryMissing(), PAYMENT_TYPES, RecentPayments (+7 more)

### Community 26 - "Score Input Builder"
Cohesion: 0.17
Nodes (21): METHODOLOGY_VERSION, buildInputs(), coverageOf(), fixed(), flowAggregates(), FlowHistory, integrityChecks(), isSep10Mismatch() (+13 more)

### Community 27 - "Chain Signals & Issued Assets"
Cohesion: 0.15
Nodes (15): issuedAssets(), IssuedFiat, runChainSignals(), StatusFile, IssuedAsset, appendSamples(), sample(), ReferenceRates (+7 more)

### Community 28 - "Contracts & Roadmap Docs"
Cohesion: 0.10
Nodes (15): anchor-registry, performance-oracle, Known limitations we are addressing, Milestones, Roadmap & SCF plan, Team capacity, Where we are (hackathon, September 2026), Deployed testnet contracts (+7 more)

### Community 29 - "Anchor Detail Modal"
Cohesion: 0.19
Nodes (17): PillarRadar(), BAND_TONE, ConfidenceChip(), FlagChips(), PillarBars(), PillarDots(), decodeCard(), CONFIDENCE_LABEL (+9 more)

### Community 30 - "Health Labels"
Cohesion: 0.15
Nodes (12): describeHealth(), RISK_LABEL, healthy, TREND_LABEL, DEMO, mergeMockDemoInto(), AnchorHealth, AnchorViewModel (+4 more)

### Community 31 - "Reflector Price Feeds"
Cohesion: 0.16
Nodes (13): AssetKey, assetName(), assetScVal(), contractAsset(), FEEDS, Invoke, Reflector, ReflectorOptions (+5 more)

### Community 32 - "Registry Contract Tests"
Cohesion: 0.19
Nodes (19): Client, get_anchor_info_not_found_fails(), list_anchors_returns_registered_ids_in_order(), mint(), register_anchor_duplicate_fails(), register_anchor_extends_the_record_ttl(), register_anchor_success(), Address (+11 more)

### Community 33 - "Aggregator Config & Evidence"
Cohesion: 0.15
Nodes (15): __dirname, repoRoot, canonicalJson(), SCORE_INPUTS_SCHEMA, sha256Hex(), writeDocument(), inputs(), dayDigest() (+7 more)

### Community 34 - "Mainnet Onboarding"
Cohesion: 0.19
Nodes (15): loadAnchorsFile(), ingestSubmissions(), saveOnboardingFile(), ourNetworkIsDown(), lookupIssuer(), STELLAR_EXPERT_API, deps(), dryRun() (+7 more)

### Community 35 - "Chain Anchor Sync"
Cohesion: 0.17
Nodes (15): ChainAnchor, mainnetFromChain(), chain, testnetFromChain(), TestnetListEntry, config, __dirname, repoRoot (+7 more)

### Community 36 - "Aggregator Run Limits"
Cohesion: 0.13
Nodes (18): MAX_CARDS_PER_RUN, REPUBLISH_AFTER_MS, AnchorContext, at(), checks, empty, END, failed() (+10 more)

### Community 37 - "Mainnet Evidence Hashing"
Cohesion: 0.19
Nodes (15): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence(), fetchAnchorToml(), Check, EvidenceDoc, findPayout() (+7 more)

### Community 38 - "Architecture Diagram"
Cohesion: 0.12
Nodes (19): Oracle Pipeline Architecture Diagram, aggregator, AnchorRegistry (Soroban contract), /apply onboarding intake, dashboard, mainnet-probe, passive-monitor, PerformanceOracle (Soroban contract) (+11 more)

### Community 39 - "Scoring Engine Core"
Cohesion: 0.21
Nodes (17): activeFlags(), assetMarketScore(), availabilityScore(), computeCard(), confidenceScore(), flagsMask(), headline(), integrityScore() (+9 more)

### Community 40 - "Mainnet Anchor Discovery"
Cohesion: 0.24
Nodes (14): anchorIdFor(), AnchorsFile, Candidate, cleanDirectoryName(), dedupeByTransferHost(), listingFrom(), mergeAnchors(), RegisteredAnchorsFile (+6 more)

### Community 41 - "Payment Aggregation & SEP Info"
Cohesion: 0.18
Nodes (14): aggregatePayments(), statsFor(), fetchAnchorInfo(), fetchSep24Info(), fetchStellarToml(), StellarToml, AnchorConfig, AnchorInfo (+6 more)

### Community 42 - "Testnet Candidates"
Cohesion: 0.15
Nodes (15): saveTestnetAnchors(), CandidateStatus, CheckName, CheckResult, HOSTNAME, ingestSubmissions(), loadOnboardingFile(), normalizeDomainInput() (+7 more)

### Community 43 - "Mock Anchor Integrations"
Cohesion: 0.20
Nodes (9): AppConfig, DepositIntegration, MockAnchorConfig, MockDepositIntegration, MockWithdrawalIntegration, Transaction, Polaris integration hooks for a mock anchor. Deliberately minimal: we collect…, TransactionForm (+1 more)

### Community 44 - "Aggregator TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 45 - "Archiver TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 46 - "Mainnet Probe TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 47 - "Passive Monitor TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 48 - "Flow Test Fixtures"
Cohesion: 0.17
Nodes (16): DEP_TX, deps(), target, toml(), USDC, WD_TX, attr(), base() (+8 more)

### Community 49 - "Anchor Status Fetch"
Cohesion: 0.18
Nodes (14): describeProblem(), FETCH_TIMEOUT_MS, fetchAnchorStatus(), issuedAssets(), LastProbe, lastProbeView(), mergeStatusInto(), policyNote() (+6 more)

### Community 50 - "Mainnet Probe Docs"
Cohesion: 0.12
Nodes (16): End-to-end demo walkthrough, Applications — `npm run onboard` and `npm run intake`, Anchor discovery, Discovery — `npm run discover`, Evidence — `npm run verify -- <sha256>`, mainnet-probe, Anchor onboarding / intake, Policy decline counted as success (+8 more)

### Community 51 - "FX Rates & Chain Tests"
Cohesion: 0.18
Nodes (10): vitest, ARST, CURRENCY_API, EXCHANGERATE_API, FxSource, FxTable, loadFxTable(), usdPerUnit() (+2 more)

### Community 52 - "Testnet Anchors & Onboarding"
Cohesion: 0.22
Nodes (13): TestnetAnchor, testnetAnchorId(), TestnetAnchorsFile, FlowResult, FlowTarget, checksFromFlow(), cleanName(), CONTROL (+5 more)

### Community 53 - "Onboarding API Routes"
Cohesion: 0.19
Nodes (10): dynamic, POST(), base, dynamic, POST(), normalizeDomainInput(), handleApplication(), json() (+2 more)

### Community 54 - "Dashboard History Charts"
Cohesion: 0.20
Nodes (12): stroopsToXlm(), ArchiveFile, FETCH_TIMEOUT_MS, fetchArchive(), MAX_CHART_POINTS, mergeArchiveInto(), scoreKey(), slashKey() (+4 more)

### Community 55 - "RPC Provider Pool"
Cohesion: 0.18
Nodes (8): createRpcPool(), FALLBACK_CONCURRENCY, PRIMARY_CONCURRENCY, Provider, RpcPool, Semaphore, pool(), server()

### Community 56 - "Scoring Pillars & Gates"
Cohesion: 0.14
Nodes (15): Scoring v2 implementation prompt, Roadmap and SCF plan, Availability pillar, Confidence, Gates (hard caps), Integrity pillar, Scored only on issued assets (SEP-1 bidirectional check), Market pillar (+7 more)

### Community 57 - "SEP-10 Auth"
Cohesion: 0.16
Nodes (10): authenticateSep10(), ChallengeResponse, TokenResponse, fetchAnchorToml(), parseAnchorToml(), FlowStep, FlowStepName, ProbeResult (+2 more)

### Community 58 - "Testnet Probe TS Config"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 59 - "Apply Page"
Cohesion: 0.20
Nodes (8): metadata, NetworkSwitch(), Application, ApplicationCheck, CHECK_LABEL, CheckName, HOSTNAME, STATUS_COPY

### Community 60 - "Collector Host & Incidents Docs"
Cohesion: 0.15
Nodes (11): Collector incidents, Collector host: the onboarding intake, Collector host: the public files, scripts, aggregator, Content-addressed inputs bundle (score-inputs/v1), Pure scoring engine (bundle to card), verify-score command (+3 more)

### Community 61 - "Asset Flow Bucketing"
Cohesion: 0.21
Nodes (13): AssetFlows, assetKey(), bucketize(), classify(), DayBucket, emptyBucket(), FLOW_DAYS, FlowsFile (+5 more)

### Community 62 - "AMM Market Quotes"
Cohesion: 0.18
Nodes (13): AmmQuote, assetParams(), DEPTH_BAND, fetchQuotes(), Level, MarketSample, MAX_SPREAD, MIN_DEPTH_USD (+5 more)

### Community 63 - "Testnet Apply Page"
Cohesion: 0.22
Nodes (8): metadata, STEPS, ApplicationStatus, TESTNET_CHECK_LABEL, TestnetApplication, TestnetCheck, TestnetCheckName, testnetTxUrl()

### Community 64 - "Source Badges & Formatting"
Cohesion: 0.18
Nodes (10): ICONS, SourceBadge(), STYLES, DATE_FORMATTER, formatChartAxisLabel(), formatStakeXlm(), SOURCE_LABELS, sourceLabel() (+2 more)

### Community 65 - "Collector Incidents"
Cohesion: 0.24
Nodes (11): applyIncidents(), COLLECTOR_INCIDENTS, CollectorIncident, IncidentExclusion, isConnectionFailure(), INCIDENT, probe(), proof() (+3 more)

### Community 66 - "Scores Page & Summary"
Cohesion: 0.20
Nodes (10): Page(), revalidate, Dashboard(), mergeImportedInto(), FETCH_TIMEOUT_MS, fetchScoreSummary(), mergeCardContext(), SummaryFile (+2 more)

### Community 67 - "Dashboard Docs & Judging"
Cohesion: 0.20
Nodes (12): Applications, Score card display rules (confidence >= 40), dashboard, Data layer, Score cards, Setup and running, Hackathon judging criteria, AnchorRegistry contract (+4 more)

### Community 68 - "Mainnet Probe Package"
Cohesion: 0.17
Nodes (11): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, tsx, vitest, name (+3 more)

### Community 69 - "Testnet Registry Chain"
Cohesion: 0.27
Nodes (8): registeredAnchorIds(), registerTestnetAnchor(), registry(), config, __dirname, repoRoot, anchors, missing

### Community 70 - "Structure Page & Branding"
Cohesion: 0.27
Nodes (6): metadata, Logo(), Wordmark(), SiteNav(), ThemeToggle(), @phosphor-icons/react

### Community 71 - "Demo Walkthrough Steps"
Cohesion: 0.18
Nodes (10): 1) Introduce the three layers, 2) Open the dashboard, 3) Show the filters, 4) Click an anchor to open its detail view, 5) Show risk detection live (the actual "wow" moment), 6) Closing, End-to-End Demo — Presentation Walkthrough, Prerequisites (+2 more)

### Community 72 - "Scoring v2 Prompt"
Cohesion: 0.18
Nodes (10): Context you must know, Ground rules, Part A: remove the TRY focus, Part B: implementation, Phase 1: contract, engine and publisher on existing data, Phase 2: integrity checklist, Phase 3: chain signals (Market and flows), Phase 4: docs and handoff (+2 more)

### Community 73 - "Testnet Probe Deps"
Cohesion: 0.18
Nodes (11): node-schedule, dependencies, dotenv, node-schedule, playwright, smol-toml, @stellar/stellar-sdk, dotenv (+3 more)

### Community 74 - "Aggregator Package"
Cohesion: 0.18
Nodes (10): dependencies, dotenv, @stellar/stellar-sdk, description, tsx, vitest, name, private (+2 more)

### Community 75 - "Testnet Probe Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, discover, intake, onboard, probe, register, sync-from-chain (+3 more)

### Community 76 - "Testnet Probe Dev Deps"
Cohesion: 0.18
Nodes (11): devDependencies, tsx, @types/node, @types/node-schedule, typescript, vitest, tsx, @types/node (+3 more)

### Community 77 - "Onboarding Server"
Cohesion: 0.29
Nodes (8): OnboardingFile, acceptedAnchorIds(), FETCH_TIMEOUT_MS, fetchFile(), fetchImportedAnchorIds(), fetchOnboarding(), fetchTestnetOnboarding(), TestnetOnboardingFile

### Community 78 - "Scoring Curve Builder"
Cohesion: 0.31
Nodes (9): build(), card_at(), curve(), demo(), outcome(), rate(), Builds the frozen mock-anchor data: fixtures/mock_anchor_N-behavior.json. No…, The card as it would read at the end of `day` (0-based). (+1 more)

### Community 79 - "Apply Form & Status"
Cohesion: 0.36
Nodes (7): ApplyForm(), submit(), dateTime(), Outcome, outcomeFor(), ChipTone, StatusChip()

### Community 80 - "TODO Plan (Turkish)"
Cohesion: 0.22
Nodes (8): 1. Plandan kalanlar (adım 7), 2. Mainnet öncesi yapılması gerekenler, 3. Ölçümü güçlendirecek işler, 4. Güven modeli, 5. Dokümantasyon ve açıklık, 6. Küçük tutarsızlıklar, Yapılacaklar, Önerilen sıra

### Community 81 - "Full System Setup Guide"
Cohesion: 0.22
Nodes (9): 1. Prerequisites, 2. Configure the environment, 3. Deploy the contracts, 4. Run the collectors, 5. Run the dashboard, 6. Everything at once, 7. Continuous collection (the deployed setup), `mock-anchors` behavior profiles (+1 more)

### Community 82 - "Trade History Drawdown"
Cohesion: 0.36
Nodes (6): USDC, assetParams(), Candle, fetchTradeHistory(), maxDrawdownPct(), TradeHistory

### Community 83 - "SEP-24 Deposit Flow"
Cohesion: 0.31
Nodes (7): getTransactionStatus(), initiateInteractiveDeposit(), InteractiveDepositResponse, isTerminalStatus(), pollUntilTerminal(), Sep24Transaction, TERMINAL_STATUSES

### Community 84 - "Registry Types"
Cohesion: 0.29
Nodes (7): AnchorInfo, DataKey, Address, String, Symbol, SourceType, WithdrawalRequest

### Community 85 - "Root Layout & Theme"
Cohesion: 0.29
Nodes (5): metadata, mono, sans, ThemeProvider(), next

### Community 86 - "Graph Sync Script"
Cohesion: 0.25
Nodes (6): chrome, cut, html, nodes, out, src

### Community 87 - "Aggregator Scripts"
Cohesion: 0.25
Nodes (8): scripts, aggregate, build, calibrate, score, test, typecheck, verify-score

### Community 88 - "Mainnet Probe Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, onboard, probe, register, schedule, test, typecheck

### Community 89 - "Mock Anchors Docs"
Cohesion: 0.33
Nodes (5): Demo traffic (`seed_demo_transactions`), How it works (no real Stellar submission), mock-anchors, Notes, Setup

### Community 90 - "Testnet Probe Package"
Cohesion: 0.33
Nodes (5): description, name, private, type, version

### Community 91 - "Public Host Check"
Cohesion: 0.47
Nodes (4): isPrivateAddress(), Resolver, resolvesToPublicAddress(), v4Private()

### Community 92 - "Dev Deps (A)"
Cohesion: 0.40
Nodes (5): devDependencies, tsx, @types/node, typescript, vitest

### Community 93 - "Dev Deps (B)"
Cohesion: 0.40
Nodes (5): devDependencies, tsx, @types/node, typescript, vitest

### Community 94 - "Polaris Asset Seeding"
Cohesion: 0.40
Nodes (3): Command, BaseCommand, Creates/updates this instance's Polaris Asset row from environment variables…

### Community 95 - "Testnet Evidence Hashing"
Cohesion: 0.60
Nodes (4): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence()

### Community 96 - "Collect Script"
Cohesion: 0.67
Nodes (3): AGGREGATOR_SKIP_MOCK, log(), collect.sh script

### Community 97 - "Contract Deploy Script"
Cohesion: 0.67
Nodes (3): pubkey_of(), deploy-contracts.sh script, STELLAR_ACCOUNT

### Community 98 - "Contract Upgrade Script"
Cohesion: 0.67
Nodes (3): upgrade-contracts.sh script, STELLAR_ACCOUNT, upgrade()

### Community 99 - "Contracts Concept"
Cohesion: 0.67
Nodes (3): AnchorRegistry contract, EMA, trend and risk floor, PerformanceOracle contract

## Knowledge Gaps
- **551 isolated node(s):** `StatusAsset`, `StatusFile`, `ProbeChecks`, `ProbeTranscript`, `StageResult` (+546 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 716 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `FX Rates & Chain Tests` to `Collector Incidents`, `Aggregator Config & Evidence`, `Chain Anchor Sync`, `Aggregator Run Limits`, `Dashboard Dependencies`, `Scoring Engine Core`, `Anchor Status Fetch`, `Trade History Drawdown`, `Passive Monitor Config`, `Chain Signals & Issued Assets`, `Health Labels`, `Reflector Price Feeds`?**
  _High betweenness centrality (0.190) - this node is a cross-community bridge._
- **Why does `anchor()` connect `Anchor Status Fetch` to `Testnet Account & Interactive Flow`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `MainnetAnchor` connect `Anchor Aliases & Dormancy` to `Mainnet Anchor Discovery`, `Mainnet Onboarding`, `Chain Anchor Sync`, `Issuer Lookup Cache`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `StatusAsset`, `StatusFile`, `ProbeChecks` to the rest of the system?**
  _551 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `History Archive Merging` be split into smaller, more focused modules?**
  _Cohesion score 0.07704918032786885 - nodes in this community are weakly interconnected._
- **Should `Mock Anchor Behavior Sim` be split into smaller, more focused modules?**
  _Cohesion score 0.07993966817496229 - nodes in this community are weakly interconnected._
- **Should `Oracle Contract Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.12081632653061225 - nodes in this community are weakly interconnected._