# Nushell environment configuration
# Loaded before config.nu. API keys and tokens reach this shell from the
# single secret source: ~/.config/environment.d/99-environment.conf (decrypted
# by sops-nix). On Linux systemd applies it to user sessions; env.nu also parses
# it directly so Nushell gets the keys on hosts without systemd (e.g. macOS).
# Keep that file to bare `KEY=value` lines — no quotes, no $VAR expansion —
# because this parser takes values literally while systemd would strip quotes
# and expand variables (the fish parser in config.fish has the same constraint).

$env.EDITOR = "nvim"
$env.VISUAL = "nvim"
$env.PAGER = "less"
# Respect existing XDG overrides; these defaults keep tool caches portable.
$env.XDG_CONFIG_HOME = ($env.XDG_CONFIG_HOME? | default ($env.HOME | path join ".config"))
$env.XDG_CACHE_HOME = ($env.XDG_CACHE_HOME? | default ($env.HOME | path join ".cache"))
$env.XDG_DATA_HOME = ($env.XDG_DATA_HOME? | default ($env.HOME | path join ".local" "share"))
$env.EZA_CONFIG_DIR = ($env.XDG_CONFIG_HOME | path join "eza")
$env.MANPAGER = "sh -c 'col -bx | bat -l man -p --theme=tokyonight_night'"
# These mirror home/framearch.nix sessionVariables on purpose: Home Manager
# exports them only to POSIX login shells (hm-session-vars.sh), which Nushell
# does not source. Keep values in sync when editing either location.
$env.LLAMA_BASE_URL = "http://127.0.0.1:8000"
# Memoryfield uses the dedicated llama.cpp embedding endpoint.
$env.MEMORYFIELD_EMBED_PROVIDER = "llama-server"
$env.MEMORYFIELD_EMBED_URL = "http://framearch-juan.bonobo-fort.ts.net:8001/v1/embeddings"
$env.MEMORYFIELD_EMBED_MODEL = "nomic-embed-text-v1.5"
$env.MEMORYFIELD_MODEL_CODE = "nomic-embed-text-v1.5"
$env.PYTHONPYCACHEPREFIX = ($env.HOME | path join ".cache/cpython")
$env.PI_CODING_AGENT_DIR = ($env.HOME | path join "dotfiles/pi/agent")
$env.PI_CODING_AGENT_SESSION_DIR = ($env.HOME | path join "dotfiles/pi/agent/sessions")
$env.PRIME_AGENT_CODING_AGENT_DIR = ($env.HOME | path join "prime-agent/agent")
$env.BUN_INSTALL = ($env.HOME | path join ".bun")
$env.JUST_GLOBAL_JUSTFILE = ($env.HOME | path join ".config/just/justfile")

# fzf defaults, matching the Fish setup.
$env.FZF_DEFAULT_OPTS = "--height 40% --layout=reverse --border --preview 'bat --color=always --style=numbers --line-range=:500 {}' --preview-window=right:60%"
$env.FZF_CTRL_T_OPTS = "--preview 'bat --color=always --style=numbers --line-range=:500 {}' --preview-window=right:60%"
$env.FZF_CTRL_R_OPTS = "--preview 'echo {}' --preview-window=up:3:hidden:wrap --bind 'ctrl-/:toggle-preview'"
# Atuin owns Ctrl-R for history; disable fzf's Ctrl-R binding.
$env.FZF_CTRL_R_COMMAND = ""
# Alt-C (cd into subdir) tree preview, matching Fish.
$env.FZF_ALT_C_OPTS = "--preview 'eza --tree --color=always --icons=always {} | head -200' --preview-window=right:60%"

$env.PATH = (
    $env.PATH
    | prepend [
        ($env.HOME | path join ".nix-profile" "bin")
        "/nix/var/nix/profiles/default/bin"
        ($env.HOME | path join ".local/bin")
        ($env.HOME | path join ".cargo/bin")
        ($env.HOME | path join ".opencode/bin")
        ($env.HOME | path join ".npm-global/bin")
        ($env.BUN_INSTALL | path join "bin")
        "/usr/local/bin"
    ]
    | uniq
)

# macOS additions, mirroring the Fish setup.
if $nu.os-info.name == "macos" {
    # Keep Home Manager's CLI profile first; Homebrew is for GUI and
    # macOS-integrated tools that are not provided by the profile.
    $env.PATH = ($env.PATH | append [
        "/opt/homebrew/bin"
        "/opt/homebrew/sbin"
        "/opt/local/bin"
        ($env.HOME | path join ".antigravity/antigravity/bin")
    ] | uniq)

    if ("/usr/local/share/dotnet" | path exists) {
        $env.PATH = ($env.PATH | prepend "/usr/local/share/dotnet")
        $env.DOTNET_ROOT = "/usr/local/share/dotnet"
    }
}

# ATOM_DATA_ROOT — per-machine data root for Project Atom.
if (hostname) == "arch-wsl" {
    $env.ATOM_DATA_ROOT = "/mnt/c/Users/jbenjumeamoreno/atom-data"
}

# HuggingFace cache — use fast storage when available.
if ("/mnt/ai_models" | path exists) {
    $env.HF_HOME = "/mnt/ai_models"
    $env.HF_HUB_CACHE = "/mnt/ai_models/models"
}

# Keep mise quiet; its activation is loaded from config.nu.
$env.MISE_LOG_LEVEL = "error"

# Keep machine-specific secrets outside this repository. Treat the decrypted
# environment.d file as authoritative: remember its previously managed key
# names (never values), remove those inherited variables, then load the current
# assignments. This lets adding/removing any key in the file take effect on
# `exec nu` without disturbing unrelated environment variables.
let secrets_file = ($env.XDG_CONFIG_HOME | path join "environment.d" "99-environment.conf")
let managed_names_file = ($env.XDG_CACHE_HOME | path join "nushell" "environment.d-managed-keys")
let previous_secret_names = if ($managed_names_file | path exists) {
    open --raw $managed_names_file | lines | where { |name| $name | is-not-empty }
} else { [] }
# Commented-out `KEY=` lines name keys this file used to assign. Inherited
# copies of such retired keys (and of keys loaded on a previous start, per the
# manifest) must not survive a shell start: a parent process launched before
# an edit keeps the stale value in memory and passes it down to children.
let retired_secret_names = if ($secrets_file | path exists) {
    open --raw $secrets_file
    | lines
    | each { |line| $line | str trim }
    | where { |line| $line | str starts-with "#" }
    | each { |line| $line | parse --regex '^#\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)=' }
    | flatten
    | get key
} else { [] }
let inherited_secret_names = (($previous_secret_names | append $retired_secret_names | uniq)
    | where { |name| $name in ($env | columns) })
if ($inherited_secret_names | is-not-empty) {
    hide-env ...$inherited_secret_names
}
let secrets = if ($secrets_file | path exists) {
    open --raw $secrets_file
    | lines
    | each { |line| $line | str trim }
    | where { |line| ($line | is-not-empty) and not ($line | str starts-with "#") }
    | each { |line| $line | parse --regex '^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$' }
    | flatten
    # upsert = last assignment wins, matching systemd and the fish loader;
    # insert would abort on a duplicated key.
    | reduce --fold {} { |row, acc| $acc | upsert $row.key $row.value }
} else { {} }
if ($secrets | columns | length) > 0 {
    load-env $secrets
}
mkdir ($managed_names_file | path dirname)
($secrets | columns | str join "\n") | save --force $managed_names_file
