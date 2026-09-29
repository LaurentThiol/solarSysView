# Schémas fonctionnels

Source des schémas Mermaid du logiciel. On les fait évoluer avec le code, fonction par fonction.

Chaque fichier Markdown est un schéma : un en-tête, un bloc `mermaid`, les ancres de code, et un journal de révision. GitHub affiche le bloc. Pour retravailler le dessin, coller le bloc dans [mermaid.live](https://mermaid.live).

## Niveaux

Du plus large au plus fin, comme un C4 simplifié.

| Niveau | Rôle | Forme Mermaid |
| --- | --- | --- |
| Contexte | Qui parle au module | `C4Context` |
| Conteneurs | Processus, routes, stockage | `C4Container` |
| Composants | Modules internes d’un écran | `C4Component` |
| Flux | Données, filtres, portes, sorties | `flowchart` |

Le flux est le niveau qu’on modifie quand une fonction change. Le contexte et les conteneurs ne bougent que si une frontière change (nouvelle API, nouveau stockage).

## Règles

- Un schéma, un fichier. L’index du module pointe vers ce fichier. On ne copie pas le bloc ailleurs.
- Les identifiants de nœuds restent stables (`filtreJour`, `porte`, `mise`). Le libellé peut changer. L’identifiant non : les diffs restent lisibles.
- Une évolution de comportement met à jour le schéma dans le même changement. On incrémente `Révision` et on ajoute une ligne au journal du fichier.
- Le schéma décrit le logiciel tel qu’il est. Une fonction pas encore écrite n’entre pas dans le dessin.
- Dans un libellé, on écrit « avant » plutôt qu’un chevron `<`. Les apostrophes restent entre guillemets.

## Modules

- [Pronostic](pronostic/README.md) — atelier `/pronostic` et historique `/pronostic?tab=historic`.
