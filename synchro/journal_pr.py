"""Brouillon de journal pour une pull request, sans appel réseau.

L’action GitHub commente une fois. Le déclencheur Cursor « Pull request opened »
ignore les PR encore en draft : ce module ne fait pas cette distinction.
"""

from __future__ import annotations

import json
import re
from typing import Any

MARKER = "synchro-journal-draft"
INCHANGE = "Journal : inchangé"

# Préfixes les plus longs d’abord. La barre finale évite que next/ prenne nextdata.
_AREA_RULES: tuple[tuple[str, str], ...] = (
    ("src/app/nextdatatraining/", "nextDataTraining"),
    ("src/app/api/nextdata/", "nextData"),
    ("src/app/nextdata/", "nextData"),
    ("synchro/nextdata/", "nextData"),
    ("src/app/brain/decision-tree/", "decisionTree"),
    ("src/app/brain/specialistes/", "Spécialistes"),
    ("src/app/brain/dictionnaire/", "Dictionnaire"),
    ("synchro/decision_tree/", "decisionTree"),
    ("synchro/brain_specialists/", "Spécialistes"),
    ("synchro/lexicon/", "Dictionnaire"),
    ("src/app/brain/", "Brain"),
    ("synchro/brain.py", "Brain"),
    ("src/app/probadynamic/", "probaDynamic"),
    ("src/lib/proba-dynamic", "probaDynamic"),
    ("src/lib/proba-map", "probaDynamic"),
    ("synchro/fractal/", "probaDynamic"),
    ("src/app/evolution/", "Évolution"),
    ("src/components/evolution-", "Évolution"),
    ("src/components/bouncing-", "Évolution"),
    ("src/components/month-end", "Évolution"),
    ("src/lib/annual-", "Évolution"),
    ("src/lib/gains", "Évolution"),
    ("src/lib/persist-evol", "Évolution"),
    ("src/lib/delta-", "Évolution"),
    ("src/lib/grid-shape", "Évolution"),
    ("src/app/tirage/", "Tirage"),
    ("src/components/draws-", "Tirage"),
    ("src/components/draw-", "Tirage"),
    ("src/lib/draws", "Tirage"),
    ("synchro/fdj.py", "Tirage"),
    ("synchro/sync.py", "Tirage"),
    ("src/app/analyse/", "Analyse"),
    ("src/lib/analysis", "Analyse"),
    ("src/lib/twins-", "Analyse"),
    ("src/components/frequency-", "Analyse"),
    ("synchro/analysis/", "Analyse"),
    ("src/app/morpho/", "Morpho"),
    ("synchro/morpho/", "Morpho"),
    ("src/app/relief/", "Relief"),
    ("src/app/chartisme/", "Chartisme"),
    ("synchro/chartisme/", "Chartisme"),
    ("src/app/cycles/", "Cycles"),
    ("synchro/cycles/", "Cycles"),
    ("src/lib/cycles", "Cycles"),
    ("src/app/harmo/", "Harmo"),
    ("synchro/harmo/", "Harmo"),
    ("src/lib/harmo", "Harmo"),
    ("src/app/pulse/", "Pulse"),
    ("synchro/pulse/", "Pulse"),
    ("src/lib/pulse", "Pulse"),
    ("src/app/next/", "Next"),
    ("src/app/combinaisons/", "Combinaisons"),
    ("src/lib/combinations", "Combinaisons"),
    ("src/app/pronostic/", "Pronostic"),
    ("synchro/pronostic_net/", "Pronostic"),
    ("src/app/jeux/", "Jeux"),
    ("src/lib/jeux", "Jeux"),
    ("src/lib/plays", "Jeux"),
    ("synchro/plays.py", "Jeux"),
    ("src/app/ref/", "Réf"),
    ("synchro/ref/", "Réf"),
    ("src/lib/ref", "Réf"),
    ("src/app/ia/", "IA"),
    ("src/app/admin/", "Admin"),
    ("src/app/api/admin/", "Admin"),
    ("src/app/api/github/", "Admin"),
    ("src/app/api/morpho/", "Morpho"),
    ("src/app/api/plays/", "Jeux"),
    ("src/app/api/pronostic/", "Pronostic"),
    ("src/app/api/pulse/", "Pulse"),
    ("src/app/api/ref/", "Réf"),
    ("src/app/api/analysis/", "Analyse"),
    ("src/app/api/brain/", "Brain"),
    ("src/app/api/chartisme/", "Chartisme"),
    ("src/app/api/cycles/", "Cycles"),
    ("src/app/api/draws/", "Tirage"),
    ("src/app/api/grids/", "Combinaisons"),
    ("src/app/api/harmo/", "Harmo"),
    ("src/app/api/ia/", "IA"),
    ("src/app/api/sync/", "Tirage"),
    ("src/components/admin-", "Admin"),
    ("src/lib/admin-", "Admin"),
    ("src/lib/supply-", "Admin"),
    ("src/app/schemas/", "Schémas"),
    ("docs/schemas/", "Schémas"),
    ("src/app/journal/", "Journal"),
    ("src/app/api/journal/", "Journal"),
    ("src/components/journal/", "Journal"),
    ("src/lib/journal", "Journal"),
    ("docs/journal/", "Journal"),
    ("synchro/journal.py", "Journal"),
    ("synchro/journal_pr.py", "Journal"),
    ("src/components/nextdata/", "nextData"),
    ("src/lib/nextdata/", "nextData"),
    ("src/components/next/", "Next"),
    ("src/lib/next/", "Next"),
    ("src/components/combinaisons/", "Combinaisons"),
    ("src/components/pronostic/", "Pronostic"),
    ("src/lib/pronostic/", "Pronostic"),
    ("src/components/jeux/", "Jeux"),
    ("src/components/brain/", "Brain"),
    ("src/lib/brain/", "Brain"),
    ("src/components/morpho/", "Morpho"),
    ("src/lib/morpho/", "Morpho"),
    ("src/components/relief/", "Relief"),
    ("src/lib/relief/", "Relief"),
    ("src/components/chartisme/", "Chartisme"),
    ("src/lib/chartisme/", "Chartisme"),
    ("src/components/chart-draw/", "Chartisme"),
    ("src/lib/chart-draw/", "Chartisme"),
    ("src/lib/ta/", "Chartisme"),
    ("src/components/cycles/", "Cycles"),
    ("src/components/harmo/", "Harmo"),
    ("src/components/pulse/", "Pulse"),
    ("src/components/proba-dynamic/", "probaDynamic"),
    ("src/components/analysis/", "Analyse"),
    ("src/components/ia/", "IA"),
    ("src/lib/ia/", "IA"),
    ("src/components/ref/", "Réf"),
    ("src/lib/lexicon/", "Dictionnaire"),
    ("src/components/schemas/", "Schémas"),
    ("src/lib/schemas/", "Schémas"),
)

_LANE_ORDER = (
    "Socle",
    "Tirage",
    "Évolution",
    "Analyse",
    "Morpho",
    "Relief",
    "Chartisme",
    "Cycles",
    "Harmo",
    "Pulse",
    "probaDynamic",
    "Next",
    "Combinaisons",
    "Pronostic",
    "nextData",
    "nextDataTraining",
    "Jeux",
    "Brain",
    "Spécialistes",
    "decisionTree",
    "Dictionnaire",
    "Réf",
    "IA",
    "Admin",
    "Schémas",
    "Journal",
)

_QUIET_PREFIXES = ("tests/", ".github/")
_QUIET_FILES = {
    "package.json",
    "package-lock.json",
    "requirements.txt",
    "AGENTS.md",
    "README.md",
    "CLAUDE.md",
    ".gitignore",
}


def branch_slug(branch: str) -> str:
    name = branch.strip().lower()
    if name.startswith("cursor/"):
        name = name[len("cursor/") :]
    name = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
    return name or "sans-branche"


def _normalize(path: str) -> str:
    normalized = path.replace("\\", "/").strip()
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def area_of(path: str) -> str | None:
    normalized = _normalize(path)
    for prefix, area in sorted(_AREA_RULES, key=lambda item: len(item[0]), reverse=True):
        if normalized == prefix.rstrip("/") or normalized.startswith(prefix):
            return area
    return None


def journal_section_is_filled(body: str | None) -> bool:
    """Une section Journal déjà rédigée, ou la mention explicite d’absence.

    Le modèle de PR cite « Journal : inchangé » dans un commentaire HTML.
    Cette citation ne compte pas comme une fiche écrite.
    """
    stripped = re.sub(r"<!--.*?-->", "", body or "", flags=re.S)
    if INCHANGE in stripped:
        return True
    match = re.search(r"^##\s+Journal\s*$", stripped, flags=re.M)
    if match is None:
        return False
    rest = stripped[match.end() :]
    nxt = re.search(r"^##\s+\S", rest, flags=re.M)
    if nxt is not None:
        rest = rest[: nxt.start()]
    for line in rest.splitlines():
        cleaned = line.strip()
        if not cleaned or cleaned in {"Journal :", "Journal:"}:
            continue
        if len(cleaned) >= 8:
            return True
    return False


def comment_for_pull_request(
    *,
    title: str,
    body: str | None,
    branch: str,
    files: list[str],
    commits: list[str],
    number: int | None,
    url: str | None,
    author: str | None,
    inbox_exists: bool,
    happened_on: str,
) -> str | None:
    """Texte du commentaire, ou None si la PR a déjà son journal."""
    if _is_dependabot(author, title):
        return None
    if inbox_exists or journal_section_is_filled(body):
        return None
    area, primary_paths, also = _classify(files)
    if area is None:
        return f"<!-- {MARKER} -->\n{INCHANGE}\n"
    paragraph = _paragraph(title, area, primary_paths, commits, also)
    slug = branch_slug(branch)
    payload: dict[str, Any] = {
        "slug": slug,
        "happened_on": happened_on,
        "area": area,
        "title": title.strip(),
        "body": paragraph,
        "pr_number": number,
        "pr_url": url,
    }
    dumped = json.dumps(payload, ensure_ascii=False, indent=2)
    return (
        f"<!-- {MARKER} -->\n"
        "## Journal\n\n"
        f"Zone : {area}\n"
        f"Titre : {title.strip()}\n\n"
        f"{paragraph}\n\n"
        "À confirmer dans Système / Journal. "
        f"Le fichier va dans `docs/journal/inbox/{slug}.json` :\n\n"
        f"```json\n{dumped}\n```\n"
    )


def _is_dependabot(author: str | None, title: str) -> bool:
    login = (author or "").lower()
    if "dependabot" in login:
        return True
    return title.strip().lower().startswith("dépendances:") or title.strip().lower().startswith("dependances:")


def _is_quiet(path: str) -> bool:
    normalized = _normalize(path)
    if normalized in _QUIET_FILES:
        return True
    return any(normalized.startswith(prefix) for prefix in _QUIET_PREFIXES)


def _classify(files: list[str]) -> tuple[str | None, list[str], list[str]]:
    notable: list[tuple[str, str | None]] = []
    for path in files:
        if not path.strip() or _is_quiet(path):
            continue
        notable.append((path, area_of(path)))
    counts: dict[str, int] = {}
    for _path, area in notable:
        if area and area != "Journal":
            counts[area] = counts.get(area, 0) + 1
    if counts:
        ranked = sorted(counts, key=lambda name: (-counts[name], _LANE_ORDER.index(name) if name in _LANE_ORDER else 99, name))
        primary = ranked[0]
        paths = [path for path, area in notable if area == primary]
        also = [name for name in ranked[1:] if name != primary]
        return primary, paths, also
    unmapped = [path for path, area in notable if area is None]
    if unmapped:
        return "Socle", unmapped, []
    return None, [], []


def _paragraph(title: str, area: str, paths: list[str], commits: list[str], also: list[str]) -> str:
    subjects = [
        subject.strip()
        for subject in commits
        if subject.strip() and not subject.strip().lower().startswith("merge ")
    ]
    feature = [subject for subject in subjects if not subject.lower().startswith("tests")]
    title_sentence = _sentence(title)
    lead = _sentence(feature[0] if feature else title)
    shown = ", ".join(f"`{path}`" for path in paths[:4])
    where = f"La zone {area} porte le changement"
    if shown:
        where += f" ({shown})"
    sentences = [where + "."]
    if lead != title_sentence:
        sentences.insert(0, lead)
    if also:
        sentences.append("D’autres fichiers touchent " + ", ".join(also) + ".")
    if any(subject.lower().startswith("tests") for subject in subjects):
        sentences.append("Des tests couvrent le même changement.")
    return " ".join(sentences)


def _sentence(text: str) -> str:
    cleaned = text.strip().rstrip(".")
    return f"{cleaned}."


def main(argv: list[str] | None = None) -> int:
    import sys
    from pathlib import Path

    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 4:
        print("usage: python -m synchro.journal_pr pr.json files.txt commits.txt comment.md", file=sys.stderr)
        return 2
    pr_path, files_path, commits_path, out_path = (Path(arg) for arg in args)
    pr = json.loads(pr_path.read_text(encoding="utf-8"))
    files = [line.strip() for line in files_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    commits = [line.strip() for line in commits_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    branch = str((pr.get("head") or {}).get("ref") or "")
    slug = branch_slug(branch)
    created = str(pr.get("created_at") or "")
    happened = created[:10] if len(created) >= 10 else "1970-01-01"
    user = pr.get("user") or {}
    comment = comment_for_pull_request(
        title=str(pr.get("title") or ""),
        body=pr.get("body"),
        branch=branch,
        files=files,
        commits=commits,
        number=pr.get("number"),
        url=pr.get("html_url"),
        author=user.get("login") if isinstance(user, dict) else None,
        inbox_exists=(Path("docs/journal/inbox") / f"{slug}.json").is_file(),
        happened_on=happened,
    )
    if comment:
        out_path.write_text(comment, encoding="utf-8")
    elif out_path.exists():
        out_path.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
