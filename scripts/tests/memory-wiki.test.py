#!/usr/bin/env python3
"""The wiki must be a view of memory, and re-rendering must be stable."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "dream" / "scripts" / "memory-wiki.py"

INDEXED = """<!-- INDEX START -->
# INDEX (2026-11-09)
**Active**: doing the thing
<!-- INDEX END -->

<!-- 2026-11-01 -->
## Entry
body
"""


class MemoryWikiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mem = Path(self.tmp.name).resolve()
        (self.mem / "projects" / "demo-aaaaaaaaaaaa").mkdir(parents=True)
        (self.mem / "projects" / "demo-aaaaaaaaaaaa" / "MEMORY.md").write_text(INDEXED)
        (self.mem / "wiki").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def render(self):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--memory-dir", str(self.mem)],
            capture_output=True, text=True, timeout=60,
        )

    def test_page_renders_from_the_index(self):
        result = self.render()
        self.assertEqual(result.returncode, 0, result.stderr)
        page = (self.mem / "wiki" / "demo.md").read_text()
        self.assertIn("**Active**: doing the thing", page)
        self.assertIn("source: projects/demo-aaaaaaaaaaaa/MEMORY.md", page)
        self.assertNotIn("## Entry", page, "the page is the INDEX, not the whole memory")

    def test_rerender_is_stable(self):
        self.render()
        first = (self.mem / "wiki" / "demo.md").read_text()
        self.render()
        second = (self.mem / "wiki" / "demo.md").read_text()
        self.assertEqual(first, second, "re-rendering must not accumulate content")

    def test_human_notes_are_preserved(self):
        self.render()
        page = self.mem / "wiki" / "demo.md"
        page.write_text(page.read_text() + "\n## Notes\n\nhand-written judgement\n")
        self.render()
        self.assertIn("hand-written judgement", page.read_text())

    def test_authored_page_without_scope_is_kept_and_listed(self):
        (self.mem / "wiki" / "orphan.md").write_text("---\norigin: ai-generated\n---\n\n# orphan\nkeep me\n")
        self.render()
        self.assertTrue((self.mem / "wiki" / "orphan.md").exists())
        self.assertIn("keep me", (self.mem / "wiki" / "orphan.md").read_text())
        readme = (self.mem / "wiki" / "README.md").read_text()
        self.assertIn("Authored (no project memory scope)", readme)
        self.assertIn("[[orphan]]", readme)

    def test_colliding_labels_do_not_overwrite_each_other(self):
        for key in ("demo-bbbbbbbbbbbb",):
            d = self.mem / "projects" / key
            d.mkdir()
            (d / "MEMORY.md").write_text(INDEXED.replace("doing the thing", "second checkout"))
        self.render()
        names = sorted(p.name for p in (self.mem / "wiki").glob("*.md"))
        self.assertIn("demo-aaaaaaaaaaaa.md", names)
        self.assertIn("demo-bbbbbbbbbbbb.md", names)

    def test_scope_without_index_is_skipped_not_blanked(self):
        d = self.mem / "projects" / "raw-cccccccccccc"
        d.mkdir()
        (d / "MEMORY.md").write_text("<!-- 2026-11-01 -->\n## no index here\n")
        result = self.render()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.mem / "wiki" / "raw.md").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
