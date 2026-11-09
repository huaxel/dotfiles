#!/usr/bin/env python3
"""Synthetic drift checks. Never reads owner memory or contacts hosts."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'skills/dream/scripts/memory-identity-drift.py'
CHECKOUT = '/machine-a/demo'
KEY = 'demo-' + hashlib.sha256(CHECKOUT.encode()).hexdigest()[:12]
SHARED = '<!-- 2026-01-01 10:00:00 [abc] -->\n## Shared\nsame body\n'
LEGACY_ONLY = '<!-- 2026-01-02 10:00:00 [def] -->\n## Legacy only\nnew fact\n'


class DriftTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.mem = Path(self.tmp.name).resolve()
        self.legacy = self.mem / 'projects' / KEY
        self.canonical = self.mem / 'projects' / 'demo'
        self.legacy.mkdir(parents=True)
        self.canonical.mkdir()
        (self.mem / 'project-identities.json').write_text(
            json.dumps({'version': 1, 'checkouts': {CHECKOUT: 'demo'}}))

    def write(self, legacy, canonical):
        (self.legacy / 'MEMORY.md').write_text(legacy)
        (self.canonical / 'MEMORY.md').write_text(canonical)

    def run_check(self):
        return subprocess.run([sys.executable, str(SCRIPT), '--memory-dir', str(self.mem)],
                              capture_output=True, text=True, timeout=60)

    def test_identical_histories_report_no_drift(self):
        self.write(SHARED, SHARED)
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_legacy_only_entry_is_reported(self):
        self.write(SHARED + LEGACY_ONLY, SHARED)
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('"status": "missing"', result.stdout)
        self.assertIn('"heading": "Legacy only"', result.stdout)

    def test_extended_entry_is_diverged_not_missing(self):
        # A later session extended the same entry in the legacy scope. The fact
        # is present; only the body differs, so this must not read as loss.
        self.write(SHARED + 'extra detail\n', SHARED)
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"status": "diverged"', result.stdout)
        self.assertNotIn('"status": "missing"', result.stdout)

    def test_missing_entry_still_fails(self):
        self.write(SHARED + 'extra detail\n' + LEGACY_ONLY, SHARED)
        self.assertEqual(self.run_check().returncode, 1)

    def test_provenance_header_is_not_drift(self):
        # Migration puts a provenance comment above the entry marker. Identity
        # must come from the entry marker, not that header.
        self.write(SHARED, '<!-- source-scope: other-scope -->\n' + SHARED)
        self.assertEqual(self.run_check().returncode, 0)

    def test_duplicate_marker_twins_are_not_drift(self):
        # Two source scopes reused one generic marker; canonical holds both.
        twin = SHARED.replace('same body', 'second body')
        self.write(SHARED, SHARED + '\n' + twin)
        self.assertEqual(self.run_check().returncode, 0)

    def test_index_regions_are_not_drift(self):
        self.write('<!-- INDEX START -->\nold view\n<!-- INDEX END -->\n\n' + SHARED,
                   '<!-- INDEX START -->\nnew view\n<!-- INDEX END -->\n\n' + SHARED)
        self.assertEqual(self.run_check().returncode, 0)

    def test_legacy_marker_pair_index_is_ignored(self):
        self.write('<!-- INDEX -->\nold\n<!-- /INDEX -->\n\n' + SHARED, SHARED)
        self.assertEqual(self.run_check().returncode, 0)

    def test_missing_canonical_memory_is_reported(self):
        (self.legacy / 'MEMORY.md').write_text(SHARED)
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('canonical memory missing', result.stdout)

    def test_unmapped_scope_is_not_compared(self):
        self.write(SHARED, SHARED)
        other = self.mem / 'projects' / 'unrelated-aaaaaaaaaaaa'
        other.mkdir()
        (other / 'MEMORY.md').write_text(LEGACY_ONLY)
        self.assertEqual(self.run_check().returncode, 0)

    def test_invalid_registry_fails_closed(self):
        (self.mem / 'project-identities.json').write_text('{bad')
        self.assertEqual(self.run_check().returncode, 2)

    def test_missing_registry_fails_closed(self):
        (self.mem / 'project-identities.json').unlink()
        self.assertEqual(self.run_check().returncode, 2)

    def test_check_is_read_only(self):
        self.write(SHARED + LEGACY_ONLY, SHARED)
        before = {str(p): p.read_bytes() for p in self.mem.rglob('*') if p.is_file()}
        self.run_check()
        after = {str(p): p.read_bytes() for p in self.mem.rglob('*') if p.is_file()}
        self.assertEqual(before, after)


if __name__ == '__main__':
    unittest.main(verbosity=2)
