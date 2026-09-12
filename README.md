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
| `./launch status` | Qui écoute, `/api/alive`, santé Neon |
| `./launch update` / `make update` | Contrôle GitHub (`git fetch`) et tire `origin` en fast-forward |
| `./launch doctor` | Python, venv, Node, `.env`, ports, VLM |
| `./launch install` | Dépendances seulement |
| `./launch install-vlm` | Moondream local (torch + transformers + accelerate) |
| `./launch shortcut` | Raccourci Bureau / menu applications (Linux) ou `~/Desktop/Synchro.command` (macOS) |
| `make test` | Tests (`pytest`) |

Sur macOS, un double-clic sur `Synchro.command` à la racine du dépôt lance aussi le projet.

Options : `--skip-install`, `--force-install`, `--no-open`. Ports : `SYNCHRO_BACKEND_PORT` (8000), `SYNCHRO_FRONTEND_PORT` (43147). Logs : `.run/`.

Dans l’UI, le bandeau **API / Neon / GitHub** (en haut de chaque page) refait les mêmes contrôles au chargement, au focus, et périodiquement. La pastille Neon affiche la **date de dernière synchro** (`MAJ …`). Ton ambre = tirages en retard : un clic en local lance le rattrapage. GitHub en retard ouvre **Admin**. Le bouton **Quitter** (localhost uniquement) arrête l’API et l’interface. Les sections **Tirage**, **Évolution**, **Analyse**, **Combinaisons**, **Morpho**, **Chartisme** et **Admin** sont des onglets du bandeau.

## Tirage (`/tirage`)

Archives EuroMillions : tableau filtrable et export CSV. En local, les données viennent de **Neon** (année du dernier tirage) dès que l’API répond ; sinon repli sur `src/data/euromillions-2026.json`. L’accueil `/` redirige vers cet onglet.

## Évolution (`/evolution`)

Onglet admin : **évolution dans le temps**, **suivi pair/impair** (pair = +1, impair = −1, cumul numéros et étoiles), **20 / 50 derniers tirages**, **numéros et étoiles les plus sortis / en retard**, grille 1–50. Même accès que **Admin** (`ADMIN_PASSWORD`, ou ouvert en local sur `127.0.0.1`). Fenêtres : 20 tirages, 50 tirages, année en cours, formule actuelle, tout l’historique ; filtre mois sur les plages calendaires.

## Analyse (`/analyse`)

Laboratoire borné par une **fenêtre de travail** (presets : 20/50/100/200 tirages, 3/6/12 mois, année civile, formule actuelle, tout, ou dates Du/Au). Tous les onglets — y compris χ², Bayes et Monte-Carlo — lisent ce même jeu. Un **warmup** (52 tirages avant la fenêtre par défaut) alimente EMA / RSI / Ichimoku sans entrer dans les agrégats. `X` reste la période des indicateurs, distincte de la plage calendaire.

Onglets technique : Vue (série, OHLC / Heikin-Ashi / Renko, profil temporel, comparaison A/B), Tendance, Momentum, Volatilité, Niveaux, Figures, Flux (activité-proxy, pas un volume de marché), Moyennes, Système. Onglets tirage : Numéros (grille 1–50), Pair / impair, Hasard, Bayésien, Dépendance, Probabilités (combinatoire, indépendante de la fenêtre), Mémo.

Les tirages sont indépendants : ces outils décrivent l’archive, ils ne prédisent pas le prochain. Monte-Carlo via l’API Python quand elle est joignable (`from_date` / `to_date` de la fenêtre).

## Combinaisons (`/combinaisons`)

Composeur EuroMillions 5+2 : chaque boule affiche **total de sorties** et **retard** dans la même fenêtre de travail qu’Analyse. Cinq stratégies proposent des grilles (équilibré, retards, totaux élevés / faibles, aléatoire). Le score affiché est une **proba de gain** : loi officielle des 13 rangs (identique pour toute grille 5+2) et **P̂ empirique** (part des tirages de la fenêtre où la grille aurait été payée, avec IC Wilson). Les grilles se sauvegardent via `/api/grids` (Neon) ou, à défaut, en session.

## Morpho (`/morpho`)

Laboratoire visuel : chaque tirage est un glyphe sur la grille 5×10 + étoiles. Détecteurs géométriques (alignements, grappe, miroir, …), kNN visuel, règles QUAND/ALORS, anticipation `P(forme suivante | contexte)` vs tirages uniformes. Moondream local (optionnel) :

```bash
./launch install-vlm
# équivalent : .venv/bin/pip install -r requirements-morpho.txt
```

Puis bouton **Charger / interroger** dans Morpho (poids HF en cache, pas dans le git). Si les extras ne sont pas là, le bouton les installe tout seul (torch + transformers 4.x + accelerate, ~2 Go, une fois). `transformers` est épinglé `<5` : la 5.x casse le chargement de `HfMoondream` (`all_tied_weights_keys`). CLIP navigateur : `@huggingface/transformers`, chargé au clic **Œil local CLIP**.

## Chartisme (`/chartisme`)

Les **17 figures chartistes** de la table de référence (tête & épaules et son inverse, doubles / triples sommets et creux, biseaux, triangles, rectangle, drapeau / fanion, tasse avec anse, diamant, broadening top) cherchées sur les courbes du logiciel : somme, écart, pairs, retard et sorties de chaque boule, retard et sorties de chaque étoile — 131 courbes exportées de l’archive.

La **règle d’or** est appliquée telle quelle : une cassure n’est retenue que si l’activité dépasse sa moyenne mobile 20 **et** que la cassure est confirmée en clôture (ou par le pull-back suivant). Le « et » n’est pas négociable — c’est lui qui distingue la cassure du *fake breakout*. L’objectif projeté suit la colonne « Objectif projeté » de la table, figure par figure.

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

**Atelier d’étiquetage** : sélection au pinceau sur la courbe, catalogue des 17 figures ou classe libre, placement des rôles de pivots (tête, épaules, ligne de cou…), bloc-croquis pour dessiner une forme et retrouver les fenêtres qui lui ressemblent, et une liste des fenêtres les plus incertaines à trancher en priorité. Tes étiquettes pèsent trois fois plus que le synthétique et partent d’abord en **validation** : un score mesuré sur les étiquettes faibles ne dirait que l’accord avec le détecteur.

**Espace de règles**, délibérément descriptif : QUAND figure ∧ courbe ∧ confiance ∧ cassure ∧ tendance, ALORS `tag` / `alert` / `note` / `hypothesize` / `watch`. Les cinq actions sont des écritures dans le journal — aucune ne touche aux grilles, et il n’y a pas de branchement vers `/combinaisons`. Le rétro-test dit ensuite ce qui valait quelque chose.

**Rétro-test**, deux questions et un garde-fou :

- *l’objectif a-t-il été atteint ?* comparé à un modèle nul qui applique la même mesure à des points tirés au hasard sur la même courbe (même distance, même niveau d’invalidation, même horizon), avec intervalles de Wilson ;
- *y a-t-il un signal sur les numéros ?* les boules sorties après chaque déclenchement contre l’uniforme, chaque tirage postérieur compté une seule fois, avec correction de Benjamini-Hochberg — cinquante tests simultanés produisent deux ou trois « découvertes » par pur hasard ;
- le **taux de base** : combien de marches aléatoires de même longueur portent la même figure. Mesure inconfortable et nécessaire — une figure fréquente sur du bruit n’apprend rien quand on la voit sur une vraie courbe.

**Export automatique** : `run_ensure()` accroche un cycle complet dès qu’un tirage entre en base (réexport des courbes → balayage → règles → journal → état dans `.chartisme/state.json`). Le cycle est non fatal et silencieux : un balayage qui casse n’empêche jamais une synchro FDJ d’aboutir. Désactivable par `SYNCHRO_CHARTISME_AUTO_EXPORT=0`.

Les tirages sont indépendants. Une figure sur une courbe de retards ou de sorties est une propriété du tracé, pas une prédiction. Cet onglet décrit, et le rétro-test mesure l’écart entre la figure et le hasard ; il ne le comble pas.

## Admin (`/admin`)

Page locale pour les consoles et les secrets (Neon, Google, OpenAI, Brave Search). Les valeurs sont lues/écrites dans `.env` — **jamais commitées**. Révélation / copie, test de connexion, mise à jour GitHub (`git fetch` / `git pull --ff-only`, équivalent `./launch update`), synchro FDJ.

En local sur `127.0.0.1`, l’accès est ouvert. Si l’UI est exposée, définissez `ADMIN_PASSWORD`. Sur Netlify, les secrets se configurent dans les variables d’environnement du site.

## Interface web (Next.js)

App Next.js (onglets **Tirage** `/tirage`, **Évolution** `/evolution`, **Analyse** `/analyse`, **Combinaisons** `/combinaisons`, **Morpho** `/morpho`, **Chartisme** `/chartisme` et **Admin** `/admin`). Le lanceur l’ouvre sur [http://127.0.0.1:43147](http://127.0.0.1:43147). Sans lanceur :

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
| `make test` | Tests unitaires (parse FDJ, rangs, stats, `/api/alive`, ensure, chartisme) |

`DATABASE_URL` ne doit **jamais** être commitée. `.env` en local, variables d’environnement / secret GitHub Actions en déployé. Au premier `./launch`, le fichier `.env` est créé depuis `.env.example` s’il manque.

Chaque ligne de `draws` contient la date, le jour, 5 numéros et 2 étoiles, `star_pool` (9 / 11 / **12 depuis le 27/09/2016**), les gagnants rang 1 FR/EU, et le code My Million s’il est dans l’archive.

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
- `GET\|POST /api/grids` · `DELETE /api/grids/{id}`
- `POST /api/reload-env` — relit `.env` et recrée le pool Neon
- `POST /api/sync` — historique complet (bouton Admin)
- `POST /api/sync/ensure` — rattrapage si Neon est en retard (`./launch`)
- `GET\|POST /api/morpho/*` — glyphes, voisins, règles, anticipation, VLM
- `GET /api/chartisme/catalog|status|curves|figures|svg|training` — table de référence, état du module, courbes exportées, figures d’une courbe, annotation SVG, rapport d’entraînement
- `POST /api/chartisme/detect|similar` — lecture d’une fenêtre envoyée par le navigateur, recherche par ressemblance DTW
- `GET\|POST /api/chartisme/labels|rules` · `DELETE …/{id}` — atelier d’étiquetage et espace de règles (Neon)
- `POST /api/chartisme/rules/evaluate` · `GET /api/chartisme/firings` — déclenchements et journal
- `GET /api/chartisme/backtest` — objectif atteint, signal sur les numéros, taux de base

Application indépendante, non affiliée à La Française des Jeux.
