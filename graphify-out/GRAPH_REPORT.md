# Graph Report - Anchor-Status  (2026-09-16)

## Corpus Check
- Corpus is ~23,340 words - fits in a single context window. You may not need a graph.

## Summary
- 689 nodes · 1077 edges · 57 communities (32 shown, 25 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.87)
- Token cost: 180,032 input · 31,769 output

## Community Hubs (Navigation)
- Dashboard UI Components
- Mock Anchor Behavior Simulation
- Contract-to-Dashboard Data Flow
- Testnet Probe SEP-10/24 Flow
- Aggregator Config & Contract Client
- Passive Monitor Payment Aggregation
- Testnet Probe Package Dependencies
- Passive Monitor Package Dependencies
- Aggregator Package Dependencies
- Anchor Registry Contract Tests
- AnchorRegistry Contract Core Logic
- Dashboard TypeScript Compiler Config
- Mock Anchor Deposit/Withdrawal Integrations
- Performance Oracle Contract Tests
- Performance Oracle Scoring Algorithm
- PerformanceOracle Contract Core Logic
- Aggregator TypeScript Compiler Config
- Passive Monitor TypeScript Compiler Config
- Testnet Probe TypeScript Compiler Config
- Dashboard Package Dependencies
- AnchorRegistry Client Interface
- Dashboard Root Layout & Theme
- Dashboard Dev Dependencies
- AnchorRegistry Contract Types
- Dashboard Runtime Dependencies
- Mock Anchor Demo Transaction Seeding
- Architecture Diagram Components
- README Hero Graphic Concepts
- PerformanceOracle Contract Types
- Dashboard NPM Scripts
- Mock Anchor Asset Seeding
- Score Math Rationale
- Dashboard Next.js Config
- Dashboard Tailwind Config
- Mock Anchors Management Entrypoint
- Mock Anchors Run-All Script
- AnchorRegistry Error Types
- PerformanceOracle Error Types
- Dashboard Next.js Type Declarations
- Deployed Contract Packages
- Mock Anchors Django Settings
- Mock Anchors Issuer Bootstrap Script
- Mock Anchors Stop-All Script

## God Nodes (most connected - your core abstractions)
1. `setup()` - 18 edges
2. `compilerOptions` - 17 edges
3. `simulate_observation()` - 15 edges
4. `compilerOptions` - 14 edges
5. `compilerOptions` - 14 edges
6. `compilerOptions` - 14 edges
7. `setup()` - 12 edges
8. `register_and_stake()` - 12 edges
9. `BehaviorProfile` - 12 edges
10. `make_profile()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Live Slashing Demo Moment` --semantically_similar_to--> `Proportional Slashing Design`  [INFERRED] [semantically similar]
  docs/DEMO.md → README.md
- `Cross-Contract Authorization` --rationale_for--> `PerformanceOracle Contract`  [EXTRACTED]
  README.md → contracts/performance-oracle/README.md
- `Mainnet Read-Only Design` --rationale_for--> `passive-monitor Service`  [EXTRACTED]
  README.md → services/passive-monitor/README.md
- `Deployed Testnet Contracts` --references--> `PerformanceOracle Contract`  [EXTRACTED]
  README.md → contracts/performance-oracle/README.md
- `getDashboardData()` --references--> `submit_report()`  [EXTRACTED]
  dashboard/README.md → contracts/performance-oracle/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three Collectors Feed Aggregator Pipeline** — services_passive_monitor_readme_passive_monitor, services_testnet_probe_readme_testnet_probe, services_mock_anchors_readme_mock_anchors, services_aggregator_readme_aggregator [INFERRED 0.85]
- **On-Chain Scoring and Display Loop** — contracts_performance_oracle_readme_performanceoracle, contracts_anchor_registry_readme_anchorregistry, dashboard_readme_dashboard [INFERRED 0.85]
- **Slashing Demo Scenario** — docs_demo_slashing_demo, services_mock_anchors_readme_behavior_profile, services_mock_anchors_readme_time_acceleration [INFERRED 0.80]

## Communities (57 total, 25 thin omitted)

### Community 0 - "Dashboard UI Components"
Cohesion: 0.06
Nodes (62): Page(), revalidate, AnchorCard(), RING_SHADOW, AnchorDetailModal(), Dashboard(), FilterBar(), FILTERS (+54 more)

### Community 1 - "Mock Anchor Behavior Simulation"
Cohesion: 0.10
Nodes (34): Any, Path, Random, BehaviorProfile, effective_success_rate(), get_or_create_anchor_started_at(), Observation, datetime (+26 more)

### Community 2 - "Contract-to-Dashboard Data Flow"
Cohesion: 0.06
Nodes (37): AnchorRegistry Contract, slash(), PerformanceOracle Contract, submit_report(), Dashboard App, Event Query Window Workaround, getDashboardData(), Demo Data Fallback (+29 more)

### Community 3 - "Testnet Probe SEP-10/24 Flow"
Cohesion: 0.09
Nodes (27): node-schedule, playwright, SEP-10 + SEP-24 Flow, config, __dirname, repoRoot, createAndFundAccount(), completeInteractiveFlow() (+19 more)

### Community 4 - "Aggregator Config & Contract Client"
Cohesion: 0.16
Nodes (23): config, __dirname, repoRoot, clientCache, getReporterClient(), submitReport(), toContractArgs(), main() (+15 more)

### Community 5 - "Passive Monitor Payment Aggregation"
Cohesion: 0.12
Nodes (24): aggregatePayments(), statsFor(), config, __dirname, loadAnchorsFile(), repoRoot, fetchRecentPayments(), PAYMENT_TYPES (+16 more)

### Community 6 - "Testnet Probe Package Dependencies"
Cohesion: 0.06
Nodes (31): @types/node-schedule, dependencies, dotenv, node-schedule, playwright, smol-toml, @stellar/stellar-sdk, description (+23 more)

### Community 7 - "Passive Monitor Package Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, dotenv, smol-toml, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node (+18 more)

### Community 8 - "Aggregator Package Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, dotenv, @stellar/stellar-sdk, description, devDependencies, tsx, @types/node, typescript (+16 more)

### Community 9 - "Anchor Registry Contract Tests"
Cohesion: 0.20
Nodes (19): Client, get_anchor_info_not_found_fails(), list_anchors_returns_registered_ids_in_order(), mint(), register_anchor_duplicate_fails(), register_anchor_success(), Address, AnchorRegistryClient (+11 more)

### Community 10 - "AnchorRegistry Contract Core Logic"
Cohesion: 0.25
Nodes (11): AnchorRegistry, Address, AnchorInfo, Env, Error, Result, SourceType, String (+3 more)

### Community 11 - "Dashboard TypeScript Compiler Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 12 - "Mock Anchor Deposit/Withdrawal Integrations"
Cohesion: 0.20
Nodes (9): AppConfig, DepositIntegration, MockAnchorConfig, MockDepositIntegration, MockWithdrawalIntegration, Transaction, Polaris integration hooks for a mock anchor. Deliberately minimal: we collect…, TransactionForm (+1 more)

### Community 13 - "Performance Oracle Contract Tests"
Cohesion: 0.25
Nodes (17): authorize_reporter_success(), direct_slash_call_without_being_the_oracle_contract_fails(), Harness, real_mainnet_report_moves_score_more_than_mock_report(), register_and_stake(), repeated_failures_drop_score_below_threshold_and_trigger_slash(), Address, AnchorRegistryClient (+9 more)

### Community 14 - "Performance Oracle Scoring Algorithm"
Cohesion: 0.16
Nodes (11): BPS_DENOMINATOR, DEFAULT_SCORE, ema_converges_toward_observation(), ema_update(), ema_weights_real_sources_more_than_mock(), observation_score(), observation_score_decays_monotonically(), SourceType (+3 more)

### Community 15 - "PerformanceOracle Contract Core Logic"
Cohesion: 0.25
Nodes (10): MAX_FUTURE_SKEW_SECONDS, MAX_REPORT_AGE_SECONDS, PerformanceOracle, Address, Env, Error, Result, SourceType (+2 more)

### Community 16 - "Aggregator TypeScript Compiler Config"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 17 - "Passive Monitor TypeScript Compiler Config"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 18 - "Testnet Probe TypeScript Compiler Config"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 19 - "Dashboard Package Dependencies"
Cohesion: 0.13
Nodes (14): @stellar/stellar-sdk, @types/node, typescript, vitest, name, private, version, autoprefixer (+6 more)

### Community 20 - "AnchorRegistry Client Interface"
Cohesion: 0.32
Nodes (8): AnchorRegistryInterface, Address, AnchorInfo, Env, Error, Result, String, Symbol

### Community 21 - "Dashboard Root Layout & Theme"
Cohesion: 0.22
Nodes (7): body, heading, metadata, mono, ThemeProvider(), next, next-themes

### Community 22 - "Dashboard Dev Dependencies"
Cohesion: 0.20
Nodes (10): devDependencies, autoprefixer, dotenv-cli, postcss, tailwindcss, @types/node, @types/react, @types/react-dom (+2 more)

### Community 23 - "AnchorRegistry Contract Types"
Cohesion: 0.31
Nodes (8): AnchorInfo, DataKey, Address, String, Symbol, SlashEvent, SourceType, WithdrawalRequest

### Community 24 - "Dashboard Runtime Dependencies"
Cohesion: 0.22
Nodes (9): dependencies, framer-motion, next, next-themes, @phosphor-icons/react, react, react-dom, recharts (+1 more)

### Community 25 - "Mock Anchor Demo Transaction Seeding"
Cohesion: 0.29
Nodes (4): Asset, Command, BaseCommand, Demo-only traffic generator. In real usage, transactions enter…

### Community 26 - "Architecture Diagram Components"
Cohesion: 0.50
Nodes (8): aggregator, AnchorRegistry (Soroban contract), dashboard, Oracle Pipeline Architecture Diagram, mock-anchors, passive-monitor, PerformanceOracle (Soroban contract), testnet-probe

### Community 27 - "README Hero Graphic Concepts"
Cohesion: 0.32
Nodes (8): Anchor Reliability Oracle Network, Automatic Slashing, Anchor Reliability Oracle Network Hero Graphic, Mock Anchors Source, On-Chain Reliability Score, Real Mainnet Source, Real Testnet Source, Soroban/Rust, Next.js, Node.js, Django Stack

### Community 28 - "PerformanceOracle Contract Types"
Cohesion: 0.43
Nodes (6): DataKey, ReportSubmittedEvent, Address, SourceType, Symbol, ScoreSlashedEvent

### Community 29 - "Dashboard NPM Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, start, test, typecheck

### Community 30 - "Mock Anchor Asset Seeding"
Cohesion: 0.40
Nodes (3): Command, BaseCommand, Creates/updates this instance's Polaris Asset row from environment variables…

### Community 31 - "Score Math Rationale"
Cohesion: 0.67
Nodes (3): Slash Threshold, Weighted EMA Scoring, Score Math (Weighted EMA) Rationale

## Knowledge Gaps
- **236 isolated node(s):** `anchor-registry`, `Error`, `WITHDRAWAL_COOLDOWN_SECONDS`, `WithdrawalRequest`, `performance-oracle` (+231 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 318 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `testnet-probe Service` connect `Contract-to-Dashboard Data Flow` to `Testnet Probe SEP-10/24 Flow`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `playwright` connect `Testnet Probe SEP-10/24 Flow` to `Testnet Probe Package Dependencies`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `anchor-registry`, `Error`, `WITHDRAWAL_COOLDOWN_SECONDS` to the rest of the system?**
  _236 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.056329113924050635 - nodes in this community are weakly interconnected._
- **Should `Mock Anchor Behavior Simulation` be split into smaller, more focused modules?**
  _Cohesion score 0.1014799154334038 - nodes in this community are weakly interconnected._
- **Should `Contract-to-Dashboard Data Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.06236786469344609 - nodes in this community are weakly interconnected._
- **Should `Testnet Probe SEP-10/24 Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.09102564102564102 - nodes in this community are weakly interconnected._