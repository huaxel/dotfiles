# Infrastructure Runbook

Fleet + recovery notes, distilled from the 2026-08-12/16 audit & liedelpi recovery.
Machine-specific quirks are the valuable part — read before touching the fleet.

## Fleet

| Host | Role | Specs | Notes |
|------|------|-------|-------|
| **framearch-juan** | Main workstation / heavy CI | Ryzen AI Max+ 395 (16C/32T), 62 GB, Radeon 8060S, 1 TB + 1.8 TB NVMe | Models on `/mnt/ai_models`. Runs 2 GH runners (`ci` label). High zram swap under agent load is normal. |
| **arch-wsl** | Work WSL2 | Ryzen 7 PRO 8840U, 23 GB | Work machine; not part of home cloud. |
| **mac-juan** | Portable dev / Metal LLM | MacBook Air M5, 32 GB, 926 GB | SSH: `juanbenjumea@mac-juan` (in `ssh_config`). |
| **acerpepe** | Home deploy + backup server | i5-7200U, 4 GB, 500 GB PNY SSD (OS) + 1 TB Toshiba (`/data`) + 500 GB WD Blue (`/mnt/wd-blue`) | Gigabit. Caddy + git-push deploys + 3 GH runners + uptime-kuma + nightly Pi backup. **4 GB RAM = ~1 heavy job at a time.** |
| **liedelpi** | Media server + DNS + CI | Pi 5, 16 GB, 1.9 TB NVMe, **k3s + Docker side-by-side** | Immich, Jellyfin, qbittorrent, *Arr, stash, NPM (k8s), Pi-hole, 6 ARM64 runners. 4 cores — media first, CI second. |

Tailnet: `bonobo-fort.ts.net`. SSH via `~/.ssh/config` (symlinked from `dotfiles/ssh_config`).

## CI cloud (GitHub Actions self-hosted)

- Runner labels: `self-hosted,linux,ci` (+ arch). Repos set `CI_RUNNER = ["self-hosted","linux","ci"]`.
- Live: framearch (belpolsim, nursultan-web), acerpepe (nursultan-web, project-atom), liedelpi (6: belpolsim, nursultan-web, brussel-jeu, project-atom, energy-dashboard, trippin-cloudintegration).
- Setup: `just runner-setup <host> install` (dotfiles `config/ci/runner/setup-runner.sh`). Re-register with `--labels 'self-hosted,linux,ci'`.
- **`config.sh` refuses "already configured" if `.runner_migrated` exists** — remove `.runner .credentials .credentials_rsaparams .runner_migrated .path` first.
- Registration tokens: `gh api -X POST repos/<org>/<repo>/actions/runners/registration-token` (**POST**, not GET).

## Home servers — git-push deploy

- Flow: `git push <server> master` → `~/deploy-hooks/post-receive` (symlinked from `~/repos/<proj>.git/hooks/`) → `~/apps/<proj>/releases/<ts>` + `current` symlink → Caddy imports `~/apps/*/current/Caddyfile`.
- acerpepe repos: belpolsim, brussel-jeu, nursultan-web (custom hook — force-checkout to `~/nursultan-web`, systemd `nursultan-backend`, rebuild frontends).
- liedelpi repos: belpolsim (mirror), nursultan-web (custom hook, full deployment).
- `just deploy-server <server>` / `just register-project <server> <name>`.
- belpolsim served at `https://acerpepe.bonobo-fort.ts.net:8081` and `http://100.127.61.2:8080` (Pi, direct port).

## Backup (liedelpi → acerpepe)

- Script: acerpepe `/data/backups/scripts/backup-pi.sh` (versioned in `dotfiles/scripts/home-server-deploy/backup-pi.sh`).
- Cron: `0 3 * * *` — hardlink-incremental daily snapshots (`/data/backups/pi/YYYY-MM-DD`), 30-day retention, Immich `pg_dumpall`. Failed snapshots are removed automatically; `latest` advances only after all stages succeed.
- The 1 TB acerpepe target intentionally excludes `~/media/movies` and `~/media/series` from nightly home snapshots. Kingston2TB remains the media archive/source; acerpepe backs up Docker configs, application data, and databases only.
- Acerpepe’s `/mnt/wd-blue` 500 GB disk is ext4 and mirrors the current published snapshot at `/mnt/wd-blue/backups/pi/latest`; the backup script refuses to write there unless it is mounted.
- Framearch critical data is backed up daily by the user timer `framearch-restic.timer` to the encrypted Restic repository `/data/backups/framearch-restic`, with a second encrypted mirror at `/mnt/wd-blue/backups/framearch-restic`. Weekly `framearch-restic-prune.timer` retains 7 daily, 4 weekly, and 6 monthly snapshots. It includes dotfiles, projects, documents, configs, SSH, and Pi state; caches, model data, build dependencies, and runner state are excluded. The password file is `~/.config/restic/framearch-acerpepe.password` and must also be stored in a password manager.
- **Fails loud**: exits non-zero and refuses to update `latest` unless the snapshot is complete. `latest` must always point at a real snapshot (Aug 2026 bug: silent 8-day outage produced empty shells).
- Uses `--rsync-path='sudo rsync'` (container data is root-owned) and excludes `data/portainer/` (regenerable runtime).
- Restore: rsync from `/data/backups/pi/latest/` back to the Pi.

## liedelpi quirks (learned the hard way — Aug 2026)

1. **k3s + Docker NAT hijack** ⚠️ — kube-router installs unscoped PREROUTING REDIRECTs for the `media/npm` k8s service (tcp 80/443 → NodePorts 32657/31884), which hijacks **all** Docker container egress on those ports → ECONNREFUSED everywhere. Fix + persistence: `/usr/local/sbin/scope-npm-redirects.sh` + `scope-npm-redirects.service` (re-scopes to `--dst-type LOCAL`). **If containers can't reach the internet, check `iptables -t nat -L PREROUTING` for unscoped REDIRECTs.**
2. **Media stack compose** lives at `~/docker/compose/media-stack/docker-compose.yml` (versioned in `dotfiles/scripts/home-server-deploy/media-stack.docker-compose.yml` — the original was lost; reconstructed from the Portainer snapshot). `~/docker/docker-compose.yml` aggregates via `include:`; the energy-dashboard include is commented out (runs in k8s instead).
3. **Portainer DB** (BoltDB at `~/Data/docker/data/portainer/portainer.db`) corrupts on unclean shutdown → crash-loop "failed opening store: timeout". Rescue: move DB aside, fresh init, re-add local endpoint. Not backed up (excluded — regenerable).
4. **Pi-hole** runs in k8s (`/data/k3s/pihole`), is the home DNS. AAAA records are NOT filtered — node/undici on IPv6-less networks can fail (use `NODE_OPTIONS=--dns-result-order=ipv4first` in builds).
5. Media library: `~/media/{movies,series}` (the `~/media/media/{movies,series}` symlinks → `/data/...` are broken leftovers). Downloads: `~/media/downloads`.
6. **Canonical media runtime:** Jellyfin, Sonarr, Radarr, Prowlarr, qBittorrent, and Jellyseerr run in Docker Compose (`~/docker`, project `docker`) and share the Docker config paths. Their duplicate k8s Deployments are intentionally scaled to zero. The `media` Services have no selectors and use manually managed EndpointSlices to fixed `media-net` addresses (`172.18.0.2`, `.4`, `.5`, `.10`, `.11`, `.12`); compose pins those addresses so recreation does not break NPM. Prowlarr has enabled full-sync application connections to Sonarr and Radarr; indexers remain a manual setup step.
7. Docker containers on `docker0` can show `linkdown` (cosmetic; custom bridges unaffected).

## Recovery quick-starts

### liedelpi media stack (if down)
```bash
ssh liedelpi
bash ~/docker/scripts/setup-networks.sh          # media-net, proxy-net
cd ~/docker && docker compose up -d              # brings up media-stack + immich + portainer + iptvnator
```
Then verify: `curl -s http://127.0.0.1:2283/api/server/ping` (Immich 200), container egress (`docker run --rm alpine:3.20 wget -q -O /dev/null https://registry.npmjs.org/pnpm`), and `.home` proxy routes (`curl -H 'Host: sonarr.home' http://192.168.1.138/`). Do not scale the duplicate media Deployments back up; NPM reaches the pinned Docker backends through the selectorless `media` Services.

### Backup catch-up
```bash
ssh acerpepe '/data/backups/scripts/backup-pi.sh'   # run manually; check /data/backups/scripts/backup-pi.log
```

### Throwaway dev containers (any home server)
```bash
just sandbox acerpepe up postgres:16-alpine     # tailnet-only port 31000-31999
just sandbox acerpepe down <name>
```

## Open items

- **Offsite photo copy (3-2-1)** — PIPELINE STAGED: rclone installed on liedelpi and `scripts/home-server-deploy/offsite-backup.sh` deployed (`~/scripts/offsite-backup.sh`, ntfy-alerted); DB dump verified. The weekly cron is intentionally disabled until a backend is chosen/configured. iCloud currently covers photos; future Immich growth may reach 600–800 GB, so choose capacity before enabling `ssh liedelpi 'rclone config'` (B2 / Drive / OneDrive / S3).
- Backup freshness alerting: DONE via ntfy (backup-pi.sh pings `ntfy.sh/juan-home-alerts-28e25a99` on success/failure). Kuma's own ntfy provider errors in its logs — cosmetic; the direct curl path bypasses it.
- Lenovos (Ideapad 100-15IBD ×2): planned CI node (Samsung 870 EVO) + backup/monitoring node. 10/100 NIC, 8 GB max DDR3L, 9 mm ODD caddy for second drive.
- Portainer on liedelpi: fresh DB after Aug-2026 rescue — re-login + re-add local endpoint needed.
