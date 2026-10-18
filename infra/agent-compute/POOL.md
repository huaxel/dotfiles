# Agent compute pool: liedelpi + acerpepe

Standing offer: these two hosts are reachable for agent work (services, CI,
sandboxes). Verified 2026-10-18. Access: `ssh <host>` from any tailnet
machine with the admin key (see audit 2026-10-18: RSA `gmail` key).

## liedelpi — ARM workhorse (Pi 5)

- Arch: aarch64, 4 cores, 16 GB RAM (~6 free), 351 GB disk free. Load ~1.
- Toolchain: docker, gh + uv (nix-profile), node, python3, rustc. Go missing.
- Current roles: CI JIT dispatcher (`ci-jit-dispatcher@liedelpi`, system
  unit, labels `[self-hosted, linux, arm64, jit]`, max 2 concurrent),
  persistent pet runners (fallback), always-on services.
- Good for: ARM CI via `jit` labels (proven: project-atom canary 1/3),
  docker services, agent sandboxes. Heaviest box — prefer for builds.

## acerpepe — x86 lightweight

- Arch: x86_64, 4 cores, 4 GB RAM (~1 free), 369 GB disk + 796 GB /data free.
  Load ~0.1 (idle).
- Toolchain: docker, node, python3 + gh 2.102 + uv 0.13 (nix, added
  2026-10-18; flakes enabled in /etc/nix/nix.conf). Still missing:
  rustc, go (install only if a job needs them).
- Current roles: infra watchdog. CI dispatcher **deployed and dry-run
  proven** 2026-10-18 (full 20-poll cycle against live API, clean;
  service currently parked: `systemctl stop`, not enabled).
- Good for: light services, watchdog jobs, x86 CI once flipped live.
  4 GB RAM rules out heavy gates — keep jobs small (max_concurrent=1).

## How agents use the pool

- CI: push a workflow using the JIT labels for the arch you need
  (`[self-hosted, linux, arm64, jit]` today); the dispatcher mints an
  ephemeral runner, runs, cleans up. No pet-runner babysitting.
- Services/sandboxes: `ssh <host>`, use docker or the nix toolchain.
  dkpg/apt need root — ask the human, don't improvise with sudo.
- Etiquette: check `uptime` first; liedelpi max 2 concurrent CI runners;
  acerpepe is RAM-thin — one job at a time, nothing hungry.

## Next (approval-gated, NOT done)

1. ~~Close acerpepe toolchain gap~~ done 2026-10-18 (nix + gh + uv).
   Flip live: `dry_run=false` in config.acerpepe.json, enable + start.
   End-to-end proof needs a pushed no-op pilot workflow (publishing).
2. Decide RAM policy for acerpepe CI (light jobs only vs upgrade).
3. belpolsim pet runners on liedelpi become removable once JIT promotes.
