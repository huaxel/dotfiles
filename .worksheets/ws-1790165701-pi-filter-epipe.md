
- Installed Bun and reran the gate: all package typechecks/tests passed (56 tests total), including the multi-account package.
- The gate exposed a real packaging issue: `pi-multi-opencode-go` directly imports `typebox` but only received it transitively. Added `typebox ^1.3.7` as a direct dependency and updated `package-lock.json`.
- Recovery tests remain blocked on Windows because `rsync` is unavailable to Git Bash. WSL has Linux rsync, but it is not a Windows executable visible to the subprocess. ShellCheck and Deno remain skipped because they are not installed.
