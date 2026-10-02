"""Next · Couple : proximité lue sur les tirages, du plus récent au plus ancien."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_next_couple_node() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--test",
            str(ROOT / "tests" / "test_next_couple.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
