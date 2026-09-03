#!/usr/bin/env bash
# agy-default-model.sh — Steer pi-agy's default model by recent usage balance.
#
# Prints one agy model alias for pi-agy's `defaultModelCommand` config.
# Reads pi-agy's session store ($PI_CODING_AGENT_DIR/agy-sessions.json),
# counts conversations per model family over a recent window, and flips the
# default from flash-medium to sonnet when the Gemini group carried nearly
# all recent work — so routine delegation rests the hot quota group.
#
# Environment overrides:
#   AGY_DEFAULT_MODEL_WINDOW_HOURS   lookback window   (default 24)
#   AGY_DEFAULT_MODEL_MIN_SESSIONS   minimum count     (default 3)
#   AGY_DEFAULT_MODEL_GEMINI_SHARE    flip threshold % (default 75)
#
# Always exits 0 and always prints exactly one alias on stdout.

set -euo pipefail

DEFAULT_ALIAS="flash-medium"
FLIP_ALIAS="sonnet"

window_hours="${AGY_DEFAULT_MODEL_WINDOW_HOURS:-24}"
min_sessions="${AGY_DEFAULT_MODEL_MIN_SESSIONS:-3}"
gemini_min_share="${AGY_DEFAULT_MODEL_GEMINI_SHARE:-75}"

store="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/agy-sessions.json"

if [[ ! -r "$store" ]]; then
  echo "$DEFAULT_ALIAS"
  exit 0
fi

stats="$(node - "$store" "$window_hours" <<'NODE' 2>/dev/null || echo "0 0 0"
const fs = require("node:fs");
let gemini = 0;
let claude = 0;
let gptOss = 0;
try {
  const store = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const cutoff = Date.now() - Number(process.argv[3]) * 3600_000;
  for (const record of Object.values(store)) {
    const entries = [
      ...(Array.isArray(record.history) ? record.history : []),
      ...(record.last_conversation_id
        ? [{ conversation_id: record.last_conversation_id, model: record.last_model, updated_at: record.updated_at }]
        : []),
    ];
    const seen = new Set();
    for (const entry of entries) {
      if (seen.has(entry.conversation_id)) continue;
      seen.add(entry.conversation_id);
      const when = Date.parse(entry.updated_at ?? "");
      if (!Number.isFinite(when) || when < cutoff) continue;
      const model = entry.model ?? "";
      if (model.startsWith("flash") || model.startsWith("pro")) gemini++;
      else if (model === "sonnet" || model === "opus") claude++;
      else if (model === "gpt-oss") gptOss++;
    }
  }
} catch {
  // Unreadable store → no signal.
}
console.log(`${gemini} ${claude} ${gptOss}`);
NODE
)"

read -r gemini claude gpt_oss <<< "$stats"
gemini="${gemini:-0}"
claude="${claude:-0}"
gpt_oss="${gpt_oss:-0}"
total=$(( gemini + claude + gpt_oss ))

if (( total == 0 || total < min_sessions )); then
  echo "$DEFAULT_ALIAS"
  exit 0
fi

gemini_share=$(( gemini * 100 / total ))
if (( gemini_share >= gemini_min_share )); then
  echo "$FLIP_ALIAS"
else
  echo "$DEFAULT_ALIAS"
fi
