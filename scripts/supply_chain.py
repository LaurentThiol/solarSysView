#!/usr/bin/env python3
"""Inventaire Syft et failles Grype, pour la carte admin et l'issue du lundi.

Le JSON et le markdown décrivent la même lecture. Les tests passent par
--from-sbom et --from-grype : aucun binaire ni réseau n'est requis.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

MARKER = "<!-- supply-chain -->"
TIMEOUT_S = 180
PYTHON_NOTE = (
    "Sans .venv, les requirements*.txt en plages ne donnent pas de version figée : "
    "les paquets Python ne sont pas couverts par cet inventaire."
)
SEVERITIES = ("critical", "high", "medium", "low", "negligible", "unknown")
SEVERITY_FR = {
    "critical": "Critique",
    "high": "Haute",
    "medium": "Moyenne",
    "low": "Basse",
    "negligible": "Négligeable",
    "unknown": "Inconnue",
}
EXCLUDES = (
    "./.git/**",
    "./.run/**",
    "./.next/**",
    "**/node_modules/**",
)
SUMMARY_LIMIT = 180


class SupplyError(Exception):
    pass


class ToolsMissing(SupplyError):
    def __init__(self, names: list[str]) -> None:
        super().__init__(missing_message(names))
        self.names = names


@dataclass(frozen=True)
class Finding:
    id: str
    severity: str
    package: str
    version: str
    ecosystem: str
    fix_state: str
    fix_version: str | None
    url: str | None
    summary: str


@dataclass(frozen=True)
class Report:
    generated_at: str
    syft: str | None
    grype: str | None
    db_built: str | None
    components: int
    by_type: dict[str, int]
    counts: dict[str, int]
    findings: tuple[Finding, ...]
    python_note: str | None
    errors: tuple[str, ...]


def missing_message(names: list[str]) -> str:
    if len(names) == 1:
        return f"{names[0]} est introuvable."
    return f"{' et '.join(names)} sont introuvables."


def syft_argv(sbom_out: Path) -> list[str]:
    argv = ["syft", "dir:.", "-q", "-o", f"cyclonedx-json={sbom_out}"]
    for pattern in EXCLUDES:
        argv.extend(["--exclude", pattern])
    return argv


def grype_argv(sbom_out: Path) -> list[str]:
    return ["grype", f"sbom:{sbom_out}", "-q", "-o", "json"]


def ecosystem_name(kind: str, purl: str) -> str:
    token = kind.lower()
    if token in {"npm", "javascript"} or purl.startswith("pkg:npm/"):
        return "npm"
    if token in {"python", "pypi"} or purl.startswith("pkg:pypi/"):
        return "python"
    return "autre"


def requirement_pin_state(line: str) -> bool | None:
    """True si la ligne épingle une version, False si elle est ouverte, None sinon."""
    stripped = line.split("#", 1)[0].strip()
    if not stripped or stripped.startswith(("-", "--")):
        return None
    if "://" in stripped or stripped.startswith("."):
        return False
    name = _requirement_name(stripped)
    if name is None:
        return None
    rest = stripped[len(name) :].strip()
    if not rest:
        return False
    specs = [part.strip() for part in rest.split(",") if part.strip()]
    if len(specs) == 1 and specs[0].startswith("==") and len(specs[0]) > 2 and not specs[0].startswith("==="):
        return True
    return False


def _requirement_name(stripped: str) -> str | None:
    index = 0
    while index < len(stripped) and (stripped[index].isalnum() or stripped[index] in "._-"):
        index += 1
    if index == 0:
        return None
    if index < len(stripped) and stripped[index] == "[":
        end = stripped.find("]", index)
        if end < 0:
            return None
        index = end + 1
    return stripped[:index]


def requirements_are_ranged(root: Path) -> bool:
    for path in sorted(root.glob("requirements*.txt")):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line in text.splitlines():
            state = requirement_pin_state(line)
            if state is False:
                return True
    return False


def python_note(root: Path) -> str | None:
    if (root / ".venv").is_dir():
        return None
    if requirements_are_ranged(root):
        return PYTHON_NOTE
    return None


def _one_line(text: str) -> str:
    line = " ".join(text.split())
    if len(line) <= SUMMARY_LIMIT:
        return line
    return line[: SUMMARY_LIMIT - 1].rstrip() + "…"


def _advisory_url(vuln: dict, advisory_id: str) -> str | None:
    urls = [item for item in vuln.get("urls") or [] if isinstance(item, str) and item.startswith("http")]
    source = vuln.get("dataSource") if isinstance(vuln.get("dataSource"), str) else ""
    if source.startswith("http") and advisory_id and advisory_id in source:
        return source
    if urls:
        return urls[0]
    if source.startswith("http"):
        return source
    return None


def _finding_from_match(match: dict) -> Finding | None:
    if not isinstance(match, dict):
        return None
    vuln = match.get("vulnerability")
    artifact = match.get("artifact")
    if not isinstance(vuln, dict) or not isinstance(artifact, dict):
        return None
    advisory_id = vuln.get("id") if isinstance(vuln.get("id"), str) else ""
    package = artifact.get("name") if isinstance(artifact.get("name"), str) else ""
    if not advisory_id or not package:
        return None
    severity = str(vuln.get("severity") or "unknown").lower()
    if severity not in SEVERITIES:
        severity = "unknown"
    version = artifact.get("version") if isinstance(artifact.get("version"), str) else ""
    kind = artifact.get("type") if isinstance(artifact.get("type"), str) else ""
    purl = artifact.get("purl") if isinstance(artifact.get("purl"), str) else ""
    fix = vuln.get("fix") if isinstance(vuln.get("fix"), dict) else {}
    state = fix.get("state") if isinstance(fix.get("state"), str) and fix.get("state") else "unknown"
    versions = [item for item in fix.get("versions") or [] if isinstance(item, str) and item]
    description = vuln.get("description") if isinstance(vuln.get("description"), str) else ""
    return Finding(
        id=advisory_id,
        severity=severity,
        package=package,
        version=version,
        ecosystem=ecosystem_name(kind, purl),
        fix_state=state,
        fix_version=versions[0] if versions else None,
        url=_advisory_url(vuln, advisory_id),
        summary=_one_line(description),
    )


def _prefer(current: Finding, incoming: Finding) -> Finding:
    if current.fix_version:
        return current
    if incoming.fix_version:
        return incoming
    if len(incoming.summary) > len(current.summary):
        return incoming
    return current


def normalize_matches(matches: list) -> list[Finding]:
    found: dict[tuple[str, str, str, str], Finding] = {}
    for match in matches:
        finding = _finding_from_match(match)
        if finding is None:
            continue
        key = (finding.id, finding.package, finding.version, finding.ecosystem)
        previous = found.get(key)
        found[key] = finding if previous is None else _prefer(previous, finding)
    return sorted(
        found.values(),
        key=lambda item: (SEVERITIES.index(item.severity), item.package.lower(), item.version, item.id),
    )


def _component_ecosystem(component: dict) -> str:
    purl = component.get("purl") if isinstance(component.get("purl"), str) else ""
    if purl:
        return ecosystem_name("", purl)
    for prop in component.get("properties") or []:
        if not isinstance(prop, dict):
            continue
        if prop.get("name") == "syft:package:type" and isinstance(prop.get("value"), str):
            return ecosystem_name(prop["value"], "")
    return "autre"


def sbom_summary(document: dict) -> tuple[int, dict[str, int]]:
    by_type = {"npm": 0, "python": 0, "autre": 0}
    components = document.get("components")
    if not isinstance(components, list):
        return 0, by_type
    for component in components:
        if not isinstance(component, dict):
            continue
        by_type[_component_ecosystem(component)] += 1
    return sum(by_type.values()), by_type


def _tool_version(document: dict, name: str) -> str | None:
    metadata = document.get("metadata")
    if not isinstance(metadata, dict):
        return None
    tools = metadata.get("tools")
    components: list = []
    if isinstance(tools, dict):
        raw = tools.get("components")
        if isinstance(raw, list):
            components = raw
    elif isinstance(tools, list):
        components = tools
    for component in components:
        if not isinstance(component, dict):
            continue
        if str(component.get("name") or "").lower() == name and isinstance(component.get("version"), str):
            return component["version"]
    return None


def _grype_meta(document: dict) -> tuple[str | None, str | None]:
    descriptor = document.get("descriptor")
    if not isinstance(descriptor, dict):
        return None, None
    version = descriptor.get("version") if isinstance(descriptor.get("version"), str) else None
    database = descriptor.get("db")
    built = None
    if isinstance(database, dict) and isinstance(database.get("built"), str):
        built = database["built"]
    return version, built


def build_report(root: Path, sbom: dict, grype: dict, generated_at: str | None = None) -> Report:
    errors: list[str] = []
    matches = grype.get("matches")
    if not isinstance(matches, list):
        matches = []
        errors.append("Réponse Grype sans liste de correspondances.")
    findings = normalize_matches(matches)
    counts = {name: 0 for name in SEVERITIES}
    for finding in findings:
        counts[finding.severity] += 1
    components, by_type = sbom_summary(sbom)
    grype_version, db_built = _grype_meta(grype)
    moment = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return Report(
        generated_at=moment,
        syft=_tool_version(sbom, "syft"),
        grype=grype_version,
        db_built=db_built,
        components=components,
        by_type=by_type,
        counts=counts,
        findings=tuple(findings),
        python_note=python_note(root),
        errors=tuple(errors),
    )


def _finding_row(item: Finding) -> dict:
    return {
        "id": item.id,
        "severity": item.severity,
        "package": item.package,
        "version": item.version,
        "ecosystem": item.ecosystem,
        "fix_state": item.fix_state,
        "fix_version": item.fix_version,
        "url": item.url,
        "summary": item.summary,
    }


def report_payload(report: Report) -> dict:
    return {
        "generated_at": report.generated_at,
        "tools": {
            "syft": report.syft,
            "grype": report.grype,
            "db_built": report.db_built,
        },
        "counts": report.counts,
        "sbom": {
            "components": report.components,
            "by_type": report.by_type,
        },
        "findings": [_finding_row(item) for item in report.findings],
        "python_note": report.python_note,
        "errors": list(report.errors),
    }


def _cell(value: str | None) -> str:
    if not value:
        return "—"
    return value.replace("|", "\\|").replace("\n", " ")


def render(report: Report) -> str:
    npm = report.by_type.get("npm", 0)
    python = report.by_type.get("python", 0)
    other = report.by_type.get("autre", 0)
    lines = [
        MARKER,
        f"Relevé du {report.generated_at}.",
        "",
        (
            f"Syft {_cell(report.syft)} · Grype {_cell(report.grype)} · base {_cell(report.db_built)}. "
            f"{report.components} composants ({npm} npm, {python} Python, {other} autre)."
        ),
        "",
    ]
    if report.python_note:
        lines.extend([report.python_note, ""])
    lines.extend(["| Sévérité | Nombre |", "| --- | --- |"])
    for name in SEVERITIES:
        lines.append(f"| {SEVERITY_FR[name]} | {report.counts.get(name, 0)} |")
    lines.append("")
    if not report.findings:
        lines.append("Aucune faille connue sur cet inventaire.")
        lines.append("")
    else:
        for name in SEVERITIES:
            group = [item for item in report.findings if item.severity == name]
            if not group:
                continue
            lines.extend([f"## {SEVERITY_FR[name]}", ""])
            for item in group:
                fix = f", correctif `{item.fix_version}`" if item.fix_version else ""
                link = f"[{item.id}]({item.url})" if item.url else item.id
                version = item.version or "—"
                lines.append(f"- `{item.package}@{version}` ({item.ecosystem}) — {link}{fix}")
            lines.append("")
    if report.errors:
        lines.extend(["## Lectures impossibles", ""])
        for item in report.errors:
            lines.append(f"- {_cell(item)}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def load_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SupplyError(f"Fichier illisible : {path.name}") from exc
    if not isinstance(data, dict):
        raise SupplyError(f"JSON inattendu : {path.name}")
    return data


def parse_json_text(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise SupplyError("Le scan n’a pas renvoyé de JSON.")
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise SupplyError("JSON de scan illisible.") from exc
    if not isinstance(data, dict):
        raise SupplyError("JSON de scan illisible.")
    return data


def _run(argv: list[str], cwd: Path, deadline: float) -> str:
    left = deadline - time.monotonic()
    if left <= 0:
        raise SupplyError("Le scan a dépassé 180 s.")
    try:
        completed = subprocess.run(
            argv,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=left,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise SupplyError("Le scan a dépassé 180 s.") from exc
    except FileNotFoundError as exc:
        raise ToolsMissing([argv[0]]) from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip().replace("\n", " ")
        raise SupplyError(f"{argv[0]} a échoué : {detail[:400] or completed.returncode}")
    return completed.stdout


def run_scan(root: Path) -> tuple[dict, dict]:
    missing = [name for name in ("syft", "grype") if shutil.which(name) is None]
    if missing:
        raise ToolsMissing(missing)
    deadline = time.monotonic() + TIMEOUT_S
    with tempfile.TemporaryDirectory(prefix="synchro-supply-") as tmp:
        sbom_path = Path(tmp) / "sbom.cdx.json"
        _run(syft_argv(sbom_path), root, deadline)
        if not sbom_path.is_file():
            raise SupplyError("Syft n’a pas écrit d’inventaire.")
        sbom = load_json(sbom_path)
        grype = parse_json_text(_run(grype_argv(sbom_path), root, deadline))
        return sbom, grype


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inventaire Syft et failles Grype.")
    parser.add_argument("--json", action="store_true", help="Écrit le relevé JSON sur la sortie standard.")
    parser.add_argument("--markdown", action="store_true", help="Écrit le relevé markdown (défaut).")
    parser.add_argument("--from-sbom", type=Path, help="CycloneDX déjà produit, sans lancer Syft.")
    parser.add_argument("--from-grype", type=Path, help="JSON Grype déjà produit, sans lancer Grype.")
    parser.add_argument("--root", type=Path, help="Racine du dépôt. Défaut : parent de ce script.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    root = (args.root or Path(__file__).resolve().parents[1]).resolve()
    try:
        if args.from_sbom or args.from_grype:
            if not args.from_sbom or not args.from_grype:
                print("Préciser --from-sbom et --from-grype ensemble.", file=sys.stderr)
                return 1
            sbom = load_json(args.from_sbom)
            grype = load_json(args.from_grype)
        else:
            sbom, grype = run_scan(root)
        report = build_report(root, sbom, grype)
    except ToolsMissing as exc:
        print(str(exc), file=sys.stderr)
        if args.json:
            sys.stdout.write(json.dumps({"tools_missing": exc.names}, ensure_ascii=False) + "\n")
        return 2
    except SupplyError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if args.json:
        sys.stdout.write(json.dumps(report_payload(report), ensure_ascii=False) + "\n")
    else:
        sys.stdout.write(render(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
