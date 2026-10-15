"""probaDynamic : compteur d’observateur et carte."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_proba_dynamic_node() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / "test_proba_dynamic.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
