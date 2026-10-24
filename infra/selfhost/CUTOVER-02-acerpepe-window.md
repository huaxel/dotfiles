# CUTOVER-02: acerpepe window (belpolsim removal + last listener retirement)

EXECUTED 2026-10-24 ~10:45 CEST (human-approved Phase 1+2 via ask_user).
Phase 1: snapshot /tmp/belpolsim-acerpepe-20261024.tgz (191M) -> rm
~/apps/belpolsim + ~/repos/belpolsim.git -> caddy reload -> :8081 still 200:
root causes found live: (a) belpolsim backend was Docker container
127.0.0.1:8081 (Up 9d), not static files; (b) TWO caddy masters (1006 stale
+ 1151657 current) splitting :8080/:30080, stale holding :8081+admin.
Completed: docker stop/rm belpolsim (image kept), :8081 -> 502, kill 1006,
single master 1151657, :8081 refused (exit 7), :8080 200, :30080 200 (http),
liedelpi:8080 200. Phase 2: listener idle (busy=false) -> svc stop (2.5G mem
peak/856M swap: the RAM case) -> uninstall -> server-side remove (creds
shredded) -> rm -rf dir -> unit file auto-removed -> daemon-reload ->
pgrep clean, API lists only liedelpi-project-atom, dispatcher active.
Pre-flight evidence was verified live 2026-10-23/24.

Goal: acerpepe becomes infra-only (Caddy edge + uptime-kuma + crons +
backups + x64 JIT). Blast radius: belpolsim serves from liedelpi
throughout; brussel-jeu + nursultan untouched; project-atom CI covered by
liedelpi JIT + framearch `ci`. Duration: ~20 min + 24h watch (next 03:00
backup + kuma).

Evidence baseline (verified live):
- liedelpi belpolsim Docker `home-deploy/belpolsim:latest` Up 9d (healthy),
  `http://100.127.61.2:8080` reachable; acerpepe `https://acerpepe…:8081`
  reachable — true duplicate, liedelpi is survivor.
- acerpepe `~/apps/`: belpolsim, brussel-jeu, nursultan. `~/repos/`:
  belpolsim.git, brussel-jeu.git, nursultan-web.git (no project-atom.git).
- Caddy is glob-import (`import /home/juan/apps/*/current/Caddyfile`,
  `auto_https off`) — removing `~/apps/belpolsim` + `caddy reload` suffices,
  no main-file edit. belpolsim layout: `current` + `releases` (standard).
- Backup green 2026-10-23 03:03 CEST: `latest -> /data/backups/pi/2026-10-23T030003`,
  14G, mirrored to `/mnt/wd-blue/backups/pi/latest`, bundle complete
  (data-docker, docker-configs, home, immich-db.sql, k3s-restore.tar, pihole).
- acerpepe mem 3.7G total / 1.3G free / 2.0G avail at rest; dispatcher
  `ci-jit-dispatcher@acerpepe` active with `_work-jit` present.
- Legacy listeners: exactly 1 live (`actions-runner-project-atom` Listener).
  `actions-runner-nursultan-web` dir already gone. Bare `actions-runner/`
  dir remains — treat as JIT reuse dir until proven otherwise, do NOT delete
  in this window.
- project-atom routing: `project-atom-ci.yml:48` on
  `[self-hosted, linux, arm64, jit]` (canary); weekly/harness/agentic still
  on `[self-hosted, ci]` (framearch's 2 `ci` runners cover).

## Phase 0 — pre-flight (re-run at window time)

```
curl --max-time 10 -s -o /dev/null -w "liedelpi:%{http_code}\n" http://100.127.61.2:8080
ssh acerpepe /usr/bin/tail -n 3 /data/backups/scripts/backup-pi.log
ssh acerpepe /usr/bin/pgrep -af caddy
gh api repos/huaxel/project-atom/actions/runners -q '.runners[] | select(.name | test("acerpepe")) | "\(.name) \(.status) \(.labels[].name)"'
ssh acerpepe /usr/bin/ls -lt /home/juan/apps/belpolsim/releases/ | head -5
```

Gate: P0.1 must be 200 and backup dated today, else abort. The `gh api`
runners output decides Phase 2 order: if the acerpepe listener carries
`ci`, Phase 2 waits until weekly/harness/agentic leave `[self-hosted, ci]`
(verify one `ci` run lands on framearch first).

## Phase 1 — remove belpolsim from acerpepe — NEEDS APPROVAL

```
ssh acerpepe /usr/bin/tar -czf /tmp/belpolsim-acerpepe-$(date +%Y%m%d).tgz -C /home/juan/apps belpolsim -C /home/juan/repos belpolsim.git
ssh acerpepe /usr/bin/ls -lh /tmp/belpolsim-acerpepe-*.tgz
# drain: eyeball uptime-kuma :3001 history (~2 min), no deploy in flight
ssh acerpepe /usr/bin/rm -rf /home/juan/apps/belpolsim /home/juan/repos/belpolsim.git
ssh acerpepe caddy reload --config /home/juan/Caddyfile
curl --max-time 10 -sk -o /dev/null -w "acerpepe:%{http_code}\n" https://acerpepe.bonobo-fort.ts.net:8081
curl --max-time 10 -s -o /dev/null -w "liedelpi:%{http_code}\n" http://100.127.61.2:8080
curl --max-time 10 -sk -o /dev/null -w "brussel:%{http_code}\n" https://acerpepe.bonobo-fort.ts.net:8080
```

Rollback (same window): `tar -xzf /tmp/belpolsim-acerpepe-<date>.tgz -C /`,
`caddy reload`, re-verify inverted. Nuclear rollback: `git push acerpepe
main` from a clean belpolsim worktree re-creates everything via
`post-receive` (never touch `~/deploy-hooks/` in this window).

## Phase 2 — retire actions-runner-project-atom on acerpepe — NEEDS APPROVAL, after Phase 0 gate

Dispatcher `ci-jit-dispatcher@acerpepe` stays active throughout (untouched).

```
ssh acerpepe /usr/bin/pgrep -af Runner.Listener
gh api repos/huaxel/project-atom/actions/runs --paginate -q '.workflow_runs[:5] | .[] | "\(.id) \(.name) \(.status) \(.conclusion)"'
# if idle, then:
ssh acerpepe "cd /home/juan/actions-runner-project-atom && sudo ./svc.sh stop && sudo ./svc.sh uninstall"
TOKEN=$(gh api -X POST repos/huaxel/project-atom/actions/runners/registration-token -q .token)
ssh acerpepe "cd /home/juan/actions-runner-project-atom && ./config.sh remove --token $TOKEN"
ssh acerpepe /usr/bin/rm -rf /home/juan/actions-runner-project-atom
ssh acerpepe /usr/bin/pgrep -af Runner.Listener || echo "no pet listeners"
ssh acerpepe sudo systemctl is-active ci-jit-dispatcher@acerpepe
ssh acerpepe /usr/bin/free -h
```

Rollback (same window): `just runner-setup acerpepe install` + re-register
with old labels (token via the same POST call).

## Phase 3 — 24h watch (read-only, no approval needed)

- uptime-kuma :3001: belpolsim-liedelpi check green, acerpepe checks green.
- Next 03:00 backup completes, `latest` advances, mirror syncs.
- `free -h` headroom holds; no `ci`-label job queues >10 min.
- Delete `/tmp/belpolsim-acerpepe-*.tgz` after 7 green days.

Out of scope follow-up: migrate weekly/harness/agentic off
`[self-hosted, ci]` (same one-line canary pattern: `runs-on` to arch `jit`
labels, 3 greens, instant revert per the workflow comment).
