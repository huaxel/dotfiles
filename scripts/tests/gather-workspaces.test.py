#!/usr/bin/env python3
"""Run the actual gather script against isolated, stateful IPC."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
GATHER = ROOT / "config-linux/niri/scripts/gather-workspaces.sh"
MOCK = ROOT / "scripts/tests/fixtures/niri-workspaces.py"


class GatherWorkspacesTests(unittest.TestCase):
    def run_gather(self, state):
        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "state.json"
            state_path.write_text(json.dumps(state))
            binary = Path(tmp) / "niri"
            binary.write_text(
                f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(MOCK))} "$@"\n'
            )
            binary.chmod(0o755)
            result = subprocess.run(
                [str(GATHER)], text=True, capture_output=True, timeout=15,
                env={**os.environ, "PATH": f"{tmp}:{os.environ['PATH']}",
                     "NIRI_TEST_STATE": str(state_path)},
            )
            return result, json.loads(state_path.read_text())

    def test_gathers_and_restores_original_focus(self):
        result, state = self.run_gather({
            "monitors": {"DP-4": [3, 5, 1, 2, 4], "HDMI-A-1": [], "DP-1": []},
            "connected": ["DP-4", "HDMI-A-1", "DP-1"], "focus": 5,
        })
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(state["monitors"], {"DP-4": [1, 4, 5], "HDMI-A-1": [2], "DP-1": [3]})
        self.assertEqual(state["focus"], 5)

    def test_missing_and_disabled_monitor_do_not_abort_other_moves(self):
        for disabled in (False, True):
            with self.subTest(disabled=disabled):
                monitors = {"DP-4": [3, 2, 1], "DP-1": []}
                if disabled:
                    monitors["HDMI-A-1"] = []
                result, state = self.run_gather({
                    "monitors": monitors, "connected": ["DP-4", "DP-1"], "focus": 2,
                })
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("output HDMI-A-1 is disconnected or disabled", result.stderr)
                self.assertEqual(state["monitors"]["DP-1"], [3])
                self.assertEqual(state["monitors"]["DP-4"], [1, 2])
                self.assertEqual(state["focus"], 2)
                self.assertNotIn(["focus-monitor", "HDMI-A-1"], state["actions"])

    def test_move_failure_restores_focus_and_preserves_failure_status(self):
        result, state = self.run_gather({
            "monitors": {"DP-4": [1, 2, 3], "HDMI-A-1": [], "DP-1": []},
            "connected": ["DP-4", "HDMI-A-1", "DP-1"], "focus": 1,
            "fail_action": "move-workspace-to-monitor",
        })
        self.assertEqual(result.returncode, 19, result.stderr)
        self.assertEqual(state["focus"], 1)

    def test_hot_unplug_during_gather_restores_focus_by_workspace_id(self):
        cases = (
            # Destination disappears just before the move.
            ("HDMI-A-1", "DP-4", "move-workspace-to-monitor"),
            # Original focus workspace migrates; its old monitor is no longer valid.
            ("DP-1", "DP-4", "move-workspace-to-monitor"),
            # Source disappears between the workspace query and focus command.
            ("DP-4", "DP-1", "focus-monitor"),
        )
        for output, fallback, action in cases:
            with self.subTest(output=output, action=action):
                result, state = self.run_gather({
                    "monitors": {"DP-4": [1, 2], "HDMI-A-1": [], "DP-1": [3, 4]},
                    "connected": ["DP-4", "HDMI-A-1", "DP-1"], "focus": 4,
                    "disconnect_before": {"output": output, "fallback": fallback, "action": action},
                })
                self.assertTrue(state["disconnected"])
                self.assertEqual(result.returncode, 20, result.stderr)
                self.assertEqual(state["focus"], 4)
                self.assertNotIn(output, state["connected"])
                self.assertNotIn("Could not restore", result.stderr)
                if output == "DP-1":
                    self.assertIn(4, state["monitors"][fallback])

    def test_restoration_failure_is_not_reported_as_success(self):
        result, _ = self.run_gather({
            "monitors": {"DP-4": [1], "HDMI-A-1": [2], "DP-1": [3]},
            "connected": ["DP-4", "HDMI-A-1", "DP-1"], "focus": 1,
            "fail_action": "focus-workspace",
        })
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("Could not restore workspace focus", result.stderr)

    def test_sort_failure_restores_focus_and_preserves_failure_status(self):
        result, state = self.run_gather({
            "monitors": {"DP-4": [5, 4, 1], "HDMI-A-1": [2], "DP-1": [3]},
            "connected": ["DP-4", "HDMI-A-1", "DP-1"], "focus": 4,
            "fail_action": "move-workspace-to-index",
        })
        self.assertEqual(result.returncode, 19, result.stderr)
        self.assertEqual(state["focus"], 4)


if __name__ == "__main__":
    unittest.main()
