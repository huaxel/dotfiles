#!/usr/bin/env python3
"""Validate encrypted JIT allowlists locally when an operator age key is available."""

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOSTS = ("acerpepe", "framearch", "liedelpi", "lenovo-lola")
REPOSITORY = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")


def main() -> None:
    for host in HOSTS:
        path = ROOT / "secrets" / f"ci-jit-repos.{host}.enc"
        result = subprocess.run(
            ["sops", "--decrypt", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode:
            raise SystemExit(f"{host}: encrypted allowlist could not be decrypted")
        payload = json.loads(result.stdout)
        repos = payload.get("repos")
        if not isinstance(repos, list) or not repos:
            raise SystemExit(f"{host}: allowlist must be a nonempty repository list")
        if any(not isinstance(repo, str) or not REPOSITORY.fullmatch(repo) for repo in repos):
            raise SystemExit(f"{host}: allowlist contains an invalid repository reference")
        if len(repos) != len(set(repos)):
            raise SystemExit(f"{host}: allowlist contains duplicate repositories")
        if "huaxel/dotfiles" in repos:
            raise SystemExit(f"{host}: public dotfiles must never use self-hosted JIT workers")
    print("Encrypted CI JIT allowlists decrypt and have valid private-only structure")


if __name__ == "__main__":
    main()
