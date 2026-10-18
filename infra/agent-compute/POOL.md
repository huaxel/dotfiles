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
- Toolchain: docker, node, python3. **Missing: gh, uv, rustc, go.**
- Current roles: infra watchdog. No CI listener yet.
- Good for: light services, watchdog jobs, x86 CI *after* toolchain gap is
  closed (see below). 4 GB RAM rules out heavy gates — keep jobs small.

## How agents use the pool

- CI: push a workflow using the JIT labels for the arch you need
  (`[self-hosted, linux, arm64, jit]` today); the dispatcher mints an
  ephemeral runner, runs, cleans up. No pet-runner babysitting.
- Services/sandboxes: `ssh <host>`, use docker or the nix toolchain.
  dkpg/apt need root — ask the human, don't improvise with sudo.
- Etiquette: check `uptime` first; liedelpi max 2 concurrent CI runners;
  acerpepe is RAM-thin — one job at a time, nothing hungry.

## Next (approval-gated, NOT done)

1. Close acerpepe toolchain gap (gh + uv via nix, matching the fleet),
   then extend the JIT dispatcher to acerpepe for x86 jobs.
2. Decide RAM policy for acerpepe CI (light jobs only vs upgrade).
3. belpolsim pet runners on liedelpi become removable once JIT promotes.
