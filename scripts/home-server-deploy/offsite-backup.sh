#!/usr/bin/env bash
# Offsite backup of Immich photos (+ DB dump) from liedelpi to an rclone remote.
#
# 3-2-1 rule: primary copy on liedelpi (NVMe) + on-site copy on acerpepe (nightly
# backup-pi.sh) + THIS offsite copy. Photos are the irreplaceable data.
#
# One-time setup on liedelpi:
#   ssh liedelpi 'rclone config'     # create a remote, then set RCLONE_REMOTE
#                                   # (default "offsite:"). Backend options:
#                                   #  - B2 (10GB free, ~$0.005/GB/mo after)
#                                   #  - Google Drive (15GB free) / OneDrive (student 1TB)
#                                   #  - any S3-compatible provider
#
# Run:  offsite-backup.sh           # from any machine (ssh's to liedelpi)
# Cron (on liedelpi): 0 4 * * 1 /home/juan/scripts/offsite-backup.sh  (weekly, after the 03:00 local backup)

set -uo pipefail

PI_HOST="${1:-liedelpi}"
NTFY_URL="${NTFY_URL:-https://ntfy.sh/juan-home-alerts-28e25a99}"
LOG="/tmp/offsite-backup.log"

echo "=== Offsite backup started: $(date) ===" > "${LOG}"

ssh "${PI_HOST}" 'bash -s' >> "${LOG}" 2>&1 <<'EOS'
set -euo pipefail
RCLONE_REMOTE="${RCLONE_REMOTE:-offsite:}"
PHOTOS="/mnt/battle_disk/photos"
TMP_DUMP="/tmp/immich-db-$(date +%Y%m%d).sql"

# 1. Fresh Immich DB dump (metadata; irreplaceable alongside the photos)
docker exec immich_postgres pg_dumpall -U root > "${TMP_DUMP}" 2>/dev/null

# 2. Sync photos (incremental) + dump to the offsite remote
rclone sync "${PHOTOS}" "${RCLONE_REMOTE}immich/photos" --stats 30s 2>&1 | tail -2
rclone copy "${TMP_DUMP}" "${RCLONE_REMOTE}immich/db/" 2>&1 | tail -1
rm -f "${TMP_DUMP}"

echo "photos synced: $(du -sh "${PHOTOS}" | cut -f1)"
EOS
RC=$?

if [ "${RC}" -eq 0 ]; then
  MSG="Offsite backup OK $(date +%Y-%m-%d)"
else
  MSG="Offsite backup FAILED - tail ${LOG}"
fi
curl -sf -m 10 -H "Title: Offsite backup" -d "${MSG}" "${NTFY_URL}" >/dev/null 2>&1 || true
exit "${RC}"
