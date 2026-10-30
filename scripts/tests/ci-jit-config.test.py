#!/usr/bin/env python3
"""Validate tracked CI JIT worker configuration without decrypting secrets."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "infra" / "ci-dispatcher"
HOSTS = {"acerpepe", "framearch", "liedelpi", "lenovo-lola"}


def main() -> None:
    configs = sorted(CONFIG_DIR.glob("config.*.json"))
    assert {path.name.removeprefix("config.").removesuffix(".json") for path in configs} == HOSTS
    unit = (CONFIG_DIR / "ci-jit-dispatcher@.service").read_text(encoding="utf-8")
    deploy = (ROOT / "infra" / "ansible" / "deploy-ci-jit.yml").read_text(encoding="utf-8")
    dispatcher = (CONFIG_DIR / "jit-dispatcher.sh").read_text(encoding="utf-8")
    assert (
        'RUNNER_PATH="/usr/local/bin:/usr/bin:/bin:/opt/ci-jit-profile/bin"' in dispatcher
    )
    assert "ci-jit-dispatcher ALL=(actions-runner)" in deploy
    assert "sops" in deploy and "no_log: true" in deploy
    assert "owner: ci-jit-dispatcher" in deploy
    assert "User=ci-jit-dispatcher" in unit
    assert "ExecStartPre=/usr/bin/bash -c 'command -v gh" in unit
    assert "User=juan" not in unit
    assert "ProtectSystem=strict" in unit
    assert "ProtectHome=yes" in unit
    assert "BindReadOnlyPaths=-/home/juan/.nix-profile:/opt/ci-jit-profile" in unit
    assert "MemoryMax=70%" in unit
    assert "TasksMax=1024" in unit
    assert "CPUWeight=80" in unit
    assert "NoNewPrivileges=yes" not in unit, "sudo must be able to drop to the isolated runner UID"
    assert "ReadWritePaths=/var/lib/ci-jit-dispatcher /var/lib/ci-jit-runner /var/cache/ci-jit" in unit

    for path in configs:
        host = path.name.removeprefix("config.").removesuffix(".json")
        config = json.loads(path.read_text(encoding="utf-8"))
        labels = set(config["labels"])
        unique_labels = set(config.get("unique_labels", []))
        assert unique_labels, f"{path.name}: explicit routing labels required"
        assert unique_labels <= labels, f"{path.name}: unique labels must be offered"
        assert {"self-hosted", "linux"} <= labels, f"{path.name}: missing base labels"
        assert labels & {"x64", "arm64"}, f"{path.name}: missing Linux architecture label"
        assert "repos" not in config, f"{path.name}: private repository names must not be plaintext"
        assert config["repos_file"] == f"/etc/ci-jit-dispatcher/repos.{host}.json"
        assert (ROOT / "secrets" / f"ci-jit-repos.{host}.enc").is_file(), (
            f"{path.name}: encrypted private allowlist is missing"
        )
        assert config.get("dry_run") is False, f"{path.name}: production mode must be explicit"
        assert not unique_labels & {"x64", "arm64"}, (
            f"{path.name}: architecture labels must not route generic jobs to JIT"
        )
        assert config["runner_user"] == "actions-runner"
        assert config["runner_dir"] == "/var/lib/ci-jit-runner/runner"
        assert config["work_root"] == "/var/lib/ci-jit-runner/work"
        assert config["shared_cache_dir"] == "/var/cache/ci-jit"
        assert config["state_dir"] == "/var/lib/ci-jit-dispatcher/state"
        assert config["max_concurrent"] == 1, (
            f"{path.name}: this dispatcher runs JIT jobs synchronously and supports one at a time"
        )
        assert config["run_timeout_seconds"] > 0, f"{path.name}: timeout must be positive"

    acer = json.loads((CONFIG_DIR / "config.acerpepe.json").read_text(encoding="utf-8"))
    framearch = json.loads((CONFIG_DIR / "config.framearch.json").read_text(encoding="utf-8"))
    lola = json.loads((CONFIG_DIR / "config.lenovo-lola.json").read_text(encoding="utf-8"))
    liedelpi = json.loads((CONFIG_DIR / "config.liedelpi.json").read_text(encoding="utf-8"))

    assert acer["unique_labels"] == ["jit"]
    assert "muscle" in framearch["unique_labels"]
    assert lola["unique_labels"] == ["light"]
    assert "jit" in lola["labels"]
    assert liedelpi["unique_labels"] == ["jit"], (
        "Liedelpi must require explicit JIT opt-in, not match every ARM64 job"
    )

    print(f"CI JIT config checks passed ({len(configs)} host configs; allowlists encrypted)")


if __name__ == "__main__":
    main()
