#!/usr/bin/env python3
"""Test the Rex-only Codex launcher without credentials or model calls."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / "bin/codex-rex"


@unittest.skipIf(os.name == "nt", "macOS POSIX launcher")
class CodexRexTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.binary = Path(self.temp.name) / "fake codex"
        self.binary.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "print(json.dumps(sys.argv[1:]))\n"
            "sys.exit(int(os.environ.get('TEST_CODEX_EXIT', '0')))\n"
        )
        self.binary.chmod(0o755)
        self.env = {k: v for k, v in os.environ.items()
                    if k not in ("REX_BLOCK", "CODEX_REX_BIN", "TEST_CODEX_EXIT")}
        self.env["CODEX_REX_BIN"] = str(self.binary)

    def run_launcher(self, args, **env):
        return subprocess.run([str(LAUNCHER), *args], env={**self.env, **env},
                              capture_output=True, text=True, timeout=5)

    def test_outside_rex_is_unchanged(self):
        for env in ({}, {"REX_BLOCK": ""}):
            result = self.run_launcher(["resume", "session-id"], **env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), ["resume", "session-id"])
            self.assertEqual(result.stderr, "")

    def test_inside_rex_adds_no_daemon(self):
        for args in ([], ["resume", "session-id"], ["--version"]):
            result = self.run_launcher(args, REX_BLOCK="block:test")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), ["--no-daemon", *args])

    def test_existing_flag_is_not_duplicated(self):
        args = ["--no-daemon", "resume", "session-id"]
        result = self.run_launcher(args, REX_BLOCK="block:test")
        self.assertEqual(json.loads(result.stdout), args)

    def test_prompt_after_option_terminator_is_not_a_flag(self):
        args = ["--", "--no-daemon"]
        result = self.run_launcher(args, REX_BLOCK="block:test")
        self.assertEqual(json.loads(result.stdout), ["--no-daemon", *args])

    def test_arguments_remain_literal(self):
        args = ["resume", "id with spaces", "it's $HOME; $(false) `false` 日本"]
        result = self.run_launcher(args, REX_BLOCK="block:test")
        self.assertEqual(json.loads(result.stdout), ["--no-daemon", *args])

    def test_exit_status_is_preserved(self):
        result = self.run_launcher(["--version"], TEST_CODEX_EXIT="23")
        self.assertEqual(result.returncode, 23)

    def test_missing_binary_has_actionable_error(self):
        result = self.run_launcher([], CODEX_REX_BIN=str(self.binary.parent / "missing"))
        self.assertEqual(result.returncode, 127)
        self.assertIn("Codex executable not found:", result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
