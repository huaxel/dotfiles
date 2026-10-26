# Nushell environment configuration
# Loaded before config.nu. Shared non-secret defaults come from
# ~/.config/environment.d/10-dotfiles.conf (tracked source:
# config/environment.d/10-dotfiles.conf, deployed by home/common.nix) and
# machine-local secrets from 99-environment.conf (decrypted by sops-nix).
# On Linux systemd applies both files to user sessions; env.nu also parses
# them directly so Nushell gets the values on hosts without systemd (e.g.
# macOS). Keep those files to bare `KEY=value` lines — no quotes, no $VAR
# expansion — because this parser takes values literally while systemd would
# strip quotes and expand variables (the fish parser in config.fish has the
# same constraint).

# Nushell does not source Home Manager's POSIX session-variable script.
# Respect existing XDG overrides; these defaults keep tool caches portable.
$env.XDG_CONFIG_HOME = ($env.XDG_CONFIG_HOME? | default ($env.HOME | path join ".config"))
$env.XDG_CACHE_HOME = ($env.XDG_CACHE_HOME? | default ($env.HOME | path join ".cache"))
$env.XDG_DATA_HOME = ($env.XDG_DATA_HOME? | default ($env.HOME | path join ".local" "share"))
$env.EZA_CONFIG_DIR = ($env.XDG_CONFIG_HOME | path join "eza")
$env.MANPAGER = "sh -c 'col -bx | bat -l man -p --theme=tokyonight_night'"
# LLAMA_*/MEMORYFIELD_* arrive via 10-dotfiles.conf (see header). $HOME-
# derived paths below can't live in that file (no $VAR expansion there).
$env.PYTHONPYCACHEPREFIX = ($env.HOME | path join ".cache/cpython")
$env.PI_CODING_AGENT_DIR = ($env.HOME | path join "dotfiles/pi/agent")
$env.PI_CODING_AGENT_SESSION_DIR = ($env.HOME | path join "dotfiles/pi/agent/sessions")
$env.PRIME_AGENT_CODING_AGENT_DIR = ($env.HOME | path join "prime-agent/agent")
$env.BUN_INSTALL = ($env.HOME | path join ".bun")
$env.JUST_GLOBAL_JUSTFILE = ($env.HOME | path join ".config/just/justfile")

# fzf defaults, matching the Fish setup (parity enforced by
# scripts/tests/shell-env-parity.test.py; values stay here because spaces and
# quotes are illegal in the shared environment.d files).
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

# ATOM_DATA_ROOT mirrors each machine's Home Manager module. Keep host-specific
# paths here because Nushell does not source hm-session-vars.sh on its own.
let hostname_short = (hostname -s | str trim)
if $hostname_short == "arch-wsl" {
    $env.ATOM_DATA_ROOT = "/mnt/c/Users/jbenjumeamoreno/atom-data"
} else if $hostname_short == "mac-juan" {
    $env.ATOM_DATA_ROOT = "/Volumes/arch-wsl/mnt/c/Users/jbenjumeamoreno/atom-data"
}

# HuggingFace cache — use fast storage when available.
if ("/mnt/ai_models" | path exists) {
    $env.HF_HOME = "/mnt/ai_models"
    $env.HF_HUB_CACHE = "/mnt/ai_models/models"
}

# Keep machine-specific secrets outside this repository. Treat the
# environment.d files as authoritative: remember their previously managed key
# names (never values), remove those inherited variables, then load the current
# assignments. This lets adding/removing any key in either file take effect on
# `exec nu` without disturbing unrelated environment variables. Later files
# win on duplicate keys, matching systemd directory semantics.
let env_files = (["10-dotfiles.conf" "99-environment.conf"]
    | each { |name| $env.XDG_CONFIG_HOME | path join "environment.d" $name }
    | where { |p| $p | path exists })
let managed_names_file = ($env.XDG_CACHE_HOME | path join "nushell" "environment.d-managed-keys")
let previous_secret_names = if ($managed_names_file | path exists) {
    open --raw $managed_names_file | lines | where { |name| $name | is-not-empty }
} else { [] }
# Commented-out `KEY=` lines name keys these files used to assign. Inherited
# copies of such retired keys (and of keys loaded on a previous start, per the
# manifest) must not survive a shell start: a parent process launched before
# an edit keeps the stale value in memory and passes it down to children.
let retired_secret_names = if ($env_files | is-not-empty) {
    $env_files
    | each { |f|
        open --raw $f
        | lines
        | each { |line| $line | str trim }
        | where { |line| $line | str starts-with "#" }
        | each { |line| $line | parse --regex '^#\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)=' }
        | flatten
    }
    | flatten
    | each { |row| $row.key }
} else { [] }
let inherited_secret_names = (($previous_secret_names | append $retired_secret_names | uniq)
    | where { |name| $name in ($env | columns) })
if ($inherited_secret_names | is-not-empty) {
    hide-env ...$inherited_secret_names
}
let secrets = if ($env_files | is-not-empty) {
    $env_files
    | each { |f|
        open --raw $f
        | lines
        | each { |line| $line | str trim }
        | where { |line| ($line | is-not-empty) and not ($line | str starts-with "#") }
        | each { |line| $line | parse --regex '^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$' }
        | flatten
    }
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
