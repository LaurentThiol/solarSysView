"""Lecteur des schémas : catalogue, liens, entrée de menu."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_schemas_reader() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / "test_schemas.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
