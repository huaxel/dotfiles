# Nushell environment configuration
# Loaded before config.nu. API keys and tokens reach this shell from the
# single secret source: ~/.config/environment.d/99-environment.conf (decrypted
# by sops-nix). On Linux systemd applies it to user sessions; env.nu also parses
# it directly so Nushell gets the keys on hosts without systemd (e.g. macOS).

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
        ($env.HOME | path join ".nix-profile" "bin")
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
let secrets_file = ($env.XDG_CONFIG_HOME | path join "environment.d" "99-environment.conf")
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
