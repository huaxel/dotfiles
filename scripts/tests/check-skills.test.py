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

    def test_cursor_skill_import_is_rejected(self):
        path = self.skill()
        path.write_text(
            path.read_text().replace("# Example", "Store this in `~/.cursor/skills/example/`.")
        )
        self.assertIn("Cursor/Codex-app skill imported", str(checker.check_catalog(self.root)))

    def test_harness_name_mention_without_harness_paths_is_allowed(self):
        path = self.skill()
        path.write_text(
            path.read_text().replace(
                "# Example",
                "Validate comments reported by Bugbot and explain when you disagree.",
            )
        )
        self.assertEqual(checker.check_catalog(self.root), [])

    def test_synced_vendor_skill_may_describe_its_own_harness(self):
        self.skill(parent="skills/synced/vendor")
        path = self.root / "skills/synced/vendor/example/SKILL.md"
        path.write_text(
            path.read_text().replace("# Example", "Create these under `~/.cursor/skills/`.")
        )
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

    def test_inline_code_link_syntax_is_not_dependency(self):
        path = self.skill()
        path.write_text(path.read_text() + "Use `[text](url)` for external URLs only.\n")
        self.assertEqual(checker.check_catalog(self.root), [])

    def test_prose_link_after_inline_code_is_still_checked(self):
        path = self.skill()
        path.write_text(path.read_text() + "Use `[text](url)` and see [Guide](guide.md).\n")
        self.assertIn("missing bundled target guide.md", str(checker.check_catalog(self.root)))

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

    def test_linked_harness_variant_is_not_drift(self):
        self.skill()
        home = self.root / "home"
        variant = self.root / "variant"
        variant.mkdir()
        (variant / "SKILL.md").write_text("---\nname: example\ndescription: Different build.\n---\n")
        base = home / ".codex/skills"
        base.mkdir(parents=True)
        try:
            (base / "example").symlink_to(variant, target_is_directory=True)
        except OSError as error:
            if getattr(error, "winerror", None) == 1314:
                self.skipTest("Windows symlink privilege unavailable; covered under WSL")
            raise
        # A linked variant is a pointer, not a copied file, so it produces no copy note.
        self.assertFalse([n for n in checker.local_drift(self.root, home) if "copy" in n])

    def case(self, case_name="case-one"):
        skill = self.skill()
        case = skill.parent / "evals" / case_name
        (case / "graders").mkdir(parents=True)
        (case / "case.yaml").write_text(
            "schema_version: \"1.1\"\n"
            f"name: {case_name}\n"
            "expected_outcome: |\n  Does the right thing.\n"
        )
        (case / "prompt.md").write_text(
            "---\ntags: [skill-creator]\nmax_turns: 10\ntimeout_seconds: 180\n"
            "allowed_tools: [Read]\n---\n\nReview this.\n"
        )
        (case / "graders/01-behavior.md").write_text(
            "---\ntype: llm\nfocus: trace\nweight: 1\n---\n\nThe response does not guess.\n"
        )
        return case

    def test_valid_behavioral_case(self):
        self.case()
        self.assertEqual(checker.check_catalog(self.root), [])

    def test_case_name_must_match_directory(self):
        case = self.case()
        (case / "case.yaml").write_text(
            (case / "case.yaml").read_text().replace("name: case-one", "name: other")
        )
        self.assertIn("name must match directory", str(checker.check_catalog(self.root)))

    def test_case_requires_grader(self):
        case = self.case()
        (case / "graders/01-behavior.md").unlink()
        self.assertIn("no graders", str(checker.check_catalog(self.root)))

    def test_case_prompt_budget_must_be_integer(self):
        case = self.case()
        (case / "prompt.md").write_text(
            (case / "prompt.md").read_text().replace("max_turns: 10", "max_turns: ten")
        )
        self.assertIn("max_turns must be an integer", str(checker.check_catalog(self.root)))

    def test_eval_results_directory_is_ignored(self):
        case = self.case()
        results = case.parent / "results" / "2026-11-24T00-00-00-000Z"
        results.mkdir(parents=True)
        (results / "record.json").write_text("{}\n")
        self.assertEqual(checker.check_catalog(self.root), [])

    def test_linked_catalog_is_not_duplicate(self):
        self.skill()
        home = self.root / "home"
        (home / ".agents").mkdir(parents=True)
        (home / ".claude").mkdir()
        try:
            (home / ".agents/skills").symlink_to(self.root / "skills", target_is_directory=True)
        except OSError as error:
            if getattr(error, "winerror", None) == 1314:
                self.skipTest("Windows symlink privilege unavailable; covered under WSL")
            raise
        (home / ".claude/skills").symlink_to(home / ".agents/skills", target_is_directory=True)
        self.assertEqual(checker.local_drift(self.root, home), [])


if __name__ == "__main__":
    unittest.main()
