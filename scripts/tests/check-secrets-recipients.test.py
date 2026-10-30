#!/usr/bin/env python3
"""Regression tests for path-specific SOPS recipient validation."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "scripts" / "check-secrets-recipients.py"
JIT_RECIPIENTS = ["age1operator", "age1mac"]
GENERAL_RECIPIENTS = ["age1arch", "age1frame", "age1laptop"]


def write_encrypted_metadata(path: Path, recipients: list[str]) -> None:
    path.write_text(
        json.dumps({"sops": {"age": [{"recipient": key} for key in recipients]}}),
        encoding="utf-8",
    )


def main() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        secrets = root / "secrets"
        secrets.mkdir()
        config = root / ".sops.yaml"
        config.write_text(
            """creation_rules:
  - path_regex: secrets/ci-jit-repos[.].*[.]enc$
    age: >
      age1operator, age1mac # operator-only JIT keys
  - path_regex: secrets/.*$
    age: >
      age1arch, age1frame, age1laptop # general secret recipients
""",
            encoding="utf-8",
        )

        jit_file = secrets / "ci-jit-repos.host.enc"
        general_file = secrets / "other-secret.enc"
        write_encrypted_metadata(jit_file, JIT_RECIPIENTS)
        write_encrypted_metadata(general_file, GENERAL_RECIPIENTS)

        arguments = [
            str(CHECKER),
            ".sops.yaml",
            str(jit_file.relative_to(root)),
            str(general_file.relative_to(root)),
        ]
        for flags in ([], ["-S"]):
            command = [sys.executable, *flags, *arguments]
            result = subprocess.run(command, cwd=root, capture_output=True, text=True, check=False)
            assert result.returncode == 0, result.stdout + result.stderr

            write_encrypted_metadata(jit_file, GENERAL_RECIPIENTS)
            result = subprocess.run(command, cwd=root, capture_output=True, text=True, check=False)
            assert result.returncode == 1, "JIT file with broad recipient set was accepted"
            write_encrypted_metadata(jit_file, JIT_RECIPIENTS)

    print("SOPS path-specific recipient checks passed")


if __name__ == "__main__":
    main()
