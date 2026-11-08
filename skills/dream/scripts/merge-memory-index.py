#!/usr/bin/env python3
"""Git merge driver for MEMORY.md: union dated entries instead of line-merging.

Why this exists: MEMORY.md is append-ordered, and two machines adding entries
while disconnected produce a line-level conflict whose markers land in the
middle of the file. Any agent reading that file then sees `<<<<<<<` in its
injected context, which is exactly the wrong outcome. A union of entry blocks
keeps both machines' entries and never emits conflict markers.

Git calls this as:  merge-memory-index.py %O %A %B [%L] [%P]
  %O = merge base, %A = ours (result is written here), %B = theirs

Blocks are dated entries (`<!-- YYYY-MM-DD ... -->` through the next marker) or,
for anything before the first marker, plain paragraphs. Identical blocks are
deduplicated. Two blocks sharing a key but differing in content are BOTH kept:
losing an entry is worse than a duplicate, and the dream organizer reconciles
duplicates later.
"""
import hashlib
import re
import sys

ENTRY_MARK = re.compile(r"^<!-- (\d{4}-\d{2}-\d{2})")
ANY_MARK = re.compile(r"^<!-- \d{4}-\d{2}-\d{2}")


def split_blocks(text):
    """Return [(sort_key, group_key, heading, body)] preserving order.

    group_key identifies the entry (date + heading) so two machines editing the
    same entry can have their bodies unioned rather than duplicated.
    """
    lines = text.split("\n")
    blocks, cur = [], []
    for line in lines:
        if ANY_MARK.match(line):
            if cur:
                blocks.append("\n".join(cur))
            cur = [line]
        else:
            cur.append(line)
    if cur:
        blocks.append("\n".join(cur))

    out = []
    for b in blocks:
        b = b.strip("\n")
        if not b.strip():
            continue
        blines = b.split("\n")
        m = ENTRY_MARK.match(blines[0])
        date = m.group(1) if m else "0000-00-00"
        heading = next((l for l in blines if l.startswith("## ")), "")
        body = [l for l in blines[1:] if l.strip() and l != heading]
        group = f"{date}|{heading}" if heading else digest(b)
        out.append((date, group, blines[0], heading, body))
    return out


def digest(block):
    return hashlib.sha256(re.sub(r"\s+", " ", block).strip().encode()).hexdigest()


def main():
    if len(sys.argv) < 4:
        print("usage: merge-memory-index.py %O %A %B", file=sys.stderr)
        return 2
    _, ours_path, theirs_path = sys.argv[1], sys.argv[2], sys.argv[3]

    try:
        ours = open(ours_path, encoding="utf-8", errors="replace").read()
        theirs = open(theirs_path, encoding="utf-8", errors="replace").read()
    except OSError as exc:
        print(f"merge-memory-index: {exc}", file=sys.stderr)
        return 1

    # Group by entry identity; union the bodies of same-entry variants.
    groups = {}   # group_key -> [date, marker, heading, [body lines]]
    order = []
    for date, group, marker, heading, body in split_blocks(ours) + split_blocks(theirs):
        if group not in groups:
            groups[group] = [date, marker, heading, []]
            order.append(group)
        seen = {re.sub(r"\s+", " ", l).strip() for l in groups[group][3]}
        for line in body:
            norm = re.sub(r"\s+", " ", line).strip()
            if norm and norm not in seen:
                groups[group][3].append(line)
                seen.add(norm)

    preamble, dated = [], []
    for group in order:
        date, marker, heading, body = groups[group]
        block = "\n".join([marker] + ([heading] if heading else []) + body)
        (preamble if date == "0000-00-00" else dated).append((date, block))

    dated.sort(key=lambda db: db[0])
    parts = []
    if preamble:
        parts.append("\n\n".join(b for _, b in preamble))
    parts.extend(b for _, b in dated)
    result = "\n\n".join(parts).rstrip("\n") + "\n"

    with open(ours_path, "w", encoding="utf-8") as fh:
        fh.write(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
