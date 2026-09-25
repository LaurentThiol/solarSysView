"""Téléchargement et parsing des archives CSV officielles FDJ."""

from __future__ import annotations

import csv
import io
import re
import zipfile
from dataclasses import dataclass, field
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

_RANK_RE = re.compile(r"rang(\d+)")
MAX_PRIZE_RANK = 13


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
    prizes: list[dict[str, Any]] = field(default_factory=list)

    def as_row(self) -> dict[str, Any]:
        prizes = prizes_as_json(self.prizes)
        fr_total, eu_total = winners_totals(prizes)
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
            "prizes": prizes,
            "winners_total_fr": fr_total,
            "winners_total_eu": eu_total,
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


def _is_add_on_key(key: str) -> bool:
    compact = key.replace(" ", "").replace("_", "")
    if "etoile+" in compact or "etoileplus" in compact:
        return True
    if "mymillion" in compact:
        return True
    return False


def _as_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def rank_winners_total(winners_fr: int | None, winners_eu: int | None) -> int | None:
    """Total d’un rang : la colonne FDJ « en Europe » inclut la France."""
    if winners_eu is not None:
        return winners_eu
    return winners_fr


def _as_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def rank1_jackpot(draw: dict[str, Any]) -> tuple[bool | None, float | None]:
    """Jackpot rang 1 : gagné s'il y a au moins un gagnant (EU, France comprise).

    Retourne (gagné, montant €). `gagné` est None si l'archive n'a pas le rang 1.
    Un rapport à 0 € sans gagnant est un report, pas un jackpot gagné.
    """
    tier: dict[str, Any] | None = None
    prizes = draw.get("prizes")
    if isinstance(prizes, list):
        for item in prizes:
            if isinstance(item, dict) and _as_int(item.get("rank")) == 1:
                tier = item
                break
    winners: int | None = None
    prize: float | None = None
    if tier is not None:
        winners = _as_int(tier.get("winners_total"))
        if winners is None:
            winners = rank_winners_total(
                _as_int(tier.get("winners_fr")),
                _as_int(tier.get("winners_eu")),
            )
        prize = _as_float(tier.get("prize"))
    if winners is None:
        winners = rank_winners_total(
            _as_int(draw.get("winners_rank1_fr")),
            _as_int(draw.get("winners_rank1_eu")),
        )
    if prize is None:
        prize = _as_float(draw.get("prize_rank1"))
    if winners is None:
        return None, prize
    return winners > 0, prize


def winners_totals(
    prizes: list[dict[str, Any]] | None,
) -> tuple[int | None, int | None]:
    """Somme des gagnants des rangs 1–13 (FR, EU). EU FDJ = tous pays, France comprise."""
    fr_sum = 0
    eu_sum = 0
    has_fr = False
    has_eu = False
    for item in prizes or []:
        fr = _as_int(item.get("winners_fr"))
        eu = _as_int(item.get("winners_eu"))
        if fr is not None:
            fr_sum += fr
            has_fr = True
        if eu is not None:
            eu_sum += eu
            has_eu = True
    return (fr_sum if has_fr else None, eu_sum if has_eu else None)


def prizes_as_json(prizes: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for item in prizes or []:
        rank = item.get("rank")
        try:
            rank_n = int(rank)
        except (TypeError, ValueError):
            continue
        prize = item.get("prize")
        winners_fr = _as_int(item.get("winners_fr"))
        winners_eu = _as_int(item.get("winners_eu"))
        stored_total = _as_int(item.get("winners_total"))
        payload.append(
            {
                "rank": rank_n,
                "winners_fr": winners_fr,
                "winners_eu": winners_eu,
                "winners_total": (
                    stored_total
                    if stored_total is not None
                    else rank_winners_total(winners_fr, winners_eu)
                ),
                "prize": float(prize) if prize is not None else None,
            }
        )
    return payload


def parse_prizes(row: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Échelle EuroMillions (rangs 1–13) depuis une ligne CSV FDJ, clés foldées ou non.

    Ignore Étoile+ / My Million. Préfère les colonnes « Euro_Millions » aux
    libellés courts quand les deux existent.
    """
    if not row:
        return []
    indexed: dict[str, str] = {}
    for key, value in row.items():
        if key is None:
            continue
        indexed[_fold(str(key))] = "" if value is None else str(value)

    prize: dict[int, tuple[int, Decimal]] = {}
    winners_fr: dict[int, tuple[int, int]] = {}
    winners_eu: dict[int, tuple[int, int]] = {}

    for key, value in indexed.items():
        if _is_add_on_key(key):
            continue
        if "rapport" not in key and "gagnant" not in key:
            continue
        match = _RANK_RE.search(key)
        if not match:
            continue
        rank = int(match.group(1))
        if rank < 1 or rank > MAX_PRIZE_RANK:
            continue
        score = 2 if "euro_millions" in key or "euromillions" in key else 1
        if "rapport" in key:
            parsed = parse_fr_decimal(value)
            if parsed is None:
                continue
            prev = prize.get(rank)
            if prev is None or score >= prev[0]:
                prize[rank] = (score, parsed)
        elif "gagnant" in key:
            parsed_n = parse_fr_int(value)
            if parsed_n is None:
                continue
            if "france" in key:
                prev_fr = winners_fr.get(rank)
                if prev_fr is None or score >= prev_fr[0]:
                    winners_fr[rank] = (score, parsed_n)
            elif "europe" in key:
                prev_eu = winners_eu.get(rank)
                if prev_eu is None or score >= prev_eu[0]:
                    winners_eu[rank] = (score, parsed_n)

    ranks = sorted(set(prize) | set(winners_fr) | set(winners_eu))
    out: list[dict[str, Any]] = []
    for rank in ranks:
        winners_fr_n = winners_fr[rank][1] if rank in winners_fr else None
        winners_eu_n = winners_eu[rank][1] if rank in winners_eu else None
        out.append(
            {
                "rank": rank,
                "winners_fr": winners_fr_n,
                "winners_eu": winners_eu_n,
                "winners_total": rank_winners_total(winners_fr_n, winners_eu_n),
                "prize": prize[rank][1] if rank in prize else None,
            }
        )
    return out


def prizes_from_raw(raw: dict[str, Any] | None) -> list[dict[str, Any]]:
    return prizes_as_json(parse_prizes(raw))


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

    prizes = parse_prizes(idx)
    rank1 = next((item for item in prizes if item["rank"] == 1), None)
    million = _get(idx, "numero_My_Million") or _find_contains(idx, "my_million")
    million = " ".join(million.split()) or None

    return Draw(
        draw_date=draw_date,
        draw_code=_get(idx, "annee_numero_de_tirage") or None,
        weekday=normalize_weekday(_get(idx, "jour_de_tirage")),
        numbers=numbers,
        stars=stars,
        star_pool=pool,
        winners_rank1_fr=None if rank1 is None else rank1["winners_fr"],
        winners_rank1_eu=None if rank1 is None else rank1["winners_eu"],
        prize_rank1=None if rank1 is None else rank1["prize"],
        my_million=million,
        prizes=prizes,
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


def fetch_draws(
    archive_ids: list[str] | None = None,
    progress: list[str] | None = None,
) -> list[Draw]:
    by_date: dict[date, Draw] = {}
    for archive_id in archive_ids or ARCHIVES:
        if progress is not None:
            progress.append(archive_id)
        payload = download_archive(archive_id)
        for draw in parse_zip(payload):
            by_date[draw.draw_date] = draw
    return sorted(by_date.values(), key=lambda item: item.draw_date)


def fetch_all_draws(progress: list[str] | None = None) -> list[Draw]:
    return fetch_draws(ARCHIVES, progress)


def fetch_latest_draws(progress: list[str] | None = None) -> list[Draw]:
    """Archive FDJ la plus récente (fév. 2020 → aujourd'hui)."""
    return fetch_draws(ARCHIVES[:1], progress)
