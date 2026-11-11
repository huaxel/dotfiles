#!/usr/bin/env python3
"""Exercise the managed qmd launcher without models, SQLite, or credentials."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / "bin/qmd"
QUIET_KEYS = ("LLAMA_LOG_LEVEL", "GGML_LOG_LEVEL", "GGML_BACKEND_SILENT")


@unittest.skipIf(os.name == "nt", "POSIX launcher, deployed only on Linux")
class QmdLauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "home with spaces"
        self.home.mkdir()
        self.bins = self.root / "bin"
        self.bins.mkdir()
        self.entry = self.home / ".bun/install/global/node_modules/@tobilu/qmd/dist/cli/qmd.js"
        self.entry.parent.mkdir(parents=True)
        self.entry.write_text("// inert fixture\n")
        self.node = self.bins / "node"
        self.node.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys\n"
            "keys = ('LLAMA_LOG_LEVEL', 'GGML_LOG_LEVEL', 'GGML_BACKEND_SILENT')\n"
            "print(json.dumps({'args': sys.argv[1:], 'pid': os.getpid(), "
            "'quiet': {k: os.environ.get(k) for k in keys}}))\n"
            "sys.exit(int(os.environ.get('TEST_NODE_EXIT', '0')))\n"
        )
        self.node.chmod(0o755)
        self.env = {k: v for k, v in os.environ.items()
                    if k not in (*QUIET_KEYS, "BUN_INSTALL", "TEST_NODE_EXIT")}
        self.env.update(HOME=str(self.home), PATH=f"{self.bins}:{os.environ['PATH']}")

    def run_launcher(self, *args, env=None):
        return subprocess.run([str(LAUNCHER), *args], env=env or self.env,
                              text=True, capture_output=True, timeout=10)

    def test_arguments_are_literal_and_stdout_is_clean(self):
        args = ["vsearch", "missing evidence; $(false)", "-c", "collection with spaces"]
        result = self.run_launcher(*args)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["args"], [str(self.entry), *args])
        self.assertEqual(result.stderr, "")
        self.assertEqual(json.loads(result.stdout)["quiet"], dict.fromkeys(QUIET_KEYS))

    def test_mcp_quiet_defaults_and_empty_values(self):
        for values in ({}, dict.fromkeys(QUIET_KEYS, "")):
            result = self.run_launcher("mcp", "--stdio", env={**self.env, **values})
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["quiet"],
                             dict(zip(QUIET_KEYS, ("error", "error", "1"))))

    def test_mcp_preserves_explicit_settings(self):
        custom = dict(zip(QUIET_KEYS, ("warn", "debug", "0")))
        result = self.run_launcher("mcp", env={**self.env, **custom})
        self.assertEqual(json.loads(result.stdout)["quiet"], custom)

    def test_bun_install_override(self):
        alternate = self.root / "other bun installation"
        entry = alternate / "install/global/node_modules/@tobilu/qmd/dist/cli/qmd.js"
        entry.parent.mkdir(parents=True)
        entry.write_text("// inert fixture\n")
        result = self.run_launcher("status", env={**self.env, "BUN_INSTALL": str(alternate)})
        self.assertEqual(json.loads(result.stdout)["args"], [str(entry), "status"])

    def test_missing_package_fails_without_fallback(self):
        self.entry.unlink()
        result = self.run_launcher("doctor")
        self.assertEqual(result.returncode, 78)
        self.assertEqual(result.stdout, "")
        self.assertIn("missing Bun-global CLI entry", result.stderr)

    def test_missing_node_fails_without_fallback(self):
        self.node.unlink()
        (self.bins / "bash").symlink_to(shutil.which("bash"))
        result = self.run_launcher("doctor", env={**self.env, "PATH": str(self.bins)})
        self.assertEqual(result.returncode, 127)
        self.assertEqual(result.stdout, "")
        self.assertIn("Node.js is required", result.stderr)

    def test_exec_preserves_pid_and_exit_status(self):
        process = subprocess.Popen([str(LAUNCHER), "status"], text=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   env={**self.env, "TEST_NODE_EXIT": "23"})
        try:
            out, err = process.communicate(timeout=10)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
        self.assertEqual(process.returncode, 23, err)
        self.assertEqual(json.loads(out)["pid"], process.pid)

    def test_deployment_is_linux_only_and_out_of_store(self):
        source = (ROOT / "home/common.nix").read_text()
        self.assertIn('home.file.".local/bin/qmd" = lib.mkIf pkgs.stdenv.hostPlatform.isLinux', source)
        self.assertIn('${config.home.homeDirectory}/dotfiles/bin/qmd', source)
        gate = (ROOT / "justfile").read_text()
        for target in ("ci:", "ci-public:"):
            line = next(line for line in gate.splitlines() if line.startswith(target))
            self.assertIn("check-qmd", line.split())
        self.assertIn("python3 scripts/tests/qmd-launcher.test.py", gate)


if __name__ == "__main__":
    unittest.main()
