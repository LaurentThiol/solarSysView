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
- un pipeline HTTP conditionnel toutes les 5 s interroge `api.wheretheiss.at` lorsque l’horloge simulée est à moins de 5 minutes du temps réel, et replie automatiquement vers l’orbite théorique hors ligne ou à une autre époque ;
- le nœud **Éphémérides** appelle [ephemeris/solar.js](ephemeris/solar.js), avance la date et renvoie un tick ;
- `GET /api/catalog` et `GET /api/health` exposent le catalogue et l’état de l’éditeur ;
- la date simulée s’affiche sur le nœud.

Les commandes acceptées sont `pause`, `play`, `toggle`, `setRate` (−4 000 à 4 000 jours par seconde, du temps réel `1×` au rebours) et `setDate` (années −3000 à 3000). Toute autre charge est ignorée, et chaque commande est diffusée à tous les onglets connectés.

La scène réévalue la même formule à chaque image, pour que Mercure ou l’ISS restent fluides quand on change d’échelle de temps. Le tick Node-RED reste la référence : la fiche d’un astre affiche la distance qu’il a calculée.

Si le WebSocket manque, la scène continue avec la même formule (« Horloge locale ») et tente automatiquement de se reconnecter à Node-RED.

## Objets et expériences

- **Soleil, 8 planètes et 5 lunes** (Lune, Io, Europe, Ganymède, Callisto) regroupées sous leur planète parente.
- **Comète de Halley (`1P/Halley`)** : orbite rétrograde très excentrique (`a = 17,83 UA`, `e = 0,967`, `i = 162,26°`, période `75,3 ans`). Sa chevelure et sa double queue (ions bleutés et poussières dorées) s’allongent à l’approche du Soleil et pointent toujours à l’opposé de l’étoile.
- **Télescope James Webb (`JWST`)** : orbite halo à `1,5 million de km` de la Terre autour du point de Lagrange L2 côté nuit, avec bouclier Kapton à 5 couches et miroir primaire doré à 18 segments hexagonaux (actif depuis le 25 décembre 2021).
- **Cabriolet Tesla (Starman, `2018-017A`)** : orbite héliocentrique elliptique du JPL (`a = 1,325 UA`, `e = 0,256`, période `557 j`) croisant l’orbite de Mars (actif depuis le 7 février 2018).
- **ISS hybride (temps réel Node-RED / théorique)** : position géographique réelle (`latitude`, `longitude`, `altitude`) convertie en coordonnées écliptiques J2000 autour de l’instant présent, et bascule automatique sur l’orbite circulaire théorique (`415 km`, `51,64°`, précession nodale J2) dès qu’on explore le passé ou le futur.
- **Menu « Grandes dates »** : saut immédiat (date, vitesse et cadrage) vers l’ISS en direct, l’éjection de Starman (2018), son survol de Mars (2020), l’arrivée de James Webb en L2 (2022), le périhélie de Halley (1986) ou l’alignement Voyager 2 (1977).
- **Mode « À bord » (caméra embarquée 360°)** : vue depuis le hublot de la Cupola de l’ISS, le siège passager à côté de Starman, le miroir doré du JWST, le sillage de la comète de Halley ou la surface d’une planète ou d’une lune.

## Limites

Les planètes utilisent les éléments képlériens approchés du JPL avec leurs dérives séculaires (−3000 à 3000, tables Standish & Williams). Les lunes, la comète de Halley, l’ISS théorique et le cabriolet Tesla suivent des orbites képlériennes à deux corps, et le JWST suit un modèle géométrique d’orbite halo autour de L2. Ce n’est pas une éphéméride de navigation.

Les distances à l’écran sont compressées par défaut (exposant 0,55) et le curseur **Distances** à 1 rétablit les proportions en unités astronomiques. De même, les tailles des astres sont amplifiées par défaut (`×16`), mais le bouton **Exact** à côté de **Tailles** applique les rayons physiques réels des planètes et des lunes face au Soleil (`109 Terres` ou `10 Jupiters` dans le diamètre solaire, Ganymède plus grand que Mercure) ainsi que l’échelle exacte des rayons orbitaux lunaires et de l’ISS.

## Textures

Les photographies viennent de [Solar System Scope](https://www.solarsystemscope.com/textures/), licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), avec masquage jour/nuit des lumières terrestres côté éclairé. Si un fichier manque, une texture procédurale prend le relais. La couronne du Soleil, les anneaux de Saturne, la ceinture d’astéroïdes, la double queue de Halley, l’ISS, le JWST et le cabriolet Tesla sont générés en 3D dans la scène.

## Raccourcis et sortie

- **Bouton « Node-RED »** (en haut à droite, avec icône de flux) : ouvre l’**Atelier Node-RED** directement par-dessus ou **côte à côte** avec la scène 3D — avec l’éditeur visuel Node-RED complet (`/red`, déploiement en direct vers le système solaire), un onglet **Schéma & code** (graphe SVG interactif des 17 nœuds et inspecteur JavaScript) et un bouton **Nouvel onglet ↗**.
- **Bouton « Quitter »** (en haut à droite) : ferme proprement le WebSocket et la scène WebGL, puis arrête les flux Node-RED (`RED.stop()`) et le serveur local (`POST /api/shutdown`). Désactivé automatiquement sur un hébergement distant.
- **Espace** : pause ou lecture
- **Échap** : ferme l’Atelier Node-RED, quitte le mode **À bord** ou relâche l’astre suivi
- **Clic** dans la scène : sélectionne un corps, une comète ou un engin
- **Glisser en mode À bord** : tourne le regard à 360° autour du hublot ou de l’horizon
- **Double-clic** dans la scène : cadre et suit l’objet visé
- **± / Maintenant** : inverse le sens du temps ou revient à l’instant présent
