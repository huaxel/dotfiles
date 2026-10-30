#!/usr/bin/env python3
"""Compare .sops.yaml recipients against each secrets/*.enc embedded list.

Usage:
  check-secrets-recipients.py [.sops.yaml] [secrets/*.enc ...]

Exit 0 when all files match; exit 1 and print diffs otherwise.
Supports path-specific SOPS rules and both list-form and legacy folded-string
`age:` values.
"""
import json
import re
import sys

try:
    import yaml
except ImportError:
    yaml = None


def _rules_from_text(text):
    """Parse the simple creation_rules subset used when PyYAML is unavailable."""
    body = text.split("creation_rules:", 1)[-1]
    blocks = []
    current = []
    for line in body.splitlines():
        if re.match(r"^\s*-\s+", line):
            if current:
                blocks.append("\n".join(current))
            current = [re.sub(r"^\s*-\s+", "", line)]
        elif current:
            current.append(line)
    if current:
        blocks.append("\n".join(current))

    rules = []
    for block in blocks:
        match = re.search(r"(?m)^\s*path_regex:\s*(.*?)\s*$", block)
        rules.append(
            {
                "path_regex": match.group(1) if match else None,
                "age": re.findall(r"age1[0-9a-z]+", block),
            }
        )
    return rules


def config_rules(path):
    text = open(path, encoding="utf-8").read()
    if yaml is not None:
        cfg = yaml.safe_load(text)
        return (cfg or {}).get("creation_rules", [])
    return _rules_from_text(text)


def _recipients(age):
    if isinstance(age, str):
        return sorted(set(re.findall(r"age1[0-9a-z]+", age)))
    return sorted(set(age or []))


def config_recipients(path, secret_path):
    for rule in config_rules(path):
        pattern = rule.get("path_regex")
        if pattern and re.search(pattern, secret_path) is None:
            continue
        return _recipients(rule.get("age", []))
    raise ValueError(f"no creation rule matches {secret_path}")


def file_recipients(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return sorted(x.get("recipient", "") for x in data.get("sops", {}).get("age", []))


def check_labels(config_path):
    """Every recipient in every rule must be documented in a `#` comment."""
    comments = [l for l in open(config_path, encoding="utf-8").read().splitlines() if "#" in l]
    want = sorted(
        {
            recipient
            for rule in config_rules(config_path)
            for recipient in _recipients(rule.get("age", []))
        }
    )
    missing = [r for r in want if not any(r in l.split("#", 1)[1] for l in comments)]
    if missing:
        print("  ❌ Recipients without a '# host' comment in .sops.yaml:")
        for r in missing:
            print(f"    {r}")
        return False
    print("  ✅ All recipients labeled")
    unconfirmed = [r for r in want if any(r in l for l in comments if "unconfirmed" in l.lower())]
    if unconfirmed:
        print("  ⚠️  UNCONFIRMED recipients (resolve or remove):")
        for r in unconfirmed:
            print(f"    {r}")
    return True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    want_labels = "--labels" in sys.argv[1:]
    config_path = args[0] if len(args) > 0 else ".sops.yaml"
    files = args[1:] if len(args) > 1 else []
    failed = False
    if want_labels and not check_labels(config_path):
        return 1
    for f in files:
        try:
            want = config_recipients(config_path, f)
            got = file_recipients(f)
        except (OSError, ValueError, json.JSONDecodeError) as e:
            print(f"  ❌ {f}: cannot validate recipient list ({e})")
            failed = True
            continue
        if got != want:
            print(f"  ❌ {f} recipients differ from {config_path}")
            print(f"     config: {' '.join(want)}")
            print(f"     file:   {' '.join(got)}")
            print(f"     Run: sops updatekeys {f} (after confirming .sops.yaml is correct)")
            failed = True
    if failed:
        return 1
    print(f"  ✅ {len(files)} .enc recipient lists match their SOPS rules")
    return 0


if __name__ == "__main__":
    sys.exit(main())
