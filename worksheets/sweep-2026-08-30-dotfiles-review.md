# Dotfiles Review: 2026-08-30

Scope: current `main` tree after `d0c295f`, with emphasis on bootstrap,
Dotter deployment, secrets, inference services, Windows profiles, and the
Openference package.

## Issues found and addressed

- Made secret checksum generation portable across Linux and macOS.
- Restricted the unauthenticated llama.cpp endpoints to loopback.
- Moved Llamaman configuration into the Linux-only Dotter package.
- Made host-specific `/etc` installation opt-in during generic bootstrap.
- Fixed the PowerShell `ll` argument-bearing alias.
- Removed the global `safe.directory = *` Git bypass.
- Corrected README contradictions about SSH symlinks and Pi OAuth state.
- Added Openference package typechecking configuration and catalog tests.
- Removed the macOS-only Aerospace mapping from the default package.
- Fixed Windows bootstrap output so backslashes form a valid TOML literal path.
- Updated CI to skip linting only the Herdr-owned generated integration.
- Bound the laptop llama.cpp override and stats bridge to loopback by default.
- Replaced a hardcoded home directory in Fish startup with `$HOME`.
- Made Unix and Windows secret decryption atomic so failed decrypts preserve the
  last valid plaintext; restricted the generic Unix secret directory to `0700`.
- Removed the published ntfy topic from backup scripts and made notifications
  require a host-local `NTFY_URL`.
- Added Windows bootstrap creation of the ignored npm source before Dotter deploy.
- Added a mode-0600 host-local notification file path so the rotated topic can
  be deployed without putting it in Git or encrypted dotfiles.
- Published non-sensitive verification notifications successfully from both
  backup hosts using the rotated topic.

## Remaining follow-ups

- The former ntfy topic remains in published Git history; retire it if the
  provider supports explicit topic deletion.
- The Herdr-owned integration remains intentionally exempt from repository lint;
  its syntax is still checked and Herdr may overwrite it during updates.

## Validation

- `just ci` passed.
- Openference `npm run check` passed.
- Openference `npm test` passed with 2 tests.
- `dotter deploy --dry-run` and focused Dotter/secrets checks passed.

## Commit sweep

Commits reviewed: `dae780a..f075599`.

- Commit messages are conventional and scoped; no fixup, WIP, binary, or secret
  additions were found.
- Behavior changes have corresponding documentation, tests, or CI coverage.
- An independent plan review correctly flagged the manual checksum example;
  it was hashing the encrypted file and storing the full utility output. The
  example now hashes the live plaintext and stores the bare digest expected by
  `.githooks/pre-commit`.

Clean bill: yes for tracked code and current backup-host configuration; retire
 the former notification topic if the provider supports explicit deletion.
