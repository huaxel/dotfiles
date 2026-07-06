# Home Server Deploy System — Design Doc

## Overview

A git-push deployment system for two home Debian servers (`acerpepe` and `liedelpi`)
connected via a Tailscale tailnet (`bonobo-fort.ts.net`). Projects are pushed as
source, built server-side, and served via Caddy reverse proxy on a unique port
per project.

## Goals

- Deploy any web project (static, Node, Python, Docker) with `git push`
- Zero per-project config beyond source code (auto-detect project type)
- Access projects at `http://<server>.bonobo-fort.ts.net:<port>` (each project gets a unique port)
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
                                                 │  listens on Tailscale IP per  │
                                                 │  project port                 │
                                                 │  └─ imports per-project       │
                                                 │     Caddyfile snippets        │
                                                 │                              │
                                                 │  systemd --user services      │
                                                 │  (for Node/Python apps)       │
                                                 └──────────────────────────────┘

Access via browser (example):
  http://acerpepe.bonobo-fort.ts.net:8080   # brussel-jeu
  http://acerpepe.bonobo-fort.ts.net:8082   # test-node-server
  http://liedelpi.bonobo-fort.ts.net:8080   # same project on second server
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
# Add the official Caddy APT repository
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
sudo setcap cap_net_bind_service=+ep /usr/bin/caddy
```

Caddy runs as a systemd user service (`caddy.service` under `systemctl --user`).
The `setcap` allows the binary to bind to any port as a non-root user.

### Install Docker Compose plugin (if using Docker projects)

```bash
mkdir -p ~/.docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 \
  -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose
docker compose version
```

### Create directory structure

```bash
mkdir -p ~/repos ~/apps ~/deploy-hooks
```

### Enable `linger` for user systemd services

```bash
sudo loginctl enable-linger juan
```

This allows systemd user services to survive logout.

### Caddy systemd user service

`~/.config/systemd/user/caddy.service`:

```ini
[Unit]
Description=Caddy reverse proxy
After=network.target tailscaled.service

[Service]
Type=simple
ExecStart=/usr/bin/caddy run --config /home/juan/Caddyfile
ExecReload=/usr/bin/caddy reload --config /home/juan/Caddyfile
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=default.target
```

Enable and start it with:
```bash
systemctl --user daemon-reload
systemctl --user enable --now caddy
```

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
     - If `vite` / `svelte` / `astro` / `next` in dependencies, or no `start`/`serve` script → **Static** (build to `dist/`)
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

Each project gets a unique **external port** (8080–8999) on which Caddy
listens on the Tailscale IP. Server apps (Node/Python) also get an
**internal port** (3000–3999) for the process itself; Caddy reverse-proxies
from the external port to the internal port. Docker apps publish directly on
the external port.

The hook maintains a port registry at `~/apps/.port-registry.json`:

```json
{
  "brussel-jeu": { "external": 8080 },
  "test-node-server": { "external": 8082, "internal": 3000 },
  "pokemon-felix": { "external": 8081 }
}
```

On first deploy, the hook finds the next free port in each range and assigns
it. The internal port is passed to the app via the `PORT` environment
variable.

### Caddy config integration

### Caddy main config

Caddy's main config file (`~/Caddyfile`) enables the local admin API for
reloads and imports per-project snippets. Each snippet binds to the server's
Tailscale IP on the project's external port.

```
{
    admin 127.0.0.1:2019
    auto_https off
}

import /home/juan/apps/*/current/Caddyfile
```

If a Tailscale HTTPS certificate is available for the server, snippets are
generated with `https://<hostname>:<port>` and explicit `tls` paths. If
not, they fall back to `http://<tailscale-ip>:<port>`.

Example generated snippet for a static site (with Tailscale cert):
```
https://acerpepe.bonobo-fort.ts.net:8080 {
    bind 100.121.136.112
    tls /home/juan/.config/tailscale/certs/acerpepe.bonobo-fort.ts.net.crt /home/juan/.config/tailscale/certs/acerpepe.bonobo-fort.ts.net.key
    root * /home/juan/apps/brussel-jeu/current/dist
    file_server
    encode gzip
}
```

Example generated snippet for a server app (without Tailscale cert):
```
http://100.121.136.112:8082 {
    bind 100.121.136.112
    reverse_proxy localhost:3000
    encode gzip
}
```

Each deploy hook writes a Caddy snippet to
`~/apps/<project>/current/Caddyfile`. Examples:

**Static site:**
```
http://100.121.136.112:8080 {
    bind 100.121.136.112
    root * /home/juan/apps/brussel-jeu/current/dist
    file_server
    encode gzip
}
```

**Node/Python server:**
```
http://100.121.136.112:8082 {
    bind 100.121.136.112
    reverse_proxy localhost:3000
    encode gzip
}
```

**Docker app:**
```
http://100.121.136.112:8081 {
    bind 100.121.136.112
    reverse_proxy localhost:8081
    encode gzip
}
```

After writing the snippet, the hook runs `caddy reload --config ~/Caddyfile`.

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

The `register-project` script handles the server-side steps
(init bare repo + symlink hook + create apps dir).

### The Procfile (optional)

If a project needs a non-default build or run command, it can include a `Procfile`
at the project root:

```
web: node server.js --port ${PORT}
build: npm run build
```

If no Procfile is found, the hook uses sensible defaults based on project type.

## Security considerations

- **Tailscale-only**: Each project Caddy snippet binds to the Tailscale IP only
  (`100.x.x.x`). Caddy does not listen on `0.0.0.0` or on the server's LAN IP.
  No public exposure.
- **HTTPS via Tailscale certs**: If a Tailscale certificate exists for the
  server's MagicDNS name, the hook configures Caddy to serve `https://` on
  each project's external port using that certificate. Tailscale traffic is
  already encrypted, but this gives browsers a valid TLS handshake. A weekly
  systemd timer renews the certificate and reloads Caddy.
- **User isolation**: All apps run as the `juan` user. For multi-tenant isolation,
  systemd dynamic users could be added later, but this is personal use.

## Implementation plan

1. Write the shared `post-receive` hook script
2. Write a `register-project` helper script
3. Write `justfile` recipes (`just register-project <server> <project>`,
   `just deploy-server <server> [branch]`)
4. Bootstrap acerpepe: install Caddy + Docker Compose plugin, create dirs,
   enable linger, start Caddy
5. Set up Tailscale HTTPS cert + weekly renewal timer
6. Bootstrap liedelpi when it's online
7. Test with a static project (brussel-jeu)
8. Test with a Node server project (test-node-server)
9. Test with a Docker project (minimal nginx compose)
10. Write rollback + troubleshooting docs
