#!/usr/bin/env python3
"""Deterministic checks for the read-only memory MCP server.

Runs against a synthetic memory tree in a temp directory, never the owner's
real memory, so the assertions do not depend on what happens to be recorded.
"""
from pathlib import Path
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

SERVER = Path(__file__).resolve().parents[2] / "skills" / "dream" / "scripts" / "memory-mcp.py"


def load_server(memory_dir: Path):
    """Import the server module pointed at a temp memory tree."""
    os.environ["PI_MEMORY_DIR"] = str(memory_dir)
    spec = importlib.util.spec_from_file_location("memory_mcp", SERVER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MemoryMcpTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        # Resolve so comparisons match the server, which resolves MEM_DIR
        # (macOS reports /var/folders paths as /private/var/folders).
        self.root = Path(self.tmp.name).resolve()
        (self.root / "daily").mkdir()
        (self.root / "archive").mkdir()
        (self.root / "dream").mkdir()
        (self.root / "projects" / "alpha" / "daily").mkdir(parents=True)
        (self.root / "MEMORY.md").write_text(
            "<!-- INDEX START -->\n# INDEX\n<!-- INDEX END -->\n\n"
            "## Memory sync uses a merge driver\n"
            "#sync #decision\n"
            "The memory index merge driver unions entry blocks so two machines\n"
            "appending never produce conflict markers.\n",
            encoding="utf-8",
        )
        (self.root / "SCRATCHPAD.md").write_text("# Scratchpad\n\n- [ ] pending item\n", encoding="utf-8")
        (self.root / "daily" / "2026-01-01.md").write_text(
            "# Daily\n\n## Notes\n\nPlaywright browser test isolation notes.\n", encoding="utf-8"
        )
        (self.root / "archive" / "2026-01.md").write_text("# Archive\n\nsettled episode\n", encoding="utf-8")
        (self.root / "projects" / "alpha" / "MEMORY.md").write_text(
            "# Alpha\n\n## Alpha project\n\nalpha-specific fact\n", encoding="utf-8"
        )
        (self.root / "projects" / "alpha" / "daily" / "2026-01-02.md").write_text(
            "# Alpha daily\n\nalpha daily detail\n", encoding="utf-8"
        )
        # Must never be indexed: local fragments and git internals.
        (self.root / "dream" / "pending.md").write_text("secret fragment\n", encoding="utf-8")
        (self.root / ".git").mkdir()
        (self.root / ".git" / "config").write_text("remote\n", encoding="utf-8")
        self.server = load_server(self.root)

    def tearDown(self):
        self.tmp.cleanup()
        os.environ.pop("PI_MEMORY_DIR", None)

    def test_indexes_expected_files_only(self):
        files = {str(p.relative_to(self.root)) for p in self.server.memory_files()}
        self.assertEqual(
            files,
            {
                "MEMORY.md",
                "SCRATCHPAD.md",
                "daily/2026-01-01.md",
                "archive/2026-01.md",
                "projects/alpha/MEMORY.md",
                "projects/alpha/daily/2026-01-02.md",
            },
        )

    def test_refuses_paths_outside_the_clone(self):
        for bad in ("../MEMORY.md", "/etc/passwd", "dream/pending.md", "missing.md", ""):
            self.assertIsNone(self.server.safe_path(bad), bad)
        self.assertIsNotNone(self.server.safe_path("MEMORY.md"))

    def test_search_ranks_the_relevant_entry_first(self):
        results = self.server.search("memory sync merge driver", 5)
        self.assertTrue(results)
        self.assertEqual(results[0]["file"], "MEMORY.md")
        self.assertEqual(results[0]["heading"], "Memory sync uses a merge driver")

    def test_search_scores_descend_and_stay_inside(self):
        results = self.server.search("playwright browser isolation", 5)
        self.assertTrue(results)
        for earlier, later in zip(results, results[1:]):
            self.assertGreaterEqual(earlier["score"], later["score"])
        for result in results:
            self.assertFalse(result["file"].startswith(("/", "..")))

    def test_search_without_terms_returns_nothing(self):
        self.assertEqual(self.server.search("   ", 5), [])

    def test_read_returns_numbered_range(self):
        got = self.server.read_file("MEMORY.md", 1, 2)
        self.assertEqual(got["start"], 1)
        self.assertEqual(got["end"], 2)
        self.assertTrue(got["content"].startswith("1: "))

    def test_read_rejects_outside_paths(self):
        with self.assertRaises(ValueError):
            self.server.read_file("../MEMORY.md")

    def test_tool_surface_has_no_write_capability(self):
        names = {tool["name"] for tool in self.server.TOOLS}
        self.assertEqual(names, {"memory_search", "memory_read", "memory_list"})
        for tool in self.server.TOOLS:
            self.assertNotIn("write", tool["name"])
            self.assertNotIn("delete", tool["name"])

    def test_notifications_are_never_answered(self):
        self.assertIsNone(self.server.handle({"jsonrpc": "2.0", "method": "notifications/initialized"}))
        self.assertIsNone(self.server.handle({"jsonrpc": "2.0", "method": "notifications/cancelled"}))

    def test_unknown_method_errors(self):
        response = self.server.handle({"jsonrpc": "2.0", "id": 9, "method": "nope"})
        self.assertEqual(response["error"]["code"], -32601)

    def test_tool_error_is_reported_not_fatal(self):
        response = self.server.handle(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "memory_read", "arguments": {"path": "../etc/passwd"}},
            }
        )
        self.assertTrue(response["result"]["isError"])

    def test_stdio_round_trip(self):
        """The real transport: newline-delimited JSON over stdin/stdout."""
        requests = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "memory_search", "arguments": {"query": "merge driver"}},
            },
        ]
        payload = "\n".join(json.dumps(r) for r in requests) + "\n"
        proc = subprocess.run(
            [sys.executable, str(SERVER)],
            input=payload,
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, "PI_MEMORY_DIR": str(self.root)},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        responses = [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
        by_id = {r["id"]: r for r in responses}
        self.assertEqual(set(by_id), {1, 2, 3}, "notification must not produce a response")
        self.assertEqual(by_id[1]["result"]["serverInfo"]["name"], "pi-memory")
        self.assertEqual(
            [t["name"] for t in by_id[2]["result"]["tools"]],
            ["memory_search", "memory_read", "memory_list"],
        )
        hits = json.loads(by_id[3]["result"]["content"][0]["text"])
        self.assertEqual(hits[0]["file"], "MEMORY.md")

    def test_selftest_mode_passes(self):
        proc = subprocess.run(
            [sys.executable, str(SERVER), "--selftest"],
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, "PI_MEMORY_DIR": str(self.root)},
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
