# decisionTree — schémas

Lecture `/brain/decision-tree`. La fonction est `read_flux` : elle fabrique le tableau, cherche l’arbre sur l’apprentissage, le note sur le contrôle, rejoue ce calcul sur l’ordre détruit, puis dessine.

Un seuil compte s’il tient sur l’ordre réel et s’efface une fois cet ordre détruit. p vaut (1 + remaniements au moins aussi bons) / (1 + N). Le flux est reconnu si p ≤ 0,05. Sinon le verdict est « aucun seuil ». Ce n’est pas une conclusion d’indépendance. Le journal revoit ensuite ce p par Benjamini–Hochberg, ère par ère.

## Lire dans cet ordre

| Schéma | Niveau | Ce qu’il fixe |
| --- | --- | --- |
| [Contexte](01-contexte.md) | C4 contexte | Chercheur, archive, spécialistes, Jeux, Chartisme, dessin |
| [Conteneurs](02-conteneurs.md) | C4 conteneurs | Page, proxy, API, paquet, fichiers |
| [Composants](03-composants.md) | C4 composants | Labo et modules de `synchro.decision_tree` |
| [Lecture — flux](04-lecture-flux.md) | Flux | `read_flux`, de la question au rapport sauvé |
| [Tableau — flux](05-tableau-flux.md) | Flux | Colonnes et étiquette selon la question |
| [Recherche — flux](06-recherche-flux.md) | Flux | Fenêtres, coupe, paramètres, nul |
| [Sortie — flux](07-sortie-flux.md) | Flux | Dessin, feuilles, brouillons, journal, suite |

## Identifiants stables

À réutiliser tels quels quand la fonction évolue.

| Identifiant | Fonction |
| --- | --- |
| `filtreJour` | Bandeau tous / mardi / vendredi, avant le tableau et la lecture |
| `ere` | Formule actuelle, ou tout l’historique |
| `question` | Flux, une série, boules, figures |
| `tableau` | `build_question`, état juste avant t |
| `fenetres` | Période de chaque indicateur, apprise ou fixe |
| `coupe` | Seuil de l’étiquette, appris ou figé |
| `recherche` | Profondeur et critère sur l’apprentissage |
| `controle` | 100 derniers, ou 30 % si moins de 40 lignes |
| `remaniements` | Même calcul sur l’ordre détruit |
| `verdict` | p ≤ 0,05 |
| `regles` | Chemins racine vers feuille, contrôle de chaque feuille |
| `dessin` | dtreeviz, sinon texte |
| `brouillons` | Spécialiste ou règle, non enregistrés |
| `journal` | p corrigé sur l’ère |
| `suite` | Autre question, entraîner, Jeux, ou règle |

## Code de référence

- Page : `src/app/brain/decision-tree/page.tsx`
- Labo : `src/components/brain/decision-tree-lab.tsx`, `decision-tree-frame.tsx`, `question-table.tsx`
- Client : `src/lib/brain/decision-tree.ts`, `decision-tree-view.ts`
- Proxy : `src/app/api/brain/[...path]/route.ts`
- API : `synchro/app.py`
- Fonction : `synchro/decision_tree/reading.py` (`read_flux`)
