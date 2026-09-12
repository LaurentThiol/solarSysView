"""Recherche par ressemblance : DTW sans modèle, cosinus avec.

Le point de cette double voie est qu'elle marche **avant** tout entraînement.
Tu dessines une forme au bloc-croquis, et l'appariement temporel élastique
(DTW) remonte les fenêtres passées qui lui ressemblent, dès le premier croquis
et sans un seul poids appris. Quand les réseaux sont là, la même requête passe
par le cosinus sur l'embedding contrastif, plus rapide et plus tolérant aux
variations de durée.

DTW sert aussi de mètre-étalon : un réseau qui ne bat pas l'appariement
élastique ne sert à rien, et le rapport d'entraînement le dit.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

from synchro.chartisme.svgpath import normalize_window, resample_values

DEFAULT_LENGTH = 48
DEFAULT_BAND = 0.25
DEFAULT_TOP = 12


def profile(values: Sequence[float], *, length: int = DEFAULT_LENGTH) -> list[float]:
    """Fenêtre → profil comparable : longueur fixe, amplitude ramenée à [0, 1].

    Sans cette double normalisation, DTW comparerait des niveaux et des durées
    au lieu de comparer des formes.
    """
    cleaned = [float(v) for v in values if v is not None]
    if len(cleaned) < 2:
        return []
    resampled = resample_values(cleaned, length)
    low, high = min(resampled), max(resampled)
    span = high - low
    if span <= 0:
        return [0.5] * length
    return [(v - low) / span for v in resampled]


def dtw_distance(
    left: Sequence[float],
    right: Sequence[float],
    *,
    band: float = DEFAULT_BAND,
) -> float:
    """Distance DTW normalisée, avec bande de Sakoe-Chiba.

    La bande borne le décalage temporel admis : sans elle, DTW apparie un
    sommet du début avec un creux de la fin et trouve des ressemblances qui
    n'en sont pas.
    """
    n, m = len(left), len(right)
    if not n or not m:
        return math.inf
    width = max(1, int(max(n, m) * band))
    inf = math.inf
    previous = [inf] * (m + 1)
    previous[0] = 0.0
    for i in range(1, n + 1):
        current = [inf] * (m + 1)
        low = max(1, i - width)
        high = min(m, i + width)
        for j in range(low, high + 1):
            cost = abs(left[i - 1] - right[j - 1])
            current[j] = cost + min(previous[j], current[j - 1], previous[j - 1])
        previous = current
    total = previous[m]
    return inf if total == inf else total / (n + m)


def cosine(left: Sequence[float], right: Sequence[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return 0.0 if norm <= 0 else dot / norm


def build_index(
    windows: Sequence[dict[str, Any]],
    *,
    length: int = DEFAULT_LENGTH,
) -> list[dict[str, Any]]:
    """Profils précalculés des fenêtres candidates."""
    index: list[dict[str, Any]] = []
    for window in windows:
        shape = profile(window.get("values") or [], length=length)
        if not shape:
            continue
        index.append({**window, "profile": shape})
    return index


def search(
    query: Sequence[float],
    index: Sequence[dict[str, Any]],
    *,
    top: int = DEFAULT_TOP,
    length: int = DEFAULT_LENGTH,
    band: float = DEFAULT_BAND,
    figure: str | None = None,
) -> list[dict[str, Any]]:
    """Fenêtres les plus proches du croquis, par DTW."""
    shape = profile(query, length=length)
    if not shape:
        return []
    scored: list[dict[str, Any]] = []
    for entry in index:
        if figure is not None and entry.get("figure") != figure:
            continue
        distance = dtw_distance(shape, entry["profile"], band=band)
        if distance == math.inf:
            continue
        scored.append(
            {
                **{k: v for k, v in entry.items() if k != "profile"},
                "distance": round(distance, 5),
                # Similarité lisible, sans prétention probabiliste.
                "similarity": round(1.0 / (1.0 + 8.0 * distance), 4),
            }
        )
    scored.sort(key=lambda row: row["distance"])
    return scored[:top]


def search_embeddings(
    query: Sequence[float],
    index: Sequence[dict[str, Any]],
    *,
    top: int = DEFAULT_TOP,
    figure: str | None = None,
) -> list[dict[str, Any]]:
    """Même recherche, mais sur l'embedding contrastif — quand il existe."""
    scored: list[dict[str, Any]] = []
    for entry in index:
        vector = entry.get("embedding")
        if not vector:
            continue
        if figure is not None and entry.get("figure") != figure:
            continue
        score = cosine(query, vector)
        scored.append(
            {
                **{k: v for k, v in entry.items() if k not in ("embedding", "profile")},
                "similarity": round(score, 4),
                "distance": round(1.0 - score, 5),
            }
        )
    scored.sort(key=lambda row: -row["similarity"])
    return scored[:top]


def classify_by_neighbours(
    query: Sequence[float],
    index: Sequence[dict[str, Any]],
    *,
    k: int = 5,
    length: int = DEFAULT_LENGTH,
    band: float = DEFAULT_BAND,
) -> dict[str, Any]:
    """Classement au plus proche voisin — la référence à battre.

    C'est le classifieur le plus bête qui soit : il ne fait que retrouver les
    fenêtres semblables et voter. Tout réseau doit faire mieux, sinon les
    quelques centaines de milliers de paramètres ne servent à rien.
    """
    neighbours = search(query, index, top=k, length=length, band=band)
    if not neighbours:
        return {"figure": None, "confidence": 0.0, "neighbours": []}
    votes: dict[str, float] = {}
    for rank, neighbour in enumerate(neighbours):
        weight = 1.0 / (1 + rank)
        name = str(neighbour.get("figure") or "none")
        votes[name] = votes.get(name, 0.0) + weight
    total = sum(votes.values()) or 1.0
    figure, score = max(votes.items(), key=lambda kv: kv[1])
    return {
        "figure": figure,
        "confidence": round(score / total, 4),
        "votes": {name: round(v / total, 4) for name, v in sorted(votes.items(), key=lambda kv: -kv[1])},
        "neighbours": neighbours,
    }


def cluster(
    index: Sequence[dict[str, Any]],
    *,
    groups: int = 8,
    iterations: int = 12,
    seed: int = 0,
) -> list[dict[str, Any]]:
    """Regroupement k-moyennes des profils — la découverte non supervisée.

    Sert à répondre à une question que la table classique ne pose pas : quelles
    formes reviennent dans *cette* archive, y compris celles qui n'ont pas de
    nom ? Les groupes sortent sans étiquette, à toi de les nommer.
    """
    import random

    rows = [entry for entry in index if entry.get("profile")]
    if len(rows) <= groups:
        return [
            {"cluster": i, "size": 1, "members": [row], "centroid": row["profile"]}
            for i, row in enumerate(rows)
        ]
    rng = random.Random(seed)
    centroids = [list(row["profile"]) for row in rng.sample(rows, groups)]
    assignment = [0] * len(rows)
    for _ in range(iterations):
        moved = False
        for position, row in enumerate(rows):
            best = min(
                range(groups),
                key=lambda c: sum((a - b) ** 2 for a, b in zip(row["profile"], centroids[c])),
            )
            if best != assignment[position]:
                assignment[position] = best
                moved = True
        for c in range(groups):
            members = [rows[i]["profile"] for i, a in enumerate(assignment) if a == c]
            if members:
                centroids[c] = [sum(col) / len(col) for col in zip(*members)]
        if not moved:
            break
    out: list[dict[str, Any]] = []
    for c in range(groups):
        members = [rows[i] for i, a in enumerate(assignment) if a == c]
        if not members:
            continue
        out.append(
            {
                "cluster": c,
                "size": len(members),
                "centroid": [round(v, 4) for v in centroids[c]],
                "figures": _figure_mix(members),
                "members": [
                    {k: v for k, v in m.items() if k != "profile"} for m in members[:20]
                ],
            }
        )
    out.sort(key=lambda row: -row["size"])
    return out


def _figure_mix(members: Sequence[dict[str, Any]]) -> dict[str, int]:
    mix: dict[str, int] = {}
    for member in members:
        name = str(member.get("figure") or "none")
        mix[name] = mix.get(name, 0) + 1
    return dict(sorted(mix.items(), key=lambda kv: -kv[1]))


def sketch_to_values(points: Sequence[Sequence[float]], *, length: int = DEFAULT_LENGTH) -> list[float]:
    """Croquis à la souris → série régulière.

    Le tracé arrive comme une suite de points `(x, y)` non régulièrement
    espacés, en coordonnées écran où `y` croît vers le bas. On rééchantillonne
    en abscisse et on retourne l'axe.
    """
    cleaned = [(float(p[0]), float(p[1])) for p in points if len(p) >= 2]
    if len(cleaned) < 2:
        return []
    cleaned.sort(key=lambda p: p[0])
    x0, x1 = cleaned[0][0], cleaned[-1][0]
    if x1 - x0 <= 0:
        return []
    out: list[float] = []
    cursor = 0
    for i in range(length):
        x = x0 + (x1 - x0) * i / (length - 1)
        while cursor < len(cleaned) - 2 and cleaned[cursor + 1][0] < x:
            cursor += 1
        left, right = cleaned[cursor], cleaned[cursor + 1]
        width = right[0] - left[0]
        frac = 0.0 if width <= 0 else (x - left[0]) / width
        out.append(-(left[1] + (right[1] - left[1]) * frac))
    return out


def normalize_sketch(values: Sequence[float]) -> list[float]:
    """Croquis ramené au carré unité, comme une fenêtre de courbe."""
    points = normalize_window(values)
    return [y for _, y in points]
