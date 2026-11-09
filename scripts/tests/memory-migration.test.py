#!/usr/bin/env python3
"""Synthetic migration contracts. Never read owner memory or contact hosts."""
from pathlib import Path
import hashlib
import io
import runpy
import tarfile
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'skills/dream/scripts/memory-migrate-identities.py'
BUILD = runpy.run_path(str(SCRIPT))['build']
A, B = 'demo-aaaaaaaaaaaa', 'demo-bbbbbbbbbbbb'


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.plan = {'version': 1, 'projects': {'demo': [A, B]},
                     'checkouts': {'/machine-a/demo': 'demo', '/machine-b/demo': 'demo'}}
        self.out = self.root / 'staged'

    def snapshot(self, host, files):
        with tarfile.open(self.root / (host + '.tar'), 'w') as tar:
            for name, raw in files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(raw)
                tar.addfile(entry, io.BytesIO(raw))

    def basic(self):
        self.snapshot('host-a', {f'{A}/MEMORY.md': b'<!-- INDEX START -->\nold view\n<!-- INDEX END -->\n\nclaim a\n',
                                 f'{B}/MEMORY.md': b'claim b\n'})

    def test_preserves_claims_and_source_snapshots(self):
        self.basic()
        before = (self.root / 'host-a.tar').read_bytes()
        manifest = BUILD(self.root, self.plan, self.out)
        text = (self.out / 'projects/demo/MEMORY.md').read_bytes()
        self.assertIn(b'claim a\n', text)
        self.assertIn(b'claim b\n', text)
        self.assertNotIn(b'old view', text)
        self.assertEqual(before, (self.root / 'host-a.tar').read_bytes())
        for name, expected in manifest['outputs'].items():
            self.assertEqual(hashlib.sha256((self.out / name).read_bytes()).hexdigest(), expected)

    def test_append_only_advance_is_preserved(self):
        self.basic()
        self.snapshot('host-b', {f'{A}/daily/2026-01-01.md': b'old\n'})
        self.snapshot('host-c', {f'{A}/daily/2026-01-01.md': b'old\nnew\n'})
        BUILD(self.root, self.plan, self.out)
        self.assertIn(b'old\nnew\n', (self.out / 'projects/demo/daily/2026-01-01.md').read_bytes())

    def test_divergent_same_path_refused_before_output_created(self):
        self.basic()
        self.snapshot('host-b', {f'{B}/MEMORY.md': b'different\n'})
        with self.assertRaisesRegex(ValueError, 'conflicting copies'):
            BUILD(self.root, self.plan, self.out)
        self.assertFalse(self.out.exists())

    def test_conflicting_entry_identity_across_scopes_refused(self):
        marker = b'<!-- 2026-01-01 12:00:00 [abc] -->\n'
        self.snapshot('host-a', {f'{A}/MEMORY.md': marker + b'first\n',
                                 f'{B}/MEMORY.md': marker + b'competing\n'})
        with self.assertRaisesRegex(ValueError, 'entry identity'):
            BUILD(self.root, self.plan, self.out)
        self.assertFalse(self.out.exists())

    def test_preexisting_same_scope_marker_reuse_preserved(self):
        marker = b'<!-- 2026-01-01 [dream] -->\n'
        body = marker + b'first\n' + marker + b'second\n'
        self.snapshot('host-a', {f'{A}/MEMORY.md': body, f'{B}/MEMORY.md': b'another claim\n'})
        BUILD(self.root, self.plan, self.out)
        self.assertIn(body, (self.out / 'projects/demo/MEMORY.md').read_bytes())

    def test_conflicting_task_state_refused(self):
        self.snapshot('host-a', {f'{A}/MEMORY.md': b'a', f'{B}/MEMORY.md': b'b',
                                 f'{A}/SCRATCHPAD.md': b'- [ ] task\n',
                                 f'{B}/SCRATCHPAD.md': b'- [x] task\n'})
        with self.assertRaisesRegex(ValueError, 'task status'):
            BUILD(self.root, self.plan, self.out)

    def test_recovery_data_not_republished_into_canonical_scope(self):
        self.basic()
        self.snapshot('host-b', {f'{A}/recovery/private.json': b'deliberately removed content'})
        BUILD(self.root, self.plan, self.out)
        self.assertFalse(list(self.out.rglob('private.json')))

    def test_existing_output_is_never_overwritten(self):
        self.basic()
        self.out.mkdir()
        (self.out / 'keep').write_text('keep')
        with self.assertRaisesRegex(ValueError, 'already exists'):
            BUILD(self.root, self.plan, self.out)
        self.assertEqual((self.out / 'keep').read_text(), 'keep')

    def test_path_escape_refused(self):
        self.basic()
        self.snapshot('host-b', {'../escape': b'bad'})
        with self.assertRaisesRegex(ValueError, 'unsafe snapshot'):
            BUILD(self.root, self.plan, self.out)
        self.assertFalse(self.out.exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
