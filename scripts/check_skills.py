#!/usr/bin/env python3
"""Read-only skill catalog checks. Requires PyYAML (included in nix develop .#ci)."""
from __future__ import annotations

import argparse
import os
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


HARNESS_IMPORT_MARKERS = (
    r"(?:~|\.\.?)?/?\.cursor/skills",
    r"\.cursor/rules",
    r"skills-cursor",
    r"\.cursor/cli-config\.json",
    r"origin\.cursor\.com",
    r"@cursor/sdk",
    r"Codex Canvas",
)


def harness_imports(text: str) -> list[str]:
    """A Cursor/Codex-app skill describes paths and products this setup does not have.

    Copying one into the shared catalog makes the model route to directories that do
    not exist, so it is rejected rather than reviewed. Vendor files under `synced/`
    are exempt: they belong to another harness and are never edited in place.
    """
    prose = re.sub(r"(?ms)^```[^\n]*\n.*?^```[^\n]*$", "", text)
    return [p for p in HARNESS_IMPORT_MARKERS if re.search(p, prose)]


def frontmatter(text: str) -> tuple[dict, str]:
    """Split a Markdown frontmatter block from its body."""
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
    return value, "\n".join(lines[end + 1 :]).strip()


def eval_errors(case: Path, relative: Path) -> list[str]:
    """Validate one behavioral case against the convention the existing cases follow.

    A case is a prompt plus an expected outcome and at least one grader. It is prepared
    material, not evidence that a model was run; the shape is checked here so a malformed
    case fails the gate instead of surfacing when someone finally executes the suite.
    """
    errors = []
    spec_path = case / "case.yaml"
    try:
        spec = yaml.load(spec_path.read_text(encoding="utf-8"), Loader=UniqueLoader)
    except (OSError, yaml.YAMLError) as exc:
        return [f"{relative}/case.yaml: {exc}"]
    if not isinstance(spec, dict):
        return [f"{relative}/case.yaml: must be a mapping"]
    if not isinstance(spec.get("schema_version"), str):
        errors.append(f"{relative}/case.yaml: schema_version must be a string")
    if spec.get("name") != case.name:
        errors.append(f"{relative}/case.yaml: name must match directory {case.name}")
    outcome = spec.get("expected_outcome")
    if not isinstance(outcome, str) or not outcome.strip():
        errors.append(f"{relative}/case.yaml: expected_outcome must be a non-empty string")
    prompt_path = case / "prompt.md"
    try:
        meta, body = frontmatter(prompt_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, yaml.YAMLError) as exc:
        errors.append(f"{relative}/prompt.md: {exc}")
    else:
        for field in ("max_turns", "timeout_seconds"):
            if type(meta.get(field)) is not int:
                errors.append(f"{relative}/prompt.md: {field} must be an integer")
        if not isinstance(meta.get("allowed_tools"), list):
            errors.append(f"{relative}/prompt.md: allowed_tools must be a list")
        if not body:
            errors.append(f"{relative}/prompt.md: prompt body is empty")
    graders = sorted((case / "graders").glob("*.md"))
    if not graders:
        errors.append(f"{relative}: no graders/*.md")
    for grader in graders:
        name = f"{relative}/graders/{grader.name}"
        try:
            meta, body = frontmatter(grader.read_text(encoding="utf-8"))
        except (OSError, ValueError, yaml.YAMLError) as exc:
            errors.append(f"{name}: {exc}")
            continue
        if not isinstance(meta.get("type"), str):
            errors.append(f"{name}: type must be a string")
        if not isinstance(meta.get("focus"), str):
            errors.append(f"{name}: focus must be a string")
        if type(meta.get("weight")) not in (int, float):
            errors.append(f"{name}: weight must be a number")
        if not body:
            errors.append(f"{name}: assertion is empty")
    return errors


def resource_targets(text: str) -> set[str]:
    """Literal bundled resources, not arbitrary shell commands or generated paths."""
    return set(re.findall(
        r"(?<![\w/.-])(?:scripts|references|assets)/[A-Za-z0-9_.\-/]+", text
    ))


def link_targets(text: str) -> set[str]:
    # Ignore illustrative fenced and inline code; angle-bracket and titled links are
    # supported. Inline code matters because syntax examples such as `[text](url)`
    # are documentation, not links to bundled files.
    prose = re.sub(r"(?ms)^```[^\n]*\n.*?^```[^\n]*$", "", text)
    prose = re.sub(r"(`+)(?:(?!\1).)*?\1", "", prose, flags=re.S)
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
            if "synced" not in relative.parts:
                for marker in harness_imports(text):
                    errors.append(
                        f"{relative}: Cursor/Codex-app skill imported into the shared "
                        f"catalog (matched {marker!r}); keep it harness-local or drop it"
                    )
            targets = resource_targets(text)
            # Behavioral cases follow one convention across every skill that has them;
            # `results/` holds run outputs, not a case.
            if "synced" not in relative.parts:
                for case in sorted((path.parent / "evals").glob("*/")):
                    if case.name == "results":
                        continue
                    errors.extend(eval_errors(case, relative.parent / "evals" / case.name))
            if "synced" not in relative.parts:
                targets |= link_targets(text)
            for target in sorted(targets):
                if not (path.parent / target).exists():
                    errors.append(f"{relative}: missing bundled target {target}")
        except (ValueError, OSError, yaml.YAMLError, TypeError) as exc:
            errors.append(f"{relative}: {exc}")
    return errors


def local_drift(root: Path, home: Path) -> list[str]:
    """Advisory only: do not assume local overrides can safely be replaced.

    A linked skill directory is a pointer to its own source rather than a copied file,
    so it cannot drift and is not reported. Harness-specific variants (a Codex build of
    a terminal skill, for example) are intentional and would otherwise warn on every run,
    which trains the reader to ignore the check.
    """
    notes = []
    for agent in (".claude", ".codex"):
        base = home / agent / "skills"
        for source in sorted((root / "skills").glob("*/SKILL.md")):
            copy = base / source.parent.name / "SKILL.md"
            if copy.is_symlink() or copy.parent.is_symlink():
                continue
            if copy.exists() and copy.resolve() != source.resolve():
                state = "identical copy" if copy.read_bytes() == source.read_bytes() else "DIVERGENT copy"
                notes.append(f"{copy}: {state}; review ownership before linking")
    notes.extend(shared_root_drift(root, home))
    return notes


def shared_root_drift(root: Path, home: Path) -> list[str]:
    """Report stray installs in the shared discovery root.

    ~/.agents/skills is a real directory of per-skill links rather than a link to the
    checkout: harnesses install their own skills into that path when they start, and
    inside the checkout such an install becomes a commit candidate. An entry that is
    not a link into the catalog is therefore a harness import, not catalog content,
    and it is reported rather than repaired.
    """
    shared = home / ".agents/skills"
    catalog = (root / "skills").resolve()
    if not catalog.is_dir():
        return []
    if shared.is_symlink() or not shared.is_dir():
        return [f"{shared}: expected a directory of links into {catalog}"]
    notes = []
    stray = []
    for entry in sorted(shared.iterdir()):
        if entry.name.startswith("."):
            continue
        if not entry.is_symlink():
            stray.append(entry.name)
            continue
        # Compare the immediate target without resolving the chain: the catalog may
        # itself link an integration out to its own install directory.
        raw = Path(os.readlink(entry))
        immediate = Path(os.path.normpath(raw if raw.is_absolute() else entry.parent / raw))

        def inside(path: Path) -> bool:
            return path == catalog or catalog in path.parents

        # Accept either reading: the immediate target keeps a catalog-linked
        # integration valid when the catalog itself links out, and the resolved
        # target absorbs directories that reach the catalog through a symlink.
        if not (inside(immediate) or inside(entry.resolve())):
            notes.append(f"{entry}: link leaves the catalog ({immediate})")
    if stray:
        shown = ", ".join(stray[:6]) + (" …" if len(stray) > 6 else "")
        count = "entry" if len(stray) == 1 else "entries"
        notes.append(
            f"{shared}: {len(stray)} stray {count} not linked into the catalog ({shown}): "
            "a harness installed skills here; delete the copies, they sit outside Git by design"
        )
    missing = [
        directory.name
        for directory in sorted(catalog.iterdir())
        if directory.is_dir() and not (shared / directory.name).is_symlink()
    ]
    if missing:
        shown = ", ".join(missing[:6]) + (" …" if len(missing) > 6 else "")
        notes.append(f"{shared}: missing links for {shown}; re-run bootstrap.sh")
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
