#!/usr/bin/env python3
"""Check or explicitly link the small set of Home Manager-owned agent entrypoints.

No inference, credentials, profile activation, package installation, or remote writes.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def entries(root):
    return {
        ".codex/AGENTS.md": root / "AGENTS.md",
        ".claude/CLAUDE.md": root / "AGENTS.md",
        ".pi/agent/AGENTS.md": root / "AGENTS.md",
        ".pi/agent/APPEND_SYSTEM.md": root / "pi/agent/APPEND_SYSTEM.md",
        ".local/bin/pi": root / "bin/pi",
    }


def same_file(target, source):
    return target.exists() and source.exists() and target.samefile(source)


def fingerprint(path):
    try:
        stat = path.lstat()
        return (stat.st_dev, stat.st_ino, stat.st_mode, stat.st_size, stat.st_mtime_ns)
    except FileNotFoundError:
        return None


def check(root, home):
    issues = []
    for name, source in entries(root).items():
        target = home / name
        if not source.is_file():
            issues.append(f"missing source: {source}")
        elif not same_file(target, source):
            issues.append(f"not linked to shared source: {target}")
    override = home / ".codex/AGENTS.override.md"
    if override.is_file() and override.stat().st_size:
        issues.append(f"global override takes precedence; inspect without deleting it: {override}")
    settings = root / "pi/agent/settings.json"
    if settings.is_file():
        data = json.loads(settings.read_text())
        for package in data.get("packages", []):
            source = package if isinstance(package, str) else package.get("source", "")
            if source.startswith(("/", "~/")) and not Path(source.replace("~/", str(home) + "/", 1)).exists():
                issues.append(f"configured local package missing: {source}")
    return issues


def apply_links(root, home):
    planned = []
    for name, source in entries(root).items():
        target = home / name
        if not source.is_file():
            raise ValueError(f"missing source: {source}")
        if name == ".local/bin/pi" and not os.access(source, os.X_OK):
            raise ValueError("Pi launcher is not executable")
        if same_file(target, source):
            continue
        if target.is_dir() and not target.is_symlink():
            raise ValueError(f"refusing to replace a directory: {target}")
        for parent in target.parents:
            if parent.exists() and not parent.is_dir():
                raise ValueError(f"parent is not a directory: {parent}")
            if parent == home:
                break
        planned.append((target, source, fingerprint(target)))
    if not planned:
        return None
    backup_parent = home / ".local/state/dotfiles/agent-backups"
    backup_parent.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix="entrypoints-", dir=backup_parent))
    for target, source, expected in planned:
        if fingerprint(target) != expected:
            raise ValueError(f"entrypoint changed during apply; inspect and retry: {target}")
        target.parent.mkdir(parents=True, exist_ok=True)
        saved = backup / target.relative_to(home)
        if expected is not None:
            saved.parent.mkdir(parents=True, exist_ok=True)
            target.rename(saved)
        try:
            target.symlink_to(source)
        except OSError:
            if not target.exists() and not target.is_symlink() and expected is not None:
                saved.rename(target)
            raise
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["check", "apply"])
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--home", type=Path, default=Path.home())
    args = parser.parse_args()
    try:
        root, home = args.root.resolve(), args.home.resolve()
        if args.action == "apply":
            backup = apply_links(root, home)
            print(f"Prior entrypoints retained at {backup}" if backup else "Entrypoints already linked")
        issues = check(root, home)
        for issue in issues:
            print(f"WARNING: {issue}")
        if not issues:
            print("Agent entrypoints match shared sources")
        return bool(issues)
    except (OSError, ValueError, TypeError) as exc:
        print(f"Agent setup failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
