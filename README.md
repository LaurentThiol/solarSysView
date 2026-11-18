# Système solaire

Une scène plein écran du système solaire en révolution. Node-RED tient l’horloge partagée et publie les positions. Three.js les dessine.

La date d’ouverture est celle du moment, à l’heure de Paris. Le temps avance tout de suite, à un jour simulé par seconde. On peut mettre en pause, changer la vitesse, choisir une date, cadrer un astre et compresser les distances pour voir Mercure et Neptune dans le même cadre.

## Lancer (« Planètes »)

Le lanceur **Planètes** contrôle l’intégrité du projet (version de Node.js, présence des sources, empreintes SHA-256 et en-têtes des textures, structure des flux Node-RED, dépendances `npm`, tests unitaires des éphémérides et fraîcheur du bundle Vite) avant d’ouvrir l’observatoire :

```bash
./planetes
```

- Sur **macOS**, vous pouvez aussi double-cliquer sur **`planètes.command`** dans le Finder.
- Pour vérifier uniquement l’intégrité sans démarrer le serveur : `./planetes --check` (ou `npm run check`).
- Lancement classique via `npm` :

```bash
npm install
npm test
npm start
```

- Scène : http://127.0.0.1:47120
- Éditeur Node-RED : http://127.0.0.1:47120/red

`npm start` construit l’interface, puis ouvre l’éditeur. Si la variable `PORT` est définie, comme sur un hébergement, l’éditeur reste fermé : un Node-RED exposé permettrait d’exécuter du code. L’horloge, le catalogue et le WebSocket continuent de tourner.

Pour travailler sur l’interface avec rechargement :

```bash
npm run dev
```

Vite écoute alors sur le port 47121 et relaie `/api` et `/red` vers Node-RED.

## Ce que fait le flux

L’onglet **Système solaire** dans [flows/flows.json](flows/flows.json) :

- un injecteur à 10 Hz et le WebSocket des commandes entrent dans le nœud **Éphémérides** ;
- ce nœud appelle [ephemeris/solar.js](ephemeris/solar.js), avance la date et renvoie un tick ;
- `GET /api/catalog` et `GET /api/health` exposent le catalogue et l’état de l’éditeur ;
- la date simulée s’affiche sur le nœud.

Les commandes acceptées sont `pause`, `play`, `toggle`, `setRate` (−4 000 à 4 000 jours par seconde, du temps réel `1×` au rebours) et `setDate` (années −3000 à 3000). Toute autre charge est ignorée, et chaque commande est diffusée à tous les onglets connectés.

La scène réévalue la même formule à chaque image, pour que Mercure ou l’ISS restent fluides quand on change d’échelle de temps. Le tick Node-RED reste la référence : la fiche d’un astre affiche la distance qu’il a calculée.

Si le WebSocket manque, la scène continue avec la même formule (« Horloge locale ») et tente automatiquement de se reconnecter à Node-RED.

## Objets représentés

- **Soleil, 8 planètes et 5 lunes** (Lune, Io, Europe, Ganymède, Callisto) regroupées sous leur planète parente.
- **Cabriolet Tesla (Starman, `2018-017A`)** : orbite héliocentrique elliptique du JPL (`a = 1,325 UA`, `e = 0,256`, période `557 j`) croisant l’orbite de Mars. Masqué avant son éjection du 7 février 2018, avec un bouton **Aller au lancement** dans sa fiche.
- **ISS (théorique)** : orbite basse terrestre circulaire permanente à `415 km` d’altitude, inclinée à `51,64°` sur l’équateur terrestre (période `92,9 min`, précession nodale J2). Cadrer l’ISS ramène automatiquement une vitesse trop rapide à `1 min/s` pour suivre sa révolution.

## Limites

Les planètes utilisent les éléments képlériens approchés du JPL avec leurs dérives séculaires (−3000 à 3000, tables Standish & Williams). Les lunes, l’ISS théorique (sans traînée atmosphérique ni rehaussements) et le cabriolet Tesla suivent des orbites képlériennes à deux corps. Ce n’est pas une éphéméride de navigation.

Les distances à l’écran sont compressées par défaut (exposant 0,55). Le curseur **Distances** à 1 rétablit les proportions en unités astronomiques. Les tailles des corps et les rayons visuels des orbites basses ou lunaires sont amplifiés pour éviter toute collision visuelle avec leur planète.

## Textures

Les photographies viennent de [Solar System Scope](https://www.solarsystemscope.com/textures/), licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), avec masquage jour/nuit des lumières terrestres côté éclairé. Si un fichier manque, une texture procédurale prend le relais. La couronne du Soleil, les anneaux de Saturne, la ceinture d’astéroïdes, l’ISS et le cabriolet Tesla sont générés en 3D dans la scène.

## Raccourcis

- **Espace** : pause ou lecture
- **Échap** : relâche l’astre suivi
- **Clic** dans la scène : sélectionne un corps ou un engin
- **Double-clic** dans la scène : cadre et suit l’objet visé
- **± / Maintenant** : inverse le sens du temps ou revient à l’instant présent
