# Frozen mock data

Four anchors, 30 days each (21 Aug – 19 Sep 2026), 6 transactions a day, every
value fixed: same data on every run, in every environment. `build.py` makes the
files without randomness or a clock; the committed JSON is the source of truth.

| Anchor | Success | Settlement | Scenarios it covers |
|---|---|---|---|
| mock_anchor_1 | 100% | ~8 s | Steady and fast. Day 12 (1 Sep): latency spike to ~60 s, no failures. |
| mock_anchor_2 | 86% | ~45 s | Slow, ~10% occasional failures. Day 15 (5 Sep): full-day outage (0/6), then back to normal. |
| mock_anchor_3 | 74% | ~15 s | Reliable (~92%) until day 19, collapses to 40% from day 20 (10 Sep): the degradation/slashing case. |
| mock_anchor_4 | 47% | ~120 s | Chronic failure (35%, slow) from the start; a partial recovery in the last 6 days (~90%, ~40 s). |

```bash
bash scripts/load-fixtures.sh   # copies fixtures/ to logs/ (what the aggregator reads)
```

Do not run `run-all.sh` alongside it: the live simulator appends random
outcomes to the same log files. The timestamps do not move, so the data ages:
past 30 days from 19 Sep, a rolling-window score will start to drop it.
