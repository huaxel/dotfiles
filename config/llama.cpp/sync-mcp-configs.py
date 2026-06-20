#!/usr/bin/env python3
"""Generate llama.cpp MCP config files from one canonical server list.

Source of truth:
  ~/.config/llama.cpp/mcp-servers.json

Generated files:
  ~/.config/llama.cpp/webui-config.json  (llama.cpp Web UI format)
  ~/.llama.cpp/mcp.json                  (generic MCP URL config)
"""

from __future__ import annotations

import json
import os
import re
import shlex
from pathlib import Path
from typing import Any

HOME = Path.home()
SOURCE = HOME / ".config" / "llama.cpp" / "mcp-servers.json"
WEBUI_CONFIG = HOME / ".config" / "llama.cpp" / "webui-config.json"
MCP_CONFIG = HOME / ".llama.cpp" / "mcp.json"
SECRETS_ENV = HOME / ".config" / "secrets" / "env.fish"
ENV_REF_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text())


def write_json_secure(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
    os.chmod(path, 0o600)


def load_fish_env(path: Path) -> dict[str, str]:
    """Parse simple `set -gx NAME value` fish secret files without executing them."""
    if not path.exists():
        return {}

    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or not stripped.startswith("set "):
            continue
        try:
            parts = shlex.split(stripped, comments=True, posix=True)
        except ValueError:
            continue
        if not parts or parts[0] != "set":
            continue

        args = parts[1:]
        while args and args[0].startswith("-"):
            args = args[1:]
        if len(args) < 2:
            continue

        name, values = args[0], args[1:]
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            env[name] = " ".join(values)
    return env


def expand_env_refs(value: Any, env: dict[str, str]) -> Any:
    if isinstance(value, str):
        def replace(match: re.Match[str]) -> str:
            name = match.group(1)
            if name not in env:
                raise KeyError(name)
            return env[name]

        return ENV_REF_RE.sub(replace, value)
    if isinstance(value, list):
        return [expand_env_refs(item, env) for item in value]
    if isinstance(value, dict):
        return {key: expand_env_refs(item, env) for key, item in value.items()}
    return value


def headers_for_mcp(headers: Any) -> dict[str, str] | None:
    if not headers:
        return None
    if isinstance(headers, dict):
        return {str(k): str(v) for k, v in headers.items()}
    if isinstance(headers, str):
        parsed = json.loads(headers)
        if isinstance(parsed, dict):
            return {str(k): str(v) for k, v in parsed.items()}
    raise TypeError("headers must be a JSON object or a JSON-encoded object string")


def main() -> None:
    servers = load_json(SOURCE, None)
    if not isinstance(servers, list):
        raise SystemExit(f"{SOURCE} must contain a JSON array")

    env = os.environ.copy()
    env.update(load_fish_env(SECRETS_ENV))
    try:
        expanded_servers = expand_env_refs(servers, env)
    except KeyError as exc:
        raise SystemExit(f"missing secret env var referenced by {SOURCE}: {exc.args[0]}") from exc

    webui = load_json(
        WEBUI_CONFIG,
        {
            "pyInterpreterEnabled": True,
            "showMessageStats": True,
            "theme": "dark",
        },
    )
    if not isinstance(webui, dict):
        raise SystemExit(f"{WEBUI_CONFIG} must contain a JSON object")

    # llama.cpp Web UI stores MCP servers as a JSON-encoded string inside the
    # broader UI settings object.
    webui["mcpServers"] = json.dumps(expanded_servers, separators=(",", ":"), ensure_ascii=False)
    write_json_secure(WEBUI_CONFIG, webui)

    # Generic URL-based MCP config. Only include fields broadly understood by
    # HTTP MCP clients; UI-only fields stay in the canonical source/webui config.
    mcp_servers: dict[str, dict[str, Any]] = {}
    for index, server in enumerate(expanded_servers):
        if not isinstance(server, dict):
            raise SystemExit(f"server entry #{index + 1} must be an object")
        if server.get("enabled") is False:
            continue
        server_id = str(server.get("id") or f"server-{index + 1}")
        url = server.get("url")
        if not isinstance(url, str) or not url.strip():
            raise SystemExit(f"server {server_id!r} is missing url")

        entry: dict[str, Any] = {"url": url.strip()}
        headers = headers_for_mcp(server.get("headers"))
        if headers:
            entry["headers"] = headers
        mcp_servers[server_id] = entry

    write_json_secure(MCP_CONFIG, {"mcpServers": mcp_servers})


if __name__ == "__main__":
    main()
