"""Épisodes, fiches, demande 20/50/100, journal qui survit à un fichier tronqué."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

from synchro.chartisme.sense import name_sense
from synchro.lexicon.cards import fiche_id, seed_cards
from synchro.lexicon.episode import close_outcome, episode_from_window, figure_outcome
from synchro.lexicon.memory import embed_card, pack_for, retrieve
from synchro.lexicon.helptext import drafts_for, local_question
from synchro.lexicon.reading import build_reading
from synchro.lexicon.service import answer_help, prepare_reading, run_if_automatic
from synchro.lexicon.store import LexiconStore
from synchro.lexicon.verdicts import horizon_verdict, shape_verdict


def _named(sense: str, register: str = "05") -> dict:
    return {"sense": sense, "register": register, "symbol": f"{sense}:{register}"}


def _draws(count: int = 220) -> list[dict]:
    start = date(2018, 1, 2)
    rows = []
    for index in range(count):
        # Somme qui monte, n1 qui baisse vers le plancher, n5 qui monte : la grille s'ouvre.
        low = max(1, 12 - index // 20)
        high = min(50, 30 + index // 15)
        mid = min(high - 2, low + 10)
        numbers = sorted({low, mid, mid + 3, mid + 7, high})
        while len(numbers) < 5:
            numbers.append(min(50, numbers[-1] + 1))
        numbers = sorted(numbers)[:5]
        rows.append(
            {
                "draw_date": start + timedelta(days=index * 3),
                "weekday": "mardi" if index % 2 == 0 else "vendredi",
                "numbers": numbers,
                "stars": [1 + (index % 11), 2 + ((index + 3) % 10)],
                "star_pool": 12,
            }
        )
    return rows


def test_episode_names_a_clean_rise() -> None:
    values = [float(index) for index in range(20)]
    episode = episode_from_window(
        values,
        [f"2024-01-{index + 1:02d}" for index in range(20)],
        8,
        module="chartisme",
        series="sum",
    )
    assert episode["sense"]["symbol"] == "monte:05"
    assert episode["outcome"]["status"] == "open"
    assert episode["series"] == "sum"
    assert name_sense(values, 8)["symbol"] == episode["sense"]["symbol"]


def test_short_window_abstains() -> None:
    episode = episode_from_window(
        [1.0] * 10,
        [f"2024-01-{index + 1:02d}" for index in range(10)],
        1,
        module="analyse",
        series="sum",
    )
    assert episode["sense"] is None


def test_outcome_follows_the_sense() -> None:
    values = [float(index) for index in range(30)]
    closed = close_outcome(values, 19, "monte", horizon=5)
    assert closed["status"] == "reached"
    fallen = [30.0 - index for index in range(10)]
    assert close_outcome(fallen, 4, "monte", horizon=3)["status"] == "invalidated"
    assert close_outcome(values, 29, "monte")["status"] == "open"


def test_nine_cards_are_seeded_from_the_code() -> None:
    cards = seed_cards()
    assert len(cards) == 9
    assert {card["id"] for card in cards} == {
        fiche_id(sense, register)
        for sense in ("monte", "baisse", "stable")
        for register in ("05", "1", "sup")
    }
    assert all(card["status"] == "confirmed" and card["source"] == "code" for card in cards)
    assert all(card["image_svg"].startswith("<svg") for card in cards)


def test_horizon_and_shape_verdicts() -> None:
    assert horizon_verdict(_named("monte"), _named("monte"), _named("baisse")) == "opposé"
    assert horizon_verdict(_named("stable"), _named("monte"), _named("monte")) == "emboîté"
    assert horizon_verdict(_named("stable", "05"), _named("stable", "1"), _named("stable", "05")) == "nuage"
    assert (
        shape_verdict(
            {
                "spread": _named("monte"),
                "n1": _named("baisse"),
                "n5": _named("monte"),
            }
        )
        == "aligné"
    )
    assert (
        shape_verdict(
            {
                "spread": _named("monte"),
                "n1": _named("monte"),
                "n5": _named("baisse"),
            }
        )
        == "opposé"
    )


def test_reading_covers_six_fields_and_ref() -> None:
    reading = build_reading(_draws(), shuffles=4, seed=1)
    assert reading["fields"] == ["sum", "parity", "star_sum", "spread", "n1", "n5"]
    assert set(reading["columns"]) == {"20", "50", "100"}
    assert reading["link"]["weekday"]
    assert reading["cycles"]["role"] == "jointure"
    assert {row["id"] for row in reading["measured"]} >= {"f107", "enso"}
    assert all(row["status"] == "non chargée" for row in reading["measured"])
    assert any(row["clock"] == "lunaire" for row in reading["ref"])
    assert any(row["clock"] == "schwabe" for row in reading["stamps"])
    assert reading["episodes"]
    assert reading["episodes"][0]["module"] == "analyse"


def test_tuesday_predecessor_uses_only_tuesdays() -> None:
    reading = build_reading(_draws(), weekday="mardi", shuffles=2, seed=2)
    assert reading["weekday"] == "mardi"
    assert reading["draw_count"] == 110


def test_journal_survives_a_truncated_snapshot(tmp_path: Path) -> None:
    store = LexiconStore(tmp_path)
    cards = store.load_cards()
    assert len(cards) == 9
    image = tmp_path / "images" / "sense.monte.05.svg"
    assert image.exists()
    store.cards_path.write_text("{", encoding="utf-8")
    restored = store.load_cards()
    assert len(restored) == 9
    updated = store.update_card("sense.monte.05", {"gloss": "relu à la main", "status": "confirmed"})
    assert updated is not None
    assert updated["revision"] == 2
    assert updated["gloss"] == "relu à la main"


def test_automatic_stays_off_and_help_does_not_call_the_cloud(tmp_path: Path) -> None:
    store = LexiconStore(tmp_path)
    assert store.load_mode()["automatic"] is False
    assert run_if_automatic(_draws(), store=store, ask=lambda _question: "local") is None
    store.save_mode(True)
    reading = run_if_automatic(_draws(), store=store, ask=lambda _question: None, shuffles=2)
    assert reading is not None
    assert "local_answers" not in reading or reading["opens_llm"]
    quiet = {
        "opens_llm": False,
        "oppositions": [],
        "question": None,
    }
    held = answer_help(quiet, escalate=True, cloud_note="note cloud", ask=lambda _q: "ne doit pas partir")
    assert held["awaiting_note"] is True
    assert held["escalate"] is False
    loud = answer_help(
        {"opens_llm": True, "oppositions": [{"kind": "horizon", "field": "sum"}]},
        escalate=True,
        cloud_note="vu depuis le cloud",
        ask=lambda _q: "local",
    )
    assert loud["provider"] == "cloud"
    assert loud["note"]["provider"] == "cloud"


def test_prepare_writes_a_draft_only_for_a_free_opposition(tmp_path: Path) -> None:
    store = LexiconStore(tmp_path)
    reading = {
        "opens_llm": True,
        "oppositions": [
            {
                "kind": "libre",
                "length": 20,
                "left": "sum",
                "right": "parity",
                "left_sense": "monte",
                "right_sense": "baisse",
            }
        ],
        "episodes": [],
    }
    question = local_question(reading)
    assert "sum" in question and "parity" in question
    drafts = drafts_for(reading, {card["id"] for card in store.load_cards()})
    assert len(drafts) == 1
    assert drafts[0]["status"] == "draft"
    saved = prepare_reading(_draws()[:40], weekday="mardi", store=store, shuffles=2)
    assert saved["id"]
    assert store.load_readings()
    assert all(card["status"] == "confirmed" for card in saved["pack"])
    assert all(str(card["id"]).startswith("sense.") for card in saved["pack"])


def test_pack_ignores_a_draft_and_embedding_stays_local(tmp_path: Path) -> None:
    cards = seed_cards()
    cards.append(
        {
            "id": "tension.sum.parity",
            "status": "draft",
            "symbol": "monte:05",
            "gloss": "brouillon",
        }
    )
    episodes = [{"sense": {"symbol": "monte:05"}, "facts": {"skill": {"skill": -0.1}}}]
    packed = pack_for(cards, episodes)
    assert [card["id"] for card in packed] == ["sense.monte.05"]
    found = retrieve(cards, "monte:05")
    assert [card["id"] for card in found] == ["sense.monte.05"]
    assert found[0]["status"] == "confirmed"
    assert embed_card(cards[0]) is None
    store = LexiconStore(tmp_path)
    store.save_embedding("sense.monte.05", [1.0, 0.0])
    assert store.load_embeddings()["sense.monte.05"] == [1.0, 0.0]


def test_figure_issue_uses_target_reached() -> None:
    values = [1.0, 2.0, 3.0, 8.0, 9.0]
    hit = {
        "breakout": {"index": 2, "level": 3.0, "direction": "up"},
        "target": {"value": 7.0},
    }
    outcome = figure_outcome(values, hit)
    assert outcome["status"] == "reached"
    assert outcome["reached"] is True
