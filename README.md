# Synchro — tirages EuroMillions

Deux couches sur les mêmes tirages : **Next.js** (consultation + laboratoire d’analyse) et **Python / Neon** (historique FDJ complet). Les résultats officiels restent ceux de la [FDJ](https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique). Au premier lancement, un consentement (majeur, pas un outil de prédiction) est demandé.

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
| `./launch doctor` | Python, venv, Node, `.env`, ports |
| `./launch install` | Dépendances seulement |
| `./launch shortcut` | Raccourci Bureau / menu applications (Linux) ou `~/Desktop/Synchro.command` (macOS) |
| `make test` | Tests (`pytest`) |

Sur macOS, un double-clic sur `Synchro.command` à la racine du dépôt lance aussi le projet.

Options : `--skip-install`, `--force-install`, `--no-open`. Ports : `SYNCHRO_BACKEND_PORT` (8000), `SYNCHRO_FRONTEND_PORT` (43147). Logs : `.run/`.

Dans l’UI, le bandeau **API / Neon / GitHub** (en haut de chaque page) refait les mêmes contrôles au chargement, au focus, et périodiquement. La pastille Neon affiche la **date de dernière synchro** (`MAJ …`). Ton ambre = tirages en retard : un clic en local lance le rattrapage. GitHub en retard ouvre **Admin**. Le bouton **Quitter** (localhost uniquement) arrête l’API et l’interface. Les sections **Tirage**, **Analyse** et **Admin** sont des onglets du bandeau.

## Tirage (`/tirage`)

Archives EuroMillions : tableau filtrable, graphique, fréquences, export CSV. En local, les données viennent de **Neon** (année du dernier tirage) dès que l’API répond ; sinon repli sur `src/data/euromillions-2026.json`. L’accueil `/` redirige vers cet onglet.

## Analyse (`/analyse`)

Laboratoire : variables (somme, étendue, parité, retard, …), fenêtre de X tirages, chandeliers OHLC / Heikin-Ashi, probabilités exactes des 13 rangs, tests vs hasard (χ², IC Wilson), Beta-Binomial, paires / lift, backtest des numéros « chauds ». Tous les outils lisent le **même** ensemble de tirages (Neon `era=current|all`, sinon JSON 2026). Monte-Carlo des records via l’API Python quand elle est joignable.

## Admin (`/admin`)

Page locale pour les consoles et les secrets (Neon, Google, OpenAI, Brave Search). Les valeurs sont lues/écrites dans `.env` — **jamais commitées**. Révélation / copie, test de connexion, mise à jour GitHub (`git fetch` / `git pull --ff-only`, équivalent `./launch update`), synchro FDJ.

En local sur `127.0.0.1`, l’accès est ouvert. Si l’UI est exposée, définissez `ADMIN_PASSWORD`. Sur Netlify, les secrets se configurent dans les variables d’environnement du site.

## Interface web (Next.js)

App Next.js (onglets **Tirage** `/tirage`, **Analyse** `/analyse` et **Admin** `/admin`). Le lanceur l’ouvre sur [http://127.0.0.1:43147](http://127.0.0.1:43147). Sans lanceur :

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
| `make test` | Tests unitaires (parse FDJ, rangs, stats, `/api/alive`, ensure) |

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
- `GET /api/analysis/variables|ohlc|inference|montecarlo|bayes|dependence|lab` — calculés sur les tirages (`era`, `from_date`, `to_date`)
- `POST /api/check` `{ numbers, stars, last_n }`
- `GET\|POST /api/grids` · `DELETE /api/grids/{id}`
- `POST /api/reload-env` — relit `.env` et recrée le pool Neon
- `POST /api/sync` — historique complet (bouton Admin)
- `POST /api/sync/ensure` — rattrapage si Neon est en retard (`./launch`)

## Avertissement

Application indépendante, non affiliée à La Française des Jeux.  
[Joueurs Info Service](https://www.joueurs-info-service.fr/) — 09 74 75 13 13.
