#!/usr/bin/env bash
# Append the short Completion block to every project AGENTS.md (idempotent).
set -euo pipefail

BLOCK='## Completion

Carry the task to done: implement, run the gate, fix failures, commit. Don'\''t stop at
natural boundaries waiting for a nudge — report blockers instead of asking open questions.
'

PROJECTS=(belpolsim energy-automation meridiano-analysis pokemon-felix nursultan-web \
          qvd-parquet garamatic wktrainer project-atom juanbenjumea-me prime-agent pi)

for p in "${PROJECTS[@]}"; do
  f="$HOME/projects/$p/AGENTS.md"
  [[ -f "$f" ]] || { echo "MISSING: $f"; continue; }
  # normalize trailing newline first
  python3 -c "import sys; p=sys.argv[1]; s=open(p).read().rstrip('\n')+'\n'; open(p,'w').write(s)" "$f"
  if grep -qiE '^##[[:space:]]*Completion' "$f"; then
    echo "SKIP (has Completion): $p"
  else
    printf '\n%s' "$BLOCK" >> "$f"
    echo "APPENDED: $p"
  fi
done