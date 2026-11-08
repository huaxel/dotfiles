#!/usr/bin/env python3
"""Extract a bounded, human-readable slice from a coding-agent session transcript.

Transcripts reach gigabytes and their formats differ per harness, so the dream
analyzer cannot read them directly. This pulls out only the conversational
substance (what the user asked, what the agent concluded), truncates each turn,
and caps the total, producing a slice small enough to analyze.

Usage:
  extract-trace.py <file.jsonl> [--max-lines N] [--max-chars N] [--label NAME]

Supported shapes (auto-detected, no per-harness config):
  codex        {"type":"response_item","payload":{...}} / event_msg
  claude-code  {"type":"user"|"assistant","message":{"role","content"}}
  gemini/agy   {"type":"USER_INPUT","source":"USER_EXPLICIT","content":"..."}
  copilot      {"type":..., "events":...} / plain role+content JSONL

Anything unrecognised is skipped rather than guessed at.
"""
import argparse
import json
import re
import sys

USER_HINTS = ("user", "human", "prompt")
AGENT_HINTS = ("assistant", "agent", "model", "gemini", "claude", "gpt", "response")
# Records that are structurally noise for memory purposes.
SKIP_TYPES = {
    "token_usage_record", "world_state", "turn_context", "session_meta",
    "file-history-snapshot", "api-request", "api-request-blob", "attachment",
    "mode", "permission-mode", "atis-latch", "rewind-snapshot",
}

WS = re.compile(r"\s+")


def flatten_text(value, depth=0):
    """Pull readable text out of a str / list-of-blocks / dict."""
    if depth > 6:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [flatten_text(v, depth + 1) for v in value]
        return "\n".join(p for p in parts if p)
    if isinstance(value, dict):
        # Prefer explicit text fields; ignore tool payloads and metadata.
        for key in ("text", "content", "message", "output_text", "delta"):
            if key in value:
                got = flatten_text(value[key], depth + 1)
                if got:
                    return got
        return ""
    return ""


def classify(record):
    """Return (role, text) or (None, None)."""
    if not isinstance(record, dict):
        return None, None

    rtype = str(record.get("type") or "").strip()
    if rtype in SKIP_TYPES:
        return None, None

    # Nested payload / message containers used by codex and claude-code.
    container = record
    for key in ("payload", "message"):
        if isinstance(record.get(key), dict):
            container = record[key]
            break

    role_raw = " ".join(
        str(container.get(k) or record.get(k) or "")
        for k in ("role", "type", "source", "author", "speaker")
    ).lower()

    text = flatten_text(container.get("content")) or flatten_text(container.get("text"))
    if not text:
        text = flatten_text(record.get("content")) or flatten_text(record.get("text"))
    text = WS.sub(" ", text).strip()
    if not text:
        return None, None

    role = None
    if any(h in role_raw for h in USER_HINTS):
        role = "USER"
    elif any(h in role_raw for h in AGENT_HINTS):
        role = "AGENT"
    else:
        # Unknown speaker but real text: keep it, labelled by its type.
        role = f"({rtype or 'event'})"
    return role, text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--max-lines", type=int, default=300)
    ap.add_argument("--max-chars", type=int, default=700)
    ap.add_argument("--label", default="")
    args = ap.parse_args()

    out = []
    try:
        with open(args.path, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line or line[0] != "{":
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                role, text = classify(record)
                if not role:
                    continue
                if len(text) > args.max_chars:
                    text = text[: args.max_chars] + " …[truncated]"
                out.append(f"{role}: {text}")
                if len(out) >= args.max_lines:
                    break
    except OSError as exc:
        print(f"extract-trace: cannot read {args.path}: {exc}", file=sys.stderr)
        return 1

    label = args.label or args.path
    print(f"# Trace slice: {label} ({len(out)} turns extracted)")
    print()
    if not out:
        print("(no conversational turns recognised)")
    else:
        print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
