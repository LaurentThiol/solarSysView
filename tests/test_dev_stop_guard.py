"""Quitter ne doit pas laisser le badge Compiling de Next planter la page."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_dev_stop_guard_node() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / "test_dev_stop_guard.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
