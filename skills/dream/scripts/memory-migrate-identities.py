#!/usr/bin/env python3
"""Build an additive identity migration from private snapshot tarballs.

Never edits source scopes or a live memory root. Output must not exist.
Plan schema: {"version":1,"checkouts":{absolute_path: project_id},
              "projects":{project_id:[old_scope_key,...]}}.
Same source path across machines must be identical or a pure byte-prefix
advance; otherwise stop. Distinct source scopes retain provenance, not a
model's inferred resolution. Original indexes are views and are omitted from
canonical claims, while the snapshot tarballs retain every original byte.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import re
import tarfile

ID = re.compile(r'^[a-z][a-z0-9-]{0,63}$')
KEY = re.compile(r'^[A-Za-z0-9._-]+-[a-f0-9]{12}$')
INDEX = re.compile(r'\A<!-- INDEX START[^\n]*-->\n.*?<!-- INDEX END -->\n*', re.S)
LEGACY_INDEX = re.compile(r'\A<!-- INDEX -->\n.*?<!-- /INDEX -->\n*', re.S)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def without_index(data):
    text = data.decode('utf-8')
    return LEGACY_INDEX.sub('', INDEX.sub('', text)).encode('utf-8')


def validate(plan):
    if plan.get('version') != 1 or not isinstance(plan.get('projects'), dict):
        raise ValueError('invalid plan')
    assigned = set()
    for project, keys in plan['projects'].items():
        if not ID.fullmatch(project) or not isinstance(keys, list) or not keys:
            raise ValueError('invalid project or empty source list')
        for key in keys:
            if not isinstance(key, str) or not KEY.fullmatch(key) or key in assigned:
                raise ValueError('invalid or multiply assigned source key')
            assigned.add(key)
    for checkout, project in plan.get('checkouts', {}).items():
        if not Path(checkout).is_absolute() or project not in plan['projects']:
            raise ValueError('invalid checkout mapping')
    return assigned


def build(snapshot_dir, plan, output):
    assigned = validate(plan)
    if output.exists():
        raise ValueError('output already exists; refusing overwrite')
    versions = {}
    for archive in sorted(snapshot_dir.glob('*.tar')):
        with tarfile.open(archive) as tar:
            for member in tar:
                path = PurePosixPath(member.name)
                if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk():
                    raise ValueError('unsafe snapshot member')
                if not member.isfile() or path.parts[0] not in assigned:
                    continue
                raw = tar.extractfile(member).read()
                versions.setdefault(member.name, []).append((archive.stem, raw))
    selected = {}
    for name, copies in versions.items():
        latest = max((raw for host, raw in copies), key=len)
        if not all(latest.startswith(raw) for host, raw in copies):
            raise ValueError(f'conflicting copies of {name}')
        selected[name] = latest
    for key in assigned:
        if not any(n.startswith(key + '/') for n in selected):
            raise ValueError(f'missing source scope {key}')

    # Source-entry identity collisions must never be silently unioned.
    for project, keys in plan['projects'].items():
        entries, headings, tasks = {}, {}, {}
        for key in keys:
            body = without_index(selected.get(f'{key}/MEMORY.md', b''))
            for block in re.split(rb'(?=^<!-- \d{4}-\d{2}-\d{2})', body, flags=re.M):
                stamp = re.match(rb'<!-- [^\n]+ -->', block)
                if stamp:
                    marker = stamp.group()
                    value = block.strip()
                    entries.setdefault(marker, {}).setdefault(key, set()).add(value)
                heading = re.search(rb'^## (.+)$', block, flags=re.M)
                if heading:
                    title, value = heading.group(1), block.strip()
                    headings.setdefault(title, {}).setdefault(key, set()).add(value)
            scratch = selected.get(f'{key}/SCRATCHPAD.md', b'')
            for state, task in re.findall(rb'^\s*- \[([ xX])\] (.+)$', scratch, flags=re.M):
                task, state = task.strip(), state.lower()
                tasks.setdefault(task, {}).setdefault(key, set()).add(state)
        # An old history can already contain several entries sharing a generic
        # date marker or title. Preserve those; migration is not a correction.
        # Only competing versions across distinct source scopes block merging.
        for label, claims in (('entry identity', entries), ('entry heading', headings),
                              ('task status', tasks)):
            for scopes in claims.values():
                variants = list(scopes.values())
                if len(variants) > 1 and any(v != variants[0] for v in variants[1:]):
                    raise ValueError(f'competing {label} in {project}')

    # Build entirely in memory before creating the output tree.
    results, provenance = {}, {}
    for project, keys in plan['projects'].items():
        grouped = {}
        memory = [f'<!-- INDEX START -->\n# {project}\n'
                  'Stable project scope. Histories below retain source attribution.\n'
                  'Consult repository evidence before treating historical status as current.\n'
                  '<!-- INDEX END -->\n\n'.encode()]
        scratch = [b'# Scratchpad\n\n']
        for key in keys:
            for name, raw in selected.items():
                if not name.startswith(key + '/'):
                    continue
                rel = name[len(key) + 1:]
                provenance[name] = {'sha256': digest(raw), 'bytes': len(raw)}
                if rel == 'MEMORY.md':
                    body = without_index(raw)
                    memory.extend([f'<!-- source-scope: {key} -->\n'.encode(), body, b'\n\n'])
                elif rel == 'SCRATCHPAD.md':
                    scratch.extend([f'<!-- source-scope: {key} -->\n'.encode(), raw, b'\n\n'])
                elif rel.startswith('daily/') and rel.endswith('.md'):
                    grouped.setdefault(rel, []).append((key, raw))
                elif rel.startswith('recovery/'):
                    # Undo records remain in the retained source scopes and private
                    # snapshots. Never copy deliberately removed text into a new scope.
                    continue
                else:
                    raise ValueError(f'unrecognized source file {name}')
        results[f'projects/{project}/MEMORY.md'] = b''.join(memory)
        results[f'projects/{project}/SCRATCHPAD.md'] = b''.join(scratch)
        for rel, bodies in grouped.items():
            results[f'projects/{project}/{rel}'] = b'\n\n'.join(
                f'<!-- source-scope: {key} -->\n'.encode() + raw for key, raw in bodies)
    results['project-identities.json'] = (json.dumps(
        {'version': 1, 'checkouts': plan['checkouts']}, indent=2) + '\n').encode()
    manifest = {'version': 1, 'inputs': provenance,
                'outputs': {name: digest(raw) for name, raw in results.items()}}
    output.mkdir(mode=0o700, parents=True)
    for name, raw in results.items():
        target = output / name
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        target.write_bytes(raw)
        target.chmod(0o600)
        if target.read_bytes() != raw:
            raise ValueError('staging verification failed')
    (output / 'migration-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (output / 'migration-manifest.json').chmod(0o600)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshots', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        manifest = build(args.snapshots, json.loads(args.plan.read_text()), args.output)
    except (ValueError, OSError) as error:
        parser.exit(1, f'migration refused: {error}\n')
    print(f"Staged {len(manifest['outputs'])} files from {len(manifest['inputs'])} source files")


if __name__ == '__main__':
    main()
