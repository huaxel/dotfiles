#!/usr/bin/env python3
"""Configure local merge policy, including overrides for old tracked attributes."""
from pathlib import Path
import shlex
import subprocess

RULES = ('MEMORY.md merge=memory-index\n'
         'SCRATCHPAD.md merge=memory-index\n'
         '**/daily/*.md merge=memory-index\n')


def main():
    driver = Path(__file__).resolve().with_name('merge-memory-index.py')
    subprocess.run(['git', 'config', 'merge.memory-index.driver',
                    f'{shlex.quote(str(driver))} %O %A %B'], check=True)
    # Local attributes outrank tracked attributes, and remain active during
    # rebase/autostash and when an offline machine has the old union rules.
    path = Path(subprocess.check_output(
        ['git', 'rev-parse', '--git-path', 'info/attributes'], text=True).strip())
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = path.read_text() if path.exists() else ''
    if not existing.endswith(RULES):
        path.write_text(existing + ('\n' if existing and not existing.endswith('\n') else '') + RULES)


if __name__ == '__main__':
    main()
