#!/usr/bin/env python3
"""Exercise desktop configuration without opening a lock screen."""
import configparser
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / "config-linux/desktop/scripts/lock.sh"


class DesktopLockTests(unittest.TestCase):
    def test_lock_arguments(self):
        for wallpaper_exists in (False, True):
            with self.subTest(wallpaper_exists=wallpaper_exists), tempfile.TemporaryDirectory() as tmp:
                home = Path(tmp) / "home with spaces"
                wallpaper = home / "Pictures/mountains-bg.jpg"
                wallpaper.parent.mkdir(parents=True)
                if wallpaper_exists:
                    wallpaper.touch()
                binary = Path(tmp) / "swaylock"
                binary.write_text(
                    "#!/usr/bin/env python3\n"
                    "import json, sys\n"
                    "print(json.dumps(sys.argv[1:]))\n"
                )
                binary.chmod(0o755)
                result = subprocess.run(
                    [str(LOCK)], check=True, text=True, capture_output=True,
                    env={**os.environ, "HOME": str(home), "PATH": f"{tmp}:{os.environ['PATH']}"},
                )
                args = json.loads(result.stdout)
                self.assertIn("--daemonize", args)
                self.assertEqual(args[args.index("--color") + 1], "282a36")
                self.assertEqual("--image" in args, wallpaper_exists)
                if wallpaper_exists:
                    self.assertEqual(args[args.index("--image") + 1], str(wallpaper))
                for index, arg in enumerate(args):
                    if arg.endswith("-color") or arg == "--color":
                        self.assertRegex(args[index + 1], r"^(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

    def test_niri_portal_routing(self):
        preferences = configparser.ConfigParser()
        preferences.read(ROOT / "config-linux/niri/portals.conf")
        self.assertEqual(preferences["preferred"]["default"], "gnome;gtk;")
        self.assertEqual(
            preferences["preferred"]["org.freedesktop.impl.portal.FileChooser"], "gtk;"
        )
        config = (ROOT / "config-linux/niri/config.kdl").read_text()
        self.assertNotIn("spawn-sh-at-startup \"dbus-update-activation-environment", config)
        instructions = (ROOT / "config-linux/niri/README.md").read_text()
        self.assertIn("niri-session", instructions)
        self.assertIn("graphical-session.target", instructions)
        host = (ROOT / "home/framearch.nix").read_text()
        self.assertIn("../config-linux/niri/portals.conf", host)
        shared = (ROOT / "home/linux-desktop.nix").read_text()
        self.assertNotIn("niri/portals.conf", shared)

    def test_shared_helper_paths_are_migrated(self):
        for directory in ("home", "config-linux"):
            for path in (ROOT / directory).rglob("*"):
                if path.is_file():
                    self.assertIsNone(
                        re.search(r"sway/scripts/(?:lock\.sh|walker-files\.sh|wofi-bluetooth)", path.read_text()),
                        str(path),
                    )


if __name__ == "__main__":
    unittest.main()
