# Système solaire

Une scène plein écran du système solaire en révolution. Node-RED tient l’horloge partagée et publie les positions. Three.js les dessine.

La date d’ouverture est celle du moment, à l’heure de Paris. Le temps avance tout de suite, à un jour simulé par seconde. On peut mettre en pause, changer la vitesse, choisir une date, cadrer un astre et compresser les distances pour voir Mercure et Neptune dans le même cadre.

## Lancer

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

Les commandes acceptées sont `pause`, `play`, `toggle`, `setRate` (0 à 4 000 jours par seconde) et `setDate` (années −3000 à 3000). Toute autre charge est ignorée.

La scène réévalue la même formule à chaque image, pour que Mercure reste lisible quand on accélère. Le tick Node-RED reste la référence : la fiche d’un astre affiche la distance qu’il a calculée.

Si le WebSocket manque, la scène continue avec la même formule et l’indique : « Horloge locale ».

## Limites

Les planètes utilisent les éléments képlériens moyens du JPL à l’époque J2000, sans les dérivées séculaires. Les lunes sont des orbites képlériennes simplifiées. Ce n’est pas une éphéméride de navigation : loin de l’an 2000, l’écart grandit.

Les distances à l’écran sont compressées par défaut (exposant 0,55). Le curseur **Distances** à 1 rétablit les proportions en unités astronomiques. Les tailles des corps sont exagérées, sinon la Terre disparaît.

## Textures

Les photographies viennent de [Solar System Scope](https://www.solarsystemscope.com/textures/), licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Si un fichier manque, une texture dessinée prend le relais. La couronne du Soleil, les anneaux de Saturne et la ceinture d’astéroïdes sont générés dans la scène.

## Raccourcis

- Espace : pause ou lecture
- Échap : relâche l’astre suivi
- Clic dans la scène : sélectionne un corps
