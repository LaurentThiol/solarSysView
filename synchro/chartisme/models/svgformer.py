"""Transformer hiérarchique façon DeepSVG, réimplémenté en PyTorch 2.x.

Le dépôt d'origine épingle `torch==1.4.0`, Python 3.7, tensorflow et cairo :
inutilisable ici. Et ses poids sont entraînés sur des icônes vectorielles,
sans transfert utile vers des courbes de tirages. On en garde donc l'idée,
qui est la bonne, et rien du code.

L'idée : une forme vectorielle n'est pas une image mais une **suite de
gestes**, et un dessin n'est pas un geste mais un **groupe de tracés**. D'où
deux étages :

1. un transformer par chemin, qui lit ses commandes (`m`, `l`, `c`, `z`) et
   leurs arguments quantifiés, et en tire un vecteur de chemin `z_p` ;
2. un transformer sur la séquence des chemins, qui lit les quatre tracés de la
   fenêtre — la courbe, l'enveloppe haute, l'enveloppe basse, l'activité — et
   en tire un vecteur de groupe `z`.

C'est le deuxième étage qui fait l'intérêt du montage ici : « épaules à même
niveau » est une relation entre la courbe et son enveloppe haute, pas une
propriété de la courbe seule.

Deux têtes sur `z` : la classification des figures, et une projection
contrastive normalisée qui sert la recherche par ressemblance et les classes à
trois exemples de l'atelier.
"""

from __future__ import annotations

from typing import Any, Sequence

import torch
from torch import Tensor, nn

from synchro.chartisme.svgpath import (
    ARG_VOCAB,
    CMD_PAD,
    CMD_TOKENS,
    MAX_CMDS,
    MAX_PATHS,
    N_ARGS,
    PATH_ROLES,
)

DEFAULT_DIM = 128
DEFAULT_HEADS = 4
DEFAULT_PATH_LAYERS = 4
DEFAULT_GROUP_LAYERS = 2
DEFAULT_PROJ_DIM = 64
DEFAULT_DROPOUT = 0.1


class CommandEmbedding(nn.Module):
    """Commande + ses six arguments + sa position dans le chemin.

    Les six arguments partagent un même vocabulaire — ce sont tous des
    coordonnées du carré unité — mais pas leur rôle : le premier point de
    contrôle d'une cubique n'est pas son point d'arrivée. D'où le décalage
    appris par position d'argument, ajouté avant la somme.
    """

    def __init__(self, dim: int = DEFAULT_DIM, max_cmds: int = MAX_CMDS) -> None:
        super().__init__()
        self.command = nn.Embedding(len(CMD_TOKENS), dim, padding_idx=CMD_PAD)
        self.argument = nn.Embedding(ARG_VOCAB, dim, padding_idx=0)
        self.slot = nn.Parameter(torch.zeros(N_ARGS, dim))
        self.position = nn.Embedding(max_cmds, dim)
        self.norm = nn.LayerNorm(dim)
        nn.init.normal_(self.slot, std=0.02)

    def forward(self, commands: Tensor, args: Tensor) -> Tensor:
        steps = commands.size(-1)
        positions = torch.arange(steps, device=commands.device)
        argument = self.argument(args) + self.slot
        return self.norm(
            self.command(commands) + argument.sum(dim=-2) + self.position(positions)
        )


def _encoder(dim: int, heads: int, layers: int, dropout: float) -> nn.TransformerEncoder:
    layer = nn.TransformerEncoderLayer(
        d_model=dim,
        nhead=heads,
        dim_feedforward=dim * 4,
        dropout=dropout,
        activation="gelu",
        batch_first=True,
        norm_first=True,
    )
    return nn.TransformerEncoder(layer, num_layers=layers, enable_nested_tensor=False)


class SvgFormer(nn.Module):
    """Hiérarchie chemin → groupe, deux têtes."""

    def __init__(
        self,
        classes: Sequence[str],
        *,
        dim: int = DEFAULT_DIM,
        heads: int = DEFAULT_HEADS,
        path_layers: int = DEFAULT_PATH_LAYERS,
        group_layers: int = DEFAULT_GROUP_LAYERS,
        proj_dim: int = DEFAULT_PROJ_DIM,
        dropout: float = DEFAULT_DROPOUT,
        max_cmds: int = MAX_CMDS,
        max_paths: int = MAX_PATHS,
    ) -> None:
        super().__init__()
        self.classes = list(classes)
        self.dim = dim
        self.max_cmds = max_cmds
        self.max_paths = max_paths
        self.embedding = CommandEmbedding(dim, max_cmds)
        self.path_encoder = _encoder(dim, heads, path_layers, dropout)
        # Le rôle du tracé est une information de groupe : sans lui, l'étage
        # supérieur ne saurait pas laquelle des quatre suites est l'activité.
        self.role = nn.Embedding(max_paths, dim)
        self.group_encoder = _encoder(dim, heads, group_layers, dropout)
        self.dropout = nn.Dropout(dropout)
        self.classifier = nn.Linear(dim, len(self.classes))
        self.projection = nn.Sequential(
            nn.Linear(dim, dim), nn.GELU(), nn.Linear(dim, proj_dim)
        )
        # Tête auxiliaire : la cassure est confirmée ? Elle force l'encodeur à
        # regarder le tracé d'activité, qui porte la règle d'or.
        self.breakout = nn.Linear(dim, 1)

    def encode_paths(self, commands: Tensor, args: Tensor) -> Tensor:
        """(B, P, S) + (B, P, S, A) → (B, P, D)."""
        batch, paths, steps = commands.shape
        flat_cmds = commands.reshape(batch * paths, steps)
        flat_args = args.reshape(batch * paths, steps, args.size(-1))
        tokens = self.embedding(flat_cmds, flat_args)
        pad = flat_cmds == CMD_PAD
        # Un chemin entièrement vide ferait un masque complet, que l'attention
        # ne sait pas traiter : on lui laisse son premier pas.
        empty = pad.all(dim=-1)
        pad = pad.clone()
        pad[empty, 0] = False
        encoded = self.path_encoder(tokens, src_key_padding_mask=pad)
        keep = (~pad).unsqueeze(-1).to(encoded.dtype)
        pooled = (encoded * keep).sum(dim=1) / keep.sum(dim=1).clamp(min=1.0)
        return pooled.reshape(batch, paths, self.dim)

    def encode(self, commands: Tensor, args: Tensor, path_mask: Tensor) -> Tensor:
        """Vecteur de groupe `z`, (B, D)."""
        paths = self.encode_paths(commands, args)
        roles = torch.arange(paths.size(1), device=paths.device)
        paths = paths + self.role(roles)
        missing = path_mask <= 0
        missing = missing.clone()
        missing[missing.all(dim=-1), 0] = False
        encoded = self.group_encoder(paths, src_key_padding_mask=missing)
        keep = (~missing).unsqueeze(-1).to(encoded.dtype)
        return (encoded * keep).sum(dim=1) / keep.sum(dim=1).clamp(min=1.0)

    def forward(
        self,
        commands: Tensor,
        args: Tensor,
        path_mask: Tensor,
    ) -> dict[str, Tensor]:
        latent = self.dropout(self.encode(commands, args, path_mask))
        return {
            "latent": latent,
            "logits": self.classifier(latent),
            "embedding": nn.functional.normalize(self.projection(latent), dim=-1),
            "breakout": self.breakout(latent).squeeze(-1),
        }

    def config(self) -> dict[str, Any]:
        return {
            "kind": "svgformer",
            "classes": list(self.classes),
            "dim": self.dim,
            "max_cmds": self.max_cmds,
            "max_paths": self.max_paths,
            "path_roles": list(PATH_ROLES),
        }


def collate(rows: Sequence[dict[str, Any]]) -> dict[str, Tensor]:
    """Lignes encodées par `dataset.encode` → tenseurs empilés."""
    commands = torch.tensor([row["commands"] for row in rows], dtype=torch.long)
    args = torch.tensor([row["args"] for row in rows], dtype=torch.long)
    path_mask = torch.tensor([row["path_mask"] for row in rows], dtype=torch.long)
    weights = torch.tensor([float(row.get("weight", 1.0)) for row in rows])
    breakout = torch.tensor([1.0 if row.get("breakout") else 0.0 for row in rows])
    return {
        "commands": commands,
        "args": args,
        "path_mask": path_mask,
        "weight": weights,
        "breakout": breakout,
    }


def build(classes: Sequence[str], **kwargs: Any) -> SvgFormer:
    return SvgFormer(classes, **kwargs)
