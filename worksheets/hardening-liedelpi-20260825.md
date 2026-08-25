# liedelpi Service Hardening — 2026-08-25

## Goal
Audit and harden the remaining exposed services on liedelpi: Immich (2283), Portainer (9443/9000), IPTVnator (8185). Reduce WAN exposure while preserving `.home` proxy access.

## Context
- Previous work: LAN-bindings for jellyfin/sonarr/radarr/prowlarr/qbittorrent/jellyseerr (`aa487c7`) and whisparr/stash (`8747161`)
- qBittorrent 6881 stays public (torrent protocol requirement)
- Backup: Acerpepe healthy (40 GB primary, 71 GB encrypted framearch mirror)

## Changes Made

### Immich (2283)
- **Docker**: `2283:2283` → `192.168.1.138:2283:2283` (LAN-bound)
- **k3s**: `immich-server` Service: `NodePort` → `ClusterIP`, removed nodePort 30462
- **NPM**: `immich.home` proxy remains, points at `192.168.1.138:2283`
- **Discovery**: Dual-runtime found — k3s `immich` namespace has 5 pods (same as Docker). NPM proxy uses k3s ClusterIP.

### Portainer (9000 + 9443)
- **Docker**: `0.0.0.0:9000:9000` + `0.0.0.0:9443:9443` → `192.168.1.138:9000:9000`, dropped 9443 entirely
- **k3s**: `portainer` Service: `NodePort` → `ClusterIP`, removed nodePorts 32545/32357
- **NPM**: `portainer.home` re-pointed from Docker `192.168.1.138:9000` to `portainer.portainer.svc.cluster.local:9000`
- **Bug found**: Portainer CE returns 307 to `/timeout.html` when Host header doesn't match origin. NPM proxy via Docker fails; via k3s ClusterIP succeeds.

### IPTVnator (8185)
- **Docker**: Container stopped and removed from compose aggregator (`# - compose/iptvnator/docker-compose.yml`)
- **k3s**: `iptvnator` Service: `NodePort` → `ClusterIP`, removed nodePort 30492
- **NPM**: Added new proxy host `iptvnator.home` → `iptvnator.media.svc.cluster.local:8185`
- **Discovery**: Dual-runtime found — both Docker and k3s running identical `4gray/iptvnator:latest`. Consolidated on k3s.

## Verification
```
Host binds: 192.168.1.138:2283, 192.168.1.138:9000 (no 0.0.0.0)
k3s Services: all ClusterIP, no nodePort
NPM proxies: immich.home=200, portainer.home=200, iptvnator.home=200
Tailnet: 2283=000, 9000=000, 8185=000
```

## Rollback Anchor
- `/home/juan/k8s-media-consolidation-backup-20260825-074908/` — pre-consolidation k8s manifests for *arr stack

## Outstanding Items
- Dual-runtime consolidation (Immich, Portainer) — document but don't act
- Portainer Docker container still has 9443 internal listener (not published) — cosmetic
- `pi/agent/settings.json` uncommitted change (unrelated, pre-existing)

## Commit
- `6a6a9d1` docs(hardening): record liedelpi service hardening audit
- Pushed to `origin/main`
