# ───────────────────────────────────────────────────────────────
# Minimal fallback shell. Nushell is the canonical interactive shell
# (login shell on all hosts); this file only keeps Fish usable when it is
# invoked explicitly on a host where Nushell is unavailable.
#
# It provides PATH + the shared environment and nothing else: no aliases,
# no keybindings, no tool integrations (atuin/fzf/zoxide/mise). For the
# full setup, run `nu`.
# ───────────────────────────────────────────────────────────────

set -g fish_greeting

# Prefer the Home Manager profile over distro copies.
fish_add_path --prepend --move $HOME/.nix-profile/bin
fish_add_path /nix/var/nix/profiles/default/bin
fish_add_path $HOME/.local/bin
fish_add_path $HOME/.cargo/bin
fish_add_path $HOME/.opencode/bin
fish_add_path $HOME/.npm-global/bin

if test (uname) = Darwin
    fish_add_path --append --move /opt/homebrew/bin
    fish_add_path --append --move /opt/homebrew/sbin
    if test -d /usr/local/share/dotnet
        fish_add_path --prepend /usr/local/share/dotnet
        set -gx DOTNET_ROOT /usr/local/share/dotnet
    end
end

# Shared env from environment.d (systemd provides these on Linux; parse
# directly elsewhere). Best-effort subset of env.nu: plain KEY=value only,
# no stale-key tracking — this is a fallback shell.
for env_file in ~/.config/environment.d/10-dotfiles.conf ~/.config/environment.d/99-environment.conf
    if test -f $env_file
        while read -l line
            set -l trimmed (string trim -- $line)
            if test -z "$trimmed"; or string match -q '#*' -- $trimmed
                continue
            end
            set -l kv (string match -r '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$' -- $trimmed)
            if test (count $kv) -ge 3
                set -gx $kv[2] $kv[3]
            end
        end < $env_file
    end
end
