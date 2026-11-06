#!/usr/bin/env python3
"""Offline deployment and launcher fixtures; no agents, inference, or profile activation."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("agent_setup", ROOT / "scripts/agent_setup.py")
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve() / "home"
        self.root = self.home / "dotfiles"
        for source in set(a.entries(self.root).values()):
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_text("shared source\n")
        (self.root / "bin/pi").chmod(0o755)

    def test_apply_and_repeat(self):
        backup = a.apply_links(self.root, self.home)
        self.assertIsNotNone(backup)
        self.assertEqual(a.check(self.root, self.home), [])
        self.assertIsNone(a.apply_links(self.root, self.home))

    def test_existing_files_preserved(self):
        target = self.home / ".codex/AGENTS.md"
        target.parent.mkdir()
        target.write_text("existing instructions")
        backup = a.apply_links(self.root, self.home)
        self.assertEqual((backup / ".codex/AGENTS.md").read_text(), "existing instructions")
        self.assertTrue(target.samefile(self.root / "AGENTS.md"))

    def test_existing_launcher_symlink_preserved(self):
        target = self.home / ".local/bin/pi"
        target.parent.mkdir(parents=True)
        old = self.home / "old-launcher"
        old.write_text("original launcher")
        target.symlink_to(old)
        backup = a.apply_links(self.root, self.home)
        self.assertEqual((backup / ".local/bin/pi").readlink(), old)
        self.assertEqual(old.read_text(), "original launcher")

    def test_dangling_symlink_preserved(self):
        target = self.home / ".codex/AGENTS.md"
        target.parent.mkdir()
        target.symlink_to("missing-old-target")
        backup = a.apply_links(self.root, self.home)
        self.assertEqual((backup / ".codex/AGENTS.md").readlink(), Path("missing-old-target"))

    def test_directory_collision_preflight(self):
        target = self.home / ".claude/CLAUDE.md"
        target.mkdir(parents=True)
        (target / "keep").write_text("user data")
        with self.assertRaisesRegex(ValueError, "directory"):
            a.apply_links(self.root, self.home)
        self.assertFalse((self.home / ".codex/AGENTS.md").exists())
        self.assertEqual((target / "keep").read_text(), "user data")

    def test_missing_source_preflight(self):
        (self.root / "bin/pi").unlink()
        with self.assertRaisesRegex(ValueError, "missing source"):
            a.apply_links(self.root, self.home)
        self.assertFalse((self.home / ".codex/AGENTS.md").exists())

    def test_override_preserved_and_reported(self):
        override = self.home / ".codex/AGENTS.override.md"
        override.parent.mkdir()
        override.write_text("temporary user override")
        a.apply_links(self.root, self.home)
        self.assertIn("override takes precedence", str(a.check(self.root, self.home)))
        self.assertEqual(override.read_text(), "temporary user override")

    def test_changed_target_not_overwritten(self):
        original = a.fingerprint
        calls = {}
        def changing(path):
            key = str(path)
            calls[key] = calls.get(key, 0) + 1
            if key.endswith(".codex/AGENTS.md") and calls[key] > 1:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("parallel update")
            return original(path)
        from unittest.mock import patch
        with patch.object(a, "fingerprint", side_effect=changing):
            with self.assertRaisesRegex(ValueError, "changed during apply"):
                a.apply_links(self.root, self.home)
        self.assertEqual((self.home / ".codex/AGENTS.md").read_text(), "parallel update")

    def test_missing_package_reported(self):
        settings = self.root / "pi/agent/settings.json"
        settings.write_text(json.dumps({"packages": ["npm:example", "/missing/local-package"]}))
        a.apply_links(self.root, self.home)
        self.assertIn("configured local package missing", str(a.check(self.root, self.home)))

    def test_home_manager_declares_same_sources_without_force(self):
        common = (ROOT / "home/common.nix").read_text()
        for name in a.entries(ROOT):
            self.assertIn(f'home.file."{name}".source', common)
            self.assertNotIn(f'home.file."{name}".force = true', common)


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="agent launch ")
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve() / "home"
        self.root = self.home / "dotfiles"
        self.launcher = self.root / "bin/pi"
        self.launcher.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / "bin/pi", self.launcher)
        self.launcher.chmod(0o755)
        self.agent = self.root / "pi/agent"
        install = self.agent / "install"
        install.mkdir(parents=True)
        (install / "current-version").write_text("1.2.3\n")
        self.release = install / "releases/1.2.3/node_modules/.bin/pi"
        self.release.parent.mkdir(parents=True)
        self.release.write_text(f'''#!{sys.executable}
import os, sys, json
print(json.dumps({{"agent_dir":os.getenv("PI_CODING_AGENT_DIR"),"session_dir":os.getenv("PI_CODING_AGENT_SESSION_DIR"),"install_root":os.getenv("PI_MANAGED_INSTALL_ROOT"),"path":os.getenv("PATH"),"args":sys.argv[1:]}}))
''')
        self.release.chmod(0o755)
        self.tools = self.home / "tools"
        self.tools.mkdir()
        self.tool("uname", '#!/bin/sh\nprintf "%s\\n" "$TEST_OS"\n')
        self.tool("flock", "#!/bin/sh\nexit 0\n")
        self.tool("herdr", "#!/bin/sh\nexit 0\n")
        self.env = {"HOME":str(self.home), "PATH":f"{self.tools}:/usr/bin:/bin", "TEST_OS":"Darwin"}
        self.helper = self.home / "projects/pi-extensions/pi-subagent/index.ts"

    def tool(self, name, text):
        path = self.tools / name
        path.write_text(text)
        path.chmod(0o755)

    def run_launcher(self, args=(), env=None, launcher=None, cwd=None):
        result = subprocess.run([str(launcher or self.launcher), *args], env=env or self.env, cwd=cwd,
                                text=True, capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def enable_linux_fixture(self):
        self.env.update(TEST_OS="Linux", HERDR_ENV="1")
        self.helper.parent.mkdir(parents=True)
        self.helper.write_text("// fixture, never imported\n")

    def test_env_cleared_uses_canonical_profile(self):
        result = self.run_launcher()
        self.assertEqual(result["agent_dir"], str(self.agent))
        self.assertEqual(result["install_root"], str(self.agent / "install"))

    def test_explicit_profile_and_session_override_preserved(self):
        env = {**self.env, "PI_CODING_AGENT_DIR":"/chosen/profile", "PI_CODING_AGENT_SESSION_DIR":"/chosen/sessions"}
        result = self.run_launcher(env=env)
        self.assertEqual(result["agent_dir"], "/chosen/profile")
        self.assertEqual(result["session_dir"], "/chosen/sessions")

    def test_symlink_and_arbitrary_cwd(self):
        link = self.home / ".local/bin/pi"
        link.parent.mkdir(parents=True)
        link.symlink_to("../../dotfiles/bin/pi")
        result = self.run_launcher(launcher=link, cwd=self.home)
        self.assertEqual(result["agent_dir"], str(self.agent))

    def test_relative_invocation(self):
        result = self.run_launcher(launcher=Path("bin/pi"), cwd=self.root)
        self.assertEqual(result["agent_dir"], str(self.agent))

    def test_arguments_are_literal(self):
        args = ["--", "two words", "$(echo not-executed)", "-ne"]
        self.assertEqual(self.run_launcher(args)["args"], args)

    def test_mac_never_loads_linux_helper(self):
        self.enable_linux_fixture()
        self.env["TEST_OS"] = "Darwin"
        self.assertEqual(self.run_launcher(["--print", "Task"])["args"], ["--print", "Task"])

    def test_linux_helper_active_only_with_capabilities(self):
        self.enable_linux_fixture()
        self.assertEqual(self.run_launcher(["--print", "Task"])["args"], ["--extension",str(self.helper),"--print","Task"])

    def test_missing_helper_is_optional(self):
        self.env.update(TEST_OS="Linux", HERDR_ENV="1")
        self.assertEqual(self.run_launcher(["Task"])["args"], ["Task"])

    def test_outside_herdr_does_not_load_helper(self):
        self.enable_linux_fixture()
        del self.env["HERDR_ENV"]
        self.assertEqual(self.run_launcher(["Task"])["args"], ["Task"])

    def test_explicit_profile_does_not_receive_default_helper(self):
        self.enable_linux_fixture()
        self.env["PI_CODING_AGENT_DIR"] = "/chosen/profile"
        self.assertEqual(self.run_launcher(["Task"])["args"], ["Task"])

    def test_opt_out_and_non_session_commands(self):
        self.enable_linux_fixture()
        for args in [["-ne","Task"],["--no-extensions","Task"],["--help"],["--version"],["--list-models"],["update"],["install","npm:example"],["auth","check"]]:
            with self.subTest(args=args):
                self.assertEqual(self.run_launcher(args)["args"], args)

    def test_flags_after_separator_are_prompt_data(self):
        self.enable_linux_fixture()
        result = self.run_launcher(["--", "--no-extensions"])
        self.assertEqual(result["args"], ["--extension",str(self.helper),"--","--no-extensions"])

    def test_installer_node_path_restored(self):
        node = self.home / ".local/share/pi-node/current/bin/node"
        node.parent.mkdir(parents=True)
        node.write_text("#!/bin/sh\nexit 0\n")
        node.chmod(0o755)
        self.assertTrue(self.run_launcher()["path"].startswith(str(node.parent) + ":"))

    def test_mise_node_fallback_when_path_is_reset(self):
        self.env["PATH"] = str(self.tools)
        node = self.home / ".local/share/mise/shims/node"
        node.parent.mkdir(parents=True)
        node.write_text("#!/bin/sh\nexit 0\n")
        node.chmod(0o755)
        self.assertTrue(self.run_launcher()["path"].startswith(str(node.parent) + ":"))

    def test_missing_host_capabilities_disable_helper(self):
        self.enable_linux_fixture()
        self.env["PATH"] = str(self.tools)
        for name in ["herdr", "flock"]:
            path = self.tools / name
            path.chmod(0o644)
            with self.subTest(missing=name):
                self.assertEqual(self.run_launcher(["Task"])["args"], ["Task"])
            path.chmod(0o755)

    def test_invalid_release_identifier_rejected(self):
        (self.agent / "install/current-version").write_text("../../outside\n")
        result = subprocess.run([str(self.launcher)], env=self.env, text=True, capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("version is invalid", result.stderr)


if __name__ == "__main__":
    unittest.main()
