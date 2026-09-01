from datetime import date
from decimal import Decimal

from synchro.fdj import parse_fdj_date, parse_fr_decimal, parse_row, parse_zip, star_pool_for


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
            "numero_My_Million": "TM 296 5205",
        }
    )
    assert draw.draw_date == date(2026, 8, 28)
    assert draw.numbers == [7, 14, 28, 42, 45]
    assert draw.stars == [6, 9]
    assert draw.star_pool == 12
    assert draw.my_million == "TM 296 5205"
    assert draw.weekday == "VENDREDI"


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
