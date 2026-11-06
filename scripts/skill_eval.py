#!/usr/bin/env python3
"""Repository entrypoint; the portable evaluator lives with skill-diet."""
import importlib.util
from pathlib import Path

_path = Path(__file__).resolve().parents[1] / "skills/skill-diet/scripts/skill_eval.py"
_spec = importlib.util.spec_from_file_location("_shared_skill_eval", _path)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
for _name, _value in vars(_module).items():
    if not _name.startswith("_"):
        globals()[_name] = _value

if __name__ == "__main__":
    raise SystemExit(main())
