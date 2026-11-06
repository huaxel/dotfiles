#!/usr/bin/env python3
"""Frozen, text-only skill comparisons. No model calls without --allow-model-calls.

This evaluates supplied skill text, not discovery, tools, runtime behavior, or safety.
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ADAPTER = ROOT / "scripts/skill_eval_pi.mjs"
NAME = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*\Z")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def read_json(path):
    def unique(pairs):
        obj = {}
        for key, value in pairs:
            if key in obj:
                raise ValueError(f"duplicate JSON key: {key}")
            obj[key] = value
        return obj
    if path.stat().st_size > 2_000_000:
        raise ValueError(f"oversized JSON: {path}")
    return json.loads(path.read_text(), object_pairs_hook=unique)


def write_new(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as f:
        f.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree_hash(path):
    files = {}
    for p in sorted(path.rglob("*")):
        if p.is_symlink():
            raise ValueError(f"symlink within skill snapshot: {p}")
        if p.is_file():
            files[p.relative_to(path).as_posix()] = file_hash(p)
    if "SKILL.md" not in files:
        raise ValueError(f"missing SKILL.md: {path}")
    return files


def freeze(spec_path, output, adapter=DEFAULT_ADAPTER, provider=None, model=None):
    spec = read_json(spec_path)
    if provider is not None:
        spec["provider"] = provider
    if model is not None:
        spec["model"] = model
    if set(spec) != {"provider", "model", "repeats", "versions", "tasks"}:
        raise ValueError("spec needs exactly provider, model, repeats, versions, tasks")
    for key in ("provider", "model"):
        if not isinstance(spec[key], str) or not spec[key].strip():
            raise ValueError(f"invalid {key}")
    if type(spec["repeats"]) is not int or not 1 <= spec["repeats"] <= 10:
        raise ValueError("repeats must be 1–10")
    versions = spec["versions"]
    if not isinstance(versions, dict) or versions.get("none", False) is not None or "after" not in versions or len(versions) < 2:
        raise ValueError("include a none:null baseline and an after skill version")
    frozen = {}
    for name, raw in versions.items():
        if not isinstance(name, str) or len(name) > 64 or not NAME.fullmatch(name):
            raise ValueError("unsafe version name")
        if name == "none":
            frozen[name] = {"text": "", "path": None, "files": {}}
        else:
            if not isinstance(raw, str) or not raw:
                raise ValueError("skill version needs a directory path")
            path = (spec_path.parent / raw).resolve()
            text = (path / "SKILL.md").read_bytes().decode("utf-8")
            files = tree_hash(path)
            if hashlib.sha256(text.encode()).hexdigest() != files["SKILL.md"]:
                raise ValueError("skill changed during freeze; retry after coordinating edits")
            frozen[name] = {"text": text, "path": str(path), "files": files}
    tasks = spec["tasks"]
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("at least one task is required")
    ids = set()
    for t in tasks:
        if not isinstance(t, dict) or set(t) != {"id", "prompt", "expected"}:
            raise ValueError("each task needs id, prompt, expected")
        if not isinstance(t["id"], str) or len(t["id"]) > 64 or not NAME.fullmatch(t["id"]) or t["id"] in ids:
            raise ValueError("duplicate or unsafe task id")
        ids.add(t["id"])
        if not isinstance(t["prompt"], str) or not t["prompt"].strip() or not isinstance(t["expected"], dict) or not t["expected"]:
            raise ValueError("task needs a prompt and nonempty expected JSON fields")
    if len(versions) * len(tasks) * spec["repeats"] > 100:
        raise ValueError("frozen evaluations are limited to 100 planned calls")
    adapter = adapter.resolve()
    body = {"schema_version": 1, "mode": "text-only", "spec_path": str(spec_path.resolve()),
            "spec_sha256": file_hash(spec_path), "provider": spec["provider"], "model": spec["model"],
            "repeats": spec["repeats"], "versions": frozen, "tasks": tasks,
            "adapter": str(adapter), "adapter_sha256": file_hash(adapter), "adapter_source": adapter.read_bytes().decode("utf-8"),
            "harness_path": str(Path(__file__).resolve()), "harness_sha256": file_hash(Path(__file__)),
            "harness_source": Path(__file__).read_bytes().decode("utf-8")}
    plan = {**body, "digest": digest(body)}
    if len((json.dumps(plan, indent=2, ensure_ascii=False) + "\n").encode()) > 2_000_000:
        raise ValueError("frozen plan exceeds the 2 MB input limit")
    write_new(output / "plan.json", plan)
    return plan


def load_plan(folder):
    plan = read_json(folder / "plan.json")
    body = {k: v for k, v in plan.items() if k != "digest"}
    if plan.get("schema_version") != 1 or plan.get("mode") != "text-only" or digest(body) != plan.get("digest"):
        raise ValueError("invalid or changed plan")
    for path_key, hash_key in [("spec_path", "spec_sha256"), ("adapter", "adapter_sha256"), ("harness_path", "harness_sha256")]:
        if file_hash(Path(plan[path_key])) != plan[hash_key]:
            raise ValueError(f"stale plan: {path_key} changed; freeze a new evaluation")
    for version in plan["versions"].values():
        if version["path"] and tree_hash(Path(version["path"])) != version["files"]:
            raise ValueError("stale plan: skill bundle changed; freeze a new evaluation")
    return plan


def grid(plan):
    return list(itertools.product(plan["versions"], [t["id"] for t in plan["tasks"]], range(plan["repeats"])))


def filename(key):
    return f"{key[0]}--{key[1]}--{key[2]}.json"


def matches(actual, expected):
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(k in actual and matches(actual[k], v) for k, v in expected.items())
    return type(actual) is type(expected) and actual == expected


def valid_record(record, plan, key):
    if not isinstance(record, dict) or record.get("plan_digest") != plan["digest"] or canonical(record.get("key")) != canonical(list(key)):
        raise ValueError("result identity does not match frozen plan")
    if record.get("status") not in {"completed", "error", "timeout"}:
        raise ValueError("invalid result status")
    if record["status"] == "completed":
        if not isinstance(record.get("answer"), dict) or record.get("tools_enabled") is not False:
            raise ValueError("completed result needs JSON answer and explicit no-tools evidence")
        if record.get("provider") != plan["provider"] or record.get("model") != plan["model"]:
            raise ValueError("result model mismatch")
        if not isinstance(record.get("sdk_version"), str) or not record["sdk_version"]:
            raise ValueError("missing runtime version")
        if type(record.get("tokens")) is not int or record["tokens"] <= 0:
            raise ValueError("missing actual token count")


def score(folder):
    plan = load_plan(folder)
    expected = {filename(k): k for k in grid(plan)}
    present = {p.name for p in (folder / "runs").glob("*.json")}
    if present != set(expected):
        raise ValueError(f"incomplete result matrix: missing={len(set(expected)-present)}, unexpected={len(present-set(expected))}")
    tasks = {t["id"]: t for t in plan["tasks"]}
    rows = {v: {"passed": 0, "total": 0, "tokens": 0} for v in plan["versions"]}
    per_task = {}
    runtime_versions = set()
    for name, key in expected.items():
        r = read_json(folder / "runs" / name)
        valid_record(r, plan, key)
        if r["status"] != "completed":
            raise ValueError("incomplete execution: failed or timed-out cells cannot support acceptance")
        ok = r["status"] == "completed" and matches(r["answer"], tasks[key[1]]["expected"])
        if r["status"] == "completed":
            runtime_versions.add(r["sdk_version"])
        row = rows[key[0]]
        row["total"] += 1
        row["passed"] += ok
        row["tokens"] += r.get("tokens", 0) if r["status"] == "completed" else 0
        per_task.setdefault(key[:2], []).append(ok)
    if len(runtime_versions) > 1:
        raise ValueError("mixed runtime versions; freeze a new evaluation")
    candidate_ok = all(row["passed"] == row["total"] for v, row in rows.items() if v == "after")
    return {"plan_digest": plan["digest"], "mode": "text-only", "complete": True,
            "candidate_cases_pass": candidate_ok, "versions": rows,
            "task_passes": {f"{v}/{t}": sum(outcomes) for (v, t), outcomes in per_task.items()},
            "limitation": "Exact-field checks on text responses, not a runtime/tool benchmark or proof of non-inferiority. Inspect answers and use broader held-out cases before promotion."}


def run(folder, allow, max_calls, timeout):
    if not allow:
        raise ValueError("model execution requires --allow-model-calls")
    plan = load_plan(folder)
    keys = grid(plan)
    # No silent reuse of stale/partial results, retries, or unbounded continuations.
    if (folder / "runs").exists():
        raise ValueError("runs already exist; freeze a new evaluation rather than mixing attempts")
    if type(max_calls) is not int or not 1 <= len(keys) <= max_calls <= 100:
        raise ValueError(f"budget does not permit {len(keys)} model calls")
    (folder / "runs").mkdir()
    tasks = {t["id"]: t for t in plan["tasks"]}
    # Alternate versions per case to reduce time/order confounding.
    keys.sort(key=lambda k: (k[2], k[1], list(plan["versions"]).index(k[0])))
    for key in keys:
        load_plan(folder)
        payload = {"provider": plan["provider"], "model": plan["model"],
                   "skill_text": plan["versions"][key[0]]["text"], "prompt": tasks[key[1]]["prompt"]}
        record = {"plan_digest": plan["digest"], "key": list(key)}
        try:
            result = subprocess.run(["node", plan["adapter"]], input=json.dumps(payload),
                                    capture_output=True, text=True, timeout=timeout)
            if result.returncode:
                record["status"] = "error"  # Never leak provider diagnostics/credentials.
            else:
                response = json.loads(result.stdout)
                record.update(response)
                record.update(plan_digest=plan["digest"], key=list(key))
        except subprocess.TimeoutExpired:
            record["status"] = "timeout"
        except (ValueError, OSError):
            record["status"] = "error"
        valid_record(record, plan, key)
        write_new(folder / "runs" / filename(key), record)
        print(f"{key[0]}/{key[1]}/{key[2]}: {record['status']}", flush=True)
        if record["status"] != "completed":
            raise ValueError("adapter failed; partial evidence retained and scoring remains fail-closed")
    return score(folder)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    f = sub.add_parser("freeze"); f.add_argument("spec", type=Path); f.add_argument("output", type=Path); f.add_argument("--provider"); f.add_argument("--model")
    r = sub.add_parser("run"); r.add_argument("folder", type=Path)
    r.add_argument("--allow-model-calls", action="store_true"); r.add_argument("--max-calls", type=int, required=True)
    r.add_argument("--timeout", type=int, default=90)
    s = sub.add_parser("score"); s.add_argument("folder", type=Path)
    a = p.parse_args()
    try:
        if a.command == "freeze":
            plan = freeze(a.spec, a.output, provider=a.provider, model=a.model)
            print(f"Frozen {len(grid(plan))} calls; no models executed. Plan {plan['digest']}")
        elif a.command == "run":
            if not 1 <= a.timeout <= 600: raise ValueError("timeout must be 1–600 seconds")
            report = run(a.folder, a.allow_model_calls, a.max_calls, a.timeout)
            print(json.dumps(report, indent=2))
            return 0 if report["candidate_cases_pass"] else 1
        else:
            report = score(a.folder)
            print(json.dumps(report, indent=2))
            return 0 if report["candidate_cases_pass"] else 1
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(f"Evaluation rejected: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
