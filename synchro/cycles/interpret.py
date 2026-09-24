"""Fit walk-forward, atlas VSN, attention repliée, ablation et nuls.

Le décodage est causal : à l'origine t l'encodeur ne voit que les tirages
strictement avant t. Les horloges de l'horizon sont des phases de calendrier.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from synchro.cycles import torch_available
from synchro.cycles.panel import build_panel
from synchro.cycles.registry import dominant_period

_BINS = 8


def _too_short(n: int, encoder: int, horizon: int) -> str | None:
    need = encoder + horizon + 4
    if n < need:
        return f"Série trop courte ({n} tirages, il en faut au moins {need})."
    return None


def _windows(
    past: np.ndarray,
    known: np.ndarray,
    target: np.ndarray,
    encoder: int,
    horizon: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    origins = []
    past_w = []
    known_w = []
    future = []
    n = target.shape[0]
    for origin in range(encoder, n - horizon + 1):
        origins.append(origin)
        past_w.append(past[origin - encoder : origin])
        known_w.append(known[origin - encoder : origin + horizon])
        future.append(target[origin : origin + horizon])
    return (
        np.asarray(origins, dtype=int),
        np.stack(past_w).astype(np.float32),
        np.stack(known_w).astype(np.float32),
        np.stack(future).astype(np.float32),
    )


def _standardize(
    past: np.ndarray,
    target: np.ndarray,
    train_end: int,
) -> tuple[np.ndarray, np.ndarray, dict[str, np.ndarray]]:
    past_mu = past[:train_end].mean(axis=0)
    past_sd = past[:train_end].std(axis=0)
    past_sd = np.where(past_sd < 1e-6, 1.0, past_sd)
    tgt_mu = float(target[:train_end].mean())
    tgt_sd = float(target[:train_end].std())
    if tgt_sd < 1e-6:
        tgt_sd = 1.0
    scaled_past = (past - past_mu) / past_sd
    scaled_target = (target - tgt_mu) / tgt_sd
    return (
        scaled_past.astype(np.float32),
        scaled_target.astype(np.float32),
        {"past_mu": past_mu, "past_sd": past_sd, "tgt_mu": tgt_mu, "tgt_sd": tgt_sd},
    )


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    left = np.asarray(a, dtype=float)
    right = np.asarray(b, dtype=float)
    denom = float(np.linalg.norm(left) * np.linalg.norm(right))
    if denom < 1e-12:
        return 0.0
    return float(np.dot(left, right) / denom)


def fold_attention(
    attention: np.ndarray,
    phases: np.ndarray,
    origins: np.ndarray,
    encoder: int,
    *,
    bins: int = _BINS,
) -> list[float]:
    """Masse d'attention repliée sur la phase du tirage passé regardé."""
    hist = np.zeros(bins, dtype=float)
    # attention: (B, H, L) — on somme l'horizon
    mass = attention.sum(axis=1)
    for row, origin in enumerate(origins):
        start = int(origin) - encoder
        phase = np.asarray(phases[start : int(origin)], dtype=float)
        if phase.size != mass.shape[1]:
            continue
        slot = np.clip((phase * bins).astype(int), 0, bins - 1)
        for index, bucket in enumerate(slot):
            hist[bucket] += float(mass[row, index])
    total = float(hist.sum())
    if total <= 0:
        return [0.0] * bins
    return [round(float(v / total), 5) for v in hist]


def _flatness(mass: list[float]) -> float:
    """0 = masse plate, 1 = toute la masse dans un bin."""
    arr = np.asarray(mass, dtype=float)
    if arr.sum() <= 0:
        return 0.0
    uniform = 1.0 / arr.size
    return round(float(np.sum(np.abs(arr - uniform)) / 2.0), 5)


def compare_signatures(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    a = np.asarray(left.get("vsn_known") or [], dtype=float)
    b = np.asarray(right.get("vsn_known") or [], dtype=float)
    past_a = np.asarray(left.get("vsn_past") or [], dtype=float)
    past_b = np.asarray(right.get("vsn_past") or [], dtype=float)
    size = min(a.size, b.size)
    past_size = min(past_a.size, past_b.size)
    deltas = []
    names_a = left.get("known_ids") or []
    names_b = right.get("known_ids") or []
    if names_a and names_a == names_b and a.size == b.size:
        for name, va, vb in zip(names_a, a, b):
            deltas.append({"id": name, "delta": round(float(va - vb), 5)})
        deltas.sort(key=lambda row: abs(row["delta"]), reverse=True)
    return {
        "cosine_known": round(_cosine(a[:size], b[:size]), 5) if size else 0.0,
        "cosine_past": round(_cosine(past_a[:past_size], past_b[:past_size]), 5) if past_size else 0.0,
        "divergent": deltas[:8],
    }


def fit_cycles(
    draws: list[dict[str, Any]],
    *,
    variable: str = "sum",
    n: int | None = None,
    warmup: int = 52,
    encoder: int = 52,
    horizon: int = 8,
    hidden: int = 32,
    epochs: int = 16,
    seed: int = 0,
) -> dict[str, Any]:
    if not torch_available():
        return {
            "ok": False,
            "torch": False,
            "error": "torch absent — pip install -r requirements-cycles.txt",
        }
    import torch

    from synchro.cycles.model import TemporalFusion, pinball_loss

    torch.manual_seed(seed)
    np.random.seed(seed)
    probe = build_panel(draws, variable=variable, n=n, warmup=warmup)
    reason = _too_short(probe["draw_count"], encoder, horizon)
    if reason:
        return {"ok": False, "torch": True, "error": reason, "notes": probe["notes"]}

    train_cut = max(encoder + horizon, int(probe["draw_count"] * 0.7))
    packed = dominant_period(
        probe["target"][:train_cut],
        float(probe["sampling"].get("draws_per_year") or 104.0),
    )
    panel = build_panel(
        draws,
        variable=variable,
        n=n,
        warmup=warmup,
        harmo_period_draws=packed.get("period_draws"),
    )
    past_s, target_s, scale = _standardize(panel["past"], panel["target"], train_cut)
    known = panel["known"].astype(np.float32)
    origins, past_w, known_w, future = _windows(past_s, known, target_s, encoder, horizon)
    train_mask = origins < train_cut
    test_mask = ~train_mask
    if int(train_mask.sum()) < 4 or int(test_mask.sum()) < 1:
        return {"ok": False, "torch": True, "error": "Pas assez de fenêtres pour un walk-forward."}

    static = np.asarray(list(panel["static"].values()), dtype=np.float32)
    static_w = np.repeat(static[None, :], origins.shape[0], axis=0)

    device = torch.device("cpu")
    model = TemporalFusion(
        n_past=past_w.shape[-1],
        n_known=known_w.shape[-1],
        n_static=static_w.shape[-1],
        d_model=hidden,
    ).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    xt = torch.tensor(past_w[train_mask], device=device)
    kt = torch.tensor(known_w[train_mask], device=device)
    st = torch.tensor(static_w[train_mask], device=device)
    yt = torch.tensor(future[train_mask], device=device)

    model.train()
    last_loss = 0.0
    for _ in range(max(1, epochs)):
        opt.zero_grad()
        out = model(xt, kt, st, encoder)
        loss = pinball_loss(out["quantiles"], yt)
        loss.backward()
        opt.step()
        last_loss = float(loss.detach())

    model.eval()
    with torch.no_grad():
        full_out = model(
            torch.tensor(past_w, device=device),
            torch.tensor(known_w, device=device),
            torch.tensor(static_w, device=device),
            encoder,
        )
        test_index = torch.tensor(np.flatnonzero(test_mask), device=device)
        real_loss = float(pinball_loss(full_out["quantiles"][test_index], torch.tensor(future[test_mask])).detach())

    vsn_past = full_out["vsn_past"][test_index].mean(dim=(0, 1)).cpu().numpy()
    vsn_known = full_out["vsn_known"][test_index].mean(dim=(0, 1)).cpu().numpy()
    attention = full_out["attention"][test_index].cpu().numpy()
    quant = full_out["quantiles"][test_index].cpu().numpy()

    known_ids = [channel.id for channel in panel["known_channels"]]
    past_ids = [channel.id for channel in panel["past_channels"]]
    test_origins = origins[test_mask]
    folds = {
        name: {
            "mass": fold_attention(attention, panel["phases"][name], test_origins, encoder),
        }
        for name in ("lunar", "carrington", "schwabe", "tropical", "harmo")
        if name in panel["phases"]
    }
    for name, row in folds.items():
        row["flatness"] = _flatness(row["mass"])
        row["locked"] = row["flatness"] >= 0.15

    ablation = _ablation(
        model,
        past_w[test_mask],
        known_w[test_mask],
        static_w[test_mask],
        future[test_mask],
        encoder,
        panel["groups"],
        real_loss,
    )
    nulls = _nulls(
        model,
        past_w[test_mask],
        known_w[test_mask],
        static_w[test_mask],
        future[test_mask],
        encoder,
        real_loss,
        seed,
    )
    beats_nulls = all(row["better"] for row in nulls)
    for row in ablation:
        row["wins"] = bool(row["delta"] > 0 and beats_nulls)

    sd = float(scale["tgt_sd"])
    mu = float(scale["tgt_mu"])
    ribbon = []
    for origin, qrow in zip(test_origins, quant):
        step = qrow[0]
        ribbon.append(
            {
                "date": panel["dates"][int(origin)],
                "origin": int(origin),
                "q10": round(float(step[0] * sd + mu), 4),
                "q50": round(float(step[1] * sd + mu), 4),
                "q90": round(float(step[2] * sd + mu), 4),
                "y": round(float(panel["target"][int(origin)]), 4),
            }
        )

    signature = {
        "variable": variable,
        "n": n,
        "known_ids": known_ids,
        "past_ids": past_ids,
        "vsn_known": [round(float(v), 5) for v in vsn_known],
        "vsn_past": [round(float(v), 5) for v in vsn_past],
        "attention": folds,
        "ablation": ablation,
        "nulls": nulls,
        "beats_nulls": beats_nulls,
    }
    return {
        "ok": True,
        "torch": True,
        "variable": variable,
        "n": n,
        "encoder": encoder,
        "horizon": horizon,
        "hidden": hidden,
        "epochs": epochs,
        "train_loss": round(last_loss, 5),
        "test_loss": round(real_loss, 5),
        "train_windows": int(train_mask.sum()),
        "test_windows": int(test_mask.sum()),
        "harmo_period_draws": packed.get("period_draws"),
        "signature": signature,
        "ribbon": ribbon[-80:],
        "notes": panel["notes"],
        "disclaimer": (
            "Walk-forward dans l'archive. Le ruban quantile décrit la couverture "
            "passée, pas une grille."
        ),
    }


def _ablation(
    model: Any,
    past: np.ndarray,
    known: np.ndarray,
    static: np.ndarray,
    future: np.ndarray,
    encoder: int,
    groups: list[dict[str, Any]],
    real_loss: float,
) -> list[dict[str, Any]]:
    import torch

    from synchro.cycles.model import pinball_loss

    rows = []
    device = next(model.parameters()).device
    with torch.no_grad():
        for group in groups:
            knocked = known.copy()
            for col in group["columns"]:
                knocked[:, :, int(col)] = 0.0
            pred = model(
                torch.tensor(past, device=device),
                torch.tensor(knocked, device=device),
                torch.tensor(static, device=device),
                encoder,
            )["quantiles"]
            loss = float(pinball_loss(pred, torch.tensor(future, device=device)).detach())
            rows.append(
                {
                    "id": group["id"],
                    "label": group["label"],
                    "loss": round(loss, 5),
                    "delta": round(loss - real_loss, 5),
                    "wins": False,
                }
            )
    rows.sort(key=lambda row: row["delta"], reverse=True)
    return rows


def _score(model: Any, past: np.ndarray, known: np.ndarray, static: np.ndarray, future: np.ndarray, encoder: int) -> float:
    import torch

    from synchro.cycles.model import pinball_loss

    device = next(model.parameters()).device
    with torch.no_grad():
        pred = model(
            torch.tensor(past, device=device),
            torch.tensor(known, device=device),
            torch.tensor(static, device=device),
            encoder,
        )["quantiles"]
        return float(pinball_loss(pred, torch.tensor(future, device=device)).detach())


def _nulls(
    model: Any,
    past: np.ndarray,
    known: np.ndarray,
    static: np.ndarray,
    future: np.ndarray,
    encoder: int,
    real_loss: float,
    seed: int,
) -> list[dict[str, Any]]:
    rng = np.random.default_rng(seed)
    shuffled = past.copy()
    order = rng.permutation(shuffled.shape[1])
    shuffled = shuffled[:, order, :]

    rolled = known.copy()
    shift = max(1, rolled.shape[1] // 2)
    rolled = np.roll(rolled, shift, axis=1)

    iid_past = past.copy()
    iid_future = future.copy()
    for col in range(iid_past.shape[-1]):
        column = iid_past[:, :, col].ravel()
        iid_past[:, :, col] = rng.choice(column, size=iid_past[:, :, col].shape, replace=True)
    flat = future.ravel()
    iid_future = rng.choice(flat, size=future.shape, replace=True).astype(np.float32)

    specs = [
        ("shuffle", "Remaniement de l'ordre", shuffled, known, future),
        ("phase", "Permutation des phases", past, rolled, future),
        ("iid", "Loi marginale i.i.d.", iid_past, known, iid_future),
    ]
    rows = []
    for key, label, p, k, y in specs:
        loss = _score(model, p, k, static, y, encoder)
        rows.append(
            {
                "id": key,
                "label": label,
                "loss": round(loss, 5),
                "delta": round(loss - real_loss, 5),
                "better": bool(loss > real_loss),
            }
        )
    return rows
