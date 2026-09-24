"""TFT compact : GRN, sélection de variables, LSTM, attention interprétable.

Pas de Lightning ni de pytorch-forecasting : les canaux restent ceux du
registre Synchro. torch est optionnel ; ce module n'est importé que si le
fit est demandé.
"""

from __future__ import annotations

import torch
from torch import Tensor, nn


class GatedResidual(nn.Module):
    def __init__(self, d_in: int, d_hidden: int, d_out: int, dropout: float = 0.1) -> None:
        super().__init__()
        self.fc1 = nn.Linear(d_in, d_hidden)
        self.fc2 = nn.Linear(d_hidden, d_out)
        self.gate = nn.Linear(d_hidden, d_out)
        self.skip = nn.Linear(d_in, d_out) if d_in != d_out else nn.Identity()
        self.norm = nn.LayerNorm(d_out)
        self.drop = nn.Dropout(dropout)

    def forward(self, x: Tensor) -> Tensor:
        hidden = torch.nn.functional.elu(self.fc1(x))
        gated = self.drop(self.fc2(hidden)) * torch.sigmoid(self.gate(hidden))
        return self.norm(self.skip(x) + gated)


class VariableSelection(nn.Module):
    """Un GRN par canal, poids softmax sur le vecteur brut."""

    def __init__(self, n_vars: int, d_model: int, dropout: float = 0.1) -> None:
        super().__init__()
        self.grns = nn.ModuleList(
            [GatedResidual(1, d_model, d_model, dropout) for _ in range(n_vars)]
        )
        self.weights = GatedResidual(n_vars, d_model, n_vars, dropout)

    def forward(self, x: Tensor) -> tuple[Tensor, Tensor]:
        # x: (B, T, C)
        logits = self.weights(x)
        alpha = torch.softmax(logits, dim=-1)
        processed = torch.stack(
            [grn(x[..., index : index + 1]) for index, grn in enumerate(self.grns)],
            dim=-2,
        )
        selected = (processed * alpha.unsqueeze(-1)).sum(dim=-2)
        return selected, alpha


class InterpretableAttention(nn.Module):
    """Têtes sur Q/K, valeur partagée : la moyenne des têtes reste lisible."""

    def __init__(self, d_model: int, n_heads: int = 4, dropout: float = 0.1) -> None:
        super().__init__()
        if d_model % n_heads != 0:
            raise ValueError("d_model doit être divisible par n_heads")
        self.n_heads = n_heads
        self.d_head = d_model // n_heads
        self.w_q = nn.Linear(d_model, d_model)
        self.w_k = nn.Linear(d_model, d_model)
        self.w_v = nn.Linear(d_model, self.d_head)
        self.out = nn.Linear(self.d_head, d_model)
        self.drop = nn.Dropout(dropout)

    def forward(self, query: Tensor, key: Tensor) -> tuple[Tensor, Tensor]:
        batch, horizon, _ = query.shape
        length = key.shape[1]
        q = self.w_q(query).view(batch, horizon, self.n_heads, self.d_head).permute(0, 2, 1, 3)
        k = self.w_k(key).view(batch, length, self.n_heads, self.d_head).permute(0, 2, 1, 3)
        v = self.w_v(key)
        scores = torch.matmul(q, k.transpose(-2, -1)) / (self.d_head ** 0.5)
        heads = torch.softmax(scores, dim=-1)
        mixed = heads.mean(dim=1)
        context = self.out(self.drop(torch.matmul(mixed, v)))
        return context, mixed


class TemporalFusion(nn.Module):
    def __init__(
        self,
        n_past: int,
        n_known: int,
        n_static: int,
        d_model: int = 32,
        n_heads: int = 4,
        dropout: float = 0.1,
        n_quantiles: int = 3,
    ) -> None:
        super().__init__()
        self.vsn_past = VariableSelection(n_past, d_model, dropout)
        self.vsn_known = VariableSelection(n_known, d_model, dropout)
        self.static_grn = GatedResidual(n_static, d_model, d_model, dropout)
        self.lstm = nn.LSTM(d_model, d_model, batch_first=True)
        self.attention = InterpretableAttention(d_model, n_heads, dropout)
        self.enrich = GatedResidual(d_model * 3, d_model, d_model, dropout)
        self.quantile = nn.Linear(d_model, n_quantiles)

    def forward(
        self,
        past: Tensor,
        known: Tensor,
        static: Tensor,
        encoder_len: int,
    ) -> dict[str, Tensor]:
        past_sel, past_w = self.vsn_past(past)
        known_sel, known_w = self.vsn_known(known)
        bias = self.static_grn(static).unsqueeze(1)
        enc_in = past_sel + known_sel[:, :encoder_len] + bias
        dec_in = known_sel[:, encoder_len:] + bias
        encoded, state = self.lstm(enc_in)
        decoded, _ = self.lstm(dec_in, state)
        context, attention = self.attention(decoded, encoded)
        static_dec = bias.expand(-1, decoded.shape[1], -1)
        fused = self.enrich(torch.cat([decoded, context, static_dec], dim=-1))
        quantiles = self.quantile(fused)
        return {
            "quantiles": quantiles,
            "vsn_past": past_w,
            "vsn_known": known_w[:, :encoder_len],
            "attention": attention,
        }


def pinball_loss(pred: Tensor, target: Tensor, quantiles: tuple[float, ...] = (0.1, 0.5, 0.9)) -> Tensor:
    """pred (B, H, Q), target (B, H)."""
    losses = []
    for index, q in enumerate(quantiles):
        err = target - pred[..., index]
        losses.append(torch.maximum(q * err, (q - 1.0) * err))
    return torch.stack(losses, dim=-1).mean()
