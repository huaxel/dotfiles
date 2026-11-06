#!/usr/bin/env python3
"""Structural skill checks use temporary fixtures, never live agent settings."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("check_skills", ROOT / "scripts/check_skills.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class SkillChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def skill(self, name="example", parent="skills", description="Do one thing."):
        path = self.root / parent / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\nname: {name}\ndescription: {description}\n---\n\n# Example\n")
        return path

    def test_valid_catalog(self):
        self.skill()
        self.assertEqual(checker.check_catalog(self.root), [])

    def test_empty_catalog(self):
        self.assertIn("no skills found", checker.check_catalog(self.root))

    def test_missing_frontmatter(self):
        self.skill().write_text("# Missing metadata\n")
        self.assertIn("missing frontmatter", str(checker.check_catalog(self.root)))

    def test_malformed_yaml(self):
        self.skill().write_text("---\nname: [\n---\n")
        self.assertTrue(checker.check_catalog(self.root))

    def test_duplicate_keys(self):
        self.skill().write_text("---\nname: example\nname: other\ndescription: task\n---\n")
        self.assertIn("duplicate YAML key", str(checker.check_catalog(self.root)))

    def test_duplicate_names_across_roots(self):
        self.skill()
        self.skill(parent="pi/agent/skills")
        self.assertIn("duplicate skill name", str(checker.check_catalog(self.root)))

    def test_name_mismatch(self):
        path = self.skill()
        path.write_text(path.read_text().replace("name: example", "name: different"))
        self.assertIn("name must match directory", str(checker.check_catalog(self.root)))

    def test_invalid_name(self):
        self.skill(name="Wrong_Name")
        self.assertIn("lowercase hyphenated", str(checker.check_catalog(self.root)))

    def test_description_limits(self):
        self.skill(description="x" * 1025)
        self.assertIn("1–1024", str(checker.check_catalog(self.root)))

    def test_description_type(self):
        self.skill(description="false")
        self.assertIn("1–1024", str(checker.check_catalog(self.root)))

    def test_invocation_flag_type(self):
        path = self.skill()
        path.write_text(path.read_text().replace("description:", 'disable-model-invocation: "true"\ndescription:'))
        self.assertIn("must be boolean", str(checker.check_catalog(self.root)))

    def test_native_policy_cannot_reenable_explicit_only(self):
        path = self.skill()
        path.write_text(path.read_text().replace("description:", "disable-model-invocation: true\ndescription:"))
        native = path.parent / "agents/openai.yaml"
        native.parent.mkdir()
        native.write_text("policy:\n  allow_implicit_invocation: true\n")
        self.assertIn("contradicts explicit-only", str(checker.check_catalog(self.root)))
        native.write_text("policy:\n  allow_implicit_invocation: false\n")
        self.assertEqual(checker.check_catalog(self.root), [])

    def test_native_policy_boolean_type(self):
        path = self.skill()
        native = path.parent / "agents/openai.yaml"
        native.parent.mkdir()
        native.write_text('policy:\n  allow_implicit_invocation: "false"\n')
        self.assertIn("must be boolean", str(checker.check_catalog(self.root)))

    def test_native_policy_mapping_type(self):
        path = self.skill()
        native = path.parent / "agents/openai.yaml"
        native.parent.mkdir()
        native.write_text("policy: []\n")
        self.assertIn("policy mapping", str(checker.check_catalog(self.root)))

    def test_missing_bundled_script(self):
        path = self.skill()
        path.write_text(path.read_text() + "Run `python scripts/prove.py`.\n")
        self.assertIn("missing bundled target scripts/prove.py", str(checker.check_catalog(self.root)))

    def test_missing_relative_link(self):
        path = self.skill()
        path.write_text(path.read_text() + "[Guide](guide.md#section)\n")
        self.assertIn("missing bundled target guide.md", str(checker.check_catalog(self.root)))

    def test_existing_resources_and_external_links(self):
        path = self.skill()
        (path.parent / "guide.md").write_text("# Guide\n")
        path.write_text(path.read_text() + '[Guide](guide.md#section) [site](https://example.com/a) [here](#example)\n')
        self.assertEqual(checker.check_catalog(self.root), [])

    def test_fenced_example_link_is_not_dependency(self):
        path = self.skill()
        path.write_text(path.read_text() + "```markdown\n[Example](made-up.md)\n```\n")
        self.assertEqual(checker.check_catalog(self.root), [])

    def test_vendor_resources_still_checked(self):
        path = self.skill(parent="skills/synced/bucket")
        path.write_text(path.read_text() + "Run `scripts/missing.py`.\n")
        self.assertIn("missing bundled target", str(checker.check_catalog(self.root)))

    def test_local_copies_are_advisory_and_unchanged(self):
        source = self.skill()
        home = self.root / "home"
        copy = home / ".codex/skills/example/SKILL.md"
        copy.parent.mkdir(parents=True)
        copy.write_text("local override")
        self.assertIn("DIVERGENT", str(checker.local_drift(self.root, home)))
        self.assertEqual(copy.read_text(), "local override")
        copy.write_bytes(source.read_bytes())
        self.assertIn("identical copy", str(checker.local_drift(self.root, home)))

    def test_linked_catalog_is_not_duplicate(self):
        self.skill()
        home = self.root / "home"
        (home / ".agents").mkdir(parents=True)
        (home / ".claude").mkdir()
        (home / ".agents/skills").symlink_to(self.root / "skills", target_is_directory=True)
        (home / ".claude/skills").symlink_to(home / ".agents/skills", target_is_directory=True)
        self.assertEqual(checker.local_drift(self.root, home), [])


if __name__ == "__main__":
    unittest.main()
