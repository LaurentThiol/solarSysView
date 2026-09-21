"""IA locale : détection de modèles et deux passes Ollama (côté Node)."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def _run(script: str) -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / script),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_ia_models_node() -> None:
    _run("test_ia_models.ts")


def test_ia_ollama_node() -> None:
    _run("test_ia_ollama.ts")


def test_ia_local_node() -> None:
    _run("test_ia_local.ts")


def test_ia_stream_node() -> None:
    _run("test_ia_stream.ts")


def test_ia_threads_node() -> None:
    _run("test_ia_threads.ts")


def test_ia_usage_node() -> None:
    _run("test_ia_usage.ts")
