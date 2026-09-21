from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_weekday_scope_node() -> None:
    script = ROOT / "tests" / "test_weekday_scope.ts"
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--test", str(script)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
