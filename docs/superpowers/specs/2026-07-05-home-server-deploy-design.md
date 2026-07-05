# Home Server Deploy System — Design Doc

## Overview

A git-push deployment system for two home Debian servers (`acerpepe` and `liedelpi`)
connected via a Tailscale tailnet (`bonobo-fort.ts.net`). Projects are pushed as
source, built server-side, and served via Caddy reverse proxy under MagicDNS
hostnames.

## Goals

- Deploy any web project (static, Node, Python, Docker) with `git push`
- Zero per-project config beyond source code (auto-detect project type)
- Access projects at `https://<project>.<server>.bonobo-fort.ts.net`
- Rollback to previous deploy by symlink swap
- Work identically on both servers

## Non-goals

- Public internet exposure (Tailscale tailnet only)
- Database provisioning / managed services
- Build caching / incremental builds
- CI/CD pipeline (no GitHub Actions, no webhooks)
- Multi-node orchestration (no Kubernetes, no Swarm)

## Architecture

```
┌──────────────────────────┐     git push       ┌──────────────────────────────┐
│  Dev machine              │ ──────────────────→│  Server (acerpepe / liedelpi) │
│  (any computer in         │                    │                              │
│   tailnet)                │                    │  ~/repos/<project>.git/      │
│                           │                    │    └─ hooks/post-receive     │
│  git remote add acerpepe  │                    │       (symlink to shared)    │
│  git push acerpepe main   │                    │                              │
└──────────────────────────┘                    │  ~/apps/<project>/            │
                                                 │    ├─ current/  (symlink)    │
                                                 │    └─ releases/<ts>/          │
                                                 │                              │
                                                 │  Caddy (reverse proxy)        │
                                                 │  listens :80/:443 on tailnet  │
                                                 │  └─ imports per-project       │
                                                 │     Caddyfile snippets        │
                                                 │                              │
                                                 │  systemd --user services      │
                                                 │  (for Node/Python apps)       │
                                                 └──────────────────────────────┘

Access via browser:
  https://<project>.acerpepe.bonobo-fort.ts.net
  https://<project>.liedelpi.bonobo-fort.ts.net
```

## Server setup (one-time per server)

### Prerequisites

These steps assume the server has:
- Debian 13+ with SSH access
- Tailscale installed and connected to the tailnet
- `juan` user with sudo-less access to:
  - `git`, `curl`, `docker` (if Docker-based projects are used)
  - Own home directory

### Install Caddy

```bash
# From the Caddy download page
curl -fsSL https://github.com/caddyserver/caddy/releases/latest/download/caddy_linux_amd64.tar.gz \
  | tar -xz caddy
sudo mv caddy /usr/local/bin/
sudo setcap cap_net_bind_service=+ep /usr/local/bin/caddy
```

No systemd unit for Caddy needed — we'll run it as a user process via systemd
`--user` or let it restart automatically. The `setcap` allows binding to
low ports (80, 443) as a non-root user.

### Create directory structure

```bash
mkdir -p ~/repos ~/apps ~/deploy-hooks
```

### Enable `linger` for user systemd services

```bash
sudo loginctl enable-linger juan
```

This allows systemd user services to survive logout.

## Shared deploy hook

A single bash script at `~/deploy-hooks/post-receive` is symlinked into every
bare repo's `hooks/` directory. It handles all project types via auto-detection.

### Hook flow

1. Read the ref being pushed (only act on `main`/`master` branch pushes)
2. Extract project name from the repo directory name (`<name>.git`)
3. Checkout pushed branch to a temp working directory
4. **Detect project type** (first match wins):
   - `docker-compose.yml` present → **Docker-compose mode**
   - `Dockerfile` present → **Docker mode** (build image, run container)
   - `package.json` present → **Node mode**
     - If `vite` / `svelte` / `astro` / `next` in devDependencies → **Static** (build to `dist/`)
     - Else → **Server** (npm install, run via systemd)
   - `pyproject.toml` present → **Python server mode** (uv install, run via systemd)
   - Otherwise → **Raw static mode** (copy files as-is, serve by Caddy)
5. **Build** (install deps, run build command, etc.)
6. **Install** to `~/apps/<project>/releases/<timestamp>/`
7. **Symlink** `~/apps/<project>/current` → `releases/<timestamp>/`
8. **Start/restart** the process:
   - Docker-compose mode: `docker compose up -d`
   - Docker mode: stop old container, start new one
   - Node/Python server mode: update and restart systemd user service
   - Static/raw mode: no process to restart
9. **Update Caddy config** for the project (write snippet, reload Caddy config)
10. **Prune old releases** (keep last 5)

### Detect script

```bash
detect_project_type() {
  local dir=$1
  if [ -f "$dir/docker-compose.yml" ]; then echo "docker-compose"; return; fi
  if [ -f "$dir/Dockerfile" ]; then echo "docker"; return; fi
  if [ -f "$dir/package.json" ]; then
    if grep -q '"vite"\|"svelte"\|"astro"\|"next"' "$dir/package.json" 2>/dev/null; then
      echo "node-static"
    else
      echo "node-server"
    fi
    return
  fi
  if [ -f "$dir/pyproject.toml" ]; then echo "python"; return; fi
  echo "static"
}
```

## Process management (systemd user services)

### Service file template

Each Node/Python server app gets a systemd user service file at
`~/.config/systemd/user/<project>.service`:

```ini
[Unit]
Description=<project> web server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/juan/apps/<project>/current
ExecStart=/usr/bin/node /home/juan/apps/<project>/current/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=0  # auto-assign below

[Install]
WantedBy=default.target
```

### Port allocation

To avoid conflicts, each app is assigned a unique port. The hook maintains
a port registry at `~/apps/.port-registry.json` mapping project names to ports.

| Project type | Port range | Example |
|---|---|---|
| Node/Python server apps | 3000–3999 | `brussel-jeu`: 3001, `nursultan-web`: 3002 |
| Docker apps | 4000–4999 | `agentq`: 4001, `pokemon-felix`: 4002 |

On first deploy, the hook finds the next available port in the appropriate
range and assigns it. The port is passed to the app via environment variable
(`PORT`) or by writing a `.env` file in the release directory.

```json
// ~/apps/.port-registry.json example
{
  "brussel-jeu": 3001,
  "nursultan-web": 3002,
  "tourmanager": 3003,
  "agentq": 4001,
  "pokemon-felix": 4002
}
```

### Caddy config integration

### Caddy main config

Caddy's main config file (`~/Caddyfile`) binds to the Tailscale interface
only (MagicDNS domain) and includes per-project snippets:

```
{
    admin off
    # Bind to the tailnet IP so Caddy is not reachable from outside.
    # Replace with the server's Tailscale IP (100.x.x.x).
    default_bind 100.121.136.112
}

import /home/juan/apps/*/current/Caddyfile
```

On first bootstrap, the hook detects the server's Tailscale IP and writes
this config automatically.

Each deploy hook writes a Caddy snippet to
`~/apps/<project>/current/Caddyfile`. Examples:

**Static site (Node static or raw):**
```
brussel-jeu.acerpepe.bonobo-fort.ts.net {
    root * /home/juan/apps/brussel-jeu/current/dist
    file_server
    encode gzip
}
```

**Node/Python server:**
```
nursultan-web.acerpepe.bonobo-fort.ts.net {
    reverse_proxy localhost:3002
    encode gzip
}
```

**Docker app (container published on a port):**
```
agentq.acerpepe.bonobo-fort.ts.net {
    reverse_proxy localhost:4001
    encode gzip
}
```

After writing the snippet, the hook sends `SIGHUP` to Caddy to reload config.

## Rollback

To rollback to a previous deploy:

```bash
# On the server
cd ~/apps/<project>
ln -sfn releases/<previous-timestamp> current

# Then restart if it's a server app
systemctl --user restart <project>
systemctl --user reload-or-restart caddy
```

The `releases/` directory keeps the last 5 deploys (pruned by the hook).

## Onboarding a new project

### Via SSH (one command to register)

You could automate this, but manually it's:

```bash
# On server
cd ~/repos
git init --bare <project>.git
ln -s ~/deploy-hooks/post-receive ~/repos/<project>.git/hooks/post-receive
cd ~/apps
mkdir -p <project>/releases

# On dev machine
cd ~/projects/<project>
git remote add acerpepe acerpepe:~/repos/<project>.git
git push acerpepe main
```

A `register-project` script could handle the server-side steps
(init bare repo + symlink hook + create apps dir + add tailscale serve config).

### The Procfile (optional)

If a project needs a non-default build or run command, it can include a `Procfile`
at the project root:

```
web: node server.js --port ${PORT}
build: npm run build
```

If no Procfile is found, the hook uses sensible defaults based on project type.

## Security considerations

- **Tailscale-only**: Caddy binds to the Tailscale interface IP only
  (`100.x.x.x` and `fd7a:...`), not `0.0.0.0`. No public exposure.
- **Tailscale HTTPS**: Caddy uses Tailscale's built-in TLS certs via
  `tailscale cert` or the MagicDNS HTTPS endpoint, avoiding Let's Encrypt rate
  limits and port forwarding.
- **User isolation**: All apps run as the `juan` user. For multi-tenant isolation,
  systemd dynamic users could be added later, but this is personal use.

## Implementation plan

1. Write the shared `post-receive` hook script
2. Write a `register-project` helper script
3. Write a `justfile` recipe for each server (`just deploy-acerpepe`, etc.) that
   does `git push acerpepe main` from the current project
4. Bootstrap acerpepe: install Caddy, create dirs, enable linger, start Caddy
5. Bootstrap liedelpi when it's online
6. Test with a static project (brussel-jeu)
7. Test with a Node server project (nursultan-web)
8. Test with a Docker project (pokemon-felix or agentq)
9. Write rollback + troubleshooting docs
