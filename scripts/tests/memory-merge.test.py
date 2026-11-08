#!/usr/bin/env python3
"""Disposable Git histories only: no real memory, network, or user Git hooks."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
DRIVER = ROOT / 'skills/dream/scripts/merge-memory-index.py'
BASE = ('<!-- 2026-11-01 10:00:00 [11111111] -->\n'
        '## Synthetic entry\nSYNTHETIC_PRIVATE_FACT\n\n'
        '<!-- 2026-11-02 10:00:00 [22222222] -->\n'
        '## Retained entry\nPublic fact\n')
DELETED = BASE.replace('SYNTHETIC_PRIVATE_FACT\n', '')


class MergeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='memory-merge-')
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        self.env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
        self.env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
                        GIT_AUTHOR_NAME='Fixture', GIT_AUTHOR_EMAIL='fixture@example.invalid',
                        GIT_COMMITTER_NAME='Fixture', GIT_COMMITTER_EMAIL='fixture@example.invalid')
        self.git('init', '-q', '-b', 'main')
        self.git('config', 'core.hooksPath', os.devnull)
        self.git('config', 'merge.memory-index.driver', f'"{DRIVER}" %O %A %B')
        (self.repo / '.gitattributes').write_text('*.md merge=memory-index\n')
        self.path = self.repo / 'MEMORY.md'
        self.commit(BASE)
        self.git('branch', 'offline')

    def git(self, *args, check=True):
        return subprocess.run(['git', *args], cwd=self.repo, env=self.env,
                              capture_output=True, text=True, check=check)

    def commit(self, text):
        self.path.write_text(text)
        self.git('add', '.')
        self.git('commit', '-qm', 'fixture')

    def merge(self, left, right, reverse=False):
        self.commit(left)
        self.git('checkout', '-q', 'offline')
        self.commit(right)
        if not reverse:
            self.git('checkout', '-q', 'main')
        return self.git('merge', '--no-edit', 'main' if reverse else 'offline', check=False)

    def test_deletion_survives_unrelated_offline_append(self):
        result = self.merge(DELETED, BASE + '\nOffline addition\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('SYNTHETIC_PRIVATE_FACT', self.path.read_text())
        self.assertIn('Offline addition', self.path.read_text())

    def test_deletion_survives_reverse_merge(self):
        result = self.merge(DELETED, BASE + '\nOffline addition\n', reverse=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('SYNTHETIC_PRIVATE_FACT', self.path.read_text())

    def test_delete_versus_edit_requires_resolution(self):
        result = self.merge(DELETED, BASE.replace('SYNTHETIC_PRIVATE_FACT', 'SYNTHETIC_PRIVATE_FACT_EDITED'))
        self.assertNotEqual(result.returncode, 0, 'must not silently publish a conflicting edit')
        self.assertTrue(self.git('ls-files', '-u').stdout)

    def test_both_append_preserves_both(self):
        result = self.merge(BASE + '\nFirst addition\n', BASE + '\nSecond addition\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        text = self.path.read_text()
        self.assertIn('First addition', text)
        self.assertIn('Second addition', text)
        self.assertNotIn('<<<<<<<', text)

    def test_unrelated_replacements_require_resolution(self):
        result = self.merge(BASE.replace('Public fact', 'New fact A'), BASE.replace('Public fact', 'New fact B'))
        self.assertNotEqual(result.returncode, 0)

    def configure(self):
        subprocess.run(['python3', str(DRIVER.with_name('configure-memory-merge.py'))],
                       cwd=self.repo, env=self.env, check=True, capture_output=True)

    def test_existing_daily_union_rules_are_overridden(self):
        (self.repo / '.gitattributes').write_text('**/daily/*.md merge=union\n')
        self.configure()
        before = (self.repo / '.git/info/attributes').read_text()
        self.configure()
        self.assertEqual(before, (self.repo / '.git/info/attributes').read_text())
        for path in ('MEMORY.md', 'SCRATCHPAD.md', 'daily/2026-11-01.md',
                     'projects/abc/daily/2026-11-01.md'):
            self.assertIn('merge: memory-index', self.git('check-attr', 'merge', '--', path).stdout)

    def test_nested_daily_deletion_survives_offline_append(self):
        new = self.repo / 'projects/abc/daily/2026-11-01.md'
        new.parent.mkdir(parents=True)
        self.git('mv', 'MEMORY.md', str(new.relative_to(self.repo)))
        self.git('commit', '-qm', 'move fixture')
        self.git('branch', '-f', 'offline', 'HEAD')
        self.path = new
        (self.repo / '.gitattributes').write_text('**/daily/*.md merge=union\n')
        self.configure()
        result = self.merge(DELETED, BASE + '\nOffline addition\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('SYNTHETIC_PRIVATE_FACT', self.path.read_text())

    def make_remote(self):
        remote_dir = tempfile.TemporaryDirectory(prefix='memory-remote-')
        self.addCleanup(remote_dir.cleanup)
        remote = Path(remote_dir.name) / 'origin.git'
        self.git('clone', '--bare', '.', str(remote))
        self.git('remote', 'add', 'origin', str(remote))
        self.git('fetch', 'origin')
        self.git('branch', '--set-upstream-to=origin/main', 'main')
        return remote

    def sync(self, *args, env_extra=None):
        env = dict(self.env, PI_MEMORY_DIR=str(self.repo), **(env_extra or {}))
        return subprocess.run(['bash', str(DRIVER.with_name('memory-sync.sh')), *args],
                              cwd=self.repo, env=env, capture_output=True, text=True)

    def test_three_machine_sync_does_not_resurrect_deletion(self):
        remote = self.make_remote()
        machines_dir = tempfile.TemporaryDirectory(prefix='memory-machines-')
        self.addCleanup(machines_dir.cleanup)
        clones = [self.repo]
        for name in ('offline', 'online'):
            path = Path(machines_dir.name) / name
            self.git('clone', str(remote), str(path))
            clones.append(path)
        # The offline machine commits against the original, undeleted base.
        (clones[1] / 'MEMORY.md').write_text(BASE + '\nOffline addition\n')
        for args in (['add', '.'], ['commit', '-qm', 'offline addition']):
            subprocess.run(['git', *args], cwd=clones[1], env=self.env,
                           capture_output=True, check=True)
        self.path.write_text(DELETED)
        for path in (clones[0], clones[2], clones[1], clones[0], clones[2]):
            env = dict(self.env, PI_MEMORY_DIR=str(path))
            result = subprocess.run(['bash', str(DRIVER.with_name('memory-sync.sh'))],
                                    cwd=path, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        contents = [(path / 'MEMORY.md').read_text() for path in clones]
        self.assertEqual(contents[0], contents[1])
        self.assertEqual(contents[1], contents[2])
        self.assertNotIn('SYNTHETIC_PRIVATE_FACT', contents[0])
        self.assertIn('Offline addition', contents[0])

    def test_sync_does_not_stage_existing_conflicts(self):
        self.make_remote()
        self.merge(DELETED, BASE.replace('SYNTHETIC_PRIVATE_FACT', 'EDITED_PRIVATE_FACT'))
        stages = self.git('ls-files', '-u').stdout
        result = self.sync('--push-only')
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(stages, self.git('ls-files', '-u').stdout)

    def test_sync_stops_on_autostash_conflicts(self):
        remote = self.make_remote()
        # Offline branch simulates another machine publishing a deletion.
        self.git('checkout', '-q', 'offline')
        self.commit(DELETED)
        self.git('push', str(remote), 'offline:main')
        self.git('checkout', '-q', 'main')
        self.path.write_text(BASE.replace('SYNTHETIC_PRIVATE_FACT', 'EDITED_PRIVATE_FACT'))
        result = self.sync()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(self.git('ls-files', '-u').stdout)
        self.assertEqual(self.git('rev-parse', 'HEAD').stdout,
                         self.git('rev-parse', 'origin/main').stdout)

    def test_unedited_entry_deleted_as_whole(self):
        deleted = BASE[BASE.index('<!-- 2026-11-02'):]
        result = self.merge(deleted, BASE + '\nOffline addition\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('SYNTHETIC_PRIVATE_FACT', self.path.read_text())


if __name__ == '__main__':
    unittest.main()
