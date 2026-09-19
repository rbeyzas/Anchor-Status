# Graph Report - Anchor-Status-Beyza  (2026-09-20)

## Corpus Check
- 254 files · ~165,241 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1673 nodes · 3555 edges · 105 communities (79 shown, 26 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- passive-monitor/src/ch / chain.test.ts
- soroban.ts / contract-state.ts
- Error / performance-oracle/src
- events.ts / history-archiver/src/i
- test_behavior.py / simulate_observation()
- performance-oracle/src / setup()
- engine.ts / constants.ts
- app/page.tsx / home.ts
- scoring.rs / feed()
- lib/types.ts / AnchorDetailModal.tsx
- mainnet-probe/src/cand / intake.ts
- scoring/run.ts / load.ts
- aggregator service / PerformanceOracle cont
- src/run.ts / main()
- inputs.ts / inputs.test.ts
- mainnet-probe/src/anch / discover.ts
- methodology/page.tsx / methodology.ts
- flow.ts / sep6.ts
- mainnet-probe/src/toml / mainnet-probe/src/veri
- testnet-probe/src/prob / liveDeps()
- aggregator/src/index.t / sources.ts
- mainnet-probe/src/prob / probeAnchor()
- setup() / anchor-registry/src/te
- mainnet-probe/src/onbo / mainnet-probe/src/onbo
- testnet/page.tsx / onboarding-server.ts
- compilerOptions / dashboard/tsconfig.jso
- testnet-probe/src/onbo / testnet-probe/src/onbo
- testnet-probe/src/regi / schedule.ts
- mainnet-probe/src/onbo / main()
- MockDepositIntegration / MockWithdrawalIntegrat
- mainnet-probe/package. / devDependencies
- issuers.ts / http.ts
- passive-monitor/packag / @types/node
- testnet-probe/src/onbo / testnet-probe/src/cand
- status-labels.ts / AnchorDetailModal()
- Dashboard.tsx / AnchorViewModel
- ScoreValue.tsx / ScoreTier
- aggregator/package.jso / @stellar/stellar-sdk
- history-archiver/packa / typescript
- performance-oracle/src / ReportSubmittedEvent
- testnet-probe/package. / dependencies
- compilerOptions / aggregator/tsconfig.js
- compilerOptions / history-archiver/tscon
- compilerOptions / mainnet-probe/tsconfig
- compilerOptions / passive-monitor/tsconf
- compilerOptions / testnet-probe/tsconfig
- onboarding-proxy.ts / handleApplication()
- apply/page.tsx / lib/onboarding.ts
- anchor-status.ts / anchor-status.test.ts
- dashboard/package.json / tailwind.config.ts
- contract.ts / aggregator/src/config.
- testnet-probe/src/type / testnet-probe/src/prob
- verify-score.ts / main()
- ApplyForm.tsx / StatusChip.tsx
- dependencies / framer-motion
- devDependencies / autoprefixer
- scripts / build
- horizon-verify.ts / checkOperations()
- layout.tsx / next
- anchor-registry/src/ty / AnchorInfo
- SiteNav.tsx / @phosphor-icons/react
- scripts / build
- aggregator / PerformanceOracle cont
- scripts / build
- scripts / aggregate
- scripts / archive
- testnet-probe/src/evid / writeEvidence()
- ScorePoint / analysis.ts
- interactive.ts / completeInteractiveFlo
- devDependencies / tsx
- testnet-probe/src/publ / resolvesToPublicAddres
- On-chain score (83) / Mock anchors source
- react / StatStrip.tsx
- SourceBadge.tsx / SourceBadge()
- Command / seed_asset.py
- devDependencies / tsx
- collect.sh / log()
- upgrade-contracts.sh / upgrade-contracts.sh s
- Anchor Reliability Ora / Stellar SEP-24 anchor
- orbit-trails.tsx / ORBITS
- next.config.mjs / nextConfig
- server-autodeploy.sh / log()
- manage.py / main()
- run-all.sh / run-all.sh script
- anchor-registry/src/er / Error
- next-env.d.ts / NOTE: This file should
- anchor-registry / performance-oracle
- deploy-to-server.sh / deploy-to-server.sh sc
- settings.py / Django settings for a 
- django-polaris==2.5.0 / stellar-sdk<11.0.0,>=1
- bootstrap-issuers.sh / bootstrap-issuers.sh s
- stop-all.sh / stop-all.sh script
- Error
- String
- Error
- Error
- TIME_ACCELERATION (Dem
- Option

## God Nodes (most connected - your core abstractions)
1. `setup()` - 36 edges
2. `runScoring()` - 22 edges
3. `register_and_stake()` - 21 edges
4. `main()` - 21 edges
5. `liveDeps()` - 20 edges
6. `mainnet_anchor()` - 19 edges
7. `setup()` - 18 edges
8. `AnchorViewModel` - 18 edges
9. `compilerOptions` - 17 edges
10. `formatRelativeTime()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Source types RealMainnet/RealTestnet/SimulatedMock` --references--> `aggregator service`  [INFERRED]
  README.md → services/aggregator/README.md
- `Anchor Reliability Oracle Network` --references--> `PerformanceOracle contract`  [EXTRACTED]
  README.md → contracts/performance-oracle/README.md
- `aggregator service` --shares_data_with--> `Published inputs bundle (SHA-256)`  [EXTRACTED]
  services/aggregator/README.md → docs/SCORING.md
- `Presentation Flow` --references--> `dashboard (Next.js)`  [EXTRACTED]
  docs/DEMO.md → dashboard/README.md
- `ApplicationDetail()` --calls--> `formatRelativeTime()`  [EXTRACTED]
  dashboard/app/apply/page.tsx → dashboard/lib/format.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Oracle pipeline** — assets_readme_architecture_passive_monitor, assets_readme_architecture_testnet_probe, assets_readme_architecture_mock_anchors, assets_readme_architecture_aggregator, assets_readme_architecture_performanceoracle, assets_readme_architecture_anchorregistry [EXTRACTED 1.00]
- **Score card computation and publication** — services_aggregator_readme_aggregator, services_mainnet_probe_readme_mainnetprobe, services_passive_monitor_readme_passivemonitor, contracts_performance_oracle_readme_performanceoracle, docs_scoring_inputs_bundle [EXTRACTED 1.00]
- **Collector-to-oracle pipeline** — services_mainnet_probe_readme_mainnetprobe, services_testnet_probe_readme_testnetprobe, services_mock_anchors_readme_mockanchors, services_passive_monitor_readme_passivemonitor, services_aggregator_readme_aggregator, contracts_performance_oracle_readme_performanceoracle [EXTRACTED 1.00]
- **Three sources feeding one on-chain score** — assets_readme_hero_real_mainnet, assets_readme_hero_real_testnet, assets_readme_hero_mock_anchors, assets_readme_hero_on_chain_score [EXTRACTED 1.00]
- **Slashing Demo Scenario** — docs_demo_slashing_demo [INFERRED 0.80]

## Communities (105 total, 26 thin omitted)

### Community 0 - "passive-monitor/src/ch / chain.test.ts"
Cohesion: 0.05
Nodes (65): aggregatePayments(), statsFor(), issuedAssets(), IssuedFiat, runChainSignals(), StatusFile, ARST, config (+57 more)

### Community 1 - "soroban.ts / contract-state.ts"
Cohesion: 0.06
Nodes (57): Page(), revalidate, Dashboard(), fetchAnchorStatus(), anchorInfoKey(), cardKey(), contractDataKey(), contractDataVal() (+49 more)

### Community 2 - "Error / performance-oracle/src"
Cohesion: 0.07
Nodes (49): AnchorRegistryInterface, Address, AnchorInfo, Env, Result, Symbol, AnchorRegistry, bump_instance() (+41 more)

### Community 3 - "events.ts / history-archiver/src/i"
Cohesion: 0.08
Nodes (41): loadArchive(), mergeAnchor(), mergeSorted(), riskEventKey(), saveArchive(), scorePointKey(), slashEventKey(), config (+33 more)

### Community 4 - "test_behavior.py / simulate_observation()"
Cohesion: 0.08
Nodes (38): Any, Asset, Path, Random, BehaviorProfile, effective_success_rate(), get_or_create_anchor_started_at(), Observation (+30 more)

### Community 5 - "performance-oracle/src / setup()"
Cohesion: 0.12
Nodes (49): a_card_for_an_unregistered_anchor_is_rejected(), a_card_from_an_unauthorized_reporter_is_rejected(), a_card_must_come_from_a_reporter_for_the_anchors_own_source_type(), a_card_whose_window_ends_in_the_future_is_rejected(), a_published_card_has_its_ttl_extended(), a_replayed_or_older_card_is_rejected(), a_report_does_not_put_a_withheld_cards_score_into_the_registry(), a_short_recovery_does_not_clear_a_mostly_failing_window() (+41 more)

### Community 6 - "engine.ts / constants.ts"
Cohesion: 0.09
Nodes (46): card(), AVAILABILITY_RECENT_SHARE, CONFIDENCE_FULL_DAYS, CONFIDENCE_FULL_SAMPLES, CONFIDENCE_INSUFFICIENT, CONFIDENCE_LOW, CONFIDENCE_MEDIUM, COVERAGE_UNKNOWN (+38 more)

### Community 7 - "app/page.tsx / home.ts"
Cohesion: 0.10
Nodes (33): EMPTY, EVIDENCE, HomeSnapshot, LandingPage(), loadSnapshot(), revalidate, STEPS, TIER_TEXT (+25 more)

### Community 8 - "scoring.rs / feed()"
Cohesion: 0.09
Nodes (37): a_steady_anchor_below_100_does_not_read_as_degrading_from_the_start(), CONFIDENCE_INSUFFICIENT, consecutive_failures_reset_on_success(), decay(), DEFAULT_SCORE, ema_converges_toward_observation(), ema_update(), ema_weights_real_sources_more_than_mock() (+29 more)

### Community 9 - "lib/types.ts / AnchorDetailModal.tsx"
Cohesion: 0.14
Nodes (27): PillarRadar(), BAND_TONE, ConfidenceChip(), FlagChips(), PillarBars(), PillarDots(), describeHealth(), RISK_LABEL (+19 more)

### Community 10 - "mainnet-probe/src/cand / intake.ts"
Cohesion: 0.10
Nodes (30): status(), appendSubmission(), CandidateStatus, CheckName, CheckResult, decideSubmission(), Decision, __dirname (+22 more)

### Community 11 - "scoring/run.ts / load.ts"
Cohesion: 0.12
Nodes (31): scoreCardsStatePath(), MAX_CARDS_PER_RUN, REPUBLISH_AFTER_MS, flagNames(), AssetInfo, floorToHour(), AnchorFlowHistory, contextFor() (+23 more)

### Community 12 - "aggregator service / PerformanceOracle cont"
Cohesion: 0.09
Nodes (27): AnchorRegistry contract, EMA, trend and risk floor, PerformanceOracle contract, dashboard (Next.js), End-to-End Demo Walkthrough, Presentation Flow, Live Slashing Demo Moment, Confidence (separate from score) (+19 more)

### Community 13 - "src/run.ts / main()"
Cohesion: 0.15
Nodes (22): assignAliases(), operatorKey(), isDormant(), Listing, MainnetAnchor, mapWithConcurrency(), AssetStatus, listDomainAssets() (+14 more)

### Community 14 - "inputs.ts / inputs.test.ts"
Cohesion: 0.13
Nodes (26): METHODOLOGY_VERSION, AnchorContext, buildInputs(), coverageOf(), fixed(), flowAggregates(), FlowHistory, integrityChecks() (+18 more)

### Community 15 - "mainnet-probe/src/anch / discover.ts"
Cohesion: 0.14
Nodes (21): anchorIdFor(), AnchorsFile, Candidate, cleanDirectoryName(), dedupeByTransferHost(), listingFrom(), mergeAnchors(), RegisteredAnchorsFile (+13 more)

### Community 16 - "methodology/page.tsx / methodology.ts"
Cohesion: 0.14
Nodes (21): metadata, MethodologyPage(), PILLAR_COPY, STAGES, PILLAR_LABEL, PRESETS, ScoreCalculator(), CONFIDENCE_BANDS (+13 more)

### Community 17 - "flow.ts / sep6.ts"
Cohesion: 0.13
Nodes (24): floor7(), FlowDeps, msg(), runMoneyFlow(), step(), short(), StepFailure, TERMINAL (+16 more)

### Community 18 - "mainnet-probe/src/toml / mainnet-probe/src/veri"
Cohesion: 0.14
Nodes (19): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence(), Timed, probe(), fetchAnchorToml(), parseAnchorToml() (+11 more)

### Community 19 - "testnet-probe/src/prob / liveDeps()"
Cohesion: 0.15
Nodes (20): createAndFundAccount(), verifyPayment(), balanceOf(), memoFor(), sendPayment(), liveDeps(), authenticateSep10(), getTransactionStatus() (+12 more)

### Community 20 - "aggregator/src/index.t / sources.ts"
Cohesion: 0.23
Nodes (18): main(), dedupKey(), normalizeMainnetProbeResult(), normalizeMockAnchorLogEntry(), normalizePassiveMonitorProfile(), normalizeTestnetProbeResult(), readJsonArray(), readMainnetProbeReports() (+10 more)

### Community 21 - "mainnet-probe/src/prob / probeAnchor()"
Cohesion: 0.13
Nodes (20): firstDepositAsset(), infoListsEnabledAsset(), isPolicyRejection(), message(), probeAnchor(), ProbeChecks, ProbeOptions, ProbeTranscript (+12 more)

### Community 22 - "setup() / anchor-registry/src/te"
Cohesion: 0.19
Nodes (19): Client, get_anchor_info_not_found_fails(), list_anchors_returns_registered_ids_in_order(), mint(), register_anchor_duplicate_fails(), register_anchor_extends_the_record_ttl(), register_anchor_success(), Address (+11 more)

### Community 23 - "mainnet-probe/src/onbo / mainnet-probe/src/onbo"
Cohesion: 0.17
Nodes (19): cleanName(), evaluateCandidate(), Evaluation, MAINNET_PASSPHRASE, OnboardingDeps, plainError(), daysAgo(), deps() (+11 more)

### Community 24 - "testnet/page.tsx / onboarding-server.ts"
Cohesion: 0.16
Nodes (16): ApplicationDetail(), ApplyTestnetPage(), CheckRow(), metadata, STEPS, ApplicationStatus, OnboardingFile, FETCH_TIMEOUT_MS (+8 more)

### Community 25 - "compilerOptions / dashboard/tsconfig.jso"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 26 - "testnet-probe/src/onbo / testnet-probe/src/onbo"
Cohesion: 0.17
Nodes (16): TestnetAnchor, testnetAnchorId(), TestnetAnchorsFile, CheckResult, FlowResult, FlowTarget, ADMISSION_RULE, checksFromFlow() (+8 more)

### Community 27 - "testnet-probe/src/regi / schedule.ts"
Cohesion: 0.18
Nodes (14): node-schedule, loadTestnetAnchors(), registeredAnchorIds(), registerTestnetAnchor(), registry(), config, __dirname, repoRoot (+6 more)

### Community 28 - "mainnet-probe/src/onbo / main()"
Cohesion: 0.20
Nodes (14): loadAnchorsFile(), ingestSubmissions(), saveOnboardingFile(), ourNetworkIsDown(), lookupIssuer(), deps(), dryRun(), main() (+6 more)

### Community 29 - "MockDepositIntegration / MockWithdrawalIntegrat"
Cohesion: 0.20
Nodes (9): AppConfig, DepositIntegration, MockAnchorConfig, MockDepositIntegration, MockWithdrawalIntegration, Transaction, Polaris integration hooks for a mock anchor. Deliberately minimal: we collect…, TransactionForm (+1 more)

### Community 30 - "mainnet-probe/package. / devDependencies"
Cohesion: 0.11
Nodes (17): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node (+9 more)

### Community 31 - "issuers.ts / http.ts"
Cohesion: 0.20
Nodes (12): Fetch, HttpError, DomainListing, fresh(), ISSUER_CACHE_MS, IssuerCache, issuerMatches(), IssuerRecord (+4 more)

### Community 32 - "passive-monitor/packag / @types/node"
Cohesion: 0.11
Nodes (17): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, tsx, @types/node, vitest (+9 more)

### Community 33 - "testnet-probe/src/onbo / testnet-probe/src/cand"
Cohesion: 0.20
Nodes (15): saveTestnetAnchors(), CandidateStatus, CheckName, HOSTNAME, ingestSubmissions(), loadOnboardingFile(), normalizeDomainInput(), OnboardingCandidate (+7 more)

### Community 34 - "status-labels.ts / AnchorDetailModal()"
Cohesion: 0.19
Nodes (14): AnchorCard(), AnchorDetailModal(), average(), StatsBar(), formatChartAxisLabel(), formatStakeXlm(), GATE_FLAGS, compareAnchors() (+6 more)

### Community 35 - "Dashboard.tsx / AnchorViewModel"
Cohesion: 0.17
Nodes (13): SOURCE_ORDER, FilterBar(), FILTERS, FilterValue, AnchorInfo, fold(), matchesQuery(), a (+5 more)

### Community 36 - "ScoreValue.tsx / ScoreTier"
Cohesion: 0.18
Nodes (13): LABEL, ScoreJourney(), tone(), reducedMotion(), scoreColorClass(), ScoreValue(), TIER_STROKE_VAR, TIER_TEXT_CLASS (+5 more)

### Community 37 - "aggregator/package.jso / @stellar/stellar-sdk"
Cohesion: 0.12
Nodes (16): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+8 more)

### Community 38 - "history-archiver/packa / typescript"
Cohesion: 0.12
Nodes (16): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+8 more)

### Community 39 - "performance-oracle/src / ReportSubmittedEvent"
Cohesion: 0.24
Nodes (15): AnchorHealth, DataKey, ReportSubmittedEvent, RiskReason, RiskStatusChangedEvent, Address, BytesN, Option (+7 more)

### Community 40 - "testnet-probe/package. / dependencies"
Cohesion: 0.12
Nodes (15): @types/node-schedule, dotenv, dependencies, dotenv, node-schedule, playwright, smol-toml, @stellar/stellar-sdk (+7 more)

### Community 41 - "compilerOptions / aggregator/tsconfig.js"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 42 - "compilerOptions / history-archiver/tscon"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 43 - "compilerOptions / mainnet-probe/tsconfig"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 44 - "compilerOptions / passive-monitor/tsconf"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 45 - "compilerOptions / testnet-probe/tsconfig"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 46 - "onboarding-proxy.ts / handleApplication()"
Cohesion: 0.19
Nodes (9): dynamic, POST(), base, dynamic, POST(), handleApplication(), json(), ProxyOptions (+1 more)

### Community 47 - "apply/page.tsx / lib/onboarding.ts"
Cohesion: 0.19
Nodes (11): ApplicationDetail(), ApplyPage(), metadata, NetworkSwitch(), Application, ApplicationCheck, CHECK_LABEL, CheckName (+3 more)

### Community 48 - "anchor-status.ts / anchor-status.test.ts"
Cohesion: 0.22
Nodes (11): describeProblem(), FETCH_TIMEOUT_MS, issuedAssets(), LastProbe, lastProbeView(), mergeStatusInto(), policyNote(), StatusAsset (+3 more)

### Community 49 - "dashboard/package.json / tailwind.config.ts"
Cohesion: 0.14
Nodes (12): vitest, name, private, version, config, autoprefixer, dotenv-cli, postcss (+4 more)

### Community 50 - "contract.ts / aggregator/src/config."
Cohesion: 0.22
Nodes (10): config, __dirname, repoRoot, clientCache, getReporterClient(), publishScoreCard(), ScoreCardsUnsupported, submitReport() (+2 more)

### Community 51 - "testnet-probe/src/type / testnet-probe/src/prob"
Cohesion: 0.21
Nodes (7): ChallengeResponse, TokenResponse, fetchAnchorToml(), parseAnchorToml(), ProbeResult, ProbeStatus, StellarTomlInfo

### Community 52 - "verify-score.ts / main()"
Cohesion: 0.32
Nodes (10): canonicalJson(), SCORE_INPUTS_SCHEMA, sha256Hex(), writeDocument(), dayDigest(), checkDays(), loadBundle(), main() (+2 more)

### Community 53 - "ApplyForm.tsx / StatusChip.tsx"
Cohesion: 0.36
Nodes (8): ApplyForm(), submit(), dateTime(), Outcome, outcomeFor(), ChipTone, StatusChip(), normalizeDomainInput()

### Community 54 - "dependencies / framer-motion"
Cohesion: 0.20
Nodes (10): dependencies, framer-motion, next, next-themes, @phosphor-icons/react, react, react-dom, recharts (+2 more)

### Community 55 - "devDependencies / autoprefixer"
Cohesion: 0.20
Nodes (10): devDependencies, autoprefixer, dotenv-cli, postcss, tailwindcss, @types/node, @types/react, @types/react-dom (+2 more)

### Community 56 - "scripts / build"
Cohesion: 0.20
Nodes (10): scripts, build, discover, intake, onboard, probe, register, test (+2 more)

### Community 57 - "horizon-verify.ts / checkOperations()"
Cohesion: 0.27
Nodes (7): checkOperations(), Operation, PaymentCheck, same(), USDC, Transfer, VerifiedPayment

### Community 58 - "layout.tsx / next"
Cohesion: 0.25
Nodes (6): metadata, mono, sans, ThemeProvider(), next, next-themes

### Community 59 - "anchor-registry/src/ty / AnchorInfo"
Cohesion: 0.29
Nodes (7): AnchorInfo, DataKey, Address, String, Symbol, SourceType, WithdrawalRequest

### Community 60 - "SiteNav.tsx / @phosphor-icons/react"
Cohesion: 0.36
Nodes (5): Logo(), Wordmark(), SiteNav(), ThemeToggle(), @phosphor-icons/react

### Community 61 - "scripts / build"
Cohesion: 0.25
Nodes (8): scripts, build, onboard, probe, register, schedule, test, typecheck

### Community 62 - "aggregator / PerformanceOracle cont"
Cohesion: 0.33
Nodes (7): aggregator, AnchorRegistry contract, dashboard, mock-anchors collector, passive-monitor collector, PerformanceOracle contract, testnet-probe collector

### Community 63 - "scripts / build"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, start, test, typecheck

### Community 64 - "scripts / aggregate"
Cohesion: 0.29
Nodes (7): scripts, aggregate, build, score, test, typecheck, verify-score

### Community 65 - "scripts / archive"
Cohesion: 0.29
Nodes (7): scripts, archive, backfill, build, test, typecheck, verify

### Community 66 - "testnet-probe/src/evid / writeEvidence()"
Cohesion: 0.38
Nodes (6): canonicalJson(), EVIDENCE_SCHEMA, sha256Hex(), writeEvidence(), isProbeEnvironmentError(), toProbeResult()

### Community 67 - "ScorePoint / analysis.ts"
Cohesion: 0.53
Nodes (3): hasRecentSignificantDrop(), scoreAt(), ScorePoint

### Community 68 - "interactive.ts / completeInteractiveFlo"
Cohesion: 0.47
Nodes (4): playwright, completeInteractiveFlow(), preinstalledChromiumPath(), tryFillAndSubmit()

### Community 69 - "devDependencies / tsx"
Cohesion: 0.33
Nodes (6): devDependencies, tsx, @types/node, @types/node-schedule, typescript, vitest

### Community 70 - "testnet-probe/src/publ / resolvesToPublicAddres"
Cohesion: 0.47
Nodes (4): isPrivateAddress(), Resolver, resolvesToPublicAddress(), v4Private()

### Community 71 - "On-chain score (83) / Mock anchors source"
Cohesion: 0.40
Nodes (5): Mock anchors source, On-chain score (83), Real mainnet source, Real testnet source, Risk flag

### Community 72 - "react / StatStrip.tsx"
Cohesion: 0.50
Nodes (4): Stat(), StatStrip(), useCountUp(), react

### Community 73 - "SourceBadge.tsx / SourceBadge()"
Cohesion: 0.50
Nodes (4): ICONS, SourceBadge(), STYLES, sourceLabel()

### Community 74 - "Command / seed_asset.py"
Cohesion: 0.40
Nodes (3): Command, BaseCommand, Creates/updates this instance's Polaris Asset row from environment variables…

### Community 75 - "devDependencies / tsx"
Cohesion: 0.40
Nodes (5): devDependencies, tsx, @types/node, typescript, vitest

### Community 76 - "collect.sh / log()"
Cohesion: 0.67
Nodes (3): AGGREGATOR_SKIP_MOCK, log(), collect.sh script

### Community 77 - "upgrade-contracts.sh / upgrade-contracts.sh s"
Cohesion: 0.67
Nodes (3): upgrade-contracts.sh script, STELLAR_ACCOUNT, upgrade()

### Community 78 - "Anchor Reliability Ora / Stellar SEP-24 anchor"
Cohesion: 0.67
Nodes (3): Anchor Reliability Oracle Network hero, Stellar SEP-24 anchor, Tech stack: Soroban/Rust, Next.js, Node.js, Django

## Knowledge Gaps
- **447 isolated node(s):** `StellarToml`, `allowJs`, `baseUrl`, `esModuleInterop`, `incremental` (+442 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 588 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `result()` connect `src/run.ts / main()` to `passive-monitor/src/ch / chain.test.ts`, `soroban.ts / contract-state.ts`, `events.ts / history-archiver/src/i`, `aggregator/src/index.t / sources.ts`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Why does `file()` connect `events.ts / history-archiver/src/i` to `passive-monitor/src/ch / chain.test.ts`, `mainnet-probe/src/cand / intake.ts`, `inputs.ts / inputs.test.ts`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `card()` connect `engine.ts / constants.ts` to `anchor-status.ts / anchor-status.test.ts`, `lib/types.ts / AnchorDetailModal.tsx`, `inputs.ts / inputs.test.ts`, `app/page.tsx / home.ts`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **What connects `StellarToml`, `allowJs`, `baseUrl` to the rest of the system?**
  _447 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `passive-monitor/src/ch / chain.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.052393857271906055 - nodes in this community are weakly interconnected._
- **Should `soroban.ts / contract-state.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05570745044429255 - nodes in this community are weakly interconnected._
- **Should `Error / performance-oracle/src` be split into smaller, more focused modules?**
  _Cohesion score 0.06596491228070175 - nodes in this community are weakly interconnected._