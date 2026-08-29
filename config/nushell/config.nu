# Nushell interactive configuration

# Keep startup quiet and use the same editing style as Fish.
$env.config.show_banner = false
$env.config.edit_mode = "vi"
$env.config.history.file_format = "sqlite"
$env.config.history.max_size = 100_000
$env.config.history.isolation = false
$env.config.completions.case_sensitive = false

# Nushell needs generated files for shell integrations. They live outside the
# repository so each machine can use its installed tool versions. Run
# `scripts/setup-nushell.sh` after installing or upgrading these tools.
const starship_init = ($nu.cache-dir | path join "starship.nu")
const mise_init = ($nu.cache-dir | path join "mise.nu")
const zoxide_init = ($nu.cache-dir | path join "zoxide.nu")
const fzf_init = ($nu.cache-dir | path join "fzf.nu")
const atuin_init = ($nu.home-dir | path join ".local/share/atuin/init.nu")

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

# Bang expansion, matching Fish's bind_bang/bind_dollar: !! repeats the last
# command, !$ expands to the last argument of the previous command. The
# binding fires on every ! keypress, so it only expands when the buffer is
# exactly !! or !$ — otherwise it inserts the literal ! (matching Fish, which
# checks the token under the cursor).
$env.config.keybindings ++= [
    {
        name: bang_expand
        modifier: none
        keycode: char_bang
        mode: [emacs, vi_insert]
        event: {
            send: executehostcommand
            cmd: "let buf = (commandline); if ($buf == '!!') { let last_cmd = (history | last 1 | get command_line? | default ''); if ($last_cmd | is-empty) { commandline edit --replace '' } else { commandline edit --replace $last_cmd } } else { commandline edit --insert '!' }"
        }
    }
    {
        name: dollar_expand
        modifier: none
        keycode: char_dollar
        mode: [emacs, vi_insert]
        event: {
            send: executehostcommand
            cmd: "let buf = (commandline); if ($buf == '!$') { let last_args = (history | last 1 | get command_line? | default '' | split row ' ' | last); commandline edit --replace $last_args } else { commandline edit --insert '$' }"
        }
    }
]

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

# Linux's equivalent of macOS `open`. Uses a wrapper function so `open file`
# opens a file without shadowing Nu's structured `open` builtin.
def --env open-file [path: string] { ^xdg-open $path }
alias openf = open-file

# WSL interop.
if ("/proc/version" | path exists) and (^cat /proc/version | str contains "Microsoft") {
    alias explorer = explorer.exe
}
