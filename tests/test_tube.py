"""Tube : modèle côté Node, phase lunaire alignée sur synchro.ref, page câblée."""

from datetime import date, timedelta
from pathlib import Path
import json
import subprocess

from synchro.ref.phases import synodic_fraction

ROOT = Path(__file__).resolve().parents[1]
NODE = [
    "node",
    "--experimental-strip-types",
    "--no-warnings",
    "--import",
    str(ROOT / "tests" / "node-register.mjs"),
]


def test_tube_node() -> None:
    result = subprocess.run(
        [*NODE, "--test", str(ROOT / "tests" / "test_tube.ts")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_tube_lunar_matches_python() -> None:
    start = date(2004, 2, 13)
    days = [(start + timedelta(days=37 * i)).isoformat() for i in range(240)]
    script = (
        "import { lunarFraction } from './src/lib/tube/lunar.ts';"
        f"console.log(JSON.stringify({json.dumps(days)}.map((d) => lunarFraction(d))))"
    )
    result = subprocess.run(
        [*NODE, "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    node = json.loads(result.stdout)
    for day, value in zip(days, node):
        python = synodic_fraction(date.fromisoformat(day))
        gap = abs(value - python)
        assert min(gap, 1 - gap) < 1e-9, (day, value, python)


def test_tube_page_is_wired() -> None:
    page = (ROOT / "src/app/tube/page.tsx").read_text(encoding="utf-8")
    lab = (ROOT / "src/components/tube/tube-lab.tsx").read_text(encoding="utf-8")
    pack = (ROOT / "src/lib/capture/pack.ts").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert "TubeLab" in page
    assert "useRegisterCapture" in lab
    assert "packTube" in lab
    assert "WeekdayScopeControl" in lab
    assert "Tube ·" in pack
    assert "## Tube (`/tube`)" in readme
