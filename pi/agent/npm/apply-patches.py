#!/usr/bin/env python3
"""Apply reviewed package patches without running installed package code."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
TIDY = '@mobrienv/pi-tidy-tools'


def regular_file(root: Path, relative: str) -> Path:
    path = root / relative
    if path.resolve() != path or not path.is_file():
        raise ValueError(f'refusing missing or symlinked package file: {relative}')
    return path


def manifest(root: Path, name: str, version: str, snapshots: dict) -> dict:
    path = regular_file(root, f'node_modules/{name}/package.json')
    raw = path.read_bytes()
    snapshots[path] = raw
    data = json.loads(raw)
    if not isinstance(data, dict) or data.get('name') != name or data.get('version') != version:
        raise ValueError(f'{name}: expected reviewed version {version}; review patches before upgrading')
    return data


def upstream_tidy(root: Path, snapshots: dict) -> None:
    data = manifest(root, TIDY, '0.5.4', snapshots)
    for field in ('dependencies', 'optionalDependencies', 'peerDependencies'):
        if not isinstance(data.get(field, {}), dict):
            raise ValueError(f'tidy-tools: malformed {field}')
    if 'typebox' in data.get('dependencies', {}) or 'typebox' in data.get('optionalDependencies', {}):
        raise ValueError('tidy-tools must not install its own runtime TypeBox')
    if data.get('peerDependencies', {}).get('typebox') != '*':
        raise ValueError('tidy-tools must use the host-provided TypeBox peer')
    private = root / 'node_modules' / TIDY / 'node_modules/typebox'
    if private.exists() or private.is_symlink():
        raise ValueError('stale private TypeBox exists; preserve/reconcile it manually (nothing is deleted)')


def patch_identity(path: Path) -> tuple[str, str]:
    match = re.fullmatch(r'(@[A-Za-z0-9_.-]+\+[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+)\+(\d+\.\d+\.\d+)\.patch', path.name)
    if not match or path.is_symlink():
        raise ValueError(f'unreviewed patch filename: {path.name}')
    return match[1].replace('+', '/'), match[2]


def patch_paths(text: str, name: str) -> list[str]:
    paths, before, after = [], [], []
    for line in text.splitlines():
        if line.startswith('diff --git '):
            match = re.fullmatch(r'diff --git a/(\S+) b/(\S+)', line)
            if not match or match[1] != match[2]:
                raise ValueError('only same-path text modifications are supported')
            target = match[1]
            parts = PurePosixPath(target).parts
            if ('..' in parts or '\\' in target or not target.startswith(f'node_modules/{name}/')
                    or target.startswith('/') or target in paths):
                raise ValueError('patch target escapes its declared package')
            paths.append(target)
        elif line.startswith('--- '):
            before.append(line[4:])
        elif line.startswith('+++ '):
            after.append(line[4:])
        elif line.startswith(('new file mode ', 'deleted file mode ', 'old mode ', 'new mode ',
                              'rename from ', 'copy from ', 'GIT binary patch', 'Binary files ')):
            raise ValueError('file creation/deletion/renames/mode changes are unsupported')
    if not paths or before != ['a/'+p for p in paths] or after != ['b/'+p for p in paths]:
        raise ValueError('patch file headers must match declared targets')
    return paths


def git_command(stage: Path, *args: str) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull,
               GIT_TERMINAL_PROMPT='0')
    return subprocess.run(['git', '-C', str(stage), *args],
                          env=env, text=True, capture_output=True, check=False)


def git_apply(stage: Path, patch: Path, *args: str) -> subprocess.CompletedProcess:
    return git_command(stage, 'apply', '--whitespace=nowarn', *args, str(patch))


def apply(root: Path, patches: Path, check: bool = False) -> list[str]:
    root = root.resolve(strict=True)
    snapshots: dict[Path, bytes] = {}
    upstream_tidy(root, snapshots)
    patch_files = sorted(patches.glob('*.patch'))
    if not patch_files:
        raise ValueError('no reviewed patches found')
    changed: dict[Path, bytes] = {}
    states = []
    with tempfile.TemporaryDirectory(prefix='pi-patch-preflight-') as temporary:
        stage = Path(temporary)
        # Own the repository root even if TMPDIR is inside another worktree;
        # git apply in a foreign subdirectory can silently ignore all targets.
        initialized = git_command(stage, 'init', '--quiet', '--template=')
        if initialized.returncode:
            raise ValueError(f'cannot initialize private patch staging: {initialized.stderr.strip()}')
        owners = set()
        for patch in patch_files:
            name, version = patch_identity(patch)
            if name in owners:
                raise ValueError(f'duplicate patch owner: {name}')
            owners.add(name)
            manifest(root, name, version, snapshots)
            # Freeze the reviewed patch too; git never reads a mutable artifact.
            frozen = stage / patch.name
            frozen.write_bytes(patch.read_bytes())
            targets = patch_paths(frozen.read_text(encoding='utf-8'), name)
            for target in targets:
                source = regular_file(root, target)
                snapshots[source] = source.read_bytes()
                staged = stage / target
                staged.parent.mkdir(parents=True, exist_ok=True)
                staged.write_bytes(snapshots[source])
            if git_apply(stage, frozen, '--reverse', '--check').returncode == 0:
                states.append(f'{name}@{version}: already applied')
                continue
            probe = git_apply(stage, frozen, '--check')
            if probe.returncode:
                raise ValueError(f'{name}@{version}: patch drift/partial application; no files written\n{probe.stderr.strip()}')
            result = git_apply(stage, frozen)
            if result.returncode:
                raise ValueError(f'{name}@{version}: staging failed; no files written\n{result.stderr.strip()}')
            for target in targets:
                changed[root / target] = (stage / target).read_bytes()
            states.append(f'{name}@{version}: needs application' if check else f'{name}@{version}: applied')
        # All package/version/context checks finish before modifying any source.
        for path, raw in snapshots.items():
            if path.resolve() != path or not path.is_file() or path.read_bytes() != raw:
                raise ValueError('package files changed during patch preflight; refusing writes')
        if check and changed:
            raise ValueError('patches are missing; run install-and-patch.sh patch')
        for path, raw in changed.items():
            if path.read_bytes() != snapshots[path]:
                raise ValueError('package file changed before replacement')
            mode = stat.S_IMODE(path.stat().st_mode)
            # Atomic per file, not a filesystem transaction across the install.
            # An I/O failure may leave a partially patched install; fail closed.
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.pi-patch-', delete=False) as handle:
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
                os.chmod(handle.name, mode)
                replacement = Path(handle.name)
            os.replace(replacement, path)
    return states


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=HERE)
    parser.add_argument('--check', action='store_true', help='verify patches are already applied; never write package files')
    args = parser.parse_args()
    try:
        for state in apply(args.root, HERE/'patches', args.check):
            print(state)
        print('tidy-tools 0.5.4 upstream TypeBox invariant verified; no lifecycle scripts or package deletions')
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f'Patch verification failed: {error}\n')


if __name__ == '__main__':
    main()
