"""decisionTree : preuve par remaniement, feuilles, dessin, tâches, menu."""

from __future__ import annotations

import textwrap
import time
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_feature_labels_reserve_retard_for_balls() -> None:
    from synchro.decision_tree.questions import feature_label

    assert feature_label("sum.step") == "somme · pas"
    assert feature_label("sum.last") == "somme · dernière"
    assert feature_label("n1.slope") == "n1 · pente"
    assert "retard" not in feature_label("parity.last")
    assert feature_label("ball.delay") == "boule · retard"


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
