# CI JIT dispatcher: one poller per host, ephemeral runner per job

The dispatcher polls GitHub Actions queues and mints an ephemeral runner only
for an allowlisted private repository and a job explicitly routed to that host.
The intended service uses a dedicated `ci-jit-dispatcher` account to read the
minting PAT and a separate unprivileged `actions-runner` account for jobs. This
is process and systemd isolation, **not** VM isolation: jobs still share the
host kernel and network and must be trusted.

## Public repository boundary

`huaxel/dotfiles` is public and must never be included in a self-hosted JIT
allowlist. Pull requests can change workflow definitions, so routing a public
PR to a self-hosted runner is unsafe even when the intended workflow does not
request secrets. The replacement workflow uses GitHub-hosted `ubuntu-latest`
and `just ci-public`, which runs the normal gate and validates SOPS recipient
metadata without decrypting payloads or receiving an age key.

Per-host repository allowlists are SOPS-encrypted in
`secrets/ci-jit-repos.<host>.enc`. The deployment controller decrypts the
selected file in memory and installs it with permissions limited to the
`ci-jit-dispatcher` group. Tracked host configs contain only the installed
allowlist path, not repository names.

## Host map

| Host | Labels and opt-in | Limit | Encrypted allowlist |
|---|---|---:|---|
| `acerpepe` | `x64`, `jit` | 1 | `secrets/ci-jit-repos.acerpepe.enc` |
| `framearch` | `x64`, `muscle`, `jit` | 1 | `secrets/ci-jit-repos.framearch.enc` |
| `liedelpi` | `arm64`, `jit` | 1 | `secrets/ci-jit-repos.liedelpi.enc` |
| `lenovo-lola` | `x64`, `light`, `jit` | 1 | `secrets/ci-jit-repos.lenovo-lola.enc` |

A job must request the host's opt-in label (`jit`, `muscle`, or `light`) as
well as its architecture. Liedelpi intentionally requires `jit`; `arm64` alone
must not let the dispatcher take generic work from its existing persistent ARM
runners. Allowlist entries are explicit; no wildcards are supported.

Each host has one dispatcher loop and runs the JIT runner synchronously, so
supported per-host concurrency is one (up to four independent jobs across the
pool). Raising a config limit alone does not add parallel workers. Each job
gets a fresh HOME/workdir and one-job registration, but the host-local runner
installation and tool caches persist under the shared `actions-runner` UID;
allowlisted repositories must contain trusted code.

Existing per-repository runner services, K3s, application services, and
firewall policy are outside this dispatcher and remain unchanged.

## Deployment and verification

`infra/ansible/deploy-ci-jit.yml` is a mutating playbook. It installs the
versioned official x64 or ARM64 Actions runner archive with a verified SHA-256,
creates separate dispatcher and runner accounts, and installs the dispatcher
script, sanitized host config, decrypted allowlist, and systemd unit. The
PAT file is owned by the dispatcher account with mode `0600`; job processes
run as `actions-runner` and cannot read it or dispatcher state. A narrowly
scoped sudoers rule permits only the dispatcher-to-runner process handoff.
The systemd unit makes host filesystems read-only by default and hides home
directories. Where a Nix profile exists, it bind-mounts only that read-only
command profile; hosts with system-installed tools do not need it. The unit
caps the service at 70% of host memory, 1024 tasks, and CPU weight 80. The playbook
validates the existing token's presence, mode, and size without reading or
copying its contents. It refuses to restart a dispatcher with an active claim.

Offline checks:

```bash
just check-ci-jit
just check-home-server
```

A deployment command (do not run without explicit authorization):

```bash
just ci-jit-deploy
```

The initial Ansible rollout used the earlier shared-UID layout. The
isolated-account migration was explicitly authorized, deployed to all four
hosts on 2026-10-30, and verified: dispatcher units run as
`ci-jit-dispatcher`, jobs run as `actions-runner`, and the token/allowlist
permissions match the intended boundary. Read-only queued-runs API probes
succeeded for every configured allowlist on every host. A controlled manual
workflow dispatch then exercised the ARM64/JIT route on Liedelpi and completed
successfully in 29m46s. GitHub removed that ephemeral runner registration, its
specific claim and work directory were absent after completion, and the
Liedelpi dispatcher remained active with zero restarts. Persistent runner
installations remain separate and are not managed by this migration.
