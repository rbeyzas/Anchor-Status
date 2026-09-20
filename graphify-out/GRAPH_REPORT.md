# Graph Report - Anchor-Status-Beyza  (2026-09-20)

## Corpus Check
- 65 files · ~322,771 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1848 nodes · 3641 edges · 125 communities (97 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- events.ts / history-archiver/src/i
- app/page.tsx / home.ts
- soroban.ts / contract-state.ts
- test_behavior.py / simulate_observation()
- performance-oracle/src / setup()
- lib/types.ts / AnchorDetailModal.tsx
- Env / record_report()
- mainnet-probe/src/cand / intake.ts
- testnet-probe/package. / scripts
- scoring.rs / feed()
- status-labels.ts / AnchorViewModel
- mainnet-probe/src/prob / http.ts
- scripts / mainnet-probe/package.
- passive-monitor/src/ch / chain.test.ts
- mainnet-probe/src/onbo / main()
- engine.ts / constants.ts
- README.md / SCORING.md
- compilerOptions / include
- scoring/run.ts / load.ts
- history-archiver/packa / scripts
- src/run.ts / main()
- passive-monitor/packag / devDependencies
- Env / AnchorRegistry
- aggregator/src/index.t / sources.ts
- inputs.ts / inputs.test.ts
- mainnet-probe/src/toml / mainnet-probe/src/veri
- testnet-probe/src/prob / schedule.ts
- history.ts / history.test.ts
- mainnet-probe/src/anch / discover.ts
- testnet-probe/src/onbo / testnet-probe/src/cand
- setup() / anchor-registry/src/te
- Scoring methodology (v / 5. Inputs
- engine.test.ts / computeCard()
- mainnet-probe/src/onbo / mainnet-probe/src/onbo
- testnet-probe/src/onbo / testnet-probe/src/onbo
- MockDepositIntegration / MockWithdrawalIntegrat
- methodology/page.tsx / methodology.ts
- compilerOptions / aggregator/tsconfig.js
- compilerOptions / history-archiver/tscon
- compilerOptions / mainnet-probe/tsconfig
- compilerOptions / passive-monitor/tsconf
- sep6.ts / flow.test.ts
- verify-score.ts / testnet.test.ts
- normalizeDomainInput() / onboarding-proxy.ts
- ScoreValue.tsx / ScoreTier
- lib/rpc.ts / RpcPool
- flow.ts / FlowDeps
- compilerOptions / testnet-probe/tsconfig
- dashboard / PerformanceOracle cont
- horizon.ts / horizon.test.ts
- passive-monitor/src/in / runChainSignals()
- testnet/page.tsx / onboarding-testnet.ts
- flows.ts / updateFlows()
- format.ts / SourceBadge.tsx
- dashboard/package.json / recharts
- incidents.ts / incidents.test.ts
- issuers.ts / issuers.test.ts
- testnet-probe/src/type / sep10.ts
- onboarding-server.ts / fetchImportedAnchorIds
- aggregator / Score card methodology
- contract.ts / aggregator/src/config.
- passive-monitor/src/ty / aggregate.ts
- testnet-probe/src/regi / testnet-probe/src/conf
- apply/page.tsx / lib/onboarding.ts
- SiteNav.tsx / Logo.tsx
- Presentation flow / End-to-End Demo — Pres
- Prompt: implement the  / Part B: implementation
- publisher.ts / ScoreInputs
- dependencies / framer-motion
- devDependencies / autoprefixer
- build.py / card_at()
- horizon-verify.ts / checkOperations()
- Yapılacaklar / TODO.md
- Running the full syste / 4. Run the collectors
- devDependencies / tsx
- sep24.ts / pollUntilTerminal()
- anchor-registry/src/ty / AnchorInfo
- scripts / build
- sync-graph.mjs / chrome
- aggregator / PerformanceOracle cont
- layout.tsx / ThemeProvider.tsx
- ApplyForm.tsx / ApplyForm()
- scripts / aggregate
- mainnet-probe / mainnet-probe/README.m
- sep.ts / fetchAnchorInfo()
- demo.sh / End-to-End Demo Walkth
- aggregator/package.jso / description
- mock-anchors / mock-anchors/README.md
- On-chain score (83) / Mock anchors source
- 6. Pillars / 6.1 Availability (weig
- Command / seed_asset.py
- testnet-probe / testnet-probe/README.m
- testnet-probe/src/evid / writeEvidence()
- collect.sh / log()
- upgrade-contracts.sh / upgrade-contracts.sh s
- interactive.ts / completeInteractiveFlo
- Anchor Reliability Ora / Stellar SEP-24 anchor
- orbit-trails.tsx / ORBITS
- server-autodeploy.sh / log()
- run-all.sh / run-all.sh script
- anchor-registry/src/er / Error
- performance-oracle/src / Error
- next.config.mjs / nextConfig
- next-env.d.ts / NOTE: This file should
- tailwind.config.ts / config
- anchor-registry / performance-oracle
- deploy-to-server.sh / deploy-to-server.sh sc
- settings.py / Django settings for a 
- fixtures/README.md / Frozen mock data
- django-polaris==2.5.0 / stellar-sdk<11.0.0,>=1
- bootstrap-issuers.sh / bootstrap-issuers.sh s
- load-fixtures.sh / load-fixtures.sh scrip
- stop-all.sh / stop-all.sh script
- TIME_ACCELERATION (Dem

## God Nodes (most connected - your core abstractions)
1. `setup()` - 36 edges
2. `main()` - 21 edges
3. `register_and_stake()` - 21 edges
4. `AnchorViewModel` - 21 edges
5. `runScoring()` - 21 edges
6. `Scoring methodology (v1)` - 20 edges
7. `mainnet_anchor()` - 19 edges
8. `setup()` - 18 edges
9. `compilerOptions` - 17 edges
10. `card()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Source types RealMainnet/RealTestnet/SimulatedMock` --references--> `aggregator`  [INFERRED]
  README.md → services/aggregator/README.md
- `Presentation flow` --references--> `dashboard`  [EXTRACTED]
  docs/DEMO.md → dashboard/README.md
- `aggregator` --calls--> `PerformanceOracle contract`  [EXTRACTED]
  services/aggregator/README.md → contracts/performance-oracle/README.md
- `aggregator` --shares_data_with--> `Published inputs bundle (SHA-256)`  [EXTRACTED]
  services/aggregator/README.md → docs/SCORING.md
- `history-archiver` --shares_data_with--> `dashboard`  [EXTRACTED]
  README.md → dashboard/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Oracle pipeline** — assets_readme_architecture_passive_monitor, assets_readme_architecture_testnet_probe, assets_readme_architecture_mock_anchors, assets_readme_architecture_aggregator, assets_readme_architecture_performanceoracle, assets_readme_architecture_anchorregistry [EXTRACTED 1.00]
- **Score card computation and publication** — services_aggregator_readme_aggregator, services_mainnet_probe_readme_mainnetprobe, services_passive_monitor_readme_passivemonitor, contracts_performance_oracle_readme_performanceoracle, docs_scoring_inputs_bundle [EXTRACTED 1.00]
- **Collector-to-oracle pipeline** — services_mainnet_probe_readme_mainnetprobe, services_testnet_probe_readme_testnetprobe, services_mock_anchors_readme_mockanchors, services_passive_monitor_readme_passivemonitor, services_aggregator_readme_aggregator, contracts_performance_oracle_readme_performanceoracle [EXTRACTED 1.00]
- **Three sources feeding one on-chain score** — assets_readme_hero_real_mainnet, assets_readme_hero_real_testnet, assets_readme_hero_mock_anchors, assets_readme_hero_on_chain_score [EXTRACTED 1.00]
- **Slashing Demo Scenario** — docs_demo_slashing_demo [INFERRED 0.80]

## Communities (125 total, 28 thin omitted)

### Community 0 - "events.ts / history-archiver/src/i"
Cohesion: 0.08
Nodes (40): loadArchive(), mergeAnchor(), mergeSorted(), riskEventKey(), saveArchive(), scorePointKey(), slashEventKey(), config (+32 more)

### Community 1 - "app/page.tsx / home.ts"
Cohesion: 0.07
Nodes (41): EMPTY, EVIDENCE, HomeSnapshot, LandingPage(), loadSnapshot(), revalidate, STEPS, TIER_TEXT (+33 more)

### Community 2 - "soroban.ts / contract-state.ts"
Cohesion: 0.07
Nodes (46): Page(), revalidate, Dashboard(), fetchAnchorStatus(), AnchorInfo, anchorInfoKey(), cardKey(), contractDataKey() (+38 more)

### Community 3 - "test_behavior.py / simulate_observation()"
Cohesion: 0.08
Nodes (38): Any, Asset, Path, Random, BehaviorProfile, effective_success_rate(), get_or_create_anchor_started_at(), Observation (+30 more)

### Community 4 - "performance-oracle/src / setup()"
Cohesion: 0.12
Nodes (49): a_card_for_an_unregistered_anchor_is_rejected(), a_card_from_an_unauthorized_reporter_is_rejected(), a_card_must_come_from_a_reporter_for_the_anchors_own_source_type(), a_card_whose_window_ends_in_the_future_is_rejected(), a_published_card_has_its_ttl_extended(), a_replayed_or_older_card_is_rejected(), a_report_does_not_put_a_withheld_cards_score_into_the_registry(), a_short_recovery_does_not_clear_a_mostly_failing_window() (+41 more)

### Community 5 - "lib/types.ts / AnchorDetailModal.tsx"
Cohesion: 0.10
Nodes (35): AnchorCard(), AnchorDetailModal(), SOURCE_ORDER, FilterBar(), FILTERS, FilterValue, PillarRadar(), BAND_TONE (+27 more)

### Community 6 - "Env / record_report()"
Cohesion: 0.12
Nodes (32): bump_instance(), bump_persistent(), floor_score(), PerformanceOracle, record_report(), Address, AnchorHealth, BytesN (+24 more)

### Community 7 - "mainnet-probe/src/cand / intake.ts"
Cohesion: 0.10
Nodes (29): appendSubmission(), CandidateStatus, CheckName, CheckResult, decideSubmission(), Decision, __dirname, HOSTNAME (+21 more)

### Community 8 - "testnet-probe/package. / scripts"
Cohesion: 0.06
Nodes (35): node-schedule, dependencies, dotenv, node-schedule, playwright, smol-toml, @stellar/stellar-sdk, description (+27 more)

### Community 9 - "scoring.rs / feed()"
Cohesion: 0.13
Nodes (26): a_steady_anchor_below_100_does_not_read_as_degrading_from_the_start(), consecutive_failures_reset_on_success(), decay(), ema_converges_toward_observation(), ema_update(), ema_weights_real_sources_more_than_mock(), ema_with_weight(), feed() (+18 more)

### Community 10 - "status-labels.ts / AnchorViewModel"
Cohesion: 0.11
Nodes (26): average(), StatsBar(), describeProblem(), FETCH_TIMEOUT_MS, issuedAssets(), lastProbeView(), mergeStatusInto(), policyNote() (+18 more)

### Community 11 - "mainnet-probe/src/prob / http.ts"
Cohesion: 0.11
Nodes (25): fetchAllPages(), Fetch, HttpError, timedFetch(), firstDepositAsset(), infoListsEnabledAsset(), isPolicyRejection(), message() (+17 more)

### Community 12 - "scripts / mainnet-probe/package."
Cohesion: 0.06
Nodes (31): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node (+23 more)

### Community 13 - "passive-monitor/src/ch / chain.test.ts"
Cohesion: 0.11
Nodes (25): issuedAssets(), IssuedFiat, StatusFile, ARST, IssuedAsset, CURRENCY_API, EXCHANGERATE_API, FxSource (+17 more)

### Community 14 - "mainnet-probe/src/onbo / main()"
Cohesion: 0.12
Nodes (21): loadAnchorsFile(), ingestSubmissions(), saveOnboardingFile(), config, __dirname, repoRoot, resolve(), ourNetworkIsDown() (+13 more)

### Community 15 - "engine.ts / constants.ts"
Cohesion: 0.13
Nodes (27): AVAILABILITY_RECENT_SHARE, CONFIDENCE_FULL_DAYS, CONFIDENCE_FULL_SAMPLES, CONFIDENCE_INSUFFICIENT, CONFIDENCE_LOW, CONFIDENCE_MEDIUM, COVERAGE_UNKNOWN, DEPEG_HOURS (+19 more)

### Community 16 - "README.md / SCORING.md"
Cohesion: 0.08
Nodes (19): anchor-registry, performance-oracle, Known limitations we are addressing, Milestones, Roadmap & SCF plan, Team capacity, Where we are (hackathon, September 2026), Deployed testnet contracts (+11 more)

### Community 17 - "compilerOptions / include"
Cohesion: 0.07
Nodes (27): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+19 more)

### Community 18 - "scoring/run.ts / load.ts"
Cohesion: 0.15
Nodes (25): publishScoreCard(), ScoreCardsUnsupported, flagNames(), AssetInfo, floorToHour(), FlowHistory, MarketSample, AnchorFlowHistory (+17 more)

### Community 19 - "history-archiver/packa / scripts"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+18 more)

### Community 20 - "src/run.ts / main()"
Cohesion: 0.17
Nodes (18): assignAliases(), operatorKey(), isDormant(), MainnetAnchor, listDomainAssets(), loadIssuerCache(), saveIssuerCache(), StageName (+10 more)

### Community 21 - "passive-monitor/packag / devDependencies"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node (+18 more)

### Community 22 - "Env / AnchorRegistry"
Cohesion: 0.20
Nodes (15): AnchorInfo, AnchorRegistryInterface, AnchorRegistry, bump_instance(), bump_persistent(), Address, BytesN, DataKey (+7 more)

### Community 23 - "aggregator/src/index.t / sources.ts"
Cohesion: 0.23
Nodes (18): main(), dedupKey(), normalizeMainnetProbeResult(), normalizeMockAnchorLogEntry(), normalizePassiveMonitorProfile(), normalizeTestnetProbeResult(), readJsonArray(), readMainnetProbeReports() (+10 more)

### Community 24 - "inputs.ts / inputs.test.ts"
Cohesion: 0.15
Nodes (23): METHODOLOGY_VERSION, AnchorContext, buildInputs(), coverageOf(), fixed(), flowAggregates(), integrityChecks(), isSep10Mismatch() (+15 more)

### Community 25 - "mainnet-probe/src/toml / mainnet-probe/src/veri"
Cohesion: 0.15
Nodes (18): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence(), Timed, fetchAnchorToml(), parseAnchorToml(), parseCurrencies() (+10 more)

### Community 26 - "testnet-probe/src/prob / schedule.ts"
Cohesion: 0.15
Nodes (17): anchor(), loadTestnetAnchors(), createAndFundAccount(), balanceOf(), memoFor(), sendPayment(), appendResult(), isProbeEnvironmentError() (+9 more)

### Community 27 - "history.ts / history.test.ts"
Cohesion: 0.15
Nodes (15): hasRecentSignificantDrop(), scoreAt(), stroopsToXlm(), ArchiveFile, FETCH_TIMEOUT_MS, fetchArchive(), MAX_CHART_POINTS, mergeArchiveInto() (+7 more)

### Community 28 - "mainnet-probe/src/anch / discover.ts"
Cohesion: 0.20
Nodes (16): anchorIdFor(), AnchorsFile, Candidate, cleanDirectoryName(), dedupeByTransferHost(), Listing, listingFrom(), mergeAnchors() (+8 more)

### Community 29 - "testnet-probe/src/onbo / testnet-probe/src/cand"
Cohesion: 0.13
Nodes (16): CandidateStatus, CheckName, HOSTNAME, ingestSubmissions(), loadOnboardingFile(), normalizeDomainInput(), OnboardingCandidate, OnboardingFile (+8 more)

### Community 30 - "setup() / anchor-registry/src/te"
Cohesion: 0.19
Nodes (19): Client, get_anchor_info_not_found_fails(), list_anchors_returns_registered_ids_in_order(), mint(), register_anchor_duplicate_fails(), register_anchor_extends_the_record_ttl(), register_anchor_success(), Address (+11 more)

### Community 31 - "Scoring methodology (v / 5. Inputs"
Cohesion: 0.10
Nodes (20): 10. Worked examples (golden tests), 11. Signals deliberately not scored, 12. On-chain design (PerformanceOracle), 13. Off-chain design, 14. Verifiability, 15. Dashboard, 16. Gaming and failure modes, 17. Tunable constants (+12 more)

### Community 32 - "engine.test.ts / computeCard()"
Cohesion: 0.19
Nodes (17): activeFlags(), assetMarketScore(), availabilityScore(), computeCard(), confidenceScore(), flagsMask(), headline(), integrityScore() (+9 more)

### Community 33 - "mainnet-probe/src/onbo / mainnet-probe/src/onbo"
Cohesion: 0.19
Nodes (18): IssuerRecord, cleanName(), evaluateCandidate(), Evaluation, MAINNET_PASSPHRASE, OnboardingDeps, plainError(), daysAgo() (+10 more)

### Community 34 - "testnet-probe/src/onbo / testnet-probe/src/onbo"
Cohesion: 0.17
Nodes (16): saveTestnetAnchors(), TestnetAnchor, testnetAnchorId(), TestnetAnchorsFile, CheckResult, FlowResult, FlowTarget, ADMISSION_RULE (+8 more)

### Community 35 - "MockDepositIntegration / MockWithdrawalIntegrat"
Cohesion: 0.20
Nodes (9): AppConfig, DepositIntegration, MockAnchorConfig, MockDepositIntegration, MockWithdrawalIntegration, Transaction, Polaris integration hooks for a mock anchor. Deliberately minimal: we collect…, TransactionForm (+1 more)

### Community 36 - "methodology/page.tsx / methodology.ts"
Cohesion: 0.18
Nodes (12): metadata, PILLAR_COPY, STAGES, CONFIDENCE_BANDS, INFO_FLAGS, INTEGRITY_CHECKS, interp(), MARKET_CURVE (+4 more)

### Community 37 - "compilerOptions / aggregator/tsconfig.js"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 38 - "compilerOptions / history-archiver/tscon"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 39 - "compilerOptions / mainnet-probe/tsconfig"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 40 - "compilerOptions / passive-monitor/tsconf"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 41 - "sep6.ts / flow.test.ts"
Cohesion: 0.17
Nodes (16): DEP_TX, deps(), target, toml(), USDC, WD_TX, attr(), base() (+8 more)

### Community 42 - "verify-score.ts / testnet.test.ts"
Cohesion: 0.21
Nodes (13): canonicalJson(), SCORE_INPUTS_SCHEMA, sha256Hex(), writeDocument(), dayDigest(), readTestnetProbeLines(), checks, stages (+5 more)

### Community 43 - "normalizeDomainInput() / onboarding-proxy.ts"
Cohesion: 0.19
Nodes (10): dynamic, POST(), base, dynamic, POST(), normalizeDomainInput(), handleApplication(), json() (+2 more)

### Community 44 - "ScoreValue.tsx / ScoreTier"
Cohesion: 0.19
Nodes (12): LABEL, ScoreJourney(), tone(), reducedMotion(), scoreColorClass(), ScoreValue(), TIER_STROKE_VAR, TIER_TEXT_CLASS (+4 more)

### Community 45 - "lib/rpc.ts / RpcPool"
Cohesion: 0.18
Nodes (8): createRpcPool(), FALLBACK_CONCURRENCY, PRIMARY_CONCURRENCY, Provider, RpcPool, Semaphore, pool(), server()

### Community 46 - "flow.ts / FlowDeps"
Cohesion: 0.22
Nodes (14): floor7(), FlowDeps, msg(), runMoneyFlow(), step(), short(), StepFailure, TERMINAL (+6 more)

### Community 47 - "compilerOptions / testnet-probe/tsconfig"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 48 - "dashboard / PerformanceOracle cont"
Cohesion: 0.16
Nodes (14): AnchorRegistry contract, EMA, trend and risk floor, PerformanceOracle contract, Applications, dashboard, Data layer, Score cards, Setup and running (+6 more)

### Community 49 - "horizon.ts / horizon.test.ts"
Cohesion: 0.15
Nodes (10): dependencies, dotenv, @stellar/stellar-sdk, dotenv, @stellar/stellar-sdk, isHistoryMissing(), PAYMENT_TYPES, RecentPayments (+2 more)

### Community 50 - "passive-monitor/src/in / runChainSignals()"
Cohesion: 0.26
Nodes (11): runChainSignals(), config, __dirname, loadAnchorsFile(), repoRoot, fetchRecentPayments(), sleep(), buildProfile() (+3 more)

### Community 51 - "testnet/page.tsx / onboarding-testnet.ts"
Cohesion: 0.21
Nodes (9): metadata, STEPS, NetworkSwitch(), ApplicationStatus, TESTNET_CHECK_LABEL, TestnetApplication, TestnetCheck, TestnetCheckName (+1 more)

### Community 52 - "flows.ts / updateFlows()"
Cohesion: 0.21
Nodes (13): AssetFlows, assetKey(), bucketize(), classify(), DayBucket, emptyBucket(), FLOW_DAYS, FlowsFile (+5 more)

### Community 53 - "format.ts / SourceBadge.tsx"
Cohesion: 0.18
Nodes (10): ICONS, SourceBadge(), STYLES, DATE_FORMATTER, formatChartAxisLabel(), formatStakeXlm(), SOURCE_LABELS, sourceLabel() (+2 more)

### Community 54 - "dashboard/package.json / recharts"
Cohesion: 0.15
Nodes (12): name, private, version, autoprefixer, dotenv-cli, next-themes, postcss, react-dom (+4 more)

### Community 55 - "incidents.ts / incidents.test.ts"
Cohesion: 0.24
Nodes (11): applyIncidents(), COLLECTOR_INCIDENTS, CollectorIncident, IncidentExclusion, isConnectionFailure(), INCIDENT, probe(), proof() (+3 more)

### Community 56 - "issuers.ts / issuers.test.ts"
Cohesion: 0.24
Nodes (10): AssetStatus, DomainListing, fresh(), ISSUER_CACHE_MS, IssuerCache, issuerMatches(), normalizeDomain(), now (+2 more)

### Community 57 - "testnet-probe/src/type / sep10.ts"
Cohesion: 0.19
Nodes (9): authenticateSep10(), ChallengeResponse, TokenResponse, fetchAnchorToml(), parseAnchorToml(), FlowStep, FlowStepName, ProbeStatus (+1 more)

### Community 58 - "onboarding-server.ts / fetchImportedAnchorIds"
Cohesion: 0.23
Nodes (10): ApplyPage(), ApplyTestnetPage(), OnboardingFile, acceptedAnchorIds(), FETCH_TIMEOUT_MS, fetchFile(), fetchImportedAnchorIds(), fetchOnboarding() (+2 more)

### Community 59 - "aggregator / Score card methodology"
Cohesion: 0.23
Nodes (12): Confidence (separate from score), Hard gates (OUTAGE, DEPEG, etc.), Published inputs bundle (SHA-256), Four pillars: availability, speed, integrity, market, Score card methodology, Source types RealMainnet/RealTestnet/SimulatedMock, aggregator, mainnet-probe service (+4 more)

### Community 60 - "contract.ts / aggregator/src/config."
Cohesion: 0.21
Nodes (9): config, __dirname, repoRoot, scoreCardsStatePath(), clientCache, getReporterClient(), submitReport(), toContractArgs() (+1 more)

### Community 61 - "passive-monitor/src/ty / aggregate.ts"
Cohesion: 0.29
Nodes (8): aggregatePayments(), statsFor(), AnchorConfig, AnchorsFile, AssetVolume, BaseProfile, PaymentRecord, VolumeStats

### Community 62 - "testnet-probe/src/regi / testnet-probe/src/conf"
Cohesion: 0.27
Nodes (8): registeredAnchorIds(), registerTestnetAnchor(), registry(), config, __dirname, repoRoot, anchors, missing

### Community 63 - "apply/page.tsx / lib/onboarding.ts"
Cohesion: 0.25
Nodes (7): metadata, Application, ApplicationCheck, CHECK_LABEL, CheckName, HOSTNAME, STATUS_COPY

### Community 64 - "SiteNav.tsx / Logo.tsx"
Cohesion: 0.27
Nodes (6): metadata, Logo(), Wordmark(), SiteNav(), ThemeToggle(), next

### Community 65 - "Presentation flow / End-to-End Demo — Pres"
Cohesion: 0.18
Nodes (10): 1) Introduce the three layers, 2) Open the dashboard, 3) Show the filters, 4) Click an anchor to open its detail view, 5) Show risk detection live (the actual "wow" moment), 6) Closing, End-to-End Demo — Presentation Walkthrough, Prerequisites (+2 more)

### Community 66 - "Prompt: implement the  / Part B: implementation"
Cohesion: 0.18
Nodes (10): Context you must know, Ground rules, Part A: remove the TRY focus, Part B: implementation, Phase 1: contract, engine and publisher on existing data, Phase 2: integrity checklist, Phase 3: chain signals (Market and flows), Phase 4: docs and handoff (+2 more)

### Community 67 - "publisher.ts / ScoreInputs"
Cohesion: 0.22
Nodes (10): MAX_CARDS_PER_RUN, REPUBLISH_AFTER_MS, Candidate, CardSummary, PublishedCards, sameCard(), selectToPublish(), ScoringResult (+2 more)

### Community 68 - "dependencies / framer-motion"
Cohesion: 0.20
Nodes (10): dependencies, framer-motion, next, next-themes, @phosphor-icons/react, react, react-dom, recharts (+2 more)

### Community 69 - "devDependencies / autoprefixer"
Cohesion: 0.20
Nodes (10): devDependencies, autoprefixer, dotenv-cli, postcss, tailwindcss, @types/node, @types/react, @types/react-dom (+2 more)

### Community 70 - "build.py / card_at()"
Cohesion: 0.31
Nodes (9): build(), card_at(), curve(), demo(), outcome(), rate(), Builds the frozen mock-anchor data: fixtures/mock_anchor_N-behavior.json. No…, The card as it would read at the end of `day` (0-based). (+1 more)

### Community 71 - "horizon-verify.ts / checkOperations()"
Cohesion: 0.29
Nodes (7): checkOperations(), Operation, same(), USDC, Transfer, VerifiedPayment, verifyPayment()

### Community 72 - "Yapılacaklar / TODO.md"
Cohesion: 0.22
Nodes (8): 1. Plandan kalanlar (adım 7), 2. Mainnet öncesi yapılması gerekenler, 3. Ölçümü güçlendirecek işler, 4. Güven modeli, 5. Dokümantasyon ve açıklık, 6. Küçük tutarsızlıklar, Yapılacaklar, Önerilen sıra

### Community 73 - "Running the full syste / 4. Run the collectors"
Cohesion: 0.22
Nodes (9): 1. Prerequisites, 2. Configure the environment, 3. Deploy the contracts, 4. Run the collectors, 5. Run the dashboard, 6. Everything at once, 7. Continuous collection (the deployed setup), `mock-anchors` behavior profiles (+1 more)

### Community 74 - "devDependencies / tsx"
Cohesion: 0.22
Nodes (9): devDependencies, tsx, @types/node, typescript, vitest, tsx, @types/node, typescript (+1 more)

### Community 75 - "sep24.ts / pollUntilTerminal()"
Cohesion: 0.31
Nodes (7): getTransactionStatus(), initiateInteractiveDeposit(), InteractiveDepositResponse, isTerminalStatus(), pollUntilTerminal(), Sep24Transaction, TERMINAL_STATUSES

### Community 76 - "anchor-registry/src/ty / AnchorInfo"
Cohesion: 0.29
Nodes (7): AnchorInfo, DataKey, Address, String, Symbol, SourceType, WithdrawalRequest

### Community 77 - "scripts / build"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, start, sync-graph, test, typecheck

### Community 78 - "sync-graph.mjs / chrome"
Cohesion: 0.25
Nodes (6): chrome, cut, html, nodes, out, src

### Community 79 - "aggregator / PerformanceOracle cont"
Cohesion: 0.33
Nodes (7): aggregator, AnchorRegistry contract, dashboard, mock-anchors collector, passive-monitor collector, PerformanceOracle contract, testnet-probe collector

### Community 80 - "layout.tsx / ThemeProvider.tsx"
Cohesion: 0.33
Nodes (4): metadata, mono, sans, ThemeProvider()

### Community 81 - "ApplyForm.tsx / ApplyForm()"
Cohesion: 0.43
Nodes (6): ApplyForm(), submit(), dateTime(), Outcome, outcomeFor(), ChipTone

### Community 82 - "scripts / aggregate"
Cohesion: 0.29
Nodes (7): scripts, aggregate, build, score, test, typecheck, verify-score

### Community 83 - "mainnet-probe / mainnet-probe/README.m"
Cohesion: 0.29
Nodes (6): Applications — `npm run onboard` and `npm run intake`, Discovery — `npm run discover`, Evidence — `npm run verify -- <sha256>`, mainnet-probe, Probe — `npm run probe`, Registration — `npm run register`

### Community 84 - "sep.ts / fetchAnchorInfo()"
Cohesion: 0.38
Nodes (6): fetchAnchorInfo(), fetchSep24Info(), fetchStellarToml(), StellarToml, AnchorInfo, Sep24Currency

### Community 85 - "demo.sh / End-to-End Demo Walkth"
Cohesion: 0.33
Nodes (4): End-to-End Demo Walkthrough, Live Slashing Demo Moment, demo.sh script, setup-env.sh script

### Community 86 - "aggregator/package.jso / description"
Cohesion: 0.33
Nodes (5): description, name, private, type, version

### Community 87 - "mock-anchors / mock-anchors/README.md"
Cohesion: 0.33
Nodes (5): Demo traffic (`seed_demo_transactions`), How it works (no real Stellar submission), mock-anchors, Notes, Setup

### Community 88 - "On-chain score (83) / Mock anchors source"
Cohesion: 0.40
Nodes (5): Mock anchors source, On-chain score (83), Real mainnet source, Real testnet source, Risk flag

### Community 89 - "6. Pillars / 6.1 Availability (weig"
Cohesion: 0.40
Nodes (5): 6.1 Availability (weight 450 permille), 6.2 Speed (weight 200 permille), 6.3 Integrity (weight 200 permille), 6.4 Market (weight 150 permille, often n/a), 6. Pillars

### Community 90 - "Command / seed_asset.py"
Cohesion: 0.40
Nodes (3): Command, BaseCommand, Creates/updates this instance's Polaris Asset row from environment variables…

### Community 91 - "testnet-probe / testnet-probe/README.m"
Cohesion: 0.40
Nodes (4): Applications (`npm run onboard`, `npm run register`), Run it, testnet-probe, The money-flow check (`src/flow.ts`)

### Community 92 - "testnet-probe/src/evid / writeEvidence()"
Cohesion: 0.60
Nodes (4): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence()

### Community 93 - "collect.sh / log()"
Cohesion: 0.67
Nodes (3): AGGREGATOR_SKIP_MOCK, log(), collect.sh script

### Community 94 - "upgrade-contracts.sh / upgrade-contracts.sh s"
Cohesion: 0.67
Nodes (3): upgrade-contracts.sh script, STELLAR_ACCOUNT, upgrade()

### Community 95 - "interactive.ts / completeInteractiveFlo"
Cohesion: 0.83
Nodes (3): completeInteractiveFlow(), preinstalledChromiumPath(), tryFillAndSubmit()

### Community 96 - "Anchor Reliability Ora / Stellar SEP-24 anchor"
Cohesion: 0.67
Nodes (3): Anchor Reliability Oracle Network hero, Stellar SEP-24 anchor, Tech stack: Soroban/Rust, Next.js, Node.js, Django

## Knowledge Gaps
- **521 isolated node(s):** `StellarToml`, `AnchorsFile`, `ArchiveFile`, `Provider`, `CandidateStatus` (+516 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 681 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `anchor()` connect `testnet-probe/src/prob / schedule.ts` to `status-labels.ts / AnchorViewModel`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Why does `vitest` connect `status-labels.ts / AnchorViewModel` to `verify-score.ts / testnet.test.ts`, `passive-monitor/src/ch / chain.test.ts`, `horizon.ts / horizon.test.ts`, `dashboard/package.json / recharts`, `incidents.ts / incidents.test.ts`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `@stellar/stellar-sdk` connect `horizon.ts / horizon.test.ts` to `soroban.ts / contract-state.ts`, `verify-score.ts / testnet.test.ts`, `passive-monitor/src/ch / chain.test.ts`, `dashboard/package.json / recharts`, `contract.ts / aggregator/src/config.`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `StellarToml`, `AnchorsFile`, `ArchiveFile` to the rest of the system?**
  _521 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `events.ts / history-archiver/src/i` be split into smaller, more focused modules?**
  _Cohesion score 0.07704918032786885 - nodes in this community are weakly interconnected._
- **Should `app/page.tsx / home.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06818181818181818 - nodes in this community are weakly interconnected._
- **Should `soroban.ts / contract-state.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._