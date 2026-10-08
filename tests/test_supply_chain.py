"""Inventaire Syft / Grype : normalisation sans binaires, et câblage admin."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

_PATH = Path(__file__).resolve().parents[1] / "scripts" / "supply_chain.py"
_SPEC = importlib.util.spec_from_file_location("supply_chain", _PATH)
sc = importlib.util.module_from_spec(_SPEC)
assert _SPEC is not None and _SPEC.loader is not None
sys.modules["supply_chain"] = sc
_SPEC.loader.exec_module(sc)

ROOT = Path(__file__).resolve().parents[1]


def _match(
    advisory: str,
    severity: str,
    package: str,
    version: str,
    kind: str,
    *,
    fix: str | None = None,
    summary: str = "Un avis.",
    purl: str | None = None,
) -> dict:
    ecosystem = "npm" if kind == "npm" else "pypi"
    return {
        "vulnerability": {
            "id": advisory,
            "severity": severity,
            "description": summary,
            "dataSource": f"https://example.test/{advisory}",
            "urls": [f"https://example.test/{advisory}"],
            "fix": {
                "state": "fixed" if fix else "not-fixed",
                "versions": [fix] if fix else [],
            },
        },
        "artifact": {
            "name": package,
            "version": version,
            "type": kind,
            "purl": purl or f"pkg:{ecosystem}/{package}@{version}",
        },
    }


SBOM = {
    "metadata": {"tools": {"components": [{"name": "syft", "version": "1.20.0"}]}},
    "components": [
        {"name": "lodash", "version": "4.17.20", "purl": "pkg:npm/lodash@4.17.20"},
        {"name": "fastapi", "version": "0.115.0", "purl": "pkg:pypi/fastapi@0.115.0"},
        {"name": "openssl", "version": "3.0.0", "purl": "pkg:deb/debian/openssl@3.0.0"},
        {
            "name": "local-lib",
            "version": "0.1.0",
            "properties": [{"name": "syft:package:type", "value": "python"}],
        },
    ],
}

GRYPE = {
    "matches": [
        _match("GHSA-1", "High", "lodash", "4.17.20", "npm", fix="4.17.21", summary="Prototype pollution."),
        _match("GHSA-1", "High", "lodash", "4.17.20", "npm", summary="doublon sans correctif"),
        _match("GHSA-2", "Critical", "fastapi", "0.115.0", "python"),
        _match("CVE-3", "Medium", "openssl", "3.0.0", "deb", purl="pkg:deb/debian/openssl@3.0.0"),
    ],
    "descriptor": {"name": "grype", "version": "0.87.0", "db": {"built": "2026-10-06T03:04:05Z"}},
}


def test_normalize_dedupes_and_keeps_the_fix() -> None:
    findings = sc.normalize_matches(GRYPE["matches"])
    lodash = [item for item in findings if item.package == "lodash"]
    assert len(lodash) == 1
    assert lodash[0].fix_version == "4.17.21"
    assert lodash[0].severity == "high"
    assert lodash[0].ecosystem == "npm"
    assert lodash[0].url == "https://example.test/GHSA-1"
    assert findings[0].id == "GHSA-2"
    assert findings[0].severity == "critical"


def test_same_advisory_on_two_versions_stays_split() -> None:
    findings = sc.normalize_matches(
        [
            _match("GHSA-1", "High", "leftpad", "1.0.0", "npm"),
            _match("GHSA-1", "High", "leftpad", "1.1.0", "npm"),
        ]
    )
    assert len(findings) == 2
    assert {item.version for item in findings} == {"1.0.0", "1.1.0"}


def test_report_counts_sbom_and_python_note(tmp_path: Path) -> None:
    (tmp_path / "requirements.txt").write_text("fastapi>=0.115.0\n# commentaire\nfoo==1.2.3\n", encoding="utf-8")
    report = sc.build_report(tmp_path, SBOM, GRYPE, generated_at="2026-10-07 18:00 UTC")
    assert report.counts == {
        "critical": 1,
        "high": 1,
        "medium": 1,
        "low": 0,
        "negligible": 0,
        "unknown": 0,
    }
    assert report.components == 4
    assert report.by_type == {"npm": 1, "python": 2, "autre": 1}
    assert report.syft == "1.20.0"
    assert report.grype == "0.87.0"
    assert report.python_note == sc.PYTHON_NOTE
    payload = sc.report_payload(report)
    assert payload["findings"][1]["package"] == "lodash"
    assert payload["sbom"]["by_type"]["python"] == 2


def test_venv_silences_the_python_note(tmp_path: Path) -> None:
    (tmp_path / "requirements.txt").write_text("fastapi>=0.115.0\n", encoding="utf-8")
    (tmp_path / ".venv").mkdir()
    assert sc.python_note(tmp_path) is None


def test_pinned_requirements_need_no_note(tmp_path: Path) -> None:
    (tmp_path / "requirements.txt").write_text("fastapi==0.115.0\nuvicorn[standard]==0.32.0\n", encoding="utf-8")
    assert sc.python_note(tmp_path) is None
    assert sc.requirement_pin_state("-r other.txt") is None
    assert sc.requirement_pin_state("foo") is False
    assert sc.requirement_pin_state("bar>=1,<2") is False


def test_markdown_lists_each_finding_once() -> None:
    report = sc.build_report(ROOT, SBOM, GRYPE, generated_at="2026-10-07 18:00 UTC")
    text = sc.render(report)
    assert text.startswith(sc.MARKER + "\n")
    assert text.count("lodash@4.17.20") == 1
    assert "correctif `4.17.21`" in text
    assert "| Critique | 1 |" in text
    assert "## Haute" in text


def test_grype_without_matches_is_an_error(tmp_path: Path) -> None:
    report = sc.build_report(tmp_path, {"components": []}, {"descriptor": {}}, generated_at="2026-10-07 18:00 UTC")
    assert report.findings == ()
    assert report.errors == ("Réponse Grype sans liste de correspondances.",)
    assert "Lectures impossibles" in sc.render(report)


def test_scan_command_skips_node_modules_and_keeps_the_venv() -> None:
    argv = sc.syft_argv(Path("sbom.cdx.json"))
    joined = " ".join(argv)
    assert "dir:." in argv
    assert "cyclonedx-json=sbom.cdx.json" in joined
    assert "**/node_modules/**" in argv
    assert "./.git/**" in argv
    assert "./.run/**" in argv
    assert "./.next/**" in argv
    assert ".venv" not in joined
    grype = sc.grype_argv(Path("sbom.cdx.json"))
    assert grype[1] == "sbom:sbom.cdx.json"


def test_missing_tools(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    monkeypatch.setattr(sc.shutil, "which", lambda _name: None)
    code = sc.main(["--json", "--root", str(tmp_path)])
    captured = capsys.readouterr()
    assert code == 2
    assert "syft et grype sont introuvables." in captured.err
    assert json.loads(captured.out)["tools_missing"] == ["syft", "grype"]


def test_timeout(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    monkeypatch.setattr(sc.shutil, "which", lambda name: f"/usr/bin/{name}")

    def boom(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(cmd="syft", timeout=sc.TIMEOUT_S)

    monkeypatch.setattr(sc.subprocess, "run", boom)
    code = sc.main(["--json", "--root", str(tmp_path)])
    assert code == 1
    assert "180" in capsys.readouterr().err


def test_main_reads_fixtures(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    sbom = tmp_path / "sbom.json"
    grype = tmp_path / "grype.json"
    sbom.write_text(json.dumps(SBOM), encoding="utf-8")
    grype.write_text(json.dumps(GRYPE), encoding="utf-8")
    (tmp_path / "requirements.txt").write_text("fastapi>=0.115.0\n", encoding="utf-8")
    code = sc.main(
        ["--json", "--root", str(tmp_path), "--from-sbom", str(sbom), "--from-grype", str(grype)]
    )
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["counts"]["high"] == 1
    assert payload["python_note"]
    assert payload["tools"]["syft"] == "1.20.0"


def test_summary_is_one_line() -> None:
    long = "mot " * 80
    findings = sc.normalize_matches([_match("GHSA-9", "Low", "leftpad", "1.0.0", "npm", summary=long)])
    assert "\n" not in findings[0].summary
    assert len(findings[0].summary) <= sc.SUMMARY_LIMIT
    assert findings[0].summary.endswith("…")


def test_supply_repair_node() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / "test_supply_repair.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_admin_supply_card_is_wired() -> None:
    panel = (ROOT / "src/components/admin-panel.tsx").read_text(encoding="utf-8")
    card = (ROOT / "src/components/admin-supply-card.tsx").read_text(encoding="utf-8")
    route = (ROOT / "src/app/api/admin/supply-chain/route.ts").read_text(encoding="utf-8")
    addresses = (ROOT / "src/lib/addresses.ts").read_text(encoding="utf-8")
    workflow = (ROOT / ".github/workflows/supply-chain.yml").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert panel.rindex("<AdminDependenciesCard") < panel.rindex("<AdminSupplyCard")
    assert "Failles" in card
    assert "aria-pressed" in card
    assert "Exporter" in card
    assert 'aria-haspopup="menu"' in card
    assert "Exporter en Markdown" in card
    assert "Exporter en PDF" in card
    assert "repairMarkdown" in card
    assert "repairHtml" in card
    pdf = (ROOT / "src/lib/capture/pdf.ts").read_text(encoding="utf-8")
    assert "noopener,noreferrer" not in pdf
    assert "popup.opener = null" in pdf
    assert "Afficher la suite" in card
    assert "anchore/syft/main/install.sh" in card
    assert "anchore/grype/main/install.sh" in card
    assert card.count("load(true)") == 1
    assert "load(false)" in card
    assert "isAuthenticated" in route
    assert "isNetlify" in route
    assert "no-store" in route
    assert '["scripts/supply_chain.py", "--json"]' in route
    assert "/api/admin/supply-chain" in addresses
    assert "fail-build: false" in workflow
    assert "anchore/sbom-action@v0.24.3" in workflow
    assert "anchore/scan-action@v7.4.2" in workflow
    assert "requirements.txt" in workflow
    assert "Failles connues" in readme
