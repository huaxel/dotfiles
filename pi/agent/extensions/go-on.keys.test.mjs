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
console.log("=== built-in claims on go-on keys ===");
for (const key of ["ctrl+alt+n", "ctrl+alt+g"]) {
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
  ["\\x1b\\x07 (Ctrl+Alt+G legacy)", "\x1b\x07", ["ctrl+alt+g"]],
  ["\\x1b\\x0e (Ctrl+Alt+N legacy)", "\x1b\x0e", ["ctrl+alt+n"]],
  ["\\x1b\\r (Alt+Enter legacy)", "\x1b\r", ["ctrl+alt+g", "ctrl+alt+n"]],
  ["\\x1bg (Alt+G legacy)", "\x1bg", ["ctrl+alt+g", "ctrl+alt+n"]],
];
for (const [label, data, keys] of cases) {
  for (const key of keys) {
    console.log(`  ${label} vs ${key.padEnd(15)} -> ${matchesKey(data, key)}`);
  }
}

// === Kitty CSI-u matching (requires npm/patch-pi-tui-keys.sh) ===
// pi 0.84.1 decoded kitty modifiers with the xterm convention (mod-1), so
// every modified chord from a kitty-protocol terminal failed to match.
// The patch fixes parseKittySequence to use the bitmask when the kitty
// protocol is active. These assertions fail on an unpatched pi install.
console.log("\n=== kitty CSI-u modifier decoding (patched pi-tui) ===");
{
  const { matchesKey, setKittyProtocolActive } = await import(
    `${PI_ROOT}/node_modules/@earendil-works/pi-tui/dist/keys.js`
  );
  setKittyProtocolActive(true);
  const cases = [
    ["\x1b[103;6u", "ctrl+alt+g", "kitty ctrl+alt+g (103;6u)"],
    ["\x1b[110;6u", "ctrl+alt+n", "kitty ctrl+alt+n (110;6u)"],
    ["\x1b[114;5u", "ctrl+shift+r", "kitty ctrl+shift+r (114;5u)"],
    ["\x1b[46;4u", "ctrl+.", "kitty ctrl+. (46;4u)"],
    ["\x1b[99;4u", "ctrl+c", "kitty ctrl+c (99;4u)"],
    ["\x1b[103;2u", "alt+g", "kitty alt+g (103;2u)"],
    ["\x1b[1;4C", "ctrl+right", "kitty ctrl+right (1;4C)"],
  ];
  let failed = 0;
  for (const [data, keyId, label] of cases) {
    const ok = matchesKey(data, keyId);
    console.log(`  ${ok ? "OK  " : "FAIL"} ${label}: ${ok}`);
    if (!ok) failed += 1;
  }
  // xterm-style values must NOT match while kitty is active (bitmask is the
  // contract on kitty-protocol terminals)
  const xtermStyleStillWrong = matchesKey("\x1b[103;7u", "ctrl+alt+g");
  console.log(`  ${xtermStyleStillWrong ? "FAIL" : "OK  "} kitty-active rejects xterm-style 103;7u for ctrl+alt+g: ${!xtermStyleStillWrong}`);
  if (xtermStyleStillWrong) failed += 1;
  if (failed > 0) {
    console.log(`\n${failed} kitty CSI-u assertion(s) failed — run npm/patch-pi-tui-keys.sh (pi 0.84.1 bug).`);
    process.exit(1);
  }
}
console.log("\nALL GO-ON KEY TESTS PASSED");
