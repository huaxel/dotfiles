#!/usr/bin/env python3
"""Synthetic privacy probes; never read or sync the owner's actual memory."""
from pathlib import Path
import hashlib
import json
import runpy
import subprocess
import tempfile
import unittest

fixtures = runpy.run_path(str(Path(__file__).with_name('memory-merge.test.py')))

# Natural phrasings, deliberately not derived from the detector's own patterns.
DISCLOSURES = [
    "I've been seeing a counsellor every Thursday.",
    'Started EMDR to work through the crash.',
    'Therapy has been helping since spring.',
    "I was diagnosed with Crohn's last year.",
    'My MRI came back clear on Tuesday.',
    'Still recovering from surgery on my knee.',
    "I'm on blood thinners for now.",
    'Two nights in hospital after the fall.',
    'The chemotherapy schedule clashes with the workshop.',
    'Chronic pain makes long sessions hard.',
    'My offer is 6.5k per month.',
    'I got a 12% raise this quarter.',
    'Base is 95k plus a bonus.',
    'Negotiating pay before signing.',
    'My partner is moving in next month.',
    "My girlfriend's parents visit in May.",
    'My mother is unwell again.',
    'My brother starts a new job Monday.',
    'Our anniversary falls on a workday.',
    'My fiancée wants a small ceremony.',
    'My father needs help moving.',
    "I'm in counselling at the moment.",
    "I'm pregnant, due in March.",
    'We had a miscarriage in spring.',
    'My GP referred me to a specialist.',
    "I'm off sick this week.",
    'Recovering from a caesarean.',
    'My ex-wife moved abroad.',
    'We are separating.',
    'My nephew starts school.',
    'My grandmother passed away.',
]
TECHNICAL = [
    'Do all branch surgery in a worktree, never in the shared checkout.',
    'Shrink the bundle with a bounded glob.',
    'The partner API returns 402 until the token is refreshed.',
    'Raise an error when the base image is stale.',
    'The hospital integration project uses the same schema.',
    'The radiology integration stays read-only.',
    'The partner package publishes to the same registry.',
    'The counselling service integration stays read-only.',
    'The pregnancy-tracking integration is a separate module.',
]
PRIVATE = 'my salary is SYNTHETIC_PRIVATE_PAY\n'
RELATIONSHIP = 'my wife has SYNTHETIC_PRIVATE_CONTEXT\n'


class PrivacyTests(unittest.TestCase):
    def setUp(self):
        self.f = fixtures['MergeTests']()
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.remote = self.f.make_remote()

    def remote_head(self):
        return subprocess.check_output(['git', '--git-dir', str(self.remote), 'rev-parse', 'HEAD'], env=self.f.env)

    def assert_blocked(self, *args, env_extra=None):
        before = self.remote_head()
        result = self.f.sync('--push-only', *args, env_extra=env_extra)
        self.assertNotEqual(result.returncode, 0, 'sensitive content was allowed out')
        self.assertEqual(before, self.remote_head(), 'remote received sensitive history')
        self.assertNotIn('SYNTHETIC_PRIVATE_PAY', result.stdout + result.stderr)
        self.assertNotIn('SYNTHETIC_PRIVATE_CONTEXT', result.stdout + result.stderr)

    def add_private(self, name, text=PRIVATE):
        path = self.f.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def reviewed_lines(self):
        registry = Path(__file__).resolve().parents[2] / 'skills/dream/scripts/privacy-reviewed-lines.json'
        return json.loads(registry.read_text())['reviewed_lines']

    def approve(self, lines):
        """Write a synthetic review registry and return env for the gate."""
        parent = tempfile.TemporaryDirectory(prefix='privacy-reviews-')
        self.addCleanup(parent.cleanup)
        entries = [{'path': path, 'line_sha256': hashlib.sha256(line.encode()).hexdigest(),
                    'reason': 'synthetic test review'}
                   for path, group in lines.items() for line in group]
        path = Path(parent.name) / 'reviews.json'
        path.write_text(json.dumps({'schema_version': 2, 'reviewed_lines': entries}))
        return {'PI_PRIVACY_REVIEWED_LINES': str(path)}

    def test_published_registry_contains_no_memory_text(self):
        for item in self.reviewed_lines():
            self.assertEqual(set(item), {'path', 'line_sha256', 'reason'})
            self.assertRegex(item['line_sha256'], r'^[0-9a-f]{64}$')

    def test_reviewed_technical_references_can_sync(self):
        line = 'Technical detector example: therapist'
        env = self.approve({'MEMORY.md': [line]})
        self.add_private('MEMORY.md', line + '\n')
        result = self.f.sync('--push-only', env_extra=env)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_disclosure_appended_to_reviewed_line_is_blocked(self):
        line = 'Technical detector example: therapist'
        env = self.approve({'MEMORY.md': [line]})
        self.add_private('MEMORY.md', line + ' ' + PRIVATE)
        self.assert_blocked(env_extra=env)

    def test_disclosure_after_reviewed_line_is_blocked(self):
        line = 'Technical detector example: therapist'
        env = self.approve({'MEMORY.md': [line]})
        self.add_private('MEMORY.md', line + '\n' + PRIVATE)
        self.assert_blocked(env_extra=env)

    def test_relocated_reviewed_line_is_not_exempt(self):
        line = 'Technical detector example: therapist'
        env = self.approve({'MEMORY.md': [line]})
        self.add_private('archive/not-reviewed.md', line + '\n')
        self.assert_blocked(env_extra=env)

    def test_modified_reviewed_line_is_not_exempt(self):
        line = 'Technical detector example: therapist'
        env = self.approve({'MEMORY.md': [line]})
        self.add_private('MEMORY.md', line + ' changed\n')
        self.assert_blocked(env_extra=env)

    def test_incoming_content_cannot_approve_itself(self):
        self.add_private('MEMORY.md')
        self.add_private('privacy-reviewed-lines.json', json.dumps({'schema_version': 2, 'reviewed_lines': [{
            'path': 'MEMORY.md', 'line_sha256': hashlib.sha256(PRIVATE.strip().encode()).hexdigest(),
            'reason': 'self approval'}]}))
        self.assert_blocked()

    def test_quoting_or_labeling_a_disclosure_does_not_exempt_it(self):
        self.add_private('MEMORY.md', 'Privacy policy example: `' + PRIVATE.strip() + '`\n')
        self.assert_blocked()

    def test_same_blob_at_approved_and_unapproved_paths_is_blocked(self):
        line = 'Technical detector example: therapist'
        env = self.approve({'MEMORY.md': [line]})
        self.add_private('MEMORY.md', line + '\n')
        self.add_private('archive/not-reviewed.md', line + '\n')
        self.assert_blocked(env_extra=env)

    def policy(self):
        script = Path(__file__).resolve().parents[2] / 'skills/dream/scripts/check-memory-privacy.py'
        return runpy.run_path(str(script))

    def test_cross_line_match_is_not_hidden_by_partial_approval(self):
        policy = self.policy()
        self.assertTrue(policy['has_personal_matches'](
            'my\nsalary is SYNTHETIC_PRIVATE_PAY\n', 'MEMORY.md',
            {'MEMORY.md': {policy['line_digest']('my')}}))

    def test_crlf_offsets_do_not_exempt_following_disclosures(self):
        policy = self.policy()
        line = 'Technical detector example: therapist'
        reviewed = {'MEMORY.md': {policy['line_digest'](line)}}
        self.assertFalse(policy['has_personal_matches'](line + '\r\n', 'MEMORY.md', reviewed))
        self.assertTrue(policy['has_personal_matches'](line + '\r\n' + PRIVATE, 'MEMORY.md', reviewed))
        self.assertTrue(policy['has_personal_matches'](
            'my\r\nsalary is SYNTHETIC_PRIVATE_PAY', 'MEMORY.md',
            {'MEMORY.md': {policy['line_digest']('my')}}))

    def test_unicode_changes_do_not_reuse_an_exact_line_review(self):
        policy = self.policy()
        line = 'Technical therapist detector example'
        reviewed = {'MEMORY.md': {policy['line_digest'](line)}}
        for changed in (line + '\u200b', line + '\N{COMBINING ACUTE ACCENT}', '\U0001f512 ' + line):
            self.assertTrue(policy['has_personal_matches'](changed, 'MEMORY.md', reviewed))

    def test_symlink_does_not_approve_its_unreviewed_target(self):
        line = 'Technical detector example: therapist'
        env = self.approve({'MEMORY.md': [line]})
        self.add_private('archive/unreviewed.md', line + '\n')
        link = self.f.repo / 'MEMORY.md'
        link.unlink()
        link.symlink_to('archive/unreviewed.md')
        self.assert_blocked(env_extra=env)

    def test_path_case_and_aliases_do_not_reuse_a_review(self):
        policy = self.policy()
        line = 'Technical therapist detector example'
        reviewed = {'MEMORY.md': {policy['line_digest'](line)}}
        for alias in ('memory.md', './MEMORY.md', 'archive/../MEMORY.md'):
            self.assertTrue(policy['has_personal_matches'](line, alias, reviewed))

    def test_registry_schema_and_digest_are_validated(self):
        policy = self.policy()
        parent = tempfile.TemporaryDirectory(prefix='privacy-reviews-')
        self.addCleanup(parent.cleanup)
        path = Path(parent.name) / 'reviews.json'
        path.write_text(json.dumps({'schema_version': 2, 'reviewed_lines': [{
            'path': 'MEMORY.md', 'line_sha256': 'not-a-digest', 'reason': 'bad'}]}))
        with self.assertRaises(ValueError):
            policy['load_reviewed_lines'](path)
        path.write_text(json.dumps({'schema_version': 1, 'reviewed_lines': []}))
        with self.assertRaises(ValueError):
            policy['load_reviewed_lines'](path)

    def test_natural_disclosures_are_blocked(self):
        policy = self.policy()
        missed = [text for text in DISCLOSURES
                  if not (policy['DETECTORS']['T1'].search(text) or policy['DETECTORS']['T2'].search(text))]
        self.assertEqual(missed, [], 'detector missed natural phrasings')

    def test_technical_phrasings_are_not_blocked(self):
        policy = self.policy()
        blocked = [text for text in TECHNICAL
                   if policy['DETECTORS']['T1'].search(text) or policy['DETECTORS']['T2'].search(text)]
        self.assertEqual(blocked, [], 'technical prose would be redacted')

    def test_root_memory_is_gated(self):
        self.add_private('MEMORY.md')
        self.assert_blocked()

    def test_root_scratchpad_is_gated(self):
        self.add_private('SCRATCHPAD.md')
        self.assert_blocked()

    def test_nested_project_memory_is_gated(self):
        self.add_private('projects/example/MEMORY.md')
        self.assert_blocked()

    def test_nested_project_daily_is_gated(self):
        self.add_private('projects/example/daily/2026-11-08.md')
        self.assert_blocked()

    def test_archive_is_gated(self):
        self.add_private('archive/2000-01.md')
        self.assert_blocked()

    def test_outgoing_history_is_gated_even_after_deletion(self):
        self.f.commit(PRIVATE)
        self.f.commit('Clean replacement\n')
        self.assert_blocked()

    def test_relationship_context_is_not_advisory(self):
        self.add_private('daily/2026-11-08.md', RELATIONSHIP)
        self.assert_blocked()

    def test_force_cannot_override_privacy(self):
        self.add_private('daily/2026-11-08.md')
        self.assert_blocked('--force')

    def test_invalid_utf8_markdown_fails_closed(self):
        (self.f.repo / 'MEMORY.md').write_bytes(b'\xff\xfeuninspectable')
        self.assert_blocked()

    def test_post_commit_hook_cannot_smuggle_content(self):
        hooks = self.f.repo / 'hooks'
        hooks.mkdir()
        hook = hooks / 'post-commit'
        hook.write_text('#!/bin/sh\n'
                        'git -c core.hooksPath=/dev/null commit --allow-empty -qm hook\n'
                        'printf "my salary is SYNTHETIC_PRIVATE_PAY\\n" > MEMORY.md\n'
                        'git add MEMORY.md\n'
                        'git -c core.hooksPath=/dev/null commit -qm disclosure\n')
        hook.chmod(0o755)
        self.f.git('config', 'core.hooksPath', str(hooks))
        self.add_private('clean.md', 'Technical update\n')
        self.assert_blocked()

    def test_other_branch_is_not_pushed_by_matching_configuration(self):
        self.f.git('push', str(self.remote), 'offline:offline')
        self.f.git('checkout', '-q', 'offline')
        self.f.commit(PRIVATE)
        self.f.git('checkout', '-q', 'main')
        self.f.git('config', 'push.default', 'matching')
        self.f.git('config', 'remote.origin.push', 'refs/heads/*:refs/heads/*')
        before = subprocess.check_output(['git', '--git-dir', str(self.remote), 'rev-parse', 'offline'], env=self.f.env)
        self.add_private('clean.md', 'Technical update\n')
        result = self.f.sync('--push-only')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        after = subprocess.check_output(['git', '--git-dir', str(self.remote), 'rev-parse', 'offline'], env=self.f.env)
        self.assertEqual(before, after)

    def run_import(self, private):
        parent = tempfile.TemporaryDirectory(prefix='memory-import-privacy-')
        self.addCleanup(parent.cleanup)
        directory = Path(parent.name) / 'memory'
        directory.mkdir()
        (directory / 'MEMORY.md').write_text(PRIVATE if private else 'Clean imported fact\n')
        env = dict(self.f.env, PI_MEMORY_DIR=str(directory), PI_MEMORY_REMOTE=str(self.remote))
        script = Path(__file__).resolve().parents[2] / 'skills/dream/scripts/memory-import-machine.sh'
        result = subprocess.run(['bash', str(script), '--apply'], env=env, cwd=directory,
                                capture_output=True, text=True)
        return result, directory

    def test_first_import_is_gated_before_any_commit(self):
        before = self.remote_head()
        result, directory = self.run_import(private=True)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(before, self.remote_head())
        head = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD'], cwd=directory,
                              env=self.f.env, capture_output=True)
        self.assertNotEqual(head.returncode, 0)
        self.assertNotIn('SYNTHETIC_PRIVATE_PAY', result.stdout + result.stderr)

    def test_clean_first_import_can_publish(self):
        # Canonical remote config must include both files the importer adopts.
        (self.f.repo / '.gitignore').write_text('')
        self.f.git('add', '.')
        self.f.git('commit', '-qm', 'config fixture')
        self.f.git('push')
        result, directory = self.run_import(private=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        text = (directory / 'MEMORY.md').read_text()
        self.assertIn('Clean imported fact', text)
        self.assertIn('Public fact', text)

    def test_clean_technical_content_can_sync(self):
        self.add_private('projects/example/daily/2026-11-08.md', 'Fixed salary-calculation engine; no rerun-therapy needed\n')
        result = self.f.sync('--push-only')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.f.git('rev-parse', 'HEAD').stdout.strip().encode(), self.remote_head().strip())


if __name__ == '__main__':
    unittest.main()
