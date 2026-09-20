# Graph Report - Anchor-Status-Beyza  (2026-09-20)

## Corpus Check
- 310 files · ~321,650 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1847 nodes · 3696 edges · 120 communities (90 shown, 19 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `90182663`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- passive-monitor/src/types.ts
- soroban.ts
- Env
- events.ts
- test_behavior.py
- performance-oracle/src/test.rs
- engine.ts
- app/page.tsx
- scoring.rs
- lib/types.ts
- mainnet-probe/src/candidates.ts
- scoring/run.ts
- aggregator
- src/run.ts
- inputs.ts
- mainnet-probe/src/anchors.ts
- methodology/page.tsx
- flow.ts
- mainnet-probe/src/toml.ts
- testnet-probe/src/probe.ts
- aggregator/src/index.ts
- mainnet-probe/src/probe.ts
- setup
- mainnet-probe/src/onboarding.ts
- testnet/page.tsx
- compilerOptions
- testnet-probe/src/onboarding.ts
- testnet-probe/src/register.ts
- mainnet-probe/src/onboard.ts
- MockDepositIntegration
- scripts
- issuers.ts
- passive-monitor/package.json
- testnet-probe/src/onboard.ts
- Env
- Dashboard.tsx
- ScoreValue.tsx
- aggregator/package.json
- history-archiver/package.json
- engine.test.ts
- scoring/types.ts
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- onboarding-proxy.ts
- contract.ts
- status-labels.ts
- dashboard/package.json
- Scoring methodology (v1)
- testnet-probe/src/types.ts
- verify-score.ts
- sync-graph.mjs
- dependencies
- devDependencies
- testnet-probe/src/public-host.ts
- horizon-verify.ts
- layout.tsx
- anchor-registry/src/types.rs
- performance-oracle/src/errors.rs
- react
- aggregator
- scripts
- tailwindcss
- tailwind.config.ts
- testnet-probe/src/evidence.ts
- ScorePoint
- completeInteractiveFlow
- testnet-probe/package.json
- chain.test.ts
- On-chain score (83)
- format.ts
- Command
- collect.sh
- upgrade-contracts.sh
- Anchor Reliability Oracle Network hero
- orbit-trails.tsx
- next.config.mjs
- server-autodeploy.sh
- run-all.sh
- anchor-registry/src/errors.rs
- next-env.d.ts
- anchor-registry
- deploy-to-server.sh
- settings.py
- django-polaris==2.5.0
- bootstrap-issuers.sh
- stop-all.sh
- mainnet-probe
- passive-monitor/src/chain.ts
- dashboard
- passive-monitor/src/index.ts
- TIME_ACCELERATION (Demo Usage)
- README.md
- incidents.ts
- market.ts
- Presentation flow
- Prompt: implement the new scoring methodology
- horizon.ts
- build.py
- Yapılacaklar
- Running the full system
- demo.sh
- mock-anchors
- 6. Pillars
- testnet-probe
- fixtures/README.md
- load-fixtures.sh

## God Nodes (most connected - your core abstractions)
1. `setup()` - 36 edges
2. `runScoring()` - 23 edges
3. `register_and_stake()` - 21 edges
4. `AnchorViewModel` - 21 edges
5. `main()` - 21 edges
6. `liveDeps()` - 20 edges
7. `Scoring methodology (v1)` - 20 edges
8. `mainnet_anchor()` - 19 edges
9. `setup()` - 18 edges
10. `formatRelativeTime()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Source types RealMainnet/RealTestnet/SimulatedMock` --references--> `aggregator`  [INFERRED]
  README.md → services/aggregator/README.md
- `Presentation flow` --references--> `dashboard`  [EXTRACTED]
  docs/DEMO.md → dashboard/README.md
- `history-archiver` --shares_data_with--> `dashboard`  [EXTRACTED]
  README.md → dashboard/README.md
- `aggregator` --calls--> `PerformanceOracle contract`  [EXTRACTED]
  services/aggregator/README.md → contracts/performance-oracle/README.md
- `aggregator` --shares_data_with--> `Published inputs bundle (SHA-256)`  [EXTRACTED]
  services/aggregator/README.md → docs/SCORING.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Oracle pipeline** — assets_readme_architecture_passive_monitor, assets_readme_architecture_testnet_probe, assets_readme_architecture_mock_anchors, assets_readme_architecture_aggregator, assets_readme_architecture_performanceoracle, assets_readme_architecture_anchorregistry [EXTRACTED 1.00]
- **Score card computation and publication** — services_aggregator_readme_aggregator, services_mainnet_probe_readme_mainnetprobe, services_passive_monitor_readme_passivemonitor, contracts_performance_oracle_readme_performanceoracle, docs_scoring_inputs_bundle [EXTRACTED 1.00]
- **Collector-to-oracle pipeline** — services_mainnet_probe_readme_mainnetprobe, services_testnet_probe_readme_testnetprobe, services_mock_anchors_readme_mockanchors, services_passive_monitor_readme_passivemonitor, services_aggregator_readme_aggregator, contracts_performance_oracle_readme_performanceoracle [EXTRACTED 1.00]
- **Three sources feeding one on-chain score** — assets_readme_hero_real_mainnet, assets_readme_hero_real_testnet, assets_readme_hero_mock_anchors, assets_readme_hero_on_chain_score [EXTRACTED 1.00]
- **Slashing Demo Scenario** — docs_demo_slashing_demo [INFERRED 0.80]

## Communities (120 total, 19 thin omitted)

### Community 0 - "passive-monitor/src/types.ts"
Cohesion: 0.21
Nodes (12): aggregatePayments(), statsFor(), fetchAnchorInfo(), fetchSep24Info(), fetchStellarToml(), StellarToml, AnchorInfo, AnchorsFile (+4 more)

### Community 1 - "soroban.ts"
Cohesion: 0.05
Nodes (60): Page(), revalidate, fetchAnchorStatus(), AnchorInfo, anchorInfoKey(), cardKey(), contractDataKey(), contractDataVal() (+52 more)

### Community 2 - "Env"
Cohesion: 0.12
Nodes (32): bump_instance(), bump_persistent(), floor_score(), PerformanceOracle, record_report(), Address, AnchorHealth, BytesN (+24 more)

### Community 3 - "events.ts"
Cohesion: 0.08
Nodes (40): loadArchive(), mergeAnchor(), mergeSorted(), riskEventKey(), saveArchive(), scorePointKey(), slashEventKey(), config (+32 more)

### Community 4 - "test_behavior.py"
Cohesion: 0.08
Nodes (38): Any, Asset, Path, Random, BehaviorProfile, effective_success_rate(), get_or_create_anchor_started_at(), Observation (+30 more)

### Community 5 - "performance-oracle/src/test.rs"
Cohesion: 0.12
Nodes (49): a_card_for_an_unregistered_anchor_is_rejected(), a_card_from_an_unauthorized_reporter_is_rejected(), a_card_must_come_from_a_reporter_for_the_anchors_own_source_type(), a_card_whose_window_ends_in_the_future_is_rejected(), a_published_card_has_its_ttl_extended(), a_replayed_or_older_card_is_rejected(), a_report_does_not_put_a_withheld_cards_score_into_the_registry(), a_short_recovery_does_not_clear_a_mostly_failing_window() (+41 more)

### Community 6 - "engine.ts"
Cohesion: 0.13
Nodes (26): AVAILABILITY_RECENT_SHARE, CONFIDENCE_FULL_DAYS, CONFIDENCE_FULL_SAMPLES, CONFIDENCE_INSUFFICIENT, CONFIDENCE_LOW, CONFIDENCE_MEDIUM, COVERAGE_UNKNOWN, DEPEG_HOURS (+18 more)

### Community 7 - "app/page.tsx"
Cohesion: 0.09
Nodes (36): ApplicationDetail(), EMPTY, EVIDENCE, HomeSnapshot, LandingPage(), loadSnapshot(), revalidate, STEPS (+28 more)

### Community 8 - "scoring.rs"
Cohesion: 0.13
Nodes (26): a_steady_anchor_below_100_does_not_read_as_degrading_from_the_start(), consecutive_failures_reset_on_success(), decay(), ema_converges_toward_observation(), ema_update(), ema_weights_real_sources_more_than_mock(), ema_with_weight(), feed() (+18 more)

### Community 9 - "lib/types.ts"
Cohesion: 0.10
Nodes (35): AnchorCard(), AnchorDetailModal(), dateTime(), Outcome, outcomeFor(), PillarRadar(), BAND_TONE, ConfidenceChip() (+27 more)

### Community 10 - "mainnet-probe/src/candidates.ts"
Cohesion: 0.10
Nodes (29): appendSubmission(), CandidateStatus, CheckName, CheckResult, decideSubmission(), Decision, __dirname, HOSTNAME (+21 more)

### Community 11 - "scoring/run.ts"
Cohesion: 0.17
Nodes (23): scoreCardsStatePath(), publishScoreCard(), ScoreCardsUnsupported, flagNames(), AssetInfo, floorToHour(), AnchorFlowHistory, contextFor() (+15 more)

### Community 12 - "aggregator"
Cohesion: 0.23
Nodes (12): Confidence (separate from score), Hard gates (OUTAGE, DEPEG, etc.), Published inputs bundle (SHA-256), Four pillars: availability, speed, integrity, market, Score card methodology, Source types RealMainnet/RealTestnet/SimulatedMock, aggregator, mainnet-probe service (+4 more)

### Community 13 - "src/run.ts"
Cohesion: 0.17
Nodes (18): assignAliases(), operatorKey(), isDormant(), MainnetAnchor, listDomainAssets(), loadIssuerCache(), saveIssuerCache(), StageName (+10 more)

### Community 14 - "inputs.ts"
Cohesion: 0.16
Nodes (21): METHODOLOGY_VERSION, AnchorContext, buildInputs(), coverageOf(), fixed(), flowAggregates(), FlowHistory, integrityChecks() (+13 more)

### Community 15 - "mainnet-probe/src/anchors.ts"
Cohesion: 0.20
Nodes (16): anchorIdFor(), AnchorsFile, Candidate, cleanDirectoryName(), dedupeByTransferHost(), Listing, listingFrom(), mergeAnchors() (+8 more)

### Community 16 - "methodology/page.tsx"
Cohesion: 0.14
Nodes (20): metadata, MethodologyPage(), PILLAR_COPY, STAGES, PILLAR_LABEL, PRESETS, ScoreCalculator(), CONFIDENCE_BANDS (+12 more)

### Community 17 - "flow.ts"
Cohesion: 0.13
Nodes (23): floor7(), FlowDeps, msg(), runMoneyFlow(), step(), short(), StepFailure, TERMINAL (+15 more)

### Community 18 - "mainnet-probe/src/toml.ts"
Cohesion: 0.15
Nodes (18): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence(), Timed, fetchAnchorToml(), parseAnchorToml(), parseCurrencies() (+10 more)

### Community 19 - "testnet-probe/src/probe.ts"
Cohesion: 0.14
Nodes (23): createAndFundAccount(), balanceOf(), memoFor(), sendPayment(), liveDeps(), authenticateSep10(), getTransactionStatus(), initiateInteractiveDeposit() (+15 more)

### Community 20 - "aggregator/src/index.ts"
Cohesion: 0.22
Nodes (19): main(), dedupKey(), normalizeMainnetProbeResult(), normalizeMockAnchorLogEntry(), normalizePassiveMonitorProfile(), normalizeTestnetProbeResult(), readAliases(), readJsonArray() (+11 more)

### Community 21 - "mainnet-probe/src/probe.ts"
Cohesion: 0.11
Nodes (25): fetchAllPages(), Fetch, HttpError, timedFetch(), firstDepositAsset(), infoListsEnabledAsset(), isPolicyRejection(), message() (+17 more)

### Community 22 - "setup"
Cohesion: 0.19
Nodes (19): Client, get_anchor_info_not_found_fails(), list_anchors_returns_registered_ids_in_order(), mint(), register_anchor_duplicate_fails(), register_anchor_extends_the_record_ttl(), register_anchor_success(), Address (+11 more)

### Community 23 - "mainnet-probe/src/onboarding.ts"
Cohesion: 0.19
Nodes (18): IssuerRecord, cleanName(), evaluateCandidate(), Evaluation, MAINNET_PASSPHRASE, OnboardingDeps, plainError(), daysAgo() (+10 more)

### Community 24 - "testnet/page.tsx"
Cohesion: 0.08
Nodes (36): ApplicationDetail(), ApplyPage(), metadata, ApplyTestnetPage(), CheckRow(), metadata, STEPS, metadata (+28 more)

### Community 25 - "compilerOptions"
Cohesion: 0.07
Nodes (27): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+19 more)

### Community 26 - "testnet-probe/src/onboarding.ts"
Cohesion: 0.22
Nodes (13): TestnetAnchor, testnetAnchorId(), TestnetAnchorsFile, FlowResult, FlowTarget, checksFromFlow(), cleanName(), CONTROL (+5 more)

### Community 27 - "testnet-probe/src/register.ts"
Cohesion: 0.20
Nodes (13): loadTestnetAnchors(), registeredAnchorIds(), registerTestnetAnchor(), registry(), config, __dirname, repoRoot, appendResult() (+5 more)

### Community 28 - "mainnet-probe/src/onboard.ts"
Cohesion: 0.12
Nodes (21): loadAnchorsFile(), ingestSubmissions(), saveOnboardingFile(), config, __dirname, repoRoot, resolve(), ourNetworkIsDown() (+13 more)

### Community 29 - "MockDepositIntegration"
Cohesion: 0.20
Nodes (9): AppConfig, DepositIntegration, MockAnchorConfig, MockDepositIntegration, MockWithdrawalIntegration, Transaction, Polaris integration hooks for a mock anchor. Deliberately minimal: we collect…, TransactionForm (+1 more)

### Community 30 - "scripts"
Cohesion: 0.06
Nodes (31): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node (+23 more)

### Community 31 - "issuers.ts"
Cohesion: 0.24
Nodes (10): AssetStatus, DomainListing, fresh(), ISSUER_CACHE_MS, IssuerCache, issuerMatches(), normalizeDomain(), now (+2 more)

### Community 32 - "passive-monitor/package.json"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node (+18 more)

### Community 33 - "testnet-probe/src/onboard.ts"
Cohesion: 0.17
Nodes (17): saveTestnetAnchors(), CandidateStatus, CheckName, CheckResult, HOSTNAME, ingestSubmissions(), loadOnboardingFile(), normalizeDomainInput() (+9 more)

### Community 34 - "Env"
Cohesion: 0.20
Nodes (15): AnchorInfo, AnchorRegistryInterface, AnchorRegistry, bump_instance(), bump_persistent(), Address, BytesN, DataKey (+7 more)

### Community 35 - "Dashboard.tsx"
Cohesion: 0.20
Nodes (11): Dashboard(), SOURCE_ORDER, FilterBar(), FILTERS, FilterValue, fold(), matchesQuery(), a (+3 more)

### Community 36 - "ScoreValue.tsx"
Cohesion: 0.19
Nodes (12): LABEL, ScoreJourney(), tone(), reducedMotion(), scoreColorClass(), ScoreValue(), TIER_STROKE_VAR, TIER_TEXT_CLASS (+4 more)

### Community 37 - "aggregator/package.json"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+18 more)

### Community 38 - "history-archiver/package.json"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+18 more)

### Community 39 - "engine.test.ts"
Cohesion: 0.18
Nodes (18): activeFlags(), assetMarketScore(), availabilityScore(), computeCard(), confidenceScore(), flagsMask(), headline(), integrityScore() (+10 more)

### Community 40 - "scoring/types.ts"
Cohesion: 0.17
Nodes (14): IntegrityCheck, MAX_CARDS_PER_RUN, REPUBLISH_AFTER_MS, Candidate, CardSummary, PublishedCards, sameCard(), selectToPublish() (+6 more)

### Community 41 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 43 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 44 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 45 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 46 - "onboarding-proxy.ts"
Cohesion: 0.19
Nodes (9): dynamic, POST(), base, dynamic, POST(), handleApplication(), json(), ProxyOptions (+1 more)

### Community 47 - "contract.ts"
Cohesion: 0.24
Nodes (8): config, __dirname, repoRoot, clientCache, getReporterClient(), submitReport(), toContractArgs(), SourceType

### Community 48 - "status-labels.ts"
Cohesion: 0.13
Nodes (21): average(), StatsBar(), describeProblem(), FETCH_TIMEOUT_MS, issuedAssets(), LastProbe, lastProbeView(), mergeStatusInto() (+13 more)

### Community 49 - "dashboard/package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 50 - "Scoring methodology (v1)"
Cohesion: 0.10
Nodes (20): 10. Worked examples (golden tests), 11. Signals deliberately not scored, 12. On-chain design (PerformanceOracle), 13. Off-chain design, 14. Verifiability, 15. Dashboard, 16. Gaming and failure modes, 17. Tunable constants (+12 more)

### Community 51 - "testnet-probe/src/types.ts"
Cohesion: 0.18
Nodes (7): ChallengeResponse, TokenResponse, fetchAnchorToml(), parseAnchorToml(), FlowStep, ProbeResult, ProbeStatus

### Community 52 - "verify-score.ts"
Cohesion: 0.32
Nodes (10): canonicalJson(), SCORE_INPUTS_SCHEMA, sha256Hex(), writeDocument(), dayDigest(), checkDays(), loadBundle(), main() (+2 more)

### Community 53 - "sync-graph.mjs"
Cohesion: 0.25
Nodes (6): chrome, cut, html, nodes, out, src

### Community 54 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, framer-motion, next, next-themes, @phosphor-icons/react, react-dom, recharts, smol-toml (+9 more)

### Community 55 - "devDependencies"
Cohesion: 0.12
Nodes (17): autoprefixer, devDependencies, autoprefixer, dotenv-cli, postcss, @types/node, @types/react, @types/react-dom (+9 more)

### Community 56 - "testnet-probe/src/public-host.ts"
Cohesion: 0.47
Nodes (4): isPrivateAddress(), Resolver, resolvesToPublicAddress(), v4Private()

### Community 57 - "horizon-verify.ts"
Cohesion: 0.33
Nodes (6): checkOperations(), Operation, same(), USDC, Transfer, verifyPayment()

### Community 58 - "layout.tsx"
Cohesion: 0.33
Nodes (4): metadata, mono, sans, ThemeProvider()

### Community 59 - "anchor-registry/src/types.rs"
Cohesion: 0.29
Nodes (7): AnchorInfo, DataKey, Address, String, Symbol, SourceType, WithdrawalRequest

### Community 62 - "aggregator"
Cohesion: 0.33
Nodes (7): aggregator, AnchorRegistry contract, dashboard, mock-anchors collector, passive-monitor collector, PerformanceOracle contract, testnet-probe collector

### Community 63 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, start, sync-graph, test, typecheck

### Community 66 - "testnet-probe/src/evidence.ts"
Cohesion: 0.38
Nodes (6): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence(), isProbeEnvironmentError(), toProbeResult()

### Community 67 - "ScorePoint"
Cohesion: 0.53
Nodes (3): hasRecentSignificantDrop(), scoreAt(), ScorePoint

### Community 68 - "completeInteractiveFlow"
Cohesion: 0.83
Nodes (3): completeInteractiveFlow(), preinstalledChromiumPath(), tryFillAndSubmit()

### Community 69 - "testnet-probe/package.json"
Cohesion: 0.06
Nodes (35): node-schedule, dependencies, dotenv, node-schedule, playwright, smol-toml, @stellar/stellar-sdk, description (+27 more)

### Community 70 - "chain.test.ts"
Cohesion: 0.20
Nodes (14): ARST, AssetFlows, assetKey(), bucketize(), classify(), DayBucket, emptyBucket(), FLOW_DAYS (+6 more)

### Community 71 - "On-chain score (83)"
Cohesion: 0.40
Nodes (5): Mock anchors source, On-chain score (83), Real mainnet source, Real testnet source, Risk flag

### Community 73 - "format.ts"
Cohesion: 0.22
Nodes (8): ICONS, SourceBadge(), STYLES, DATE_FORMATTER, SOURCE_LABELS, sourceLabel(), TIME_FORMATTER, XLM_FORMATTER

### Community 74 - "Command"
Cohesion: 0.40
Nodes (3): Command, BaseCommand, Creates/updates this instance's Polaris Asset row from environment variables…

### Community 76 - "collect.sh"
Cohesion: 0.67
Nodes (3): AGGREGATOR_SKIP_MOCK, log(), collect.sh script

### Community 77 - "upgrade-contracts.sh"
Cohesion: 0.67
Nodes (3): upgrade-contracts.sh script, STELLAR_ACCOUNT, upgrade()

### Community 78 - "Anchor Reliability Oracle Network hero"
Cohesion: 0.67
Nodes (3): Anchor Reliability Oracle Network hero, Stellar SEP-24 anchor, Tech stack: Soroban/Rust, Next.js, Node.js, Django

### Community 92 - "mainnet-probe"
Cohesion: 0.29
Nodes (6): Applications — `npm run onboard` and `npm run intake`, Discovery — `npm run discover`, Evidence — `npm run verify -- <sha256>`, mainnet-probe, Probe — `npm run probe`, Registration — `npm run register`

### Community 93 - "passive-monitor/src/chain.ts"
Cohesion: 0.21
Nodes (13): issuedAssets(), IssuedFiat, runChainSignals(), StatusFile, IssuedAsset, loadFlows(), saveFlows(), CURRENCY_API (+5 more)

### Community 94 - "dashboard"
Cohesion: 0.16
Nodes (14): AnchorRegistry contract, EMA, trend and risk floor, PerformanceOracle contract, Applications, dashboard, Data layer, Score cards, Setup and running (+6 more)

### Community 95 - "passive-monitor/src/index.ts"
Cohesion: 0.21
Nodes (11): config, __dirname, loadAnchorsFile(), repoRoot, sleep(), buildProfile(), buildProfiles(), main() (+3 more)

### Community 98 - "README.md"
Cohesion: 0.08
Nodes (19): anchor-registry, performance-oracle, Known limitations we are addressing, Milestones, Roadmap & SCF plan, Team capacity, Where we are (hackathon, September 2026), Deployed testnet contracts (+11 more)

### Community 105 - "incidents.ts"
Cohesion: 0.24
Nodes (11): applyIncidents(), COLLECTOR_INCIDENTS, CollectorIncident, IncidentExclusion, isConnectionFailure(), INCIDENT, probe(), proof() (+3 more)

### Community 106 - "market.ts"
Cohesion: 0.19
Nodes (12): AmmQuote, assetParams(), DEPTH_BAND, fetchQuotes(), Level, MarketSample, MAX_SPREAD, MIN_DEPTH_USD (+4 more)

### Community 107 - "Presentation flow"
Cohesion: 0.18
Nodes (10): 1) Introduce the three layers, 2) Open the dashboard, 3) Show the filters, 4) Click an anchor to open its detail view, 5) Show risk detection live (the actual "wow" moment), 6) Closing, End-to-End Demo — Presentation Walkthrough, Prerequisites (+2 more)

### Community 108 - "Prompt: implement the new scoring methodology"
Cohesion: 0.18
Nodes (10): Context you must know, Ground rules, Part A: remove the TRY focus, Part B: implementation, Phase 1: contract, engine and publisher on existing data, Phase 2: integrity checklist, Phase 3: chain signals (Market and flows), Phase 4: docs and handoff (+2 more)

### Community 110 - "horizon.ts"
Cohesion: 0.24
Nodes (6): fetchRecentPayments(), isHistoryMissing(), PAYMENT_TYPES, RecentPayments, CUTOFF, FakePage

### Community 111 - "build.py"
Cohesion: 0.31
Nodes (9): build(), card_at(), curve(), demo(), outcome(), rate(), Builds the frozen mock-anchor data: fixtures/mock_anchor_N-behavior.json. No…, The card as it would read at the end of `day` (0-based). (+1 more)

### Community 112 - "Yapılacaklar"
Cohesion: 0.22
Nodes (8): 1. Plandan kalanlar (adım 7), 2. Mainnet öncesi yapılması gerekenler, 3. Ölçümü güçlendirecek işler, 4. Güven modeli, 5. Dokümantasyon ve açıklık, 6. Küçük tutarsızlıklar, Yapılacaklar, Önerilen sıra

### Community 113 - "Running the full system"
Cohesion: 0.22
Nodes (9): 1. Prerequisites, 2. Configure the environment, 3. Deploy the contracts, 4. Run the collectors, 5. Run the dashboard, 6. Everything at once, 7. Continuous collection (the deployed setup), `mock-anchors` behavior profiles (+1 more)

### Community 118 - "demo.sh"
Cohesion: 0.33
Nodes (4): End-to-End Demo Walkthrough, Live Slashing Demo Moment, demo.sh script, setup-env.sh script

### Community 120 - "mock-anchors"
Cohesion: 0.33
Nodes (5): Demo traffic (`seed_demo_transactions`), How it works (no real Stellar submission), mock-anchors, Notes, Setup

### Community 121 - "6. Pillars"
Cohesion: 0.40
Nodes (5): 6.1 Availability (weight 450 permille), 6.2 Speed (weight 200 permille), 6.3 Integrity (weight 200 permille), 6.4 Market (weight 150 permille, often n/a), 6. Pillars

### Community 122 - "testnet-probe"
Cohesion: 0.40
Nodes (4): Applications (`npm run onboard`, `npm run register`), Run it, testnet-probe, The money-flow check (`src/flow.ts`)

## Knowledge Gaps
- **513 isolated node(s):** `anchor-registry`, `AnchorRegistryInterface`, `Error`, `WithdrawalRequest`, `performance-oracle` (+508 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 669 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `normalizeDomainInput()` connect `testnet/page.tsx` to `lib/types.ts`, `onboarding-proxy.ts`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `AnchorViewModel` connect `status-labels.ts` to `soroban.ts`, `Dashboard.tsx`, `app/page.tsx`, `lib/types.ts`, `testnet/page.tsx`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `anchor-registry`, `AnchorRegistryInterface`, `Error` to the rest of the system?**
  _513 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `soroban.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050543637966500146 - nodes in this community are weakly interconnected._
- **Should `Env` be split into smaller, more focused modules?**
  _Cohesion score 0.12323232323232323 - nodes in this community are weakly interconnected._
- **Should `events.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07704918032786885 - nodes in this community are weakly interconnected._
- **Should `test_behavior.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07993966817496229 - nodes in this community are weakly interconnected._