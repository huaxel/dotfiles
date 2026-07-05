# Home Server Deploy System — Implementation Plan

## Overview

Implement the git-push deploy system designed in
`docs/superpowers/specs/2026-07-05-home-server-deploy-design.md`.

## Phases

### Phase 0 — Bootstrap acerpepe

1. Install Caddy on acerpepe (`curl` + `setcap`)
2. Enable `linger` for user systemd services
3. Create directory structure (`~/repos`, `~/apps`, `~/deploy-hooks`)
4. Start Caddy as a systemd user service with a basic config (tailnet IP bind,
   import pattern for per-project snippets)

### Phase 1 — Write the shared deploy hook

Write `~/deploy-hooks/post-receive` — a single bash script handling:
- Project type detection (docker-compose / docker / node-static / node-server /
  python / static)
- Checkout + build (npm install, npm build, uv sync, docker build, or copy)
- Release directory structure (`releases/<ts>/`, `current` symlink)
- Port allocation via `~/.port-registry.json`
- systemd service file generation for server apps
- Writing per-project Caddy snippet
- Caddy reload (SIGHUP)
- Pruning old releases (keep last 5)

### Phase 2 — Write register-project script

A thin helper that runs on the server to onboard a new project:
```bash
register-project <project-name> [repo-dir]
```
Creates bare repo, symlinks hook, creates apps dir.

### Phase 3 — Write client-side helper

Add a `justfile` recipe or `deploy` script to your dotfiles that makes
deploying from any project a single command:
```bash
just deploy acerpepe
```
This just runs `git push acerpepe main` from the current directory.

### Phase 4 — Test with real projects

| Test | Project | Type | What to verify |
|---|---|---|---|
| 1 | brussel-jeu | node-static | Build on server, serve static via Caddy |
| 2 | nursultan-web | node-server (monorepo) | Install, build, systemd service, proxy |
| 3 | pokemon-felix | docker | Docker compose build + run behind Caddy |
| 4 | tourmanager | python | uv install, systemd service, proxy |

### Phase 5 — Bootstrap liedelpi (when online)

Same Phase 0 steps on liedelpi, plus:
- Rsync the shared hook and register-project script from acerpepe
- Test a deploy

## Delivery

By end of Phase 4 you have working:
- `git push acerpepe main` → project live at `<project>.acerpepe.bonobo-fort.ts.net`
- `just deploy acerpepe` → same thing from any project
- `just register-project acerpepe <name>` → onboard a new project in one step
