from synchro.morpho.board import cell_center, number_cell, numbers_origin, pixel_to_norm
from synchro.morpho import vlm as vlm_mod
from synchro.morpho.vlm import (
    INSTALL_HINT,
    analyze,
    backend_order,
    geometry_queries,
    grounding_score,
    load,
    parse_label,
    project_points,
    status,
    unload,
)


def test_parse_label() -> None:
    assert parse_label("The cluster is compact and tight", "compact|spread|mixed") == "compact"
    assert parse_label("yes they line up", "yes|no") == "yes"
    assert parse_label("unclear", "adjacent|apart|unclear") == "unclear"
    assert parse_label("nothing useful", "yes|no") is None


def test_grounding_and_projection() -> None:
    assert grounding_score([1, 2, 3], [1, 2, 3]) == 1.0
    assert grounding_score([1, 2], [1, 2, 3]) == 2 / 3
    assert grounding_score([], [1]) == 0.0
    n = 7
    row, col = number_cell(n)
    cx, cy = cell_center(numbers_origin(), row, col)
    x, y = pixel_to_norm(cx, cy)
    assert project_points([{"x": x, "y": y}], kind="number") == [n]


def test_analyze_without_backend_uses_geometry() -> None:
    state = analyze([1, 2, 3, 4, 5], [1, 2])
    assert state["vlm"] is False
    assert state["backend"] is None
    assert "align_h" in state["motifs"]
    queries = geometry_queries(state)
    assert queries["collinear"] == "yes"
    assert queries["stars"] == "adjacent"
    assert status()["loaded"] is False
    assert "prompt_id" in status()


def test_backend_order_skips_gguf_unless_configured(monkeypatch) -> None:
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    assert backend_order() == ["transformers", "photon"]
    monkeypatch.setenv("MORPHO_GGUF_PATH", "/tmp/missing.gguf")
    assert backend_order()[-1] == "gguf"
    assert backend_order("photon") == ["photon"]


def test_load_without_backends_is_actionable(monkeypatch) -> None:
    unload()
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    monkeypatch.setenv("MORPHO_VLM_NO_INSTALL", "1")

    def missing_transformers() -> dict:
        raise ModuleNotFoundError("No module named 'transformers'")

    def missing_photon() -> dict:
        raise ModuleNotFoundError("No module named 'moondream'")

    monkeypatch.setattr("synchro.morpho.vlm._load_transformers", missing_transformers)
    monkeypatch.setattr("synchro.morpho.vlm._load_photon", missing_photon)
    try:
        load(install=False)
    except RuntimeError as exc:
        msg = str(exc)
        assert "aucun backend VLM local" in msg
        assert "install-vlm" in msg
        assert "MORPHO_GGUF_PATH" not in msg
        assert "gguf:" not in msg
        assert INSTALL_HINT.split(".")[0] in msg
        return
    raise AssertionError("load() aurait dû échouer sans backend")


def test_probe_requires_accelerate_for_transformers(monkeypatch) -> None:
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)

    def partial(name: str) -> bool:
        return name in {"transformers", "torch", "einops"}

    monkeypatch.setattr(vlm_mod, "_module_available", partial)
    assert vlm_mod._probe_available() == []

    def complete(name: str) -> bool:
        return name in {"transformers", "torch", "einops", "accelerate"}

    monkeypatch.setattr(vlm_mod, "_module_available", complete)
    assert vlm_mod._probe_available() == ["transformers"]


def test_load_retries_install_when_accelerate_missing(monkeypatch) -> None:
    unload()
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    calls = {"pip": 0}

    monkeypatch.setattr(vlm_mod, "install_allowed", lambda: True)
    monkeypatch.setattr(vlm_mod, "_probe_available", lambda: ["transformers"])

    def fake_pip() -> None:
        calls["pip"] += 1

    def fake_transformers() -> dict:
        if calls["pip"] == 0:
            raise ValueError(
                "Using a `device_map` requires `accelerate`. You can install it with `pip install accelerate`"
            )
        return {"name": "transformers", "model": object(), "model_id": "x", "revision": None}

    monkeypatch.setattr(vlm_mod, "_pip_install_extras", fake_pip)
    monkeypatch.setattr(vlm_mod, "_load_transformers", fake_transformers)
    monkeypatch.setattr(
        vlm_mod,
        "_load_photon",
        lambda: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'moondream'")),
    )
    try:
        body = load(install=True)
        assert calls["pip"] == 1
        assert body["loaded"] is True
        assert body["backend"] == "transformers"
    finally:
        unload()


def test_load_installs_when_transformers_stack_incomplete(monkeypatch) -> None:
    unload()
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    calls = {"pip": 0}
    monkeypatch.setattr(vlm_mod, "install_allowed", lambda: True)
    monkeypatch.setattr(vlm_mod, "_probe_available", lambda: [])

    def fake_pip() -> None:
        calls["pip"] += 1

    monkeypatch.setattr(vlm_mod, "_pip_install_extras", fake_pip)
    monkeypatch.setattr(
        vlm_mod,
        "_load_transformers",
        lambda: {"name": "transformers", "model": object(), "model_id": "x", "revision": None},
    )
    monkeypatch.setattr(
        vlm_mod,
        "_load_photon",
        lambda: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'moondream'")),
    )
    try:
        body = load(install=True)
        assert calls["pip"] == 1
        assert body["loaded"] is True
    finally:
        unload()


def test_load_hides_optional_photon_missing(monkeypatch) -> None:
    unload()
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    monkeypatch.setenv("MORPHO_VLM_NO_INSTALL", "1")
    monkeypatch.setattr(
        vlm_mod,
        "_load_transformers",
        lambda: (_ for _ in ()).throw(
            ValueError("Using a `device_map` requires `accelerate`. pip install accelerate")
        ),
    )
    monkeypatch.setattr(
        vlm_mod,
        "_load_photon",
        lambda: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'moondream'")),
    )
    try:
        load(install=False)
    except RuntimeError as exc:
        msg = str(exc)
        assert "accelerate" in msg
        assert "photon" not in msg
        assert "install-vlm" in msg
        return
    raise AssertionError("load() aurait dû échouer sans accelerate")
