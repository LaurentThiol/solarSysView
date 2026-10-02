"""Next · Triple : triplets lus sur les tirages, du plus récent au plus ancien."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def _run(script: str) -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--test",
            str(ROOT / "tests" / script),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_next_triple_node() -> None:
    _run("test_next_triple.ts")


def test_triple_chart_node() -> None:
    _run("test_triple_chart.ts")
