#!/usr/bin/env python3
"""Read-only gate for staged Markdown and current-branch outgoing history.

Uses the scrubber's existing detectors, not a claim of semantic completeness.
Only exact, path-bound technical lines reviewed in the companion registry may
exempt a match; code fences, policy labels, and incoming registries cannot.
No content, matching passages, or filenames are printed. Unknown/unreadable
Git state and non-UTF-8 Markdown fail closed. Never edits or deletes data.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path, PurePosixPath
import runpy
import subprocess
import sys

DETECTORS = runpy.run_path(str(Path(__file__).with_name('scrub-personal.py')))


def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.DEVNULL)


def markdown_blobs(records, *, index=False):
    for record in records.split(b'\0'):
        if not record:
            continue
        metadata, path = record.split(b'\t', 1)
        fields = metadata.split()
        if path.lower().endswith(b'.md'):
            if fields[0] == b'160000':
                raise ValueError('Markdown gitlink is not inspectable')
            yield fields[1 if index else 2].decode('ascii'), path.decode('utf-8')


def load_reviewed_lines(path=None):
    """Trust agent code, never a registry arriving inside synced memory.

    The registry stores only hashes: it lives in a public repo and must never
    carry memory text. PI_PRIVACY_REVIEWED_LINES exists for hermetic tests.
    """
    path = Path(path or os.environ.get('PI_PRIVACY_REVIEWED_LINES',
                                       Path(__file__).with_name('privacy-reviewed-lines.json')))
    registry = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(registry, dict) or registry.get('schema_version') != 2 or not isinstance(registry.get('reviewed_lines'), list):
        raise ValueError('Invalid technical-review registry')
    reviewed = {}
    for item in registry['reviewed_lines']:
        if not isinstance(item, dict) or set(item) != {'path', 'line_sha256', 'reason'}:
            raise ValueError('Invalid technical-review entry')
        if not all(isinstance(item[key], str) and item[key] for key in item):
            raise ValueError('Invalid technical-review fields')
        path_name, digest = item['path'], item['line_sha256']
        if PurePosixPath(path_name).is_absolute() or '..' in PurePosixPath(path_name).parts:
            raise ValueError('Unsafe technical-review path')
        if not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError('Invalid technical-review digest')
        reviewed.setdefault(path_name, set()).add(digest)
    return reviewed


def line_digest(line):
    return hashlib.sha256(line.encode()).hexdigest()


def has_personal_matches(text, relative_path, reviewed):
    """Ignore only matches wholly contained in an exact reviewed line.

    Do not remove approved lines before scanning: doing so could hide a
    cross-line disclosure or accidentally join unrelated words into a match.
    """
    approved_ranges = []
    offset = 0
    approved = reviewed.get(relative_path, ())
    for line in text.splitlines(keepends=True):
        body = line.rstrip('\r\n')
        if approved and line_digest(body) in approved:
            approved_ranges.append((offset, offset + len(body)))
        offset += len(line)
    for detector in (DETECTORS['T1'], DETECTORS['T2']):
        for match in detector.finditer(text):
            if not any(start <= match.start() and match.end() <= end
                       for start, end in approved_ranges):
                return True
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--against', help='Explicit fetched upstream commit/ref for first import')
    args = parser.parse_args()
    try:
        reviewed = load_reviewed_lines()
        if git('ls-files', '-u'):
            raise ValueError('Unresolved Git index')
        blobs = set(markdown_blobs(git('ls-files', '--stage', '-z'), index=True))
        head = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD^{commit}'],
                              capture_output=True)
        if head.returncode == 0:
            head_oid = head.stdout.decode().strip()
            # Missing upstream means all history could be new: scan all of it.
            upstream = subprocess.run(['git', 'rev-parse', '--verify', '--end-of-options',
                                       (args.against or '@{upstream}') + '^{commit}'],
                                      capture_output=True)
            if args.against and upstream.returncode:
                raise ValueError('Explicit upstream cannot be resolved')
            rev_args = ['rev-list', head_oid]
            if upstream.returncode == 0:
                rev_args += ['--not', upstream.stdout.decode().strip()]
            for commit in git(*rev_args).decode().splitlines():
                blobs.update(markdown_blobs(git('ls-tree', '-r', '-z', commit)))
        for oid, relative_path in sorted(blobs):
            text = git('cat-file', 'blob', oid).decode('utf-8')
            if has_personal_matches(text, relative_path, reviewed):
                print('memory privacy: REFUSING publication; detected personal context in staged or outgoing Markdown', file=sys.stderr)
                return 1
    except (OSError, ValueError, UnicodeError, subprocess.CalledProcessError):
        print('memory privacy: REFUSING publication; could not verify staged/outgoing Markdown', file=sys.stderr)
        return 1
    print(f'memory privacy: checked {len(blobs)} Markdown blob/path pairs')
    return 0


if __name__ == '__main__':
    sys.exit(main())
