# Dotter protected-target drift — 2026-08-24

## Goal
Stop recurring binary UTF-8 detection warnings without overwriting local npm,
Git, or llama.cpp configuration.

## Findings
- Maven JAR and wallpaper JPEG targets were already valid symlinks.
- `npmrc` is a machine-local regular file and may contain credentials.
- `gitconfig` differs by a local Git LFS block.
- `llama-models.ini` differs by machine-resolved model paths and local tuning.
- Dotter correctly skips those three unexpected targets unless `--force` is used.

## Changes
- Added explicit symbolic mappings for the JAR and JPEG in `.dotter/global.toml`.
- Documented safe handling of protected target divergence in `README.md`.

## Verification
- `dotter deploy --dry-run`: binary warnings gone; only protected local targets remain.
- `just ci`: passed; existing TypeScript lint diagnostics remain non-blocking.

## Follow-up
- Migrated `~/.npmrc` to the ignored root `.npmrc` and retained the symlink.
- Synced the Linux model template and Git LFS block with intentional local settings.
- `dotter deploy --dry-run` is now clean; no force overwrite was used.
