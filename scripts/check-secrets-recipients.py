#!/usr/bin/env python3
"""Compare .sops.yaml recipients against each secrets/*.enc embedded list.

Usage:
  check-secrets-recipients.py [.sops.yaml] [secrets/*.enc ...]

Exit 0 when all files match; exit 1 and print diffs otherwise.
Supports both list-form and legacy folded-string `age:` values in .sops.yaml.
"""
import json
import re
import sys

try:
    import yaml
except ImportError:
    yaml = None


def config_recipients(path):
    text = open(path).read()
    if yaml is not None:
        cfg = yaml.safe_load(text)
        rules = (cfg or {}).get("creation_rules", [])
        age = rules[0].get("age", []) if rules else []
        if isinstance(age, str):
            return sorted(re.findall(r"age1[0-9a-z]+", age))
        return sorted(age)
    return sorted(re.findall(r"age1[0-9a-z]+", text))


def file_recipients(path):
    d = json.load(open(path))
    return sorted(
        x.get("recipient", "") for x in d.get("sops", {}).get("age", [])
    )


def main():
    config_path = sys.argv[1] if len(sys.argv) > 1 else ".sops.yaml"
    files = sys.argv[2:] if len(sys.argv) > 2 else []
    want = config_recipients(config_path)
    failed = False
    for f in files:
        try:
            got = file_recipients(f)
        except (OSError, ValueError) as e:
            print(f"  ❌ {f}: cannot read recipient list ({e})")
            failed = True
            continue
        if got != want:
            print(f"  ❌ {f} recipients differ from {config_path}")
            print(f"     config: {' '.join(want)}")
            print(f"     file:   {' '.join(got)}")
            print(f"     Run: sops updatekeys {f}"
                  " (after confirming .sops.yaml is correct)")
            failed = True
    if failed:
        return 1
    print(f"  ✅ {len(files)} .enc recipient lists match .sops.yaml")
    return 0


if __name__ == "__main__":
    sys.exit(main())
