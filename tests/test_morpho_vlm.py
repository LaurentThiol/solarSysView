import pytest
from synchro.morpho.board import cell_center, number_cell, numbers_origin, pixel_to_norm
from synchro.morpho import vlm as vlm_mod
from synchro.morpho.vlm import (
    INSTALL_HINT,
    analyze,
    backend_order,
    geometry_queries,
    grounding_score,
    load,
    boxes_to_predicted,
    cells_to_values,
    parse_json_object,
    parse_label,
    pick_vision_model,
    project_points,
    status,
    unload,
)


@pytest.fixture(autouse=True)
def _ollama_tags_off(monkeypatch) -> None:
    monkeypatch.setattr(
        "synchro.brain.ping_ollama_tags",
        lambda timeout=0.8: {"ok": False, "host": "http://127.0.0.1:11434", "error": "down", "kind": None},
    )
    vlm_mod.clear_ollama_vision_cache()
    yield
    unload()


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


def test_package_major_and_transformers_pin() -> None:
    assert vlm_mod.package_major("4.56.1") == 4
    assert vlm_mod.package_major("5.12.1") == 5
    assert vlm_mod.package_major("v5.0.0.dev0") == 5
    assert vlm_mod.package_major(None) is None
    assert vlm_mod.transformers_needs_pin("4.56.1") is False
    assert vlm_mod.transformers_needs_pin("5.3.0") is True
    req = vlm_mod.extras_requirements_path().read_text()
    assert "transformers>=5.10.0" in req.replace(" ", "")


def test_apply_hf_moondream_compat_calls_post_init() -> None:
    class HubStyle:
        def __init__(self) -> None:
            self.built = True

        def post_init(self) -> None:
            self.all_tied_weights_keys = {"lm_head.weight": "model.embed.weight"}

    patched = vlm_mod.apply_hf_moondream_compat(HubStyle)
    model = patched()
    assert model.all_tied_weights_keys == {"lm_head.weight": "model.embed.weight"}
    assert patched._morpho_tied_compat is True
    vlm_mod.apply_hf_moondream_compat(patched)


def test_apply_hf_moondream_compat_sets_empty_mapping_without_post_init() -> None:
    class Bare:
        def __init__(self) -> None:
            pass

    model = vlm_mod.apply_hf_moondream_compat(Bare)()
    assert model.all_tied_weights_keys == {}


def test_patch_loaded_hf_moondream_classes(monkeypatch) -> None:
    import sys
    import types

    mod = types.ModuleType("morpho_fake_hf_moondream")

    class HfMoondream:
        def __init__(self) -> None:
            pass

    mod.HfMoondream = HfMoondream
    monkeypatch.setitem(sys.modules, "morpho_fake_hf_moondream", mod)
    patched = vlm_mod.patch_loaded_hf_moondream_classes()
    assert HfMoondream in patched
    assert vlm_mod.apply_hf_moondream_compat(HfMoondream) is HfMoondream
    assert HfMoondream().all_tied_weights_keys == {}


def test_ensure_tied_weights_skips_post_init_after_load() -> None:
    class AfterLoad:
        def post_init(self) -> None:
            raise AssertionError("post_init ne doit pas réinitialiser les poids déjà chargés")

    model = AfterLoad()
    vlm_mod.ensure_tied_weights_attr(model, allow_post_init=False)
    assert model.all_tied_weights_keys == {}


def test_compat_error_is_not_treated_as_missing_install() -> None:
    err = AttributeError("'HfMoondream' object has no attribute 'all_tied_weights_keys'")
    assert vlm_mod.looks_like_compat_error(err)
    assert not vlm_mod._looks_like_missing_extra(err)
    msg = vlm_mod.format_vlm_load_error([f"transformers: {err}"])
    assert "all_tied_weights_keys" in msg
    assert "n'est pas installé" not in msg
    assert "install-vlm" in msg
    assert "aucun backend VLM local" not in msg


def test_status_hint_for_transformers_5(monkeypatch) -> None:
    unload()
    monkeypatch.setattr(vlm_mod, "_probe_available", lambda: ["transformers"])
    monkeypatch.setattr(vlm_mod, "_transformers_version", lambda: "5.12.1")
    body = status()
    assert body["available"] == ["transformers"]
    assert body["hint"]
    assert "all_tied_weights_keys" in body["hint"]
    assert "n'est pas installé" not in body["hint"]


def test_load_compat_error_does_not_claim_missing(monkeypatch) -> None:
    unload()
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    monkeypatch.setenv("MORPHO_VLM_NO_INSTALL", "1")
    monkeypatch.setattr(vlm_mod, "_probe_available", lambda: ["transformers"])
    monkeypatch.setattr(
        vlm_mod,
        "_load_transformers",
        lambda: (_ for _ in ()).throw(
            AttributeError("'HfMoondream' object has no attribute 'all_tied_weights_keys'")
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
        assert "all_tied_weights_keys" in msg
        assert "n'est pas installé" not in msg
        assert "photon" not in msg
        assert "install-vlm" in msg
        return
    raise AssertionError("load() aurait dû échouer avec l'erreur de compatibilité")


def test_load_pins_transformers_5_before_load(monkeypatch) -> None:
    unload()
    calls = {"pip": 0}
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    monkeypatch.setattr(vlm_mod, "install_allowed", lambda: True)
    monkeypatch.setattr(vlm_mod, "_probe_available", lambda: ["transformers"])
    monkeypatch.setattr(vlm_mod, "_transformers_version", lambda: "5.3.0")

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
        assert body["backend"] == "transformers"
    finally:
        unload()


def test_load_retries_install_on_tied_weights_error(monkeypatch) -> None:
    unload()
    calls = {"pip": 0}
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    monkeypatch.setattr(vlm_mod, "install_allowed", lambda: True)
    monkeypatch.setattr(vlm_mod, "_probe_available", lambda: ["transformers"])
    monkeypatch.setattr(vlm_mod, "_transformers_version", lambda: "4.56.1")

    def fake_pip() -> None:
        calls["pip"] += 1

    def fake_transformers() -> dict:
        if calls["pip"] == 0:
            raise AttributeError("'HfMoondream' object has no attribute 'all_tied_weights_keys'")
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
    finally:
        unload()


def test_pick_vision_model_prefers_qwen25vl() -> None:
    assert pick_vision_model(["llama3.2", "nomic-embed-text"]) is None
    assert pick_vision_model(["moondream", "qwen2-vl:7b", "qwen2.5vl:7b"]) == "qwen2.5vl:7b"
    assert pick_vision_model(["llava", "moondream:latest"]) == "llava"
    assert pick_vision_model(["qwen2.5vl", "minicpm-v"]) == "qwen2.5vl"


def test_ollama_vision_status_requires_native_tags(monkeypatch) -> None:
    monkeypatch.setattr(
        "synchro.brain.ping_ollama_tags",
        lambda timeout=0.8: {
            "ok": True,
            "host": "http://127.0.0.1:11434",
            "models": ["moondream"],
            "kind": "tags",
        },
    )
    vlm_mod.clear_ollama_vision_cache()
    probe = vlm_mod.ollama_vision_status(force=True)
    assert probe["ok"] is True
    assert probe["model"] == "moondream"

    monkeypatch.setattr(
        "synchro.brain.ping_ollama_tags",
        lambda timeout=0.8: {
            "ok": True,
            "host": "http://127.0.0.1:1234",
            "models": ["moondream"],
            "kind": None,
        },
    )
    vlm_mod.clear_ollama_vision_cache()
    probe = vlm_mod.ollama_vision_status(force=True)
    assert probe["ok"] is False


def test_backend_order_puts_ollama_first_when_vision_tag_exists(monkeypatch) -> None:
    monkeypatch.setattr(
        vlm_mod,
        "ollama_vision_status",
        lambda **_k: {
            "ok": True,
            "host": "http://127.0.0.1:11434",
            "model": "moondream",
            "models": ["moondream", "llama3.2"],
        },
    )
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    assert backend_order()[0] == "ollama"
    assert "transformers" in backend_order()


def test_analyze_ollama_parses_closed_labels_without_point(monkeypatch) -> None:
    unload()
    monkeypatch.setenv("MORPHO_VLM_NO_INSTALL", "1")
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    monkeypatch.setattr(
        vlm_mod,
        "ollama_vision_status",
        lambda **_k: {
            "ok": True,
            "host": "http://127.0.0.1:11434",
            "model": "moondream",
            "models": ["moondream"],
        },
    )
    calls: list[str] = []

    def fake_chat(host: str, model: str, png: bytes, question: str, timeout: float = 60) -> str:
        assert host == "http://127.0.0.1:11434"
        assert model == "moondream"
        assert png
        calls.append(question)
        if "collinear" in question:
            return "yes"
        if "compact" in question:
            return "The cluster is compact."
        if "adjacent" in question or "lower smaller grid" in question:
            return "adjacent"
        if "concentrated" in question:
            return "top"
        return "A compact row of filled dots on the top of the board."

    monkeypatch.setattr(vlm_mod, "_chat_ollama", fake_chat)
    monkeypatch.setattr(
        vlm_mod,
        "_load_transformers",
        lambda: (_ for _ in ()).throw(RuntimeError("transformers should not load")),
    )
    try:
        body = load(install=False)
        assert body["backend"] == "ollama"
        assert body["model_id"] == "moondream"
        state = analyze([1, 2, 3, 4, 5], [1, 2])
    finally:
        unload()
    assert state["vlm"] is True
    assert state["backend"] == "ollama"
    assert state["grounding_score"] is None
    assert state["points"] == []
    assert state["queries"]["region"] == "top"
    assert state["queries"]["collinear"] == "yes"
    assert state["queries"]["compact"] == "compact"
    assert state["queries"]["stars"] == "adjacent"
    assert len(calls) >= 5


def test_parse_json_object_and_cells() -> None:
    parsed = parse_json_object('prefix {"region":"top","cells":[{"row":0,"col":0}]} suffix')
    assert parsed is not None
    assert parsed["region"] == "top"
    assert cells_to_values(parsed["cells"], kind="number") == [1]
    numbers, stars = boxes_to_predicted(
        [{"x": 0.08, "y": 0.08, "w": 0.02, "h": 0.02, "kind": "number"}]
    )
    assert numbers
    assert stars == []


def test_analyze_qwen_vl_uses_one_json_call(monkeypatch) -> None:
    unload()
    monkeypatch.setenv("MORPHO_VLM_NO_INSTALL", "1")
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    monkeypatch.setattr(
        vlm_mod,
        "ollama_vision_status",
        lambda **_k: {
            "ok": True,
            "host": "http://127.0.0.1:11434",
            "model": "qwen2.5vl:7b",
            "models": ["qwen2.5vl:7b"],
        },
    )
    calls: list[str] = []

    def fake_chat(host: str, model: str, png: bytes, question: str, timeout: float = 120) -> str:
        assert model == "qwen2.5vl:7b"
        assert png
        calls.append(question)
        return (
            '{"region":"top","collinear":"yes","compact":"compact","stars":"adjacent",'
            '"caption":"A compact top row.","cells":[{"row":0,"col":0},{"row":0,"col":1}],'
            '"star_cells":[{"row":0,"col":0}]}'
        )

    monkeypatch.setattr(vlm_mod, "_chat_ollama", fake_chat)
    monkeypatch.setattr(
        vlm_mod,
        "_load_transformers",
        lambda: (_ for _ in ()).throw(RuntimeError("transformers should not load")),
    )
    try:
        body = load(install=False)
        assert body["model_id"] == "qwen2.5vl:7b"
        state = analyze([1, 2, 3, 4, 5], [1, 2])
    finally:
        unload()
    assert len(calls) == 1
    assert state["prompt_id"] == "morpho-vqa-v2"
    assert state["queries"]["region"] == "top"
    assert state["predicted_numbers"] == [1, 2]
    assert state["predicted_stars"] == [1]
    assert state["grounding_score"] is not None


def test_chat_ollama_posts_native_api_chat(monkeypatch) -> None:
    seen: dict[str, object] = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def read(self) -> bytes:
            return b'{"message":{"role":"assistant","content":"top"}}'

    def fake_open(url: str, timeout: float, data: bytes | None = None, headers=None):
        seen["url"] = url
        seen["body"] = data
        seen["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("synchro.brain._open", fake_open)
    answer = vlm_mod._chat_ollama("http://127.0.0.1:11434", "moondream", b"\x89PNG", "Where?")
    assert answer == "top"
    assert seen["url"] == "http://127.0.0.1:11434/api/chat"
    payload = __import__("json").loads(seen["body"])
    assert payload["model"] == "moondream"
    assert payload["stream"] is False
    assert payload["keep_alive"] == "30m"
    assert payload["messages"][0]["images"]
    assert seen["timeout"] == 120


def test_ollama_down_does_not_pip_install_when_forbidden(monkeypatch) -> None:
    unload()
    monkeypatch.setenv("MORPHO_VLM_NO_INSTALL", "1")
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    pip_calls = {"n": 0}

    def fake_pip() -> None:
        pip_calls["n"] += 1

    monkeypatch.setattr(vlm_mod, "_pip_install_extras", fake_pip)
    monkeypatch.setattr(
        vlm_mod,
        "_load_transformers",
        lambda: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'transformers'")),
    )
    monkeypatch.setattr(
        vlm_mod,
        "_load_photon",
        lambda: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'moondream'")),
    )
    try:
        load(install=True)
    except RuntimeError as exc:
        msg = str(exc)
        assert pip_calls["n"] == 0
        assert "ollama pull moondream" in msg or "install-vlm" in msg
        return
    raise AssertionError("load() aurait dû échouer sans backend")
    unload()
    calls = {"pip": 0}
    monkeypatch.delenv("MORPHO_GGUF_PATH", raising=False)
    monkeypatch.setattr(vlm_mod, "install_allowed", lambda: True)
    monkeypatch.setattr(vlm_mod, "_probe_available", lambda: ["transformers"])
    monkeypatch.setattr(vlm_mod, "_transformers_version", lambda: "4.56.1")

    def fake_pip() -> None:
        calls["pip"] += 1

    def fake_transformers() -> dict:
        if calls["pip"] == 0:
            raise AttributeError("'HfMoondream' object has no attribute 'all_tied_weights_keys'")
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
    finally:
        unload()
