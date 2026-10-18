# Tailnet-only webservices: map + runbook

Goal (approved 2026-10-18): no more `localhost:PORT` — every service gets a
stable tailnet address, everything stays private to `bonobo-fort.ts.net`.
No public internet, no open ports, no Cloudflare Tunnel.

Conventions: **Caddy is the edge** on always-on hosts (liedelpi, acerpepe)
with the existing `import ~/apps/*/current/Caddyfile` pattern;
**`tailscale serve` is the edge** on framearch (interactive box, no Caddy).
New service = `register-project` + per-app Caddyfile (or a `tailscale
serve` line), then an uptime-kuma check on acerpepe. Port allocation:
append new services to the tables below — no two services share a port.

## Current map (observed 2026-10-18)

### framearch-juan (edge: `tailscale serve`)

| URL | Backend | State |
|---|---|---|
| `https://framearch-juan.../` | `127.0.0.1:8787` | SERVED (what is :8787 here? confirm) |
| `https://framearch-juan.../dashboard` | `127.0.0.1:8088` | SERVED |
| `tcp://framearch-juan...:3000` | `127.0.0.1:3000` | SERVED (which app? confirm) |
| — | `0.0.0.0:8000` llama-server | GAP 1: LAN-open, no tailnet name |
| — | tailscale-IP `:8001` llama-server | OK (already tailnet-bound) |
| — | `127.0.0.1:35523` llama-server | internal, leave |
| — | `0.0.0.0:3003,3006,3007,3008` mcp-bridges ×4 | GAP 2: LAN-open |
| — | `0.0.0.0:8501,8502` infra-refresher/fifa/wktrainer | GAP 3: LAN-open |
| — | `127.0.0.1:8088` (served, see above) | OK |

### liedelpi (edge: Caddy + `tailscale serve`)

| URL | Backend | State |
|---|---|---|
| `https://liedelpi.../` | `127.0.0.1:30080` (nursultan) | SERVED via tailscale |
| `http://100.127.61.2:8080` | `localhost:8080` (belpolsim, Caddy) | OK but plain HTTP — fine inside tailnet; upgrade to `https` + tailscale cert when touching it |
| k3s API/etcd `:1024x`, `:2379` localhost | k3s (contents unknown — `k3s.yaml` not user-readable) | OPEN QUESTION, see below |
| media stack (jellyfin/sonarr/…) | ports beyond line 25 of scan | TODO: complete the table |

### acerpepe (edge: Caddy with tailscale certs — the reference pattern)

| URL | Backend | State |
|---|---|---|
| `https://acerpepe...:8081` | belpolsim `:8081` | OK |
| `https://acerpepe...:8080` | brussel-jeu `:8080` dist | OK |
| `https://acerpepe...:30080`-equivalent nursultan block | `:8787` API + dist | OK (mirrors liedelpi) |
| tailscale-IP `:3001` (uptime-kuma, presumably) | docker | OK — this bind-to-tailscale-IP is the pattern to copy |

## Gaps to close (in order, each independently reversible)

1. **llama `:8000` (GAP 1).** `tailscale serve --https=8443 --set-path / http://127.0.0.1:8000`
   (or rebind llama to tailscale IP like `:8001`). Value: the Mac gets a
   stable inference endpoint, no model runs needed locally.
2. **mcp-bridges + infra-* on `0.0.0.0` (GAP 2+3).** Either bind to the
   tailscale IP in compose (`ports: ["100.116.127.30:3003:3003"]`) or keep
   `0.0.0.0` + add `tailscale serve` names. Decide per consumer: anything
   your phone/laptop uses without tailscaled running must stay LAN-open.
3. **k3s on liedelpi — ANSWERED 2026-10-18: it is a second live platform,
   not an experiment.** Namespaces/pods (all Running, ~51d old): energy
   (api+dashboard, hostPath `/home/juan/data/energy`), immich full stack
   (server/ml/microservices/redis/postgres PVC), media (iptvnator, minio,
   npm, stash-postgres ONLY), monitoring (grafana/prometheus/node-exporter),
   pihole, portainer, traefik. Edge: npm LoadBalancer owns LAN
   `192.168.1.138:80/443`; traefik has no ingresses.
   Duplication found: docker AND k3s both run immich (separate DBs,
   **shared** photo dir `/mnt/battle_disk/photos`); k3s has dead
   services for jellyfin/sonarr/radarr/qbit/jellyseerr/prowlarr (no pods
   — docker runs the real *arr stack); stash app lives in docker while
   its postgres twin sits pod-less in k3s. Owner calls needed: canonical
   immich (docker vs k3s), delete dead k3s media services, decide npm vs
   Caddy as LAN edge. Until then: do NOT add new workloads to either
   platform and do NOT remove k3s.
4. **Pi media table — COMPLETE 2026-10-18, staged ready-to-apply.**
   9 LAN-only UIs found (radarr 7878, jellyfin 8096, sonarr 8989,
   whisparr 6969, immich 2283, stash 9999, prowlarr 9696, jellyseerr
   5055, qbittorrent 8082). Exact Caddy blocks staged in
   `infra/selfhost/caddy-snippets.liedelpi` (Pi-local plain-HTTP
   pattern; one `caddy reload` away). TLS upgrade needs `tailscale
   cert` on liedelpi first (cert dir absent — acerpepe already has
   certs). :6881 torrent traffic stays 0.0.0.0, never proxied.

## Rules for new services (the fly.io UX, tailnet edition)

1. `register-project <name>` on the host that should run it (always-on =
   liedelpi/acerpepe; heavy/interactive = framearch).
2. Ship a per-app Caddyfile (or serve line) in the same commit as the
   service — no serve entry, no deploy.
3. `git push <host> main` deploys (existing post-receive hook).
4. Add an uptime-kuma monitor (acerpepe `:3001`) for the tailnet URL.
5. Never bind `0.0.0.0` by default; bind `127.0.0.1` + serve, or the
   tailscale IP directly.

## Status

- [x] Inventory + map + runbook (this file).
- [x] Backup restore proven 2026-10-18: Caddyfile restores
      bit-identical (`diff` clean); qbittorrent.conf (root-owned, PBKDF2
      hash inside) restorable. The backup is real, not hoped-for.
- [x] `/mnt` legacy-dirs incident 2026-10-18: archiving broke the live
      docker-immich + k3s-immich bind (`/mnt/battle_disk/photos`).
      Repaired with symlinks (`/mnt/*` → `~/backups/mnt-*`); both
      stacks restart-safe again. Lesson: grep ALL binds (docker +
      k3s hostPaths) before moving any path a container touches.
- [ ] Human decisions: GAP 1 serve port; GAP 2/3 bind-vs-serve per
      service; canonical immich; dead k3s media services; npm-vs-Caddy;
      belpolsim survivor; Pi media table completion.
- [ ] No serving state changed except the symlink repair above.
