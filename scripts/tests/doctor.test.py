#!/usr/bin/env python3
"""Static checks for the read-only machine health check (just doctor)."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


doctor = read("scripts/doctor.sh")
require("set -uo pipefail" in doctor or "set -euo pipefail" in doctor,
        "doctor does not fail safely")
require("rm -rf" not in doctor, "doctor deletes files")
require("nix build" not in doctor, "doctor builds derivations")
for line in doctor.splitlines():
    stripped = line.strip()
    require(not re.match(r"(nix\s+run\b|nix\s+\S*switch|home-manager\s+switch)", stripped),
            f"doctor activates profiles: {stripped[:80]}")
require("git push" not in doctor and "git commit" not in doctor,
        "doctor writes to git")

# Every section reports in the shared vocabulary the summary counts on.
for marker in ("✅", "⚠️", "❌", "failures=$((failures + 1))"):
    require(marker in doctor, f"doctor is missing the {marker!r} convention")

# Known aggregations stay wired: fast dedicated checks, not reimplementations.
for callee in ("scripts/nu-health.sh", "bin/pi-healthcheck"):
    require(callee in doctor, f"doctor does not delegate to {callee}")

# Machine state stays out of the repository gate.
justfile = read("justfile")
require("\nci:" in justfile and "check-env-parity check-nix" in justfile,
        "unexpected ci line shape")
ci_line = next(line for line in justfile.splitlines() if line.startswith("ci:"))
require("doctor" not in ci_line.split(), "machine-state doctor leaked into just ci")
require("\ndotor:" not in justfile, "typo'd recipe name")

print("doctor static checks passed")
