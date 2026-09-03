"""Lexique de motifs : identifiants stables + libellés FR."""

from __future__ import annotations

MOTIF_IDS = (
    "align_h",
    "align_v",
    "diagonal",
    "line",
    "wedge",
    "cluster",
    "spread",
    "center",
    "periphery",
    "top",
    "bottom",
    "left",
    "right",
    "mirror_v",
    "w_shape",
    "stars_adj",
    "stars_same_row",
)

MOTIF_LABELS: dict[str, str] = {
    "align_h": "Alignement horizontal",
    "align_v": "Alignement vertical",
    "diagonal": "Diagonale",
    "line": "Ligne (5 collinéaires)",
    "wedge": "Coin / wedge",
    "cluster": "Grappe compacte",
    "spread": "Dispersion",
    "center": "Occupation centrale",
    "periphery": "Périphérie",
    "top": "Haut de grille",
    "bottom": "Bas de grille",
    "left": "Gauche",
    "right": "Droite",
    "mirror_v": "Miroir vertical",
    "w_shape": "W / M",
    "stars_adj": "Étoiles adjacentes",
    "stars_same_row": "Étoiles même rangée",
}


def label_of(motif_id: str) -> str:
    return MOTIF_LABELS.get(motif_id, motif_id)


def facts_from(motifs: list[str], descriptors: dict[str, float]) -> list[str]:
    facts = [label_of(m) for m in motifs]
    cr = descriptors.get("centroid_row")
    cc = descriptors.get("centroid_col")
    if cr is not None and cc is not None:
        facts.append(f"centroïde ({cr:.2f}, {cc:.2f})")
    return facts


def caption_from_facts(facts: list[str], residual: str | None = None) -> str:
    core = " ; ".join(facts) if facts else "aucune forme du lexique"
    extra = (residual or "").strip()
    if extra:
        return f"{core}. {extra}"
    return core
