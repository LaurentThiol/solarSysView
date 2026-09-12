"""Inférence : ce que les réseaux disent d'une fenêtre, et ce qu'ils taisent.

Les poids sont chargés une fois et gardés en mémoire. Toute absence — torch
non installé, poids jamais entraînés — se traduit par `None` et jamais par une
erreur : l'onglet doit rester entier sans réseau.

Deux principes tenus ici :

- un réseau ne remplace pas la géométrie, il la complète. Une prédiction de
  réseau ne porte pas de pivots, de ligne de cou ni d'objectif — rien à
  dessiner. On la sert donc à côté de la lecture géométrique, pas à sa place ;
- sous le seuil de confiance, on s'abstient. Une annotation sûre d'elle et
  fausse coûte plus cher que pas d'annotation.
"""

from __future__ import annotations

import threading
from typing import Any, Sequence

from synchro.chartisme.catalog import label_of
from synchro.chartisme.models import pyg_available, torch_available
from synchro.chartisme.models.train import DEFAULT_ABSTAIN, load, read_report

_models: dict[str, Any] = {}
_lock = threading.Lock()


def _get(name: str) -> Any | None:
    if name in _models:
        return _models[name]
    with _lock:
        if name in _models:
            return _models[name]
        try:
            _models[name] = load(name)
        except (OSError, RuntimeError, KeyError, ValueError):
            _models[name] = None
    return _models[name]


def reset() -> None:
    """Vide le cache — après un entraînement, les poids ont changé."""
    with _lock:
        _models.clear()


def ready() -> dict[str, Any]:
    """Quels réseaux sont réellement utilisables, et avec quel rapport."""
    report = read_report()
    out: dict[str, Any] = {
        "torch": torch_available(),
        "pyg": pyg_available(),
        "svgformer": False,
        "gnn": False,
        "trained_at": (report or {}).get("trained_at"),
        "verdict": (report or {}).get("verdict"),
    }
    if not torch_available():
        return out
    out["svgformer"] = _get("svgformer") is not None
    out["gnn"] = pyg_available() and _get("gnn") is not None
    return out


def _encode(values: Sequence[float], activity: Sequence[float] | None) -> dict[str, Any]:
    from synchro.chartisme.dataset import encode

    return encode(
        {"figure": "none", "values": list(values), "activity": list(activity or [])}
    )


def predict(
    values: Sequence[float],
    *,
    activity: Sequence[float] | None = None,
    model: str = "svgformer",
    abstain: float | None = DEFAULT_ABSTAIN,
    top: int = 3,
) -> dict[str, Any] | None:
    """Lecture d'un réseau sur une fenêtre, ou `None` s'il n'est pas là."""
    net = _get(model) if torch_available() else None
    if net is None:
        return None
    row = _encode(values, activity)
    report = read_report() or {}
    temperature = float(
        ((report.get("models") or {}).get(model) or {}).get("temperature") or 1.0
    )
    try:
        if model == "gnn":
            from synchro.chartisme.models import gnn as G
            from synchro.chartisme.models.train import predict_gnn

            data = G.to_dataset([row], net.classes)
            if not data:
                return None
            top1, top3, scores = predict_gnn(
                net, data, net.classes, temperature=temperature
            )
        else:
            from synchro.chartisme.models.train import predict_svgformer

            top1, top3, scores = predict_svgformer(
                net, [row], net.classes, temperature=temperature
            )
    except (RuntimeError, ValueError, IndexError):
        return None
    if not top1:
        return None
    confidence = scores[0]
    abstained = abstain is not None and confidence < abstain
    return {
        "detector": model,
        "figure": None if abstained else top1[0],
        "label": None if abstained else label_of(top1[0]),
        "confidence": confidence,
        "abstained": abstained,
        "candidates": [
            {"figure": name, "label": label_of(name)} for name in top3[0][:top]
        ],
        "temperature": temperature,
    }


def embed(
    values: Sequence[float],
    *,
    activity: Sequence[float] | None = None,
    model: str = "svgformer",
) -> list[float] | None:
    """Embedding contrastif d'une fenêtre — pour la recherche par ressemblance."""
    net = _get(model) if torch_available() else None
    if net is None:
        return None
    import torch

    row = _encode(values, activity)
    try:
        with torch.no_grad():
            if model == "gnn":
                from synchro.chartisme.models import gnn as G

                data = G.to_dataset([row], net.classes)
                if not data:
                    return None
                out = net(G.loader(data, batch_size=1, shuffle=False).__iter__().__next__())
            else:
                from synchro.chartisme.models import svgformer as S

                batch = S.collate([row])
                out = net(batch["commands"], batch["args"], batch["path_mask"])
        return [round(float(v), 6) for v in out["embedding"][0].tolist()]
    except (RuntimeError, ValueError, IndexError, StopIteration):
        return None


def annotate(
    hits: Sequence[dict[str, Any]],
    values: Sequence[float],
    *,
    activity: Sequence[float] | None = None,
) -> dict[str, Any]:
    """Avis des réseaux à côté de la lecture géométrique.

    L'accord ou le désaccord est dit explicitement : c'est l'information la
    plus utile des deux, parce qu'une figure vue par les trois lectures vaut
    mieux qu'une figure vue par une seule.
    """
    geometric = hits[0]["figure"] if hits else None
    opinions: dict[str, Any] = {}
    for name in ("svgformer", "gnn"):
        opinion = predict(values, activity=activity, model=name)
        if opinion is not None:
            opinions[name] = opinion
    agree = [
        name
        for name, opinion in opinions.items()
        if opinion.get("figure") and opinion["figure"] == geometric
    ]
    return {
        "geometric": geometric,
        "models": opinions,
        "agreement": len(agree),
        "consensus": bool(geometric and len(agree) == len(opinions) and opinions),
    }
