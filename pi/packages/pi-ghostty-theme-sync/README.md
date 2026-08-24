# @juanbenjumea/pi-ghostty-theme-sync

Fork of [`@ogulcancelik/pi-ghostty-theme-sync`](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-ghostty-theme-sync) by Can Celik.

Syncs the pi TUI theme with the active Ghostty terminal palette on every `session_start`, deriving the pi color tokens from Ghostty's `background`, `foreground`, and 16-color `palette`.

## Why this fork

The upstream extension's `generatePiTheme()` never emits a `scrollbarThumb` token, so pi falls back to `selectedBg` — which on low-contrast palettes (e.g. Tokyo-Night: bg `#1a1b26`, `selectedBg` ≈ `#262732`) makes the fullscreen scrollbar effectively invisible.

This fork derives a dedicated `scrollbarThumb` from `fg`/`bg`:

```ts
scrollbarThumb: mixColors(fg, bg, isDark ? 0.55 : 0.5)
```

so the regenerated theme always has a visible thumb regardless of the Ghostty palette.

The generator also keeps the UI hierarchy stable across terminals:

- Uses the synchronized foreground explicitly for messages, search matches, and code blocks.
- Gives tool titles the accent color while keeping tool output secondary but readable on tinted surfaces.
- Keeps semantic colors mapped to Ghostty's ANSI palette slots.

## Behavior

- Reads `ghostty +show-config` for `background`, `foreground`, and `palette[0..15]`.
- Derives neutrals (`muted`, `dim`, `borderMuted`, `scrollbarThumb`) from `fg`/`bg` for consistent readability.
- Writes `~/.pi/agent/themes/ghostty-sync-<sha1-8>.json` (or `$PI_CODING_AGENT_DIR/themes/`).
- Deletes prior `ghostty-sync-*.json` files so the themes dir doesn't grow.
- Skips work entirely when the active theme already matches the computed hash (no repaint on startup).

## Install (this dotfiles repo)

Loaded as a local pi package. In `pi/agent/settings.json`:

```json
"packages": [
  "../packages/pi-ghostty-theme-sync"
]
```

`pi update --extensions` materializes it into `pi/agent/npm/`.

## License

MIT, inherited from the upstream package.
