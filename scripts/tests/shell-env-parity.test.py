#!/usr/bin/env python3
"""Parity between Nushell/Fish literals and the shared environment.d defaults.

Residual duplication that cannot live in environment.d/10-dotfiles.conf
(values with spaces/quotes, or $HOME-derived paths the literal parsers and
systemd cannot share) is kept in both shells on purpose. This test fails the
gate when those copies drift, and guards the dedup: keys owned by
10-dotfiles.conf must not be re-hardcoded in either shell or in
home/framearch.nix sessionVariables.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def parse_nu(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for match in re.finditer(r'^\$env\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$',
                             text, re.MULTILINE):
        name, raw = match.group(1), match.group(2).strip()
        if raw.startswith('"') and raw.endswith('"') and len(raw) >= 2:
            found[name] = raw[1:-1]
        else:
            found[name] = raw
    return found


def parse_fish(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for match in re.finditer(r'^\s*set\s+(?:--[a-z-]+|-[a-z]+)\s+'
                             r'([A-Za-z_][A-Za-z0-9_]*)\s+(.*?)\s*$',
                             text, re.MULTILINE):
        name, raw = match.group(1), match.group(2).strip()
        if raw.startswith('"') and raw.endswith('"') and len(raw) >= 2:
            found[name] = raw[1:-1]
        else:
            found[name] = raw
    return found


nu = parse_nu(read("config/nushell/env.nu"))
fish = parse_fish(read("config/fish/config.fish"))

# 1. Fish is a minimal stub: interactive-only literals (spaces/quotes) and
# $HOME-derived paths live in env.nu alone. The stub must not regrow them.
for key in ("FZF_DEFAULT_OPTS", "FZF_CTRL_T_OPTS", "FZF_CTRL_R_OPTS",
            "FZF_CTRL_R_COMMAND", "FZF_ALT_C_OPTS", "MANPAGER",
            "PYTHONPYCACHEPREFIX", "PI_CODING_AGENT_DIR",
            "PI_CODING_AGENT_SESSION_DIR", "PRIME_AGENT_CODING_AGENT_DIR",
            "BUN_INSTALL", "JUST_GLOBAL_JUSTFILE"):
    require(key in nu, f"env.nu no longer sets {key}")
    require(key not in fish,
            f"{key} re-added to the fish stub (belongs in env.nu only)")

# 2. The stub stays a stub: env loading + PATH only. No aliases, prompts,
# keybindings, or tool integrations — those live in config/nushell/.
fish_text = read("config/fish/config.fish")
for banned in ("alias ", "starship init", "atuin init", "fzf --fish",
                "zoxide init", "mise activate", "fish_vi_key_bindings",
                " abbreviation", "bind "):
    require(banned not in fish_text,
            f"fish stub regrew interactive setup: {banned!r}")
require("environment.d" in fish_text,
        "fish stub no longer loads the shared environment.d files")

# 3. Keys owned by 10-dotfiles.conf must not be re-hardcoded in the shells.
SHARED = ("LANG", "EDITOR", "VISUAL", "PAGER", "MISE_LOG_LEVEL",
          "LLAMA_BASE_URL", "MEMORYFIELD_EMBED_PROVIDER",
          "MEMORYFIELD_EMBED_URL", "MEMORYFIELD_EMBED_MODEL",
          "MEMORYFIELD_MODEL_CODE")
defaults = read("config/environment.d/10-dotfiles.conf")
for key in SHARED:
    require(re.search(rf"(?m)^{key}=", defaults) is not None,
            f"{key} missing from 10-dotfiles.conf")
    require(key not in nu, f"{key} re-hardcoded in env.nu (owned by 10-dotfiles.conf)")
    require(key not in fish, f"{key} re-hardcoded in config.fish (owned by 10-dotfiles.conf)")

# 4. The shared file obeys the literal-parser contract: bare KEY=value,
# no quotes, no $VAR expansion (both shell loaders take values literally).
for lineno, line in enumerate(defaults.splitlines(), start=1):
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        continue
    match = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_]*)=(.*)", stripped)
    require(match is not None,
            f"10-dotfiles.conf:{lineno} is not a bare KEY=value line: {stripped!r}")
    require('"' not in match.group(2) and "'" not in match.group(2)
            and "$" not in match.group(2),
            f"10-dotfiles.conf:{lineno} value needs quoting/expansion, "
            f"which the literal parsers cannot share: {stripped!r}")

# 5. The host module must not re-add the moved llama/memoryfield values.
framearch = read("home/framearch.nix")
for key in ("LLAMA_BASE_URL", "MEMORYFIELD_EMBED_PROVIDER",
            "MEMORYFIELD_EMBED_URL", "MEMORYFIELD_EMBED_MODEL",
            "MEMORYFIELD_MODEL_CODE"):
    require(re.search(rf"(?m)^\s*{key}\s*=", framearch) is None,
            f"{key} re-added to home/framearch.nix (owned by 10-dotfiles.conf)")

print("shell env parity checks passed")
