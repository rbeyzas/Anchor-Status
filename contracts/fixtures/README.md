# Live contract fixtures

The exact code the testnet deployment runs, fetched from the ledger so the
upgrade test (`contractimport!`) starts from what is really on-chain, not
from a rebuild of the source.

| File | Contract | Contract ID | wasm SHA-256 |
| --- | --- | --- | --- |
| `anchor_registry_live.wasm` | AnchorRegistry | `CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB` | `9b8a9ab896178a6ce3f23810490463de87d286cd9a81c55e8c4a131192b07868` |
| `performance_oracle_live.wasm` | PerformanceOracle | `CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU` | `0929e46823482cca5971e1896bf0453e544ed4170aaf6387e9b760a40247bde2` |

Fetched 2026-10-18. Each SHA-256 equals the wasm hash in the contract's
on-chain instance. The registry still keeps the single `AnchorIds` list
(`list_anchors`, no `anchor_count`), which is the layout the upgrade test
migrates from.

Re-fetch, and check against the chain, with:

```bash
stellar contract fetch --id <contract id> --network testnet -o contracts/fixtures/<file>.wasm
shasum -a 256 contracts/fixtures/<file>.wasm
stellar ledger entry fetch contract-data --contract <contract id> --instance --network testnet
```

Replace these files only after an upgrade has actually gone live; they are
the "before" side of the next upgrade test.
