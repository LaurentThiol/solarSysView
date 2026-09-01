"""Téléchargement et parsing des archives CSV officielles FDJ."""

from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
import unicodedata

import httpx

FDJ_DOC_BASE = "https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations"

# Archives publiées sur fdj.fr/jeux-de-tirage/euromillions-my-million/historique
# (du plus récent au plus ancien). Les UUID sont stables côté FDJ.
ARCHIVES = [
    "1a2b3c4d-9876-4562-b3fc-2c963f66afe6",  # fév. 2020 → aujourd'hui
    "1a2b3c4d-9876-4562-b3fc-2c963f66afd6",  # mars 2019 → fév. 2020
    "1a2b3c4d-9876-4562-b3fc-2c963f66afc6",  # sept. 2016 → fév. 2019
    "1a2b3c4d-9876-4562-b3fc-2c963f66afb6",  # fév. 2014 → sept. 2016
    "1a2b3c4d-9876-4562-b3fc-2c963f66afa9",  # mai 2011 → fév. 2014
    "1a2b3c4d-9876-4562-b3fc-2c963f66afa8",  # fév. 2004 → mai 2011
]

CURRENT_FORMAT_START = date(2016, 9, 27)
STARS_11_START = date(2011, 5, 10)

USER_AGENT = (
    "Mozilla/5.0 (compatible; Synchro/0.1; +https://github.com/LaurentThiol/Synchro)"
)


@dataclass(frozen=True)
class Draw:
    draw_date: date
    draw_code: str | None
    weekday: str | None
    numbers: list[int]
    stars: list[int]
    star_pool: int
    winners_rank1_fr: int | None
    winners_rank1_eu: int | None
    prize_rank1: Decimal | None
    my_million: str | None
    raw: dict[str, str]

    def as_row(self) -> dict[str, Any]:
        return {
            "draw_date": self.draw_date,
            "draw_code": self.draw_code,
            "weekday": self.weekday,
            "numbers": self.numbers,
            "stars": self.stars,
            "star_pool": self.star_pool,
            "winners_rank1_fr": self.winners_rank1_fr,
            "winners_rank1_eu": self.winners_rank1_eu,
            "prize_rank1": self.prize_rank1,
            "my_million": self.my_million,
            "source": "fdj",
            "raw": self.raw,
        }


def star_pool_for(draw_date: date) -> int:
    if draw_date >= CURRENT_FORMAT_START:
        return 12
    if draw_date >= STARS_11_START:
        return 11
    return 9


def parse_fdj_date(value: str) -> date:
    text = value.strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y%m%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Date FDJ inconnue: {value!r}")


def parse_fr_int(value: str | None) -> int | None:
    if value is None:
        return None
    text = value.strip().replace("\xa0", "").replace(" ", "")
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def parse_fr_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    text = value.strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _fold(key: str) -> str:
    nfkd = unicodedata.normalize("NFKD", key or "")
    ascii_key = "".join(ch for ch in nfkd if unicodedata.combining(ch) == 0)
    return ascii_key.lower().strip()


def _index_row(row: dict[str, str | None]) -> dict[str, str]:
    indexed: dict[str, str] = {}
    for key, value in row.items():
        if key is None:
            continue
        indexed[_fold(key)] = "" if value is None else str(value)
    return indexed


def _get(row: dict[str, str], *names: str) -> str:
    for name in names:
        value = row.get(_fold(name))
        if value is not None and value.strip() != "":
            return value
    return ""


def _find_contains(row: dict[str, str], *needles: str) -> str:
    for key, value in row.items():
        if all(needle in key for needle in needles) and value.strip():
            return value
    return ""


def normalize_weekday(value: str) -> str | None:
    text = value.strip().upper()
    if not text:
        return None
    if text.startswith("VE"):
        return "VENDREDI"
    if text.startswith("MA"):
        return "MARDI"
    return text


def parse_row(row: dict[str, str | None]) -> Draw:
    idx = _index_row(row)
    draw_date = parse_fdj_date(_get(idx, "date_de_tirage"))
    numbers = sorted(
        int(_get(idx, f"boule_{i}"))
        for i in range(1, 6)
    )
    stars = sorted(
        [
            int(_get(idx, "etoile_1")),
            int(_get(idx, "etoile_2")),
        ]
    )
    if len(set(numbers)) != 5 or any(n < 1 or n > 50 for n in numbers):
        raise ValueError("Numéros invalides")
    pool = star_pool_for(draw_date)
    if len(set(stars)) != 2 or any(s < 1 or s > pool for s in stars):
        raise ValueError("Étoiles invalides")

    winners_fr = parse_fr_int(
        _get(
            idx,
            "nombre_de_gagnant_au_rang1_Euro_Millions_en_france",
            "nombre_de_gagnant_au_rang1_en_france",
        )
        or _find_contains(idx, "gagnant", "rang1", "france")
    )
    winners_eu = parse_fr_int(
        _get(
            idx,
            "nombre_de_gagnant_au_rang1_Euro_Millions_en_europe",
            "nombre_de_gagnant_au_rang1_en_europe",
        )
        or _find_contains(idx, "gagnant", "rang1", "europe")
    )
    prize = parse_fr_decimal(
        _get(idx, "rapport_du_rang1_Euro_Millions", "rapport_du_rang1")
        or _find_contains(idx, "rapport", "rang1")
    )
    million = _get(idx, "numero_My_Million") or _find_contains(idx, "my_million")
    million = " ".join(million.split()) or None

    return Draw(
        draw_date=draw_date,
        draw_code=_get(idx, "annee_numero_de_tirage") or None,
        weekday=normalize_weekday(_get(idx, "jour_de_tirage")),
        numbers=numbers,
        stars=stars,
        star_pool=pool,
        winners_rank1_fr=winners_fr,
        winners_rank1_eu=winners_eu,
        prize_rank1=prize,
        my_million=million,
        raw={k: v for k, v in idx.items() if k},
    )


def extract_csv_rows(zip_bytes: bytes) -> list[dict[str, str | None]]:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith(".csv")]
        if not names:
            raise ValueError("Aucun CSV dans l'archive FDJ")
        payload = archive.read(names[0])
    text = None
    for encoding in ("utf-8-sig", "latin-1", "cp1252"):
        try:
            text = payload.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("Encodage CSV FDJ inconnu")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    return list(reader)


def parse_zip(zip_bytes: bytes) -> list[Draw]:
    draws: list[Draw] = []
    for row in extract_csv_rows(zip_bytes):
        try:
            draws.append(parse_row(row))
        except (KeyError, ValueError, TypeError):
            continue
    return draws


def download_archive(archive_id: str, timeout: float = 60.0) -> bytes:
    url = f"{FDJ_DOC_BASE}/{archive_id}"
    with httpx.Client(timeout=timeout, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
        response = client.get(url)
        response.raise_for_status()
        if "zip" not in response.headers.get("content-type", "") and not response.content.startswith(b"PK"):
            raise ValueError(f"Réponse FDJ inattendue pour {archive_id}")
        return response.content


def fetch_all_draws(progress: list[str] | None = None) -> list[Draw]:
    by_date: dict[date, Draw] = {}
    for archive_id in ARCHIVES:
        if progress is not None:
            progress.append(archive_id)
        payload = download_archive(archive_id)
        for draw in parse_zip(payload):
            by_date[draw.draw_date] = draw
    return sorted(by_date.values(), key=lambda item: item.draw_date)
