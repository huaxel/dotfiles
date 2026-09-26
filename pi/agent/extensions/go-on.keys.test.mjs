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
  "current (universal ctrl+alt pair)": ["ctrl+alt+n", "ctrl+alt+g"],
  "termius fallback (alt variants)": ["ctrl+alt+n", "ctrl+alt+g", "alt+n", "alt+g"],
};

// Effective config = defaults (no user keybindings.json overrides present)
const resolved = { ...KEYBINDINGS, ...TUI_KEYBINDINGS };
const effectiveConfig = {};
for (const [id, def] of Object.entries(resolved)) effectiveConfig[id] = def.defaultKeys ?? [];

const builtin = buildBuiltinKeybindings(effectiveConfig);
const failures = [];
const check = (condition, message) => {
  console.log(`  ${condition ? "OK  " : "FAIL"} ${message}`);
  if (!condition) failures.push(message);
};

console.log("=== built-in claims on go-on keys ===");
for (const key of ["ctrl+alt+n", "ctrl+alt+g", "alt+n", "alt+g"]) {
  const claim = builtin[key.toLowerCase()];
  console.log(`  ${key.padEnd(16)} ->`, claim ? JSON.stringify(claim) : "(free)");
  // A restrictOverride built-in would silently swallow the extension shortcut.
  check(claim?.restrictOverride !== true, `${key} is free of reserved built-ins`);
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
  // [label, bytes, key, expected] — the no-double-fire property: each byte
  // sequence matches exactly one of the primary/fallback pair.
  ["\\x1b\\x07 (Ctrl+Alt+G legacy)", "\x1b\x07", "ctrl+alt+g", true],
  ["\\x1b\\x07 (Ctrl+Alt+G legacy)", "\x1b\x07", "alt+g", false],
  ["\\x1b\\x0e (Ctrl+Alt+N legacy)", "\x1b\x0e", "ctrl+alt+n", true],
  ["\\x1b\\x0e (Ctrl+Alt+N legacy)", "\x1b\x0e", "alt+n", false],
  ["\\x1bg (Alt+G legacy / Termius)", "\x1bg", "alt+g", true],
  ["\\x1bg (Alt+G legacy / Termius)", "\x1bg", "ctrl+alt+g", false],
  ["\\x1bn (Alt+N legacy / Termius)", "\x1bn", "alt+n", true],
  ["\\x1bn (Alt+N legacy / Termius)", "\x1bn", "ctrl+alt+n", false],
  ["\\x1b\\r (Alt+Enter legacy)", "\x1b\r", "ctrl+alt+g", false],
  ["\\x1b\\r (Alt+Enter legacy)", "\x1b\r", "ctrl+alt+n", false],
];
for (const [label, data, key, expected] of cases) {
  check(matchesKey(data, key) === expected, `${label} vs ${key} -> ${expected}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} GO-ON KEY CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nALL GO-ON KEY TESTS PASSED");
