# First cutover: project-atom lint → JIT canary (+ unit install)

## Why this repo, this job (evidence, 2026-10-18)

- Traffic: nursultan-web 20, project-atom 20, belpolsim 12 runs/14d;
  dotfiles/energy/brussel-jeu/trippin 0. Dotfiles-first would prove
  nothing (its CI died in July) — rejected on evidence.
- project-atom `CI / Lint & structure` is the ideal canary: single job,
  read-only (`permissions: contents: read`, data-free synthetic fixtures,
  must NOT set ATOM_DATA_ROOT), cancel-in-progress, 30-min timeout,
  currently `runs-on: [self-hosted, ci]` (served only by liedelpi-ci).
- nursultan-web's top job is a **production deploy** — higher stakes,
  later. belpolsim second reserve.
- Branch protection requires the context `CI / Lint & structure`: the
  canary keeps job id + display name identical, changing ONLY the
  `runs-on` line — protection keeps working.

## Change (one line)

```diff
-    runs-on: [self-hosted, ci]
+    runs-on: [self-hosted, linux, arm64, jit]
```

`linux`/`arm64` lowercase match the dispatcher; `jit` is the unique
guard so no persistent runner (labels `Linux`/`ARM64` uppercase) can
take it, and the dispatcher refuses jobs without a unique label.

## Canary protocol (SRE-style, adapted)

1. **Install + enable** `ci-jit-dispatcher@liedelpi` on liedelpi
   (unit file staged here; preflight done). Persistent `liedelpi-ci`
   and `liedelpi-project-atom` listeners KEEP RUNNING — they simply
   stop matching this job.
2. **Trigger**: `workflow_dispatch` on main (exists for zero-job
   recovery — no code push needed to start the canary).
3. **Watch live**: dispatcher log → mint → ephemeral run → job result.
4. **Promote after 3 consecutive JIT successes** (normal push traffic
   gives ~1–2/day → ~2 days). Then stop/disable/remove the
   `liedelpi-project-atom` registration (keep `liedelpi-ci` until its
   own repos cut over).
5. **Rollback (any JIT failure or queue stall >30 min)**: revert the
   one-line commit → persistent listener picks up the next run
   immediately. Total blast radius: lint on main delayed, never lost
   (revert restores the old path in one push).

## Falsifiers (what would kill this plan)

- A JIT run fails for environment reasons (missing tool on Pi that the
  persistent runner had) → fix env or abort canary, never "retry until
  green".
- Job duration regresses >2× vs persistent baseline → investigate
  (worker scaling assumes 32-core in comments; Pi has 4).
- Any sign the persistent path is needed as fallback beyond rollback →
  the per-repo retirement order is wrong; stop and re-plan.

## Rollout order after the canary (by traffic, deploy last)

1. project-atom lint (this doc) → 2. belpolsim — RECLASSIFIED 2026-10-18:
   it has NO custom workflows at all (only Pages/Dependabot/Copilot
   dynamic flows, all `ubuntu-latest`). Its two pet runners
   (liedelpi-belpolsim, framearch-juan-belpolsim) can never receive a
   job: pure idle waste, removal candidates, NOT a migration.
   → 3. energy-dashboard, brussel-jeu, trippin, dotfiles (all 0 runs/14d:
   dead CI — revive-or-retire decision each, not a cutover) →
   4. nursultan-web (only job seen is a production DEPLOY on x64 —
   goes last, and only after the framearch muscle dispatcher exists).
   Staged intel 2026-10-18: workflows are Deploy (active), Rollback
   (active — pre-existing safety net), CI (disabled_manually),
   Playwright. Recent runs all `Deploy backend → production` (3 success
   + 1 FAILURE 38918040807 — understand it before any canary there).
   Path when the time comes: probe muscle with a no-op jit job first
   (dotfiles pattern), then canary Deploy with Rollback on standby.
   Framearch `muscle` dispatcher + acerpepe exit follow the same
   pattern; aanbestedingen VM path untouched throughout.

## Canary log (2026-10-18)

- **Run 1 (push b74fc6a9b): FAILED (instructive).** 30-min timeout fired
  in Coverage, mypy pending. Root cause: cold uv cache on a fresh
  ephemeral HOME (persistent runners reuse `~/.cache/uv`) + ARM slower
  than the x86 baseline (26 min on acerpepe). Fix: shared
  `UV_CACHE_DIR`/`PIP_CACHE_DIR` outside the ephemeral home (content-
  addressed, lock-safe at our concurrency); timeout 30→45 with a
  measured-justification comment.
- **Run 2 (manual dispatch): SUCCESS — first JIT production gate green.**
  Ephemeral `liedelpi-huaxel_project-atom-…` ran checkout → lint →
  tests → coverage → mypy to success in ~27 min, matching the baseline
  once cached. Workdir cleaned, registration auto-removed, persistents
  untouched. (Canary 1/3: two more consecutive successes to promote.)
- Non-signal: an earlier push run failed only because a manual
  foreground diagnostic stole its job and hit its own 100 s timeout —
  operator artifact, documented so it isn't misread.
