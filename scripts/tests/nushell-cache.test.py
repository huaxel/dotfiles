#!/usr/bin/env python3
"""The Nushell integration cache has to be reachable from every launch path.

`$nu.cache-dir` is fixed from the environment the Nushell process inherits, not
from env.nu: a terminal spawned by Finder or Rex (no XDG_CACHE_HOME) resolves
macOS' platform default ~/Library/Caches/nushell, while one spawned from an
already configured shell resolves ~/.cache/nushell. config.nu sources
`$nu.cache-dir/<tool>.nu` behind `path exists` guards, so when the two diverge
one of those sessions silently loses every integration (no prompt, no fzf /
zoxide / atuin bindings) - the failure looks like "new shells need `exec nu`".

setup-nushell.sh canonicalises to the XDG directory and links the platform path
to it. These tests run the real generator against a throwaway HOME so the link
logic, its idempotency, and the "don't clobber a real directory" branch are
exercised without touching the live cache.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "setup-nushell.sh"


def generate(home):
    """Run the generator with a throwaway HOME and no inherited XDG_CACHE_HOME."""
    env = {key: value for key, value in os.environ.items() if key != "XDG_CACHE_HOME"}
    env["HOME"] = str(home)
    return subprocess.run(
        ["bash", str(SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )


@unittest.skipUnless(sys.platform == "darwin", "macOS platform cache path")
@unittest.skipUnless(shutil.which("nu"), "nu required")
class CacheDirTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve() / "home"
        self.home.mkdir()
        self.integrations = self.home / ".cache" / "nushell"
        self.platform = self.home / "Library" / "Caches" / "nushell"

    def test_platform_path_links_to_xdg_cache(self):
        result = generate(self.home)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.integrations.is_dir(), "integrations were not generated in the XDG cache")
        self.assertTrue(self.platform.is_symlink(), f"{self.platform} should be a symlink")
        self.assertEqual(self.platform.resolve(), self.integrations.resolve())

    def test_repeat_run_is_idempotent(self):
        self.assertEqual(generate(self.home).returncode, 0)
        second = generate(self.home)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertTrue(self.platform.is_symlink())
        self.assertEqual(self.platform.resolve(), self.integrations.resolve())

    def test_real_directory_is_reported_not_replaced(self):
        self.platform.mkdir(parents=True)
        sentinel = self.platform / "user-file"
        sentinel.write_text("keep me\n")
        result = generate(self.home)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.platform.is_symlink(), "a real directory must not be replaced")
        self.assertEqual(sentinel.read_text(), "keep me\n")
        self.assertIn("real directory", result.stdout)


if __name__ == "__main__":
    unittest.main()
