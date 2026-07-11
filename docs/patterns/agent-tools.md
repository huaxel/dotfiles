# Agent Tools (bin/)

A place for agents to build small scripts that make future sessions faster.
Every time you write a multi-step bash command more than once, extract it into
a script here.

## Location

Each project has a `bin/` dir (or uses `scripts/` if it already exists).
The dir is `$PATH`-adjacent through `./bin` or documented in the justfile.

## When to extract a script

- You run the same `curl | jq` pipeline twice in one session
- You type a 3+ step bash one-liner more than once
- You write a multi-line shell function in-line
- A debugging command sequence would help future agents

## How to build one

```bash
#!/usr/bin/env bash
set -euo pipefail

# Description: what this does, what it needs
# Usage: bin/script-name [args]

echo "doing the thing..."
```

Requirements:
1. Shebang (`#!/usr/bin/env bash` or `python3`)
2. `set -euo pipefail` for bash scripts
3. One-line description at the top
4. Usage example in a comment

## Convention

- Name is kebab-case and self-documenting (`check-deployed-version`, not `cdv`)
- If it's a `just` recipe candidate instead, add it to the justfile
- If it's project-generic, put it in `$HOME/dotfiles/scripts/` instead
