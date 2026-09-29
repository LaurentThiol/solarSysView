"""Suivi des bibliothèques : plages npm/pip et rapport sans réseau."""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

_PATH = Path(__file__).resolve().parents[1] / "scripts" / "dependency_watch.py"
_SPEC = importlib.util.spec_from_file_location("dependency_watch", _PATH)
dw = importlib.util.module_from_spec(_SPEC)
assert _SPEC is not None and _SPEC.loader is not None
sys.modules["dependency_watch"] = dw
_SPEC.loader.exec_module(dw)

ROOT = Path(__file__).resolve().parents[1]

REACT_PEER = "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"
A11Y_PEER = "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9"
IMPORT_PEER = "^2 || ^3 || ^4 || ^5 || ^6 || ^7.2.0 || ^8 || ^9"
TYPESCRIPT_ESLINT_PEER = "^8.57.0 || ^9.0.0 || ^10.0.0"
HOOKS_PEER = "^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0-0 || ^9.0.0 || ^10.0.0"


def test_eslint_9_peers_do_not_allow_10() -> None:
    for peer in (REACT_PEER, A11Y_PEER, IMPORT_PEER, "^9", "^9.7"):
        assert dw.range_allows_major(peer, 10) is False


def test_eslint_10_peers_allow_10() -> None:
    for peer in (TYPESCRIPT_ESLINT_PEER, HOOKS_PEER, ">=9.0.0", "^10", "*", ">=10"):
        assert dw.range_allows_major(peer, 10) is True


def test_upper_bound_below_10_blocks_eslint_10() -> None:
    assert dw.npm_satisfies("10.0.0", ">=9 <10") is False
    assert dw.npm_satisfies("9.39.5", "9.0.0 - 9.9.9") is False
    assert dw.npm_satisfies("9.9.9", "9.0.0 - 9.9.9") is True
    assert dw.range_allows_major("~10.2.3", 10) is True
    assert dw.npm_satisfies("10.2.3", "~10.2.3") is True
    assert dw.npm_satisfies("10.3.0", "~10.2.3") is False


def test_caret_zero_and_partial_versions() -> None:
    assert dw.npm_satisfies("0.7.9", "^0.7.1") is True
    assert dw.npm_satisfies("0.8.0", "^0.7.1") is False
    assert dw.npm_satisfies("4.9.0", "^4") is True
    assert dw.npm_satisfies("5.0.0", "^4") is False
    assert dw.npm_satisfies("16.3.4", "16.3.4") is True
    assert dw.npm_satisfies("16.3.7", "16.3.4") is False


def test_unreadable_npm_range_is_none() -> None:
    assert dw.npm_satisfies("1.0.0", "git://example") is None
    assert dw.range_allows_major("pas-une-plage", 10) is None


def test_pip_upper_bound_and_equivalent_releases() -> None:
    assert dw.pep_satisfies("4.57.1", ">=4.45.0,<5") is True
    assert dw.pep_satisfies("5.0.0", ">=4.45.0,<5") is False
    assert dw.pep_satisfies("1.26.0", ">=1.26") is True
    assert dw.pep_satisfies("2.1.0", ">=1.26") is True
    assert dw.pep_satisfies("2.6.1", ">=2.6") is True
    assert dw.pep_satisfies("2.8.0", "~=2.6") is True
    assert dw.pep_satisfies("3.0.0", "~=2.6") is False


def test_repo_manifests_list_eslint_and_optional_requirements() -> None:
    deps = {item.name: item.spec for item in dw.load_npm_deps(ROOT)}
    assert deps["eslint"] == "^9"
    assert deps["next"] == "16.3.4"
    reqs = {(item.manifest, item.name): item.spec for item in dw.load_requirements(ROOT)}
    assert reqs[("requirements.txt", "fastapi")] == ">=0.115.0"
    assert reqs[("requirements-morpho.txt", "transformers")] == ">=4.45.0,<5"
    assert ("requirements-ref.txt", "sunpy") in reqs
    assert ("requirements-decision-tree.txt", "scikit-learn") in reqs
    actions = dw.load_actions(ROOT)
    assert ("actions/checkout", "v4") in actions


def test_report_keeps_eslint_major_closed_and_lists_real_decisions(tmp_path: Path) -> None:
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "dependencies": {"next": "16.3.4", "recharts": "^3.8.0"},
                "devDependencies": {"eslint": "^9"},
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "package-lock.json").write_text(
        json.dumps(
            {
                "packages": {
                    "node_modules/next": {"version": "16.3.4"},
                    "node_modules/eslint": {"version": "9.39.5"},
                    "node_modules/recharts": {"version": "3.8.0"},
                }
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "requirements.txt").write_text("fastapi>=0.115.0\n", encoding="utf-8")
    (tmp_path / "requirements-morpho.txt").write_text(
        "# commentaire\ntransformers>=4.45.0,<5\n",
        encoding="utf-8",
    )
    workflow = tmp_path / ".github" / "workflows"
    workflow.mkdir(parents=True)
    (workflow / "test.yml").write_text("jobs:\n  t:\n    steps:\n      - uses: actions/checkout@v4\n", encoding="utf-8")

    def fetch_npm(name: str) -> dw.NpmMeta:
        table = {
            "next": dw.NpmMeta("16.3.7"),
            "recharts": dw.NpmMeta("3.9.1"),
            "eslint": dw.NpmMeta("10.11.0"),
            "eslint-plugin-react": dw.NpmMeta("7.37.5", peer_eslint=REACT_PEER),
            "eslint-plugin-jsx-a11y": dw.NpmMeta("6.10.2", peer_eslint=A11Y_PEER),
            "eslint-plugin-import": dw.NpmMeta("2.32.0", peer_eslint=IMPORT_PEER),
        }
        return table[name]

    def fetch_pypi(name: str) -> str:
        return {"fastapi": "0.116.1", "transformers": "5.1.0"}[name]

    def fetch_release(repo: str) -> str:
        assert repo == "actions/checkout"
        return "v4.2.2"

    report = dw.build_report(
        tmp_path,
        fetch_npm=fetch_npm,
        fetch_pypi=fetch_pypi,
        fetch_release=fetch_release,
        now=datetime(2026, 9, 29, 7, 0, tzinfo=timezone.utc),
    )
    by_name = {item.name: item for item in report.updates}
    assert by_name["eslint"].status == "hors plage, plugins pas prêts"
    assert by_name["next"].status == "épinglée"
    assert by_name["recharts"].status == "verrou en retard"
    assert by_name["transformers"].source == "requirements-morpho.txt"
    assert by_name["transformers"].status == "hors contrainte"
    assert "fastapi" not in by_name
    assert report.actions == ()
    text = dw.render(report)
    assert text.startswith(dw.MARKER)
    assert "Pas encore" in text
    assert "9.39.5" in text
    assert "Rien cette semaine" not in text


def test_report_says_when_eslint_10_is_ready(tmp_path: Path) -> None:
    (tmp_path / "package.json").write_text(
        json.dumps({"devDependencies": {"eslint": "^9"}}),
        encoding="utf-8",
    )

    def fetch_npm(name: str) -> dw.NpmMeta:
        if name == "eslint":
            return dw.NpmMeta("10.11.0")
        return dw.NpmMeta("9.0.0", peer_eslint="^10")

    report = dw.build_report(
        tmp_path,
        fetch_npm=fetch_npm,
        fetch_pypi=lambda name: "1.0.0",
        fetch_release=lambda repo: "v1.0.0",
    )
    text = dw.render(report)
    assert "Les trois plugins acceptent ESLint 10" in text
    assert "passer `eslint` de `^9` à `^10`" in text
    assert all(item.allows_10 for item in report.gate)


def test_action_major_and_fetch_errors_stay_in_the_report(tmp_path: Path) -> None:
    (tmp_path / "package.json").write_text(json.dumps({"dependencies": {"left": "^1.0.0"}}), encoding="utf-8")
    workflow = tmp_path / ".github" / "workflows"
    workflow.mkdir(parents=True)
    (workflow / "test.yml").write_text(
        "steps:\n  - uses: actions/setup-python@v5\n  - uses: actions/checkout@v4\n",
        encoding="utf-8",
    )

    def fetch_npm(name: str) -> dw.NpmMeta:
        if name == "left":
            raise RuntimeError("registre coupé")
        return dw.NpmMeta("1.0.0", peer_eslint="^9")

    def fetch_release(repo: str) -> str:
        if repo == "actions/checkout":
            return "v5.0.0"
        raise RuntimeError("pas de release")

    report = dw.build_report(
        tmp_path,
        fetch_npm=fetch_npm,
        fetch_pypi=lambda name: "1.0.0",
        fetch_release=fetch_release,
    )
    assert any("left" in error for error in report.errors)
    assert any("setup-python" in error for error in report.errors)
    assert report.actions[0].action == "actions/checkout"
    assert report.actions[0].latest == "v5.0.0"
    text = dw.render(report)
    assert "majeure d'action" in text
    assert "Lectures impossibles" in text
