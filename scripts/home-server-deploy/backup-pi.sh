#!/bin/bash
# Backup liedelpi → acerpepe (nightly 03:00 via cron).
# Hardlink-incremental snapshots with 30-day retention.
# Fails loud: exits non-zero and refuses to update `latest` on any failure,
# so restore-from-latest always points at the last COMPLETE snapshot.

BACKUP_ROOT="/data/backups/pi"
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="${BACKUP_ROOT}/${DATE}"
LATEST_LINK="${BACKUP_ROOT}/latest"
PI_HOST="100.127.61.2"
PI_USER="juan"
LOG="/data/backups/scripts/backup-pi.log"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

FAILED=0

mkdir -p "${BACKUP_DIR}"

echo "=== Backup started: $(date) ===" >> "${LOG}"

# 1. Backup Docker compose files and configs
echo "Backing up Docker configs..." >> "${LOG}"
rsync -a --delete -e "ssh ${SSH_OPTS}" \
  "${PI_USER}@${PI_HOST}:/home/juan/docker/" \
  "${BACKUP_DIR}/docker-configs/" \
  --link-dest="${LATEST_LINK}/docker-configs" 2>>"${LOG}" || FAILED=1

# 2. Backup Pi-hole config
echo "Backing up Pi-hole..." >> "${LOG}"
rsync -a --delete -e "ssh ${SSH_OPTS}" \
  "${PI_USER}@${PI_HOST}:/data/k3s/pihole/" \
  "${BACKUP_DIR}/pihole/" \
  --link-dest="${LATEST_LINK}/pihole" 2>>"${LOG}" || FAILED=1

# 3. Backup Docker compose files and configs from /home/juan/Data
echo "Backing up Data dir..." >> "${LOG}"
rsync -a --delete -e "ssh ${SSH_OPTS}" \
  "${PI_USER}@${PI_HOST}:/home/juan/Data/docker/" \
  "${BACKUP_DIR}/data-docker/" \
  --link-dest="${LATEST_LINK}/data-docker" 2>>"${LOG}" || FAILED=1

# 4. Backup important Docker volumes (dump DBs)
echo "Backing up databases..." >> "${LOG}"
if ! ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \
  'docker exec immich_postgres pg_dumpall -U root 2>/dev/null' \
  > "${BACKUP_DIR}/immich-db.sql" 2>>"${LOG}"; then
  echo "Immich DB dump failed (non-fatal)" >> "${LOG}"
  FAILED=1
fi

# 5. Backup K3s cluster state
echo "Backing up K3s state..." >> "${LOG}"
if ! ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \
  'sudo kubectl get all --all-namespaces -o yaml 2>/dev/null' \
  > "${BACKUP_DIR}/k3s-state.yaml" 2>>"${LOG}"; then
  echo "K3s state export failed (non-fatal)" >> "${LOG}"
  FAILED=1
fi

# 6. Backup home directory (excluding caches)
echo "Backing up home dir..." >> "${LOG}"
rsync -a --delete -e "ssh ${SSH_OPTS}" \
  --exclude='.cache' --exclude='.npm' --exclude='.local' \
  --exclude='node_modules' --exclude='.cargo' --exclude='.rustup' \
  "${PI_USER}@${PI_HOST}:/home/juan/" \
  "${BACKUP_DIR}/home/" \
  --link-dest="${LATEST_LINK}/home" 2>>"${LOG}" || FAILED=1

# Only advertise as `latest` when everything succeeded AND we have data.
if [ "${FAILED}" -eq 0 ] && [ -n "$(ls -A "${BACKUP_DIR}" 2>/dev/null)" ]; then
  rm -f "${LATEST_LINK}"
  ln -s "${BACKUP_DIR}" "${LATEST_LINK}"
  echo "latest -> ${BACKUP_DIR}" >> "${LOG}"
else
  echo "⚠️  FAILURE: latest NOT updated (still -> $(readlink "${LATEST_LINK}" 2>/dev/null || echo none))" >> "${LOG}"
  rmdir "${BACKUP_DIR}" 2>/dev/null || true
fi

# Remove any empty dated dirs left by failed runs.
find "${BACKUP_ROOT}" -maxdepth 1 -type d -name "????-??-??" -empty -delete 2>>"${LOG}"

# Cleanup backups older than 30 days
find "${BACKUP_ROOT}" -maxdepth 1 -type d -name "????-??-??" -mtime +30 -exec rm -rf {} \; 2>>"${LOG}"

echo "=== Backup completed: $(date) ===" >> "${LOG}"
if [ "${FAILED}" -eq 0 ]; then
  echo "Size: $(du -sh "${BACKUP_DIR}" | cut -f1)" >> "${LOG}"
fi
exit "${FAILED}"
