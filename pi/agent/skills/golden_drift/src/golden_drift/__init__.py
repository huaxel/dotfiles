"""golden_drift: triage a failing seed-42 golden playtest (regen vs fix)."""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path
from typing import Any

# Files whose change signals an RN: stream shift (from BelPolSim review memories).
RNG_CONSUMER_PATTERNS = [
    "RandomService",
    "MorningBriefingSystem",
    "ProceduralGenerator",
    "balanceAndShuffleInbox",
    "rivalStrategies",
    "RivalSystem",
    "GoverningRivalStrategy",
    "FormationRivalStrategy",
    "CampaignRivalStrategy",
    "blockagesForFootprint",
    "generateMandate",
    "generateMission",
]

GOLDEN_DIR = Path("docs/playtests/cli/seed-42")


def _git(repo: Path, *args: str) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=20
        )
        return out.stdout.strip()
    except Exception as exc:  # pragma: no cover
        return f"<git error: {exc}>"


async def run(
    repository: str = ".",
    seed: int = 42,
) -> dict[str, Any]:
    """Classify a golden drift as legitimate (regen) vs accidental RNG shift (fix)."""
    root = Path(repository)
    notes: list[str] = []

    # 1. What changed in src/ (working tree + HEAD) — golden drifts come from uncommitted work.
    changed = _git(root, "status", "--short") + "\n" + _git(root, "diff", "--name-only", "HEAD", "--", "src/")
    raw = [l for l in changed.splitlines() if l.strip()]
    changed_files = []
    for l in raw:
        # strip status codes like " M file" / "?? file"
        parts = l.split(" ", 2)
        changed_files.append(parts[-1] if len(parts) > 1 else l)
    changed_files = [f for f in changed_files if f and not f.startswith(".venv/")]
    notes.append(f"changed src files: {len(changed_files)}")

    # 2. Which changed files touch an RNG consumer?
    touched = []
    for f in changed_files:
        for pat in RNG_CONSUMER_PATTERNS:
            if pat.lower() in f.lower():
                touched.append(f)
                break
    notes.append(f"touched RNG consumers: {touched or 'none'}")

    # 3. Check whether goldens exist (i.e. this is a drift, not a bootstrap).
    goldens_exist = all((root / GOLDEN_DIR / n).exists() for n in ("final.json", "summary.json", "transcript.jsonl"))
    notes.append(f"goldens present: {goldens_exist}")

    # 4. Run the golden test quickly if the runner is available (non-fatal).
    test_out = ""
    cmd = ["pnpm", "test:run", "--", "src/cli/golden.test.ts"]
    try:
        r = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True, timeout=180)
        test_out = r.stdout[-900:] + r.stderr[-500:]
    except Exception as exc:
        test_out = f"<could not run test: {exc}>"
    notes.append(f"golden test tail (abridged): {test_out[-400:]}")

    drift_causes: list[str] = []
    if touched:
        drift_causes.append("rng_consumer_modified")
        # fingerprint sub-causes
        lowered = " ".join(f.lower() for f in touched)
        if "rivalstrateg" in lowered or "rivalsystem" in lowered:
            drift_causes.append("rival_rng_consumption")
        if "briefing" in lowered or "proceduralgenerator" in lowered:
            drift_causes.append("inbox_content_shifts_null_bot_hand")
        if "blockagesforfootprint" in lowered:
            drift_causes.append("blockagesforfootprint_column0_pinning")
    if not goldens_exist:
        drift_causes.append("goldens_missing_bootstrap")
    elif "golden" not in test_out.lower() and not touched:
        drift_causes.append("unclassified")

    verdict = "fix" if touched else "regen" if goldens_exist else "bootstrap"
    commands: list[str] = []
    if verdict == "regen" and goldens_exist and not touched:
        commands.append("pnpm playtest:golden   # regen goldens, then review the diff before committing")
    if verdict == "fix":
        commands.append("DO NOT regen goldens — fix the RNG-stream shift (keep array LENGTH constant, prefer suit-aware filtering)")

    return {
        "changed_files": changed_files,
        "touched_rng_consumers": touched,
        "drift_causes": drift_causes,
        "goldens_exist": goldens_exist,
        "verdict": verdict,
        "commands": commands,
        "notes": notes,
    }


def cli_run() -> None:
    """Console-script entrypoint mirroring run() (demo)."""
    import tyro

    result = asyncio.run(run())
    print("changed:", len(result["changed_files"]))
    print("rng consumers touched:", result["touched_rng_consumers"] or "none")
    print("causes:", result["drift_causes"] or "none")
    print("verdict:", result["verdict"])
    for c in result["commands"]:
        print("  >>", c)


if __name__ == "__main__":
    cli_run()