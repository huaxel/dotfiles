#!/usr/bin/env python3
"""The apply script must make the three observed wipes impossible.

Each test reproduces a real failure from 2026-11-09: a proposal that would
truncate the file, reorder it, or damage text outside the INDEX markers.
"""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "dream" / "scripts" / "memory-apply.py"

MEMORY = """<!-- INDEX START — maintained -->
# INDEX (2026-11-09)
**Active**: something
<!-- INDEX END -->

<!-- 2026-11-01 -->
## First entry
body one

<!-- 2026-11-02 -->
## Second entry
body two
"""


class MemoryApplyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.memory = self.root / "MEMORY.md"
        self.memory.write_text(MEMORY)
        self.checkpoints = self.root / "checkpoints"

    def tearDown(self):
        self.tmp.cleanup()

    def run_apply(self, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--file", str(self.memory), *args],
            capture_output=True,
            text=True,
            timeout=60,
        )

    def propose(self, name, text):
        path = self.root / name
        path.write_text(text)
        return str(path)

    # --- append -----------------------------------------------------------
    def test_append_preserves_every_original_byte(self):
        before = self.memory.read_text()
        proposal = self.propose("add.md", "\n<!-- 2026-11-09 -->\n## New entry\nnew body\n")
        result = self.run_apply("--append", proposal)
        self.assertEqual(result.returncode, 0, result.stderr)
        after = self.memory.read_text()
        self.assertTrue(after.startswith(before), "original content must be an intact prefix")
        self.assertIn("## New entry", after)

    def test_empty_proposal_changes_nothing(self):
        before = self.memory.read_text()
        proposal = self.propose("empty.md", "   \n\n")
        result = self.run_apply("--append", proposal)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.memory.read_text(), before)

    # --- index ------------------------------------------------------------
    def test_index_replaces_only_the_marked_region(self):
        before = self.memory.read_text()
        proposal = self.propose("index.md", "# INDEX (2026-11-10)\n**Active**: rewritten\n")
        result = self.run_apply("--index", proposal)
        self.assertEqual(result.returncode, 0, result.stderr)
        after = self.memory.read_text()
        self.assertIn("**Active**: rewritten", after)
        self.assertNotIn("**Active**: something", after)
        # Everything after the END marker must be byte-identical.
        tail_before = before[before.index("<!-- INDEX END -->") :]
        tail_after = after[after.index("<!-- INDEX END -->") :]
        self.assertEqual(tail_before, tail_after)
        self.assertIn("## Second entry", after)

    def test_index_proposal_with_markers_is_refused(self):
        before = self.memory.read_text()
        proposal = self.propose("bad.md", "<!-- INDEX START -->\nsneaky\n<!-- INDEX END -->\n")
        result = self.run_apply("--index", proposal)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.memory.read_text(), before, "file must be untouched")

    def test_index_without_markers_prepends_and_keeps_content(self):
        """A file with no INDEX gets one added; nothing may be lost."""
        body = "# no markers here\n\n<!-- 2026-11-01 -->\n## Entry\nbody\n"
        self.memory.write_text(body)
        proposal = self.propose("index.md", "# INDEX\n**Active**: x\n")
        result = self.run_apply("--index", proposal)
        self.assertEqual(result.returncode, 0, result.stderr)
        after = self.memory.read_text()
        self.assertTrue(after.endswith(body))
        self.assertIn("**Active**: x", after)

    def test_empty_index_proposal_is_refused(self):
        before = self.memory.read_text()
        proposal = self.propose("blank.md", "\n\n")
        result = self.run_apply("--index", proposal)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.memory.read_text(), before)

    def test_index_is_added_when_the_file_has_none(self):
        """14 of 15 project memory files had no INDEX at all."""
        body = "<!-- 2026-11-01 -->\n## Entry\nbody\n"
        self.memory.write_text(body)
        proposal = self.propose("index.md", "# INDEX (2026-11-10)\n**Active**: demo\n")
        result = self.run_apply("--index", proposal)
        self.assertEqual(result.returncode, 0, result.stderr)
        after = self.memory.read_text()
        self.assertTrue(after.startswith("<!-- INDEX START"))
        self.assertTrue(after.endswith(body), "existing content must be preserved verbatim")
        self.assertIn("**Active**: demo", after)

    def test_legacy_marker_pair_is_replaced(self):
        legacy = "<!-- INDEX -->\nold index\n<!-- /INDEX -->\n\n<!-- 2026-11-01 -->\n## E\nbody\n"
        self.memory.write_text(legacy)
        proposal = self.propose("index.md", "# INDEX (2026-11-10)\n**Active**: new\n")
        result = self.run_apply("--index", proposal)
        self.assertEqual(result.returncode, 0, result.stderr)
        after = self.memory.read_text()
        self.assertIn("**Active**: new", after)
        self.assertNotIn("old index", after)
        self.assertTrue(after.endswith("<!-- 2026-11-01 -->\n## E\nbody\n"))

    # --- the wipe scenarios ----------------------------------------------
    def test_truncating_proposal_cannot_be_expressed_as_an_append(self):
        """The three real wipes replaced the file with ~500 bytes."""
        before = self.memory.read_text()
        proposal = self.propose("wipe.md", "<!-- INDEX START -->\n# INDEX\n<!-- INDEX END -->\n")
        result = self.run_apply("--append", proposal)
        self.assertEqual(result.returncode, 0, result.stderr)
        after = self.memory.read_text()
        # The append is harmless precisely because it cannot delete.
        self.assertTrue(after.startswith(before))
        self.assertGreater(len(after), len(before))

    def test_missing_file_is_refused(self):
        self.memory.unlink()
        proposal = self.propose("add.md", "x\n")
        result = self.run_apply("--append", proposal)
        self.assertEqual(result.returncode, 1)

    def test_both_modes_at_once_is_a_usage_error(self):
        proposal = self.propose("add.md", "x\n")
        result = self.run_apply("--append", proposal, "--index", proposal)
        self.assertEqual(result.returncode, 2)

    def test_checkpoint_is_written_before_change(self):
        before = self.memory.read_text()
        proposal = self.propose("add.md", "\n## Added\n")
        result = self.run_apply("--append", proposal, "--checkpoint", str(self.checkpoints))
        self.assertEqual(result.returncode, 0, result.stderr)
        saved = list(self.checkpoints.glob("MEMORY.md.*"))
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0].read_text(), before)

    def test_dry_run_does_not_touch_the_file(self):
        before = self.memory.read_text()
        proposal = self.propose("add.md", "\n## Added\n")
        result = self.run_apply("--append", proposal, "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.memory.read_text(), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
