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

## Remaining follow-ups

- Two pre-existing Pi extension files still produce non-blocking Deno lint
  warnings under `just ci`; one is Herdr-managed and should not be edited here.

## Validation

- `just ci` passed.
- Openference `npm run check` passed.
- Openference `npm test` passed with 2 tests.
- `dotter deploy --dry-run` and focused Dotter/secrets checks passed.
