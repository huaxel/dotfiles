#!/usr/bin/env python3
"""Exercise the exact resolver shipped in the reviewed patch, without loading
an extension, writing owner memory, or applying anything to the live install.
Node's built-in TypeScript stripping executes the resolver's postimage.
"""
from pathlib import Path
import json
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
PATCH = REPO / 'pi/agent/npm/patches/pi-memory+0.4.2.patch'


def resolver_source():
    # Extract the patch's postimage (context + additions, never removals).
    lines = PATCH.read_text().splitlines()
    active = False
    post = []
    for line in lines:
        if line.startswith('diff --git '):
            active = line.endswith('b/node_modules/pi-memory/index.ts')
        elif active and line.startswith((' ', '+')) and not line.startswith('+++'):
            post.append(line[1:])
    text = '\n'.join(post)
    start = text.index('const DEFAULT_QMD_COLLECTION')
    end = text.index('// ---------------------------------------------------------------------------', start)
    # The hunk includes the entire resolver block, ending at Utilities.
    block = text[start:end]
    assert 'registeredProjectKey' in block and 'export function resolveMemoryScope' in block
    return '''import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
type MemoryEnv = Record<string, string | undefined>;
function resolveMemoryDir(env: MemoryEnv = process.env): string {
  return env.PI_MEMORY_DIR || path.join(env.HOME!, '.pi', 'agent', 'memory');
}
''' + block


class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='memory-identity-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.home = self.root / 'home'
        self.base = self.home / '.pi/agent/memory'
        self.base.mkdir(parents=True)
        self.registry = self.base / 'project-identities.json'
        self.a = self.root / 'machine-a/demo'
        self.b = self.root / 'machine-b/renamed-demo'
        for checkout in (self.a, self.b):
            checkout.mkdir(parents=True)
            self.git(checkout, 'init', '-q', '--template=')
            self.git(checkout, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                     'commit', '--allow-empty', '-qm', 'initial')
        self.module = self.root / 'resolver.mts'
        self.module.write_text(resolver_source() + '''
const input = JSON.parse(process.argv[2]);
try {
  console.log(JSON.stringify({scope: resolveMemoryScope(input.cwd, input.env)}));
} catch (error) {
  console.log(JSON.stringify({error: String(error)}));
  process.exitCode = 1;
}
''')

    def git(self, checkout, *args):
        subprocess.run(['git', '-C', str(checkout), *args], check=True, capture_output=True)

    def resolve(self, checkout, **overrides):
        data = {'cwd': str(checkout), 'env': {'HOME': str(self.home), **overrides}}
        result = subprocess.run(['node', str(self.module), json.dumps(data)],
                                text=True, capture_output=True, timeout=30)
        return result.returncode, json.loads(result.stdout)

    def mapped(self, entries):
        self.registry.write_text(json.dumps({'version': 1, 'checkouts': entries}))

    def test_same_project_across_machines_and_renames(self):
        self.mapped({str(self.a): 'demo', str(self.b): 'demo'})
        a, b = self.resolve(self.a), self.resolve(self.b)
        self.assertEqual(a, b)
        self.assertEqual(a[0], 0)
        self.assertEqual(a[1]['scope']['dir'], str(self.base / 'projects/demo'))
        self.assertEqual(a[1]['scope']['collection'], 'pi-memory-demo')

    def test_worktree_inherits_main_checkout_identity(self):
        self.mapped({str(self.a): 'demo'})
        worktree = self.root / 'linked-worktree'
        self.git(self.a, 'worktree', 'add', '--detach', str(worktree))
        self.assertEqual(self.resolve(self.a), self.resolve(worktree))

    def test_missing_registry_keeps_existing_scopes(self):
        a, b = self.resolve(self.a), self.resolve(self.b)
        self.assertEqual(a[0], 0)
        self.assertNotEqual(a[1]['scope'], b[1]['scope'])
        self.assertTrue(Path(a[1]['scope']['dir']).name.startswith('demo-'))

    def test_unmapped_checkout_keeps_its_scope(self):
        before = self.resolve(self.b)
        self.mapped({str(self.a): 'demo'})
        self.assertEqual(before, self.resolve(self.b))

    def test_identical_remotes_do_not_implicitly_merge_forks(self):
        for p in (self.a, self.b):
            self.git(p, 'remote', 'add', 'origin', 'https://example.invalid/org/demo.git')
        self.mapped({str(self.a): 'upstream', str(self.b): 'experiment'})
        self.assertNotEqual(self.resolve(self.a), self.resolve(self.b))

    def test_remote_change_does_not_change_explicit_identity(self):
        self.mapped({str(self.a): 'demo'})
        before = self.resolve(self.a)
        self.git(self.a, 'remote', 'add', 'origin', 'ssh://git@example.invalid/fork/demo.git')
        self.assertEqual(before, self.resolve(self.a))

    def test_invalid_registry_fails_closed(self):
        for invalid in ('{', '{}', 'null', '{"version":2,"checkouts":{}}',
                        '{"version":1,"checkouts":[]}'):
            with self.subTest(invalid=invalid):
                self.registry.write_text(invalid)
                self.assertEqual(self.resolve(self.a)[0], 1)

    def test_invalid_identifiers_and_paths_fail_closed(self):
        for key, value in ((str(self.a), '../escape'), (str(self.a), ''),
                           (str(self.a), 'Uppercase'), ('relative/path', 'demo'),
                           (str(self.a) + '/..', 'demo'), (str(self.a), 17)):
            with self.subTest(key=key, value=value):
                self.mapped({key: value})
                self.assertEqual(self.resolve(self.a)[0], 1)

    def test_explicit_overrides_bypass_registry(self):
        self.registry.write_text('{bad json')
        self.assertEqual(self.resolve(self.a, PI_MEMORY_PROJECT_SCOPE='0'),
                         (0, {'scope': {'dir': str(self.base), 'collection': 'pi-memory'}}))
        target = self.root / 'explicit'
        self.assertEqual(self.resolve(self.a, PI_MEMORY_DIR=str(target)),
                         (0, {'scope': {'dir': str(target), 'collection': 'pi-memory'}}))

    def test_caught_startup_failure_blocks_memory_until_valid_reactivation(self):
        self.mapped({str(self.a): 'demo'})
        source = resolver_source() + '''
const [cwd, home, registry] = process.argv.slice(2);
const env = {HOME: home};
activateMemoryScope(cwd, env);
assertMemoryScopeReady();
fs.writeFileSync(registry, '{invalid');
try { activateMemoryScope(cwd, env); } catch {}
let blocked = false;
try { assertMemoryScopeReady(); } catch { blocked = true; }
if (!blocked) throw new Error('caught startup failure left memory enabled');
fs.writeFileSync(registry, JSON.stringify({version:1, checkouts:{[cwd]:'demo'}}));
activateMemoryScope(cwd, env);
assertMemoryScopeReady();
console.log('blocked then recovered');
'''
        self.module.write_text(source)
        result = subprocess.run(['node', str(self.module), str(self.a), str(self.home),
                                 str(self.registry)], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('blocked then recovered', result.stdout)

    def test_installed_hooks_and_tools_use_the_guard(self):
        patch = PATCH.read_text()
        self.assertIn('+\tassertMemoryScopeReady();', patch)  # ensureDirs
        self.assertIn('+\t\t\tassertMemoryScopeReady();', patch)  # search
        self.assertIn('+\t\t\tscope = activateMemoryScope(ctx.cwd);', patch)
        self.assertIn('+\t\t\tmemorySnapshot = null;', patch)

    def test_resolution_has_no_write_side_effects(self):
        self.mapped({str(self.a): 'demo'})
        before = {str(p.relative_to(self.base)): p.read_bytes()
                  for p in self.base.rglob('*') if p.is_file()}
        self.resolve(self.a)
        after = {str(p.relative_to(self.base)): p.read_bytes()
                 for p in self.base.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        self.assertFalse((self.base / 'projects').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
