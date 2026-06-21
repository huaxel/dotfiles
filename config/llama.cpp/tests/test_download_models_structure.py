import ast
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "download-models.py"


def _profile_models(profile_name: str):
    module = ast.parse(SCRIPT.read_text())
    for node in module.body:
        if not isinstance(node, ast.Assign):
            continue
        if any(isinstance(target, ast.Name) and target.id == profile_name for target in node.targets):
            return ast.literal_eval(node.value)["models"]
    raise AssertionError(f"profile {profile_name!r} not found")


class DownloadModelsStructureTest(unittest.TestCase):
    def test_all_profile_models_are_four_field_entries(self):
        for profile_name in ("LAPTOP", "MACBOOK"):
            with self.subTest(profile=profile_name):
                for model in _profile_models(profile_name):
                    self.assertIsInstance(model, tuple)
                    self.assertEqual(4, len(model), model)

    def test_profile_section_names_are_unique(self):
        for profile_name in ("LAPTOP", "MACBOOK"):
            with self.subTest(profile=profile_name):
                models = _profile_models(profile_name)
                if not all(isinstance(model, tuple) and len(model) == 4 for model in models):
                    continue
                sections = [model[0] for model in models]
                self.assertEqual(len(sections), len(set(sections)), sections)

    def test_macbook_profile_has_expected_small_models(self):
        sections = [model[0] for model in _profile_models("MACBOOK")]
        self.assertEqual(
            [
                "LFM2.5-1.2B",
                "gemma-4-E2B-qat",
                "Qwen3.5-4B",
                "Qwen3.5-2B",
                "Qwen3.5-0.8B",
            ],
            sections,
        )


if __name__ == "__main__":
    unittest.main()
