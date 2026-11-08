#!/usr/bin/env python3
"""Deletion-aware Git driver: merge-memory-index.py %O %A %B.

Use Git's three-way merge for edits/deletions. Union is safe only when both
sides retain every base line in order (pure insertions). Overlapping edits
return failure, leaving %A untouched and Git's index unmerged for resolution.
This prevents silent resurrection, not erasure from Git history or backups.
"""
from pathlib import Path
import subprocess
import sys


def additions_only(base, side):
    """True iff the base lines are a subsequence of the side's lines."""
    remaining = iter(side.splitlines(keepends=True))
    return all(any(line == candidate for candidate in remaining)
               for line in base.splitlines(keepends=True))


def main():
    if len(sys.argv) < 4:
        print('usage: merge-memory-index.py %O %A %B', file=sys.stderr)
        return 2
    base_path, ours_path, theirs_path = sys.argv[1:4]
    try:
        base, ours, theirs = (Path(p).read_bytes() for p in (base_path, ours_path, theirs_path))
        args = ['git', 'merge-file', '-p']
        if additions_only(base, ours) and additions_only(base, theirs):
            args.append('--union')
        result = subprocess.run(args + ['--', ours_path, base_path, theirs_path],
                                capture_output=True)
        if result.returncode:
            # Do not inject conflict markers or print potentially private lines.
            print('memory merge: unresolved edits; resolve Git index before syncing', file=sys.stderr)
            return 1
        Path(ours_path).write_bytes(result.stdout)
    except OSError as exc:
        print(f'memory merge: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
