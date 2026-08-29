# Nushell environment configuration
# Loaded before config.nu. API keys and tokens reach this shell via systemd
# environment.d (decrypted by dotter); fish-only secrets are in
# ~/.config/secrets/env.fish and are not sourced by Nushell.

$env.EDITOR = "nvim"
$env.VISUAL = "nvim"
$env.PAGER = "less"
$env.TERM = "xterm-256color"
$env.XDG_CONFIG_HOME = ($env.HOME | path join ".config")
$env.EZA_CONFIG_DIR = ($env.XDG_CONFIG_HOME | path join "eza")
$env.MANPAGER = "sh -c 'col -bx | bat -l man -p --theme=tokyonight_night'"
$env.LLAMA_BASE_URL = "http://127.0.0.1:8000"
$env.PYTHONPYCACHEPREFIX = ($env.HOME | path join ".cache/cpython")
$env.PI_CODING_AGENT_DIR = ($env.HOME | path join "dotfiles/pi/agent")
$env.PRIME_AGENT_CODING_AGENT_DIR = ($env.HOME | path join "dotfiles/prime-agent/agent")
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
    $env.PATH = ($env.PATH | prepend [
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

# Keep machine-specific secrets outside this repository. They reach this
# shell via systemd environment.d (~/.config/environment.d/). On Linux systemd
# applies that file to user sessions automatically; on hosts without systemd
# (e.g. macOS) parse it directly here so Nushell still gets the keys. Existing
# environment variables are never overridden.
let secrets_file = ($env.HOME | path join ".config" "environment.d" "99-environment.conf")
if ($secrets_file | path exists) {
    let secrets = (open --raw $secrets_file
        | lines
        | each { |l| $l | str trim }
        | where { |l| ($l | is-not-empty) and not ($l | str starts-with "#") }
        | each { |l| $l | parse --regex '^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$' }
        | flatten
        | where { |r| not ($r.key in ($env | columns)) }
        | reduce --fold {} { |r, acc| $acc | insert $r.key $r.value })
    if ($secrets | columns | length) > 0 {
        load-env $secrets
    }
}
