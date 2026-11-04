"""Lance les fichiers `tests/*.ts` qui n'ont pas de wrapper pytest, un test pytest par fichier.

Un wrapper est un autre `tests/test_*.py` qui contient `--test` (il lance `node --test`)
et cite le nom du fichier `.ts`. Un nom cité dans un commentaire, ou dans un module qui ne
lance pas `node --test`, ne compte pas.

La liste se calcule à partir des wrappers : un fichier déjà lancé ailleurs n'est pas relancé ici,
et un nouveau fichier `.ts` tourne en CI sans wrapper à écrire.
"""

import ast
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "tests"
TIMEOUT_SECONDS = 120


def _cited_by_wrappers() -> set[str]:
    cited: set[str] = set()
    for wrapper in TESTS.glob("test_*.py"):
        if wrapper.name == Path(__file__).name:
            continue
        strings = {
            node.value
            for node in ast.walk(ast.parse(wrapper.read_text(encoding="utf-8")))
            if isinstance(node, ast.Constant) and isinstance(node.value, str)
        }
        if "--test" in strings:
            cited.update(Path(value).name for value in strings if value.endswith(".ts"))
    return cited


def _without_wrapper() -> list[str]:
    cited = _cited_by_wrappers()
    return [path.name for path in sorted(TESTS.glob("*.ts")) if path.name not in cited]


@pytest.mark.parametrize("name", _without_wrapper())
def test_node_file_without_wrapper(name: str) -> None:
    command = [
        "node",
        "--experimental-strip-types",
        "--import",
        "./tests/node-register.mjs",
        "--test",
        f"tests/{name}",
    ]
    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        pytest.fail(f"{' '.join(command)}\n{result.stdout}{result.stderr}", pytrace=False)
