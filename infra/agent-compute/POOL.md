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

- Arch: x86_64, 4 cores, 4 GB RAM, 369 GB disk + 796 GB /data free.
  At pilot time: ~1.4 GiB available with ~0.6 GiB swap in use; post-job
  ~1.6 GiB available. Use lightweight jobs only.
- Toolchain: docker, node, python3 + gh 2.102 + uv 0.13 (nix, added
  2026-10-18; flakes enabled in /etc/nix/nix.conf). Still missing:
  rustc, go (install only if a job needs them).
- Current roles: infra watchdog + live CI JIT dispatcher
  (`ci-jit-dispatcher@acerpepe`, enabled/active, labels
  `[self-hosted, linux, x64, jit]`, max 1 concurrent). End-to-end
  workflow_dispatch pilot passed 2026-10-18: runner
  `acerpepe-huaxel_dotfiles-1792360031-19417`, job success, runner
  cleaned up. This proves dispatch/mint/run/cleanup, not arbitrary build
  suitability.
- Good for: light services, watchdog jobs, small x86 CI. 4 GB RAM rules
  out heavy gates — max one job; observe memory/swap on real workloads.

## How agents use the pool

- CI: push a workflow using the JIT labels for the arch you need
  (`[self-hosted, linux, arm64, jit]` on liedelpi or
  `[self-hosted, linux, x64, jit]` on acerpepe); the dispatcher mints an
  ephemeral runner, runs, cleans up. Both paths now have a successful
  pilot. No pet-runner babysitting.
- Services/sandboxes: `ssh <host>`, use docker or the nix toolchain.
  dkpg/apt need root — ask the human, don't improvise with sudo.
- Etiquette: check `uptime` first; liedelpi max 2 concurrent CI runners;
  acerpepe is RAM-thin — one job at a time, nothing hungry.

## Remaining / watch items

1. Keep acerpepe to one light CI job at a time; measure peak RAM/swap on
   representative jobs before considering an upgrade. Its pilot was tiny.
2. Add Rust/Go only if an actual queued job requires them.
3. belpolsim pet runners on liedelpi become removable only after its JIT
   migration/promotion is complete and removal is explicitly approved.
