# Synchro — archives EuroMillions

Application web pour consulter les tirages **EuroMillions** de 2026 (janvier à août) : 5 numéros + 2 étoiles, filtre par mois, recherche par numéros, fréquences, export CSV.

Les résultats officiels restent ceux de la [FDJ](https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique).

## Lancer en local

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). Pour un port précis :

```bash
npx next dev --port 43147
```

## Données

Le fichier source est `src/data/euromillions-2026.json` (69 tirages, du 2 janvier au 28 août 2026). L’export CSV reprend le filtre affiché à l’écran.

## Build

```bash
npm run build
npm start
```
