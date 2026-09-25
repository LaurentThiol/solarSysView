from datetime import date
from decimal import Decimal

from synchro.fdj import (
    parse_fdj_date,
    parse_fr_decimal,
    parse_prizes,
    parse_row,
    parse_zip,
    prizes_from_raw,
    rank1_jackpot,
    rank_winners_total,
    star_pool_for,
    winners_totals,
)


def test_rank1_jackpot_marks_a_winner_and_a_rollover():
    won, prize = rank1_jackpot(
        {
            "prizes": [
                {"rank": 1, "winners_fr": 0, "winners_eu": 1, "winners_total": 1, "prize": 1000}
            ]
        }
    )
    assert won is True
    assert prize == 1000
    rolled, rolled_prize = rank1_jackpot(
        {"winners_rank1_fr": 0, "winners_rank1_eu": 0, "prize_rank1": Decimal("0")}
    )
    assert rolled is False
    assert rolled_prize == 0
    unknown, _ = rank1_jackpot({"numbers": [1, 2, 3, 4, 5]})
    assert unknown is None


def test_parse_dates():
    assert parse_fdj_date("28/08/2026") == date(2026, 8, 28)
    assert parse_fdj_date("23/09/16") == date(2016, 9, 23)
    assert parse_fdj_date("20110506") == date(2011, 5, 6)


def test_star_pool_eras():
    assert star_pool_for(date(2004, 2, 13)) == 9
    assert star_pool_for(date(2011, 5, 10)) == 11
    assert star_pool_for(date(2016, 9, 27)) == 12


def test_parse_fr_decimal():
    assert parse_fr_decimal("109518,60") == Decimal("109518.60")
    assert parse_fr_decimal("15 000 000") == Decimal("15000000")


def test_parse_row_current_format():
    draw = parse_row(
        {
            "annee_numero_de_tirage": "26069",
            "jour_de_tirage": "VENDREDI",
            "date_de_tirage": "28/08/2026",
            "boule_1": "45",
            "boule_2": "42",
            "boule_3": "7",
            "boule_4": "14",
            "boule_5": "28",
            "etoile_1": "6",
            "etoile_2": "9",
            "nombre_de_gagnant_au_rang1_Euro_Millions_en_france": "0",
            "nombre_de_gagnant_au_rang1_Euro_Millions_en_europe": "0",
            "rapport_du_rang1_Euro_Millions": "0",
            "nombre_de_gagnant_au_rang2_Euro_Millions_en_france": "1",
            "nombre_de_gagnant_au_rang2_Euro_Millions_en_europe": "4",
            "rapport_du_rang2_Euro_Millions": "245 123,45",
            "rapport_du_rang13_Euro_Millions": "4,20",
            "rapport_du_rang1_Etoile+": "999",
            "nombre_de_gagnant_au_rang1_Etoile+_en_france": "12",
            "numero_My_Million": "TM 296 5205",
        }
    )
    assert draw.draw_date == date(2026, 8, 28)
    assert draw.numbers == [7, 14, 28, 42, 45]
    assert draw.stars == [6, 9]
    assert draw.star_pool == 12
    assert draw.my_million == "TM 296 5205"
    assert draw.weekday == "VENDREDI"
    assert draw.prize_rank1 == Decimal("0")
    assert draw.winners_rank1_eu == 0
    assert len(draw.prizes) == 3
    by_rank = {item["rank"]: item for item in draw.prizes}
    assert by_rank[2]["prize"] == Decimal("245123.45")
    assert by_rank[2]["winners_eu"] == 4
    assert by_rank[2]["winners_total"] == 4
    assert by_rank[13]["prize"] == Decimal("4.20")
    assert 1 in by_rank
    row = draw.as_row()
    assert row["prizes"][1]["prize"] == 245123.45
    assert row["prizes"][1]["winners_total"] == 4
    assert row["winners_total_fr"] == 1
    assert row["winners_total_eu"] == 4


def test_parse_row_old_date_format():
    draw = parse_row(
        {
            "annee_numero_de_tirage": "2004001",
            "jour_de_tirage": "VE",
            "date_de_tirage": "20040213",
            "boule_1": "32",
            "boule_2": "16",
            "boule_3": "29",
            "boule_4": "41",
            "boule_5": "36",
            "etoile_1": "9",
            "etoile_2": "7",
        }
    )
    assert draw.draw_date == date(2004, 2, 13)
    assert draw.stars == [7, 9]
    assert draw.star_pool == 9
    assert draw.weekday == "VENDREDI"


def test_parse_zip_bytes():
    import io
    import zipfile

    csv_text = (
        "annee_numero_de_tirage;jour_de_tirage;date_de_tirage;boule_1;boule_2;boule_3;boule_4;boule_5;etoile_1;etoile_2\n"
        "26001;MARDI;03/01/2026;1;2;3;4;5;1;2\n"
        "bad;MARDI;xx;1;2;3;4;5;1;2\n"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("euromillions.csv", csv_text)
    draws = parse_zip(buf.getvalue())
    assert len(draws) == 1
    assert draws[0].numbers == [1, 2, 3, 4, 5]


def test_parse_prizes_prefers_euromillions_over_short_labels():
    prizes = parse_prizes(
        {
            "rapport_du_rang1": "1",
            "rapport_du_rang1_Euro_Millions": "17 000 000",
            "nombre_de_gagnant_au_rang1_en_france": "0",
            "nombre_de_gagnant_au_rang1_Euro_Millions_en_france": "2",
        }
    )
    assert prizes[0]["prize"] == Decimal("17000000")
    assert prizes[0]["winners_fr"] == 2


def test_parse_prizes_old_headers_without_euro_millions():
    prizes = parse_prizes(
        {
            "rapport_du_rang1": "15 000 000",
            "nombre_de_gagnant_au_rang1_en_france": "1",
            "nombre_de_gagnant_au_rang1_en_europe": "3",
            "rapport_du_rang12": "3,50",
        }
    )
    by_rank = {item["rank"]: item for item in prizes}
    assert by_rank[1]["winners_eu"] == 3
    assert by_rank[1]["winners_total"] == 3
    assert by_rank[12]["prize"] == Decimal("3.50")


def test_prizes_from_raw_folded_keys():
    payload = prizes_from_raw(
        {
            "rapport_du_rang5_euro_millions": "146,00",
            "nombre_de_gagnant_au_rang5_euro_millions_en_europe": "723",
            "rapport_du_rang1_etoile+": "50",
        }
    )
    assert payload == [
        {
            "rank": 5,
            "winners_fr": None,
            "winners_eu": 723,
            "winners_total": 723,
            "prize": 146.0,
        }
    ]


def test_winners_totals_sum_ranks_without_adding_fr_and_eu():
    prizes = [
        {"rank": 2, "winners_fr": 5, "winners_eu": 7},
        {"rank": 13, "winners_fr": 195171, "winners_eu": 810916},
    ]
    assert rank_winners_total(5, 7) == 7
    assert winners_totals(prizes) == (195176, 810923)
