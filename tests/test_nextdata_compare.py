"""Tableau Prévu et sorti de nextDataTraining."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_nextdata_training_table_node() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / "test_nextdata_help.ts"),
            str(ROOT / "tests" / "test_nextdata_compare.ts"),
            str(ROOT / "tests" / "test_nextdata_rank_path.ts"),
            str(ROOT / "tests" / "test_nextdata_progress.ts"),
            str(ROOT / "tests" / "test_nextdata_series.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
