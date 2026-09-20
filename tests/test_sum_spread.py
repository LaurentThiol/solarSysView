"""Nuage somme × étendue : axes et cellules côté Node."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_sum_spread_node() -> None:
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--test", str(ROOT / "tests" / "test_sum_spread.ts")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
