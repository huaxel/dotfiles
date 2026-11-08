#!/usr/bin/env python3
"""Fail-closed scrubber for personal content in memory files before they sync.

Owner policy (2026-11-08): memory must not hold therapy, health, salary, or
personal-relationship details. Daily logs are saturated with that content, so
anything leaving the machine must pass through here first.

Design: redact WHOLE BLOCKS, not keywords. Removing just the word "therapy"
leaves the surrounding disclosure intact, which is worse than useless. A block
is a paragraph (blank-line separated) or a dated entry section.

Then re-scan the output. If anything still matches, the file is reported as
UNSAFE and no output is written for it: a partial scrub must never look clean.

Usage:
  scrub-personal.py check  <file|dir> ...    report only, exit 1 if unsafe
  scrub-personal.py scrub  <outdir> <file|dir> ...   write scrubbed copies
"""
import argparse
import pathlib
import re
import sys

REDACTED = "[redacted: personal content removed by scrub-personal]"

# Tier 1: always redact. Health, mental health, compensation.
#
# Precision matters more than recall here: a pattern like `diagnos\w*` matches
# "CI diagnosis" and `counsel\w*` matches legal counsel, and block-level
# redaction would then destroy legitimate technical entries. So every pattern
# below requires an explicit personal-context word; bare money amounts and
# generic words are deliberately absent.
TIER1 = [
    # mental health / therapy
    r"\btherap(y|ist)\b", r"\bpsychiatr\w*", r"\bpsycholog\w*", r"\bennui\b",
    r"\bantidepress\w*", r"\bmental health\b", r"\bburn[- ]?out\b",
    r"\bdepress(ion|ive|ed)\b", r"\banxiety\b", r"\bADHD\b",
    # medical
    r"\bmedication\b", r"\bprescription\b", r"\bmedical (record|history|leave)\b",
    r"\bsick ?leave\b", r"\bziekteverlof\b",
    # compensation: only the owner's own pay, never a bare amount and never a
    # project that merely concerns salaries (e.g. a salary-calculation engine).
    r"\b(my|own|current)\s+(salary|pay|package)\b", r"\bI (earn|make)\b",
    r"\bcurrent package\b", r"\bcompensation floor\b", r"\bpay ?slip\b",
    r"\b(gross|net) salary\b", r"\bmaandloon\b", r"\bjaarloon\b",
    r"\bbruto ?loon\b", r"\bnetto ?loon\b", r"\bwedde\b",
    r"\bEUR\s?\d[\d.,]*\s*(gross|net|bruto|netto)\b",
    r"\bEUR\s?\d[\d.,]*\s*(per|/)\s*(month|year|maand|jaar)\b",
    r"\b\d[\d.,]*\s?(k|K)\s*(gross|net)\b",
]
# Tier 2: report only. Relationship and family detail about the owner or others.
TIER2 = [
    r"\bbest man\b", r"\bgodfather\b", r"\bwedding\b", r"\bmarriage\b", r"\bdivorc\w*",
    r"\bmy wife\b", r"\bmy husband\b", r"\bmy child\b", r"\bmy son\b", r"\bmy daughter\b",
    r"\bin-?laws?\b", r"\bbrother-in-law\b", r"\bsister-in-law\b",
]

T1 = re.compile("|".join(TIER1), re.I)
T2 = re.compile("|".join(TIER2), re.I)

ENTRY_MARK = re.compile(r"^<!-- \d{4}-\d{2}-\d{2}")


def blocks(text):
    """Split into redactable blocks, keeping the text reconstructable.

    Dated entries (`<!-- YYYY-MM-DD ... -->` ... next marker) are one block;
    otherwise paragraphs separated by blank lines are blocks.
    """
    lines = text.split("\n")
    out, cur = [], []
    for line in lines:
        if ENTRY_MARK.match(line) and cur:
            out.append("\n".join(cur)); cur = [line]
        elif line.strip() == "" and cur and not ENTRY_MARK.match(cur[0]):
            cur.append(line)
            out.append("\n".join(cur)); cur = []
        else:
            cur.append(line)
    if cur:
        out.append("\n".join(cur))
    return out


def process(path, outdir, apply):
    text = path.read_text(encoding="utf-8", errors="replace")
    redacted = 0
    parts = []
    for b in blocks(text):
        if T1.search(b):
            redacted += 1
            parts.append(REDACTED + "\n")
        else:
            parts.append(b)
    new = "".join(parts)

    residual1 = T1.findall(new)
    residual2 = T2.findall(new)
    safe = not residual1

    if apply and safe:
        dest = outdir / path.name
        dest.write_text(new, encoding="utf-8")
    return redacted, len(residual1), len(residual2), safe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["check", "scrub"])
    ap.add_argument("paths", nargs="+")
    args = ap.parse_args()

    apply = args.mode == "scrub"
    outdir = None
    paths = args.paths
    if apply:
        outdir = pathlib.Path(paths[0]); outdir.mkdir(parents=True, exist_ok=True)
        paths = paths[1:]

    files = []
    for p in paths:
        pp = pathlib.Path(p)
        files.extend(sorted(pp.glob("*.md")) if pp.is_dir() else [pp])

    total_redacted = unsafe = tier2_hits = 0
    for f in files:
        r, res1, res2, safe = process(f, outdir, apply)
        total_redacted += r
        tier2_hits += res2
        if not safe:
            unsafe += 1
            print(f"UNSAFE  {f.name}: {res1} tier-1 match(es) survived redaction", file=sys.stderr)
        elif r:
            print(f"scrubbed {f.name}: {r} block(s) redacted")
    print(f"\nfiles={len(files)} blocks_redacted={total_redacted} "
          f"tier2_mentions_left={tier2_hits} unsafe_files={unsafe}")
    if unsafe:
        print("REFUSING: at least one file could not be made safe. Do not sync it.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
