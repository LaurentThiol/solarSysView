"""Décalage zonal de l'onglet Annuel."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_annual_lag_node() -> None:
    script = ROOT / "tests" / "test_annual_lag.ts"
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(script),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
