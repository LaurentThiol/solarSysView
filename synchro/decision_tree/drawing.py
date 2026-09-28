"""Un seul dessin : dtreeviz. Sans `dot`, le cadre reçoit le texte de l'arbre."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from sklearn.tree import DecisionTreeClassifier


PAPER = "#f4f1ea"
POSITIVE = "#2f8f6b"
NEGATIVE = "#8d8a84"


def _colors() -> dict[str, Any]:
    return {
        "classes": [None, None, [NEGATIVE, POSITIVE]],
        "highlight": POSITIVE,
    }


def render_trees(
    clf: DecisionTreeClassifier,
    x_train: np.ndarray,
    y_train: np.ndarray,
    feature_names: list[str],
    class_names: list[str],
    *,
    case: list[float] | None,
    title: str,
    tree_path: Path,
    case_path: Path,
) -> dict[str, Any]:
    text_fallback = None
    try:
        svg = _dtreeviz_svg(
            clf,
            x_train,
            y_train,
            feature_names,
            class_names,
            title=title,
            case=None,
            just_path=False,
        )
        tree_path.write_text(svg, encoding="utf-8")
        case_svg = None
        path_svg = None
        if case is not None:
            case_svg = _dtreeviz_svg(
                clf,
                x_train,
                y_train,
                feature_names,
                class_names,
                title=title,
                case=case,
                just_path=False,
            )
            case_path.write_text(case_svg, encoding="utf-8")
            try:
                path_svg = _dtreeviz_svg(
                    clf,
                    x_train,
                    y_train,
                    feature_names,
                    class_names,
                    title=title,
                    case=case,
                    just_path=True,
                )
                case_path.with_name("path.svg").write_text(path_svg, encoding="utf-8")
            except Exception:
                path_svg = None
        return {
            "engine": "dtreeviz",
            "tree_svg": svg,
            "case_svg": case_svg,
            "path_svg": path_svg,
            "tree_text": None,
        }
    except Exception as exc:
        text_fallback = str(exc)
    from synchro.decision_tree.rules import tree_text

    text = tree_text(clf, feature_names)
    return {
        "engine": "text",
        "tree_svg": None,
        "case_svg": None,
        "path_svg": None,
        "tree_text": text,
        "drawing_error": text_fallback,
    }


def render_just_path(
    clf: DecisionTreeClassifier,
    x_train: np.ndarray,
    y_train: np.ndarray,
    feature_names: list[str],
    class_names: list[str],
    case: list[float],
    *,
    title: str,
) -> str | None:
    try:
        return _dtreeviz_svg(
            clf,
            x_train,
            y_train,
            feature_names,
            class_names,
            title=title,
            case=case,
            just_path=True,
        )
    except Exception:
        return None


def _dtreeviz_svg(
    clf: DecisionTreeClassifier,
    x_train: np.ndarray,
    y_train: np.ndarray,
    feature_names: list[str],
    class_names: list[str],
    *,
    title: str,
    case: list[float] | None,
    just_path: bool,
) -> str:
    import matplotlib

    try:
        if matplotlib.get_backend().lower() != "agg":
            matplotlib.use("Agg", force=True)
    except Exception:
        pass
    from dtreeviz import model

    y_int = np.asarray(y_train, dtype=int)
    viz = model(
        clf,
        np.asarray(x_train, dtype=float),
        y_int,
        target_name=title,
        feature_names=list(feature_names),
        class_names=list(class_names),
    )
    kwargs: dict[str, Any] = {
        "fancy": True,
        "leaftype": "barh",
        "histtype": "barstacked",
        "show_node_labels": True,
        "precision": 2,
        "title": title,
        "colors": _colors(),
        "scale": 1.0,
    }
    if case is not None:
        kwargs["x"] = np.asarray(case, dtype=float)
        kwargs["show_just_path"] = just_path
    view = viz.view(**kwargs)
    svg = view.svg()
    if isinstance(svg, bytes):
        svg = svg.decode("utf-8")
    return _annotate_node_ids(svg, clf)


def _annotate_node_ids(svg: str, clf: DecisionTreeClassifier) -> str:
    ids = " ".join(str(i) for i in range(clf.tree_.node_count))
    note = f'<desc id="decision-tree-nodes">{ids}</desc>'
    if svg.startswith("<?xml"):
        end = svg.find("?>")
        return svg[: end + 2] + note + svg[end + 2 :]
    return note + svg
