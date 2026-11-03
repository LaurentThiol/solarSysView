# Synchro — tirages EuroMillions

Deux couches sur les mêmes tirages : **Next.js** (archive, laboratoires, grilles, assistants) et **Python / Neon** (historique FDJ complet et calculs). Les résultats officiels restent ceux de la [FDJ](https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique).

## Démarrage

Prérequis : **Python 3.10+**, **Node.js 20+** / npm (le build Netlify fixe Node 22).

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
| `./launch doctor` | Python, venv, Node, `.env`, ports, VLM, chartisme, harmo, decisionTree, nextData, Ollama |
| `./launch install` | Dépendances seulement |
| `./launch install-vlm` | Moondream via torch (optionnel si `ollama pull moondream`) |
| `./launch install-chartisme` | Réseaux chartisme (optionnels) |
| `./launch install-harmo` | Extras Harmo (PyWavelets, ssqueezepy, librosa) |
| `./launch install-nextdata` | nextData : LightGBM, CatBoost, Darts (avec pytorch-lightning), Chronos, torch, matplotlib ; vérifie que Darts se charge, télécharge Chronos-2 et vérifie qu’il répond |
| `./launch install-decision-tree` | Répare decisionTree (scikit-learn, dtreeviz, Graphviz). `./launch` l’installe déjà |
| `./launch chartisme-train` | Entraîne svgformer / GNN (après `install-chartisme`) |
| `./launch brain-specialist-train` | Entraîne un spécialiste Brain |
| `./launch shortcut` | Raccourci Bureau / menu applications (Linux) ou `~/Desktop/Synchro.command` (macOS) |
| `make test` | Tests (`pytest`) |

Sur macOS, un double-clic sur `Synchro.command` à la racine du dépôt lance aussi le projet.

Options : `--skip-install`, `--force-install`, `--no-open`. Ports : `SYNCHRO_BACKEND_PORT` (sinon `PORT` du `.env`, 8000) et `SYNCHRO_FRONTEND_PORT` (43147). L'API ne se recharge que si `synchro/` change, pas l'UI. Logs : `.run/` (`./launch logs -f` depuis un autre terminal).

Dans l’UI, les pages s’ouvrent depuis le **menu burger** (raccourci **g** hors champ de saisie) :

| Groupe | Pages |
|---|---|
| **Archive** | Tirage `/tirage`, Évolution `/evolution` |
| **Lecture** | Analyse `/analyse`, Morpho `/morpho`, Relief `/relief`, Chartisme `/chartisme`, Cycles `/cycles`, Harmo `/harmo`, Next `/next` |
| **Grilles** | Combinaisons `/combinaisons`, Pronostic `/pronostic`, nextData `/nextdata`, nextDataTraining `/nextdatatraining`, Jeux `/jeux` |
| **Assistants** | Brain `/brain`, Spécialistes `/brain/specialistes`, decisionTree `/brain/decision-tree`, Dictionnaire `/brain/dictionnaire`, Réf `/ref`, IA `/ia` |
| **Système** | Admin `/admin`, Schémas `/schemas`, Journal `/journal` |

Le bandeau garde le burger, **Synchro**, le nom de la page courante, et les pastilles **Santé** / Aide / Glossaire / Adresse / Capture. Une pastille **Santé** (clic pour le détail API / Neon / GitHub / LLM) refait les contrôles au chargement, au focus, et périodiquement. La pastille Neon affiche la **date de dernière synchro** (`MAJ …`). Ton ambre = tirages en retard : un clic en local lance le rattrapage. GitHub en retard ouvre **Admin**. **Aide** (raccourci **?**) affiche les points d’exclamation des champs. **Glossaire** (raccourci **l**) ouvre Vocabulaire / Probabilités / Mémo / Chartisme (`?glossaire=`). **Adresse** (raccourci **a**, `?adresse=1`) liste les pages, onglets `?tab=` et fonctions API. **Capture** (raccourci **c**) empaquette le visuel et les données de la fenêtre pour IA ou un PDF. Les anciens `/analyse?tab=proba|memo|adresse` sont réécrits vers ces overlays. **Échap** ferme le menu, le glossaire, l’annuaire, une capture ou une démo. Le bouton **Quitter** (localhost uniquement) arrête l’API et l’interface.

## Tirage (`/tirage`)

Archives EuroMillions : tableau filtrable (mois, numéros, **jour mardi / vendredi / synthèse**), jackpot / report, **totaux de gagnants FR+EU** (somme des 13 rangs ; EU comprend la France), échelle des 13 rangs FDJ au clic, et export CSV (numéros, totaux, rapports €). En local, les données viennent de **Neon** (année du dernier tirage) dès que l’API répond ; sinon repli sur `src/data/euromillions-2026.json` (sans euros). L’accueil `/` redirige vers cet onglet.

## Évolution (`/evolution`)

Onglet admin. Trois lectures de courbe : **Courbes**, **Bouncing**, **Annuel**.

**Courbes** — SMA et Bollinger optionnels sur chaque n1–n5 / e1–e2 et sur les sommes. Sur Tous, les pastilles Mardi et Vendredi restent éteintes tant qu’on ne clique pas (Next, lui, les allume). **DeltaEvol** juste après : écart n − n−1 de n1–n5, e1–e2 et des sommes, ligne 0, SMA et Bollinger sur ces écarts, glissement n1/n5, histogramme des pas, |Δ| comparé à un mélange des mêmes valeurs, jauges du |Δ| de n1–n5 et e1–e2 contre l’espérance de deux tirages indépendants, et cohérence du pas (les rangs bougent-ils dans le même sens), dessin libre chartiste sur ces écarts. Sur « Somme des numéros » et « Chaque numéro », ligne **gagnant 1er rang** : 0 s’il y a un gagnant du jackpot, +1 sinon. Dans Chaque numéro et Chaque étoile, **Lien** (éteint) trace un pointillé horizontal entre une boule et sa reprise au tirage suivant de la fenêtre. Un clic depuis Next (couple ou triplet) relie ce lien dans Chaque numéro.

**Persist**, juste sous DeltaEvol — reprise 0 / +1. n−1 : +1 si au moins un des 5 numéros (ou une des 2 étoiles) était déjà dans le tirage précédent de la fenêtre, sinon 0. n−2 : la même règle deux tirages plus tôt ; les deux premiers points n’ont pas de n−2. L’infobulle nomme les boules reprises et la date comparée. La SMA est le taux local de ces 0 / +1 ; la part de la fenêtre se compare au taux de deux grilles indépendantes, le même pour les deux décalages. Mardi seul, n−1 est le mardi d’avant, n−2 le mardi d’encore avant. Ce n’est pas le compte des paires n, n+1 de Forme.

**Bouncing** — sur n1…n5 et e1, e2, arches dont la hauteur décroît comme une balle qui s’amortit (restitution e). La dérivée se lit sur chaque flanc du sommet. Des curseurs resserrent le nombre de rebonds, l’ajustement, la forme, la dérivée, l’amortissement et l’amplitude. Lecture du tracé, pas un pronostic.

**Annuel** — barres horizontales de la somme des 5 numéros. Les années n, n−1 et n−2 restent entières, côte à côte : ce n’est pas le preset « année civile ». Mardi et vendredi se sélectionnent sur le graphique ; sur Tous, les deux pastilles sont éteintes. Le bandeau Mardi ou Vendredi allume ce soir. Synthèse relie chaque tirage par un trait continu. **Décalage** compare des suites de 3 à 10 tirages (8 au départ) entre n et n−1, puis n−1 et n−2. Il retient un écart de −21 à +21 jours quand la chaîne coïncide et que |r| dépasse l’alignement et le 95e centile d’un nul. Un trait horizontal ferme chaque mois, un trait vertical marque 128. Δ compare les moyennes de mois affichées. r n’est pas une probabilité.

**Gains dans le temps** — effectifs FR / EU / hors FR, jackpot €, masse gagnants × rapport, **échelle log** pour comparer rang 13 et jackpot, filtre **jour** (mardi / vendredi / synthèse) commun à toute la page, **longueur de report**, **masse empilée** par rang, dessin chartiste sur ces courbes. La **somme des 5 numéros** est superposée, axe droit. EU comprend la France : on n’additionne pas FR + EU.

**Dessin libre chartiste** — figure de la table, segment = droite, départ aimanté, arrivée démagnétisable au Alt / Option pour poser hors courbe, puis une parallèle au clic suivant (Échap garde le segment seul) — gabarit, segment ou canal —, reprise d’un point déjà posé par clic ou glisser, bandeau de coordonnées au-dessus du graphique, capture IA.

**Suivi pair/impair** — pair = +1, impair = −1, cumul numéros et étoiles. **Forme de la grille** — étendue max−min, paires consécutives, occupation des cinq décennies 1–10 … 41–50, SMA et Bollinger optionnels. **Numéros et étoiles les plus sortis / en retard**, grille 1–50.

Même accès que **Admin** (`ADMIN_PASSWORD`, ou ouvert en local sur `127.0.0.1`). Fenêtres des courbes : 20 tirages, 50 tirages, année en cours, année n-1, formule actuelle, tout l’historique ; filtre mois sur les plages calendaires. Annuel ignore ce découpage. La fenêtre de travail reste **sous le bandeau**, pour changer de plage sans remonter.

## Analyse (`/analyse`)

Laboratoire borné par une **fenêtre de travail** (presets : 20/50/100/200 tirages, 3/6/12 mois, année civile, année n-1, formule actuelle, tout, ou dates Du/Au) et un **jour** (Tous / Mardi / Vendredi / Synthèse). Tous les onglets — y compris χ², Bayes et Monte-Carlo — lisent ce même jeu. « 20 derniers mardi » compte 20 mardis ; le warmup aussi. Un **warmup** (52 tirages avant la fenêtre par défaut) alimente EMA / RSI / Ichimoku sans entrer dans les agrégats. `X` reste la période des indicateurs, distincte de la plage calendaire.

Onglets technique : Vue (série, OHLC / Heikin-Ashi / Renko, profil temporel, comparaison A/B), Tendance, Momentum, Volatilité, Niveaux, Figures, Flux (activité-proxy, pas un volume de marché), Moyennes, Système. Onglets tirage : Numéros (grille 1–50), Pair / impair, Hasard, Bayésien, Dépendance, **Jumeaux** (empreintes multi-axes, heatmap z-score et 8 voisins — ressemblance d’archive, pas un pronostic ; démo guidée `/analyse?tab=jumeaux&demo=1` ou bouton « Lancer la démo », pop-up Suivant / Annuler). **Probabilités** (combinatoire officielle, indépendante de la fenêtre) et **Mémo** (périodes d’indicateurs et biais) sont dans le **Glossaire du bandeau** (`?glossaire=proba|memo`, raccourci **l**). L’annuaire des pages, onglets, API et raccourcis est uniquement dans **Adresse** du bandeau (`?adresse=1`, raccourci **a**).

Les tirages sont indépendants : ces outils décrivent l’archive, ils ne prédisent pas le prochain. Monte-Carlo via l’API Python quand elle est joignable (`from_date` / `to_date` de la fenêtre).

## Morpho (`/morpho`)

Laboratoire visuel : chaque tirage est un glyphe sur la grille 5×10 + étoiles. Détecteurs géométriques (alignements, grappe, miroir, …), kNN visuel CLIP (navigateur), règles QUAND/ALORS, anticipation `P(forme suivante | contexte)` vs tirages uniformes. VLM optionnel pour la légende :

```bash
ollama pull qwen2.5vl:7b
```

Puis bouton **Charger / interroger** dans Morpho. Ollama est le backend VLM prioritaire dès qu’un modèle vision est listé (`qwen2.5vl`, `qwen2-vl`, `llava`, `minicpm-v`, `moondream`). Pas d’install torch dans ce cas. La géométrie reste la source de vérité. Un VLM chat (Qwen2.5-VL) répond en un JSON et peut ancrer des cases / boîtes (`grounding_score`). Moondream n’a pas cet ancrage via Ollama (`ollama pull moondream` reste un repli léger).

Sinon, Moondream2 via Hugging Face :

```bash
./launch install-vlm
# équivalent : .venv/bin/pip install -r requirements-morpho.txt
```

Le bouton peut aussi installer torch + transformers + accelerate (~2 Go, une fois). `transformers` est au plancher `>=5.10.0` (avis publiés sur la 4.x). HfMoondream (révision 2025-06-21) n’appelle pas `post_init` : le chargement rattrape `all_tied_weights_keys`. CLIP navigateur : `@huggingface/transformers`, chargé au clic **Œil local CLIP** — ce n’est pas un LLM, il ne passe pas par Ollama.

## Relief (`/relief`)

Carte 3D des tirages : **une ligne de cinq points = un tirage**. Les points sont les statistiques d’ordre **n1→n5** (plus petite boule → plus grande, pas l’ordre de sortie). La **hauteur** est la valeur 1–50. La couleur est le rang (comme l’onglet Évolution). Le glyphe Morpho 5×10 reste sur `/morpho`.

Échantillons **20 / 50 / 100 / 200**. Décalage :

- **Temps** (défaut) — chaque profil est une tranche, le temps va vers l’arrière ;
- **Superposé n1→n5** — tous les profils sur le même axe (faisceau) ;
- **Hexagone / angle d’or / Hilbert / centroïde** — un peigne n1→n5 par tirage, sans grille 5×10.

Lecture **Profils 3D** ou **Plan**. Marqueurs **boule** (défaut à 20/50) ou **point** (défaut à 100/200, plus lisible quand ça s’entasse). Calques optionnels : **rangs dans le temps** (n1 relié à n1 d’un tirage au suivant, comme Évolution) et **tiges** (rappel vertical sol → point, masquable). Glisser fait tourner ; **Maj+glisser** déplace ; molette zoome vers le curseur. À 100/200 la vue d’accueil cadre les tirages récents de plus près. Ce n’est pas un pronostic : le voisinage sur la carte est un choix de mise en page.

## Chartisme (`/chartisme`)

Les **18 figures chartistes** de la table de référence (tête & épaules et son inverse, doubles / triples sommets et creux, biseaux, triangles, rectangle, canal, drapeau / fanion, tasse avec anse, diamant, broadening top) cherchées sur les courbes du logiciel : somme, écart, pairs, retard et sorties de chaque boule, retard et sorties de chaque étoile — 142 courbes exportées de l’archive. Le **Glossaire** du bandeau (`?glossaire=chartisme`, aussi `courbes` ou `figures`) en donne le dessin d’école et le contexte : une entrée par type de courbe, une par figure.

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

`POST /api/chartisme/detect` accepte `reference_sigma` (nomme le sens de la fenêtre et découpe ses tronçons) et `reference_slope_sigma` (compare les coefficients directeurs). `POST /api/chartisme/similar` cherche dans le jour affiché (`weekday=mardi|vendredi`, ou l’archive mixte).

## Cycles (`/cycles`)

Registre commun des horloges, sur le même index de tirage que la fenêtre d’Analyse : phases **Réf**, raies **Harmo**, figures **Chartisme**, séries d’Analyse. Le sous-titre de la page le dit : le TFT dit lesquelles pèsent. Aucune sortie vers les grilles.

| Onglet | Lecture |
|---|---|
| Registre | Un canal par horloge ou par série. Phase au dernier tirage, période en jours et en tirages. Répond sans torch. |
| Atlas | Poids du réseau de sélection (VSN) sur le walk-forward. |
| Attention | Ruban quantile (0,1 / 0,5 / 0,9) et attention repliée sur les phases. |
| Comparaison | Cosinus des signatures de deux courbes, canaux qui divergent. |
| Nuls | Ablation des horloges contre remaniement, phases permutées et loi marginale. |

Le choix du jour et la fenêtre restent ceux du bandeau. **Lire le TFT** envoie `POST /api/cycles/fit` (encodeur, horizon, epochs). `GET /api/cycles/status` dit si torch est là ; `GET /api/cycles/registry` et `GET /api/cycles/panel` lisent le registre et le panneau. Décrit la structure de l’archive, pas le prochain tirage.

## Harmo (`/harmo`)

Laboratoire spectral sur les mêmes séries qu’Analyse (somme, étendue, retard, présence, étoiles). Le choix du jour (Tous / Mardi / Vendredi / Synthèse) reste sous le bandeau, comme sur Évolution : Mardi ou Vendredi isole ce jour avant les N derniers et le warmup. scipy est la source de vérité ; le navigateur n’invente pas de FFT. Les unités sont des **cycles/tirage** et des **cycles/an** : rééchantillonner les dates fabriquerait des artefacts. Le réseau est l’analogue d’un **peigne de raies verrouillé** sur le calendrier (année, semestre, trimestre, plus un scan de fondamentale).

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

## Next (`/next`)

Lecture des tirages réalisés, du plus récent au plus ancien. Le filtre jour (Tous / Mardi / Vendredi / Synthèse) s’applique avant l’espace. Espaces : 20, 50, 100, 200, année civile, année n−1. Rang 0 est le tirage le plus récent. Les boules absentes de la fenêtre ne sont pas dessinées. Neon si l’API répond, sinon le JSON embarqué.

**Couple** (`?tab=couple`) — volume des boules 1–50. Le poids d’une paire est la somme des co-sorties : le plus récent pèse n, le plus ancien pèse 1. Le compte est le nombre de co-sorties, chacune à 1. « Il y a k tirages » compte les tirages plus récents que la dernière co-sortie. Un clic dans la liste épingle le couple et le relie dans Chaque numéro (Évolution). Un seuil de compte retire les sorties en dessous.

**Triple** (`?tab=triple`) — même lecture pour les triplets, trois boules du même tirage.

**pronosticNext** (`?tab=pronosticNext`) — curseurs sur le total, les pairs, les décennies et n1 à n5. Un champ sans borne reste OFF. Les solutions reçoivent une chance lue à l’envers sur 20, 50, 100 et 200, couples et triples compris. Le tirage officiel reste uniforme.

## Combinaisons (`/combinaisons`)

Composeur EuroMillions 5+2 : chaque boule affiche **total de sorties** et **retard** dans la même fenêtre de travail qu’Analyse. Cinq stratégies proposent jusqu’à 20 grilles (équilibré, retards, totaux élevés / faibles, aléatoire). Le score affiché est une **proba de gain** : loi officielle des 13 rangs (identique pour toute grille 5+2) et **P̂ empirique** (part des tirages de la fenêtre où la grille aurait été payée, avec IC Wilson). Le tableau officiel ajoute le **rapport moyen** FDJ de la fenêtre (descriptif). Le contrôle tirage par tirage affiche le rapport € du rang. Les **modèles** se sauvegardent via `/api/grids` (Neon) ou, à défaut, en session. **Consigner** envoie une grille (ou toute la salve) dans **histoJeux** pour un tirage mardi/vendredi. La dernière salve de propositions est lue par **Jeux** pour l’intersection.

## Pronostic (`/pronostic`)

Schémas de cet écran : [`docs/schemas/pronostic`](docs/schemas/pronostic/README.md), lus dans **Système → Schémas**.

Deux onglets.

**Atelier** — composeur d’hypothèses 5+2 : trois couches modulables (**somme**, **rangs + parité**, **espaces n1–n5 / e1–e2**) se resserrent. Le bandeau affiche le nombre exact de grilles restantes (cascade univers → couches). Les espaces peuvent se chevaucher ; un numéro n’est pris qu’une fois (`n1 < n2 < …`). Un **proposeur** lit la fenêtre (20 / 50 / 100 / année) avec une formule réglable (`min/max ± k·σ`, moyenne ± k·σ, percentiles) ; un walk-forward mesure la couverture. **Appliquer** n’est jamais silencieux. On peut importer un forecast Spécialiste (somme / parité) et **envoyer vers Jeux**. Ce n’est pas P(prochain tirage) : la loi officielle reste uniforme.

**Historique** (`?tab=historic`) — note les **100 derniers tirages**, un par un, numéros et étoiles. La prévision d’un tirage n’utilise que les tirages d’avant : fenêtre stricte 20, 50 ou 100, ou **Choisi avant**. Choisi avant fige, avant le tirage, la fenêtre dont les essais précédents ont demandé la plus petite marge ; en cas d’égalité, la plus courte ; à défaut, 20. La **marge d’erreur** (moyenne ± k·σ) est, en manuel, une règle annoncée à l’avance. En automatique, elle est choisie après les tirages notés (la carte le dit) ; un second taux, la partie jouée, fige la marge sur les seuls tirages d’avant. À cette marge, l’onglet dit si le tirage tombe dedans et combien de grilles 5+2 il aurait fallu jouer. La plus petite marge qui aurait contenu le tirage est l’erreur mesurée. Les courbes montrent cette erreur dans le temps et la part de tirages contenus selon la marge. Le tableau **Paramètres qui pèsent** classe somme, parité et espaces (n1–n5, e1–e2). **Préparer le prochain tirage** recopie la prévision de la moyenne (dernière fenêtre, marge choisie) : ce tirage n’entre pas dans le calcul. Le **comité** (`POST /api/pronostic/committee`) ajoute onze têtes et un global. Chaque tête ne s’ajuste que sur la fenêtre. Si son erreur médiane sur au plus dix essais d’avant est plus grande que celle de la moyenne, elle reprend la moyenne. À égalité, le réseau reste. Le global réécrit les centres dès qu’une tête reste en réseau, recale σ pour qu’1 σ couvre environ deux tiers des tirages d’avant, et remet les rangs dans l’ordre avant le décompte. Le tableau **Têtes** montre la décision, μ, σ et le nombre de fois où la tête a été gardée. **Préparer le comité** recopie ses bandes. S’il reprend la moyenne, le bouton ne propose pas une autre prévision. La confrontation tourne sur mardi seul, vendredi seul, et mardi + vendredi, calculés à part. Sans Python, un bandeau le dit et la marge reste celle de la moyenne. Le plan des résidus place chaque tirage noté sur deux axes de ce vecteur z, avec le carré ±k·σ de la marge en cours. La grille colore le même vecteur, une ligne par tirage et une colonne par axe allumé. Les couches se coupent une à une. Le filtre mardi / vendredi du bandeau s’applique à la moyenne ; le comité confronte quand même les trois séries. L’archive locale 2026 n’a pas encore 100 tirages antérieurs : la fenêtre 100 reste vide tant que l’archive complète n’est pas là, et le comité lit alors une fenêtre de 20.

## nextData (`/nextdata`)

Deux grilles 5+2 pour le prochain tirage. LightGBM et CatBoost lisent les mêmes décalages et les mêmes covariables : calendrier (mardi/vendredi, mois, jour de l’année, Carrington, Schwabe, année tropique), lune, forme (étendue, consécutifs, centre, cinq retards des numéros et deux des étoiles, triés du plus court au plus long, plafonnés à 25 tirages), décennies, delta, répétitions (numéros et étoiles repris de n−1 et de n−2, les comptes de Persist), couples et triples réellement sortis (les dix anciennetés, parts et affinités triées, plafonnées à 25 tirages pour l’ancienneté : aucune ne grandit avec la longueur de l’historique ; la paire d’étoiles garde la sienne), et Pulse (chaque boule et chaque étoile de l’urne a son onde simple, ajustée sur ses seules sorties d’avant ; π est sa probabilité fréquentielle au tirage prévu, le taux de ses sorties au signe de son onde, ramené vers 5/50 ou 2/urne quand son p est grand ; les colonnes nomment les cinq boules et les deux étoiles de plus fort π, et le faisceau ajoute le log π de chaque numéro choisi). Les horloges et Pulse sont connus avant le tirage ; le reste n’est vu que jusqu’au dernier tirage sorti. Une famille décochée sort de LightGBM, de CatBoost et de Chronos.

**Trois ans** apprend sur les années civiles n, n−1 et n−2 du dernier tirage synchronisé ; n reste toujours cochée, puisque ses tirages précèdent le prochain. Le **focus** (20, 50 ou 100 derniers du jour choisi) pèse ×3 ; le reste pèse 1. Raccourcir cette zone laisse plus de poids au reste des années. La fenêtre seule est la lecture qui se concentre sur ces tirages. **Fenêtre seule** n’apprend que sur ce focus, tous ses tirages : leurs 16 décalages lisent les tirages d’avant, comme Darts. Le filtre Tous / Mardi / Vendredi s’applique avant le focus. L’interrupteur choisit la grille encadrée et celle envoyée vers Jeux ; il ne relance pas le calcul. L’anneau d’une boule suit la largeur de sa bande 10–90, calibrée sur le retour.

Chaque rang est **prévu directement**, deux fois. Le **niveau** est le quantile prévu pour ce rang, seul. Le **delta** ajoute au dernier rang sorti le pas n − n−1. Le barreau donne leur poids : l’inverse de la largeur de bande, un peu moins pour le delta. La **chaîne** (n1 puis les écarts g1 à g4 ; e1 puis e2 − e1 pour les étoiles) reste affichée, sans poids : la médiane d’une somme n’est pas la somme des médianes, et additionner des médianes d’écarts tirait n2…n5 vers le bas. Ses bandes d’écarts tiennent encore l’espacement : un écart du mélange qui en sort est ramené au bord. La somme puis l’étendue rapprochent ensuite la grille de leurs cibles, pas à pas, sur le rang que chaque pas éloigne le moins de son centre (au carré, à l’échelle de sa bande) : la correction se répartit au lieu de pousser n5 puis n4. La boule affichée est le voisin retenu. nextData et l’entraînement montrent ce chemin.

**Chronos** (Chronos-2, `autogluon/chronos-2-small`, téléchargé par `./launch install-nextdata`) prévoit ensemble la somme, la somme des étoiles et n1, avec leurs bandes 10–90, sans être entraîné sur l’archive : il lit les tirages d’avant et les covariables cochées, les horloges connues pour le tirage prévu, le reste jusqu’au tirage d’avant. Sur un cœur, un pas de trois ans avec toutes les familles prend 0,8 s ; `amazon/chronos-2` en prendrait 3,1. Ces bandes se mélangent à celles de LightGBM ; n1 rejoint son niveau, qui fait le centre du rang. Chaque série a son poids, réglé sur les erreurs moyennes des dix tirages d’avant, jamais sur le tirage noté ; moitié-moitié tant qu’ils ne sont pas calculés. CatBoost reste seul. Si Chronos ne répond pas, la page dit pourquoi ; l’échec n’entre pas dans le cache, et Chronos est retenté au prochain démarrage de l’API. **Darts**, s’il est installé, remplace la médiane temporelle LightGBM du prochain pas, avec les mêmes arbres ; la chaîne des rangs reste LightGBM. À côté de torch, Darts demande pytorch-lightning (`./launch install-nextdata` l’installe, `./launch doctor` le vérifie) ; s’il échoue, la page dit pourquoi, LightGBM garde sa médiane, et Darts est retenté au prochain démarrage de l’API. **DeltaEvol** change les courbes (écart au tirage d’avant) sans relancer le modèle.

**Persist** (±1, ±2 ou ±3 ; 1 ou 2 numéros) reprend l’observation du bloc Persist d’Évolution sans toucher au modèle. Une fois la grille choisie, un numéro prévu à ±r d’une boule de n−1 ou n−2 cède sa place à cette boule, jusqu’à ce que la grille en tienne 1 ou 2 ; celles qu’elle a déjà comptent. Les échanges vont du plus proche au plus loin, n−1 avant n−2 à égalité. Même règle pour une étoile, une seule. La grille Persist s’affiche sous celle du modèle, boules reprises en pointillés, et part vers Jeux par son propre bouton. Le retour note chaque grille avec et sans Persist, sur le même tirage et sans rien réajuster, les pas restant ceux du cache : échanges gagnés (la boule reprise sort, pas celle qu’elle remplace), perdus ou neutres, test exact des signes, marge du hasard, et l’erreur que les échanges ajoutent à la somme, à n1…n5, e1, e2, à l’étendue et aux consécutifs. La table **Persist sur l’archive** range chaque boule selon sa distance à n−1 ∪ n−2, sur tous les tirages reçus : si une boule reprise ne sort pas plus souvent que sa voisine, l’échange ne rapporte rien en moyenne, il déplace seulement la grille. Le hasard donne 10 % à chaque numéro et 2/12 à chaque étoile, à toute distance. Ce n’est pas la Persistance du retour, qui rejoue tout le tirage d’avant.

Trois onglets : **Pronostic** (les deux grilles, cinq voisines, courbes du focus, poids des variables), **Base** (effectifs recomptés des numéros, étoiles, couples et triples du focus), **Retour** (walk-forward : MAE, RMSE, numéros et étoiles communs, contre la persistance et la moyenne ; bandes 10–90 brutes et calibrées). Ce n’est pas une probabilité de gain FDJ.

**Marges à 95 %** (`synchro/nextdata/uncertainty.py`). Une MAE de somme varie d’environ ±6 points sur dix décalages, ±2,6 sur cinquante tirages, au seul gré des tirages. Chaque MAE porte donc son intervalle de Student (`mae_sum_ci`). Deux lectures se comparent **par paires** (`versus`) : elles sont notées sur les mêmes tirages, et l’écart |erreur de la lecture| − |erreur du repère| se mesure tirage par tirage, avec l’intervalle de Student de sa moyenne à n − 1 degrés de liberté. C’est le test de Diebold et Mariano à un pas, avec la correction de Harvey, Leybourne et Newbold. Apparier retire le bruit commun au tirage, car une somme sortie très haute trompe toutes les lectures à la fois. Verdict : erreur plus basse si tout l’intervalle est sous zéro, plus haute s’il est au-dessus, **non tranché** sinon. Le Retour compare chaque lecture à la moyenne, une jumelle Persist à sa lecture, et la plus basse erreur à la deuxième. Les communs se lisent contre la loi exacte du hasard (`hits_chance`) : hypergéométrique (50, 5, 5) pour les numéros et (12, 2, 2) pour les étoiles, convolée sur les tirages notés. Elle donne la plage à 95 % de la moyenne d’une grille au hasard (de 0,1 à 0,9 numéro sur dix tirages) et la probabilité qu’une telle grille fasse au moins aussi bien. Les couvertures de bande ont leur intervalle de Wilson : 8 tirages sur 10 dans la bande, c’est de 49 à 94 %.

Le pronostic, le **retour** et nextDataTraining lisent les mêmes **pas**, au même réglage : un pas est l’ensemble des modèles ajustés sur les seuls tirages d’avant un tirage — 32 arbres (`SYNCHRO_NEXTDATA_ESTIMATORS`), quantiles 10, 50 et 90 (CatBoost les ajuste en un modèle, MultiQuantile), LightGBM et CatBoost sur les deux modes, Darts et Chronos compris, puis le même faisceau de grilles voisines à ±3. Il n’y a pas de version allégée pour le retour. Un pas ne dépend que des tirages qui le précèdent : il se calcule une fois, se range dans `.nextdata/steps/` (hors dépôt), puis se relit. Sa clé change avec ces tirages (dates, boules, urne d’étoiles), le réglage, le code qui calcule le morceau (`synchro/nextdata/models.py` et les fichiers qui font les lignes) et les versions de ses bibliothèques ; retoucher l’assemblage, le retour ou l’écran ne recalcule aucun pas. Les ajustements partent dans des processus à part, un seul fil chacun (`SYNCHRO_NEXTDATA_WORKERS`, par défaut le nombre de cœurs moins un, plafonné à 4 ; à 1, tout reste dans l’API), CatBoost d’abord, le plus long. Si un processus meurt, le pool repart, deux fois au plus ; ensuite le calcul reste dans l’API, et la barre d’avancement le dit. Chaque appel calcule une tranche de pas, le prochain tirage d’abord ; la page relance jusqu’à la fin et affiche l’avancement. Le premier calcul est long : sur trois ans de tirages, un pas coûte de l’ordre de 27 s de calcul sur un cœur (LightGBM 5 s, CatBoost 21 s, Darts 0,6 s ; `scripts/nextdata_bench.py` le mesure), divisées par le nombre de processus. Après un nouveau tirage, seul ce tirage est à calculer.

Les **bandes 10–90** sont **calibrées** par la méthode dite conforme. Apprises sur peu de tirages, elles se croient plus sûres qu’elles ne sont (six tirages sur dix dedans au lieu de huit). Sur les tirages du retour qui précèdent, on relève de combien chaque bord a manqué le tirage sorti ; le bord est déplacé du manque de rang ⌈0,9 (m + 1)⌉ parmi les m tirages. Il en faut neuf. La colonne Brute du Retour mesure la bande du modèle, Calibrée la bande corrigée sur les seuls tirages d’avant, hors échantillon. Le calibrage change les bandes, les anneaux et les courbes, pas la grille. Sans les libs :

```bash
./launch install-nextdata
```

`GET /api/nextdata/status`, `POST /api/nextdata/forecast`. Persist se demande par `"persist": {"radius": 1, "limit": 1}` (rayon 1 à 3, 1 ou 2 numéros) ; `null` l’éteint.

## nextDataTraining (`/nextdatatraining`)

Le même réglage que nextData, mesuré sur les dix tirages d’avant : les dix décalages sont les dix derniers pas du retour, relus du même cache. **−1** cache le dernier tirage et le prévoit. **−10** se place dix tirages plus tôt. L’écart affiché est prévu moins sorti : au-dessus de zéro, la lecture était trop haute. La persistance rejoue le tirage d’avant la coupure, la moyenne prévoit la somme moyenne d’avant. Chronos et DeltaEvol sont les mêmes interrupteurs. La barre compte les pas calculés : les dix décalages d’abord, puis les tirages d’avant qui calibrent leurs bandes ; ce n’est pas une estimation du temps restant. Le tableau des rangs compte, rang par rang, les tirages dans la bande brute et dans la bande calibrée sur les tirages du focus qui précèdent chaque décalage, chaque compte avec son intervalle de Wilson. Les cartes donnent la MAE de somme avec son IC 95 % et deux verdicts appariés, contre la moyenne et contre la persistance : sur dix décalages, ils restent le plus souvent non tranchés. Sous Moyenne, Prévu et sorti donne la plage du hasard pour les communs. La figure du calcul suit le dernier décalage reçu ; un clic sur l’en-tête d’une colonne la fixe, un second clic la laisse de nouveau suivre. **Persist** est le même interrupteur que nextData : chaque lecture reçoit une jumelle `<lecture>_persist`, notée sur le même tirage avec les mêmes bandes. La carte Avec et sans Persist cumule les décalages reçus, la courbe de somme ajoute la jumelle en pointillé, et Prévu et sorti une troisième ligne. Dix décalages donnent peu d’échanges : la table de l’archive est la mesure qui compte. `POST /api/nextdata/training`. Ce n’est pas un ticket, ni une prévision à dix coups d’avance.

**Méga** compare le réglage affiché à ses voisins : les autres focus (20, 50 ou 100 ; à 20, les dix décalages restent calibrés), les autres profondeurs d’années, et chaque covariable retirée une à une. Sans Chronos, douze blocs s’ajoutent pour les familles cochées : la date ou les cycles, le profil ou les retards, l’ancienneté, les parts ou les affinités des couples et des triples, les numéros ou les étoiles de Pulse. Chronos inclus ne les ajoute pas. Niveaux et DeltaEvol ne font pas de ligne. Le jour et le nombre d’arbres restent ceux des boutons, pour que la ligne retenue se rejoue telle quelle. Un clic sur un bloc pose un jeton, lu par Entraîner et par Pronostiquer ; l’éteindre, ou éteindre la famille, retire ces colonnes. Un pas sans exclusion garde sa clé de cache. Les lignes sont notées sur les dix mêmes décalages, relus du même cache. Une variante n’est retenue que si son erreur de somme, lecture Corpus, reste sous celle du réglage affiché sur tout l’intervalle de Student, après correction de Holm. Les focus, les années et les familles forment un groupe ; les blocs en forment un autre. Le bandeau nomme la retenue dont l’écart moyen est le plus négatif ; sinon le réglage affiché tient. La MAE seule reste visible : sur dix décalages elle ne départage pas. Les arbres partagent un pool gardé d’une tranche à l’autre, borné à 80 % des cœurs, et s’arrêtent de s’ajouter quand la charge de la machine ou la mémoire libre dépasse ce plafond ; sans /proc (macOS), la charge se lit sur la moyenne d’une minute. Les lignes qui gardent les mêmes années partagent un cadre. Chronos n’entre que s’il est déjà inclus ; il se calcule dans l’API, un pas à la fois, pendant que les arbres tournent. Il s’y mélange moitié-moitié, faute des dix tirages d’avant qui règlent ses poids : avec Chronos, la MAE du réglage affiché peut s’écarter de celle d’Entraîner. `POST /api/nextdata/sweep`.

## Jeux (`/jeux`)

Deux onglets.

**Solutions** — compteur combinatoire de l’univers EuroMillions (5 parmi 50 × 2 parmi 12 = 139 838 160). Les curseurs de somme, de parité pair/impair, d’étendue, de consécutifs, de décennies (1–10 … 41–50) et de chance 0–100 % par boule réduisent l’espace ; le bandeau affiche en permanence le nombre exact de grilles restantes. 0 % exclut une boule ; un seuil de présence fait entrer les pourcentages intermédiaires dans le décompte entier ; un clic impose une boule. Sous 50 solutions la liste s’affiche, sinon un échantillon uniforme. Les propositions de Combinaisons (session, jusqu’à 20) sont filtrées : combien survivent ici. Ce n’est pas un pronostic : le tirage officiel reste uniforme.

**histoJeux** — journal des grilles **réellement jouées**, stocké dans Neon (`plays`). Chaque ligne a une date de tirage (mardi/vendredi, défaut = prochain tirage encore ouvert avant 20h45 Paris). Après synchro FDJ, rang, correspondances et **rapport €** (× copies) se calculent. Stats descriptives (rangs, matches, total des gains FDJ, boules les plus jouées), **IC Wilson** et **test binomial exact** vs P(gain) officielle ≈ 7,71 % (une consignation = un essai ; les copies ne sont pas des essais de plus). Les consignations depuis Solutions emportent le **spec Jeux** (somme, décennies, forcés…) pour relire pourquoi la grille a été jouée, et **Rouvrir dans Jeux** recharge ces curseurs. Export CSV. Repli session si l’API ne répond pas. Distinct de Mes grilles, qui reste une bibliothèque de modèles.

## Brain (`/brain`)

Catalog nommé des indicateurs (`@rsi`, `@sum.rsi`, `@ete`, `@fft`, `@analogs`), journal persisté (Neon, repli local), mémoire vectorielle locale (`nomic-embed-text`) et **agent manuel** (catalog ou 142 courbes Chartisme). Le panneau **Objets** est exactement le prompt. Chat et lots passent par Ollama ; **Ce tour dans le cloud** / **Lots cloud** sont opt-in. **Approfondir** n’agit que sur le chat local (pas les lots). **Lire la table** décrit les fiches sans modèle. Une **démo guidée** (`/brain?demo=1` ou bouton « Lancer la démo ») épingle un handle par lab, lit la table, suit `@rsi`, balaye ces fiches et les consigne au carnet. Après chaque phase un pop-up explique ce que vous voyez : **Suivant** ou **Annuler**. L’onglet IA n’est pas fusionné : il reste la lecture de captures. Brain peut pronostiquer une grille (hypothèse, pas une certitude). Les concepts confirmés à la main sont sur **Dictionnaire**, pas dans ce chat.

**Spécialistes** (`/brain/specialistes`) — un petit réseau par série (parité, somme…), entraîné sur l’ère formule, noté sur les 20/50/100 derniers, enregistré dans `.brain/specialists/`. Le décompte d’archive suit le jour ; l’entraînement API reste borné au même `weekday` si Mardi ou Vendredi est choisi. Jamais une grille 5+2. Démo (`/brain/specialistes?demo=1`) : nom, cible, forme, indicateurs, score vs hasard ; elle n’entraîne pas toute seule. CLI : `python -m synchro specialist train|list|infer|delete`, ou `./launch brain-specialist-train`.

**decisionTree** (`/brain/decision-tree`, démo `?demo=1`) montre d’abord le tableau du flux (une ligne est l’état juste avant le tirage t), puis cherche un seuil en le faisant couper par un arbre — somme, rangs, retards, figures. L’indépendance n’est que le nul : l’ordre des tirages est détruit et le calcul est rejoué. Un seuil qui tient sur l’ordre réel et disparaît sur l’ordre détruit est un seuil de flux. S’il ne dépasse pas ce nul, aucun seuil n’est visible — ce n’est pas une conclusion d’indépendance. Le dessin (dtreeviz) montre chaque coupure ; sans Graphviz, l’arbre reste en texte. La suite mène vers un spécialiste, Jeux ou une règle chartiste, sans rien écrire en silence. Schémas dans [`docs/schemas/decision-tree`](docs/schemas/decision-tree/README.md). `./launch` installe scikit-learn et dtreeviz tout seul (`./launch install-decision-tree` répare). CLI : `python -m synchro decision-tree read|list|show|predict`.

`./launch doctor` ping Ollama (lecture seule, ne démarre pas le serveur) et prévient si seuls des 3B de chat sont tirés. `OLLAMA_HOST` (défaut `http://127.0.0.1:11434`), `OLLAMA_NUM_CTX` et `LOCAL_LLM_MODEL` sont dans `.env.example`. Pull manuel : `ollama pull qwen2.5:7b` et `ollama pull qwen2.5vl:7b`. Un clic glyphe Morpho et une passe IA vision partagent `keep_alive` 30m ; deux 7B se swapent si la VRAM ne tient pas les deux. `IA_VISION_UNLOAD=1` décharge le VLM (`keep_alive` 0) dès la fin de la passe visuelle, avant le modèle texte. Entraînement d’un spécialiste : `./launch brain-specialist-train` (ou le panneau Spécialistes de `/brain` / `/brain/specialistes`).

## Dictionnaire (`/brain/dictionnaire`)

Fiches de concepts : vignette, équation, mots-clés, portée. Neuf fiches sont semées depuis le code : **monte**, **baisse**, **stable**, chacune avec un registre **05**, **1** ou **sup** (nuage serré, habituel, large). La lecture 20/50/100 porte sur six champs — somme, parité, étoiles, étendue, n1, n5 — et nomme le sens, la relecture et les quarts Réf. Une fiche se confirme à la main ; un brouillon du modèle local ne s’écrit pas tout seul. L’interrupteur automatique pose une demande à chaque tirage nouveau. L’aide locale peut escalader vers le cloud, et le cloud n’écrit une note que si `escalate` et `cloud_note` sont posés. Démo guidée (`/brain/dictionnaire?demo=1`) : la boucle tourne sur une courbe fixe, rien n’est enregistré.

`GET|POST /api/brain/lexicon/cards`, `POST /api/brain/lexicon/read`, `GET|POST /api/brain/lexicon/mode`, `POST /api/brain/lexicon/help`.

## Réf (`/ref`)

Cycles physiques datés, puis un plan. Une phase ou un numéro de rotation décrit le ciel à une date. Ça ne dit rien du prochain tirage.

| Onglet | Lecture |
|---|---|
| Lunaire | Mois synodique (~29,53 j) : âge, éclairement, quartiers, calendrier du mois. |
| Solaire | Rotation de Carrington (~27,3 j), cycle de Schwabe (~11 ans), solstices. Catalogue GOES XRS ou éruptions HEK via SunPy. Le TimeSeries n’est pas téléchargé. |
| Autres | Année tropique et Chandler en phase locale. F10.7, Kp, rayons cosmiques, ENSO et QBO restent des séries mesurées, sans horloge inventée. |
| Synthèse | Deux phases en axes. Couleur : total des numéros, total des étoiles, n1–n5, E1 ou E2. Fenêtres 20, 50, 100. |

Le nuage phase × tirage marque un solstice ou un équinoxe par un trait vertical, et un jackpot gagné (rang 1) par un losange. `GET /api/ref/catalog|phases|trace|plane|lunar|solar` et `GET /api/ref/solar/goes`.

## IA (`/ia`)

Lecture d’une capture (visuel + données de fenêtre). L’onglet propose **Gemini** et **OpenAI**, puis un **choix de modèle** : un catalogue recommandé pour la lecture d’écran, plus les modèles de chat visibles sur tes clés. La réponse **s’écrit en flux**. **Comparer** envoie le même pack à deux modèles (Flash contre Pro, ou Gemini contre OpenAI) — utile en Chartisme / Harmo. Le modèle réellement utilisé s’affiche sous la réponse ; un aperçu introuvable replie vers le catalogue, sauf si des jetons ont déjà commencé.

L’historique (colonne **Captures**) se **renomme**, s’**épingle**, s’**exporte** (Markdown, JSON, PDF du fil) et se **supprime**. Un JSON réimporte les lectures. Les épinglées ne tombent pas des huit derniers fils. Les clés sont dans Admin. L’assistant décrit l’archive, puis peut pronostiquer (hypothèse, pas une certitude).

Un troisième fournisseur **Local** (Ollama / llama-server) sert les lectures **texte** du pack. Avec une capture, Synchro fait **deux passes** : `qwen2.5vl:7b` lit le visuel (sans le JSON technique), puis `qwen2.5:7b` (ou `LOCAL_LLM_MODEL`) raisonne sur le pack + ces notes. `IA_LOCAL_TWO_PASS=0` envoie image et pack au VLM en une fois. Un 404 Ollama **ne bascule pas** sur Gemini / OpenAI. Si le probe touche vraiment Ollama (`/api/tags` ou `/api/version`), le chat utilise `/api/chat` avec `num_ctx` (défaut 16384, `OLLAMA_NUM_CTX`). LM Studio et llama-server restent sur `/v1/chat/completions`. Case **Approfondir** : température 0.7, plus long, `think` seulement sur qwen3 / deepseek-r1 / gpt-oss / r1. Moondream reste pour Morpho, pas pour le chat IA.

## Admin (`/admin`)

Page locale pour les consoles et les secrets (Neon, Google, OpenAI, Brave Search). Les valeurs sont lues/écrites dans `.env` — **jamais commitées**. Révélation / copie, test de connexion, **suivi LLM** (Ollama / Llama, Brain, IA, Morpho VLM, embeddings : santé live, ping generate d’un jeton, appels et jetons 24 h), mise à jour GitHub (`git fetch` / `git pull --ff-only`, équivalent `./launch update`), synchro FDJ.

La carte **Bibliothèques** suit npm, pip et GitHub Actions. **Relire** interroge les registres (`GET /api/admin/dependencies?refresh=1`).

La carte **Failles** inventorie le dépôt avec Syft (lockfile npm, et le `.venv` s’il est là) puis affiche les correspondances Grype : barre de sévérité, filtres, paquets dépliables. Le bouton Scanner lance le relevé en local si `syft` et `grype` sont installés (`GET /api/admin/supply-chain?refresh=1`) ; le lundi, la même lecture part en action GitHub et met à jour l’issue « Failles connues ». **Exporter** écrit ce relevé complet en Markdown, ou ouvre l’impression pour un PDF : un brief à coller à une IA, qui ne retient comme cibles que les correctifs déjà publiés.

En local sur `127.0.0.1`, l’accès est ouvert. Si l’UI est exposée, définissez `ADMIN_PASSWORD`. Sur Netlify, les secrets se configurent dans les variables d’environnement du site.

## Journal (`/journal`)

Suivi des modifications du logiciel, distinct du journal des mises (Jeux). Une fiche par zone résume les PR mergées ; la timeline place chaque PR sur la date de merge et la ligne de sa zone. La recherche et le filtre de zone agissent ensemble sur la liste et les points. Le texte se réécrit dans la page (Neon). Au prochain `./launch`, les fichiers `docs/journal` sont importés sans écraser une fiche déjà présente. L’accès suit Admin : ouvert en local, `ADMIN_PASSWORD` dès que le site est exposé. Si une PR n’a pas de brouillon, [l’action Journal](.github/workflows/journal.yml) dépose la fiche sur la branche et la commente une fois, y compris quand la PR est encore en draft. Le déclencheur Cursor « Pull request opened » ne part pas sur un draft.

## Schémas (`/schemas`)

Lecteur des schémas Mermaid versionnés dans [`docs/schemas`](docs/schemas/README.md). Texte éclairci, recherche dans les libellés, liens en toutes lettres, zoom, plein écran, export PNG du cadre. Un fichier = un schéma (contexte, conteneurs, composants, flux). Modules versionnés : [Pronostic](docs/schemas/pronostic/README.md), [decisionTree](docs/schemas/decision-tree/README.md).

## Interface web (Next.js)

App Next.js (Next 16, React 19). Le menu burger (raccourci **g**) reprend les cinq groupes du bandeau, listés plus haut. Le nom de la page courante reste à côté de Synchro. Le lanceur l’ouvre sur [http://127.0.0.1:43147](http://127.0.0.1:43147). Sans lanceur :

```bash
npm install
npm run dev
```

Build : `npm run build && npm start`. Le déploiement **Netlify** utilise cette app (`@netlify/plugin-nextjs`).

Types de runArcade, comme la CI les vérifie : `npx tsc --noEmit -p tsconfig.run-arcade.json`.

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
| `python -m synchro init-db` | Crée les tables Neon (`draws`, `grids`, `plays`, `sync_log`, règles Morpho et Chartisme, carnet Brain, dictionnaire) |
| `python -m synchro ensure` | Rattrape l’archive FDJ récente si Neon est en retard |
| `python -m synchro sync` | Télécharge les 6 archives FDJ et les écrit dans Neon |
| `python -m synchro serve` | API locale `/api/*` |
| `python -m synchro export` | Snapshot JSON (`synchro/web/snapshot.json`) |
| `python -m synchro chartisme export\|scan\|train\|report\|auto` | Module chartisme sans interface (usage cron) |
| `python -m synchro specialist train\|list\|infer\|delete` | Spécialistes Brain, un réseau par série |
| `python -m synchro decision-tree read\|list\|show\|predict` | Seuils du flux, preuve par remaniement, dessin |
| `make test` | Tests unitaires (`pytest` : parse FDJ, rangs, stats, API, chartisme, harmo, cycles, nextData, Réf, pronostic) |

`DATABASE_URL` ne doit **jamais** être commitée. `.env` en local, variables d’environnement / secret GitHub Actions en déployé. Au premier `./launch`, le fichier `.env` est créé depuis `.env.example` s’il manque.

Chaque ligne de `draws` contient la date, le jour, 5 numéros et 2 étoiles, `star_pool` (9 / 11 / **12 depuis le 27/09/2016**), les gagnants rang 1 FR/EU, **`winners_total_fr` / `winners_total_eu`** (somme des 13 rangs ; EU FDJ = tous pays, France comprise), le code My Million s’il est dans l’archive, et **`prizes`** : l’échelle des rapports FDJ (rangs 1–13, gagnants FR/EU, `winners_total` du rang, montant en €). Un jackpot à 0 € sans gagnant est un report. Étoile+ n’est pas importé.

Un workflow GitHub `sync-fdj` peut tourner le mardi et le vendredi à 21h45 (heure de Paris) si le secret `DATABASE_URL` est défini.

### API locale

- `GET /api/alive` — liveness (pas de Neon)
- `GET /api/health` — ping Neon, tirages, dernier sync, `stale` / `expected_draw_date`
- `POST /api/shutdown` — arrêt propre (localhost uniquement)
- `GET /api/draws?limit=&offset=&q=&year=&era=current|all&weekday=mardi|vendredi`
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
- `POST /api/chartisme/detect|similar` — lecture d’une fenêtre (`reference_sigma`, `reference_slope_sigma`) et recherche DTW dans le jour affiché (`weekday`)
- `GET\|POST /api/chartisme/labels|rules` · `DELETE …/{id}` — atelier d’étiquetage et espace de règles (Neon)
- `POST /api/chartisme/rules/evaluate` · `GET /api/chartisme/firings` — déclenchements et journal
- `GET /api/chartisme/backtest` — objectif atteint, signal sur les numéros, taux de base (`base_length` = longueur des fenêtres de bruit). Bornable à une fenêtre : `start`, `end`, `context` (tirages calculés en amont), `scales` (« 25,50,100 »), `thresholds` (un seuil par échelle, « 0.79,0.74,0.71 », apparié positionnellement et ignoré en entier si la longueur ne correspond pas). La réponse porte un bloc `window` qui dit sur quoi la mesure a réellement porté.
- `GET /api/harmo/status` — scipy / extras (sans Neon)
- `GET /api/harmo/spectrum|welch|stft|envelope|orders|unmix|null` — même fenêtre qu’Analyse (`variable`, `n`, `era`, `preset`, `from_date`, `to_date`, `last_n`, `warmup`). Sans Neon : repli sur l’archive JSON 2026.
- `GET /api/cycles/status` — torch optionnel ; le registre répond sans lui
- `GET /api/cycles/registry|panel` — canaux et panneau (`variable`, `n`, `preset`, `weekday`)
- `POST /api/cycles/fit` — walk-forward TFT, VSN, attention, ablation. Pas une grille
- `GET /api/nextdata/status` — LightGBM, CatBoost, Darts, Chronos, torch, et le dernier échec de Chronos
- `POST /api/nextdata/forecast` — deux entraînements et le faisceau 5+2 (`focus=20|50|100`), retour au même réglage ; chaque appel calcule une tranche de pas (`progress.ready`, `progress.total`, `progress.complete`)
- `POST /api/nextdata/training` — décalages −1 à −10, écart prévu moins sorti, bandes brutes et calibrées ; par tranches comme le pronostic, ou un seul décalage avec `shift`
- `POST /api/pronostic/committee` — onze têtes et un global (`lookback=20|50`)
- `GET|POST /api/brain/lexicon/cards` · `POST /api/brain/lexicon/read` · `GET|POST /api/brain/lexicon/mode` · `POST /api/brain/lexicon/help` — Dictionnaire
- `GET /api/brain/status` · `GET|POST /api/brain/readings` · `POST /api/brain/readings/{id}/notes` · `POST /api/brain/retrieve` · `POST /api/brain/analogs`
- `GET /api/brain/specialists/features` · `GET|POST /api/brain/specialists` · `GET|DELETE /api/brain/specialists/{slug}` · `POST …/infer`
- `GET /api/brain/decision-tree/status|catalog` · `POST /api/brain/decision-tree/tableau` · `GET|POST /api/brain/decision-tree` · `GET|DELETE /api/brain/decision-tree/jobs/{id}` · `GET /api/brain/decision-tree/{slug}` · `POST …/predict` · `POST …/draft` · SVG `…/tree.svg` et `…/case.svg`
- `GET /api/ref/catalog|phases|trace|plane|lunar|solar` · `GET /api/ref/solar/goes` — cycles physiques (`date`, `window=20|50|100`, `cycle`, `x`, `y`)
- `GET /api/ia/status` — fournisseurs Gemini / OpenAI / local ; `GET /api/ia/local` — modèles Ollama ; `POST /api/ia/chat` — lecture d’une capture (SSE)
- `GET|POST /api/llm/usage` · `POST /api/llm/ping`
- `GET /api/startup` — contrôles du bandeau (API, Neon, GitHub, LLM ; `refresh=1`)
- `GET|POST /api/github` — état du dépôt ; POST pour fetch / mise à jour
- `GET|POST /api/journal` · `PATCH /api/journal/{id}` — journal des modifications (texte, masquage)
- `GET|POST /api/admin` · `POST /api/admin/login` · `POST /api/admin/sync` · `POST /api/admin/test`
- `GET /api/admin/dependencies` — npm, pip, GitHub Actions (`refresh=1` relit les registres)
- `GET /api/admin/supply-chain` — Syft + Grype (`refresh=1` lance le scan local)

L’UI appelle `src/app/api`. Analyse, Harmo, Cycles, Morpho, Chartisme, nextData, Réf, Brain, grilles et tirages sont proxifiés vers FastAPI dès que l’API locale répond. Santé du bandeau (`/api/startup`), GitHub, Admin et IA sont des routes Next.js. Sur Netlify, les secrets viennent des variables d’environnement du site ; les modules Python restent le process local.

Application indépendante, non affiliée à La Française des Jeux.
