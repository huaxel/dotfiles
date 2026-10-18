# CI JIT dispatcher: one poller per host, zero pet runners

Replaces N per-repo persistent `Runner.Listener` processes with one small
bash poller per host that mints **ephemeral (JIT) runners on demand**.

## Why

| Before | After |
|---|---|
| 7 listeners on liedelpi (~800 MB idle), 2 on acerpepe, 2+ bespoke on framearch | 1 process per host (~10 MB + tools it shells out to) |
| Cross-job contamination via reused `_work` dirs | Fresh work dir per job, deleted after |
| 7 separate installs to upgrade per host | Reuses one existing `actions-runner` dir (self-updates on connect) |
| Persistent credentials on long-lived runners | Per-job JIT config, single-use, expires |

What it is **not**: VM isolation. `aanbestedingen` keeps its Rust
libvirt controller on framearch (labels `aanbestedingen-ephemeral`).
This dispatcher is for own-code repos with no outside contributors,
where ephemerality — not hardware isolation — is the gap.

## Host map

| Host | Labels offered | Serves | Notes |
|---|---|---|---|
| `liedelpi` | `self-hosted, linux, arm64, jit` | 7 repos (dotfiles, belpolsim, nursultan-web, project-atom, energy-dashboard, brussel-jeu, trippin-cloudintegration) | ARM-native; `max_concurrent: 2` |
| `framearch` | `self-hosted, linux, x64, muscle, jit` | belpolsim, nursultan-web (opt-in heavy jobs) | `max_concurrent: 1` — it is also the interactive workstation |
| `acerpepe` | — | **nothing: exits CI entirely** | 4 GB is better spent on uptime-kuma, crons, Caddy edge, backups |

Routing safety: the dispatcher only serves a queued job whose requested
labels are a **subset of its own**, and the job must name at least one of
the host's `unique_labels`. A bare `runs-on: [self-hosted, linux]` can
never be stolen by the wrong host — workflows opt in explicitly, e.g.
`runs-on: [self-hosted, linux, arm64, jit]`.

## Rollout (in order, one repo at a time)

1. **Human: mint the token.** Fine-grained PAT, per repo (or one PAT with
   access to all listed repos), permissions `Actions: read` +
   `Administration: write`. Store at `/etc/ci-jit-dispatcher/token`,
   root-owned `0600`. (Same posture as
   `aanbestedingen/infra/runner-controller/setup-credential.sh`.)
2. **Pilot: dotfiles on liedelpi.** Install script + config, start
   `ci-jit-dispatcher@liedelpi` **alongside** the existing `liedelpi-ci`
   listener. Push a trivial commit to a branch whose workflow uses the
   `jit` labels; watch `/home/juan/.local/state/ci-jit/` and the run.
3. **Cut over dotfiles**: change `main` workflow `runs-on` to the jit
   labels, then stop/disable/remove the `liedelpi-ci` registration.
4. **Repeat per repo**, then per host. Retire acerpepe's two listeners
   and move those repos' light x86 jobs to framearch `muscle` (or drop
   them if ARM covers it).
5. **Later, optional:** wire install + token path into the dotfiles flake
   (`home/liedelpi.nix`, `home/framearch.nix`) so the fleet converges
   declaratively.

## Files

- `jit-dispatcher.sh` — the poller (bash, `gh` + `jq` only).
- `config.<host>.json` — labels, repos, paths, concurrency.
- `ci-jit-dispatcher@.service` — systemd template (`%i` = host key).

## Status

- [x] Dispatcher written; `bash -n` clean; label-matching unit-tested (4/4)
      against fixtures; live read-only queue poll verified.
- [x] Preflight 2026-10-18: liedelpi ready (gh 2.102 + jq + runner dir).
      framearch gh is nix-only — systemd unit sets PATH explicitly.
      acerpepe has no gh (fine: it exits CI per the host map).
- [x] Dry-run proven against live state 2026-10-18 (`dry_run` +
      `max_iterations`, ambient auth): polled dotfiles, correctly found
      nothing actionable (8 completed that day vs 0 queued — the filter
      is selective, not vacuous), exited clean, zero side effects
      (no claims, no mints, no state). Existing listener untouched.
- [x] Write scope proven 2026-10-18 with the refreshed PAT (classic,
      verified huaxel): token placed on liedelpi (now juan-owned 0600 —
      root ownership abandoned: the runner refuses root, and jobs must
      never run privileged); single mint-and-discard returned a validated
      `pilot-probe-*` registration. Read confirmed on all 7 repos first.
      Credential traces shredded on both ends.
- [x] First live lesson (project-atom canary run 1): ephmeral HOME
      means a COLD tool cache every run — persistent runners reuse
      `~/.cache/uv`, fresh HOME cannot, and dep-heavy gates (uv sync of
      sklearn/splink/pyarrow/...) pay full download+build each time.
      The 30-min timeout fired in Coverage with mypy pending (baseline
      on acerpepe x86: 26 min). Fix staged: `UV_CACHE_DIR`/`PIP_CACHE_DIR`
      point at a shared host dir outside the ephemeral home (content-
      addressed, lock-safe at our concurrency); ephemerality still holds
      for `_work`. Retry dispatched; timeout bump to 45 reserved as
      fallback, not preemptive.
- [x] PILOT SUCCESS 2026-10-18: temp branch + minimal jit workflow →
      ephemeral runner ran the probe job to **success**, workdir cleaned,
      registration auto-removed. Branch deleted locally + remotely; main
      untouched; 30 offline probe registrations removed (liedelpi-ci
      still online throughout); pilot dispatcher stopped. Live bugs fixed:
      (1) mint echo is label-objects + capitalized → extract `.name`,
      compare case-insensitively; (2) `--jitconfig` takes the base64
      STRING, not a path (path dies with exit 0 — silent trap);
      (3) unit runs as User=juan; (4) killed dispatchers orphan claims →
      stale-lock reclamation guard; (5) timestamped log lines.
- [ ] NOT YET (explicit approval): cut any real workflow to jit labels;
      install+enable the systemd unit; retire any listener.
