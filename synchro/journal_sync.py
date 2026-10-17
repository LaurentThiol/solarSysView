"""Rapproche les fiches des PR déjà mergées, sans réécrire leur texte."""

from __future__ import annotations

import os
import re
import subprocess
from datetime import date, datetime
from typing import Any, Callable

REPO = "LaurentThiol/Synchro"
FILE_LOOKUP_LIMIT = 40
_PAGE_CAP = 10

_ALIASES = (
    ("Annuel", "Évolution"),
    ("Bouncing", "Évolution"),
    ("DeltaEvol", "Évolution"),
)

_LABELS = (
    "nextDataTraining",
    "nextData",
    "probaDynamic",
    "decisionTree",
    "Évolution",
    "Analyse",
    "Morpho",
    "Relief",
    "Chartisme",
    "Cycles",
    "Harmo",
    "Pulse",
    "Combinaisons",
    "Pronostic",
    "Spécialistes",
    "Dictionnaire",
    "Schémas",
    "Tirage",
    "Socle",
    "Jeux",
    "Brain",
    "Admin",
    "Next",
    "Réf",
    "IA",
    "Journal",
)

_AREA_SLUGS = {
    "Socle": "socle",
    "Tirage": "tirage",
    "Évolution": "evolution",
    "Analyse": "analyse",
    "Morpho": "morpho",
    "Relief": "relief",
    "Chartisme": "chartisme",
    "Cycles": "cycles",
    "Harmo": "harmo",
    "Pulse": "pulse",
    "probaDynamic": "probadynamic",
    "Next": "next",
    "Combinaisons": "combinaisons",
    "Pronostic": "pronostic",
    "nextData": "nextdata",
    "nextDataTraining": "nextdatatraining",
    "Jeux": "jeux",
    "Brain": "brain",
    "Spécialistes": "specialistes",
    "decisionTree": "decision-tree",
    "Dictionnaire": "dictionnaire",
    "Réf": "ref",
    "IA": "ia",
    "Admin": "admin",
    "Schémas": "schemas",
    "Journal": "journal",
}

_PATH_AREAS = (
    ("src/app/nextdatatraining/", "nextDataTraining"),
    ("src/app/api/nextdata/", "nextData"),
    ("src/components/nextdata/", "nextData"),
    ("src/lib/nextdata/", "nextData"),
    ("src/app/nextdata/", "nextData"),
    ("synchro/nextdata/", "nextData"),
    ("src/app/brain/decision-tree/", "decisionTree"),
    ("src/app/brain/specialistes/", "Spécialistes"),
    ("src/app/brain/dictionnaire/", "Dictionnaire"),
    ("synchro/decision_tree/", "decisionTree"),
    ("synchro/brain_specialists/", "Spécialistes"),
    ("synchro/lexicon/", "Dictionnaire"),
    ("src/lib/lexicon/", "Dictionnaire"),
    ("src/components/brain/", "Brain"),
    ("src/lib/brain/", "Brain"),
    ("src/app/brain/", "Brain"),
    ("synchro/brain.py", "Brain"),
    ("src/components/proba-dynamic/", "probaDynamic"),
    ("src/app/probadynamic/", "probaDynamic"),
    ("src/lib/proba-dynamic", "probaDynamic"),
    ("src/lib/proba-map", "probaDynamic"),
    ("synchro/fractal/", "probaDynamic"),
    ("src/components/evolution-", "Évolution"),
    ("src/components/bouncing-", "Évolution"),
    ("src/app/evolution/", "Évolution"),
    ("src/lib/annual-", "Évolution"),
    ("src/lib/gains", "Évolution"),
    ("src/lib/delta-", "Évolution"),
    ("src/app/tirage/", "Tirage"),
    ("src/components/draws-", "Tirage"),
    ("src/components/draw-", "Tirage"),
    ("synchro/fdj.py", "Tirage"),
    ("src/components/analysis/", "Analyse"),
    ("src/app/analyse/", "Analyse"),
    ("src/lib/analysis", "Analyse"),
    ("synchro/analysis/", "Analyse"),
    ("src/components/morpho/", "Morpho"),
    ("src/app/morpho/", "Morpho"),
    ("synchro/morpho/", "Morpho"),
    ("src/components/relief/", "Relief"),
    ("src/app/relief/", "Relief"),
    ("src/components/chartisme/", "Chartisme"),
    ("src/components/chart-draw/", "Chartisme"),
    ("src/lib/chartisme/", "Chartisme"),
    ("src/lib/ta/", "Chartisme"),
    ("src/app/chartisme/", "Chartisme"),
    ("synchro/chartisme/", "Chartisme"),
    ("src/components/cycles/", "Cycles"),
    ("src/app/cycles/", "Cycles"),
    ("synchro/cycles/", "Cycles"),
    ("src/components/harmo/", "Harmo"),
    ("src/app/harmo/", "Harmo"),
    ("synchro/harmo/", "Harmo"),
    ("src/components/pulse/", "Pulse"),
    ("src/app/pulse/", "Pulse"),
    ("synchro/pulse/", "Pulse"),
    ("src/components/next/", "Next"),
    ("src/lib/next/", "Next"),
    ("src/app/next/", "Next"),
    ("src/components/combinaisons/", "Combinaisons"),
    ("src/lib/combinations", "Combinaisons"),
    ("src/app/combinaisons/", "Combinaisons"),
    ("src/components/pronostic/", "Pronostic"),
    ("src/lib/pronostic/", "Pronostic"),
    ("synchro/pronostic_net/", "Pronostic"),
    ("src/app/pronostic/", "Pronostic"),
    ("src/components/jeux/", "Jeux"),
    ("src/lib/jeux", "Jeux"),
    ("src/lib/plays", "Jeux"),
    ("synchro/plays.py", "Jeux"),
    ("src/app/jeux/", "Jeux"),
    ("src/components/ref/", "Réf"),
    ("src/app/ref/", "Réf"),
    ("synchro/ref/", "Réf"),
    ("src/components/ia/", "IA"),
    ("src/lib/ia/", "IA"),
    ("src/app/ia/", "IA"),
    ("src/components/admin-", "Admin"),
    ("src/app/admin/", "Admin"),
    ("src/components/schemas/", "Schémas"),
    ("src/app/schemas/", "Schémas"),
    ("docs/schemas/", "Schémas"),
    ("src/components/journal/", "Journal"),
    ("src/app/journal/", "Journal"),
    ("docs/journal/", "Journal"),
    ("synchro/journal.py", "Journal"),
)

_QUIET_PREFIXES = ("tests/", ".github/")
_QUIET_FILES = {"package.json", "package-lock.json", "requirements.txt", "README.md", "AGENTS.md"}
_CREATE_BODY = "PR mergées ajoutées par Update. Le texte se réécrit dans la page."

FilesOf = Callable[[int], list[str] | None]


def plan_journal_update(
    rows: list[dict[str, Any]],
    documents: list[dict[str, Any]],
    pulls: list[dict[str, Any]],
    files_of: FilesOf,
) -> dict[str, Any]:
    """Décide quelles PR ajouter. Ne renvoie ni titre ni texte à modifier."""
    stored = [_row(row) for row in rows]
    by_slug = {row["slug"]: row for row in stored}
    known = _known(stored)
    pending: dict[int, list[dict[str, Any]]] = {}
    creates: dict[str, list[dict[str, Any]]] = {}

    def place(area: str, point: dict[str, Any], slug: str | None = None) -> None:
        if slug and slug in by_slug and not by_slug[slug]["hidden"] and by_slug[slug]["id"] is not None:
            pending.setdefault(by_slug[slug]["id"], []).append(point)
            return
        target = _pick(stored, area)
        if target is not None and target["id"] is not None:
            pending.setdefault(target["id"], []).append(point)
            return
        creates.setdefault(area, []).append(point)

    for document in documents:
        area = str(document.get("area") or "Socle")
        slug = document.get("slug") if isinstance(document.get("slug"), str) else None
        for point in _points(document.get("prs") or []):
            if point["number"] in known or not point["merged_on"]:
                continue
            known.add(point["number"])
            place(area, point, slug)
        lone = document.get("pr_number")
        if lone is not None and int(lone) not in known:
            day = _day(document.get("happened_on"))
            if day:
                point = {
                    "number": int(lone),
                    "title": str(document.get("title") or ""),
                    "merged_on": day,
                    "url": str(document.get("pr_url") or ""),
                }
                known.add(point["number"])
                place(area, point, slug)

    github_kept = 0
    needs_files: list[dict[str, Any]] = []
    for raw in pulls:
        point = pull_point(raw)
        if point is None:
            continue
        github_kept += 1
        if point["number"] in known:
            continue
        titled = area_from_title(point["title"])
        if titled:
            known.add(point["number"])
            place(titled, point)
            continue
        needs_files.append(point)

    deferred = 0
    for point in needs_files:
        paths = files_of(point["number"])
        if paths is None:
            deferred += 1
            continue
        known.add(point["number"])
        place(area_from_paths(paths), point)

    updates = []
    for row in stored:
        extra = pending.get(row["id"])
        if not extra or row["id"] is None:
            continue
        days = [row["happened_on"], *[point["merged_on"] for point in extra if point["merged_on"]]]
        updates.append(
            {
                "id": row["id"],
                "prs": _merge_points(row["prs"], extra),
                "happened_on": max(days),
            }
        )

    used = set(by_slug)
    create_rows = []
    for area, points in creates.items():
        slug = _free_slug(area, used)
        used.add(slug)
        days = [point["merged_on"] for point in points if point["merged_on"]]
        create_rows.append(
            {
                "slug": slug,
                "area": area,
                "title": area,
                "body": _CREATE_BODY,
                "happened_on": max(days) if days else date.today().isoformat(),
                "pr_number": None,
                "pr_url": None,
                "prs": _merge_points([], points),
                "source": "dev",
            }
        )

    added = sum(len(points) for points in pending.values()) + sum(len(points) for points in creates.values())
    return {
        "updates": updates,
        "creates": create_rows,
        "added": added,
        "deferred": deferred,
        "github_kept": github_kept,
    }


def describe_update(*, added: int, github: str, github_kept: int, deferred: int) -> str:
    if github != "ok":
        if added:
            return f"{_count(added, 'ajoutée')}. GitHub n’a pas répondu. Seuls les fichiers du dépôt ont été relus."
        return "GitHub n’a pas répondu. Seuls les fichiers du dépôt ont été relus."
    if deferred:
        remain = "1 PR reste à classer" if deferred == 1 else f"{deferred} PR restent à classer"
        prefix = f"{_count(added, 'ajoutée')}. " if added else ""
        return f"{prefix}{remain}, relance Update."
    if added == 0:
        return f"{_count(github_kept, 'passée')}, la base est à jour."
    return f"{_count(added, 'ajoutée')}. {_count(github_kept, 'passée')} en base."


def area_from_title(title: str) -> str | None:
    text = title.strip()
    for alias, area in _ALIASES:
        if _headed(text, alias):
            return area
    for label in sorted(_LABELS, key=len, reverse=True):
        if _headed(text, label):
            return label
    return None


def area_from_paths(paths: list[str]) -> str:
    counts: dict[str, int] = {}
    seen: dict[str, int] = {}
    for path in paths:
        if _quiet(path):
            continue
        area = _area_of(path)
        if not area:
            continue
        counts[area] = counts.get(area, 0) + 1
        seen.setdefault(area, len(seen))
    if not counts:
        return "Socle"
    pool = {area: count for area, count in counts.items() if area != "Journal"} or counts
    return sorted(pool, key=lambda area: (-pool[area], seen[area]))[0]


def pull_point(raw: dict[str, Any]) -> dict[str, Any] | None:
    merged = raw.get("merged_at")
    if not merged:
        return None
    title = str(raw.get("title") or "")
    user = raw.get("user") or {}
    author = user.get("login") if isinstance(user, dict) else ""
    if _dependabot(author, title):
        return None
    number = raw.get("number")
    if number is None:
        return None
    return {
        "number": int(number),
        "title": title,
        "merged_on": _day(merged),
        "url": str(raw.get("html_url") or ""),
    }


def apply_journal_update() -> dict[str, Any]:
    from synchro import db
    from synchro.journal import load_journal_documents

    imported = db.import_dev_journal()
    github = "ok"
    github_error = None
    try:
        pulls = fetch_merged_pulls()
    except Exception as exc:
        pulls = []
        github = "error"
        github_error = str(exc)
    lookups = {"n": 0}

    def files_of(number: int) -> list[str] | None:
        if lookups["n"] >= FILE_LOOKUP_LIMIT:
            return None
        lookups["n"] += 1
        try:
            return fetch_pull_files(number)
        except Exception:
            return []

    plan = plan_journal_update(db.list_dev_journal_all(), load_journal_documents(), pulls, files_of)
    for update in plan["updates"]:
        stored = db.set_dev_journal_prs(update["id"], update["prs"], update["happened_on"])
        if stored is None:
            raise RuntimeError(f"fiche {update['id']} absente")
    for entry in plan["creates"]:
        db.insert_dev_journal(entry)
    items = [db.serialize_row(row, drop=()) for row in db.list_dev_journal()]
    return {
        "ok": True,
        "added": plan["added"],
        "imported": imported,
        "deferred": plan["deferred"],
        "github": github,
        "github_error": github_error,
        "message": describe_update(
            added=plan["added"],
            github=github,
            github_kept=plan["github_kept"],
            deferred=plan["deferred"],
        ),
        "items": items,
    }


def fetch_merged_pulls(repo: str = REPO) -> list[dict[str, Any]]:
    import httpx

    headers = _github_headers()
    pulls: list[dict[str, Any]] = []
    with httpx.Client(timeout=20.0, headers=headers) as client:
        for page in range(1, _PAGE_CAP + 1):
            response = client.get(
                f"https://api.github.com/repos/{repo}/pulls",
                params={"state": "closed", "per_page": 100, "page": page, "sort": "created", "direction": "asc"},
            )
            response.raise_for_status()
            batch = response.json()
            if not isinstance(batch, list):
                raise RuntimeError("Liste de PR illisible.")
            pulls.extend(item for item in batch if isinstance(item, dict))
            if len(batch) < 100:
                return pulls
        raise RuntimeError("La liste GitHub dépasse une passe.")
    return pulls


def fetch_pull_files(number: int, repo: str = REPO) -> list[str]:
    import httpx

    names: list[str] = []
    with httpx.Client(timeout=20.0, headers=_github_headers()) as client:
        for page in range(1, 6):
            response = client.get(
                f"https://api.github.com/repos/{repo}/pulls/{number}/files",
                params={"per_page": 100, "page": page},
            )
            response.raise_for_status()
            batch = response.json()
            if not isinstance(batch, list):
                raise RuntimeError(f"Fichiers de la PR {number} illisibles.")
            names.extend(str(item.get("filename") or "") for item in batch if isinstance(item, dict))
            if len(batch) < 100:
                break
    return [name for name in names if name]


def _github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Synchro",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or _gh_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _gh_token() -> str | None:
    try:
        result = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    token = result.stdout.strip()
    return token or None


def _row(raw: dict[str, Any]) -> dict[str, Any]:
    number = raw.get("pr_number")
    return {
        "id": raw.get("id"),
        "slug": str(raw.get("slug") or ""),
        "area": str(raw.get("area") or "Socle"),
        "hidden": bool(raw.get("hidden")),
        "source": str(raw.get("source") or "dev"),
        "happened_on": _day(raw.get("happened_on")) or "1970-01-01",
        "title": str(raw.get("title") or ""),
        "body": str(raw.get("body") or ""),
        "pr_number": int(number) if number is not None else None,
        "prs": _points(raw.get("prs") or []),
    }


def _points(raw: Any) -> list[dict[str, Any]]:
    points = []
    if not isinstance(raw, list):
        return points
    for item in raw:
        if not isinstance(item, dict) or item.get("number") is None:
            continue
        day = _day(item.get("merged_on"))
        if not day:
            continue
        points.append(
            {
                "number": int(item["number"]),
                "title": str(item.get("title") or ""),
                "merged_on": day,
                "url": str(item.get("url") or ""),
            }
        )
    return points


def _known(rows: list[dict[str, Any]]) -> set[int]:
    numbers: set[int] = set()
    for row in rows:
        if row["pr_number"] is not None:
            numbers.add(row["pr_number"])
        numbers.update(point["number"] for point in row["prs"])
    return numbers


def _pick(rows: list[dict[str, Any]], area: str) -> dict[str, Any] | None:
    visible = [row for row in rows if row["area"] == area and not row["hidden"] and row["id"] is not None]
    if not visible:
        return None
    canonical = _AREA_SLUGS.get(area)
    for row in visible:
        if row["slug"] == canonical:
            return row
    seeded = [row for row in visible if row["source"] == "seed"]
    pool = seeded or visible
    return max(pool, key=lambda row: (len(row["prs"]), row["happened_on"], row["id"]))


def _merge_points(existing: list[dict[str, Any]], extra: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = {point["number"] for point in existing}
    added = []
    for point in extra:
        if point["number"] in seen:
            continue
        seen.add(point["number"])
        added.append(point)
    added.sort(key=lambda point: (point["merged_on"], point["number"]))
    return [*existing, *added]


def _free_slug(area: str, used: set[str]) -> str:
    base = _AREA_SLUGS.get(area) or re.sub(r"[^a-z0-9]+", "-", area.lower()).strip("-") or "zone"
    if base not in used:
        return base
    index = 2
    while f"{base}-{index}" in used:
        index += 1
    return f"{base}-{index}"


def _area_of(path: str) -> str | None:
    normalized = path.replace("\\", "/").strip()
    while normalized.startswith("./"):
        normalized = normalized[2:]
    for prefix, area in sorted(_PATH_AREAS, key=lambda item: len(item[0]), reverse=True):
        if normalized == prefix.rstrip("/") or normalized.startswith(prefix):
            return area
    return None


def _quiet(path: str) -> bool:
    normalized = path.replace("\\", "/").strip()
    while normalized.startswith("./"):
        normalized = normalized[2:]
    if normalized in _QUIET_FILES:
        return True
    return any(normalized.startswith(prefix) for prefix in _QUIET_PREFIXES)


def _headed(text: str, label: str) -> bool:
    if not text.lower().startswith(label.lower()):
        return False
    rest = text[len(label) :]
    return rest == "" or rest[0] in " :—-–"


def _dependabot(author: str | None, title: str) -> bool:
    if "dependabot" in (author or "").lower():
        return True
    folded = title.strip().lower()
    return folded.startswith("dépendances:") or folded.startswith("dependances:")


def _day(value: Any) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "")
    return text[:10] if len(text) >= 10 and text[4] == "-" and text[7] == "-" else ""


def _count(count: int, adjective: str) -> str:
    if count == 1:
        return f"1 PR {adjective}"
    if adjective.endswith("e"):
        return f"{count} PR {adjective}s"
    return f"{count} PR {adjective}"
