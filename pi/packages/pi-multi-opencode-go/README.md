# @juanbenjumea/pi-multi-opencode-go

Multi-account failover for Pi’s **`opencode-go`** provider. Rotates API keys using live dashboard usage (rolling / weekly / monthly), overrides `Authorization` per request, and persists cooldowns when limits hit.

Inspired by [pi-multicodex](https://pi.dev/packages/@victor-software-house/pi-multicodex) and [pi-multi-account](https://pi.dev/packages/pi-multi-account), but built for OpenCode Go workspace auth.

Dashboard HTML parsing lives in [`@juanbenjumea/opencode-go-usage`](../opencode-go-usage) (shared with `@juanbenjumea/pi-dynamic-footer`).

## Install

```bash
pi install npm:@juanbenjumea/pi-multi-opencode-go
/reload
```

From this monorepo (before publishing):

```bash
# settings.json packages entry (relative to pi/agent/settings.json):
# "../packages/pi-multi-opencode-go"
pi -e /path/to/dotfiles/pi/packages/pi-multi-opencode-go
```

## Requirements

- Node 20+
- `@earendil-works/pi-coding-agent` ≥ 0.80
- A primary `opencode-go` API key in `auth.json` (or env) so Pi passes its auth check; this extension overrides the header on each request.

Recommended in `settings.json`:

```json
{
  "retry": {
    "provider": { "maxRetries": 0 }
  }
}
```

## Configure accounts

**Environment (up to 8 slots):**

```bash
export OPENCODE_API_KEY_1="oc_..."
export OPENCODE_GO_WORKSPACE_ID_1="wrk_..."
export OPENCODE_GO_AUTH_COOKIE_1="Fe26.2**..."
export OPENCODE_GO_LABEL_1="sub-1"
```

**`~/.pi/agent/auth.json`:**

```json
{
  "opencode-go-failover": {
    "accounts": [
      {
        "label": "sub-1",
        "key": "$OPENCODE_API_KEY_1",
        "workspaceId": "$OPENCODE_GO_WORKSPACE_ID_1",
        "authCookie": "$OPENCODE_GO_AUTH_COOKIE_1"
      }
    ]
  }
}
```

If `workspaceId` / `authCookie` are omitted on an account, the extension falls back to `quota-status.opencode-go` (same shape as `@juanbenjumea/pi-dynamic-footer`).

Values support `$ENV`, `$$literal`, and `!command` (shell — use only if you trust your config).

## Commands

| Command | Description |
|---------|-------------|
| `/opencode-accounts` | Usage for all accounts |
| `/opencode-rotate` | Manual rotation |
| `/opencode-failover` | Status summary |
| `/opencode-failover reset` | Clear cooldowns |

## Companion extensions

Sets globals for footers and slot ladders:

- `__opencode_go_active_label` — active account label
- `__opencode_go_has_fallback` — another non-cooled account exists
- `__opencode_go_all_exhausted` — every account on cooldown

State: `~/.pi/agent/opencode-go-failover-state.json` (mode `0600`).  
Debug log: `~/.pi/agent/opencode-go-failover.log` (labels only, no secrets).

## Security

This extension reads OAuth-style cookies and API keys from your agent directory. Review the source before installing. Do not commit `auth.json` or state files.

## Publish

```bash
cd pi/packages/pi-multi-opencode-go
npm publish --access public
```

Then switch `settings.json` to `npm:@juanbenjumea/pi-multi-opencode-go@0.1.0`.

## License

MIT
