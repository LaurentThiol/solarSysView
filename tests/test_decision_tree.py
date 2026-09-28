"""decisionTree : preuve par remaniement, feuilles, dessin, tâches, menu."""

from __future__ import annotations

import textwrap
import time
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_picture_keeps_the_holdout_on_a_band_edge() -> None:
    from synchro.decision_tree.questions import band_edges, holdout_cut, picture

    edges = band_edges(1200, 1199, 64)
    assert edges[0][0] == 0
    assert edges[-1][1] == 1200
    assert sum(end - start for start, end in edges) == 1200
    assert all(right == nxt for (_, right), (nxt, _) in zip(edges, edges[1:]))
    assert any(start == 1199 for start, _ in edges)
    assert len(edges) <= 64

    n, width = 250, 3
    matrix = np.arange(n * width, dtype=float).reshape(n, width)
    labels = (np.arange(n) % 2).astype(float)
    packed = {
        "question": "shape",
        "label": "sum_high",
        "series": None,
        "x": matrix,
        "y": labels,
        "raw": labels * 10,
        "dates": [f"2020-01-{(index % 28) + 1:02d}" for index in range(n)],
        "feature_names": ["sum.last", "sum.step", "n1.z20"],
        "class_names": ["somme basse", "somme haute"],
        "threshold": 140.0,
        "sense": "ge",
    }
    view = picture(packed, limit=10)
    cut = holdout_cut(n)
    assert view["rows"] == n
    assert view["columns"] == 3
    assert view["train_n"] == cut
    assert view["holdout_n"] == n - cut
    assert view["bands"][0]["start"] == 0
    assert view["bands"][-1]["end"] == n
    assert view["bands"][view["cut_band"]]["start"] == cut
    assert all(view["bands"][i]["end"] == view["bands"][i + 1]["start"] for i in range(len(view["bands"]) - 1))
    start, end = view["bands"][0]["start"], view["bands"][0]["end"]
    assert view["bands"][0]["values"][0] == round(float(matrix[start:end, 0].mean()), 4)
    assert view["tail"][-1]["date"] == packed["dates"][-1]
    assert view["tail"][-1]["holdout"] is True
    assert view["features"][0] == {
        "name": "sum.last",
        "label": "somme · dernière",
        "group": "somme",
        "measure": "dernière",
    }
    assert "somme" in view["phrase"]
    assert "retard" not in view["features"][0]["label"]


def test_shape_picture_is_the_question_table() -> None:
    from synchro.decision_tree.questions import build_shape, holdout_cut, picture, question_picture

    rng = np.random.default_rng(7)
    rows = []
    for index in range(90):
        numbers = sorted(int(n) for n in rng.choice(np.arange(1, 51), size=5, replace=False))
        rows.append(
            {
                "draw_date": date(2016, 1, 1) + timedelta(days=index),
                "numbers": numbers,
                "stars": [1, 2],
                "star_pool": 12,
                "weekday": "mardi" if index % 2 == 0 else "vendredi",
            }
        )
    packed = build_shape(rows, label="parity_high", include_stars=False)
    view = picture(packed)
    assert view["question"] == "shape"
    assert view["rows"] == len(packed["y"])
    assert view["rows"] > 0
    assert view["train_n"] == holdout_cut(len(packed["y"]))
    assert view["bands"][view["cut_band"]]["start"] == view["train_n"]
    names = [item["name"] for item in view["features"]]
    assert "parity.last" in names
    assert "sum.step" in names
    assert not any(name.startswith(("star_", "e1", "e2")) for name in names)
    again = question_picture(rows, "shape", label="parity_high", include_stars=False)
    cached = question_picture(rows, "shape", label="parity_high", include_stars=False)
    assert cached is again
    assert again["rows"] == view["rows"]
    narrow = question_picture(
        rows,
        "shape",
        label="parity_high",
        include_stars=False,
        measures=["last"],
        windows="fixed",
    )
    narrow_names = [item["name"] for item in narrow["features"]]
    assert narrow_names
    assert all(name.endswith(".last") for name in narrow_names)


def test_picture_shows_the_usual_period_while_the_search_keeps_the_grid() -> None:
    from synchro.decision_tree.questions import build_shape, picture

    rng = np.random.default_rng(11)
    rows = []
    for index in range(420):
        numbers = sorted(int(n) for n in rng.choice(np.arange(1, 51), size=5, replace=False))
        rows.append(
            {
                "draw_date": date(2016, 1, 1) + timedelta(days=index),
                "numbers": numbers,
                "stars": [1, 2],
                "star_pool": 12,
                "weekday": "mardi" if index % 2 == 0 else "vendredi",
            }
        )
    packed = build_shape(rows, measures=["last", "z20", "rsi"], windows="learned")
    assert any("@" in name for name in packed["feature_names"])
    view = picture(packed)
    names = [item["name"] for item in view["features"]]
    assert "sum.z20" in names
    assert "sum.rsi" in names
    assert "sum.last" in names
    assert not any("@" in name for name in names)
    assert not any(name.endswith(".step") for name in names)
    assert view["columns"] == len(names)


def test_feature_labels_reserve_retard_for_balls() -> None:
    from synchro.decision_tree.questions import feature_label

    assert feature_label("sum.step") == "somme · pas"
    assert feature_label("sum.last") == "somme · dernière"
    assert feature_label("n1.slope") == "n1 · pente"
    assert "retard" not in feature_label("parity.last")
    assert feature_label("ball.delay") == "boule · retard"


def _rank_draws(n: int, *, pools: list[int] | None = None) -> list[dict]:
    rows = []
    for index in range(n):
        pool = 12 if pools is None else pools[index % len(pools)]
        rows.append(
            {
                "draw_date": date(2016, 1, 1) + timedelta(days=index),
                "numbers": [1 + (index % 5), 10, 20, 30, 40],
                "stars": [1 + (index % 3), 8],
                "star_pool": pool,
                "weekday": "mardi" if index % 2 == 0 else "vendredi",
            }
        )
    return rows


def test_series_catalog_offers_ranks_and_stars() -> None:
    from synchro.decision_tree.questions import build_series, catalog

    questions = {item["id"]: item for item in catalog()["questions"]}
    offered = questions["series"]["series"]
    for name in ("n2", "n3", "n4", "n5", "e1", "e2"):
        assert name in offered
    assert "g1" not in offered

    draws = _rank_draws(8)
    n3 = build_series(draws, series="n3")
    assert n3["question"] == "series"
    assert n3["label"] == "n3"
    assert n3["class_names"] == ["n3 basse", "n3 haute"]
    e1 = build_series(draws, series="e1")
    assert e1["label"] == "e1"
    assert e1["class_names"] == ["e1 basse", "e1 haute"]
    assert build_series(draws, series="g1")["label"] == "g1"

    with pytest.raises(ValueError, match="urne"):
        build_series(_rank_draws(8, pools=[9, 12]), series="e2")
    assert build_series(_rank_draws(8, pools=[9, 12]), series="n5")["label"] == "n5"
    with pytest.raises(ValueError, match="Série inconnue"):
        build_series(draws, series="star_sum")


def test_json_walker_and_chartisme_rows() -> None:
    from synchro.decision_tree.predict import predict_row
    from synchro.decision_tree.questions import chartisme_matrix

    tree = {
        "nodes": [
            {"id": 0, "feature": 0, "threshold": 18.0, "left": 1, "right": 2, "value": [1, 1]},
            {"id": 1, "feature": -1, "threshold": -2.0, "left": -1, "right": -1, "value": [8, 2]},
            {"id": 2, "feature": -1, "threshold": -2.0, "left": -1, "right": -1, "value": [1, 9]},
        ]
    }
    pred = predict_row(tree, [20.0], ["sum.step"])
    assert pred["leaf"] == 2
    assert pred["predicted"] == 1
    packed = chartisme_matrix(
        [
            {
                "status": "reached",
                "confidence": 0.8,
                "activity_ratio": 1.2,
                "length": 12,
                "direction": "up",
                "curve": "sum",
                "figure": "triangle",
                "weekday": "mardi",
                "date": f"2024-01-{day:02d}",
            }
            for day in range(1, 30)
        ]
    )
    assert packed["x"].shape[0] == 29
    assert packed["null"] == "shuffle_labels"
    assert "curve_sum" in packed["feature_names"]


def test_draft_keeps_only_the_series_indicators() -> None:
    from synchro.decision_tree.draft import draft_specialists

    report = {
        "question": "shape",
        "label": "sum_high",
        "series": None,
        "slug": "shape-sum-test",
        "threshold": 140.0,
        "rules": [
            {
                "positive": True,
                "weak": False,
                "class_name": "somme haute",
                "path": [
                    {"feature": "sum.last", "text": "somme · dernière > 140.00"},
                    {"feature": "sum.slope", "text": "somme · pente > 1.00"},
                    {"feature": "sum.step", "text": "somme · pas > 18.00"},
                    {"feature": "n1.z20", "text": "n1 · z20 > 0.50"},
                ],
            }
        ],
    }
    drafts = {item["target"]: item for item in draft_specialists(report)}
    assert drafts["sum"]["task"] == "binary"
    assert drafts["sum"]["origin"] == "shape-sum-test"
    assert drafts["sum"]["indicators"] == ["lag1", "slope"]
    assert "step" not in drafts["sum"]["indicators"]
    assert drafts["n1"]["indicators"] == ["zscore"]
    assert "spread" not in drafts
    assert "somme · pas > 18.00" in drafts["sum"]["instructions"]


def _draws(n: int, rng: np.random.Generator, numbers_of) -> list[dict]:
    rows = []
    for index in range(n):
        rows.append(
            {
                "draw_date": date(2016, 1, 1) + timedelta(days=index),
                "numbers": numbers_of(index),
                "stars": [1, 2],
                "star_pool": 12,
                "weekday": "mardi" if index % 2 == 0 else "vendredi",
            }
        )
    return rows


def test_autoregressive_flux_beats_the_null() -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree.search import prove

    rng = np.random.default_rng(0)
    level = 0.0
    levels = []
    for _ in range(280):
        level = 0.92 * level + float(rng.normal())
        levels.append(level)
    levels_arr = np.array(levels)

    def pack(series: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        x = series[:-1].reshape(-1, 1)
        y = (series[1:] > 0).astype(float)
        return x, y

    x, y = pack(levels_arr)
    proof = prove(
        x,
        y,
        rebuild=lambda gen: pack(gen.permutation(levels_arr)),
        permutations=19,
        seed=1,
        max_depth=2,
        criteria=("gini",),
        class_weight=None,
        null="shuffle_draws",
    )
    assert proof["holdout_score"] > 0.6
    assert proof["p"] <= 0.05
    assert proof["beats_independence"] is True


def test_mean_reversion_beats_half_but_not_the_null() -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree.reading import verdict_text
    from synchro.decision_tree.search import prove

    rng = np.random.default_rng(2)

    def draws(gen: np.random.Generator) -> list[dict]:
        rows = []
        for index in range(260):
            numbers = sorted(int(n) for n in gen.choice(np.arange(1, 51), size=5, replace=False))
            rows.append(
                {
                    "draw_date": date(2016, 1, 1) + timedelta(days=index),
                    "numbers": numbers,
                    "stars": [1, 2],
                    "star_pool": 12,
                }
            )
        return rows

    def pack(rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
        sums = np.array([sum(row["numbers"]) for row in rows], dtype=float)
        x = sums[:-1].reshape(-1, 1)
        y = (sums[1:] > sums[:-1]).astype(float)
        return x, y

    real_draws = draws(rng)
    x, y = pack(real_draws)
    proof = prove(
        x,
        y,
        rebuild=lambda gen: pack(draws(gen)),
        permutations=19,
        seed=3,
        max_depth=2,
        criteria=("gini",),
        class_weight=None,
        null="shuffle_draws",
    )
    assert proof["holdout_score"] > 0.55
    assert proof["beats_independence"] is False
    assert proof["p"] > 0.05
    text = verdict_text(proof["holdout_score"], proof["null_mean"], proof["p"], False)
    assert text.startswith("Aucun seuil de flux")


def test_permutation_replays_the_search() -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree.search import prove

    rng = np.random.default_rng(4)
    x = rng.normal(size=(80, 2))
    y = (x[:, 0] > 0).astype(float)
    proof = prove(
        x,
        y,
        rebuild=lambda _gen: (x, y),
        permutations=3,
        seed=0,
        max_depth=2,
        criteria=("gini",),
        class_weight=None,
        null="shuffle_draws",
    )
    assert proof["permutations"] == 3
    assert proof["permutation_fits"] == 3 * proof["search_fits"]
    assert proof["search_fits"] > 1


def test_holdout_does_not_choose_the_depth() -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree.search import fit_holdout

    rng = np.random.default_rng(5)
    x = rng.normal(size=(90, 2))
    y = (x[:, 0] > 0).astype(float)
    first = fit_holdout(x, y, max_depth=3, criteria=("gini",), seed=0)
    flipped = y.copy()
    flipped[first["cut"] :] = 1.0 - flipped[first["cut"] :]
    second = fit_holdout(x, flipped, max_depth=3, criteria=("gini",), seed=0)
    assert first["params"]["max_depth"] == second["params"]["max_depth"]
    assert first["params"]["criterion"] == second["params"]["criterion"]
    assert first["params"]["min_samples_leaf"] == second["params"]["min_samples_leaf"]


def test_each_leaf_has_train_and_holdout_counts() -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree.questions import feature_labels
    from synchro.decision_tree.rules import export_rules
    from synchro.decision_tree.search import fit_holdout

    rng = np.random.default_rng(6)
    x = rng.normal(size=(120, 2))
    y = (x[:, 0] + 0.2 * rng.normal(size=120) > 0).astype(float)
    fitted = fit_holdout(x, y, max_depth=3, criteria=("gini",), seed=0)
    names = ["sum.last", "sum.step"]
    rules = export_rules(
        fitted["clf"],
        names,
        feature_labels(names),
        ["basse", "haute"],
        fitted["x_train"],
        fitted["y_train"],
        fitted["x_test"],
        fitted["y_test"],
        null_mean=0.5,
    )
    assert rules
    assert sum(rule["train_n"] for rule in rules) == len(fitted["y_train"])
    assert sum(rule["holdout_n"] for rule in rules) == len(fitted["y_test"])
    assert all(rule["train_rate"] is not None for rule in rules)
    assert all("holdout_rate" in rule for rule in rules)


def test_drawing_svg_or_text_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree.drawing import render_trees
    from synchro.decision_tree.rules import export_rules
    from synchro.decision_tree.search import fit_holdout

    rng = np.random.default_rng(7)
    x = rng.normal(size=(80, 1))
    y = (x[:, 0] > 0).astype(float)
    fitted = fit_holdout(x, y, max_depth=2, criteria=("gini",), seed=0)
    names = ["somme · pas"]

    def boom(*_args, **_kwargs):
        raise RuntimeError("dot absent")

    monkeypatch.setattr("synchro.decision_tree.drawing._dtreeviz_svg", boom)
    fallen = render_trees(
        fitted["clf"],
        fitted["x_train"],
        fitted["y_train"],
        names,
        ["basse", "haute"],
        case=[0.2],
        title="somme",
        tree_path=tmp_path / "tree.svg",
        case_path=tmp_path / "case.svg",
    )
    assert fallen["engine"] == "text"
    assert fallen["tree_svg"] is None
    assert "somme · pas" in fallen["tree_text"]
    rules = export_rules(
        fitted["clf"],
        ["sum.step"],
        {"sum.step": "somme · pas"},
        ["basse", "haute"],
        fitted["x_train"],
        fitted["y_train"],
        fitted["x_test"],
        fitted["y_test"],
        null_mean=0.5,
    )
    assert rules

    monkeypatch.undo()
    pytest.importorskip("dtreeviz")
    import shutil

    if shutil.which("dot") is None:
        pytest.skip("dot absent")
    drawn = render_trees(
        fitted["clf"],
        fitted["x_train"],
        fitted["y_train"],
        names,
        ["basse", "haute"],
        case=[0.2],
        title="somme",
        tree_path=tmp_path / "tree.svg",
        case_path=tmp_path / "case.svg",
    )
    assert drawn["engine"] == "dtreeviz"
    svg = drawn["tree_svg"]
    assert 'id="decision-tree-nodes"' in svg
    for rule in rules:
        assert str(rule["node"]) in svg.split('id="decision-tree-nodes">', 1)[1].split("<", 1)[0]


def test_job_reports_steps_and_cancels(monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree import jobs

    def slow(_draws, on_progress=None, **_kwargs):
        assert on_progress is not None
        on_progress("tableau", 0, 1)
        on_progress("recherche", 0, 1)
        for k in range(40):
            time.sleep(0.02)
            on_progress("remaniements", k, 40)
        on_progress("dessin", 0, 1)
        return {"slug": "lent"}

    monkeypatch.setattr(jobs, "read_flux", slow)
    jobs._CURRENT = None
    job = jobs.start_job([{"draw_date": "2024-01-01"}], question="shape")
    seen = None
    for _ in range(50):
        status = jobs.job_status(job["id"])
        if status and status.get("stage") == "remaniements" and (status.get("k") or 0) > 0:
            seen = status
            break
        time.sleep(0.02)
    assert seen is not None
    assert seen["n"] == 40
    assert jobs.cancel_job(job["id"]) is True
    final = None
    for _ in range(50):
        final = jobs.job_status(job["id"])
        if final and final["status"] == "cancelled":
            break
        time.sleep(0.02)
    assert final is not None and final["status"] == "cancelled"


def test_menu_addresses_and_page() -> None:
    nav = (ROOT / "src/lib/nav.ts").read_text(encoding="utf-8")
    addresses = (ROOT / "src/lib/addresses.ts").read_text(encoding="utf-8")
    page = (ROOT / "src/app/brain/decision-tree/page.tsx").read_text(encoding="utf-8")
    assert 'label: "decisionTree"' in nav
    assert 'href: "/brain/decision-tree"' in nav
    special = nav.index('href: "/brain/specialistes"')
    tree = nav.index('href: "/brain/decision-tree"')
    dictionary = nav.index('href: "/brain/dictionnaire"')
    assert special < tree < dictionary
    assert "/brain/decision-tree" in addresses
    assert "/api/brain/decision-tree" in addresses
    assert "/api/brain/decision-tree/tableau" in addresses
    assert "decisionTree" in page


def test_launch_installs_decision_tree_without_blocking(tmp_path: Path) -> None:
    import os
    import subprocess

    launch = (ROOT / "launch").read_text(encoding="utf-8")
    body = launch.split("ensure_install() {", 1)[1].split("\nlockfile=", 1)[0]
    assert "ensure_decision_tree" in body
    assert "cmd_install_decision_tree" in launch
    script = textwrap.dedent(
        """\
        set -euo pipefail
        source "$REPO/launch"
        ROOT="$SANDBOX"
        mkdir -p "$ROOT/.venv/bin" "$ROOT/bin"
        cp "$REPO/requirements-decision-tree.txt" "$ROOT/requirements-decision-tree.txt"
        cat > "$ROOT/.venv/bin/python" << 'PY'
        #!/usr/bin/env bash
        if [[ "$1" == "-c" ]]; then
          exit "${IMPORT_EXIT:-0}"
        fi
        if [[ "$1" == "-m" && "$2" == "pip" ]]; then
          echo pip >> "${PIP_LOG}"
          exit "${PIP_EXIT:-0}"
        fi
        exit 0
        PY
        chmod +x "$ROOT/.venv/bin/python"
        cat > "$ROOT/bin/apt-get" << 'PY'
        #!/bin/sh
        echo apt >> "$APT_LOG"
        exit 1
        PY
        cat > "$ROOT/bin/sudo" << 'PY'
        #!/bin/sh
        echo sudo >> "$APT_LOG"
        exit 1
        PY
        chmod +x "$ROOT/bin/apt-get" "$ROOT/bin/sudo"
        command() {
          if [[ "$1" == "-v" && "$2" == "dot" ]]; then
            return 1
          fi
          builtin command "$@"
        }
        export PATH="$ROOT/bin:/usr/bin:/bin"
        export PIP_LOG="$ROOT/pip.log"
        export APT_LOG="$ROOT/apt.log"
        : > "$PIP_LOG"
        : > "$APT_LOG"
        hash="$(file_hash "$ROOT/requirements-decision-tree.txt")"
        printf '%s\\n' "$hash" > "$ROOT/.venv/.synchro-decision-tree.cksum"
        FORCE_INSTALL=0
        IMPORT_EXIT=0
        PIP_EXIT=0
        ensure_decision_tree
        if [[ -s "$PIP_LOG" ]]; then
          echo "pip should not rerun" >&2
          exit 2
        fi
        if ! grep -Eq 'apt|sudo' "$APT_LOG"; then
          echo "dot install was not attempted" >&2
          exit 3
        fi
        IMPORT_EXIT=1
        PIP_EXIT=1
        ensure_decision_tree
        echo ok
        """
    )
    env = os.environ.copy()
    env["REPO"] = str(ROOT)
    env["SANDBOX"] = str(tmp_path)
    result = subprocess.run(
        ["bash", "-c", script],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_scaled_feature_labels_keep_retard_for_balls() -> None:
    from synchro.decision_tree.questions import feature_label

    assert feature_label("sum.zscore@13") == "somme · z-score 13"
    assert feature_label("sum.rsi@9") == "somme · RSI 9"
    assert feature_label("spread.range@13") == "étendue · amplitude 13"
    assert "retard" not in feature_label("sum.zscore@13")
    assert "retard" not in feature_label("sum.rsi")


def test_parity_candidates_and_fixed_median() -> None:
    from synchro.decision_tree.questions import (
        build_shape,
        class_names,
        cut_candidates,
        holdout_cut,
        label_phrase,
    )

    raw = np.array([0, 1, 2, 3, 4, 5] * 20, dtype=float)
    assert cut_candidates(raw, "parity") == [2.0, 3.0, 4.0]
    assert cut_candidates(raw, "parity_high") == [2.0, 3.0, 4.0]
    assert label_phrase("shape", "parity_high", threshold=4) == "le tirage t a au moins 4 numéros pairs"
    assert class_names("shape", "parity_high", threshold=4) == ["parité < 4", "parité ≥ 4"]
    rng = np.random.default_rng(8)
    draws = _draws(90, rng, lambda index: [1, 2, 3, 4, 5 + (index % 20)])
    packed = build_shape(
        draws,
        measures=["last"],
        windows="fixed",
        label_cut="fixed",
        include_stars=False,
    )
    cut = holdout_cut(len(packed["raw"]))
    assert packed["label_cut"] == "fixed"
    assert packed["threshold"] == pytest.approx(float(np.median(packed["raw"][:cut])))


def test_window_grid_respects_floor_and_cap() -> None:
    from synchro.decision_tree.measures import periods_for

    assert periods_for("z20", "learned", 100) == [8]
    assert min(periods_for("z20", "learned", 2000)) >= 8
    assert periods_for("z20", "learned", 200) == [8, 13]
    assert periods_for("z20", "fixed", 200) == [20]
    assert periods_for("last", "learned", 2000) == [None]
    assert 34 in periods_for("slope", "learned", 2000)
    assert periods_for("macd", "learned", 2000) == [13, 26, 39]
    assert periods_for("macd", "learned", 200) == [13]


def test_vectorized_measures_match_the_reference() -> None:
    from synchro.brain_specialists.features import series_matrix
    from synchro.decision_tree.measures import (
        MEASURE_CATALOG,
        compute_column,
        periods_for,
        reference_column,
    )

    values = np.random.default_rng(1).normal(size=220)
    listed = values.tolist()
    for spec in MEASURE_CATALOG:
        for period in periods_for(spec["id"], "learned", 5000):
            got = compute_column(values, spec["id"], period)
            ref = reference_column(listed, spec["id"], period)
            assert np.allclose(got, ref, equal_nan=True, rtol=1e-6, atol=1e-6), spec["id"]
    matrix = series_matrix(listed, ["lag1", "zscore", "slope", "rsi", "range8"])
    paired = {
        0: ("last", None),
        1: ("z20", 20),
        2: ("slope", 10),
        3: ("rsi", 14),
        4: ("range8", 8),
    }
    for column, (measure, period) in paired.items():
        got = compute_column(values, measure, period)
        assert np.allclose(got, matrix[:, column], equal_nan=True, rtol=1e-6, atol=1e-6)


def test_shape_catalog_names_rsi_and_rejects_unknown() -> None:
    from synchro.decision_tree.questions import build_shape

    rng = np.random.default_rng(9)
    draws = _draws(80, rng, lambda index: [1, 2, 3, 4, 6 + (index % 10)])
    packed = build_shape(
        draws,
        measures=["rsi", "last"],
        windows="fixed",
        label_cut="fixed",
        include_stars=False,
    )
    assert "sum.rsi" in packed["feature_names"]
    assert "n1.rsi" in packed["feature_names"]
    with pytest.raises(ValueError, match="Indicateur inconnu"):
        build_shape(draws, measures=["nope"])


def test_holdout_does_not_choose_the_label_cut() -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree.search import fit_holdout

    rng = np.random.default_rng(11)
    raw = rng.normal(size=360)
    y = (raw >= np.median(raw)).astype(float)
    x = ((raw >= np.quantile(raw, 0.7)).astype(float) + rng.normal(scale=0.05, size=360)).reshape(-1, 1)
    kwargs = dict(
        raw=raw,
        label_cut="learned",
        label_kind="sum",
        label_sense="ge",
        max_depth=2,
        criteria=("gini",),
        seed=0,
        class_weight="balanced",
    )
    first = fit_holdout(x, y, **kwargs)
    q70 = float(np.quantile(raw[: first["cut"]], 0.7))
    assert first["label_threshold"] == pytest.approx(q70)
    y_fixed = (raw >= np.median(raw[: first["cut"]])).astype(float)
    fixed = fit_holdout(x, y_fixed, max_depth=2, criteria=("gini",), seed=0)
    assert first["holdout_score"] > fixed["holdout_score"]
    flipped = raw.copy()
    flipped[first["cut"] :] += 50
    second = fit_holdout(x, y, **{**kwargs, "raw": flipped})
    assert second["label_threshold"] == pytest.approx(first["label_threshold"])


def test_learned_cut_is_replayed_in_each_permutation() -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree.search import prove

    rng = np.random.default_rng(12)
    raw = rng.normal(size=80)
    x = np.column_stack([raw, rng.normal(size=80)])
    y = (raw > 0).astype(float)
    proof = prove(
        x,
        y,
        raw=raw,
        label_cut="learned",
        label_kind="sum",
        label_sense="ge",
        rebuild=lambda gen: (x, gen.permutation(raw)),
        permutations=3,
        seed=0,
        max_depth=2,
        criteria=("gini",),
        class_weight="balanced",
        null="shuffle_draws",
    )
    assert proof["permutations"] == 3
    assert proof["permutation_fits"] == 3 * proof["search_fits"]


def test_window_follows_the_scale_of_the_signal() -> None:
    pytest.importorskip("sklearn")
    from synchro.decision_tree.measures import compute_column
    from synchro.decision_tree.windows import select_windows

    rng = np.random.default_rng(0)
    base = rng.normal(size=420)
    periods = (5, 8, 20, 34)
    names = ["sum.sma@5", "sum.sma@8", "sum.sma", "sum.sma@34"]
    columns = [compute_column(base, "sma", period) for period in periods]
    matrix = np.column_stack(columns)
    finite = np.isfinite(matrix).all(axis=1)
    matrix = matrix[finite]
    short = select_windows(matrix, columns[0][finite], names, train_end=len(matrix) - 80, min_leaf=20)
    assert short[1][0]["period"] == 5
    flipped = columns[0][finite].copy()
    flipped[len(matrix) - 80 :] *= -1
    again = select_windows(matrix, flipped, names, train_end=len(matrix) - 80, min_leaf=20)
    assert again[1][0]["period"] == 5
    long = select_windows(matrix, columns[-1][finite], names, train_end=len(matrix), min_leaf=20)
    assert long[1][0]["period"] == 34
    tied = np.column_stack([base[:300], base[:300], base[:300]])
    flat = select_windows(
        tied,
        rng.normal(size=300),
        ["sum.sma@5", "sum.sma", "sum.sma@34"],
        train_end=300,
        min_leaf=15,
    )
    assert flat[1][0]["period"] == 20
    assert flat[1][0]["kept"] == "sum.sma"


def test_draft_keeps_rsi_and_mentions_a_different_window() -> None:
    from synchro.decision_tree.draft import draft_specialists

    report = {
        "question": "shape",
        "label": "sum_high",
        "label_cut": "learned",
        "threshold": 160.0,
        "specialist_threshold": 140.0,
        "series": None,
        "slug": "shape-rsi",
        "windows": [
            {
                "label": "somme · RSI",
                "period": 9,
                "default": 14,
                "kept": "sum.rsi@9",
                "changed": True,
            }
        ],
        "rules": [
            {
                "positive": True,
                "weak": False,
                "class_name": "somme haute",
                "path": [{"feature": "sum.rsi@9", "text": "somme · RSI 9 > 60.00"}],
            }
        ],
    }
    drafts = {item["target"]: item for item in draft_specialists(report)}
    assert drafts["sum"]["indicators"] == ["rsi"]
    assert "160.00" in drafts["sum"]["instructions"]
    assert "140.00" in drafts["sum"]["instructions"]
    assert "somme · RSI sur 9" in drafts["sum"]["instructions"]
    assert "le spécialiste sur 14" in drafts["sum"]["instructions"]


def test_rule_view_node() -> None:
    import subprocess

    script = ROOT / "tests" / "test_decision_tree_view.ts"
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--test", str(script)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
