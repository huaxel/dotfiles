#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

assert_file() {
  if [ ! -f "$1" ]; then echo "expected file: $1" >&2; exit 1; fi
}
assert_absent() {
  if [ -e "$1" ]; then echo "expected absent: $1" >&2; exit 1; fi
}

# A complete backup includes canonical Pi sessions, excludes credentials, and
# writes its marker only after all strict copies succeed.
SOURCE_HOME="$TMP/source-home"
VOLUME="$TMP/volume with spaces"
mkdir -p "$SOURCE_HOME/.config/sops/age" "$SOURCE_HOME/dotfiles/pi/agent/sessions/project" "$VOLUME"
printf 'AGE-SECRET-KEY-test\n' > "$SOURCE_HOME/.config/sops/age/keys.txt"
printf 'session\n' > "$SOURCE_HOME/dotfiles/pi/agent/sessions/project/session.jsonl"
printf 'oauth-secret\n' > "$SOURCE_HOME/dotfiles/pi/agent/auth.json"

HOME="$SOURCE_HOME" BACKUP_VOLUME="$VOLUME" BACKUP_HOST=test BACKUP_DATE=20260920-1200 \
  DOTFILES_DIR="$SOURCE_HOME/dotfiles" PI_CODING_AGENT_DIR="$SOURCE_HOME/dotfiles/pi/agent" \
  bash "$ROOT/scripts/backup-to-kingston.sh" >/dev/null

BACKUP="$VOLUME/projects/backup-test-20260920-1200"
assert_file "$BACKUP/.backup-complete"
assert_file "$BACKUP/pi-dotfiles/sessions/project/session.jsonl"
assert_absent "$BACKUP/pi-dotfiles/auth.json"

# Restore uses portable lexical timestamp selection and restores canonical Pi
# state into the configured target.
RESTORE_HOME="$TMP/restore-home"
mkdir -p "$RESTORE_HOME/dotfiles"
HOME="$RESTORE_HOME" BACKUP_VOLUME="$VOLUME" DOTFILES_DIR="$RESTORE_HOME/dotfiles" \
  PI_CODING_AGENT_DIR="$RESTORE_HOME/dotfiles/pi/agent" \
  bash "$ROOT/scripts/restore-from-kingston.sh" >/dev/null
assert_file "$RESTORE_HOME/.config/sops/age/keys.txt"
assert_file "$RESTORE_HOME/dotfiles/pi/agent/sessions/project/session.jsonl"

# A newer incomplete backup must be refused rather than silently restored.
mkdir -p "$VOLUME/projects/backup-otherhost-20990101-0101"
touch -t 209901010101 "$VOLUME/projects/backup-otherhost-20990101-0101"
if HOME="$RESTORE_HOME" BACKUP_VOLUME="$VOLUME" DOTFILES_DIR="$RESTORE_HOME/dotfiles" \
  bash "$ROOT/scripts/restore-from-kingston.sh" >/dev/null 2>&1; then
  echo "restore accepted an incomplete backup" >&2
  exit 1
fi

# On macOS, an unencrypted destination is refused before any private key copy.
UNENCRYPTED_HOME="$TMP/unencrypted-home"
UNENCRYPTED_VOLUME="$TMP/unencrypted-volume"
UNENCRYPTED_BIN="$TMP/unencrypted-bin"
mkdir -p "$UNENCRYPTED_HOME/.config/sops/age" "$UNENCRYPTED_VOLUME" "$UNENCRYPTED_BIN"
printf 'AGE-SECRET-KEY-test\n' > "$UNENCRYPTED_HOME/.config/sops/age/keys.txt"
cat > "$UNENCRYPTED_BIN/uname" <<'MOCK'
#!/usr/bin/env bash
echo Darwin
MOCK
cat > "$UNENCRYPTED_BIN/df" <<'MOCK'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/mock 1000 10 990 1%% /Volumes/Test\n'
MOCK
cat > "$UNENCRYPTED_BIN/diskutil" <<'MOCK'
#!/usr/bin/env bash
printf '   Encrypted:                 No\n   FileVault:                 No\n'
MOCK
chmod +x "$UNENCRYPTED_BIN/uname" "$UNENCRYPTED_BIN/df" "$UNENCRYPTED_BIN/diskutil"
if HOME="$UNENCRYPTED_HOME" BACKUP_VOLUME="$UNENCRYPTED_VOLUME" BACKUP_HOST=test BACKUP_DATE=20260920-1350 \
  DOTFILES_DIR="$UNENCRYPTED_HOME/dotfiles" PATH="$UNENCRYPTED_BIN:$PATH" \
  bash "$ROOT/scripts/backup-to-kingston.sh" >/dev/null 2>&1; then
  echo "backup accepted an unencrypted destination" >&2
  exit 1
fi
assert_absent "$UNENCRYPTED_VOLUME/projects"

# A forged/stale completion marker without the required recovery key is refused.
MISSING_KEY_VOLUME="$TMP/missing-key-volume"
mkdir -p "$MISSING_KEY_VOLUME/projects/backup-test-20260920-1355"
touch "$MISSING_KEY_VOLUME/projects/backup-test-20260920-1355/.backup-complete"
if HOME="$RESTORE_HOME" BACKUP_VOLUME="$MISSING_KEY_VOLUME" DOTFILES_DIR="$RESTORE_HOME/dotfiles" \
  bash "$ROOT/scripts/restore-from-kingston.sh" >/dev/null 2>&1; then
  echo "restore accepted a marked backup without its Age key" >&2
  exit 1
fi

# Copy failure leaves no completion marker and exits non-zero.
FAIL_HOME="$TMP/fail-home"
FAIL_VOLUME="$TMP/fail-volume"
MOCK_BIN="$TMP/mock-bin"
mkdir -p "$FAIL_HOME/.config/sops/age" "$FAIL_HOME/.ssh" "$FAIL_VOLUME" "$MOCK_BIN"
printf 'AGE-SECRET-KEY-test\n' > "$FAIL_HOME/.config/sops/age/keys.txt"
printf 'key\n' > "$FAIL_HOME/.ssh/id_test"
cat > "$MOCK_BIN/rsync" <<'MOCK'
#!/usr/bin/env bash
exit 12
MOCK
chmod +x "$MOCK_BIN/rsync"
if HOME="$FAIL_HOME" BACKUP_VOLUME="$FAIL_VOLUME" BACKUP_HOST=test BACKUP_DATE=20260920-1400 \
  DOTFILES_DIR="$FAIL_HOME/dotfiles" PATH="$MOCK_BIN:$PATH" \
  bash "$ROOT/scripts/backup-to-kingston.sh" >/dev/null 2>&1; then
  echo "backup reported success after rsync failure" >&2
  exit 1
fi
assert_absent "$FAIL_VOLUME/projects/backup-test-20260920-1400/.backup-complete"

# Restore copy failures also produce a non-zero result instead of false success.
RESTORE_FAIL_VOLUME="$TMP/restore-fail-volume"
RESTORE_FAIL_HOME="$TMP/restore-fail-home"
RESTORE_FAIL_BIN="$TMP/restore-fail-bin"
RESTORE_FAIL_BACKUP="$RESTORE_FAIL_VOLUME/projects/backup-test-20260920-1500"
mkdir -p "$RESTORE_FAIL_BACKUP/keys" "$RESTORE_FAIL_BACKUP/pi-dotfiles/sessions" \
  "$RESTORE_FAIL_HOME" "$RESTORE_FAIL_BIN"
printf 'format=1\n' > "$RESTORE_FAIL_BACKUP/.backup-complete"
printf 'AGE-SECRET-KEY-test\n' > "$RESTORE_FAIL_BACKUP/keys/keys.txt"
printf 'session\n' > "$RESTORE_FAIL_BACKUP/pi-dotfiles/sessions/session.jsonl"
cat > "$RESTORE_FAIL_BIN/rsync" <<'MOCK'
#!/usr/bin/env bash
exit 12
MOCK
chmod +x "$RESTORE_FAIL_BIN/rsync"
if HOME="$RESTORE_FAIL_HOME" BACKUP_VOLUME="$RESTORE_FAIL_VOLUME" \
  DOTFILES_DIR="$RESTORE_FAIL_HOME/dotfiles" PATH="$RESTORE_FAIL_BIN:$PATH" \
  bash "$ROOT/scripts/restore-from-kingston.sh" >/dev/null 2>&1; then
  echo "restore reported success after rsync failure" >&2
  exit 1
fi

echo "recovery script tests passed"
