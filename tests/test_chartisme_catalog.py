"""Le vocabulaire doit rester fidèle à la table de référence."""

from synchro.chartisme.catalog import (
    FIGURE_IDS,
    FIGURE_KINDS,
    FIGURE_LABELS,
    FIGURE_SIGNALS,
    FIGURE_TARGETS,
    FLIP_MAP,
    MODEL_CLASSES,
    PIVOT_ROLES,
    PIVOT_ROLE_LABELS,
    catalog,
    canonical_figure,
    class_at,
    class_index,
    describe,
    flip_of,
    kind_of,
    label_of,
    signal_of,
    target_basis,
)


def test_every_figure_has_a_full_row() -> None:
    """18 figures plus `none`, chacune avec type, signal et objectif."""
    assert len(FIGURE_IDS) == 19
    assert "none" in FIGURE_IDS
    assert "canal" in FIGURE_IDS
    assert "tunnel_droit" not in FIGURE_IDS
    for figure in FIGURE_IDS:
        assert FIGURE_LABELS[figure]
        assert FIGURE_KINDS[figure]
        assert FIGURE_SIGNALS[figure]
        assert FIGURE_TARGETS[figure]


def test_table_matches_the_reference() -> None:
    """Les lignes de la table papier, vérifiées une à une."""
    assert kind_of("ete") == "reversal_down"
    assert kind_of("ete_inv") == "reversal_up"
    assert kind_of("double_top") == "reversal_down"
    assert kind_of("double_bottom") == "reversal_up"
    assert kind_of("triple_top") == "reversal_down"
    assert kind_of("triple_bottom") == "reversal_up"
    assert kind_of("wedge_rising") == "reversal_down"
    assert kind_of("wedge_falling") == "reversal_up"
    assert kind_of("triangle_sym") == "continuation"
    assert kind_of("triangle_asc") == "continuation"
    assert kind_of("triangle_desc") == "continuation"
    assert kind_of("rectangle") == "range"
    assert kind_of("flag") == "continuation"
    assert kind_of("pennant") == "continuation"
    assert kind_of("cup_handle") == "reversal_up"
    assert kind_of("broadening_top") == "reversal_down"
    assert kind_of("canal") == "continuation"
    assert kind_of("tunnel_droit") == "continuation"

    assert "cou" in signal_of("ete")
    assert "cou" in signal_of("ete_inv")
    assert "mât" in target_basis("flag")
    assert "tasse" in target_basis("cup_handle")


def test_flip_map_is_an_involution() -> None:
    """La symétrie verticale échange les étiquettes, deux fois de suite rien."""
    for figure in FIGURE_IDS:
        assert flip_of(flip_of(figure)) == figure
    assert flip_of("ete") == "ete_inv"
    assert flip_of("double_top") == "double_bottom"
    assert flip_of("triple_top") == "triple_bottom"
    assert flip_of("wedge_rising") == "wedge_falling"
    assert flip_of("triangle_asc") == "triangle_desc"
    # Un rectangle retourné reste un rectangle.
    assert flip_of("rectangle") == "rectangle"
    assert flip_of("canal") == "canal"
    assert flip_of("tunnel_droit") == "canal"
    assert flip_of("none") == "none"


def test_flip_preserves_direction_semantics() -> None:
    """Retourner une figure de retournement baissier donne un haussier."""
    opposite = {"reversal_down": "reversal_up", "reversal_up": "reversal_down"}
    for figure in FIGURE_IDS:
        flipped = flip_of(figure)
        if figure == flipped:
            continue
        expected = opposite.get(kind_of(figure))
        if expected is not None:
            assert kind_of(flipped) == expected


def test_class_indices_round_trip() -> None:
    for index, figure in enumerate(MODEL_CLASSES):
        assert class_index(figure) == index
        assert class_at(index) == figure
    # Hors catalogue et hors bornes : on retombe sur `none`, jamais d'exception.
    assert class_index("bogus") == class_index("none")
    assert class_at(-1) == "none"
    assert class_at(10_000) == "none"


def test_unknown_figure_degrades_quietly() -> None:
    """Une classe hors table garde son nom : l'atelier en invente librement."""
    assert label_of("escalier descendant") == "escalier descendant"
    assert kind_of("escalier descendant") == "range"
    assert signal_of("escalier descendant") == "—"
    assert target_basis("escalier descendant") == "—"
    assert flip_of("escalier descendant") == "escalier descendant"
    # Pour les modèles en revanche, hors catalogue vaut `none`.
    assert class_index("escalier descendant") == class_index("none")


def test_pivot_roles_all_labelled() -> None:
    for role in PIVOT_ROLES:
        assert PIVOT_ROLE_LABELS[role]
    # Les rôles que la table nomme explicitement.
    for role in ("head", "left_shoulder", "right_shoulder", "neck_left", "pole_end"):
        assert role in PIVOT_ROLES


def test_catalog_lists_the_eighteen_figures() -> None:
    """`none` n'est pas une figure : elle ne doit pas apparaître dans la table."""
    rows = catalog()
    assert len(rows) == 18
    assert {row["figure"] for row in rows} == set(FIGURE_IDS) - {"none"}
    assert any(row["figure"] == "canal" and row["label"] == "Canal" for row in rows)
    for row in rows:
        assert set(row) == {"figure", "label", "kind", "signal", "target"}


def test_legacy_tunnel_droit_maps_to_canal() -> None:
    """L'ancien nom reste compris : même index de logits, libellé Canal."""
    assert canonical_figure("tunnel_droit") == "canal"
    assert label_of("tunnel_droit") == "Canal"
    assert class_index("tunnel_droit") == class_index("canal")
    assert describe("tunnel_droit")["figure"] == "canal"
    assert describe("tunnel_droit")["label"] == "Canal"
