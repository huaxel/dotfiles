# Nushell interactive configuration

# Keep startup quiet and use the same editing style as Fish.
$env.config.show_banner = false
$env.config.edit_mode = "vi"
$env.config.history.file_format = "sqlite"
$env.config.history.max_size = 100_000
$env.config.history.isolation = false
$env.config.completions.case_sensitive = false

# Keep Nushell's structured output and syntax colors aligned with Ghostty's
# TokyoNight palette instead of relying on terminal-specific ANSI mappings.
let tn_fg = "#c0caf5"
let tn_muted = "#565f89"
let tn_blue = "#7aa2f7"
let tn_purple = "#bb9af7"
let tn_cyan = "#7dcfff"
let tn_green = "#9ece6a"
let tn_yellow = "#e0af68"
let tn_red = "#f7768e"
let tn_colors = {
    separator: $tn_muted
    leading_trailing_space_bg: {bg: "#414868"}
    header: {fg: $tn_cyan attr: b}
    datetime: $tn_purple
    filesize: $tn_cyan
    row_index: {fg: $tn_muted attr: b}
    bool: $tn_cyan
    int: {fg: $tn_purple attr: b}
    duration: $tn_yellow
    range: {fg: $tn_yellow attr: b}
    float: {fg: $tn_purple attr: b}
    string: $tn_green
    nothing: $tn_muted
    binary: $tn_cyan
    cell-path: $tn_blue
    hints: $tn_muted
    shape_block: {fg: $tn_blue attr: b}
    shape_bool: $tn_cyan
    shape_custom: {fg: $tn_purple attr: b}
    shape_external: $tn_cyan
    shape_externalarg: {fg: $tn_green attr: b}
    shape_filepath: $tn_blue
    shape_flag: {fg: $tn_blue attr: b}
    shape_float: {fg: $tn_purple attr: b}
    shape_garbage: {fg: $tn_fg bg: $tn_red attr: b}
    shape_globpattern: {fg: $tn_blue attr: b}
    shape_int: {fg: $tn_purple attr: b}
    shape_internalcall: {fg: $tn_cyan attr: b}
    shape_keyword: {fg: $tn_purple attr: b}
    shape_literal: $tn_blue
    shape_list: {fg: $tn_cyan attr: b}
    shape_matching_brackets: {fg: $tn_cyan attr: u}
    shape_nothing: $tn_muted
    shape_operator: $tn_yellow
    shape_pipe: {fg: $tn_purple attr: b}
    shape_range: {fg: $tn_yellow attr: b}
    shape_record: {fg: $tn_cyan attr: b}
    shape_signature: {fg: $tn_green attr: b}
    shape_string: $tn_green
    shape_string_interpolation: {fg: $tn_cyan attr: b}
    shape_table: {fg: $tn_blue attr: b}
    shape_variable: $tn_purple
    shape_vardecl: $tn_purple
    shape_external_resolved: {fg: $tn_yellow attr: b}
    shape_raw_string: $tn_purple
    shape_match_pattern: $tn_green
    search_result: {fg: $tn_fg bg: $tn_red}
}
$env.config.color_config = ($env.config.color_config | merge $tn_colors)

# Nushell needs generated files for shell integrations. They live outside the
# repository so each machine can use its installed tool versions. Run
# `just nushell-setup` (or scripts/setup-nushell.sh) after installing or
# upgrading these tools.
const starship_init = ($nu.cache-dir | path join "starship.nu")
const mise_init = ($nu.cache-dir | path join "mise.nu")
const zoxide_init = ($nu.cache-dir | path join "zoxide.nu")
const fzf_init = ($nu.cache-dir | path join "fzf.nu")
const atuin_init = ($nu.cache-dir | path join "atuin.nu")

const starship_source = (if ($starship_init | path exists) { $starship_init } else { null })
const mise_source = (if ($mise_init | path exists) { $mise_init } else { null })
const zoxide_source = (if ($zoxide_init | path exists) { $zoxide_init } else { null })
const fzf_source = (if ($fzf_init | path exists) { $fzf_init } else { null })
const atuin_source = (if ($atuin_init | path exists) { $atuin_init } else { null })

source $starship_source
source $mise_source
source $zoxide_source
source $fzf_source
source $atuin_source

# Fish semantics: atuin owns Ctrl-R for history search (its init does
# `bind ctrl-r _atuin_search`, replacing the default). Nushell's built-in
# history_menu also binds Ctrl-R, so null out its event to let atuin take
# over. Reedline ignores bindings whose event is null (documented in
# line_editor.html#removing-a-default-keybinding).
$env.config.keybindings = (
    $env.config.keybindings
    | each {|kb|
        if ($kb.name? | default "") == "history_menu" {
            $kb | upsert event null
        } else {
            $kb
        }
    }
)

# Modern replacements for externals that don't shadow Nushell builtins.
# Nu's own ls/open/find/ps/du/watch are structured and pipeline-friendly, so
# they stay intact.
alias ll = eza -la --icons=always
alias la = eza -a --icons=always
alias lt = eza --tree --icons=always
alias cat = bat --style=numbers,changes --theme=tokyonight_night
alias grep = rg
alias df = duf
alias top = btop

# Editors and common project tools.
alias v = nvim
alias vi = nvim
alias vim = nvim
alias g = git
alias gs = git status
alias gd = git diff
alias gds = git diff --staged
alias gc = git commit
alias gp = git push
alias gl = git log --oneline --graph --decorate
alias glg = git log --oneline --graph --decorate
alias j = just --justfile ($env.HOME | path join ".config/just/justfile")
alias m = mise
alias mr = mise run
alias ml = mise list
alias b = bun
alias bi = bun install
alias br = bun run
alias bx = bunx
alias ssh-mosh = mosh
alias ssh-tunnel = autossh -M 0 -N
alias pi-sudo = sudo -iu pi-agent PI_CODING_AGENT_DIR=($env.PI_CODING_AGENT_DIR) -- pi

# Cross-platform file opener (macOS `open`, Linux `xdg-open`), without
# shadowing Nu's structured `open` builtin.
def --env open-file [path: string] {
    if $nu.os-info.name == "macos" {
        ^open $path
    } else if $nu.os-info.name == "windows" {
        ^explorer.exe $path
    } else {
        ^xdg-open $path
    }
}
alias openf = open-file

# WSL interop.
if ("/proc/version" | path exists) and (^cat /proc/version | str contains "Microsoft") {
    alias explorer = explorer.exe
}
