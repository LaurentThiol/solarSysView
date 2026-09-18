# Synchro — tirages EuroMillions

Deux couches sur les mêmes tirages : **Next.js** (consultation + laboratoire d’analyse + Morpho) et **Python / Neon** (historique FDJ complet). Les résultats officiels restent ceux de la [FDJ](https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique).

## Démarrage

Prérequis : **Python 3.10+**, **Node.js 20+** / npm.

```bash
./launch
```

Équivalent : `make start`. Arrêt : bouton **Quitter** dans le bandeau, **Ctrl+C**, ou `./launch stop`.

Le lanceur (même modèle que PaxVideo) installe les dépendances si besoin, libère les ports, démarre l’API FastAPI et l’UI Next.js, puis **vérifie le statut** :

1. Python, Node, `.env` / `DATABASE_URL`, Git
2. `/api/alive` (liveness, sans ping Neon)
3. `/api/health` (Neon, nombre de tirages, dernier tirage, fraîcheur)
4. `POST /api/sync/ensure` si Neon est joignable (rattrape l’archive FDJ récente si besoin)
5. HTTP 200 sur l’UI

`/api/health` peut prendre quelques secondes si Neon réveille le compute (timeout 20 s). L’UI démarre même si Neon est rouge.

| Commande | Rôle |
|----------|------|
| `./launch` / `./launch start` | API + UI, install si besoin, ouvre le navigateur |
| `./launch stop` / `make stop` | Arrêt propre via `/api/shutdown`, puis libère 8000 et 43147 |
| `./launch stop --force` | Libère les ports même si le processus n'est pas Synchro |
| `./launch restart` | Arrêt puis start |
| `./launch status` | Qui écoute, `/api/alive`, santé Neon |
| `./launch logs` / `./launch logs -f` | Journaux `.run/` (aperçu ou suivi) |
| `./launch update` / `make update` | Contrôle GitHub (`git fetch`) et tire `origin` en fast-forward |
| `./launch doctor` | Python, venv, Node, `.env`, ports, VLM, chartisme, harmo, Ollama |
| `./launch install` | Dépendances seulement |
| `./launch install-vlm` | Moondream via torch (optionnel si `ollama pull moondream`) |
| `./launch install-chartisme` | Réseaux chartisme (optionnels) |
| `./launch install-harmo` | Extras Harmo (PyWavelets, ssqueezepy, librosa) |
| `./launch shortcut` | Raccourci Bureau / menu applications (Linux) ou `~/Desktop/Synchro.command` (macOS) |
| `make test` | Tests (`pytest`) |

Sur macOS, un double-clic sur `Synchro.command` à la racine du dépôt lance aussi le projet.

Options : `--skip-install`, `--force-install`, `--no-open`. Ports : `SYNCHRO_BACKEND_PORT` (sinon `PORT` du `.env`, 8000) et `SYNCHRO_FRONTEND_PORT` (43147). L'API ne se recharge que si `synchro/` change, pas l'UI. Logs : `.run/` (`./launch logs -f` depuis un autre terminal).

Dans l’UI, les pages s’ouvrent depuis le **menu burger** (raccourci **g** hors champ de saisie), groupées en **Archive**, **Lecture**, **Grilles**, **Assistants** et **Système**. Le bandeau garde le burger, **Synchro**, le nom de la page courante, et les pastilles **Santé** / Aide / Glossaire. Une pastille **Santé** (clic pour le détail API / Neon / GitHub / LLM) refait les contrôles au chargement, au focus, et périodiquement. La pastille Neon affiche la **date de dernière synchro** (`MAJ …`). Ton ambre = tirages en retard : un clic en local lance le rattrapage. GitHub en retard ouvre **Admin**. Le bouton **Quitter** (localhost uniquement) arrête l’API et l’interface.

## Tirage (`/tirage`)

Archives EuroMillions : tableau filtrable, jackpot / report, **totaux de gagnants FR+EU** (somme des 13 rangs ; EU comprend la France), échelle des 13 rangs FDJ au clic, et export CSV (numéros, totaux, rapports €). En local, les données viennent de **Neon** (année du dernier tirage) dès que l’API répond ; sinon repli sur `src/data/euromillions-2026.json` (sans euros). L’accueil `/` redirige vers cet onglet.

## Évolution (`/evolution`)

Onglet admin : **évolution dans le temps** (SMA et Bollinger optionnels sur chaque n1–n5 / e1–e2 et sur les sommes ; sur « Chaque numéro », ligne **gagnant 1er rang** : 0 s’il y a un gagnant du jackpot, +1 sinon), **dessin libre chartiste** (figure de la table, segment = droite, départ/arrivée aimantés, fenêtre de coordonnées, capture IA), **suivi pair/impair** (pair = +1, impair = −1, cumul numéros et étoiles), **forme de la grille** (étendue max−min, paires consécutives, occupation des cinq décennies 1–10 … 41–50, SMA et Bollinger optionnels comme sur la courbe), **20 / 50 derniers tirages**, **numéros et étoiles les plus sortis / en retard**, grille 1–50. Même accès que **Admin** (`ADMIN_PASSWORD`, ou ouvert en local sur `127.0.0.1`). Fenêtres : 20 tirages, 50 tirages, année en cours, formule actuelle, tout l’historique ; filtre mois sur les plages calendaires.

## Analyse (`/analyse`)

Laboratoire borné par une **fenêtre de travail** (presets : 20/50/100/200 tirages, 3/6/12 mois, année civile, formule actuelle, tout, ou dates Du/Au). Tous les onglets — y compris χ², Bayes et Monte-Carlo — lisent ce même jeu. Un **warmup** (52 tirages avant la fenêtre par défaut) alimente EMA / RSI / Ichimoku sans entrer dans les agrégats. `X` reste la période des indicateurs, distincte de la plage calendaire.

Onglets technique : Vue (série, OHLC / Heikin-Ashi / Renko, profil temporel, comparaison A/B), Tendance, Momentum, Volatilité, Niveaux, Figures, Flux (activité-proxy, pas un volume de marché), Moyennes, Système. Onglets tirage : Numéros (grille 1–50), Pair / impair, Hasard, Bayésien, Dépendance, Probabilités (combinatoire, indépendante de la fenêtre), Mémo.

Les tirages sont indépendants : ces outils décrivent l’archive, ils ne prédisent pas le prochain. Monte-Carlo via l’API Python quand elle est joignable (`from_date` / `to_date` de la fenêtre).

## Combinaisons (`/combinaisons`)

Composeur EuroMillions 5+2 : chaque boule affiche **total de sorties** et **retard** dans la même fenêtre de travail qu’Analyse. Cinq stratégies proposent jusqu’à 20 grilles (équilibré, retards, totaux élevés / faibles, aléatoire). Le score affiché est une **proba de gain** : loi officielle des 13 rangs (identique pour toute grille 5+2) et **P̂ empirique** (part des tirages de la fenêtre où la grille aurait été payée, avec IC Wilson). Le tableau officiel ajoute le **rapport moyen** FDJ de la fenêtre (descriptif). Le contrôle tirage par tirage affiche le rapport € du rang. Les **modèles** se sauvegardent via `/api/grids` (Neon) ou, à défaut, en session. **Consigner** envoie une grille (ou toute la salve) dans **histoJeux** pour un tirage mardi/vendredi. La dernière salve de propositions est lue par **Jeux** pour l’intersection.

## Jeux (`/jeux`)

Deux onglets.

**Solutions** — compteur combinatoire de l’univers EuroMillions (5 parmi 50 × 2 parmi 12 = 139 838 160). Les curseurs de somme, de parité pair/impair, d’étendue, de consécutifs, de décennies (1–10 … 41–50) et de chance 0–100 % par boule réduisent l’espace ; le bandeau affiche en permanence le nombre exact de grilles restantes. 0 % exclut une boule ; un seuil de présence fait entrer les pourcentages intermédiaires dans le décompte entier ; un clic impose une boule. Sous 50 solutions la liste s’affiche, sinon un échantillon uniforme. Les propositions de Combinaisons (session, jusqu’à 20) sont filtrées : combien survivent ici. Ce n’est pas un pronostic : le tirage officiel reste uniforme.

**histoJeux** — journal des grilles **réellement jouées**, stocké dans Neon (`plays`). Chaque ligne a une date de tirage (mardi/vendredi, défaut = prochain tirage encore ouvert avant 20h45 Paris). Après synchro FDJ, rang, correspondances et **rapport €** (× copies) se calculent. Stats descriptives (rangs, matches, total des gains FDJ, boules les plus jouées), **IC Wilson** et **test binomial exact** vs P(gain) officielle ≈ 7,71 % (une consignation = un essai ; les copies ne sont pas des essais de plus). Les consignations depuis Solutions emportent le **spec Jeux** (somme, décennies, forcés…) pour relire pourquoi la grille a été jouée, et **Rouvrir dans Jeux** recharge ces curseurs. Export CSV. Repli session si l’API ne répond pas. Distinct de Mes grilles, qui reste une bibliothèque de modèles.

## Morpho (`/morpho`)

Laboratoire visuel : chaque tirage est un glyphe sur la grille 5×10 + étoiles. Détecteurs géométriques (alignements, grappe, miroir, …), kNN visuel CLIP (navigateur), règles QUAND/ALORS, anticipation `P(forme suivante | contexte)` vs tirages uniformes. VLM optionnel pour la légende :

```bash
ollama pull moondream
```

Puis bouton **Charger / interroger** dans Morpho. Ollama est le backend VLM prioritaire dès qu’un modèle vision est listé (`moondream`, `llava`, `qwen2-vl`, `minicpm-v`). Pas d’install torch dans ce cas. La géométrie reste la source de vérité : Ollama n’a pas l’API `point()` de Moondream, donc pas de score d’ancrage par coordonnées.

Sinon, Moondream2 via Hugging Face :

```bash
./launch install-vlm
# équivalent : .venv/bin/pip install -r requirements-morpho.txt
```

Le bouton peut aussi installer torch + transformers 4.x + accelerate (~2 Go, une fois). `transformers` est épinglé `<5` : la 5.x casse le chargement de `HfMoondream` (`all_tied_weights_keys`). CLIP navigateur : `@huggingface/transformers`, chargé au clic **Œil local CLIP** — ce n’est pas un LLM, il ne passe pas par Ollama.

## Relief (`/relief`)

Carte 3D des tirages : **une ligne de cinq points = un tirage**. Les points sont les statistiques d’ordre **n1→n5** (plus petite boule → plus grande, pas l’ordre de sortie). La **hauteur** est la valeur 1–50. La couleur est le rang (comme l’onglet Évolution). Le glyphe Morpho 5×10 reste sur `/morpho`.

Échantillons **20 / 50 / 100 / 200**. Décalage :

- **Temps** (défaut) — chaque profil est une tranche, le temps va vers l’arrière ;
- **Superposé n1→n5** — tous les profils sur le même axe (faisceau) ;
- **Hexagone / angle d’or / Hilbert / centroïde** — un peigne n1→n5 par tirage, sans grille 5×10.

Lecture **Profils 3D** ou **Plan**. Marqueurs **boule** (défaut à 20/50) ou **point** (défaut à 100/200, plus lisible quand ça s’entasse). Calques optionnels : **rangs dans le temps** (n1 relié à n1 d’un tirage au suivant, comme Évolution) et **tiges** (rappel vertical sol → point, masquable). Glisser fait tourner ; **Maj+glisser** déplace ; molette zoome vers le curseur. À 100/200 la vue d’accueil cadre les tirages récents de plus près. Ce n’est pas un pronostic : le voisinage sur la carte est un choix de mise en page.

## Chartisme (`/chartisme`)

Les **18 figures chartistes** de la table de référence (tête & épaules et son inverse, doubles / triples sommets et creux, biseaux, triangles, rectangle, canal, drapeau / fanion, tasse avec anse, diamant, broadening top) cherchées sur les courbes du logiciel : somme, écart, pairs, retard et sorties de chaque boule, retard et sorties de chaque étoile — 142 courbes exportées de l’archive.

Parmi elles, les **cinq numéros du tirage suivis séparément** — `n1` à `n5` — et les **deux étoiles**, `e1` et `e2`, les mêmes séries que l’onglet Évolution. Ce sont des *statistiques d’ordre* : `n1` est le plus petit numéro du tirage, `n5` le plus grand, jamais la première ou la dernière boule sortie — l’ordre de sortie n’est pas publié. Séparées exprès : chacune a son régime, `n1` vivant contre le plancher 1 et `n5` contre le plafond 50, si bien qu’une même cassure n’y dit pas la même chose. L’espace de règles peut donc viser `n1` sans viser `n5`.

S’y ajoutent les **quatre écarts entre rangs voisins** — `g1` = `n2` − `n1`, jusqu’à `g4` = `n5` − `n4`. Ils disent comment le tirage occupe la grille, et ils le disent mieux que les rangs : ceux-ci sont ordonnés par construction, donc corrélés entre eux, si bien qu’une figure lue sur l’un se retrouve en partie sur les autres sans rien ajouter. Deux numéros collés puis un trou de vingt ne se lisent pas comme cinq numéros régulièrement espacés. Les quatre écarts somment à l’étendue, qu’ils découpent sans trou.

La **règle d’or** est appliquée telle quelle : une cassure n’est retenue que si l’activité dépasse sa moyenne mobile 20 **et** que la cassure est confirmée en clôture (ou par le pull-back suivant). Le « et » n’est pas négociable — c’est lui qui distingue la cassure du *fake breakout*. L’objectif projeté suit la colonne « Objectif projeté » de la table, figure par figure.

**Fenêtre d’étude et échelle** sont deux réglages distincts. La fenêtre dit quels tirages on regarde — 20 / 50 / 100 / 200 derniers, 3 / 6 / 12 mois, année civile, formule actuelle, tout, ou un N libre —, l’échelle dit sur combien de tirages une figure a le droit de se dérouler.

L’onglet **ouvre sur les 100 derniers tirages**, pas sur l’archive entière. Le premier tirage enregistré n’a aucune raison de coïncider avec le début d’un cycle du système observé : ouvrir sur tout l’historique ferait passer une contrainte d’archivage pour une hypothèse de lecture. Toute l’archive reste à un clic, et c’est alors un choix explicite.

En « auto », les échelles se **déduisent de la fenêtre** au lieu de la précéder : sa longueur, sa moitié, son quart, bornées en bas par la plus courte figure détectable (16) et en haut par un plafond de cycle (120). Une fenêtre de 50 tirages se lit donc à 25 · 50, une de 100 à 25 · 50 · 100, l’archive entière à 30 · 60 · 120 — le plafond ayant pris le relais de la longueur. Ce plafond est une affirmation, pas une commodité : une figure de cinq cents tirages ne décrit pas un cycle, elle décrit la longueur d’archive dont on dispose. Forcer une échelle plus longue que la fenêtre répond à une autre question, « quelle figure longue s’achève ici », et reste possible.

Le N libre n’apparaît que sur les fenêtres comptées en tirages — les seules qu’un nombre de tirages sache affiner — et ne s’applique qu’à partir de 16, la longueur du plus petit balayage : sous ce seuil aucune figure ne tient dans la fenêtre, et le preset continue de décider le temps qu’on finisse de taper.

Les tirages qui précèdent la fenêtre sont **calculés en contexte** (grisés sur le tracé) sans être lus. Sans eux, une fenêtre courte mentirait trois fois : le retard d’une boule repartirait de zéro au premier tirage découpé, l’activité perdrait son premier pas, et la MM20 de la règle d’or n’aurait plus vingt points devant elle. Aucune figure entièrement contenue dans le contexte n’est listée ; une figure qui s’y forme et casse dans la fenêtre l’est.

Une échelle courte ne se lit pas comme une longue, et l’onglet le **chiffre à l’instant** au lieu de l’illustrer : pour chaque échelle balayée, la part des fenêtres de bruit qui portent une figure au-dessus du seuil affiché, avec son intervalle de Wilson et la confiance médiane obtenue. Cent vingt remaniements par échelle, tirés dans le navigateur, ré-lus sans être refaits quand on bouge le seuil — ce qui rend le curseur instantané et, surtout, permet de l’inverser. La confiance est escomptée selon la part de fenêtre couverte, donc une figure courte, qui couvre presque tout son tracé, la gagne sans rien gagner en substance ; en sens inverse une fenêtre courte offre moins de pivots, donc moins d’occasions qu’une forme s’ajuste.

L’échantillon est pris **sans seuil et sans dédoublonnage**, et le second point n’est pas un détail : `dedupe` classe une cassure confirmée devant une figure plus confiante de même nom, si bien qu’à seuil nul une cassure peu confiante évinçait une figure que le seuil aurait gardée. Le taux relu tombait alors sous le taux réel — le taux de base se trompait en sa faveur, exactement l’erreur que la mesure existe pour éviter. Sans dédoublonnage, une figure est présente au seuil *b* précisément quand sa meilleure confiance atteint *b*, et un test vérifie que relire au seuil compte comme mesurer au seuil.

Le bruit est fait des **mêmes tirages remis dans un ordre quelconque**, non d’une marche gaussienne. Une marche est non bornée et sans rapport avec la courbe lue : elle sous-estimait le bruit partout où la courbe est bornée, et la plupart le sont. `n1` ne descend pas sous 1 et passe l’essentiel de son temps entre 1 et 10, si bien que deux passages sur le plancher forment un plancher et non un double creux ; « paires consécutives » ne prend que quelques valeurs entières et produit des ex æquo à chaque tirage, qu’une marche continue ne produit jamais. Le remaniement garde exactement les bornes, les paliers et les ex æquo de la courbe regardée, et l’écart mesuré est franc : à l’échelle 60 et au seuil 0.6, presque toutes les fenêtres de bruit de « paires consécutives » portent une figure, contre moins des deux tiers pour la somme. Un même seuil n’y dit donc pas la même chose, et le taux se mesure par courbe. Ce que la mesure teste est exactement la prétention du chartisme — que l’ordre des tirages porte une forme — et rien d’autre : l’équiprobabilité des tirages n’est pas mise en cause, ils sont pris comme ils sont.

**Le seuil se règle en rareté visée**, non en confiance absolue — c’est le premier réglage de l’onglet qui signifie la même chose partout. Puisque le taux de base se mesure par courbe, 0.60 sur la somme et 0.60 sur « paires consécutives » ne désignent pas le même degré de rareté : le curseur d’avant ne se comparait ni d’une courbe à l’autre ni d’une échelle à l’autre. Renversé, il se donne en part de fenêtres de bruit qu’on accepte de voir porter une figure — « montre-moi ce que le hasard ne produit que dans une fenêtre sur cinq » — et l’onglet cherche le seuil qui l’obtient sur la courbe affichée. Le calcul était déjà là ; il manquait l’inversion, qui se lit directement dans la distribution des meilleures confiances du bruit : pour ne tolérer qu’une part *p* de fenêtres porteuses, le seuil doit dépasser la (*p*·N + 1)-ième meilleure. La tolérance est **tronquée et non arrondie** — viser 20 % sur 120 remaniements autorise 24 fenêtres, pas 24,4 — pour que la mesure se trompe du côté sévère, et le taux obtenu s’écarte de la cible parce qu’un seuil ne se règle qu’au centième. Le mode « confiance » reste disponible pour lire un nombre posé.

Le seuil devient **propre à chaque échelle**, ce qu’il fallait de toute façon : à escompte de couverture égale, une figure de 17 tirages et une de 69 ne gagnent pas la même confiance pour la même substance. Deux figures d’échelles différentes deviennent ainsi comparables. Et les deux mesures vont en sens contraire, ce qui interdit de déduire l’une de l’autre : sur la somme, à seuil fixé de 0.60, le bruit **monte** avec la longueur (63 % à l’échelle 30, 69 % à 120 — plus de pivots, plus d’occasions de s’ajuster), tandis que le seuil requis pour 20 % **descend** (0.71 à 30, 0.66 à 120 — une figure y couvre une moindre part de la fenêtre, donc toutes les confiances baissent, bruit compris). La fenêtre courte est donc la sévère, ce qui n’est pas l’intuition.

**Lecture géométrique d’abord, rareté ensuite.** Le seuil d’ensemble — « n’importe quelle figure dans la fenêtre » — était dicté par le motif le plus bruyant. Même à 50 % d’acceptation, il tombait souvent vers 0.63, au-dessus de la confiance médiane des formes réellement lues (~0.42) : le tracé restait vide alors que les détecteurs avaient déjà trouvé une dizaine de lectures. Un double creux à 0.37, que le hasard produit à peine, disparaissait derrière le seuil des triangles. L’onglet balaye donc au plancher géométrique, montre toutes les lectures, et juge **chaque figure à son propre taux de base**. Le badge « rare » / « commune au bruit » dit le verdict ; « Seulement les rares » retrouve l’ancien filtre. Quand un motif est hors d’atteinte — il faudrait dépasser 0.95 — il n’est jamais rare, mais il reste visible en lecture complète. Le curseur de rareté monte jusqu’à 80 %. Le rétro-test reçoit toujours les seuils d’ensemble appariés aux échelles.

**Carte des courbes.** Le sélecteur propose 142 entrées sans rien en dire, et l’avertissement ne venait qu’après coup, une fois la courbe choisie. Or le taux de base répond avant : la carte mesure les 142 courbes une fois — cent vingt remaniements chacune, autant que le chiffrage sous le tracé, à une échelle qui se choisit et part de la plus longue balayée — et les classe par le seuil qu’il leur faudrait pour tenir la rareté visée. Une colonne de figures réelles distingue ensuite une courbe lisible en principe d’une courbe qui l’est en fait. Un clic sur une ligne remplace le choix à l’aveugle. Rien n’est écarté pour autant : une courbe illisible pour ses figures peut se regarder pour autre chose, et l’onglet n’a pas à décider ce qu’on cherche. La mesure tourne dans le navigateur, courbe par courbe, avec progression et arrêt, et se dit périmée quand la fenêtre, l’échelle ou la rareté ont changé depuis. Elle coûte, mesuré sur les 142 courbes, deux secondes à l’échelle 25 et une dizaine à l’échelle 120 — le prix suit la longueur de la fenêtre simulée — ce qui n’obligeait pas à échantillonner plus court ici qu’ailleurs : à graine, longueur et remaniements égaux, la ligne de la courbe affichée porte exactement le seuil annoncé sous le tracé, et un écart d’un centième entre les deux se lirait comme une contradiction. Toutes les courbes voyant les mêmes remaniements, le classement est plus stable que chacun de ses chiffres — un hasard de tirage les déplace ensemble — mais il sépare des familles et non des rangs : à cent vingt remaniements l’écart entre deux voisines ne se tranche pas.

Ce classement **ne se déduit pas** du bruit lu à un seuil fixe, et c’est ce qui justifie de l’inverser. À l’échelle 60, sur mille tirages, cent cinquante remaniements par courbe :

| courbe | bruit à 0.60 | seuil pour n’en garder qu’une sur cinq |
|---|---|---|
| 3ᵉ numéro trié | 57 % | 0.68 |
| Somme des numéros | 64 % | 0.68 |
| Plus grand numéro | 73 % | 0.73 |
| Pairs / impairs | 83 % | 0.75 |
| Retard d’une boule (médiane sur 50) | 87 % | 0.93 — et 13 boules sur 50 **hors d’atteinte** |
| Paires consécutives | 99 % | 0.83 |
| Présence d’une boule (médiane sur 50) | 99 % | **hors d’atteinte** (1.00) — les 50 boules |

« Paires consécutives » et « présence d’une boule » ont **le même bruit à 0.60** — 99 % des fenêtres de bruit portent une figure — et un verdict opposé : la première se laisse trier à 0.83, la seconde à aucun seuil. Deux courbes, un même nombre, deux conclusions contraires : c’est la démonstration la plus courte qu’un taux de base lu à un seuil fixe ne classe rien.

Ce qui décide est la **forme** de la distribution, et plus précisément son sommet. Toujours à l’échelle 60, en comptant les fenêtres de bruit dont la meilleure figure frôle l’ajustement parfait :

| courbe | fenêtres à confiance ≥ 0.99 | confiance médiane du bruit |
|---|---|---|
| Somme des numéros | 0 / 150 | 0.64 |
| Paires consécutives | 0 / 150 | 0.78 |
| Retard d’une boule (boule 7) | 29 / 150 | 0.66 |
| Présence d’une boule (boule 7) | 95 / 150 | 0.99 |

« Paires consécutives » a la médiane la plus haute des courbes lisibles et **aucune** queue : sa distribution est haute et tassée, donc un seuil posé juste au-dessus la coupe. La présence d’une boule a la médiane *à* l’ajustement parfait — une série de 0 et de 1 offre des sommets et des creux parfaitement plats, qu’un détecteur épouse exactement, et la confiance y frôle 1 sans rien mesurer : les deux tiers du bruit sont déjà au plafond, aucun seuil ne peut descendre à un cinquième. Le retard est le cas intermédiaire et le plus instructif : sa médiane est **plus basse** que celle de « paires consécutives », donc son bruit est en moyenne plus sage, et il est pourtant bien plus dur à trier — parce qu’un cinquième de ses fenêtres atteint l’ajustement parfait. C’est la queue qui coûte, pas le corps.

**Ce qui a été corrigé au passage.** Une version antérieure de ce paragraphe affirmait que le retard devenait illisible à partir de l’échelle 60. La mesure dit l’inverse, et le sens général vaut pour toutes les courbes : le seuil requis **descend** quand la fenêtre s’allonge, donc c’est la fenêtre **courte** qui est sévère. La somme demande 0.71 à l’échelle 30 et 0.66 à 120 ; le retard passe de 18 boules triables sur 50 à l’échelle 30 à 37 à l’échelle 60, puis aux 50 à l’échelle 120. La plus longue échelle balayée est donc la plus **permissive** — ce qu’il faut savoir en lisant la carte, qui s’y règle par défaut et le dit désormais dans les deux sens.

**Et la carte trouve ce qu’aucune règle ne prédit.** Le retard ne se comporte pas comme une famille à l’échelle courte : il se **sépare en deux**. À l’échelle 25, six boules sur cinquante demandent 0.65 ou moins — ce sont les courbes au seuil requis le plus bas des 142, la meilleure à 0.52 pour 17 % de bruit — tandis que vingt-huit sont hors d’atteinte. L’écart entre la meilleure et la pire boule est de 0.46, et il ne vient pas de l’échantillonnage : sur quatre graines de cent cinquante remaniements, le seuil requis d’une boule donnée ne bouge que de 0.05 en médiane, et sept des dix meilleures boules sont les mêmes aux quatre graines. La scission est donc une propriété des courbes.

Ce qui l’explique n’est pas la fréquence de la boule — la corrélation de rang entre nombre de sorties et seuil requis vaut 0.29, et les dix boules les plus lisibles sortent en moyenne 99 fois contre 107 pour les vingt-huit hors d’atteinte, soit rien. **C’est l’argument de la carte** : le classement ne se déduit d’aucune propriété simple de la courbe, donc il faut le mesurer, et choisir une courbe dans une liste de 142 sans l’avoir mesurée revient à tirer au sort — cinquante courbes de retard s’y présentent à l’identique, dont six sont les meilleures de la carte et vingt-huit ne peuvent rien dire.

**Le classement dépend de la rareté demandée, et il s’inverse.** C’est le résultat le plus contraire à l’intuition de tout ce qui précède, et il lie deux réglages qu’on croyait indépendants. À l’échelle 30, sur toute l’archive, cent vingt remaniements — les conditions que l’onglet prend par défaut, donc reproductibles d’un clic :

| cible | 8 premières courbes | retards hors d’atteinte | atteignables sur 142 |
|---|---|---|---|
| une fenêtre sur 5 | **4 retards** (0.59 à 0.65), puis étendue, somme, centre de masse, 3ᵉ rang | 32 / 50 | 39 |
| une fenêtre sur 20 | **aucun retard** : étendue, rangs 2-3-4, somme des étoiles, somme, centre de masse | 50 / 50 | 17 |

En resserrant la cible de 20 % à 5 %, la famille du retard passe de première à absente et les variables libres prennent la tête. La raison est la **queue** déjà décrite : le retard a un corps sage et un sommet au plafond, donc son vingtième centile est bas et son cinquième est au plafond — la meilleure boule passe de 0.59 à hors d’atteinte. La somme n’a pas de queue, donc ses centiles bougent à peine, de 0.71 à 0.82. Une courbe à queue lourde gagne les cibles larges et perd les étroites ; une courbe tassée est indifférente à la cible. À l’échelle 25, plus courte encore, le renversement est complet : les huit premières sont huit courbes de retard à 20 % et une seule à 5 %.

Il n’y a donc **pas de « bonne courbe » en soi**, seulement une bonne courbe pour une rareté donnée — et c’est pourquoi la carte se déclare périmée dès que la rareté visée change plutôt que de garder son classement.

Les chiffres de ce tableau ont été obtenus deux fois, par le navigateur et par un harnais hors ligne appelant les mêmes modules : 39 et 17 courbes atteignables, mêmes huit premières, mêmes seuils au centième. C’est ce qui autorise à mesurer hors ligne les variantes trop longues à explorer à la main.

Les chiffres ci-dessus portent sur une archive synthétique de mille tirages, et le 0.05 d’amplitude entre graines dit exactement leur précision : deux courbes séparées par moins que cela ne sont pas classées, une scission de 0.46 est réelle. L’onglet les recalcule pour l’archive et la fenêtre effectivement chargées.

**Est-ce que ça change ?** La fenêtre étudiée est comparée à celle qui la précède immédiatement, de **même longueur**, lue avec les mêmes échelles et le même seuil. L’égalité de longueur est exigée, pas seulement l’antériorité : le nombre de figures croît avec le nombre de tirages, et comparer cinquante tirages à dix-neuf montrerait toujours « moins de figures avant » sans rien dire du système. Une figure présente dans les deux tranches a une chance de décrire le système observé ; une figure absente de l’une décrivait surtout l’endroit où l’on a coupé. À ces effectifs aucun test ne tranche, et le panneau le dit.

Quatre lectures de la même fenêtre, comparées sur le **même** jeu de validation :

| Lecture | Ce qu’elle regarde |
|---|---|
| géométrique | règles écrites à la main : pivots de swing, niveaux, pentes |
| DTW | plus proche voisin élastique, sans un poids appris |
| `svgformer` | transformer hiérarchique façon DeepSVG : la fenêtre est une suite de commandes `m` / `l` / `c` / `z` à arguments quantifiés |
| `gnn` | GINEConv de PyTorch Geometric sur un graphe de coordonnées : ancres et points de contrôle en nœuds, segments et cordes en arêtes |

Les deux réseaux travaillent sur une fenêtre **ramenée au carré unité**, donc sans dépendre de la résolution ni de l’unité de la variable. Ils sont **optionnels** :

```bash
./launch install-chartisme   # torch + torch-geometric, ~2 Go, une fois
./launch chartisme-train     # quelques minutes sur processeur
```

Sans eux, l’onglet reste entier : détecteurs géométriques et recherche par ressemblance DTW n’ont besoin de rien. Poids dans `.chartisme/weights/`, hors dépôt ; `./launch doctor` affiche le verdict du dernier entraînement.

**Atelier d’étiquetage** : sélection au pinceau sur la courbe, catalogue des 18 figures ou classe libre, placement des rôles de pivots (tête, épaules, ligne de cou…), bloc-croquis pour dessiner une forme et retrouver les fenêtres qui lui ressemblent, et une liste des fenêtres les plus incertaines à trancher en priorité. Tes étiquettes pèsent trois fois plus que le synthétique et partent d’abord en **validation** : un score mesuré sur les étiquettes faibles ne dirait que l’accord avec le détecteur.

**Espace de règles**, délibérément descriptif : QUAND figure ∧ courbe ∧ confiance ∧ cassure ∧ tendance ∧ simultanéité, ALORS `tag` / `alert` / `note` / `hypothesize` / `watch`. La courbe se vise à deux granularités, parce que le catalogue en a deux : une courbe précise pour les dix-huit séries sans indice — c’est ainsi qu’une règle porte sur `n1` et une autre sur `n5` — ou une famille entière pour les séries indexées par boule, personne n’écrivant cinquante règles pour dire « le retard d’une boule quelconque ».

La **simultanéité** répond au fait que les rangs d’un tirage sont liés par construction : `n1` bas pousse les autres vers le haut. Une figure haussière sur `n5` au même moment qu’une baissière sur `n1` peut n’être qu’un seul fait — l’étalement du tirage — compté deux fois. Une règle peut donc exiger une figure sur une courbe voisine nommée (avec son sens de cassure et une tolérance en tirages, une harmonique transitoire ne frappant pas toutes les courbes le même jour), ou exiger l’inverse : ne retenir que les figures qui ne sont pas le reflet d’une voisine. Le recouvrement se mesure en indices de tirage, pas en dates. La voisine se nomme, faute de quoi la condition resterait sans réponse dans le navigateur : répondre « aucune figure ailleurs » supposerait d’avoir balayé les 142 courbes. Et quand aucune voisine n’a été lue, la condition n’est pas déclarée satisfaite — sinon la règle tirerait sur un silence.

Les cinq actions sont des écritures dans le journal — aucune ne touche aux grilles, et il n’y a pas de branchement vers `/combinaisons`. Le rétro-test dit ensuite ce qui valait quelque chose.

**Rétro-test**, deux questions et un garde-fou :

- *l’objectif a-t-il été atteint ?* comparé à un modèle nul qui applique la même mesure à des points tirés au hasard sur la même courbe (même distance, même niveau d’invalidation, même horizon), avec intervalles de Wilson ;
- *y a-t-il un signal sur les numéros ?* les boules sorties après chaque déclenchement contre l’uniforme, chaque tirage postérieur compté une seule fois, avec correction de Benjamini-Hochberg — cinquante tests simultanés produisent deux ou trois « découvertes » par pur hasard ;
- le **taux de base** : combien de fenêtres de bruit de même longueur portent la même figure, mesuré à l’échelle la plus longue balayée (`base_length`) et **pour chaque variable réellement balayée**, du plus bruité au moins. Le bruit vient des tirages remis dans un ordre quelconque, donc il dépend des bornes de chaque courbe et le taux moyen n’est qu’un résumé. Chaque variable dit aussi le **seuil qu’il lui faudrait** pour tenir la rareté visée, ou qu’aucun seuil lisible n’y parvient — ce qui est un résultat. Un budget de fenêtres se partage entre les variables plutôt que de se multiplier par leur nombre — recalculer une série par remaniement coûte — et le nombre de remaniements réellement fait accompagne chaque taux, avec son intervalle de Wilson. Mesure inconfortable et nécessaire : une figure fréquente sur du bruit n’apprend rien quand on la voit sur une vraie courbe.

Le rétro-test se **borne par défaut à la fenêtre d’étude**, aux mêmes échelles que le tracé (`start`, `end`, `context`, `scales`) : les valeurs des courbes sont découpées, pas recalculées, donc un retard reste un retard, et seules les figures qui s’achèvent dans la fenêtre sont comptées. La mesure y perd de la puissance — moins de cassures réglées, donc un intervalle de Wilson plus large — et le rapport affiche cet effectif et cette largeur au lieu de les acheter en élargissant la fenêtre. Décocher la borne parcourt toute l’archive de l’ère choisie : plus de cassures, mais la mesure suppose alors que les vingt dernières années forment un seul régime. Ce n’est pas la position neutre, c’est une hypothèse — elle ne se choisit pas par omission.

**Export automatique** : `run_ensure()` accroche un cycle complet dès qu’un tirage entre en base (réexport des courbes → balayage → règles → journal → état dans `.chartisme/state.json`). Le cycle est non fatal et silencieux : un balayage qui casse n’empêche jamais une synchro FDJ d’aboutir. Désactivable par `SYNCHRO_CHARTISME_AUTO_EXPORT=0`.

Les tirages sont indépendants. Une figure sur une courbe de retards ou de sorties est une propriété du tracé, pas une prédiction. Cet onglet décrit, et le rétro-test mesure l’écart entre la figure et le hasard ; il ne le comble pas.

## Harmo (`/harmo`)

Laboratoire spectral sur les mêmes séries qu’Analyse (somme, étendue, retard, présence, étoiles). scipy est la source de vérité ; le navigateur n’invente pas de FFT. Les unités sont des **cycles/tirage** et des **cycles/an**, pas des hertz : interpoler vers une grille kHz fabriquerait des artefacts. Le « 50 Hz réseau » est l’analogue d’un **peigne de raies verrouillé** sur le calendrier (année, semestre, trimestre, plus un scan de fondamentale).

Trois dictionnaires d’énergie, affichés dans **Mélange** :

| Analogue | Signature | Outils |
|---|---|---|
| Réseau | raies horizontales, Q élevé | Blackman-Harris / Flattop, THD / HNR, Lomb-Scargle, cepstre, F-test de Thomson |
| Mécanique | crêtes obliques, smearing, modulation | Hilbert, STFT, order tracking tacholess (Viterbi → phase → rééchantillonnage angulaire) |
| Acoustique | continuum, bosses larges | Welch, multitaper, HPSS par médianes (librosa optionnel) |

`ShortTimeFFT` sépare visuellement droites horizontales et trajectoires liées à un « régime » variable. Le synchrosqueezing STFT est implémenté sans `ssqueezepy` ; PyWavelets / ssqueezepy / librosa restent des extras :

```bash
./launch install-harmo
```

Le modèle nul (onglet **Tests**) rejoue des tirages uniformes **aux mêmes dates** : un pic n’est lu que contre ce hasard-là. La série retard a des harmoniques **par construction** (dents de scie) ; l’onglet le dit.

Sans Neon, Harmo lit l’archive JSON embarquée (`src/data/euromillions-2026.json`), la même que l’UI.

## IA (`/ia`)

Lecture d’une capture (visuel + données de fenêtre). L’onglet propose **Gemini** et **OpenAI**, puis un **choix de modèle** : un catalogue recommandé pour la lecture d’écran, plus les modèles de chat visibles sur tes clés. La réponse **s’écrit en flux**. **Comparer** envoie le même pack à deux modèles (Flash contre Pro, ou Gemini contre OpenAI) — utile en Chartisme / Harmo. Le modèle réellement utilisé s’affiche sous la réponse ; un aperçu introuvable replie vers le catalogue, sauf si des jetons ont déjà commencé.

L’historique (colonne **Captures**) se **renomme**, s’**épingle**, s’**exporte** (Markdown, JSON, PDF du fil) et se **supprime**. Un JSON réimporte les lectures. Les épinglées ne tombent pas des huit derniers fils. Les clés sont dans Admin. L’assistant décrit l’archive, puis peut pronostiquer (hypothèse, pas une certitude).

Un troisième fournisseur **Local** (Ollama / llama-server) sert surtout les lectures **texte** du pack. Un 404 Ollama **ne bascule pas** sur Gemini / OpenAI. Si le probe touche vraiment Ollama (`/api/tags` ou `/api/version`), le chat utilise `/api/chat` avec `num_ctx` (défaut 16384, `OLLAMA_NUM_CTX`). LM Studio et llama-server restent sur `/v1/chat/completions`. Case **Approfondir** : température 0.7, plus long, `think` seulement sur qwen3 / deepseek-r1 / gpt-oss / r1. Les modèles vision (`moondream`, `llava`…) restent pour Morpho, pas pour le chat.

## Brain (`/brain`)

Catalog nommé des indicateurs (`@rsi`, `@sum.rsi`, `@ete`, `@fft`), **spécialistes** (un petit réseau par série — parité, somme… — entraîné sur l’ère formule, noté sur les 20/50/100 derniers, enregistré dans `.brain/specialists/`), journal persisté (Neon, repli local), mémoire vectorielle locale (`nomic-embed-text`) et **agent manuel** (catalog ou 142 courbes Chartisme). Le panneau **Objets** est exactement le prompt. Chat et lots passent par Ollama ; **Ce tour dans le cloud** / **Lots cloud** sont opt-in. **Approfondir** n’agit que sur le chat local (pas les lots). **Lire la table** décrit les fiches sans modèle. Une **démo guidée** (`/brain?demo=1` ou bouton « Lancer la démo ») épingle un handle par lab, lit la table, suit `@rsi`, balaye ces fiches et les consigne au carnet. Après chaque phase un pop-up explique ce que vous voyez : **Suivant** ou **Annuler**. **Spécialistes** (`/brain/specialistes` ou `/brain?demo=specialistes`) a sa propre démo : nom, cible, forme, indicateurs, score vs hasard, enregistrés ; après chaque étape un pop-up : **Suivant** ou **Annuler**. Elle n’entraîne pas toute seule. L’onglet IA n’est pas fusionné : il reste la lecture de captures. Un spécialiste cite une prévision de série nommée ; Brain peut aussi pronostiquer une grille (hypothèse, pas une certitude).

`./launch doctor` ping Ollama (lecture seule, ne démarre pas le serveur) et prévient si seuls des 3B de chat sont tirés. `OLLAMA_HOST` (défaut `http://127.0.0.1:11434`), `OLLAMA_NUM_CTX` et `LOCAL_LLM_MODEL` sont dans `.env.example`. Pull manuel : `ollama pull qwen2.5:7b`. Un clic glyphe Morpho peut décharger le 7B (`keep_alive` 10m vs 30m côté chat). Entraînement d’un spécialiste : `./launch brain-specialist-train` (ou le panneau Spécialistes de `/brain` / `/brain/specialistes`).

## Admin (`/admin`)

Page locale pour les consoles et les secrets (Neon, Google, OpenAI, Brave Search). Les valeurs sont lues/écrites dans `.env` — **jamais commitées**. Révélation / copie, test de connexion, mise à jour GitHub (`git fetch` / `git pull --ff-only`, équivalent `./launch update`), synchro FDJ.

En local sur `127.0.0.1`, l’accès est ouvert. Si l’UI est exposée, définissez `ADMIN_PASSWORD`. Sur Netlify, les secrets se configurent dans les variables d’environnement du site.

## Interface web (Next.js)

App Next.js : menu burger (raccourci **g**), pages groupées — **Archive** (Tirage `/tirage`, Évolution `/evolution`), **Lecture** (Analyse `/analyse`, Morpho `/morpho`, Relief `/relief`, Chartisme `/chartisme`, Harmo `/harmo`), **Grilles** (Combinaisons `/combinaisons`, Jeux `/jeux`), **Assistants** (Brain `/brain`, Spécialistes `/brain/specialistes`, IA `/ia`) et **Système** (Admin `/admin`). Le nom de la page courante reste à côté de Synchro. Le lanceur l’ouvre sur [http://127.0.0.1:43147](http://127.0.0.1:43147). Sans lanceur :

```bash
npm install
npm run dev
```

Build : `npm run build && npm start`. Le déploiement **Netlify** utilise cette app (`@netlify/plugin-nextjs`).

## Synchro Python → Neon

Import de l’historique complet FDJ (2004 → aujourd’hui) dans PostgreSQL Neon, plus une API FastAPI locale (vérification de grilles, stats sur la formule actuelle).

```bash
cp .env.example .env
# Coller DATABASE_URL (console Neon → projet Synchro → connection pooled)
./launch                 # vérifie Neon et rattrape les derniers tirages si besoin
./launch doctor          # statut Neon
python -m synchro ensure # rattrapage (archive récente) sans relancer l’UI
python -m synchro sync   # historique complet (6 archives), aussi via Admin
```

Puis http://127.0.0.1:8000 (docs : `/docs`).

| Commande | Rôle |
|---|---|
| `python -m synchro init-db` | Crée les tables `draws`, `grids`, `sync_log` |
| `python -m synchro ensure` | Rattrape l’archive FDJ récente si Neon est en retard |
| `python -m synchro sync` | Télécharge les 6 archives FDJ et les écrit dans Neon |
| `python -m synchro serve` | API locale `/api/*` |
| `python -m synchro export` | Snapshot JSON (`synchro/web/snapshot.json`) |
| `python -m synchro chartisme export\|scan\|train\|report` | Module chartisme sans interface (usage cron) |
| `make test` | Tests unitaires (parse FDJ, rangs, stats, `/api/alive`, ensure, chartisme, harmo) |

`DATABASE_URL` ne doit **jamais** être commitée. `.env` en local, variables d’environnement / secret GitHub Actions en déployé. Au premier `./launch`, le fichier `.env` est créé depuis `.env.example` s’il manque.

Chaque ligne de `draws` contient la date, le jour, 5 numéros et 2 étoiles, `star_pool` (9 / 11 / **12 depuis le 27/09/2016**), les gagnants rang 1 FR/EU, **`winners_total_fr` / `winners_total_eu`** (somme des 13 rangs ; EU FDJ = tous pays, France comprise), le code My Million s’il est dans l’archive, et **`prizes`** : l’échelle des rapports FDJ (rangs 1–13, gagnants FR/EU, `winners_total` du rang, montant en €). Un jackpot à 0 € sans gagnant est un report. Étoile+ n’est pas importé.

Un workflow GitHub `sync-fdj` peut tourner le mardi et le vendredi à 21h45 (heure de Paris) si le secret `DATABASE_URL` est défini.

### API locale

- `GET /api/alive` — liveness (pas de Neon)
- `GET /api/health` — ping Neon, tirages, dernier sync, `stale` / `expected_draw_date`
- `POST /api/shutdown` — arrêt propre (localhost uniquement)
- `GET /api/draws?limit=&offset=&q=&year=&era=current|all`
- `GET /api/draws/latest`
- `GET /api/stats?era=current|all`
- `GET /api/analysis/proba` — combinatoire exacte (sans Neon)
- `GET /api/analysis/variables|ohlc|inference|montecarlo|bayes|dependence|lab|ta|numbers` — calculés sur les tirages (`era`, `from_date`, `to_date`, `preset`, `last_n`, `warmup`)
- `POST /api/check` `{ numbers, stars, last_n }`
- `GET\|POST /api/grids` · `PATCH\|DELETE /api/grids/{id}`
- `GET\|POST /api/plays` · `PATCH\|DELETE /api/plays/{id}` — histoJeux (grilles jouées, date de tirage, scoring vs FDJ)
- `POST /api/reload-env` — relit `.env` et recrée le pool Neon
- `POST /api/sync` — historique complet (bouton Admin)
- `POST /api/sync/ensure` — rattrapage si Neon est en retard (`./launch`)
- `GET\|POST /api/morpho/*` — glyphes, voisins, règles, anticipation, VLM
- `GET /api/chartisme/catalog|status|curves|figures|svg|training` — table de référence, état du module, courbes exportées, figures d’une courbe, annotation SVG, rapport d’entraînement
- `POST /api/chartisme/detect|similar` — lecture d’une fenêtre envoyée par le navigateur, recherche par ressemblance DTW
- `GET\|POST /api/chartisme/labels|rules` · `DELETE …/{id}` — atelier d’étiquetage et espace de règles (Neon)
- `POST /api/chartisme/rules/evaluate` · `GET /api/chartisme/firings` — déclenchements et journal
- `GET /api/chartisme/backtest` — objectif atteint, signal sur les numéros, taux de base (`base_length` = longueur des fenêtres de bruit). Bornable à une fenêtre : `start`, `end`, `context` (tirages calculés en amont), `scales` (« 25,50,100 »), `thresholds` (un seuil par échelle, « 0.79,0.74,0.71 », apparié positionnellement et ignoré en entier si la longueur ne correspond pas). La réponse porte un bloc `window` qui dit sur quoi la mesure a réellement porté.
- `GET /api/harmo/status` — scipy / extras (sans Neon)
- `GET /api/harmo/spectrum|welch|stft|envelope|orders|unmix|null` — même fenêtre qu’Analyse (`variable`, `n`, `era`, `preset`, `from_date`, `to_date`, `last_n`, `warmup`). Sans Neon : repli sur l’archive JSON 2026.

Application indépendante, non affiliée à La Française des Jeux.
