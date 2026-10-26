#!/usr/bin/env python3
"""Offline patch-workflow contracts; opt into a real npm rehearsal explicitly."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO/'pi/agent/npm'
spec = importlib.util.spec_from_file_location('pi_patches', SOURCE/'apply-patches.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def delta(name='fixture', filename='index.js', before='old', after='new'):
    path = f'node_modules/{name}/{filename}'
    return f'diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -1 +1 @@\n-{before}\n+{after}\n'


class PatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)/'npm'
        self.root.mkdir()
        self.patches = self.root/'patches'
        self.patches.mkdir()
        self.package(helper.TIDY, '0.5.4', peerDependencies={'typebox':'*'}, dependencies={'semver':'^7.8.5'})
        self.package('fixture', '1.0.0')
        self.target = self.root/'node_modules/fixture/index.js'
        self.target.write_text('old\n')
        (self.patches/'fixture+1.0.0.patch').write_text(delta())

    def package(self, name, version, **extra):
        root = self.root/'node_modules'/name
        root.mkdir(parents=True, exist_ok=True)
        (root/'package.json').write_text(json.dumps(dict(name=name, version=version, **extra)))
        return root

    def snapshot(self):
        return {str(p.relative_to(self.root)):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def test_pristine_idempotence_mode_and_nonmutating_check(self):
        self.target.chmod(0o640)
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'missing'):
            helper.apply(self.root, self.patches, check=True)
        self.assertEqual(before, self.snapshot())
        helper.apply(self.root, self.patches)
        self.assertEqual(self.target.read_text(), 'new\n')
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o640)
        after = self.snapshot()
        helper.apply(self.root, self.patches)
        helper.apply(self.root, self.patches, check=True)
        self.assertEqual(after, self.snapshot())

    def test_all_versions_preflight_before_any_source_write(self):
        self.package('later', '2.0.0')
        (self.patches/'later+1.0.0.patch').write_text(delta('later'))
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'reviewed version'):
            helper.apply(self.root, self.patches)
        self.assertEqual(before, self.snapshot())

    def test_partial_application_or_context_drift_never_overwrites(self):
        second = self.target.with_name('second.js')
        second.write_text('old\n')
        (self.patches/'fixture+1.0.0.patch').write_text(delta()+delta(filename='second.js'))
        self.target.write_text('new\n')
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'drift/partial'):
            helper.apply(self.root, self.patches)
        self.assertEqual(before, self.snapshot())
        self.target.write_text('user edit\n')
        with self.assertRaises(ValueError):
            helper.apply(self.root, self.patches)
        self.assertEqual(self.target.read_text(), 'user edit\n')

    def test_symlinked_root_allowed_but_source_redirection_refused(self):
        alias = self.root.parent/'alias'
        alias.symlink_to(self.root, target_is_directory=True)
        helper.apply(alias, self.patches)
        external = self.root.parent/'outside'
        external.write_text('old\n')
        self.target.unlink()
        self.target.symlink_to(external)
        with self.assertRaisesRegex(ValueError, 'symlinked'):
            helper.apply(self.root, self.patches)
        self.assertEqual(external.read_text(), 'old\n')

    def test_path_escape_refused(self):
        (self.patches/'fixture+1.0.0.patch').write_text(delta(filename='../../outside'))
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'escapes'):
            helper.apply(self.root, self.patches)
        self.assertEqual(before, self.snapshot())

    def test_observed_concurrent_edit_is_preserved(self):
        original = helper.git_apply
        def racing(*args):
            result = original(*args)
            if '--check' not in args:
                self.target.write_text('concurrent edit\n')
            return result
        with patch.object(helper, 'git_apply', side_effect=racing), self.assertRaisesRegex(ValueError, 'changed during'):
            helper.apply(self.root, self.patches)
        self.assertEqual(self.target.read_text(), 'concurrent edit\n')

    def test_tidy_upstream_invariant_and_stale_copy_refuse_without_deleting(self):
        self.package(helper.TIDY, '0.5.4', dependencies={'typebox':'1.1.38'}, peerDependencies={'typebox':'*'})
        with self.assertRaisesRegex(ValueError, 'runtime TypeBox'):
            helper.apply(self.root, self.patches)
        self.package(helper.TIDY, '0.5.4', peerDependencies={'typebox':'*'})
        private = self.root/'node_modules'/helper.TIDY/'node_modules/typebox'
        private.mkdir(parents=True)
        marker = private/'user-work'
        marker.write_text('preserve')
        with self.assertRaisesRegex(ValueError, 'nothing is deleted'):
            helper.apply(self.root, self.patches)
        self.assertEqual(marker.read_text(), 'preserve')
        self.assertEqual(self.target.read_text(), 'old\n')

    def test_staging_inside_git_worktree_does_not_ignore_patch_targets(self):
        repository = self.root.parent/'other-repo'
        subprocess.run(['git','init','--quiet',str(repository)], check=True, capture_output=True)
        with patch.object(tempfile, 'tempdir', str(repository)):
            helper.apply(self.root, self.patches)
        self.assertEqual(self.target.read_text(), 'new\n')

    def test_ambient_git_redirection_cannot_change_patch_destination(self):
        env = {'GIT_DIR':str(self.root.parent/'other.git'), 'GIT_WORK_TREE':str(self.root.parent),
               'GIT_INDEX_FILE':str(self.root.parent/'unrelated-index')}
        with patch.dict(os.environ, env):
            helper.apply(self.root, self.patches)
        self.assertEqual(self.target.read_text(), 'new\n')
        self.assertFalse((self.root.parent/'unrelated-index').exists())

    def test_installer_forces_no_hooks_and_rejects_npm_flag_injection(self):
        for filename in ('install-and-patch.sh', 'apply-patches.py'):
            shutil.copy2(SOURCE/filename, self.root/filename)
        binaries = self.root/'fake-bin'
        binaries.mkdir()
        npm = binaries/'npm'
        npm.write_text('#!/usr/bin/env python3\nimport json,os,sys\nfrom pathlib import Path\n'
            'Path(os.environ["CAPTURE"]).write_text(json.dumps({"args":sys.argv[1:],"ignore":os.environ.get("NPM_CONFIG_IGNORE_SCRIPTS")}))\n')
        npm.chmod(0o755)
        capture = self.root/'captured.json'
        env = dict(os.environ, PATH=str(binaries)+os.pathsep+os.environ['PATH'], CAPTURE=str(capture), NPM_CONFIG_IGNORE_SCRIPTS='false')
        command = ['bash',str(self.root/'install-and-patch.sh')]
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        called = json.loads(capture.read_text())
        self.assertEqual(called['ignore'], 'true')
        self.assertIn('--ignore-scripts', called['args'])
        self.assertIn('--legacy-peer-deps', called['args'])
        self.assertIn('--global=false', called['args'])
        capture.unlink()
        for args in (['--ignore-scripts=false'], ['install','--ignore-scripts=false'], ['check'], ['patch']):
            result = subprocess.run(command+args, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0 if args[0] in ('check','patch') else 2, result.stderr)
            self.assertFalse(capture.exists())

    def test_reviewed_patch_inventory(self):
        patches = sorted((SOURCE/'patches').glob('*.patch'))
        self.assertEqual([helper.patch_identity(p) for p in patches], [('pi-memory','0.4.2')])
        for p in patches:
            helper.patch_paths(p.read_text(), helper.patch_identity(p)[0])


@unittest.skipUnless(os.environ.get('PI_PATCH_REHEARSE') == '1', 'network rehearsal is explicitly opt-in')
class PublishedInstallTests(unittest.TestCase):
    def test_fresh_script_disabled_install_then_exact_patch_reproduction(self):
        with tempfile.TemporaryDirectory(prefix='pi-patch-real-') as directory:
            root = Path(directory)
            for name in ('install-and-patch.sh', 'apply-patches.py'):
                shutil.copy2(SOURCE/name, root/name)
            shutil.copytree(SOURCE/'patches', root/'patches')
            package = {'private':True, 'dependencies':{'pi-memory':'0.4.2',helper.TIDY:'0.5.4'},
                       'scripts':{'postinstall':"node -e \"require('fs').writeFileSync('HOOK_RAN','bad')\""}}
            (root/'package.json').write_text(json.dumps(package))
            env = dict(os.environ, NPM_CONFIG_IGNORE_SCRIPTS='false')
            prepare = subprocess.run(['npm','--prefix',str(root),'--global=false','install','--package-lock-only','--ignore-scripts','--legacy-peer-deps','--no-audit'], env=env, capture_output=True, text=True, timeout=90)
            self.assertEqual(prepare.returncode, 0, prepare.stderr)
            result = subprocess.run(['bash',str(root/'install-and-patch.sh'),'ci'], env=env, capture_output=True, text=True, timeout=90)
            self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
            self.assertFalse((root/'HOOK_RAN').exists())
            for name in ('README.md','index.ts'):
                fresh = (root/'node_modules/pi-memory'/name).read_bytes()
                live = (SOURCE/'node_modules/pi-memory'/name).read_bytes()
                self.assertEqual(hashlib.sha256(fresh).digest(), hashlib.sha256(live).digest(), name)
            before = {p:p.read_bytes() for p in (root/'node_modules/pi-memory').glob('*') if p.is_file()}
            for mode in ('patch','check'):
                result = subprocess.run(['bash',str(root/'install-and-patch.sh'),mode], capture_output=True, text=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
            self.assertEqual(before,{p:p.read_bytes() for p in before})


if __name__ == '__main__':
    unittest.main()
