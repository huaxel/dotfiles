// Verify go-on keybinding registration against pi's real conflict logic.
// Replicates runner.js getShortcuts/buildBuiltinKeybindings + pi-tui matchesKey.
// Run: node pi/agent/extensions/go-on.keys.test.mjs   (set PI_ROOT to override)
const PI_ROOT =
  process.env.PI_ROOT ??
  "/home/juan/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { KEYBINDINGS } = await import(`${PI_ROOT}/dist/core/keybindings.js`);
const { TUI_KEYBINDINGS } = await import(
  `${PI_ROOT}/node_modules/@earendil-works/pi-tui/dist/keybindings.js`
);
const { matchesKey, setKittyProtocolActive } = await import(
  `${PI_ROOT}/node_modules/@earendil-works/pi-tui/dist/keys.js`
);

// Exact copy of the reserved list from dist/core/extensions/runner.js
const RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS = [
  "app.interrupt", "app.clear", "app.exit", "app.suspend", "app.thinking.cycle",
  "app.model.cycleForward", "app.model.cycleBackward", "app.model.select",
  "app.tools.expand", "app.thinking.toggle", "app.editor.external", "app.message.copy",
  "app.message.followUp", "tui.input.submit", "tui.select.confirm", "tui.select.cancel",
  "tui.input.copy", "tui.editor.deleteToLineEnd",
];

function buildBuiltinKeybindings(resolvedKeybindings) {
  const builtinKeybindings = {};
  for (const [keybinding, keys] of Object.entries(resolvedKeybindings)) {
    if (keys === undefined) continue;
    const keyList = Array.isArray(keys) ? keys : [keys];
    const restrictOverride = RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS.includes(keybinding);
    for (const key of keyList) {
      const normalizedKey = key.toLowerCase();
      const existing = builtinKeybindings[normalizedKey];
      if (existing?.restrictOverride && !restrictOverride) continue;
      builtinKeybindings[normalizedKey] = { keybinding, restrictOverride };
    }
  }
  return builtinKeybindings;
}

// go-on registered keys across the versions under test
const GO_ON_KEYS = {
  "0fad716 (alt+enter fallback)": ["alt+g", "alt+shift+enter", "alt+enter", "alt+shift+g", "ctrl+alt+g"],
  "new (ctrl+alt+g legacy burst)": ["alt+g", "alt+shift+enter", "alt+shift+g", "ctrl+alt+g"],
  "current (+ ctrl+alt+n nudge; no toggle keys)": ["alt+g", "ctrl+alt+n", "alt+shift+enter", "ctrl+alt+g"],
};

// Effective config = defaults (no user keybindings.json overrides present)
const resolved = { ...KEYBINDINGS, ...TUI_KEYBINDINGS };
const effectiveConfig = {};
for (const [id, def] of Object.entries(resolved)) effectiveConfig[id] = def.defaultKeys ?? [];

const builtin = buildBuiltinKeybindings(effectiveConfig);
console.log("=== built-in claims on go-on keys ===");
for (const key of ["alt+g", "ctrl+alt+n", "alt+shift+enter", "alt+enter", "ctrl+alt+g"]) {
  console.log(`  ${key.padEnd(16)} ->`, builtin[key] ? JSON.stringify(builtin[key]) : "(free)");
}

console.log("\n=== extension shortcut registration outcome ===");
for (const [label, keys] of Object.entries(GO_ON_KEYS)) {
  const results = [];
  for (const key of keys) {
    const b = builtin[key.toLowerCase()];
    if (b?.restrictOverride === true) results.push(`  SKIP   ${key} (reserved built-in ${b.keybinding})`);
    else results.push(`  OK     ${key}`);
  }
  console.log(`--- ${label} ---`);
  console.log(results.join("\n"));
}

console.log("\n=== legacy terminal (no kitty) sequence matching ===");
setKittyProtocolActive(false);
const cases = [
  ["\\x1b\\r (Alt+Shift+Enter on legacy)", "\x1b\r", ["alt+enter", "alt+shift+enter", "ctrl+alt+g"]],
  ["\\x1b\\x07 (Ctrl+Alt+G legacy)", "\x1b\x07", ["alt+enter", "alt+shift+enter", "ctrl+alt+g"]],
  ["\\x1b\\x0e (Ctrl+Alt+N legacy)", "\x1b\x0e", ["alt+g", "ctrl+alt+n"]],
  ["\\x1bg (Alt+G)", "\x1bg", ["alt+g", "ctrl+alt+n"]],
];
for (const [label, data, keys] of cases) {
  for (const key of keys) {
    console.log(`  ${label} vs ${key.padEnd(15)} -> ${matchesKey(data, key)}`);
  }
}
