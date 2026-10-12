"""Aide en ligne des champs de la page Pulse."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_pulse_help_node() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--test",
            str(ROOT / "tests" / "test_pulse_help.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
