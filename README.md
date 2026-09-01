# Synchro — tirages EuroMillions

Deux façons de travailler sur les mêmes tirages :

| Couche | Rôle | Lancer |
|---|---|---|
| **Next.js** | Interface web (filtre, recherche, fréquences, export CSV) | `npm run dev` |
| **Python** | Synchro des archives FDJ vers Neon, stats et grilles | `python -m synchro serve` |

Les résultats officiels restent ceux de la [FDJ](https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique). Ce n’est pas un outil de prédiction. Jeu interdit aux mineurs.

## Interface web (Next.js)

Consultation des tirages 2026 (fichier `src/data/euromillions-2026.json`, 69 tirages du 2 janvier au 28 août 2026).

```bash
npm install
npm run dev
```

Ouvrir [http://127.0.0.1:43147](http://127.0.0.1:43147) (port défini dans `package.json`). Build : `npm run build && npm start`.

Le déploiement **Netlify** utilise cette app (`@netlify/plugin-nextjs`).

## Synchro Python → Neon

Import de l’historique complet FDJ (2004 → aujourd’hui) dans PostgreSQL Neon, plus une interface FastAPI locale (vérification de grilles, stats sur la formule actuelle).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Coller DATABASE_URL (console Neon → projet Synchro → connection pooled)
python -m synchro sync
python -m synchro serve
```

Puis http://127.0.0.1:8000

| Commande | Rôle |
|---|---|
| `python -m synchro init-db` | Crée les tables `draws`, `grids`, `sync_log` |
| `python -m synchro sync` | Télécharge les 6 archives FDJ et les écrit dans Neon |
| `python -m synchro serve` | Interface locale + API `/api/*` |
| `python -m synchro export` | Snapshot JSON (`synchro/web/snapshot.json`) |
| `make test` | Tests unitaires (parse FDJ, rangs, stats) |

`DATABASE_URL` ne doit **jamais** être commitée. `.env` en local, variables d’environnement / secret GitHub Actions en déployé.

Chaque ligne de `draws` contient la date, le jour, 5 numéros et 2 étoiles, `star_pool` (9 / 11 / **12 depuis le 27/09/2016**), les gagnants rang 1 FR/EU, et le code My Million s’il est dans l’archive.

Un workflow GitHub `sync-fdj` peut tourner le mardi et le vendredi à 21h45 (heure de Paris) si le secret `DATABASE_URL` est défini.

### API locale

- `GET /api/health`
- `GET /api/draws?limit=&offset=&q=`
- `GET /api/draws/latest`
- `GET /api/stats?era=current|all`
- `POST /api/check` `{ numbers, stars, last_n }`
- `GET\|POST /api/grids` · `DELETE /api/grids/{id}`
- `POST /api/sync`

## Avertissement

Application indépendante, non affiliée à La Française des Jeux.  
[Joueurs Info Service](https://www.joueurs-info-service.fr/) — 09 74 75 13 13.
