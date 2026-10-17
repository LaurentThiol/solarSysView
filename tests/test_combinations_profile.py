"""Profil Combinaisons : chaque boule garde son retard et son total."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_combinations_profile_keeps_each_ball() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / "test_combinations_profile.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
