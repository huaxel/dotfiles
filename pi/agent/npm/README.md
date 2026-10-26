# Reviewed Pi package patches

This directory is the source for explicit local patch maintenance. Runtime
`package.json`, lockfiles and `node_modules` are machine-local/ignored; do not
copy registry credentials into test fixtures or track them.

## Safe entrypoint

Requires npm, Python 3 and Git:

```bash
bash pi/agent/npm/install-and-patch.sh          # install without hooks, then patch
bash pi/agent/npm/install-and-patch.sh patch    # restore reviewed patches after an update
bash pi/agent/npm/install-and-patch.sh check    # read-only readiness check
```

`ci` is also supported for an intentionally clean, locked install. **npm ci
replaces node_modules**; use a disposable directory for rehearsal, not the live
installation. Both installation modes force `--ignore-scripts` and
`--legacy-peer-deps`. Extra npm arguments are rejected. No hooks are approved,
`npx` is not used, and stale package copies are never deleted automatically.
Native dependencies needing install hooks require a separate reviewed decision.

`apply-patches.py` checks exact package names/versions and every patch context in
a private staging directory before writing package files. It accepts already
applied patches, rejects drift/partial application and observed concurrent
changes, and refuses symlinked targets. A symlink to the npm root itself is
supported. Replacements are atomic **per file**, not an installation-wide
transaction; I/O failures can leave a partial installation and return failure.

## Supported state

- **pi-memory 0.4.2:** retain `patches/pi-memory+0.4.2.patch`, including per-project
  memory isolation. Plain `npm ci --ignore-scripts` does not restore this patch;
  follow it with the explicit patch step.
- **tidy-tools 0.5.4:** the published package already moved TypeBox from runtime
  dependencies to a `typebox: "*"` peer. The old 0.5.3 manifest patch is obsolete
  and removed. The helper verifies the upstream invariant and absence of the
  stale private TypeBox directory without deleting user data.

New versions must be reviewed before updating these checks/patches. This workflow
covers the versioned patch set only; the optional `bin/patch-tidy-pi-fff` adapter
transform remains separate and is not automatically executed.

## Verification

```bash
python3 scripts/tests/pi-npm-patches.test.py
PI_PATCH_REHEARSE=1 python3 scripts/tests/pi-npm-patches.test.py
```

The default tests are offline and run in `just ci`. The opt-in rehearsal uses a
fresh temporary npm installation pinned to the supported direct versions, with a
controlled root postinstall sentinel to prove hooks stay disabled. It verifies
that freshly patched pi-memory source matches the current reviewed live source,
then verifies idempotence/readiness. It never reinstalls or mutates the live
package tree. Its lockfile is generated for the rehearsal, so this does not
prove reproducibility of the entire transitive dependency tree across time.
The live tree is a comparison reference, not a replacement for reviewing the
patch; tests do not certify all extension runtime behavior.
