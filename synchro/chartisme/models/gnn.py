"""GNN sur le graphe de coordonnées, avec PyTorch Geometric.

Le transformer lit la fenêtre comme une suite de gestes ; ce modèle-ci la lit
comme un objet géométrique. La différence est utile : « les deux épaules sont
au même niveau » est ici une **arête** entre deux nœuds, pas une coïncidence
entre deux nombres éloignés dans une séquence. Et rien du montage ne dépend
d'une grille de pixels, puisque les nœuds vivent dans le carré unité.

`GINEConv` est choisie parce qu'elle consomme les attributs d'arêtes : sans
eux, les quatre types d'arêtes — tracé, courbure, corde de même hauteur,
voisinage — se confondraient, et c'est précisément leur distinction qui porte
la topologie de la figure.

Lecture par `concat(global_add_pool, global_max_pool)` : la somme compte les
appuis (trois sommets, pas deux), le maximum retient le trait dominant. Une
moyenne effacerait les deux.
"""

from __future__ import annotations

from typing import Any, Sequence

import torch
from torch import Tensor, nn
from torch_geometric.data import Data
from torch_geometric.loader import DataLoader
from torch_geometric.nn import GINEConv, global_add_pool, global_max_pool

from synchro.chartisme.graph import EDGE_DIM, NODE_DIM

DEFAULT_DIM = 96
DEFAULT_LAYERS = 4
DEFAULT_PROJ_DIM = 64
DEFAULT_DROPOUT = 0.1


def to_data(
    graph: dict[str, Any],
    *,
    label: int | None = None,
    weight: float = 1.0,
    breakout: bool = False,
) -> Data:
    """Graphe en Python pur → `Data` PyG."""
    nodes = graph.get("nodes") or []
    edge_index = graph.get("edge_index") or [[], []]
    edge_attr = graph.get("edge_attr") or []
    x = torch.tensor(nodes, dtype=torch.float) if nodes else torch.zeros((1, NODE_DIM))
    if edge_attr:
        index = torch.tensor(edge_index, dtype=torch.long)
        attr = torch.tensor(edge_attr, dtype=torch.float)
    else:
        # Un graphe sans arête ferait planter l'agrégation : on lui laisse une
        # boucle, dont les attributs nuls ne disent rien.
        index = torch.zeros((2, 1), dtype=torch.long)
        attr = torch.zeros((1, EDGE_DIM))
    data = Data(x=x, edge_index=index, edge_attr=attr)
    data.weight = torch.tensor([float(weight)])
    data.breakout = torch.tensor([1.0 if breakout else 0.0])
    if label is not None:
        data.y = torch.tensor([int(label)])
    return data


def to_dataset(
    rows: Sequence[dict[str, Any]],
    classes: Sequence[str],
) -> list[Data]:
    lookup = {name: index for index, name in enumerate(classes)}
    out: list[Data] = []
    for row in rows:
        label = lookup.get(row.get("figure"))
        if label is None:
            continue
        out.append(
            to_data(
                row["graph"],
                label=label,
                weight=float(row.get("weight", 1.0)),
                breakout=bool(row.get("breakout")),
            )
        )
    return out


def loader(data: Sequence[Data], *, batch_size: int = 32, shuffle: bool = True) -> DataLoader:
    return DataLoader(list(data), batch_size=batch_size, shuffle=shuffle)


def _mlp(inp: int, out: int) -> nn.Sequential:
    return nn.Sequential(nn.Linear(inp, out), nn.GELU(), nn.Linear(out, out))


class FigureGnn(nn.Module):
    """Quatre couches GINEConv, lecture somme + max, deux têtes."""

    def __init__(
        self,
        classes: Sequence[str],
        *,
        dim: int = DEFAULT_DIM,
        layers: int = DEFAULT_LAYERS,
        proj_dim: int = DEFAULT_PROJ_DIM,
        dropout: float = DEFAULT_DROPOUT,
        node_dim: int = NODE_DIM,
        edge_dim: int = EDGE_DIM,
    ) -> None:
        super().__init__()
        self.classes = list(classes)
        self.dim = dim
        # Gardé pour `config()` : recharger des poids avec une profondeur ou
        # une tête de projection différentes échouerait sur les clés absentes.
        self.layers = layers
        self.proj_dim = proj_dim
        self.node_in = nn.Linear(node_dim, dim)
        self.edge_in = nn.Linear(edge_dim, dim)
        self.convs = nn.ModuleList(
            GINEConv(_mlp(dim, dim), edge_dim=dim) for _ in range(layers)
        )
        self.norms = nn.ModuleList(nn.BatchNorm1d(dim) for _ in range(layers))
        self.dropout = nn.Dropout(dropout)
        self.head = nn.Sequential(
            nn.Linear(dim * 2, dim), nn.GELU(), nn.Dropout(dropout)
        )
        self.classifier = nn.Linear(dim, len(self.classes))
        self.projection = nn.Sequential(
            nn.Linear(dim, dim), nn.GELU(), nn.Linear(dim, proj_dim)
        )
        self.breakout = nn.Linear(dim, 1)

    def encode(self, data: Data) -> Tensor:
        x = self.node_in(data.x)
        edge_attr = self.edge_in(data.edge_attr)
        batch = getattr(data, "batch", None)
        if batch is None:
            batch = torch.zeros(x.size(0), dtype=torch.long, device=x.device)
        for conv, norm in zip(self.convs, self.norms):
            # Résiduel : sans lui, quatre passages de message lissent le graphe
            # jusqu'à confondre tous les nœuds.
            x = x + self.dropout(nn.functional.gelu(norm(conv(x, data.edge_index, edge_attr))))
        pooled = torch.cat([global_add_pool(x, batch), global_max_pool(x, batch)], dim=-1)
        return self.head(pooled)

    def forward(self, data: Data) -> dict[str, Tensor]:
        latent = self.encode(data)
        return {
            "latent": latent,
            "logits": self.classifier(latent),
            "embedding": nn.functional.normalize(self.projection(latent), dim=-1),
            "breakout": self.breakout(latent).squeeze(-1),
        }

    def config(self) -> dict[str, Any]:
        return {
            "kind": "gnn",
            "classes": list(self.classes),
            "dim": self.dim,
            "layers": self.layers,
            "proj_dim": self.proj_dim,
            "node_dim": self.node_in.in_features,
            "edge_dim": self.edge_in.in_features,
        }


def build(classes: Sequence[str], **kwargs: Any) -> FigureGnn:
    return FigureGnn(classes, **kwargs)
