"""Entraînement des deux réseaux, et le rapport qui dit s'ils servent.

Le rapport compare quatre classifieurs sur le **même** jeu de validation :

1. le détecteur géométrique, écrit à la main ;
2. le plus proche voisin DTW, sans un poids appris ;
3. le transformer hiérarchique ;
4. le GNN.

Cette comparaison est le cœur du module. Quelques centaines de milliers de
paramètres ne se justifient que s'ils battent une règle géométrique et un
appariement élastique — et si ce n'est pas le cas, autant le savoir.

Entraînement sur processeur, quelques minutes. Les poids vont dans
`.chartisme/weights/`, hors dépôt.
"""

from __future__ import annotations

import json
import math
import random
import time
from pathlib import Path
from typing import Any, Callable, Sequence

from synchro.chartisme.catalog import FIGURE_IDS
from synchro.chartisme.export import CHARTISME_DIR
from synchro.chartisme.figures import detect_figures
from synchro.chartisme.retrieval import build_index, classify_by_neighbours

WEIGHTS_DIR = CHARTISME_DIR / "weights"
REPORT_PATH = CHARTISME_DIR / "training.json"
DEFAULT_EPOCHS = 12
DEFAULT_BATCH = 32
DEFAULT_LR = 3e-4
CONTRASTIVE_WEIGHT = 0.3
BREAKOUT_WEIGHT = 0.1
# Sous ce seuil, le modèle s'abstient plutôt que d'annoter une figure.
DEFAULT_ABSTAIN = 0.45


def _torch() -> Any:
    import torch

    return torch


# --- Métriques ----------------------------------------------------------------


def confusion(
    truth: Sequence[str],
    predicted: Sequence[str],
    classes: Sequence[str],
) -> list[list[int]]:
    lookup = {name: i for i, name in enumerate(classes)}
    matrix = [[0] * len(classes) for _ in classes]
    for actual, guess in zip(truth, predicted):
        i, j = lookup.get(actual), lookup.get(guess)
        if i is None or j is None:
            continue
        matrix[i][j] += 1
    return matrix


def per_class_f1(
    truth: Sequence[str],
    predicted: Sequence[str],
    classes: Sequence[str],
) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for name in classes:
        tp = sum(1 for a, p in zip(truth, predicted) if a == name and p == name)
        fp = sum(1 for a, p in zip(truth, predicted) if a != name and p == name)
        fn = sum(1 for a, p in zip(truth, predicted) if a == name and p != name)
        precision = tp / (tp + fp) if tp + fp else None
        recall = tp / (tp + fn) if tp + fn else None
        if precision and recall:
            f1 = 2 * precision * recall / (precision + recall)
        else:
            f1 = 0.0 if (tp + fp + fn) else None
        out[name] = {
            "support": tp + fn,
            "precision": None if precision is None else round(precision, 4),
            "recall": None if recall is None else round(recall, 4),
            "f1": None if f1 is None else round(f1, 4),
        }
    return out


def score(
    truth: Sequence[str],
    predicted: Sequence[str],
    classes: Sequence[str],
    *,
    top3: Sequence[Sequence[str]] | None = None,
) -> dict[str, Any]:
    total = len(truth) or 1
    correct = sum(1 for a, p in zip(truth, predicted) if a == p)
    f1 = per_class_f1(truth, predicted, classes)
    measured = [row["f1"] for row in f1.values() if row["f1"] is not None]
    out = {
        "count": len(truth),
        "accuracy": round(correct / total, 4),
        "macro_f1": round(sum(measured) / len(measured), 4) if measured else None,
        "per_class": f1,
        "abstained": sum(1 for p in predicted if p == "__abstain__"),
    }
    if top3 is not None:
        hits = sum(1 for actual, guesses in zip(truth, top3) if actual in guesses)
        out["top3"] = round(hits / total, 4)
    return out


# --- Références sans réseau ---------------------------------------------------


def geometric_predictions(samples: Sequence[dict[str, Any]]) -> tuple[list[str], list[list[str]]]:
    """Ce que dit le détecteur géométrique sur le même jeu."""
    top1: list[str] = []
    top3: list[list[str]] = []
    for sample in samples:
        hits = detect_figures(
            sample["values"], activity=sample.get("activity") or None
        )
        names = [hit["figure"] for hit in hits]
        top1.append(names[0] if names else "none")
        top3.append(names[:3] or ["none"])
    return top1, top3


def dtw_predictions(
    train: Sequence[dict[str, Any]],
    val: Sequence[dict[str, Any]],
    *,
    per_class: int = 40,
    k: int = 5,
    seed: int = 0,
) -> list[str]:
    """Plus proche voisin DTW sur un échantillon du jeu d'entraînement.

    L'échantillon est borné parce que DTW est quadratique : comparer chaque
    fenêtre de validation à des dizaines de milliers d'exemples coûterait des
    heures pour une référence de base.
    """
    rng = random.Random(seed)
    buckets: dict[str, list[dict[str, Any]]] = {}
    for sample in train:
        buckets.setdefault(sample["figure"], []).append(sample)
    pool: list[dict[str, Any]] = []
    for figure in sorted(buckets):
        rows = buckets[figure]
        pool.extend(rows if len(rows) <= per_class else rng.sample(rows, per_class))
    index = build_index(pool)
    return [
        str(classify_by_neighbours(sample["values"], index, k=k).get("figure") or "none")
        for sample in val
    ]


# --- Boucles d'entraînement ---------------------------------------------------


def supervised_contrastive(embeddings: Any, labels: Any, *, temperature: float = 0.1) -> Any:
    """Rapproche les fenêtres de même figure, éloigne les autres.

    C'est cet espace qui sert la recherche par ressemblance et les classes à
    trois exemples : une figure nouvelle s'y place sans réentraîner la tête de
    classification.
    """
    torch = _torch()
    similarity = embeddings @ embeddings.t() / temperature
    size = embeddings.size(0)
    identity = torch.eye(size, dtype=torch.bool, device=embeddings.device)
    similarity = similarity.masked_fill(identity, float("-inf"))
    positive = labels.unsqueeze(0) == labels.unsqueeze(1)
    positive = positive & ~identity
    has_positive = positive.any(dim=1)
    if not bool(has_positive.any()):
        return embeddings.sum() * 0.0
    log_prob = similarity - torch.logsumexp(similarity, dim=1, keepdim=True)
    # La diagonale vaut -inf après le masque, et son coefficient vaut zéro :
    # une multiplication donnerait `-inf * 0` = NaN. L'autograd n'en souffre
    # pas — le masque ne laisse passer aucun gradient là — mais la valeur
    # remontée dans l'historique, elle, serait NaN à chaque époque.
    kept = torch.where(positive, log_prob, torch.zeros_like(log_prob))
    per_row = kept.sum(dim=1) / positive.sum(dim=1).clamp(min=1)
    return -(per_row[has_positive]).mean()


def _batches(rows: Sequence[Any], size: int, rng: random.Random) -> list[list[Any]]:
    order = list(range(len(rows)))
    rng.shuffle(order)
    return [[rows[i] for i in order[start : start + size]] for start in range(0, len(order), size)]


def train_svgformer(
    train_rows: Sequence[dict[str, Any]],
    val_rows: Sequence[dict[str, Any]],
    classes: Sequence[str],
    *,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH,
    lr: float = DEFAULT_LR,
    class_weights: Sequence[float] | None = None,
    seed: int = 0,
    on_epoch: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    torch = _torch()
    from synchro.chartisme.models import svgformer as S

    torch.manual_seed(seed)
    rng = random.Random(seed)
    lookup = {name: i for i, name in enumerate(classes)}
    model = S.build(classes)
    optimiser = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    weight = (
        torch.tensor([float(w) for w in class_weights]) if class_weights else None
    )
    history: list[dict[str, Any]] = []
    started = time.time()
    for epoch in range(epochs):
        model.train()
        total = 0.0
        seen = 0
        for chunk in _batches(train_rows, batch_size, rng):
            if len(chunk) < 2:
                continue
            batch = S.collate(chunk)
            labels = torch.tensor([lookup[row["figure"]] for row in chunk], dtype=torch.long)
            out = model(batch["commands"], batch["args"], batch["path_mask"])
            losses = torch.nn.functional.cross_entropy(
                out["logits"], labels, weight=weight, reduction="none"
            )
            loss = (losses * batch["weight"]).mean()
            loss = loss + CONTRASTIVE_WEIGHT * supervised_contrastive(out["embedding"], labels)
            loss = loss + BREAKOUT_WEIGHT * torch.nn.functional.binary_cross_entropy_with_logits(
                out["breakout"], batch["breakout"]
            )
            optimiser.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimiser.step()
            total += float(loss.detach()) * len(chunk)
            seen += len(chunk)
        row = {"epoch": epoch + 1, "loss": round(total / max(1, seen), 4)}
        if val_rows:
            row["val_accuracy"] = _svgformer_accuracy(model, val_rows, classes, batch_size)
        history.append(row)
        if on_epoch is not None:
            on_epoch(row)
    return {
        "model": model,
        "history": history,
        "seconds": round(time.time() - started, 1),
    }


def _svgformer_accuracy(
    model: Any,
    rows: Sequence[dict[str, Any]],
    classes: Sequence[str],
    batch_size: int,
) -> float:
    predicted, _, _ = predict_svgformer(model, rows, classes, batch_size=batch_size)
    truth = [row["figure"] for row in rows]
    correct = sum(1 for a, p in zip(truth, predicted) if a == p)
    return round(correct / max(1, len(truth)), 4)


def predict_svgformer(
    model: Any,
    rows: Sequence[dict[str, Any]],
    classes: Sequence[str],
    *,
    batch_size: int = DEFAULT_BATCH,
    temperature: float = 1.0,
    abstain: float | None = None,
) -> tuple[list[str], list[list[str]], list[float]]:
    torch = _torch()
    from synchro.chartisme.models import svgformer as S

    model.eval()
    top1: list[str] = []
    top3: list[list[str]] = []
    scores: list[float] = []
    with torch.no_grad():
        for start in range(0, len(rows), batch_size):
            chunk = list(rows[start : start + batch_size])
            batch = S.collate(chunk)
            out = model(batch["commands"], batch["args"], batch["path_mask"])
            probabilities = torch.softmax(out["logits"] / max(1e-6, temperature), dim=-1)
            best = probabilities.topk(min(3, len(classes)), dim=-1)
            for values, indexes in zip(best.values.tolist(), best.indices.tolist()):
                names = [classes[i] for i in indexes]
                scores.append(round(values[0], 4))
                top3.append(names)
                top1.append(
                    "__abstain__" if abstain is not None and values[0] < abstain else names[0]
                )
    return top1, top3, scores


def train_gnn(
    train_rows: Sequence[dict[str, Any]],
    val_rows: Sequence[dict[str, Any]],
    classes: Sequence[str],
    *,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH,
    lr: float = DEFAULT_LR,
    class_weights: Sequence[float] | None = None,
    seed: int = 0,
    on_epoch: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    torch = _torch()
    from synchro.chartisme.models import gnn as G

    torch.manual_seed(seed)
    model = G.build(classes)
    optimiser = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    weight = torch.tensor([float(w) for w in class_weights]) if class_weights else None
    train_data = G.to_dataset(train_rows, classes)
    val_data = G.to_dataset(val_rows, classes)
    history: list[dict[str, Any]] = []
    started = time.time()
    for epoch in range(epochs):
        model.train()
        total = 0.0
        seen = 0
        for batch in G.loader(train_data, batch_size=batch_size):
            if batch.num_graphs < 2:
                continue
            out = model(batch)
            losses = torch.nn.functional.cross_entropy(
                out["logits"], batch.y, weight=weight, reduction="none"
            )
            loss = (losses * batch.weight).mean()
            loss = loss + CONTRASTIVE_WEIGHT * supervised_contrastive(out["embedding"], batch.y)
            loss = loss + BREAKOUT_WEIGHT * torch.nn.functional.binary_cross_entropy_with_logits(
                out["breakout"], batch.breakout
            )
            optimiser.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimiser.step()
            total += float(loss.detach()) * batch.num_graphs
            seen += batch.num_graphs
        row = {"epoch": epoch + 1, "loss": round(total / max(1, seen), 4)}
        if val_data:
            predicted, _, _ = predict_gnn(model, val_data, classes, batch_size=batch_size)
            truth = [row_["figure"] for row_ in val_rows]
            row["val_accuracy"] = round(
                sum(1 for a, p in zip(truth, predicted) if a == p) / max(1, len(truth)), 4
            )
        history.append(row)
        if on_epoch is not None:
            on_epoch(row)
    return {
        "model": model,
        "history": history,
        "seconds": round(time.time() - started, 1),
    }


def predict_gnn(
    model: Any,
    data: Sequence[Any],
    classes: Sequence[str],
    *,
    batch_size: int = DEFAULT_BATCH,
    temperature: float = 1.0,
    abstain: float | None = None,
) -> tuple[list[str], list[list[str]], list[float]]:
    torch = _torch()
    from synchro.chartisme.models import gnn as G

    model.eval()
    top1: list[str] = []
    top3: list[list[str]] = []
    scores: list[float] = []
    with torch.no_grad():
        for batch in G.loader(data, batch_size=batch_size, shuffle=False):
            out = model(batch)
            probabilities = torch.softmax(out["logits"] / max(1e-6, temperature), dim=-1)
            best = probabilities.topk(min(3, len(classes)), dim=-1)
            for values, indexes in zip(best.values.tolist(), best.indices.tolist()):
                names = [classes[i] for i in indexes]
                scores.append(round(values[0], 4))
                top3.append(names)
                top1.append(
                    "__abstain__" if abstain is not None and values[0] < abstain else names[0]
                )
    return top1, top3, scores


# --- Calibration --------------------------------------------------------------


def fit_temperature(
    logit_scores: Sequence[float],
    correct: Sequence[bool],
    *,
    grid: Sequence[float] = (0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0),
) -> float:
    """Température qui rapproche la confiance affichée de la justesse réelle.

    Un réseau non calibré annonce 0,95 et se trompe une fois sur trois. Comme
    la confiance sert ici à décider quoi dessiner sur la courbe, mieux vaut
    qu'elle veuille dire quelque chose.
    """
    if not logit_scores:
        return 1.0
    best, best_error = 1.0, math.inf
    for temperature in grid:
        # Appliquer une température à une probabilité déjà normalisée est une
        # approximation ; elle suffit à choisir entre « trop sûr » et « pas
        # assez », qui est tout ce qu'on demande ici.
        #
        # L'exposant est `temperature` et non son inverse : la température est
        # appliquée plus loin par `softmax(logits / T)`, où T > 1 **adoucit**.
        # Avec l'inverse, la grille renvoyait 0,5 pour un modèle trop sûr de
        # lui, et `predict` durcissait alors une confiance déjà excessive.
        adjusted = [min(1.0, max(0.0, s**temperature)) for s in logit_scores]
        error = sum(
            (a - (1.0 if c else 0.0)) ** 2 for a, c in zip(adjusted, correct)
        ) / len(adjusted)
        if error < best_error:
            best, best_error = temperature, error
    return best


def reliability(
    scores: Sequence[float],
    correct: Sequence[bool],
    *,
    bins: int = 5,
) -> list[dict[str, Any]]:
    """Confiance annoncée contre justesse observée, par tranche."""
    out: list[dict[str, Any]] = []
    for index in range(bins):
        low, high = index / bins, (index + 1) / bins
        chosen = [
            c for s, c in zip(scores, correct) if (low <= s < high or (index == bins - 1 and s == 1.0))
        ]
        if not chosen:
            continue
        out.append(
            {
                "range": [round(low, 2), round(high, 2)],
                "count": len(chosen),
                "observed": round(sum(1 for c in chosen if c) / len(chosen), 4),
            }
        )
    return out


# --- Persistance --------------------------------------------------------------


def save(model: Any, name: str, *, directory: Path | None = None) -> Path:
    torch = _torch()
    target = (directory or WEIGHTS_DIR)
    target.mkdir(parents=True, exist_ok=True)
    path = target / f"{name}.pt"
    torch.save({"config": model.config(), "state": model.state_dict()}, path)
    return path


def load(name: str, *, directory: Path | None = None) -> Any | None:
    torch = _torch()
    path = (directory or WEIGHTS_DIR) / f"{name}.pt"
    if not path.exists():
        return None
    payload = torch.load(path, map_location="cpu", weights_only=False)
    config = payload.get("config") or {}
    classes = config.get("classes") or list(FIGURE_IDS)
    # L'architecture est relue du fichier, pas des constantes du module : des
    # poids entraînés avec une autre profondeur doivent rester chargeables, et
    # une valeur par défaut qui bouge ne doit pas les rendre illisibles.
    if config.get("kind") == "gnn":
        from synchro.chartisme.models import gnn as G

        model = G.build(classes, **_shape_args(config, ("dim", "layers", "proj_dim")))
    else:
        from synchro.chartisme.models import svgformer as S

        model = S.build(
            classes,
            **_shape_args(
                config,
                ("dim", "heads", "path_layers", "group_layers", "proj_dim", "max_cmds", "max_paths"),
            ),
        )
    model.load_state_dict(payload["state"])
    model.eval()
    return model


def _shape_args(config: dict[str, Any], names: Sequence[str]) -> dict[str, Any]:
    """Hyperparamètres de forme présents dans le fichier, les autres par défaut."""
    return {name: config[name] for name in names if config.get(name) is not None}


def write_report(report: dict[str, Any], *, path: Path | None = None) -> Path:
    target = path or REPORT_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return target


def read_report(*, path: Path | None = None) -> dict[str, Any] | None:
    target = path or REPORT_PATH
    if not target.exists():
        return None
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


# --- Le tout ------------------------------------------------------------------


def run(
    dataset: dict[str, Any],
    *,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH,
    seed: int = 0,
    val_ratio: float = 0.2,
    abstain: float = DEFAULT_ABSTAIN,
    with_gnn: bool = True,
    with_dtw: bool = True,
    directory: Path | None = None,
    report_path: Path | None = None,
) -> dict[str, Any]:
    """Entraîne, mesure, compare, écrit le rapport.

    `directory` et `report_path` vont ensemble : un entraînement d'essai qui
    rangerait ses poids ailleurs tout en écrivant le rapport canonique
    laisserait `.chartisme/training.json` pointer vers des poids absents.
    """
    if report_path is None and directory is not None:
        report_path = directory / REPORT_PATH.name
    from synchro.chartisme.dataset import encode_all, split
    from synchro.chartisme.models import pyg_available, torch_available

    if not torch_available():
        raise RuntimeError("torch absent : ./launch install-chartisme")

    classes = list(dataset["classes"])
    train_samples, val_samples = split(
        dataset["samples"], val_ratio=val_ratio, seed=seed
    )
    if not val_samples:
        raise RuntimeError("jeu de validation vide")
    train_rows = encode_all(train_samples)
    val_rows = encode_all(val_samples)
    truth = [row["figure"] for row in val_rows]

    report: dict[str, Any] = {
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "classes": classes,
        "counts": dataset.get("counts"),
        "by_source": dataset.get("by_source"),
        "train_size": len(train_rows),
        "val_size": len(val_rows),
        "epochs": epochs,
        "models": {},
    }

    geo_top1, geo_top3 = geometric_predictions(val_samples)
    report["models"]["geometric"] = {
        "kind": "règle écrite à la main",
        **score(truth, geo_top1, classes, top3=geo_top3),
    }

    if with_dtw:
        report["models"]["dtw"] = {
            "kind": "plus proche voisin, sans apprentissage",
            **score(truth, dtw_predictions(train_samples, val_samples, seed=seed), classes),
        }

    trained = train_svgformer(
        train_rows,
        val_rows,
        classes,
        epochs=epochs,
        batch_size=batch_size,
        class_weights=dataset.get("class_weights"),
        seed=seed,
    )
    model = trained["model"]
    raw_top1, raw_top3, raw_scores = predict_svgformer(
        model, val_rows, classes, batch_size=batch_size
    )
    temperature = fit_temperature(raw_scores, [a == p for a, p in zip(truth, raw_top1)])
    cal_top1, cal_top3, cal_scores = predict_svgformer(
        model, val_rows, classes, batch_size=batch_size, temperature=temperature, abstain=abstain
    )
    report["models"]["svgformer"] = {
        "kind": "transformer hiérarchique",
        "parameters": sum(p.numel() for p in model.parameters()),
        "seconds": trained["seconds"],
        "history": trained["history"],
        "temperature": temperature,
        "abstain_below": abstain,
        "reliability": reliability(cal_scores, [a == p for a, p in zip(truth, cal_top1)]),
        **score(truth, raw_top1, classes, top3=raw_top3),
        "with_abstention": score(truth, cal_top1, classes, top3=cal_top3),
        "confusion": confusion(truth, raw_top1, classes),
        "weights": str(save(model, "svgformer", directory=directory)),
    }

    if with_gnn and pyg_available():
        from synchro.chartisme.models import gnn as G

        trained_gnn = train_gnn(
            train_rows,
            val_rows,
            classes,
            epochs=epochs,
            batch_size=batch_size,
            class_weights=dataset.get("class_weights"),
            seed=seed,
        )
        gnn_model = trained_gnn["model"]
        val_data = G.to_dataset(val_rows, classes)
        gnn_top1, gnn_top3, gnn_scores = predict_gnn(
            gnn_model, val_data, classes, batch_size=batch_size
        )
        gnn_temp = fit_temperature(gnn_scores, [a == p for a, p in zip(truth, gnn_top1)])
        report["models"]["gnn"] = {
            "kind": "GNN sur graphe de coordonnées",
            "parameters": sum(p.numel() for p in gnn_model.parameters()),
            "seconds": trained_gnn["seconds"],
            "history": trained_gnn["history"],
            "temperature": gnn_temp,
            **score(truth, gnn_top1, classes, top3=gnn_top3),
            "confusion": confusion(truth, gnn_top1, classes),
            "weights": str(save(gnn_model, "gnn", directory=directory)),
        }
    elif with_gnn:
        report["models"]["gnn"] = {"unavailable": "torch-geometric absent"}

    report["verdict"] = verdict(report["models"])
    write_report(report, path=report_path)
    return report


def verdict(models: dict[str, Any]) -> dict[str, Any]:
    """Les réseaux battent-ils la règle écrite à la main ?

    Formulé comme une question, et la réponse est affichée telle quelle même
    quand elle est non.
    """
    baseline = (models.get("geometric") or {}).get("macro_f1")
    rows: list[dict[str, Any]] = []
    for name in ("dtw", "svgformer", "gnn"):
        entry = models.get(name) or {}
        value = entry.get("macro_f1")
        if value is None or baseline is None:
            continue
        rows.append(
            {
                "model": name,
                "macro_f1": value,
                "gain": round(value - baseline, 4),
                "better": value > baseline,
            }
        )
    best = max(rows, key=lambda row: row["macro_f1"], default=None)
    return {
        "baseline": "geometric",
        "baseline_macro_f1": baseline,
        "comparison": rows,
        "best": None if best is None else best["model"],
        "networks_earn_their_place": bool(
            best and best["model"] in ("svgformer", "gnn") and best["better"]
        ),
    }
