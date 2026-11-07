#!/usr/bin/env python3
"""Offline acceptance-gate tests; no inference or account access."""
import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("skill_eval", ROOT / "scripts/skill_eval.py")
e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(e)


class EvaluationChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.skill = self.root / "example"
        self.skill.mkdir()
        (self.skill / "SKILL.md").write_text("---\nname: example\ndescription: Example\n---\nCheck the result.\n")
        self.adapter = self.root / "adapter.mjs"
        self.adapter.write_text("// offline test adapter\n")
        self.spec = self.root / "spec.json"
        self.data = {"provider": "fixture", "model": "fixture-model", "repeats": 1,
                     "versions": {"none": None, "after": "example"},
                     "tasks": [{"id": "case", "prompt": "Return JSON.", "expected": {"ok": True}}]}
        self.save_spec()
        self.output = self.root / "output"

    def save_spec(self):
        self.spec.write_text(json.dumps(self.data))

    def freeze(self):
        return e.freeze(self.spec, self.output, adapter=self.adapter)

    def record(self, plan, key, **changes):
        result = {"plan_digest": plan["digest"], "key": list(key), "status": "completed",
                  "answer": {"ok": True}, "tools_enabled": False, "tokens": 12,
                  "provider": "fixture", "model": "fixture-model", "sdk_version": "fixture-sdk"}
        result.update(changes)
        return result

    def fill(self, plan, transform=None):
        for key in e.grid(plan):
            record = self.record(plan, key)
            if transform:
                record = transform(key, record)
            e.write_new(self.output / "runs" / e.filename(key), record)

    def test_frozen_runner_sources_retained(self):
        p = self.freeze()
        self.assertEqual(p["adapter_source"].encode("utf-8"), self.adapter.read_bytes())
        self.assertEqual(p["harness_source"].encode("utf-8"), Path(p["harness_path"]).read_bytes())

    def test_call_matrix_limit(self):
        self.data["repeats"] = 10
        self.data["tasks"] = [{"id": f"case-{i}", "prompt": "Task", "expected": {"ok": True}} for i in range(6)]
        self.save_spec()
        with self.assertRaisesRegex(ValueError, "100 planned calls"):
            self.freeze()

    def test_crlf_skill_bytes_preserved(self):
        p = self.skill / "SKILL.md"
        p.write_bytes(p.read_bytes().replace(b"\n", b"\r\n"))
        plan = self.freeze()
        self.assertEqual(plan["versions"]["after"]["text"].encode(), p.read_bytes())

    def test_crlf_adapter_snapshot_preserved(self):
        self.adapter.write_bytes(b"// source\r\n")
        p = self.freeze()
        self.assertEqual(p["adapter_source"].encode(), self.adapter.read_bytes())

    def test_oversized_source_snapshot_rejected(self):
        self.adapter.write_text("x" * 2_000_000)
        with self.assertRaisesRegex(ValueError, "2 MB"):
            self.freeze()

    def test_zero_runs_rejected(self):
        self.freeze()
        with self.assertRaisesRegex(ValueError, "incomplete result matrix"):
            e.score(self.output)

    def test_missing_one_arm_rejected(self):
        p = self.freeze()
        key = e.grid(p)[0]
        e.write_new(self.output / "runs" / e.filename(key), self.record(p, key))
        with self.assertRaisesRegex(ValueError, "incomplete"):
            e.score(self.output)

    def test_missing_repeat_rejected(self):
        self.data["repeats"] = 2
        self.save_spec()
        p = self.freeze()
        for key in e.grid(p)[:-1]:
            e.write_new(self.output / "runs" / e.filename(key), self.record(p, key))
        with self.assertRaisesRegex(ValueError, "incomplete"):
            e.score(self.output)

    def test_complete_matrix_passes(self):
        p = self.freeze()
        self.fill(p)
        self.assertTrue(e.score(self.output)["candidate_cases_pass"])

    def test_wrong_answer_fails(self):
        p = self.freeze()
        self.fill(p, lambda k, r: {**r, "answer": {"ok": False}} if k[0] == "after" else r)
        self.assertFalse(e.score(self.output)["candidate_cases_pass"])

    def test_before_failure_does_not_veto_improved_after(self):
        self.data["versions"]["before"] = "example"
        self.save_spec()
        p = self.freeze()
        self.fill(p, lambda k, r: {**r, "answer": {"ok": False}} if k[0] == "before" else r)
        self.assertTrue(e.score(self.output)["candidate_cases_pass"])

    def test_after_version_required(self):
        self.data["versions"]["before"] = self.data["versions"].pop("after")
        self.save_spec()
        with self.assertRaisesRegex(ValueError, "after skill version"):
            self.freeze()

    def test_complete_but_failed_adapter_matrix_rejected(self):
        p = self.freeze()
        self.fill(p, lambda k, r: {**r, "status": "error"})
        with self.assertRaisesRegex(ValueError, "incomplete execution"):
            e.score(self.output)

    def test_cli_zero_runs_exits_nonzero(self):
        self.freeze()
        r = e.subprocess.run(["python3", str(ROOT / "scripts/skill_eval.py"), "score", str(self.output)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("incomplete result matrix", r.stderr)

    def test_boolean_not_integer(self):
        self.assertFalse(e.matches({"ok": 1}, {"ok": True}))

    def test_expected_fields_missing(self):
        self.assertFalse(e.matches({}, {"ok": True}))

    def test_explanation_fields_allowed(self):
        self.assertTrue(e.matches({"ok": True, "reason": "evidence"}, {"ok": True}))

    def test_unexpected_record_rejected(self):
        p = self.freeze()
        self.fill(p)
        e.write_new(self.output / "runs/extra.json", {})
        with self.assertRaisesRegex(ValueError, "unexpected"):
            e.score(self.output)

    def test_result_identity_rejected(self):
        p = self.freeze()
        self.fill(p, lambda k, r: {**r, "plan_digest": "other"})
        with self.assertRaisesRegex(ValueError, "identity"):
            e.score(self.output)

    def test_model_mismatch_rejected(self):
        p = self.freeze()
        self.fill(p, lambda k, r: {**r, "model": "other"})
        with self.assertRaisesRegex(ValueError, "model mismatch"):
            e.score(self.output)

    def test_tools_enabled_rejected(self):
        p = self.freeze()
        self.fill(p, lambda k, r: {**r, "tools_enabled": True})
        with self.assertRaisesRegex(ValueError, "no-tools"):
            e.score(self.output)

    def test_missing_tokens_rejected(self):
        p = self.freeze()
        self.fill(p, lambda k, r: {**r, "tokens": 0})
        with self.assertRaisesRegex(ValueError, "token count"):
            e.score(self.output)

    def test_changed_task_rejected(self):
        self.freeze()
        self.data["tasks"][0]["prompt"] = "Changed task"
        self.save_spec()
        with self.assertRaisesRegex(ValueError, "stale plan"):
            e.load_plan(self.output)

    def test_changed_skill_rejected(self):
        self.freeze()
        (self.skill / "SKILL.md").write_text("Changed skill")
        with self.assertRaisesRegex(ValueError, "skill bundle changed"):
            e.load_plan(self.output)

    def test_new_reference_rejected(self):
        self.freeze()
        (self.skill / "new.md").write_text("New reference")
        with self.assertRaisesRegex(ValueError, "skill bundle changed"):
            e.load_plan(self.output)

    def test_changed_adapter_rejected(self):
        self.freeze()
        self.adapter.write_text("changed")
        with self.assertRaisesRegex(ValueError, "adapter changed"):
            e.load_plan(self.output)

    def test_changed_plan_rejected(self):
        self.freeze()
        p = e.read_json(self.output / "plan.json")
        p["repeats"] = 2
        (self.output / "plan.json").write_text(json.dumps(p))
        with self.assertRaisesRegex(ValueError, "changed plan"):
            e.load_plan(self.output)

    def test_duplicate_json_keys_rejected(self):
        self.spec.write_text('{"repeats": 1, "repeats": 2}')
        with self.assertRaisesRegex(ValueError, "duplicate JSON"):
            e.read_json(self.spec)

    def test_missing_no_skill_baseline_rejected(self):
        del self.data["versions"]["none"]
        self.save_spec()
        with self.assertRaisesRegex(ValueError, "baseline"):
            self.freeze()

    def test_duplicate_tasks_rejected(self):
        self.data["tasks"] *= 2
        self.save_spec()
        with self.assertRaisesRegex(ValueError, "task id"):
            self.freeze()

    def test_empty_tasks_rejected(self):
        self.data["tasks"] = []
        self.save_spec()
        with self.assertRaisesRegex(ValueError, "one task"):
            self.freeze()

    def test_ambiguous_filename_names_rejected(self):
        self.data["tasks"][0]["id"] = "case--ambiguous"
        self.save_spec()
        with self.assertRaisesRegex(ValueError, "task id"):
            self.freeze()

    def test_cannot_overwrite_plan(self):
        self.freeze()
        with self.assertRaises(FileExistsError):
            self.freeze()

    def test_symlinked_bundle_resource_rejected(self):
        try:
            (self.skill / "secret-link").symlink_to(self.spec)
        except OSError as error:
            if getattr(error, "winerror", None) == 1314:
                self.skipTest("Windows symlink privilege unavailable; covered under WSL")
            raise
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.freeze()

    def test_run_requires_opt_in(self):
        self.freeze()
        with self.assertRaisesRegex(ValueError, "allow-model-calls"):
            e.run(self.output, False, 2, 1)

    def test_call_budget_checked_before_execution(self):
        self.freeze()
        with patch.object(e.subprocess, "run") as proc:
            with self.assertRaisesRegex(ValueError, "budget"):
                e.run(self.output, True, 1, 1)
            proc.assert_not_called()

    def test_no_silent_resume(self):
        self.freeze()
        (self.output / "runs").mkdir()
        with self.assertRaisesRegex(ValueError, "runs already exist"):
            e.run(self.output, True, 2, 1)

    def test_runner_protocol_without_inference(self):
        self.freeze()
        response = self.record(e.read_json(self.output / "plan.json"), ("none", "case", 0))
        # Controller stamps identity, not the adapter/model.
        response.pop("plan_digest"); response.pop("key")
        with patch.object(e.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=json.dumps(response))):
            with contextlib.redirect_stdout(io.StringIO()):
                report = e.run(self.output, True, 2, 1)
        self.assertTrue(report["complete"])

    def test_failed_adapter_is_not_a_pass(self):
        self.freeze()
        with patch.object(e.subprocess, "run", return_value=SimpleNamespace(returncode=1, stdout="")):
            with contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(ValueError, "partial evidence"):
                    e.run(self.output, True, 2, 1)
        with self.assertRaisesRegex(ValueError, "incomplete"):
            e.score(self.output)

    def test_mixed_runtime_rejected(self):
        p = self.freeze()
        self.fill(p, lambda k, r: {**r, "sdk_version": k[0]})
        with self.assertRaisesRegex(ValueError, "mixed runtime"):
            e.score(self.output)


if __name__ == "__main__":
    unittest.main()
