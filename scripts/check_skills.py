#!/usr/bin/env python3
"""Read-only skill catalog checks. Requires PyYAML (included in nix develop .#ci)."""
from __future__ import annotations

import argparse
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    import yaml
except ImportError as exc:
    raise SystemExit("PyYAML required: run inside `nix develop .#ci`") from exc


class UniqueLoader(yaml.SafeLoader):
    """Reject duplicate keys instead of silently accepting the last value."""


def unique_mapping(loader, node):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if key in result:
            raise ValueError(f"duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def metadata(text: str) -> dict:
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("missing frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ValueError("unterminated frontmatter") from exc
    value = yaml.load("\n".join(lines[1:end]), Loader=UniqueLoader)
    if not isinstance(value, dict):
        raise ValueError("frontmatter must be a mapping")
    return value


def resource_targets(text: str) -> set[str]:
    """Literal bundled resources, not arbitrary shell commands or generated paths."""
    return set(re.findall(
        r"(?<![\w/.-])(?:scripts|references|assets)/[A-Za-z0-9_.\-/]+", text
    ))


def link_targets(text: str) -> set[str]:
    # Ignore illustrative fenced code; angle-bracket and titled links are supported.
    prose = re.sub(r"(?ms)^```[^\n]*\n.*?^```[^\n]*$", "", text)
    targets = set()
    for match in re.finditer(r"\]\((<[^>]+>|[^\s)]+)(?:\s+\"[^\"]*\")?\)", prose):
        target = match.group(1).strip("<>")
        parts = urlsplit(target)
        if parts.scheme or parts.netloc or not parts.path or target.startswith(("/", "~")):
            continue
        targets.add(unquote(parts.path))
    return targets


def check_catalog(root: Path) -> list[str]:
    errors = []
    names = {}
    paths = sorted((root / "skills").rglob("SKILL.md"))
    paths += sorted((root / "pi/agent/skills").rglob("SKILL.md"))
    if not paths:
        return ["no skills found"]
    for path in paths:
        relative = path.relative_to(root)
        try:
            text = path.read_text(encoding="utf-8")
            info = metadata(text)
            name = info.get("name")
            description = info.get("description")
            if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name) or len(name) > 64:
                raise ValueError("name must be a lowercase hyphenated identifier of at most 64 characters")
            if name != path.parent.name:
                errors.append(f"{relative}: name must match directory")
            if name in names:
                errors.append(f"{relative}: duplicate skill name {name} (also {names[name]})")
            names[name] = relative
            if not isinstance(description, str) or not description.strip() or len(description) > 1024:
                errors.append(f"{relative}: description must contain 1–1024 characters")
            if "disable-model-invocation" in info and not isinstance(info["disable-model-invocation"], bool):
                errors.append(f"{relative}: disable-model-invocation must be boolean")
            native_path = path.parent / "agents/openai.yaml"
            if native_path.is_file():
                native = yaml.load(native_path.read_text(), Loader=UniqueLoader)
                if not isinstance(native, dict) or not isinstance(native.get("policy", {}), dict):
                    raise ValueError("agents/openai.yaml must contain a mapping and a policy mapping")
                policy = native.get("policy", {})
                if "allow_implicit_invocation" in policy and type(policy["allow_implicit_invocation"]) is not bool:
                    errors.append(f"{relative}: allow_implicit_invocation must be boolean")
                if info.get("disable-model-invocation") is True and policy.get("allow_implicit_invocation", True) is not False:
                    errors.append(f"{relative}: Codex policy contradicts explicit-only invocation")
            # Vendor files are preserved, but their literal bundled resources still
            # must exist. Full link checks apply to locally maintained skills only.
            targets = resource_targets(text)
            if "synced" not in relative.parts:
                targets |= link_targets(text)
            for target in sorted(targets):
                if not (path.parent / target).exists():
                    errors.append(f"{relative}: missing bundled target {target}")
        except (ValueError, OSError, yaml.YAMLError, TypeError) as exc:
            errors.append(f"{relative}: {exc}")
    return errors


def local_drift(root: Path, home: Path) -> list[str]:
    """Advisory only: do not assume local overrides can safely be replaced."""
    notes = []
    for agent in (".claude", ".codex"):
        base = home / agent / "skills"
        for source in sorted((root / "skills").glob("*/SKILL.md")):
            copy = base / source.parent.name / "SKILL.md"
            if copy.exists() and copy.resolve() != source.resolve():
                state = "identical copy" if copy.read_bytes() == source.read_bytes() else "DIVERGENT copy"
                notes.append(f"{copy}: {state}; review ownership before linking")
    shared = home / ".agents/skills"
    if shared.resolve() != (root / "skills").resolve():
        notes.append(f"{shared}: not linked to {root / 'skills'}")
    return notes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--local", action="store_true", help="also report machine-local copies; never modify them")
    args = parser.parse_args()
    errors = check_catalog(args.root)
    for error in errors:
        print(f"ERROR: {error}")
    if args.local:
        for note in local_drift(args.root, Path.home()):
            print(f"WARNING: {note}")
    if not errors:
        print("Skill catalog checks passed")
    return bool(errors)


if __name__ == "__main__":
    raise SystemExit(main())
