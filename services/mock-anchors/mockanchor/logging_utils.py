"""Append-only JSON log of simulated transaction outcomes, in the same
normalized shape the aggregator expects from every source (see
services/aggregator/README.md): {anchor_id, success, settlement_seconds,
timestamp, source_type}."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict


def log_path(anchor_id: str, base_dir: Path) -> Path:
    return base_dir / "logs" / f"{anchor_id}-behavior.json"


def append_log_entry(anchor_id: str, base_dir: Path, entry: Dict[str, Any]) -> None:
    path = log_path(anchor_id, base_dir)
    path.parent.mkdir(parents=True, exist_ok=True)

    entries = []
    if path.exists():
        try:
            entries = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            entries = []

    entries.append(entry)

    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    os.replace(tmp_path, path)
