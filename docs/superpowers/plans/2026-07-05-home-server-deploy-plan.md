# Home Server Deploy System — Implementation Plan

## Overview

Implement the git-push deploy system designed in
`docs/superpowers/specs/2026-07-05-home-server-deploy-design.md`.

## Phases

### Phase 0 — Bootstrap acerpepe

1. Install Caddy on acerpepe via official APT repo + `setcap`
2. Install Docker Compose plugin (if not present)
3. Enable `linger` for user systemd services
4. Create directory structure (`~/repos`, `~/apps`, `~/deploy-hooks`)
5. Start Caddy as a systemd user service with config (`admin 127.0.0.1:2019`,
   `auto_https off`, import pattern for per-project snippets)

### Phase 1 — Write the shared deploy hook

Write `~/deploy-hooks/post-receive` — a single bash script handling:
- Project type detection (docker-compose / docker / node-static / node-server /
  python / static)
- Checkout + build (npm install, npm build, uv sync, docker build, or copy)
- Release directory structure (`releases/<ts>/`, `current` symlink)
- Port allocation via `~/.port-registry.json` (external ports 8080–8999,
  internal ports 3000–3999)
- systemd service file generation for server apps
- Writing per-project Caddy snippet (binds to Tailscale IP + external port)
- Caddy reload (`caddy reload --config ~/Caddyfile`)
- Pruning old releases (keep last 5)

### Phase 2 — Write register-project script

A thin helper that runs on the server to onboard a new project:
```bash
register-project <project-name> [repo-dir]
```
Creates bare repo, symlinks hook, creates apps dir.

### Phase 3 — Write client-side helper

Add `justfile` recipes to your dotfiles:
```bash
just register-project acerpepe <project>   # onboard a project
just deploy-server acerpepe [branch]        # push and deploy
```

### Phase 4 — Test with real projects

| Test | Project | Type | What to verify |
|---|---|---|---|
| 1 | brussel-jeu | node-static | Build on server, serve static via Caddy |
| 2 | test-node-server | node-server | Install, run systemd service, proxy via Caddy |
| 3 | agentq (or minimal nginx) | docker/compose | Docker build + run behind Caddy |
| 4 | (future) | python | uv install, systemd service, proxy |

### Phase 5 — Bootstrap liedelpi (when online)

Same Phase 0 steps on liedelpi, plus:
- Rsync the shared hook and register-project script from acerpepe
- Test a deploy

## Delivery

By end of Phase 4 you have working:
- `git push acerpepe main` → project live at `http://acerpepe.bonobo-fort.ts.net:<port>`
- `just deploy-server acerpepe` → same thing from any project
- `just register-project acerpepe <name>` → onboard a new project in one step
