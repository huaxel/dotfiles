# Window Management Contract

One set of muscle memory, three implementations. This document is the
contract; `config-linux/niri/config.kdl` (framearch), OmniWM settings
(macbook), and the stock-Windows setup are implementations of it.
When adding or changing a bind, update all applicable implementations —
drift is a bug, and `desktop-lock` / `windows-wsl-config` tests guard the
machine-readable parts.

## Status

| Host | Compositor | State |
|---|---|---|
| framearch (Arch desktop) | niri | canonical |
| macbook (macOS) | OmniWM | canonical |
| arch-wsl (terminal-only) | none | no compositor mappings by design |
| Windows host | stock shell | tiling stack (GlazeWM + Zebar) removed 2026-10-26 |

Sway (Arch), aerospace (macOS), GlazeWM + Zebar (Windows) were removed
2026-10 in favor of this contract. Git history retains them; do not
re-add without reopening the decision.

## Keybindings (Alt on Linux, Option on macOS)

| Action | Linux (niri) | macOS (OmniWM) |
|---|---|---|
| Terminal | Alt+Return (ghostty) | configured in Ghostty/macOS |
| Close window | Alt+Q / Alt+W | (same in OmniWM) |
| Launcher | Alt+Space | Spotlight / app launcher |
| Focus left/down/up/right | Alt+HJKL or arrows | Option+arrows (+HJKL where mapped) |
| Move window left/down/up/right | Alt+Shift+HJKL or arrows | Option+Shift+arrows |
| Workspaces 1–9 | Alt+1..9 (0 = alias for 9) | Option+1..9 |
| Move to workspace | Alt+Shift+1..0 | Option+Shift+1..9 |
| Previous workspace | Alt+Tab | Option+Tab (back-and-forth) |
| Fullscreen | Alt+F | (same in OmniWM) |
| Maximize column | Alt+Shift+F | (same in OmniWM) |
| Lock screen | Alt+Shift+Apostrophe (`lock.sh`) | macOS lock |
| Power menu | Alt+Shift+X (wofi) | macOS UI |
| Clipboard history | Alt+Shift+V (cliphist+wofi) | macOS clipboard |
| File search | Alt+Shift+D (walker/files-search) | Spotlight / Finder |
| Bluetooth / Wi-Fi menus | Alt+B / Alt+Shift+W | macOS Control Center |

Terminal text editing (copy/paste/cut/undo/select-all) goes through
`wtype` Ctrl-emulation on Wayland (`Alt+C/V/X/Z/A`), native keys on macOS.

## Palette (TokyoNight canonical)

Base: fg `#c0caf5`, muted `#565f89`, blue `#7aa2f7`, cyan `#76cce0`,
purple `#bb9af7`, green `#9ece6a`, yellow `#e0af68`, red `#f7768e`,
backgrounds `#181819` / `#2c2e34`.

Known drift (do not propagate; unify toward the base when touching these):

- Waybar workspaces: near-white `#e2e2e3`, dim `#555555` (bar-local scale).
- Catppuccin strays: `#89b4fa` (blue), `#f9e2af`, `#f38ba8`, `#f39660`,
  `#fc5d7c`. Replace with the TokyoNight equivalents above.
- Background variants `#363944`, `#2d3436` alongside `#181819`/`#2c2e34`
  — pick one near-black per surface instead of adding a fifth.
- Lock screen uses Dracula `282a36` for the blank background only; the
  ring/text accents stay TokyoNight.

## Rules

1. New binds go here first, then into each implementation.
2. No host-specific modifier remapping — Alt/Option is the contract.
3. The launcher key (Alt/Space) always opens a *launcher*, never a
   terminal, editor, or menu directly.
4. Lock/power keys always use the host-native mechanism
   (`lock.sh`/loginctl on Linux, macOS UI on mac).
