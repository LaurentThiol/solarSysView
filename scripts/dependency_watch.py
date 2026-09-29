#!/usr/bin/env python3
"""Suivi des bibliothèques : ce qui peut être mis à jour, et la porte ESLint 10.

Le rapport est volontairement court. Une bibliothèque n'apparaît que si la
dernière version publiée sort de la contrainte du dépôt, si le verrou npm est
en retard dans la plage, ou si une action GitHub a une majeure plus récente.
Les plugins qui bloquent ESLint 10 sont toujours listés.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

MARKER = "<!-- dependency-watch -->"
ESLINT_PLUGINS = (
    "eslint-plugin-react",
    "eslint-plugin-jsx-a11y",
    "eslint-plugin-import",
)
_USER_AGENT = "synchro-dependency-watch"
_EXACT_NPM = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
_USES = re.compile(r"""uses:\s*['\"]?([^'\"\s@]+)@([^'\"\s#]+)""")
_PEP_OP = re.compile(r"^(==|!=|<=|>=|<|>|~=)\s*(.+)$")
_PEP_VERSION = re.compile(
    r"""
    ^(?:(?P<epoch>\d+)!)?
    (?P<release>\d+(?:\.\d+)*)
    (?:(?P<pre_l>a|b|rc|alpha|beta|c|preview)(?P<pre_n>\d*))?
    (?:(?:\.post|post)(?P<post>\d+))?
    (?:\.dev(?P<dev>\d+))?
    (?:\+[0-9A-Za-z.-]+)?$
    """,
    re.IGNORECASE | re.VERBOSE,
)
_PRE_STAGE = {"a": 1, "alpha": 1, "b": 2, "beta": 2, "c": 3, "rc": 3, "preview": 3}


@dataclass(frozen=True)
class SemVer:
    major: int
    minor: int
    patch: int
    pre: tuple[str, ...] = ()

    def key(self) -> tuple:
        if self.pre:
            idents: list[tuple[int, int | str]] = []
            for part in self.pre:
                if part.isdigit():
                    idents.append((0, int(part)))
                else:
                    idents.append((1, part))
            pre_key: tuple = (0, tuple(idents))
        else:
            pre_key = (1,)
        return (self.major, self.minor, self.patch, pre_key)


@dataclass(frozen=True)
class NpmDep:
    name: str
    spec: str
    dev: bool


@dataclass(frozen=True)
class PyReq:
    manifest: str
    name: str
    spec: str


@dataclass(frozen=True)
class NpmMeta:
    latest: str
    deprecated: str | None = None
    peer_eslint: str | None = None


@dataclass(frozen=True)
class Update:
    source: str
    name: str
    requested: str
    current: str
    latest: str
    status: str


@dataclass(frozen=True)
class GatePlugin:
    name: str
    version: str | None
    peer: str | None
    allows_10: bool | None
    error: str | None = None


@dataclass(frozen=True)
class ActionUpdate:
    action: str
    pinned: str
    latest: str
    workflows: tuple[str, ...]


@dataclass(frozen=True)
class Report:
    generated_at: str
    updates: tuple[Update, ...]
    gate: tuple[GatePlugin, ...]
    actions: tuple[ActionUpdate, ...]
    errors: tuple[str, ...]
    eslint_locked: str | None
    watched: int


def parse_partial(raw: str) -> tuple[int | None, int | None, int | None, tuple[str, ...]]:
    text = raw.strip()
    if text.startswith(("v", "V")) and len(text) > 1 and text[1].isdigit():
        text = text[1:]
    text = text.split("+", 1)[0]
    if text in {"*", "x", "X"}:
        return None, None, None, ()
    main, _, pre = text.partition("-")
    nums: list[int | None] = []
    for part in main.split("."):
        if part in {"*", "x", "X"}:
            nums.append(None)
        elif part.isdigit():
            nums.append(int(part))
        else:
            raise ValueError(raw)
    if len(nums) > 3:
        raise ValueError(raw)
    while len(nums) < 3:
        nums.append(None)
    return nums[0], nums[1], nums[2], tuple(pre.split(".")) if pre else ()


def _concrete(parts: tuple[int | None, int | None, int | None, tuple[str, ...]]) -> SemVer:
    major, minor, patch, pre = parts
    return SemVer(major or 0, minor or 0, patch or 0, pre)


def _caret(raw: str) -> list[tuple[str, SemVer]]:
    major, minor, patch, pre = parse_partial(raw)
    if major is None:
        return []
    lower = SemVer(major, minor or 0, patch or 0, pre)
    if major > 0:
        upper = SemVer(major + 1, 0, 0)
    elif minor is None:
        upper = SemVer(1, 0, 0)
    elif minor > 0:
        upper = SemVer(0, minor + 1, 0)
    elif patch is None:
        upper = SemVer(0, 1, 0)
    else:
        upper = SemVer(0, 0, patch + 1)
    return [(">=", lower), ("<", upper)]


def _tilde(raw: str) -> list[tuple[str, SemVer]]:
    major, minor, patch, pre = parse_partial(raw)
    if major is None:
        return []
    lower = SemVer(major, minor or 0, patch or 0, pre)
    if minor is None:
        upper = SemVer(major + 1, 0, 0)
    else:
        upper = SemVer(major, (minor or 0) + 1, 0)
    return [(">=", lower), ("<", upper)]


def _xrange(raw: str) -> list[tuple[str, SemVer]]:
    major, minor, patch, pre = parse_partial(raw)
    if major is None:
        return []
    if minor is None:
        return [(">=", SemVer(major, 0, 0)), ("<", SemVer(major + 1, 0, 0))]
    if patch is None:
        return [(">=", SemVer(major, minor, 0)), ("<", SemVer(major, minor + 1, 0))]
    return [("=", SemVer(major, minor, patch, pre))]


def _expand_token(token: str) -> list[tuple[str, SemVer]]:
    if token in {"*", "x", "X"}:
        return []
    for op in (">=", "<=", ">", "<", "==", "="):
        if token.startswith(op):
            return [(op if op != "==" else "=", _concrete(parse_partial(token[len(op) :].strip())))]
    if token.startswith("^"):
        return _caret(token[1:])
    if token.startswith("~"):
        return _tilde(token[1:])
    return _xrange(token)


def _clause_comparators(clause: str) -> list[tuple[str, SemVer]]:
    hyphen = re.fullmatch(r"(\S+)\s+-\s+(\S+)", clause)
    if hyphen:
        return [
            (">=", _concrete(parse_partial(hyphen.group(1)))),
            ("<=", _concrete(parse_partial(hyphen.group(2)))),
        ]
    comparators: list[tuple[str, SemVer]] = []
    for token in clause.split():
        comparators.extend(_expand_token(token))
    return comparators


def _matches(version: SemVer, op: str, bound: SemVer) -> bool:
    order = (version.key() > bound.key()) - (version.key() < bound.key())
    if op == ">=":
        return order >= 0
    if op == ">":
        return order > 0
    if op == "<=":
        return order <= 0
    if op == "<":
        return order < 0
    if op == "=":
        return order == 0
    raise ValueError(op)


def npm_satisfies(version: str, range_str: str) -> bool | None:
    """True si `version` est dans la plage npm. None si la plage est illisible."""
    try:
        parsed = _concrete(parse_partial(version))
        clauses = [part.strip() for part in range_str.split("||")]
        if not any(clauses):
            return True
        for clause in clauses:
            if not clause:
                continue
            if all(_matches(parsed, op, bound) for op, bound in _clause_comparators(clause)):
                return True
        return False
    except ValueError:
        return None


def range_allows_major(range_str: str, major: int) -> bool | None:
    """True si une version stable de cette majeure entre dans la plage."""
    probes = [f"{major}.0.0", f"{major}.0.1", f"{major}.1.0", f"{major}.99.99"]
    for mentioned in re.findall(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", range_str):
        if mentioned.split(".", 1)[0] == str(major):
            probes.append(mentioned)
    seen: list[bool] = []
    for probe in probes:
        allowed = npm_satisfies(probe, range_str)
        if allowed is None:
            return None
        seen.append(allowed)
    return any(seen)


def _pep_key(version: str) -> tuple:
    text = version.strip().split("+", 1)[0]
    if "!" in text:
        text = text.split("!", 1)[1]
    match = _PEP_VERSION.match(text)
    if not match:
        raise ValueError(version)
    release = tuple(int(part) for part in match.group("release").split("."))
    while len(release) > 1 and release[-1] == 0:
        release = release[:-1]
    pre_l = match.group("pre_l")
    if pre_l:
        pre = (_PRE_STAGE[pre_l.lower()], int(match.group("pre_n") or "0"))
    else:
        pre = (99, 0)
    post = int(match.group("post")) if match.group("post") else -1
    dev_raw = match.group("dev")
    if dev_raw is not None and pre_l is None and match.group("post") is None:
        pre = (-1, 0)
        dev = int(dev_raw)
    else:
        dev = int(dev_raw) if dev_raw is not None else 99
    return (release, pre, post, dev)


def pep_satisfies(version: str, spec: str) -> bool | None:
    text = spec.strip()
    if not text:
        return True
    try:
        for clause in (part.strip() for part in text.split(",")):
            if not clause:
                continue
            if not _pep_clause(version, clause):
                return False
        return True
    except ValueError:
        return None


def _pep_clause(version: str, clause: str) -> bool:
    match = _PEP_OP.match(clause)
    if not match:
        raise ValueError(clause)
    op, rhs = match.group(1), match.group(2).strip()
    if op == "~=":
        parts = rhs.split(".")
        if len(parts) < 2 or not all(part.isdigit() for part in parts):
            raise ValueError(clause)
        nums = [int(part) for part in parts]
        upper = nums[:-1]
        upper[-1] += 1
        upper_text = ".".join(str(part) for part in upper)
        return _pep_clause(version, f">={rhs}") and _pep_clause(version, f"<{upper_text}")
    if rhs.endswith(".*"):
        prefix = tuple(int(part) for part in rhs[:-2].split(".") if part.isdigit())
        got = _pep_key(version)[0]
        if op == "==":
            return got[: len(prefix)] == prefix
        if op == "!=":
            return got[: len(prefix)] != prefix
        raise ValueError(clause)
    left, right = _pep_key(version), _pep_key(rhs)
    order = (left > right) - (left < right)
    if op == "==":
        return order == 0
    if op == "!=":
        return order != 0
    if op == ">=":
        return order >= 0
    if op == ">":
        return order > 0
    if op == "<=":
        return order <= 0
    if op == "<":
        return order < 0
    raise ValueError(clause)


def load_npm_deps(root: Path) -> list[NpmDep]:
    document = json.loads((root / "package.json").read_text(encoding="utf-8"))
    found: list[NpmDep] = []
    for dev, key in ((False, "dependencies"), (True, "devDependencies")):
        for name, spec in (document.get(key) or {}).items():
            if isinstance(spec, str):
                found.append(NpmDep(name, spec, dev))
    return found


def locked_npm_version(lock: dict, name: str) -> str | None:
    packages = lock.get("packages") or {}
    entry = packages.get(f"node_modules/{name}") or {}
    version = entry.get("version")
    return version if isinstance(version, str) else None


def load_requirements(root: Path) -> list[PyReq]:
    found: list[PyReq] = []
    for path in sorted(root.glob("requirements*.txt")):
        for line in path.read_text(encoding="utf-8").splitlines():
            raw = line.split("#", 1)[0].strip()
            if not raw or raw.startswith(("-", "--")):
                continue
            raw = raw.split(";", 1)[0].strip()
            match = re.match(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]+\])?\s*(.*)$", raw)
            if not match:
                continue
            found.append(PyReq(path.name, match.group(1), match.group(2).strip()))
    return found


def load_actions(root: Path) -> dict[tuple[str, str], list[str]]:
    """(action, ref) -> fichiers de workflow."""
    found: dict[tuple[str, str], list[str]] = {}
    workflow_dir = root / ".github" / "workflows"
    if not workflow_dir.is_dir():
        return found
    for path in sorted(workflow_dir.glob("*.yml")) + sorted(workflow_dir.glob("*.yaml")):
        for match in _USES.finditer(path.read_text(encoding="utf-8")):
            action, ref = match.group(1), match.group(2)
            if action.startswith(".") or "://" in action or "/" not in action:
                continue
            found.setdefault((action, ref), []).append(path.name)
    return found


def _status_for_npm(dep: NpmDep, meta: NpmMeta, locked: str | None) -> Update | None:
    allowed = npm_satisfies(meta.latest, dep.spec)
    if allowed is None:
        return Update("package.json", dep.name, dep.spec, locked or "—", meta.latest, "contrainte illisible")
    exact = _EXACT_NPM.fullmatch(dep.spec) is not None
    if not allowed:
        status = "épinglée" if exact else "hors plage"
        if meta.deprecated:
            status += ", dépréciée"
        return Update("package.json", dep.name, dep.spec, locked or "—", meta.latest, status)
    if meta.deprecated:
        return Update("package.json", dep.name, dep.spec, locked or "—", meta.latest, "dépréciée")
    if locked and _version_behind(locked, meta.latest):
        return Update("package.json", dep.name, dep.spec, locked, meta.latest, "verrou en retard")
    return None


def _version_behind(locked: str, latest: str) -> bool:
    try:
        return _concrete(parse_partial(locked)).key() < _concrete(parse_partial(latest)).key()
    except ValueError:
        return locked != latest


def _status_for_pip(req: PyReq, latest: str) -> Update | None:
    allowed = pep_satisfies(latest, req.spec)
    if allowed is None:
        return Update(req.manifest, req.name, req.spec or "—", "—", latest, "contrainte illisible")
    if not allowed:
        return Update(req.manifest, req.name, req.spec or "—", "—", latest, "hors contrainte")
    return None


def _major_tag(ref: str) -> int | None:
    match = re.fullmatch(r"v(\d+)(?:\.\d+)*", ref)
    return int(match.group(1)) if match else None


def build_report(
    root: Path,
    *,
    fetch_npm,
    fetch_pypi,
    fetch_release,
    now: datetime | None = None,
) -> Report:
    moment = now or datetime.now(timezone.utc)
    updates: list[Update] = []
    errors: list[str] = []
    watched = 0

    lock_path = root / "package-lock.json"
    lock = json.loads(lock_path.read_text(encoding="utf-8")) if lock_path.is_file() else {}
    eslint_locked = locked_npm_version(lock, "eslint")

    for dep in load_npm_deps(root):
        watched += 1
        try:
            meta = fetch_npm(dep.name)
        except Exception as exc:  # noqa: BLE001 — un registre en panne ne doit pas vider le rapport
            errors.append(f"npm {dep.name} : {exc}")
            continue
        row = _status_for_npm(dep, meta, locked_npm_version(lock, dep.name))
        if row:
            updates.append(row)

    gate: list[GatePlugin] = []
    for name in ESLINT_PLUGINS:
        watched += 1
        try:
            meta = fetch_npm(name)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"npm {name} : {exc}")
            gate.append(GatePlugin(name, None, None, None, str(exc)))
            continue
        allows = range_allows_major(meta.peer_eslint, 10) if meta.peer_eslint else None
        gate.append(GatePlugin(name, meta.latest, meta.peer_eslint, allows))

    for req in load_requirements(root):
        watched += 1
        try:
            latest = fetch_pypi(req.name)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"pip {req.name} ({req.manifest}) : {exc}")
            continue
        row = _status_for_pip(req, latest)
        if row:
            updates.append(row)

    actions: list[ActionUpdate] = []
    seen_actions: set[str] = set()
    for (action, ref), workflows in load_actions(root).items():
        if action not in seen_actions:
            seen_actions.add(action)
            watched += 1
        pinned_major = _major_tag(ref)
        if pinned_major is None:
            continue
        try:
            latest = fetch_release(action)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"action {action} : {exc}")
            continue
        latest_major = _major_tag(latest)
        if latest_major is not None and latest_major > pinned_major:
            actions.append(ActionUpdate(action, ref, latest, tuple(workflows)))

    if any(item.name == "eslint" and item.status.startswith("hors plage") for item in updates):
        if not _gate_open(gate):
            updates = [
                Update(item.source, item.name, item.requested, item.current, item.latest, "hors plage, plugins pas prêts")
                if item.name == "eslint" and item.status.startswith("hors plage")
                else item
                for item in updates
            ]

    return Report(
        generated_at=moment.strftime("%Y-%m-%d %H:%M UTC"),
        updates=tuple(updates),
        gate=tuple(gate),
        actions=tuple(actions),
        errors=tuple(errors),
        eslint_locked=eslint_locked,
        watched=watched,
    )


def _gate_open(gate: list[GatePlugin] | tuple[GatePlugin, ...]) -> bool:
    return bool(gate) and all(item.allows_10 for item in gate)


def _cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def _yes_no(value: bool | None) -> str:
    if value is True:
        return "oui"
    if value is False:
        return "non"
    return "illisible"


def _table(items: list[Update]) -> list[str]:
    lines = [
        "| Source | Bibliothèque | Contrainte | Actuelle | Dernière | |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for item in items:
        lines.append(
            "| {source} | `{name}` | `{requested}` | {current} | {latest} | {status} |".format(
                source=_cell(item.source),
                name=_cell(item.name),
                requested=_cell(item.requested),
                current=_cell(item.current),
                latest=_cell(item.latest),
                status=_cell(item.status),
            )
        )
    return lines


def render(report: Report) -> str:
    ready = _gate_open(report.gate)
    lines = [
        MARKER,
        f"Suivi du {report.generated_at}. {report.watched} bibliothèques lues sur npm, PyPI et GitHub Actions.",
        "",
        "Dependabot ouvre des pull requests le lundi à 08:00 (Paris) : mineures et correctifs groupés, majeures séparées. Cette issue ne garde que ce qui demande un choix, plus le verrou npm encore en retard dans sa plage. Une contrainte pip `>=` sans plafond suit déjà la dernière version à l'installation : elle n'est listée que si un plafond la bloque.",
        "",
        "## ESLint 10",
        "",
    ]
    if report.eslint_locked:
        lines.append(f"Verrou actuel : `{report.eslint_locked}`.")
    else:
        lines.append("Pas de version d'ESLint dans `package-lock.json`.")
    lines.append("")
    if report.eslint_locked and report.eslint_locked.startswith("9."):
        lines.append(
            "La ligne 9 est en fin de vie ([eslint.org/version-support](https://eslint.org/version-support)). Le lint actuel reste valable."
        )
        lines.append("")
    if ready:
        lines.append("Les trois plugins acceptent ESLint 10. On peut :")
        lines.append("")
        lines.append("1. retirer `ignore` sur `eslint` dans `.github/dependabot.yml` ;")
        lines.append("2. passer `eslint` de `^9` à `^10` dans `package.json` ;")
        lines.append("3. lancer `npm run lint`.")
    else:
        lines.append(
            "Pas encore. ESLint 10 a retiré des API que ces plugins, tirés par `eslint-config-next`, appellent encore. Dependabot ignore la majeure d'`eslint` tant que la colonne ci-dessous n'est pas « oui » partout."
        )
    lines.extend(["", "| Plugin | Dernière | peer `eslint` | ESLint 10 |", "| --- | --- | --- | --- |"])
    for item in report.gate:
        peer = f"`{_cell(item.peer)}`" if item.peer else "—"
        version = item.version or "—"
        if item.error:
            version = "—"
        lines.append(f"| `{item.name}` | {version} | {peer} | {_yes_no(item.allows_10)} |")

    decisions = [
        item for item in report.updates if item.status != "verrou en retard"
    ] + [
        Update(
            ", ".join(item.workflows),
            item.action,
            item.pinned,
            item.pinned,
            item.latest,
            "majeure d'action",
        )
        for item in report.actions
    ]
    behind = [item for item in report.updates if item.status == "verrou en retard"]
    lines.extend(["", "## À décider", ""])
    if decisions:
        lines.extend(_table(decisions))
    else:
        lines.append("Rien cette semaine.")
    lines.extend(["", "## Verrou npm en retard", ""])
    if behind:
        lines.append("Ces versions restent dans la contrainte. Dependabot les groupe ; la ligne disparaît quand le verrou a suivi.")
        lines.append("")
        lines.extend(_table(behind))
    else:
        lines.append("Aucun.")

    if report.errors:
        lines.extend(["", "## Lectures impossibles", ""])
        for error in report.errors:
            lines.append(f"- {_cell(error)}")

    lines.extend(
        [
            "",
            "Relance : Actions → Suivi des bibliothèques → Run workflow. Le lundi, le suivi part seul.",
            "",
        ]
    )
    return "\n".join(lines)


def _request_json(url: str, headers: dict[str, str]) -> dict | list:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} sur {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{url} : {exc.reason}") from exc


def http_npm(name: str) -> NpmMeta:
    url = f"https://registry.npmjs.org/{quote(name, safe='')}/latest"
    data = _request_json(url, {"Accept": "application/json", "User-Agent": _USER_AGENT})
    if not isinstance(data, dict) or not isinstance(data.get("version"), str):
        raise RuntimeError(f"manifeste npm illisible pour {name}")
    deprecated = data.get("deprecated")
    peers = data.get("peerDependencies") or {}
    peer = peers.get("eslint") if isinstance(peers, dict) else None
    return NpmMeta(
        latest=data["version"],
        deprecated=deprecated if isinstance(deprecated, str) else None,
        peer_eslint=peer if isinstance(peer, str) else None,
    )


def http_pypi(name: str) -> str:
    url = f"https://pypi.org/pypi/{quote(name)}/json"
    data = _request_json(url, {"Accept": "application/json", "User-Agent": _USER_AGENT})
    if not isinstance(data, dict):
        raise RuntimeError(f"réponse PyPI illisible pour {name}")
    version = (data.get("info") or {}).get("version")
    if not isinstance(version, str):
        raise RuntimeError(f"version PyPI absente pour {name}")
    return version


def http_release(repo: str) -> str:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": _USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = _request_json(f"https://api.github.com/repos/{repo}/releases/latest", headers)
    if not isinstance(data, dict) or not isinstance(data.get("tag_name"), str):
        raise RuntimeError(f"release introuvable pour {repo}")
    return data["tag_name"]


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    if not (root / "package.json").is_file():
        print("package.json introuvable", file=sys.stderr)
        return 1
    report = build_report(root, fetch_npm=http_npm, fetch_pypi=http_pypi, fetch_release=http_release)
    sys.stdout.write(render(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
