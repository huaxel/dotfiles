#!/usr/bin/env python3
"""Apply a staged memory change without letting a model rewrite the file.

Why this exists
---------------
The dream organizer was told to append to MEMORY.md and to regenerate only the
text between the INDEX markers. It blank-overwrote the whole file three times
anyway, once recovering itself with git against the no-git rule. Instructing a
model to be careful is not a mechanism.

So the model never writes MEMORY.md. It writes a proposal file, and this script
applies it under three invariants:

  * append  - the original file must be an exact prefix of the result, so no
              existing byte can be lost or reordered.
  * index   - everything outside the two INDEX markers must be byte-identical.
  * any     - the result is written to a temp file, verified, then swapped in;
              a checkpoint copy is kept; a failed check leaves the file alone.

Usage:
  memory-apply.py --file MEMORY.md --append proposal.md
  memory-apply.py --file MEMORY.md --index proposal.md
  memory-apply.py --file MEMORY.md --append proposal.md --checkpoint DIR

Exit codes: 0 applied (or nothing to do), 1 refused, 2 usage error.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import pathlib
import shutil
import sys
import tempfile
import time

INDEX_START = "<!-- INDEX START"
INDEX_END = "<!-- INDEX END -->"

# Project memory files written before 2026-11-09 use a shorter marker pair.
# Both are accepted for replacement; a file with neither gets a new INDEX
# prepended, which is a pure insertion and cannot lose existing bytes.
LEGACY_START = "<!-- INDEX -->"
LEGACY_END = "<!-- /INDEX -->"


def fail(message: str) -> int:
    print(f"memory-apply: refused: {message}", file=sys.stderr)
    return 1


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def checkpoint(path: pathlib.Path, directory: pathlib.Path | None) -> pathlib.Path | None:
    if directory is None:
        return None
    directory.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    target = directory / f"{path.name}.{stamp}.{sha(path.read_text(errors='replace')[:4096])}"
    shutil.copy2(path, target)
    return target


def atomic_write(path: pathlib.Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(text)
        os.replace(tmp, path)
    except BaseException:
        pathlib.Path(tmp).unlink(missing_ok=True)
        raise


def apply_append(path: pathlib.Path, proposal: str) -> tuple[str, str]:
    """Return (new_text, description). Original must be an exact prefix."""
    original = path.read_text()
    addition = proposal if proposal.endswith("\n") else proposal + "\n"
    if not addition.strip():
        return original, "nothing to append"
    new_text = original + addition
    if not new_text.startswith(original):
        raise ValueError("append changed existing bytes")
    return new_text, f"appended {len(addition.encode())} bytes"


def apply_index(path: pathlib.Path, proposal: str) -> tuple[str, str]:
    """Replace only the text between the INDEX markers, or add one."""
    original = path.read_text()
    body = proposal.strip("\n")
    if not body:
        raise ValueError("empty INDEX proposal")
    for marker in (INDEX_START, INDEX_END, LEGACY_START, LEGACY_END):
        if marker in body:
            raise ValueError("proposal contains INDEX markers")

    # No markers anywhere: prepend a fresh INDEX block. Pure addition.
    if INDEX_START not in original and LEGACY_START not in original:
        block = f"{INDEX_START} -->\n{body}\n{INDEX_END}\n\n"
        new_text = block + original
        if not new_text.endswith(original):
            raise ValueError("prepending the INDEX disturbed existing text")
        return new_text, f"added INDEX ({len(body.encode())} bytes)"

    if INDEX_START in original:
        marker_start, marker_end = INDEX_START, INDEX_END
    else:
        marker_start, marker_end = LEGACY_START, LEGACY_END
    start_at = original.find(marker_start)
    # The start marker line ends at its own newline; the region begins after it.
    start_line_end = original.find("\n", start_at)
    if start_line_end < 0:
        raise ValueError("INDEX START marker is not a full line")
    end_at = original.find(marker_end, start_line_end)
    if end_at < 0:
        raise ValueError(f"no matching end marker for {marker_start}")

    prefix = original[: start_line_end + 1]
    suffix = original[end_at:]
    new_text = f"{prefix}{body}\n{suffix}"

    # Invariant: everything outside the markers is untouched.
    if not new_text.startswith(prefix) or not new_text.endswith(suffix):
        raise ValueError("index replacement disturbed text outside the markers")
    if new_text.count(marker_start) != 1 or new_text.count(marker_end) != 1:
        raise ValueError("marker count changed")
    return new_text, f"replaced INDEX ({len(body.encode())} bytes)"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--file", required=True, type=pathlib.Path)
    parser.add_argument("--append", type=pathlib.Path)
    parser.add_argument("--index", type=pathlib.Path)
    parser.add_argument("--checkpoint", type=pathlib.Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    if bool(args.append) == bool(args.index):
        print("memory-apply: give exactly one of --append or --index", file=sys.stderr)
        return 2
    if not args.file.is_file():
        return fail(f"no such file: {args.file}")

    proposal_path = args.append or args.index
    if not proposal_path.is_file():
        return fail(f"no such proposal: {proposal_path}")
    proposal = proposal_path.read_text()

    try:
        if args.append:
            new_text, description = apply_append(args.file, proposal)
        else:
            new_text, description = apply_index(args.file, proposal)
    except ValueError as exc:
        return fail(str(exc))

    if new_text == args.file.read_text():
        print(f"memory-apply: {args.file}: nothing to do")
        return 0

    if args.dry_run:
        print(f"memory-apply: would {description} in {args.file}")
        return 0

    saved = checkpoint(args.file, args.checkpoint)
    atomic_write(args.file, new_text)

    # Re-read and re-verify from disk, not from the in-memory string.
    written = args.file.read_text()
    if written != new_text:
        if saved is not None:
            shutil.copy2(saved, args.file)
        return fail("write verification failed; restored checkpoint")

    print(f"memory-apply: {args.file}: {description}")
    if saved is not None:
        print(f"memory-apply: checkpoint {saved}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
