# Nushell environment configuration
# Loaded before config.nu. Keep machine-specific secrets in
# ~/.config/secrets/env.nu, which is sourced when present.

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

# HuggingFace cache — use fast storage when available.
if ("/mnt/ai_models" | path exists) {
    $env.HF_HOME = "/mnt/ai_models"
    $env.HF_HUB_CACHE = "/mnt/ai_models/models"
}

# Keep mise quiet; its activation is loaded from config.nu.
$env.MISE_LOG_LEVEL = "error"

# Keep machine-specific secrets outside this repository. Source them manually
# from a local Nushell session when needed.
