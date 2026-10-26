#!/bin/bash
# liedelpi self backup (nightly 03:30 via juan crontab).
# Primary: /mnt/wd-blue/backups/pi (hardlink-incremental, 30-day retention).
# Secondary: full-history mirror to acerpepe:/data/backups/pi-mirror/.
# Fails loud: exits non-zero and refuses to update `latest` on any failure,
# so restore-from-latest always points at the last COMPLETE snapshot.
#
# Adapted from acerpepe's backup-pi.sh (which pulled over ssh); all sources
# are local now that the backup host IS liedelpi.

set -uo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/mnt/wd-blue/backups/pi}"
RUN_ID="$(date +%Y-%m-%dT%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${RUN_ID}"
LATEST_LINK="${BACKUP_ROOT}/latest"
LOG="${BACKUP_LOG:-/home/juan/logs/backup-pi.log}"
SECONDARY="${SECONDARY:-acerpepe:/data/backups/pi-mirror/}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)

FAILED=0
PUBLISHED=0

mkdir -p "${BACKUP_ROOT}" "$(dirname "${LOG}")"
exec 9>"${BACKUP_ROOT}/.backup.lock"
if ! flock -n 9; then
  echo "=== Backup skipped: another run holds the lock ($(date)) ===" >> "${LOG}"
  exit 1
fi
if [ -e "${BACKUP_DIR}" ]; then
  echo "=== Backup failed: snapshot already exists: ${BACKUP_DIR} ===" >> "${LOG}"
  exit 1
fi
mkdir -p "${BACKUP_DIR}"

# shellcheck disable=SC2329 # Invoked by trap.
cleanup() {
  if [ "${PUBLISHED}" -eq 0 ] && [ -d "${BACKUP_DIR}" ]; then
    sudo rm -rf -- "${BACKUP_DIR}"
    echo "Removed incomplete snapshot: ${BACKUP_DIR}" >> "${LOG}"
  fi
}
trap cleanup EXIT HUP INT TERM

echo "=== Backup started: $(date) (host: $(hostname)) ===" >> "${LOG}"

# Primary must be the mounted WD Blue; never fill the root FS.
if ! mountpoint -q /mnt/wd-blue; then
  echo "⚠️  FAILURE: primary disk not mounted at /mnt/wd-blue" >> "${LOG}"
  exit 1
fi

# 1. Docker compose files and configs.
echo "Backing up Docker configs..." >> "${LOG}"
# Privileged read (root-owned container state); ownership normalized below.
sudo rsync -a --delete \
  /home/juan/docker/ \
  --exclude='data/portainer/' \
  "${BACKUP_DIR}/docker-configs/" \
  --link-dest="${LATEST_LINK}/docker-configs" 2>>"${LOG}" || FAILED=1

# 2. Pi-hole config (root-owned).
echo "Backing up Pi-hole..." >> "${LOG}"
sudo rsync -a --delete \
  /data/k3s/pihole/ \
  "${BACKUP_DIR}/pihole/" \
  --link-dest="${LATEST_LINK}/pihole" 2>>"${LOG}" || FAILED=1

# 3. Docker compose files and configs from /home/juan/Data.
echo "Backing up Data dir..." >> "${LOG}"
# Privileged read (root-owned container state); ownership normalized below.
sudo rsync -a --delete \
  /home/juan/Data/docker/ \
  --exclude='data/portainer/' \
  "${BACKUP_DIR}/data-docker/" \
  --link-dest="${LATEST_LINK}/data-docker" 2>>"${LOG}" || FAILED=1

# 4. Stream a consistent Immich PostgreSQL dump.
echo "Backing up databases..." >> "${LOG}"
if ! docker exec immich_postgres pg_dumpall -U root \
  > "${BACKUP_DIR}/immich-db.sql" 2>>"${LOG}"; then
  echo "Immich DB dump failed" >> "${LOG}"
  FAILED=1
elif [ ! -s "${BACKUP_DIR}/immich-db.sql" ]; then
  echo "Immich DB dump was empty" >> "${LOG}"
  FAILED=1
fi

# 5. Fresh compressed etcd snapshot + K3s server token/config.
echo "Backing up K3s etcd state..." >> "${LOG}"
if ! bash -s > "${BACKUP_DIR}/k3s-restore.tar" 2>>"${LOG}" <<'REMOTE_K3S'
set -euo pipefail
snapshot=""
cleanup() { [ -z "$snapshot" ] || sudo rm -f -- "$snapshot"; }
trap cleanup EXIT
sudo k3s etcd-snapshot save --name backup-pi --snapshot-compress >&2
snapshot=$(sudo find /var/lib/rancher/k3s/server/db/snapshots -maxdepth 1 -type f -name 'backup-pi-*' -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
[ -n "$snapshot" ] && sudo test -f "$snapshot"
files=("${snapshot#/}" var/lib/rancher/k3s/server/token)
[ ! -f /etc/rancher/k3s/config.yaml ] || files+=(etc/rancher/k3s/config.yaml)
sudo tar -C / -cf - "${files[@]}"
REMOTE_K3S
then
  echo "K3s restore bundle failed" >> "${LOG}"
  FAILED=1
elif [ ! -s "${BACKUP_DIR}/k3s-restore.tar" ]; then
  echo "K3s restore bundle was empty" >> "${LOG}"
  FAILED=1
fi

# 6. Home directory (excluding caches and large media files).
echo "Backing up home dir..." >> "${LOG}"
# Privileged read (container droppings may be root-owned); normalized below.
sudo rsync -a --delete \
  --exclude='.cache' --exclude='.npm' --exclude='.local' \
  --exclude='node_modules' --exclude='.cargo' --exclude='.rustup' \
  --exclude='.bun/install/cache/' --exclude='.codex/tmp/' \
  --exclude='actions-runner*/' --exclude='runner-bin/' \
  --exclude='Data/docker/data/portainer/' \
  --exclude='media/movies/' --exclude='media/series/' --exclude='media/downloads/' \
  /home/juan/ \
  "${BACKUP_DIR}/home/" \
  --link-dest="${LATEST_LINK}/home" 2>>"${LOG}" || FAILED=1

# Normalize ownership: privileged reads may create root-owned files, but
# snapshots must stay juan-owned for retention/cleanup and future --link-dest.
echo "Normalizing ownership..." >> "${LOG}"
if ! sudo chown -R juan: "${BACKUP_DIR}" 2>>"${LOG}"; then
  echo "ownership normalization failed" >> "${LOG}"
  FAILED=1
fi

# Publish atomically only when every primary stage succeeded and produced data.
if [ "${FAILED}" -eq 0 ] && [ -n "$(ls -A "${BACKUP_DIR}" 2>/dev/null)" ]; then
  pending_link="${LATEST_LINK}.new.$$"
  ln -s "${BACKUP_DIR}" "${pending_link}"
  mv -Tf "${pending_link}" "${LATEST_LINK}"
  PUBLISHED=1
  echo "latest -> ${BACKUP_DIR}" >> "${LOG}"
else
  echo "⚠️  FAILURE: latest NOT updated (still -> $(readlink "${LATEST_LINK}" 2>/dev/null || echo none))" >> "${LOG}"
fi

# Mirror the full history to the secondary on acerpepe.
# Refuse to write unless the target is reachable; never fail the primary.
if [ "${PUBLISHED}" -eq 1 ]; then
  if rsync -aH --delete -e "ssh ${SSH_OPTS[*]}" "${BACKUP_ROOT}/" "${SECONDARY}" 2>>"${LOG}"; then
    echo "secondary mirror -> ${SECONDARY}" >> "${LOG}"
  else
    echo "⚠️  FAILURE: secondary mirror failed" >> "${LOG}"
    FAILED=1
  fi
fi

# Remove old complete snapshots, but never delete the snapshot referenced by
# `latest`: it may be older than the retention window after prolonged failures.
LATEST_TARGET="$(readlink -f "${LATEST_LINK}" 2>/dev/null || true)"
while IFS= read -r -d '' old_snapshot; do
  if [ "${old_snapshot}" != "${LATEST_TARGET}" ]; then
    rm -rf -- "${old_snapshot}" || FAILED=1
  fi
done < <(find "${BACKUP_ROOT}" -maxdepth 1 -type d -name '????-??-??*' -mtime +30 -print0 2>>"${LOG}")

echo "=== Backup completed: $(date) ===" >> "${LOG}"
SIZE=""
if [ "${PUBLISHED}" -eq 1 ]; then
  SIZE="$(du -sh "${BACKUP_DIR}" | cut -f1)"
  echo "Size: ${SIZE}" >> "${LOG}"
fi

# Notify via ntfy when configured (best-effort; never affects the exit code).
NTFY_URL="${NTFY_URL:-}"
NTFY_URL_FILE="${NTFY_URL_FILE:-$HOME/.config/backup/ntfy-url}"
if [ -z "${NTFY_URL}" ] && [ -r "${NTFY_URL_FILE}" ]; then
  IFS= read -r NTFY_URL < "${NTFY_URL_FILE}" || true
fi
if [ "${FAILED}" -eq 0 ]; then
  MSG="Backup OK ${RUN_ID} (${SIZE})"
else
  MSG="Backup FAILED ${RUN_ID} - check ${LOG}"
fi
if [ -n "${NTFY_URL}" ]; then
  curl -sf -m 10 -H "Title: Pi backup" -d "${MSG}" "${NTFY_URL}" >/dev/null 2>&1 || true
fi

exit "${FAILED}"
