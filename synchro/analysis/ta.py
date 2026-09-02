"""Indicateurs d’analyse technique (formules explicites, sans pandas-ta).

Appliqués à une série scalaire de tirages (close) ou à des bougies OHLC.
Descriptifs : les tirages EuroMillions sont indépendants.
"""

from __future__ import annotations

from typing import Any


def _period(period: int) -> int:
    n = int(period)
    if n < 1:
        raise ValueError("period doit être ≥ 1.")
    return n


def last_number(values: list[float | None]) -> float | None:
    for value in reversed(values):
        if value is not None:
            return float(value)
    return None


def sma(values: list[float], period: int) -> list[float | None]:
    p = _period(period)
    out: list[float | None] = [None] * len(values)
    if p > len(values):
        return out
    running = 0.0
    for i, value in enumerate(values):
        running += value
        if i >= p:
            running -= values[i - p]
        if i >= p - 1:
            out[i] = running / p
    return out


def ema(values: list[float], period: int) -> list[float | None]:
    p = _period(period)
    out: list[float | None] = [None] * len(values)
    if p > len(values):
        return out
    seed = sum(values[:p]) / p
    out[p - 1] = seed
    alpha = 2.0 / (p + 1)
    prev = seed
    for i in range(p, len(values)):
        prev = alpha * values[i] + (1.0 - alpha) * prev
        out[i] = prev
    return out


def rsi(values: list[float], period: int = 14) -> list[float | None]:
    """RSI de Wilder. Première valeur à l’index `period` (après `period` variations)."""
    p = _period(period)
    out: list[float | None] = [None] * len(values)
    if len(values) <= p:
        return out

    def _rsi(avg_gain: float, avg_loss: float) -> float:
        if avg_loss == 0:
            return 100.0 if avg_gain > 0 else 50.0
        if avg_gain == 0:
            return 0.0
        rs = avg_gain / avg_loss
        return 100.0 - 100.0 / (1.0 + rs)

    gains: list[float] = []
    losses: list[float] = []
    for i in range(1, p + 1):
        delta = values[i] - values[i - 1]
        gains.append(max(delta, 0.0))
        losses.append(max(-delta, 0.0))
    avg_gain = sum(gains) / p
    avg_loss = sum(losses) / p
    out[p] = _rsi(avg_gain, avg_loss)
    for i in range(p + 1, len(values)):
        delta = values[i] - values[i - 1]
        gain = max(delta, 0.0)
        loss = max(-delta, 0.0)
        avg_gain = (avg_gain * (p - 1) + gain) / p
        avg_loss = (avg_loss * (p - 1) + loss) / p
        out[i] = _rsi(avg_gain, avg_loss)
    return out


def macd(
    values: list[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> dict[str, list[float | None]]:
    if fast >= slow:
        raise ValueError("MACD: fast doit être < slow.")
    fast_line = ema(values, fast)
    slow_line = ema(values, slow)
    line: list[float | None] = []
    for a, b in zip(fast_line, slow_line):
        if a is None or b is None:
            line.append(None)
        else:
            line.append(a - b)
    compact = [v for v in line if v is not None]
    signal_compact = ema(compact, signal)
    signal_line: list[float | None] = [None] * len(line)
    hist: list[float | None] = [None] * len(line)
    compact_i = 0
    for i, value in enumerate(line):
        if value is None:
            continue
        sig = signal_compact[compact_i]
        compact_i += 1
        if sig is None:
            continue
        signal_line[i] = sig
        hist[i] = value - sig
    return {"line": line, "signal": signal_line, "histogram": hist}


def _sample_std(chunk: list[float]) -> float:
    n = len(chunk)
    if n < 2:
        return 0.0
    mean = sum(chunk) / n
    var = sum((x - mean) ** 2 for x in chunk) / (n - 1)
    return var ** 0.5


def bollinger(
    values: list[float],
    period: int = 20,
    k: float = 2.0,
) -> dict[str, list[float | None]]:
    p = _period(period)
    middle = sma(values, p)
    upper: list[float | None] = [None] * len(values)
    lower: list[float | None] = [None] * len(values)
    width = float(k)
    for i, mid in enumerate(middle):
        if mid is None:
            continue
        sigma = _sample_std(values[i - p + 1 : i + 1])
        upper[i] = mid + width * sigma
        lower[i] = mid - width * sigma
    return {"middle": middle, "upper": upper, "lower": lower}


def _true_range(candles: list[dict[str, Any]]) -> list[float]:
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


def atr(candles: list[dict[str, Any]], period: int = 14) -> list[float | None]:
    """ATR de Wilder sur des bougies `{o,h,l,c}`."""
    p = _period(period)
    tr = _true_range(candles)
    out: list[float | None] = [None] * len(candles)
    if p > len(tr):
        return out
    prev = sum(tr[:p]) / p
    out[p - 1] = prev
    for i in range(p, len(tr)):
        prev = (prev * (p - 1) + tr[i]) / p
        out[i] = prev
    return out


def _rounded(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def indicators(
    values: list[float],
    candles: list[dict[str, Any]] | None = None,
    *,
    sma_period: int = 20,
    ema_period: int = 20,
    rsi_period: int = 14,
    bb_period: int = 20,
    bb_k: float = 2.0,
    atr_period: int = 14,
    macd_fast: int = 12,
    macd_slow: int = 26,
    macd_signal: int = 9,
) -> dict[str, Any]:
    """Toutes les séries + derniers points, alignés sur `values` (et bougies pour ATR)."""
    sma_line = sma(values, sma_period)
    ema_line = ema(values, ema_period)
    rsi_line = rsi(values, rsi_period)
    macd_pack = macd(values, macd_fast, macd_slow, macd_signal)
    bands = bollinger(values, bb_period, bb_k)
    atr_line = atr(candles, atr_period) if candles else []
    return {
        "disclaimer": (
            "Chaque tirage est indépendant. SMA, EMA, RSI, MACD, Bollinger et ATR "
            "décrivent la série observée, ce ne sont pas des signaux de jeu."
        ),
        "periods": {
            "sma": sma_period,
            "ema": ema_period,
            "rsi": rsi_period,
            "bollinger": bb_period,
            "bollinger_k": bb_k,
            "atr": atr_period,
            "macd_fast": macd_fast,
            "macd_slow": macd_slow,
            "macd_signal": macd_signal,
        },
        "sma": sma_line,
        "ema": ema_line,
        "rsi": rsi_line,
        "macd": macd_pack,
        "bollinger": bands,
        "atr": atr_line,
        "last": {
            "sma": _rounded(last_number(sma_line)),
            "ema": _rounded(last_number(ema_line)),
            "rsi": _rounded(last_number(rsi_line)),
            "macd": _rounded(last_number(macd_pack["line"])),
            "macd_signal": _rounded(last_number(macd_pack["signal"])),
            "macd_histogram": _rounded(last_number(macd_pack["histogram"])),
            "bb_middle": _rounded(last_number(bands["middle"])),
            "bb_upper": _rounded(last_number(bands["upper"])),
            "bb_lower": _rounded(last_number(bands["lower"])),
            "atr": _rounded(last_number(atr_line)),
        },
    }
