"""Indicateurs du guide d’analyse technique, adaptés aux séries de tirages.

Pas de pandas / TA-Lib / sklearn. Volume → proxy d’activité (true range × count).
Les tirages sont indépendants : ces outils décrivent la série, ils ne prédisent pas.
"""

from __future__ import annotations

import math
from typing import Any

from synchro.analysis.ta import atr, bollinger, ema, last_number, rsi, sma

FIB_RETR = [0.236, 0.382, 0.5, 0.618, 0.786]
FIB_EXTEND = [1.272, 1.618, 2.0, 2.618]


def _period(period: int) -> int:
    n = int(period)
    if n < 1:
        raise ValueError("period doit être ≥ 1.")
    return n


def _closes(candles: list[dict[str, Any]]) -> list[float]:
    return [float(c["c"]) for c in candles]


def _highs(candles: list[dict[str, Any]]) -> list[float]:
    return [float(c["h"]) for c in candles]


def _lows(candles: list[dict[str, Any]]) -> list[float]:
    return [float(c["l"]) for c in candles]


def true_range(candles: list[dict[str, Any]]) -> list[float]:
    out: list[float] = []
    prev_c: float | None = None
    for candle in candles:
        high = float(candle["h"])
        low = float(candle["l"])
        close = float(candle["c"])
        tr = high - low
        if prev_c is not None:
            tr = max(tr, abs(high - prev_c), abs(low - prev_c))
        out.append(tr)
        prev_c = close
    return out


def activity(candles: list[dict[str, Any]]) -> list[float]:
    """Proxy d’activité : true range × nombre de tirages dans la bougie."""
    tr = true_range(candles)
    out: list[float] = []
    for candle, rng in zip(candles, tr):
        count = float(candle.get("count") or 1)
        out.append(max(0.0, rng) * max(1.0, count))
    return out


def activity_from_close(values: list[float]) -> list[float]:
    if not values:
        return []
    out = [0.0]
    for i in range(1, len(values)):
        out.append(abs(values[i] - values[i - 1]))
    if len(out) > 1:
        out[0] = out[1]
    else:
        out[0] = 1.0
    return out


# --- Moyennes -----------------------------------------------------------------


def wma(values: list[float], period: int) -> list[float | None]:
    p = _period(period)
    out: list[float | None] = [None] * len(values)
    if p > len(values):
        return out
    weights = list(range(1, p + 1))
    denom = sum(weights)
    for i in range(p - 1, len(values)):
        chunk = values[i - p + 1 : i + 1]
        out[i] = sum(v * w for v, w in zip(chunk, weights)) / denom
    return out


def hma(values: list[float], period: int) -> list[float | None]:
    p = _period(period)
    half = max(1, p // 2)
    sqrt_n = max(1, int(math.sqrt(p)))
    wma_half = wma(values, half)
    wma_full = wma(values, p)
    raw: list[float] = []
    raw_idx: list[int] = []
    for i, (a, b) in enumerate(zip(wma_half, wma_full)):
        if a is None or b is None:
            continue
        raw.append(2 * a - b)
        raw_idx.append(i)
    hull = wma(raw, sqrt_n)
    out: list[float | None] = [None] * len(values)
    for pos, value in zip(raw_idx, hull):
        out[pos] = value
    return out


def vwma(price: list[float], volume: list[float], period: int) -> list[float | None]:
    p = _period(period)
    out: list[float | None] = [None] * len(price)
    if p > len(price) or len(price) != len(volume):
        return out
    for i in range(p - 1, len(price)):
        num = sum(price[j] * volume[j] for j in range(i - p + 1, i + 1))
        den = sum(volume[j] for j in range(i - p + 1, i + 1))
        out[i] = num / den if den else None
    return out


def dema(values: list[float], period: int) -> list[float | None]:
    e1 = ema(values, period)
    compact = [v for v in e1 if v is not None]
    e2_compact = ema(compact, period)
    out: list[float | None] = [None] * len(values)
    compact_i = 0
    e2_i = 0
    for i, value in enumerate(e1):
        if value is None:
            continue
        e2 = e2_compact[e2_i] if e2_i < len(e2_compact) else None
        e2_i += 1
        if e2 is None:
            compact_i += 1
            continue
        out[i] = 2 * value - e2
        compact_i += 1
    return out


def ma_crosses(
    fast: list[float | None],
    slow: list[float | None],
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    prev = 0
    for i, (a, b) in enumerate(zip(fast, slow)):
        if a is None or b is None:
            continue
        side = 1 if a > b else -1 if a < b else 0
        if prev and side and side != prev:
            events.append({"index": i, "kind": "golden" if side > 0 else "death"})
        if side:
            prev = side
    return events


# --- Oscillateurs -------------------------------------------------------------


def stochastic(
    candles: list[dict[str, Any]],
    n: int = 14,
    d: int = 3,
) -> dict[str, list[float | None]]:
    p = _period(n)
    highs, lows, closes = _highs(candles), _lows(candles), _closes(candles)
    k: list[float | None] = [None] * len(candles)
    for i in range(p - 1, len(candles)):
        hh = max(highs[i - p + 1 : i + 1])
        ll = min(lows[i - p + 1 : i + 1])
        denom = hh - ll
        k[i] = 100.0 * (closes[i] - ll) / denom if denom else 50.0
    compact = [v for v in k if v is not None]
    d_compact = sma(compact, d)
    d_line: list[float | None] = [None] * len(k)
    ci = 0
    for i, value in enumerate(k):
        if value is None:
            continue
        d_line[i] = d_compact[ci]
        ci += 1
    return {"k": k, "d": d_line}


def cci(candles: list[dict[str, Any]], n: int = 20) -> list[float | None]:
    p = _period(n)
    tp = [(float(c["h"]) + float(c["l"]) + float(c["c"])) / 3 for c in candles]
    out: list[float | None] = [None] * len(candles)
    for i in range(p - 1, len(tp)):
        chunk = tp[i - p + 1 : i + 1]
        mu = sum(chunk) / p
        mad = sum(abs(x - mu) for x in chunk) / p
        out[i] = (tp[i] - mu) / (0.015 * mad) if mad else 0.0
    return out


def williams_r(candles: list[dict[str, Any]], n: int = 14) -> list[float | None]:
    p = _period(n)
    highs, lows, closes = _highs(candles), _lows(candles), _closes(candles)
    out: list[float | None] = [None] * len(candles)
    for i in range(p - 1, len(candles)):
        hh = max(highs[i - p + 1 : i + 1])
        ll = min(lows[i - p + 1 : i + 1])
        denom = hh - ll
        out[i] = -100.0 * (hh - closes[i]) / denom if denom else -50.0
    return out


# --- Tendance -----------------------------------------------------------------


def zigzag(
    prices: list[float],
    dates: list[str] | None = None,
    pct: float = 0.03,
) -> list[dict[str, Any]]:
    if not prices:
        return []
    labels = dates if dates and len(dates) == len(prices) else [str(i) for i in range(len(prices))]
    pivots: list[dict[str, Any]] = []
    last_price = prices[0]
    last_idx = 0
    direction = 0
    for idx, price in enumerate(prices):
        if last_price == 0:
            change = 0.0
        else:
            change = (price - last_price) / abs(last_price)
        if direction >= 0 and change <= -pct:
            pivots.append({"index": last_idx, "date": labels[last_idx], "price": last_price, "type": "H"})
            last_idx, last_price, direction = idx, price, -1
        elif direction <= 0 and change >= pct:
            pivots.append({"index": last_idx, "date": labels[last_idx], "price": last_price, "type": "L"})
            last_idx, last_price, direction = idx, price, 1
        elif (direction >= 0 and price > last_price) or (direction <= 0 and price < last_price):
            last_idx, last_price = idx, price
    pivots.append(
        {
            "index": last_idx,
            "date": labels[last_idx],
            "price": last_price,
            "type": "H" if direction >= 0 else "L",
        }
    )
    return pivots


def swing_structure(pivots: list[dict[str, Any]]) -> dict[str, Any]:
    highs = [p for p in pivots if p["type"] == "H"]
    lows = [p for p in pivots if p["type"] == "L"]

    def _seq(points: list[dict[str, Any]], rising_name: str, falling_name: str) -> str | None:
        if len(points) < 2:
            return None
        a, b = points[-2]["price"], points[-1]["price"]
        if b > a:
            return rising_name
        if b < a:
            return falling_name
        return "flat"

    hh_hl = _seq(highs, "HH", "LH")
    hl_ll = _seq(lows, "HL", "LL")
    trend = "range"
    if hh_hl == "HH" and hl_ll == "HL":
        trend = "up"
    elif hh_hl == "LH" and hl_ll == "LL":
        trend = "down"
    return {"highs": hh_hl, "lows": hl_ll, "trend": trend, "pivot_count": len(pivots)}


def support_resistance_levels(
    pivots: list[dict[str, Any]],
    eps_pct: float = 0.01,
) -> list[dict[str, Any]]:
    """Clustering 1D greedy (sans sklearn) des pivots proches."""
    if not pivots:
        return []
    prices = sorted(float(p["price"]) for p in pivots)
    mu = sum(prices) / len(prices)
    eps = abs(mu) * float(eps_pct) if mu else float(eps_pct)
    clusters: list[list[float]] = []
    for price in prices:
        placed = False
        for cluster in clusters:
            center = sum(cluster) / len(cluster)
            if abs(price - center) <= eps:
                cluster.append(price)
                placed = True
                break
        if not placed:
            clusters.append([price])
    levels = []
    for cluster in clusters:
        if len(cluster) < 2:
            continue
        center = sum(cluster) / len(cluster)
        nearest = min(pivots, key=lambda p: abs(float(p["price"]) - center))
        levels.append(
            {
                "price": center,
                "hits": len(cluster),
                "type": nearest["type"],
            }
        )
    levels.sort(key=lambda row: -row["hits"])
    return levels


def trendline(pivots: list[dict[str, Any]], kind: str = "support") -> dict[str, Any] | None:
    wanted = "L" if kind == "support" else "H"
    sub = [p for p in pivots if p["type"] == wanted]
    if len(sub) < 2:
        return None
    xs = list(range(len(sub)))
    ys = [float(p["price"]) for p in sub]
    xbar = sum(xs) / len(xs)
    ybar = sum(ys) / len(ys)
    den = sum((x - xbar) ** 2 for x in xs)
    if den == 0:
        return None
    a = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys)) / den
    b = ybar - a * xbar
    return {
        "kind": kind,
        "slope": a,
        "intercept": b,
        "dates": [p["date"] for p in sub],
        "prices": ys,
    }


def adx(candles: list[dict[str, Any]], n: int = 14) -> dict[str, list[float | None]]:
    p = _period(n)
    plus_di: list[float | None] = [None] * len(candles)
    minus_di: list[float | None] = [None] * len(candles)
    adx_line: list[float | None] = [None] * len(candles)
    if len(candles) < p + 1:
        return {"plus_di": plus_di, "minus_di": minus_di, "adx": adx_line}
    plus_dm = [0.0] * len(candles)
    minus_dm = [0.0] * len(candles)
    for i in range(1, len(candles)):
        up = float(candles[i]["h"]) - float(candles[i - 1]["h"])
        down = float(candles[i - 1]["l"]) - float(candles[i]["l"])
        plus_dm[i] = up if up > down and up > 0 else 0.0
        minus_dm[i] = down if down > up and down > 0 else 0.0
    tr = true_range(candles)
    atr_s = sum(tr[1 : p + 1]) / p
    plus_s = sum(plus_dm[1 : p + 1]) / p
    minus_s = sum(minus_dm[1 : p + 1]) / p
    dx_seed: list[float] = []
    if atr_s:
        pdi = 100 * plus_s / atr_s
        mdi = 100 * minus_s / atr_s
        plus_di[p] = pdi
        minus_di[p] = mdi
        denom = pdi + mdi
        dx_seed.append(100 * abs(pdi - mdi) / denom if denom else 0.0)
    for i in range(p + 1, len(candles)):
        atr_s = (atr_s * (p - 1) + tr[i]) / p
        plus_s = (plus_s * (p - 1) + plus_dm[i]) / p
        minus_s = (minus_s * (p - 1) + minus_dm[i]) / p
        pdi = 100 * plus_s / atr_s if atr_s else 0.0
        mdi = 100 * minus_s / atr_s if atr_s else 0.0
        plus_di[i] = pdi
        minus_di[i] = mdi
        denom = pdi + mdi
        dx_seed.append(100 * abs(pdi - mdi) / denom if denom else 0.0)
    if len(dx_seed) < p:
        return {"plus_di": plus_di, "minus_di": minus_di, "adx": adx_line}
    adx_prev = sum(dx_seed[:p]) / p
    first = p + p - 1
    if first < len(candles):
        adx_line[first] = adx_prev
        for i, dx in enumerate(dx_seed[p:], start=first + 1):
            adx_prev = (adx_prev * (p - 1) + dx) / p
            if i < len(candles):
                adx_line[i] = adx_prev
    return {"plus_di": plus_di, "minus_di": minus_di, "adx": adx_line}


def adx_regime(value: float | None) -> str:
    if value is None:
        return "inconnu"
    if value < 20:
        return "range"
    if value < 25:
        return "naissant"
    if value < 40:
        return "établi"
    return "fort"


def aroon(candles: list[dict[str, Any]], n: int = 25) -> dict[str, list[float | None]]:
    p = _period(n)
    highs, lows = _highs(candles), _lows(candles)
    up: list[float | None] = [None] * len(candles)
    down: list[float | None] = [None] * len(candles)
    osc: list[float | None] = [None] * len(candles)
    for i in range(p, len(candles)):
        window_h = highs[i - p : i + 1]
        window_l = lows[i - p : i + 1]
        hi = max(window_h)
        lo = min(window_l)
        since_h = next(j for j in range(p, -1, -1) if window_h[j] == hi)
        since_l = next(j for j in range(p, -1, -1) if window_l[j] == lo)
        up[i] = 100.0 * since_h / p
        down[i] = 100.0 * since_l / p
        osc[i] = up[i] - down[i]
    return {"aroon_up": up, "aroon_down": down, "aroon_osc": osc}


def supertrend(
    candles: list[dict[str, Any]],
    n: int = 10,
    mult: float = 3.0,
) -> dict[str, list[Any]]:
    atr_line = atr(candles, n)
    line: list[float | None] = [None] * len(candles)
    direction: list[int | None] = [None] * len(candles)
    final_upper: list[float | None] = [None] * len(candles)
    final_lower: list[float | None] = [None] * len(candles)
    prev_dir = 1
    for i, candle in enumerate(candles):
        atr_i = atr_line[i]
        if atr_i is None:
            continue
        hl2 = (float(candle["h"]) + float(candle["l"])) / 2
        basic_upper = hl2 + mult * atr_i
        basic_lower = hl2 - mult * atr_i
        close = float(candle["c"])
        prev_u = final_upper[i - 1] if i else None
        prev_l = final_lower[i - 1] if i else None
        prev_c = float(candles[i - 1]["c"]) if i else close
        if prev_u is None or prev_c > prev_u:
            final_upper[i] = basic_upper
        else:
            final_upper[i] = min(basic_upper, prev_u)
        if prev_l is None or prev_c < prev_l:
            final_lower[i] = basic_lower
        else:
            final_lower[i] = max(basic_lower, prev_l)
        if prev_u is not None and close > prev_u:
            prev_dir = 1
        elif prev_l is not None and close < prev_l:
            prev_dir = -1
        direction[i] = prev_dir
        line[i] = final_lower[i] if prev_dir == 1 else final_upper[i]
    return {"supertrend": line, "dir": direction}


def parabolic_sar(
    candles: list[dict[str, Any]],
    step: float = 0.02,
    max_af: float = 0.20,
) -> list[float | None]:
    out: list[float | None] = [None] * len(candles)
    if len(candles) < 2:
        return out
    bull = float(candles[1]["c"]) >= float(candles[0]["c"])
    sar = float(candles[0]["l"]) if bull else float(candles[0]["h"])
    ep = float(candles[0]["h"]) if bull else float(candles[0]["l"])
    af = step
    out[0] = sar
    for i in range(1, len(candles)):
        high = float(candles[i]["h"])
        low = float(candles[i]["l"])
        sar = sar + af * (ep - sar)
        if bull:
            if i >= 2:
                sar = min(sar, float(candles[i - 1]["l"]), float(candles[i - 2]["l"]))
            else:
                sar = min(sar, float(candles[i - 1]["l"]))
            if low < sar:
                bull = False
                sar = ep
                ep = low
                af = step
            else:
                if high > ep:
                    ep = high
                    af = min(max_af, af + step)
        else:
            if i >= 2:
                sar = max(sar, float(candles[i - 1]["h"]), float(candles[i - 2]["h"]))
            else:
                sar = max(sar, float(candles[i - 1]["h"]))
            if high > sar:
                bull = True
                sar = ep
                ep = high
                af = step
            else:
                if low < ep:
                    ep = low
                    af = min(max_af, af + step)
        out[i] = sar
    return out


# --- Volatilité ---------------------------------------------------------------


def bollinger_full(
    values: list[float],
    period: int = 20,
    k: float = 2.0,
) -> dict[str, list[float | None]]:
    bands = bollinger(values, period, k)
    pct_b: list[float | None] = [None] * len(values)
    width: list[float | None] = [None] * len(values)
    for i, mid in enumerate(bands["middle"]):
        up, lo = bands["upper"][i], bands["lower"][i]
        if mid is None or up is None or lo is None:
            continue
        span = up - lo
        pct_b[i] = (values[i] - lo) / span if span else 0.5
        width[i] = span / mid if mid else None
    return {
        "middle": bands["middle"],
        "upper": bands["upper"],
        "lower": bands["lower"],
        "percent_b": pct_b,
        "width": width,
    }


def keltner(
    candles: list[dict[str, Any]],
    n: int = 20,
    k: float = 2.0,
) -> dict[str, list[float | None]]:
    closes = _closes(candles)
    mid = ema(closes, n)
    atr_line = atr(candles, n)
    upper: list[float | None] = [None] * len(candles)
    lower: list[float | None] = [None] * len(candles)
    for i, m in enumerate(mid):
        a = atr_line[i] if i < len(atr_line) else None
        if m is None or a is None:
            continue
        upper[i] = m + k * a
        lower[i] = m - k * a
    return {"middle": mid, "upper": upper, "lower": lower}


def donchian(candles: list[dict[str, Any]], n: int = 20) -> dict[str, list[float | None]]:
    p = _period(n)
    highs, lows = _highs(candles), _lows(candles)
    upper: list[float | None] = [None] * len(candles)
    lower: list[float | None] = [None] * len(candles)
    mid: list[float | None] = [None] * len(candles)
    for i in range(p - 1, len(candles)):
        uh = max(highs[i - p + 1 : i + 1])
        ll = min(lows[i - p + 1 : i + 1])
        upper[i] = uh
        lower[i] = ll
        mid[i] = (uh + ll) / 2
    return {"upper": upper, "lower": lower, "middle": mid}


def squeeze(
    bb: dict[str, list[float | None]],
    kc: dict[str, list[float | None]],
) -> list[bool | None]:
    out: list[bool | None] = [None] * len(bb["upper"])
    for i, (bu, bl, ku, kl) in enumerate(zip(bb["upper"], bb["lower"], kc["upper"], kc["lower"])):
        if None in (bu, bl, ku, kl):
            continue
        out[i] = bu <= ku and bl >= kl  # type: ignore[operator]
    return out


# --- Ichimoku / Fibonacci / pivots -------------------------------------------


def ichimoku(
    candles: list[dict[str, Any]],
    tenkan: int = 9,
    kijun: int = 26,
    senkou: int = 52,
) -> dict[str, list[float | None]]:
    highs, lows, closes = _highs(candles), _lows(candles), _closes(candles)
    n = len(candles)
    t_line: list[float | None] = [None] * n
    k_line: list[float | None] = [None] * n
    senkou_b_raw: list[float | None] = [None] * n
    for i in range(n):
        if i + 1 >= tenkan:
            t_line[i] = (max(highs[i + 1 - tenkan : i + 1]) + min(lows[i + 1 - tenkan : i + 1])) / 2
        if i + 1 >= kijun:
            k_line[i] = (max(highs[i + 1 - kijun : i + 1]) + min(lows[i + 1 - kijun : i + 1])) / 2
        if i + 1 >= senkou:
            senkou_b_raw[i] = (max(highs[i + 1 - senkou : i + 1]) + min(lows[i + 1 - senkou : i + 1])) / 2
    senkou_a: list[float | None] = [None] * n
    senkou_b: list[float | None] = [None] * n
    chikou: list[float | None] = [None] * n
    for i in range(n):
        if t_line[i] is not None and k_line[i] is not None:
            dest = i + kijun
            if dest < n:
                senkou_a[dest] = (t_line[i] + k_line[i]) / 2  # type: ignore[operator]
        if senkou_b_raw[i] is not None:
            dest = i + kijun
            if dest < n:
                senkou_b[dest] = senkou_b_raw[i]
        src = i + kijun
        if src < n:
            chikou[i] = closes[src]
    return {
        "tenkan": t_line,
        "kijun": k_line,
        "senkou_a": senkou_a,
        "senkou_b": senkou_b,
        "chikou": chikou,
    }


def fib_levels(swing_low: float, swing_high: float, bullish: bool = True) -> dict[str, dict[str, float]]:
    rng = swing_high - swing_low
    if bullish:
        retr = {str(r): swing_high - r * rng for r in FIB_RETR}
        ext = {str(r): swing_high + (r - 1) * rng for r in FIB_EXTEND}
    else:
        retr = {str(r): swing_low + r * rng for r in FIB_RETR}
        ext = {str(r): swing_low - (r - 1) * rng for r in FIB_EXTEND}
    return {"retracements": retr, "extensions": ext}


def fib_from_pivots(pivots: list[dict[str, Any]]) -> dict[str, Any] | None:
    if len(pivots) < 2:
        return None
    last, prev = pivots[-1], pivots[-2]
    high = max(float(last["price"]), float(prev["price"]))
    low = min(float(last["price"]), float(prev["price"]))
    bullish = last["type"] == "L" or float(last["price"]) > float(prev["price"])
    if last["type"] == "L":
        bullish = True
    elif last["type"] == "H":
        bullish = False
    pack = fib_levels(low, high, bullish=bullish)
    pack["swing_low"] = low
    pack["swing_high"] = high
    pack["bullish"] = bullish
    pack["from"] = prev["date"]
    pack["to"] = last["date"]
    return pack


def pivots_classic(prev_h: float, prev_l: float, prev_c: float) -> dict[str, float]:
    p = (prev_h + prev_l + prev_c) / 3
    return {
        "P": p,
        "R1": 2 * p - prev_l,
        "S1": 2 * p - prev_h,
        "R2": p + (prev_h - prev_l),
        "S2": p - (prev_h - prev_l),
        "R3": prev_h + 2 * (p - prev_l),
        "S3": prev_l - 2 * (prev_h - p),
    }


def pivots_fibonacci(prev_h: float, prev_l: float, prev_c: float) -> dict[str, float]:
    p = (prev_h + prev_l + prev_c) / 3
    rng = prev_h - prev_l
    return {
        "P": p,
        "R1": p + 0.382 * rng,
        "R2": p + 0.618 * rng,
        "R3": p + 1.0 * rng,
        "S1": p - 0.382 * rng,
        "S2": p - 0.618 * rng,
        "S3": p - 1.0 * rng,
    }


def pivots_camarilla(prev_h: float, prev_l: float, prev_c: float) -> dict[str, float]:
    rng = prev_h - prev_l
    return {
        "P": prev_c,
        "H4": prev_c + 1.1 * rng / 2,
        "H3": prev_c + 1.1 * rng / 4,
        "L3": prev_c - 1.1 * rng / 4,
        "L4": prev_c - 1.1 * rng / 2,
    }


def pivots_woodie(prev_h: float, prev_l: float, prev_c: float) -> dict[str, float]:
    p = (prev_h + prev_l + 2 * prev_c) / 4
    return {
        "P": p,
        "R1": 2 * p - prev_l,
        "S1": 2 * p - prev_h,
        "R2": p + (prev_h - prev_l),
        "S2": p - (prev_h - prev_l),
    }


def pivots_from_prev_candle(candle: dict[str, Any] | None) -> dict[str, Any] | None:
    if not candle:
        return None
    h, l, c = float(candle["h"]), float(candle["l"]), float(candle["c"])
    return {
        "classic": pivots_classic(h, l, c),
        "fibonacci": pivots_fibonacci(h, l, c),
        "camarilla": pivots_camarilla(h, l, c),
        "woodie": pivots_woodie(h, l, c),
        "source": {"from": candle.get("from"), "to": candle.get("to"), "key": candle.get("key")},
    }


def breakout_targets(support: float, resistance: float, breakout: float, bullish: bool = True) -> dict[str, float]:
    height = abs(resistance - support)
    if bullish:
        measured = breakout + height
        fib = breakout + 0.618 * height
    else:
        measured = breakout - height
        fib = breakout - 0.618 * height
    return {"measured_move": measured, "fib_1618_leg": fib, "height": height}


# --- Flux ---------------------------------------------------------------------


def obv(closes: list[float], volume: list[float]) -> list[float]:
    out: list[float] = []
    acc = 0.0
    prev = closes[0] if closes else 0.0
    for close, vol in zip(closes, volume):
        if close > prev:
            acc += vol
        elif close < prev:
            acc -= vol
        out.append(acc)
        prev = close
    return out


def adl(candles: list[dict[str, Any]], volume: list[float]) -> list[float]:
    acc = 0.0
    out: list[float] = []
    for candle, vol in zip(candles, volume):
        h, l, c = float(candle["h"]), float(candle["l"]), float(candle["c"])
        denom = h - l
        mfm = ((c - l) - (h - c)) / denom if denom else 0.0
        acc += mfm * vol
        out.append(acc)
    return out


def mfi(candles: list[dict[str, Any]], volume: list[float], n: int = 14) -> list[float | None]:
    p = _period(n)
    tp = [(float(c["h"]) + float(c["l"]) + float(c["c"])) / 3 for c in candles]
    mf = [t * v for t, v in zip(tp, volume)]
    out: list[float | None] = [None] * len(candles)
    for i in range(p, len(candles)):
        pos = neg = 0.0
        for j in range(i - p + 1, i + 1):
            if tp[j] > tp[j - 1]:
                pos += mf[j]
            elif tp[j] < tp[j - 1]:
                neg += mf[j]
        if neg == 0:
            out[i] = 100.0 if pos else 50.0
        else:
            mr = pos / neg
            out[i] = 100 - 100 / (1 + mr)
    return out


def vwap(candles: list[dict[str, Any]], volume: list[float]) -> list[float | None]:
    """VWAP reset au début de la liste (fenêtre de travail, pas l’historique entier)."""
    num = den = 0.0
    out: list[float | None] = [None] * len(candles)
    for i, (candle, vol) in enumerate(zip(candles, volume)):
        tp = (float(candle["h"]) + float(candle["l"]) + float(candle["c"])) / 3
        num += tp * vol
        den += vol
        out[i] = num / den if den else None
    return out


# --- Graphiques alt -----------------------------------------------------------


def renko(closes: list[float], dates: list[str] | None, brick: float) -> list[dict[str, Any]]:
    size = abs(float(brick)) or 1.0
    if not closes:
        return []
    labels = dates if dates and len(dates) == len(closes) else [str(i) for i in range(len(closes))]
    level = closes[0]
    bricks: list[dict[str, Any]] = []
    for price, label in zip(closes, labels):
        while price >= level + size:
            prev = level
            level += size
            bricks.append({"from": prev, "to": level, "dir": 1, "date": label, "o": prev, "h": level, "l": prev, "c": level})
        while price <= level - size:
            prev = level
            level -= size
            bricks.append({"from": prev, "to": level, "dir": -1, "date": label, "o": prev, "h": prev, "l": level, "c": level})
    return bricks


def kagi(closes: list[float], dates: list[str] | None, threshold: float) -> list[dict[str, Any]]:
    if not closes:
        return []
    labels = dates if dates and len(dates) == len(closes) else [str(i) for i in range(len(closes))]
    lines: list[dict[str, Any]] = []
    extreme = closes[0]
    direction = 0
    start = 0
    for i, price in enumerate(closes):
        if direction == 0:
            if abs(price - extreme) >= threshold:
                direction = 1 if price > extreme else -1
                extreme = price
            continue
        if direction == 1:
            if price > extreme:
                extreme = price
            elif extreme - price >= threshold:
                lines.append({"from": labels[start], "to": labels[i], "yang": True, "price": extreme, "o": closes[start], "c": extreme, "h": extreme, "l": min(closes[start], extreme)})
                start = i
                direction = -1
                extreme = price
        else:
            if price < extreme:
                extreme = price
            elif price - extreme >= threshold:
                lines.append({"from": labels[start], "to": labels[i], "yang": False, "price": extreme, "o": closes[start], "c": extreme, "h": max(closes[start], extreme), "l": extreme})
                start = i
                direction = 1
                extreme = price
    return lines


def point_and_figure(
    closes: list[float],
    box: float,
    reversal: int = 3,
) -> list[dict[str, Any]]:
    size = abs(float(box)) or 1.0
    if not closes:
        return []
    columns: list[dict[str, Any]] = []
    direction = 0
    current = round(closes[0] / size) * size
    height = 1
    for price in closes[1:]:
        if direction >= 0 and price >= current + size:
            steps = int((price - current) / size)
            height += steps
            current += steps * size
            direction = 1
        elif direction <= 0 and price <= current - size:
            steps = int((current - price) / size)
            height += steps
            current -= steps * size
            direction = -1
        elif direction > 0 and current - price >= reversal * size:
            columns.append({"type": "X", "price": current, "boxes": height})
            direction = -1
            height = reversal
            current -= reversal * size
        elif direction < 0 and price - current >= reversal * size:
            columns.append({"type": "O", "price": current, "boxes": height})
            direction = 1
            height = reversal
            current += reversal * size
    if direction:
        columns.append({"type": "X" if direction > 0 else "O", "price": current, "boxes": height})
    return columns


# --- Figures ------------------------------------------------------------------


def _body(o: float, c: float) -> float:
    return abs(c - o)


def is_doji(o: float, h: float, l: float, c: float, tol: float = 0.1) -> bool:
    return _body(o, c) <= tol * (h - l + 1e-9)


def is_hammer(o: float, h: float, l: float, c: float) -> bool:
    body = _body(o, c)
    lower = min(o, c) - l
    upper = h - max(o, c)
    return body > 0 and lower > 2 * body and upper < body


def is_shooting_star(o: float, h: float, l: float, c: float) -> bool:
    body = _body(o, c)
    lower = min(o, c) - l
    upper = h - max(o, c)
    return body > 0 and upper > 2 * body and lower < body


def is_bullish_engulfing(prev: dict[str, Any], cur: dict[str, Any]) -> bool:
    po, pc = float(prev["o"]), float(prev["c"])
    o, c = float(cur["o"]), float(cur["c"])
    return pc < po and c > o and c >= po and o <= pc


def is_bearish_engulfing(prev: dict[str, Any], cur: dict[str, Any]) -> bool:
    po, pc = float(prev["o"]), float(prev["c"])
    o, c = float(cur["o"]), float(cur["c"])
    return pc > po and c < o and c <= po and o >= pc


def is_morning_star(bars: list[dict[str, Any]]) -> bool:
    if len(bars) < 3:
        return False
    b1, b2, b3 = bars[-3], bars[-2], bars[-1]
    return (
        float(b1["c"]) < float(b1["o"])
        and _body(float(b2["o"]), float(b2["c"])) < 0.3 * (float(b1["o"]) - float(b1["c"]) + 1e-9)
        and float(b3["c"]) > float(b3["o"])
        and float(b3["c"]) > (float(b1["o"]) + float(b1["c"])) / 2
    )


def detect_candles(candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for i, candle in enumerate(candles):
        o, h, l, c = float(candle["o"]), float(candle["h"]), float(candle["l"]), float(candle["c"])
        labels: list[str] = []
        if is_doji(o, h, l, c):
            labels.append("doji")
        if is_hammer(o, h, l, c):
            labels.append("marteau")
        if is_shooting_star(o, h, l, c):
            labels.append("étoile filante")
        if i > 0 and is_bullish_engulfing(candles[i - 1], candle):
            labels.append("avalement haussier")
        if i > 0 and is_bearish_engulfing(candles[i - 1], candle):
            labels.append("avalement baissier")
        if i >= 2 and is_morning_star(candles[: i + 1]):
            labels.append("étoile du matin")
        for name in labels:
            found.append(
                {
                    "index": i,
                    "key": candle.get("key"),
                    "from": candle.get("from"),
                    "to": candle.get("to"),
                    "name": name,
                }
            )
    return found


def _near(a: float, b: float, eps: float) -> bool:
    scale = max(abs(a), abs(b), 1.0)
    return abs(a - b) <= eps * scale


def detect_chart_patterns(pivots: list[dict[str, Any]], eps: float = 0.03) -> list[dict[str, Any]]:
    patterns: list[dict[str, Any]] = []
    highs = [p for p in pivots if p["type"] == "H"]
    lows = [p for p in pivots if p["type"] == "L"]
    if len(highs) >= 2:
        a, b = highs[-2], highs[-1]
        if _near(float(a["price"]), float(b["price"]), eps):
            troughs = [p for p in lows if a["index"] < p["index"] < b["index"]]
            neck = float(troughs[-1]["price"]) if troughs else min(float(a["price"]), float(b["price"]))
            height = abs(float(a["price"]) - neck)
            patterns.append(
                {
                    "name": "double sommet",
                    "kind": "reversal_down",
                    "from": a["date"],
                    "to": b["date"],
                    "target": neck - height,
                    "neck": neck,
                }
            )
    if len(lows) >= 2:
        a, b = lows[-2], lows[-1]
        if _near(float(a["price"]), float(b["price"]), eps):
            peaks = [p for p in highs if a["index"] < p["index"] < b["index"]]
            neck = float(peaks[-1]["price"]) if peaks else max(float(a["price"]), float(b["price"]))
            height = abs(neck - float(a["price"]))
            patterns.append(
                {
                    "name": "double creux",
                    "kind": "reversal_up",
                    "from": a["date"],
                    "to": b["date"],
                    "target": neck + height,
                    "neck": neck,
                }
            )
    if len(highs) >= 3 and len(lows) >= 2:
        h1, h2, h3 = highs[-3], highs[-2], highs[-1]
        if float(h2["price"]) > float(h1["price"]) and float(h2["price"]) > float(h3["price"]) and _near(
            float(h1["price"]), float(h3["price"]), eps
        ):
            neck_lows = [p for p in lows if h1["index"] < p["index"] < h3["index"]]
            if len(neck_lows) >= 2:
                neck = (float(neck_lows[0]["price"]) + float(neck_lows[-1]["price"])) / 2
                height = float(h2["price"]) - neck
                patterns.append(
                    {
                        "name": "tête et épaules",
                        "kind": "reversal_down",
                        "from": h1["date"],
                        "to": h3["date"],
                        "target": neck - height,
                        "neck": neck,
                    }
                )
    if len(highs) >= 2 and len(lows) >= 2:
        recent = pivots[-6:]
        hs = [float(p["price"]) for p in recent if p["type"] == "H"]
        ls = [float(p["price"]) for p in recent if p["type"] == "L"]
        if len(hs) >= 2 and len(ls) >= 2:
            if max(hs) - min(hs) <= eps * max(hs) and max(ls) - min(ls) <= eps * max(abs(x) for x in ls):
                top, bot = sum(hs) / len(hs), sum(ls) / len(ls)
                height = top - bot
                patterns.append(
                    {
                        "name": "rectangle",
                        "kind": "range",
                        "from": recent[0]["date"],
                        "to": recent[-1]["date"],
                        "target_up": top + height,
                        "target_down": bot - height,
                        "neck": (top + bot) / 2,
                    }
                )
    return patterns


def activity_confirms(volume: list[float], index: int, period: int = 20) -> bool:
    if index < 0 or index >= len(volume):
        return False
    start = max(0, index - period)
    chunk = volume[start:index]
    if not chunk:
        return False
    return volume[index] > sum(chunk) / len(chunk)


# --- Système ------------------------------------------------------------------


def position_size(
    capital: float,
    risk_pct: float,
    entry: float,
    stop: float,
    contract_size: float = 1.0,
) -> int:
    risk_amount = capital * risk_pct
    per_unit = abs(entry - stop) * contract_size
    if per_unit <= 0:
        return 0
    return int(risk_amount // per_unit)


def kelly_fraction(win_rate: float, payoff: float, fraction: float = 0.5) -> float:
    if payoff <= 0:
        return 0.0
    raw = win_rate - (1 - win_rate) / payoff
    return max(0.0, raw * fraction)


def backtest(
    closes: list[float],
    entry: list[bool],
    exit_: list[bool],
    fee: float = 0.001,
) -> dict[str, list[float]]:
    n = len(closes)
    position = [0] * n
    in_pos = False
    for i in range(n):
        if not in_pos and entry[i]:
            in_pos = True
        elif in_pos and exit_[i]:
            in_pos = False
        position[i] = 1 if in_pos else 0
    returns = [0.0]
    for i in range(1, n):
        if closes[i - 1] == 0:
            returns.append(0.0)
        else:
            returns.append(closes[i] / closes[i - 1] - 1.0)
    strat = [0.0] * n
    for i in range(1, n):
        prev_pos = position[i - 1]
        turnover = abs(position[i] - prev_pos)
        strat[i] = returns[i] * prev_pos - turnover * fee
    equity = []
    acc = 1.0
    for r in strat:
        acc *= 1 + r
        equity.append(acc)
    return {"equity": equity, "returns": strat, "position": [float(p) for p in position]}


def metrics(returns: list[float], periods_per_year: float = 104.0, rf: float = 0.0) -> dict[str, float | None]:
    """EuroMillions ≈ 104 tirages / an (mardi + vendredi)."""
    n = len(returns)
    if n == 0:
        return {
            "cagr": None,
            "sharpe": None,
            "sortino": None,
            "max_dd": None,
            "calmar": None,
            "hit": None,
            "profit_factor": None,
            "expectancy": None,
        }
    mu = (sum(returns) / n) * periods_per_year
    var = sum((r - sum(returns) / n) ** 2 for r in returns) / n if n else 0.0
    sd = math.sqrt(var * periods_per_year)
    downs = [r for r in returns if r < 0]
    dvar = sum(x * x for x in downs) / len(downs) if downs else 0.0
    downside = math.sqrt(dvar * periods_per_year) if downs else 0.0
    equity = 1.0
    peak = 1.0
    max_dd = 0.0
    for r in returns:
        equity *= 1 + r
        peak = max(peak, equity)
        dd = equity / peak - 1
        max_dd = min(max_dd, dd)
    cagr = equity ** (periods_per_year / n) - 1 if equity > 0 else None
    gains = [r for r in returns if r > 0]
    losses = [r for r in returns if r < 0]
    pf = (sum(gains) / abs(sum(losses))) if losses and sum(losses) != 0 else None
    expectancy = (len(gains) / n) * (sum(gains) / len(gains) if gains else 0) + (
        len(losses) / n
    ) * (sum(losses) / len(losses) if losses else 0)
    return {
        "cagr": cagr,
        "sharpe": (mu - rf) / sd if sd else None,
        "sortino": (mu - rf) / downside if downside else None,
        "max_dd": max_dd,
        "calmar": (mu - rf) / abs(max_dd) if max_dd else None,
        "hit": sum(1 for r in returns if r > 0) / n,
        "profit_factor": pf,
        "expectancy": expectancy,
    }


def donchian_adx_signals(
    candles: list[dict[str, Any]],
    donchian_n: int = 20,
    adx_n: int = 14,
    adx_min: float = 25.0,
) -> dict[str, list[bool]]:
    dc = donchian(candles, donchian_n)
    pack = adx(candles, adx_n)
    entry = [False] * len(candles)
    exit_ = [False] * len(candles)
    for i, candle in enumerate(candles):
        if i == 0:
            continue
        close = float(candle["c"])
        prev_up = dc["upper"][i - 1]
        prev_mid = dc["middle"][i - 1]
        adx_now = pack["adx"][i]
        if prev_up is not None and adx_now is not None and close > prev_up and adx_now > adx_min:
            entry[i] = True
        if prev_mid is not None and close < prev_mid:
            exit_[i] = True
        if adx_now is not None and adx_now < 20:
            exit_[i] = True
    return {"entry": entry, "exit": exit_}


def walk_forward(
    candles: list[dict[str, Any]],
    window: int,
    step: int | None = None,
    fee: float = 0.001,
) -> list[dict[str, Any]]:
    window = max(10, int(window))
    step = max(1, int(step or window))
    closes = _closes(candles)
    rows: list[dict[str, Any]] = []
    for start in range(0, max(0, len(candles) - window + 1), step):
        chunk = candles[start : start + window]
        if len(chunk) < 10:
            continue
        sig = donchian_adx_signals(chunk)
        bt = backtest(_closes(chunk), sig["entry"], sig["exit"], fee=fee)
        rows.append(
            {
                "from": chunk[0].get("from") or chunk[0].get("key"),
                "to": chunk[-1].get("to") or chunk[-1].get("key"),
                "n": len(chunk),
                "metrics": metrics(bt["returns"]),
            }
        )
    return rows


def divergences(
    prices: list[float],
    oscillator: list[float | None],
    pivots: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    highs = [p for p in pivots if p["type"] == "H"]
    lows = [p for p in pivots if p["type"] == "L"]
    if len(highs) >= 2:
        a, b = highs[-2], highs[-1]
        oa, ob = oscillator[a["index"]], oscillator[b["index"]]
        if oa is not None and ob is not None and b["price"] > a["price"] and ob < oa:
            found.append({"kind": "bearish", "from": a["date"], "to": b["date"]})
    if len(lows) >= 2:
        a, b = lows[-2], lows[-1]
        oa, ob = oscillator[a["index"]], oscillator[b["index"]]
        if oa is not None and ob is not None and b["price"] < a["price"] and ob > oa:
            found.append({"kind": "bullish", "from": a["date"], "to": b["date"]})
    return found


def tech_pack(
    values: list[float],
    candles: list[dict[str, Any]],
    dates: list[str] | None = None,
    *,
    sma_period: int = 20,
    zigzag_pct: float = 0.03,
    warmup_count: int = 0,
) -> dict[str, Any]:
    """Pack complet pour l’API / le lab. Séries alignées sur `values` (avec warmup)."""
    labels = dates if dates and len(dates) == len(values) else [str(i) for i in range(len(values))]
    act = activity(candles) if candles else activity_from_close(values)
    if candles and len(act) != len(values):
        # bougies agrégées : activité sur les closes unitaires
        act = activity_from_close(values)
    use_candles = candles if candles and len(candles) == len(values) else [
        {"o": values[i - 1] if i else values[0], "h": max(values[i - 1] if i else values[0], values[i]), "l": min(values[i - 1] if i else values[0], values[i]), "c": values[i], "count": 1, "key": labels[i], "from": labels[i], "to": labels[i]}
        for i in range(len(values))
    ] if values else []
    if not act:
        act = activity_from_close(values)
    wma_line = wma(values, sma_period)
    hma_line = hma(values, sma_period)
    vwma_line = vwma(values, act, sma_period)
    stoch = stochastic(use_candles)
    cci_line = cci(use_candles)
    wr = williams_r(use_candles)
    adx_pack = adx(use_candles)
    aroon_pack = aroon(use_candles)
    st_pack = supertrend(use_candles)
    sar = parabolic_sar(use_candles)
    bb = bollinger_full(values, sma_period)
    kc = keltner(use_candles, sma_period)
    dc = donchian(use_candles, sma_period)
    ichi = ichimoku(use_candles)
    piv = zigzag(values, labels, zigzag_pct)
    fib = fib_from_pivots(piv)
    sr = support_resistance_levels(piv)
    structure = swing_structure(piv)
    rsi_values = rsi(values, 14)
    divs = divergences(values, rsi_values, piv)
    candle_hits = detect_candles(use_candles)
    chart_hits = detect_chart_patterns(piv)
    obv_line = obv(values, act)
    adl_line = adl(use_candles, act)
    mfi_line = mfi(use_candles, act)
    work_candles = use_candles[warmup_count:]
    work_act = act[warmup_count:]
    vwap_line = vwap(work_candles, work_act) if work_candles else []
    prev = work_candles[-2] if len(work_candles) >= 2 else (work_candles[-1] if work_candles else None)
    pivot_pack = pivots_from_prev_candle(prev)
    sig = donchian_adx_signals(work_candles) if work_candles else {"entry": [], "exit": []}
    closes_work = [float(c["c"]) for c in work_candles]
    bt = backtest(closes_work, sig["entry"], sig["exit"]) if closes_work else {"equity": [], "returns": [], "position": []}
    met = metrics(bt["returns"]) if bt["returns"] else metrics([])
    brick = last_number(atr(use_candles, 14)) or (_std_simple(values) or 1.0)
    wf = walk_forward(work_candles, window=max(20, sma_period * 2)) if len(work_candles) >= 20 else []
    sma_fast = sma(values, min(50, max(5, sma_period)))
    sma_slow = sma(values, min(200, max(10, sma_period * 4)))
    crosses = ma_crosses(sma_fast, sma_slow)
    last_adx = last_number(adx_pack["adx"])
    return {
        "disclaimer": (
            "Chaque tirage est indépendant. Ces indicateurs décrivent la série observée "
            "dans la fenêtre choisie, ce ne sont pas des signaux de jeu. "
            "Chikou / Ichimoku sont affichés, pas utilisés comme signal temps réel. "
            "L’activité n’est pas un volume de marché."
        ),
        "zigzag": piv,
        "structure": structure,
        "support_resistance": sr,
        "trendline_support": trendline(piv, "support"),
        "trendline_resistance": trendline(piv, "resistance"),
        "wma": wma_line,
        "hma": hma_line,
        "vwma": vwma_line,
        "crosses": crosses,
        "stochastic": stoch,
        "cci": cci_line,
        "williams_r": wr,
        "adx": adx_pack,
        "adx_regime": adx_regime(last_adx),
        "aroon": aroon_pack,
        "supertrend": st_pack,
        "psar": sar,
        "bollinger": bb,
        "keltner": kc,
        "donchian": dc,
        "squeeze": squeeze(bb, kc),
        "ichimoku": ichi,
        "fibonacci": fib,
        "pivots": pivot_pack,
        "candlestick_patterns": candle_hits,
        "chart_patterns": chart_hits,
        "divergences": divs,
        "activity": act,
        "obv": obv_line,
        "adl": adl_line,
        "mfi": mfi_line,
        "vwap": vwap_line,
        "renko": renko(values, labels, brick / 2 if brick else 1.0),
        "kagi": kagi(values, labels, abs(brick) if brick else 1.0),
        "pnf": point_and_figure(values, (brick / 4) if brick else 1.0),
        "system": {
            "signals": sig,
            "backtest": {"equity": bt["equity"], "returns": bt["returns"]},
            "metrics": met,
            "walk_forward": wf,
            "position_size_example": position_size(20000, 0.01, 100, 96),
            "kelly_half": kelly_fraction(met["hit"] or 0.4, 2.0, 0.5),
        },
        "last": {
            "wma": last_number(wma_line),
            "hma": last_number(hma_line),
            "adx": last_adx,
            "cci": last_number(cci_line),
            "stoch_k": last_number(stoch["k"]),
            "mfi": last_number(mfi_line),
            "vwap": last_number(vwap_line),
            "percent_b": last_number(bb["percent_b"]),
            "atr": last_number(atr(use_candles, 14)),
        },
    }


def _std_simple(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mu = sum(values) / len(values)
    return (sum((x - mu) ** 2 for x in values) / (len(values) - 1)) ** 0.5
