# Agent compute pool: four-host GitHub Actions JIT

This pool distributes private-repository CI across four Linux hosts. Jobs run
as a dedicated unprivileged `actions-runner` account, separate from the
`ci-jit-dispatcher` account that can read the minting PAT. This is process and
systemd isolation, **not** VM isolation: jobs still share the host kernel and
network, so route only trusted code.

## Security boundary

- Host allowlists are stored as SOPS-encrypted files at
  `secrets/ci-jit-repos.<host>.enc`. The deployment controller decrypts each
  file in memory and installs it root-owned, readable only by the dispatcher
  group. Repository names are not stored in plaintext in tracked configs or
  documentation.
- Public `huaxel/dotfiles` is deliberately excluded from every host. Its CI
  workflow runs on GitHub-hosted `ubuntu-latest` and calls `just ci-public`:
  standard checks plus SOPS recipient-metadata validation, without decrypting
  payloads or receiving an age key or local PAT.
- JIT-eligible workflows must opt in with a host-specific label. Liedelpi
  requires `jit` as well as `arm64`; an architecture label alone must not
  capture work intended for a persistent ARM runner.
- Existing per-repository runner services remain separate. JIT runner
  installations, work directories, and caches use separate paths from those
  services. Each job gets a fresh HOME/workdir, but the host-local runner
  installation and tool caches persist under the shared `actions-runner` UID;
  allowlisted repositories must therefore contain trusted code.
- The JIT systemd unit hides operator home directories and, where present,
  bind-mounts only the read-only Nix command profile. It caps each
  dispatcher-plus-job cgroup at 70% of host memory and 1024 tasks, with CPU
  weight 80.

## Host map

| Host | Architecture / labels | Limit | Allowlist source | Role |
|---|---|---:|---|---|
| `acerpepe` | `x64`, `jit` | 1 | `secrets/ci-jit-repos.acerpepe.enc` | Lightweight x86 jobs; keep memory use modest. |
| `framearch` | `x64`, `muscle`, `jit` | 1 | `secrets/ci-jit-repos.framearch.enc` | Opt-in heavier x86 jobs; shares the interactive workstation. |
| `liedelpi` | `arm64`, `jit` | 1 | `secrets/ci-jit-repos.liedelpi.enc` | ARM-native jobs; existing services and persistent runners remain unchanged. |
| `lenovo-lola` | `x64`, `light`, `jit` | 1 | `secrets/ci-jit-repos.lenovo-lola.enc` | Low-impact jobs on the minimal server. |

Each host has one dispatcher loop and runs the JIT runner synchronously, so
supported per-host concurrency is one (up to four independent jobs across the
pool). Raising a config limit alone does not add parallel workers.

`runs-on` must include the desired architecture and opt-in label, for example
`[self-hosted, linux, arm64, jit]` for Liedelpi,
`[self-hosted, linux, x64, light, jit]` for Lola, or
`[self-hosted, linux, x64, muscle]` for Framearch.

## Readiness and operations

The initial Ansible rollout was verified on 2026-10-30: all four dispatcher
units were active and runner binaries passed version checks. That rollout used
the earlier shared-UID layout. The staged source now defines a security
migration to separate dispatcher and job accounts; this migration has **not**
been deployed to the live hosts. Do not treat the new UID boundary as active
until an explicitly authorized Ansible rollout completes and is verified.

For future changes, `just check-ci-jit` validates routing, encrypted allowlist
paths, and (when an operator age key is available) the decrypted allowlist
structure. `just check-home-server` performs offline Ansible/config checks.
The deployment playbook validates each existing token's presence, mode, and
size without reading or copying token contents, decrypts allowlists only on the
controller, refuses to restart a host with an active claim, and selects the
official x64 or ARM64 runner archive by host architecture. It does not manage
unrelated Home Manager profiles, firewalls, DNS, application services, or
persistent runner registrations.
