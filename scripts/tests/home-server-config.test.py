#!/usr/bin/env python3
"""Static safety checks for home-server deployment and recovery scripts."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


backup = read("scripts/home-server-deploy/backup-pi.sh")
require("flock -n 9" in backup, "backup permits overlapping runs")
require("%Y-%m-%dT%H%M%S" in backup, "backup snapshots collide on same-day reruns")
require("bash -s" in backup, "backup commands rely on the remote login shell")
require("k3s-restore.tar" in backup and "etcd-snapshot save" in backup, "backup lacks a restorable K3s snapshot")
require("var/lib/rancher/k3s/server/token" in backup, "K3s restore token is not backed up")
require('mv -Tf "${pending_link}" "${LATEST_LINK}"' in backup, "latest snapshot publication is not atomic")
require("PUBLISHED=0" in backup and "Removed incomplete snapshot" in backup, "partial snapshots are not cleaned up")
require('"${old_snapshot}" != "${LATEST_TARGET}"' in backup, "retention can delete the last known-good snapshot")
for excluded in ("media/downloads/", "actions-runner*/", ".bun/install/cache/"):
    require(f"--exclude='{excluded}'" in backup, f"replaceable data can fill backup disks: {excluded}")

offsite = read("scripts/home-server-deploy/offsite-backup.sh")
require('rclone sync "${PHOTOS}"' not in offsite, "offsite archive propagates source deletions")
require('rclone copy "${PHOTOS}"' in offsite, "offsite photo copy is missing")
require("rclone listremotes" in offsite and 'find "${PHOTOS}" -type f' in offsite, "offsite source/remote preflight is missing")
require("trap 'rm -f" in offsite, "offsite database dump leaks after failure")

register = read("scripts/home-server-deploy/register-project")
require("*[!a-zA-Z0-9._-]*|.|.." in register, "project registration permits path traversal")

deploy = read("scripts/home-server-deploy/post-receive")
require("No Tailscale IPv4 address" in deploy, "deployments can fall back to a LAN address")
require("flock -x 9" in deploy, "concurrent deployments are not serialized")
require("Deployment failed; restoring previous release" in deploy, "failed deployments have no rollback path")
require("caddy validate" in deploy, "Caddy configuration is not validated before reload")
require("reload-or-restart caddy || true" not in deploy, "Caddy reload failures are ignored")
require("docker compose --project-name \"$project\" up -d" in deploy, "Compose deployment does not update in place")
require('--project-name "$project"' in deploy, "Compose project identity changes with release directories")
require("trap cleanup_deploy EXIT" in deploy and "trap 'exit 143' TERM" in deploy, "deployment signals can bypass failure cleanup")
require("refs/heads/main" in deploy and "while read -r" in deploy, "multi-ref pushes are not handled")

bootstrap = read("scripts/home-server-deploy/bootstrap-server")
require("hostname -I" not in bootstrap, "bootstrap can expose deployments on the LAN")
require('aarch64|arm64)' in bootstrap, "bootstrap does not support ARM64 Docker plugins")
require("sha256sum -c" in bootstrap, "downloaded Docker plugins are not checksum-verified")
require("%h/Caddyfile" in bootstrap, "Caddy service is hard-coded to one home directory")

justfile = read("justfile")
require('ssh "{{server}}" bash -s -- "$PROJECT"' in justfile, "project registration does not force Bash remotely")
require('ssh "{{server}}" "$HOME/deploy-hooks/register-project"' not in justfile, "local HOME leaks into remote registration path")

runner = read("config/ci/runner/setup-runner.sh")
require('read -r -s -p "  Enter runner token:' in runner, "runner token input is echoed")
require("echo '$RUNNER_TOKEN' > .token" not in runner, "short-lived runner token is persisted")
require("Type the host name to confirm" in runner, "runner removal has no explicit confirmation")
require("Invalid SSH host" in runner and "Invalid GitHub URL" in runner, "runner SSH inputs are not validated")
require("RUNNER_SHA256" in runner and "sha256sum -c" in runner, "runner archive is not checksum-verified")
require("printf '%s\\n' \"$RUNNER_TOKEN\" | ssh" in runner, "runner token is exposed in SSH process arguments")
require('just-${just_arch}' in runner, "just fallback is hard-coded to x86_64")

sandbox = read("bin/sandbox.sh")
require("invalid server name" in sandbox and "invalid image reference" in sandbox, "sandbox interpolates unvalidated SSH inputs")
require(sandbox.count("invalid container name") >= 2, "sandbox logs/down interpolate unvalidated container names")
require(".Config.ExposedPorts" in sandbox, "sandbox assumes host and container ports are identical")
require('-p "$2:$3:$4"' in sandbox, "sandbox does not map the inferred container port")

compose = read("scripts/home-server-deploy/media-stack.docker-compose.yml")
require('"192.168.1.138:5055:5055"' in compose, "Jellyseerr port mapping is malformed")
images = re.findall(r"^\s*image:\s*(\S+)", compose, re.MULTILINE)
require(images, "media stack has no images")
require(all("@sha256:" in image for image in images), "media stack contains floating image tags")

print("home-server static checks passed")
