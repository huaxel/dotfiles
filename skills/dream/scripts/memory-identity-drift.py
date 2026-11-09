#!/usr/bin/env python3
"""Report facts that exist in a retained legacy scope but not in canonical memory.

Why this exists
---------------
Migrating a project to a stable identity copies its history into a canonical
scope but keeps the old path-derived scopes, because deleting memory is not a
migration step. Sessions started before the switch keep writing to the old
scope until they are restarted, so new facts can land where the canonical
scope never sees them. That is silent loss, not untidiness.

This check is read-only. It compares entry text, not INDEX regions (which are
derived views), and reports both directions so a reviewer can reconcile by hand.

Usage:
  memory-identity-drift.py [--memory-dir DIR] [--registry FILE]

Exit codes: 0 no drift, 1 drift found, 2 unusable input.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import sys

INDEX = re.compile(r'\A<!-- INDEX START[^\n]*-->\n.*?<!-- INDEX END -->\n*', re.S)
LEGACY_INDEX = re.compile(r'\A<!-- INDEX -->\n.*?<!-- /INDEX -->\n*', re.S)
ID = re.compile(r'^[a-z][a-z0-9-]{0,63}$')


# Migration adds a provenance header above each imported entry. It records
# where a fact came from, not what the fact says, so it must not read as drift.
PROVENANCE = re.compile(r'^<!-- source-scope: [^\n]*-->\n?', re.M)


def entries(text: str) -> list[str]:
    """Entry bodies with derived INDEX views and provenance headers removed."""
    body = LEGACY_INDEX.sub('', INDEX.sub('', text))
    blocks = [block.strip() for block in re.split(r'(?=^<!-- \d{4}-\d{2}-\d{2})', body, flags=re.M)
              if block.strip()]
    return [PROVENANCE.sub('', block).strip() for block in blocks]


MARKER = re.compile(r'\A<!-- ([^\n]+?) -->')


def fingerprint(block: str) -> str:
    return hashlib.sha256(block.encode()).hexdigest()[:12]


def identity(block: str) -> str:
    """An entry's identity is its leading marker, not its whole body.

    Comparing bodies produced false alarms: an entry that a later session
    extended is still present, just not byte-identical. Only a marker absent
    from canonical memory means the entry is genuinely missing.
    """
    match = MARKER.match(block)
    return match.group(1).strip() if match else fingerprint(block)


def load_registry(mem: pathlib.Path, registry: pathlib.Path) -> dict[str, list[str]]:
    """Map canonical project -> old scope keys derived from its checkouts."""
    data = json.loads(registry.read_text())
    if (not isinstance(data, dict) or data.get('version') != 1
            or not isinstance(data.get('checkouts'), dict)):
        raise ValueError('invalid identity registry')
    projects: dict[str, list[str]] = {}
    for checkout, project in data['checkouts'].items():
        if (not isinstance(project, str) or not ID.fullmatch(project)
                or not pathlib.Path(checkout).is_absolute()
                or os.path.normpath(checkout) != checkout):
            raise ValueError('invalid identity mapping')
        label = re.sub(r'[^A-Za-z0-9._-]', '-', pathlib.Path(checkout).name) or 'project'
        key = label + '-' + hashlib.sha256(checkout.encode()).hexdigest()[:12]
        projects.setdefault(project, [])
        if key not in projects[project]:
            projects[project].append(key)
    return projects


def report(mem: pathlib.Path, projects: dict[str, list[str]]) -> list[dict]:
    findings = []
    for project, keys in sorted(projects.items()):
        canonical = mem / 'projects' / project / 'MEMORY.md'
        if not canonical.is_file():
            findings.append({'project': project, 'status': 'missing', 'problem': 'canonical memory missing'})
            continue
        canonical_blocks = entries(canonical.read_text())
        # One marker can legitimately appear more than once (two source scopes
        # that reused a generic date marker). Keep every body, or a match against
        # the wrong twin reads as drift.
        bodies: dict[str, set[str]] = {}
        for block in canonical_blocks:
            bodies.setdefault(identity(block), set()).add(block)
        known = set(bodies)
        for key in keys:
            legacy = mem / 'projects' / key / 'MEMORY.md'
            if not legacy.is_file():
                continue
            for block in entries(legacy.read_text()):
                marker = identity(block)
                if marker in known and block in bodies[marker]:
                    continue
                heading = re.search(r'^#{1,6} (.+)$', block, re.M)
                findings.append({
                    'project': project,
                    'legacy_scope': key,
                    'entry': marker,
                    'status': 'diverged' if marker in known else 'missing',
                    'fingerprint': fingerprint(block),
                    'bytes': len(block.encode()),
                    'heading': heading.group(1).strip()[:100] if heading else '',
                })
    return findings


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--memory-dir', type=pathlib.Path)
    parser.add_argument('--registry', type=pathlib.Path)
    args = parser.parse_args(argv)

    mem = (args.memory_dir or pathlib.Path(
        os.environ.get('PI_MEMORY_DIR') or pathlib.Path.home() / '.pi/agent/memory')).resolve()
    registry = args.registry or mem / 'project-identities.json'
    if not registry.is_file():
        print(f'memory-identity-drift: no registry at {registry}', file=sys.stderr)
        return 2
    try:
        projects = load_registry(mem, registry)
    except (ValueError, OSError) as error:
        print(f'memory-identity-drift: {error}', file=sys.stderr)
        return 2

    findings = report(mem, projects)
    if not findings:
        print('memory-identity-drift: no drift between legacy and canonical scopes')
        return 0
    print(json.dumps(findings, indent=2))
    missing = sum(1 for f in findings if f.get('status') == 'missing'
                  or f.get('problem') == 'canonical memory missing')
    diverged = len(findings) - missing
    print(f'memory-identity-drift: {missing} missing, {diverged} diverged legacy entr(y/ies)',
          file=sys.stderr)
    if missing:
        print('Reconcile by hand: restart sessions using the old scope, then merge deliberately.',
              file=sys.stderr)
    return 1 if missing else 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
