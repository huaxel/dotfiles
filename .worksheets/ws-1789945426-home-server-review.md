# Home-server infrastructure review

## Task
Audit home-server deployment hooks, service ownership, network exposure, secrets, backups, recovery, and operational checks.

## Human notes

## Todos
- [x] Inventory server hosts, deployment paths, and service ownership
- [x] Inspect live reachability, listeners, firewall, updates, and storage
- [x] Audit deployment scripts for safety and rollback behavior
- [x] Audit backup and restore coverage
- [x] Implement safe high-value fixes and verification
- [x] Record host-only decisions and remaining risks

## Progress
- Started after the completed macOS audit from synchronized `main`.
- Restored nightly backups after a 23-day outage and deployed the corrected script to acerpepe with rollback copies.
- Published and byte-verified matching 14 GiB primary/secondary snapshots containing a fresh 44 MiB Immich SQL dump and K3s etcd restore bundle with server token.
- Reduced the secondary backup disk from 97% to 12% by excluding 455 GiB of replaceable downloads plus runner/cache state.
- Consolidated duplicate acerpepe Caddy processes onto the documented user service; verified all three served routes afterward.
- Deployed hardened shared post-receive and registration scripts to both servers with rollback copies; isolated deploy success/failure rollback tests pass.
- Corrected and digest-pinned the media Compose file, synced it without restarting healthy services, then restored Jellyfin and Radarr on collision-free addresses. All 15 documented `.home` proxy routes now return expected HTTP statuses.
- Hardened the staged offsite script without enabling its schedule or configuring a provider.
- Enabled unattended security updates on acerpepe and aligned liedelpi to `Europe/Brussels` with NTP synchronized.
- Completed a final adversarial pass: protected an old `latest` target from retention deletion, made signal-triggered deploy cleanup deterministic, stopped workloads after failed first deployments, validated sandbox names on every action, and checksum-verified runner downloads while keeping tokens out of SSH arguments.
- Re-synced the final backup and deploy hooks to both servers with rollback copies and matching SHA-256 hashes.
- Deleted the authorized 455 GiB stale snapshot, retired acerpepe from K3s with a `0600` root recovery archive, rebooted into kernel `6.12.107`, and verified the only remaining node plus all workloads are healthy on liedelpi.
- Verified all 15 documented `.home` routes after retirement/reboot and confirmed primary/secondary recovery snapshots both contain matching 45.6 MiB Immich dumps and 1.3 MiB K3s restore bundles.
- `just ci-strict` passes after all final changes. A separate reviewer agent was unavailable, and Antigravity denied read-only file/command access in both plan and sandbox modes; this limitation is recorded rather than claiming independent review.

## Findings
- **Resolved — 23-day silent backup outage.** `latest` had remained at 2026-08-29. Since Nushell is the remote login shell, Bash redirections in SSH command strings were passed literally to `pg_dumpall` and Kubernetes commands. The script now explicitly streams commands through remote Bash.
- **Resolved — published snapshots were mutable on same-day retries.** Date-only names reused the current `latest` directory. Runs now use second-resolution IDs, serialize with `flock`, clean partials via traps, atomically replace the `latest` symlink, and never expire the last known-good target even if it exceeds 30 days.
- **Resolved — Kubernetes export was not a disaster-recovery backup.** A `kubectl get all` YAML dump omitted cluster state and secrets. Each backup now creates a compressed etcd snapshot and archives it with the K3s server token/config.
- **Resolved — replaceable state exhausted backup capacity.** The home copy included 455 GiB of downloads and large CI/package caches. These are excluded; movies/series remain intentionally excluded. The fresh recovery set is 14 GiB.
- **Resolved — deployments were not transactional.** Project names allowed path traversal, multi-ref pushes could miss main, deleted refs checked out a zero SHA, concurrent deploys raced, Compose changed identity by release directory and tore down healthy containers first, Caddy failures were ignored, and failed symlink swaps had no rollback. Inputs are validated, deploys serialized, Compose identity stable, Caddy validated, and failed releases restore the previous target.
- **Resolved — LAN fallback violated the tailnet-only contract.** Bootstrap and deploy hooks no longer use `hostname -I`; they fail closed without a `100.x` Tailscale address.
- **Resolved — media configuration was unreproducible and malformed.** The tracked Jellyseerr port quote was missing and all images floated. It now parses and pins the exact running image digests.
- **Resolved — active Jellyfin/Radarr outage.** Immich dynamically occupied their old fixed Docker addresses `.4`/`.2`; both containers failed with “Address already in use.” They now use `.14`/`.13`, matching selectorless EndpointSlices and proxy routes.
- **Resolved — duplicate acerpepe reverse proxies.** User `caddy.service` and system `caddy-nursultan.service` ran the same Caddyfile and shared listeners. The custom system unit is disabled; the healthy lingering user unit is canonical.
- **Resolved — sandbox and runner input handling.** Sandbox SSH interpolation is validated for every action and maps the image's actual exposed port. Runner setup parses `--host`, passes short-lived tokens over stdin, checksum-verifies architecture-specific archives, installs the matching `just` build, validates remote inputs, and requires explicit removal confirmation.
- **Resolved — offsite deletion propagation.** The staged photo workflow now uses `rclone copy`, preflights source/remote, cleans DB dumps on failure, and avoids an unnecessary self-SSH hop on liedelpi. No offsite remote is configured and the schedule remains disabled.
- **Healthy — storage and disks.** SMART passes on all acerpepe drives and liedelpi NVMe. Current free space is ~123 GiB on `/data` and ~386 GiB on the secondary disk after repair.
- **Resolved — stale generated primary snapshot.** The authorized non-latest `/data/backups/pi/2026-09-21T085039` snapshot was removed; `/data` now has ~174 GiB free. The retention guard also protects whichever snapshot `latest` references.
- **Resolved — retired-but-registered K3s worker.** The authorized root-only recovery archive was created, stale node/pods were removed from liedelpi, and the supported K3s agent uninstall removed acerpepe's agent/runtime state. liedelpi is the only Ready control-plane node.
- **Unresolved — broad LAN/network exposure, intentionally unchanged.** liedelpi currently allows SSH, HTTP/HTTPS, Portainer, BitTorrent, K3s API, DNS, NFS, and numerous historical NodePorts from `Anywhere` in UFW, including IPv6; `/home/juan/media` is exported to `192.168.1.0/24` with `no_root_squash`; K3s etcd is listening on the LAN address. Per authorization, this baseline was measured but not modified.
- **Resolved — acerpepe reboot required.** After authorization, acerpepe rebooted cleanly into kernel `6.12.107+deb13-amd64`; Docker, unattended-upgrades, Tailscale, and the secondary backup mount are healthy. The K3s agent is absent as intended.
- **Unresolved — no offsite provider.** rclone has no configured remote; the weekly job intentionally remains disabled. On-site redundancy is restored but photos still rely on iCloud for the third copy.
- `ingester@quality.service` remains failed on acerpepe due application-level stale-data findings; this belongs to the nursultan-web project rather than dotfiles infrastructure.

## Decisions
- Back up configs, application data, databases, and cluster recovery state—not media downloads, media archives, CI runner worktrees, or regenerable caches.
- Preserve the user Caddy service on acerpepe and the custom system Caddy service on liedelpi; the canonical hook supports both and treats reload failure as fatal.
- Keep media web UIs LAN-bound and torrent port 6881 externally bound as currently documented. Per authorization, leave the broader NodePort/NFS/SSH/routed-firewall exposure unchanged for this review; do not silently tighten it.
- Do not enable offsite synchronization until a capacity-appropriate provider and preferably an rclone crypt remote are configured; this remains intentionally unconfigured after authorization.

## Questions / Next steps
- [x] Approve removal of the known bad 455 GiB primary snapshot.
- [x] Reboot acerpepe to activate the current kernel and deferred service updates.
- [x] Retire acerpepe from K3s and clean its orphaned runtime state.
- [x] Keep the current NodePort, NFS, SSH, and routed-firewall exposure unchanged for this review.
- [x] Keep the offsite backend unconfigured and weekly photo job disabled.
- [x] Run the strict project gate and attempt independent review; fix important findings (review agent unavailable/denied read-only access).
