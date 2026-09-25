"""Fenêtre de courbe → graphe de coordonnées, pour le GNN.

Les nœuds sont les points d'ancrage *et* les points de contrôle des Béziers ;
les arêtes portent la topologie de la forme. Quatre types d'arêtes :

- `segment` : ancres consécutives (le tracé lui-même) ;
- `control` : une ancre et ses points de contrôle (la courbure) ;
- `chord` : deux pivots de hauteur voisine — c'est ce qui encode « épaules à
  même niveau » ou « résistance plate », indépendamment de la durée ;
- `knn` : voisinage dans le carré unité.

Sortie en structures Python pures ; la conversion en `torch_geometric.data.Data`
vit dans `synchro.chartisme.models.gnn` pour garder torch optionnel.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

from synchro.chartisme.svgpath import fit_cubic, normalize_window, pips

NODE_KINDS = ("anchor", "control", "pivot_high", "pivot_low")
EDGE_KINDS = ("segment", "control", "chord", "knn")
# Schéma 2 : les arêtes de visibilité s'ajoutent. Les constantes ci-dessus
# restent celles du graphe v1, celui que le GNN déjà entraîné sait lire.
EDGE_KINDS_V2 = (*EDGE_KINDS, "hvg", "nvg")
NODE_DIM_V2 = 12
EDGE_DIM_V2 = 11

NODE_DIM = 10
EDGE_DIM = 9

CHORD_EPS = 0.06
KNN_K = 3


def _slope(a: tuple[float, float], b: tuple[float, float]) -> float:
    dx = b[0] - a[0]
    if abs(dx) < 1e-9:
        return 0.0
    return max(-8.0, min(8.0, (b[1] - a[1]) / dx))


def _angle(prev: tuple[float, float], node: tuple[float, float], nxt: tuple[float, float]) -> float:
    v1 = (node[0] - prev[0], node[1] - prev[1])
    v2 = (nxt[0] - node[0], nxt[1] - node[1])
    n1 = math.hypot(*v1)
    n2 = math.hypot(*v2)
    if n1 < 1e-9 or n2 < 1e-9:
        return 0.0
    cos = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
    return math.acos(cos) / math.pi


def _node_features(
    point: tuple[float, float],
    kind: str,
    *,
    slope_in: float,
    slope_out: float,
    angle: float,
    activity_rel: float,
) -> list[float]:
    onehot = [1.0 if kind == k else 0.0 for k in NODE_KINDS]
    return [point[0], point[1], *onehot, slope_in, slope_out, angle, activity_rel]


def _edge_features(
    a: tuple[float, float],
    b: tuple[float, float],
    kind: str,
    *,
    is_cubic: bool = False,
) -> list[float]:
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    onehot = [1.0 if kind == k else 0.0 for k in EDGE_KINDS]
    return [dx, dy, math.hypot(dx, dy), math.atan2(dy, dx) / math.pi, 1.0 if is_cubic else 0.0, *onehot]


def build_graph(
    values: Sequence[float],
    *,
    activity: Sequence[float] | None = None,
    pivots: Sequence[dict[str, Any]] | None = None,
    k: int = 15,
    knn: int = KNN_K,
    chord_eps: float = CHORD_EPS,
    cubic: bool = True,
    version: int = 1,
    tau: float = 0.04,
    variable: bool = True,
) -> dict[str, Any]:
    if version >= 2:
        return _build_graph_v2(
            values,
            activity=activity,
            tau=tau,
            variable=variable,
            knn=knn,
            chord_eps=chord_eps,
            cubic=cubic,
        )
    """Graphe d'une fenêtre : nœuds, arêtes dirigées symétrisées, attributs."""
    points = normalize_window(values)
    if len(points) < 2:
        return {
            "nodes": [],
            "node_kinds": [],
            "edge_index": [[], []],
            "edge_attr": [],
            "edge_kinds": [],
            "anchors": [],
            "node_dim": NODE_DIM,
            "edge_dim": EDGE_DIM,
        }

    anchors = pips(points, k)
    pivot_type: dict[int, str] = {}
    for pivot in pivots or []:
        i = int(pivot.get("index", -1))
        if 0 <= i < len(points):
            pivot_type[i] = "pivot_high" if pivot.get("type") == "H" else "pivot_low"

    act = list(activity or [])
    act_mean = (sum(act) / len(act)) if act else 0.0

    nodes: list[list[float]] = []
    node_kinds: list[str] = []
    node_points: list[tuple[float, float]] = []
    anchor_nodes: list[int] = []

    for slot, index in enumerate(anchors):
        point = points[index]
        prev_point = points[anchors[slot - 1]] if slot > 0 else point
        next_point = points[anchors[slot + 1]] if slot + 1 < len(anchors) else point
        activity_rel = 0.0
        if act_mean > 0 and index < len(act):
            activity_rel = min(4.0, act[index] / act_mean)
        kind = pivot_type.get(index, "anchor")
        nodes.append(
            _node_features(
                point,
                kind,
                slope_in=_slope(prev_point, point),
                slope_out=_slope(point, next_point),
                angle=_angle(prev_point, point, next_point),
                activity_rel=activity_rel,
            )
        )
        node_kinds.append(kind)
        node_points.append(point)
        anchor_nodes.append(len(nodes) - 1)

    edges: list[tuple[int, int]] = []
    edge_attr: list[list[float]] = []
    edge_kinds: list[str] = []

    def add_edge(u: int, v: int, kind: str, *, is_cubic: bool = False) -> None:
        edges.append((u, v))
        edge_attr.append(_edge_features(node_points[u], node_points[v], kind, is_cubic=is_cubic))
        edge_kinds.append(kind)
        edges.append((v, u))
        edge_attr.append(_edge_features(node_points[v], node_points[u], kind, is_cubic=is_cubic))
        edge_kinds.append(kind)

    for slot in range(len(anchor_nodes) - 1):
        left_idx, right_idx = anchors[slot], anchors[slot + 1]
        u, v = anchor_nodes[slot], anchor_nodes[slot + 1]
        segment = points[left_idx : right_idx + 1]
        is_cubic = cubic and len(segment) > 2
        add_edge(u, v, "segment", is_cubic=is_cubic)
        if not is_cubic:
            continue
        c1, c2 = fit_cubic(segment)
        for control in (c1, c2):
            nodes.append(
                _node_features(
                    control,
                    "control",
                    slope_in=_slope(points[left_idx], control),
                    slope_out=_slope(control, points[right_idx]),
                    angle=_angle(points[left_idx], control, points[right_idx]),
                    activity_rel=0.0,
                )
            )
            node_kinds.append("control")
            node_points.append(control)
            control_node = len(nodes) - 1
            add_edge(u, control_node, "control")
            add_edge(control_node, v, "control")

    for i in range(len(anchor_nodes)):
        for j in range(i + 1, len(anchor_nodes)):
            u, v = anchor_nodes[i], anchor_nodes[j]
            if abs(node_points[u][1] - node_points[v][1]) <= chord_eps:
                add_edge(u, v, "chord")

    if knn > 0 and len(anchor_nodes) > knn:
        for i, u in enumerate(anchor_nodes):
            distances = sorted(
                (
                    (
                        math.hypot(
                            node_points[u][0] - node_points[v][0],
                            node_points[u][1] - node_points[v][1],
                        ),
                        v,
                    )
                    for j, v in enumerate(anchor_nodes)
                    if j != i
                ),
            )
            for _, v in distances[:knn]:
                if u < v:
                    add_edge(u, v, "knn")

    return {
        "nodes": nodes,
        "node_kinds": node_kinds,
        "edge_index": [[u for u, _ in edges], [v for _, v in edges]],
        "edge_attr": edge_attr,
        "edge_kinds": edge_kinds,
        "anchors": anchors,
        "node_dim": NODE_DIM,
        "edge_dim": EDGE_DIM,
        "graph_version": 1,
    }


def _build_graph_v2(
    values: Sequence[float],
    *,
    activity: Sequence[float] | None,
    tau: float,
    variable: bool,
    knn: int,
    chord_eps: float,
    cubic: bool,
) -> dict[str, Any]:
    """Graphe v1, plus la visibilité horizontale et naturelle de l'épine.

    Les ancres sont les pivots de la coupe `τ`, pas les PIP à budget fixe.
    `node_dim` et `edge_dim` grandissent : un poids entraîné sur le schéma 1
    ne se recharge pas sur celui-ci.
    """
    from synchro.chartisme.motif import build_network

    network = build_network(values, tau=tau, variable=variable)
    points = normalize_window(values)
    if len(points) < 2 or not network["nodes"]:
        return {
            "nodes": [],
            "node_kinds": [],
            "edge_index": [[], []],
            "edge_attr": [],
            "edge_kinds": [],
            "anchors": [],
            "node_dim": NODE_DIM_V2,
            "edge_dim": EDGE_DIM_V2,
            "graph_version": 2,
        }

    anchors = [int(node["index"]) for node in network["nodes"]]
    act = list(activity or [])
    act_mean = (sum(act) / len(act)) if act else 0.0
    nodes: list[list[float]] = []
    node_kinds: list[str] = []
    node_points: list[tuple[float, float]] = []

    def kind_of(node: dict[str, Any]) -> str:
        return "pivot_high" if node["type"] == "H" else "pivot_low"

    def features(point: tuple[float, float], kind: str, slot_node: dict[str, Any] | None, prev_p, next_p, activity_rel: float) -> list[float]:
        saliency = 0.0 if slot_node is None else float(slot_node["saliency"])
        degree = 0.0 if slot_node is None else min(8.0, float(slot_node["hvg_degree"])) / 8.0
        return [
            *_node_features(
                point,
                kind,
                slope_in=_slope(prev_p, point),
                slope_out=_slope(point, next_p),
                angle=_angle(prev_p, point, next_p),
                activity_rel=activity_rel,
            ),
            saliency,
            degree,
        ]

    for slot, node in enumerate(network["nodes"]):
        index = anchors[slot]
        point = points[index]
        prev_point = points[anchors[slot - 1]] if slot else point
        next_point = points[anchors[slot + 1]] if slot + 1 < len(anchors) else point
        activity_rel = 0.0
        if act_mean > 0 and index < len(act):
            activity_rel = min(4.0, act[index] / act_mean)
        nodes.append(features(point, kind_of(node), node, prev_point, next_point, activity_rel))
        node_kinds.append(kind_of(node))
        node_points.append(point)

    edges: list[tuple[int, int]] = []
    edge_attr: list[list[float]] = []
    edge_kinds: list[str] = []

    def add_edge(u: int, v: int, kind: str, *, is_cubic: bool = False) -> None:
        def row(a: int, b: int) -> list[float]:
            dx = node_points[b][0] - node_points[a][0]
            dy = node_points[b][1] - node_points[a][1]
            onehot = [1.0 if kind == name else 0.0 for name in EDGE_KINDS_V2]
            return [dx, dy, math.hypot(dx, dy), math.atan2(dy, dx) / math.pi, 1.0 if is_cubic else 0.0, *onehot]

        edges.append((u, v))
        edge_attr.append(row(u, v))
        edge_kinds.append(kind)
        edges.append((v, u))
        edge_attr.append(row(v, u))
        edge_kinds.append(kind)

    anchor_nodes = list(range(len(anchors)))
    for slot in range(len(anchor_nodes) - 1):
        left_idx, right_idx = anchors[slot], anchors[slot + 1]
        u, v = anchor_nodes[slot], anchor_nodes[slot + 1]
        segment = points[left_idx : right_idx + 1]
        is_cubic = cubic and len(segment) > 2
        add_edge(u, v, "segment", is_cubic=is_cubic)
        if not is_cubic:
            continue
        c1, c2 = fit_cubic(segment)
        for control in (c1, c2):
            nodes.append(
                features(
                    control,
                    "control",
                    None,
                    points[left_idx],
                    points[right_idx],
                    0.0,
                )
            )
            node_kinds.append("control")
            node_points.append(control)
            control_node = len(nodes) - 1
            add_edge(u, control_node, "control")
            add_edge(control_node, v, "control")

    for edge in network["edges"]:
        if edge["kind"] == "segment":
            continue
        add_edge(int(edge["source"]), int(edge["target"]), str(edge["kind"]))

    for i in range(len(anchor_nodes)):
        for j in range(i + 1, len(anchor_nodes)):
            u, v = anchor_nodes[i], anchor_nodes[j]
            if abs(node_points[u][1] - node_points[v][1]) <= chord_eps:
                add_edge(u, v, "chord")

    if knn > 0 and len(anchor_nodes) > knn:
        for i, u in enumerate(anchor_nodes):
            distances = sorted(
                (
                    (
                        math.hypot(
                            node_points[u][0] - node_points[v][0],
                            node_points[u][1] - node_points[v][1],
                        ),
                        v,
                    )
                    for j, v in enumerate(anchor_nodes)
                    if j != i
                ),
            )
            for _, v in distances[:knn]:
                if u < v:
                    add_edge(u, v, "knn")

    return {
        "nodes": nodes,
        "node_kinds": node_kinds,
        "edge_index": [[u for u, _ in edges], [v for _, v in edges]],
        "edge_attr": edge_attr,
        "edge_kinds": edge_kinds,
        "anchors": anchors,
        "node_dim": NODE_DIM_V2,
        "edge_dim": EDGE_DIM_V2,
        "graph_version": 2,
        "word": list(network["word"]),
        "transitions": dict(network["transitions"]),
    }


def graph_summary(graph: dict[str, Any]) -> dict[str, Any]:
    kinds = graph.get("edge_kinds") or []
    names = list(EDGE_KINDS_V2 if graph.get("graph_version") == 2 else EDGE_KINDS)
    for kind in kinds:
        if kind not in names:
            names.append(kind)
    return {
        "node_count": len(graph.get("nodes") or []),
        "edge_count": len(kinds),
        "by_kind": {kind: kinds.count(kind) for kind in names},
        "anchor_count": len(graph.get("anchors") or []),
    }
