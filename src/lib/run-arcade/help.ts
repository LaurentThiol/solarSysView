/**
 * Aide contextuelle de runArcade.
 * Chaque entrée est le texte du point d’exclamation.
 */

export type RunArcadeHelpCopy = {
  title: string
  body: string
  items?: { label: string; text: string }[]
  wide?: boolean
}

export const RUN_ARCADE_HELP: Record<string, RunArcadeHelpCopy> = {
  runners: {
    title: "Runners",
    body: "De 1 à 50 coureurs, 8 au départ. Chacun commence avec un geste de base différent, le même pour toutes les courbes. Le premier s’appelle R1.",
    items: [
      {
        label: "Sans champion",
        text: "Chaque runner part de son geste de base. Rien n’est lu avant Lancer.",
      },
      {
        label: "Génération suivante",
        text: "Les enfants reçoivent les skills du champion, dans la dernière version écrite avant le premier tirage caché. R1 les garde telles quelles. Les autres essaient une variation maison : elle n’est gardée que si le solde d’examen monte.",
      },
    ],
  },
  tirages: {
    title: "Tirages de course",
    body: "Nombre de tirages payants, 25 au départ, de 4 à 120. La piste est les années civiles n−1 et n du dernier tirage chargé. La course en prend la fin et laisse au moins deux tirages devant : un nombre plus grand est ramené à cette piste.",
  },
  depart: {
    title: "Date de départ",
    body: "Premier tirage que le runner a le droit de lire, pour toute la génération : l’appel, l’examen et chaque tour. Date fixe : la même date pour tous. Aléatoire : une date par runner, tirée parmi les départs valides. Le départ affiché est le premier tirage de l’année n−1. Lancer sans y toucher rejoue la course d’aujourd’hui.",
    items: [
      {
        label: "Cale",
        text: "Un jour sans tirage se cale sur le tirage suivant. Une date dans l’examen, ou après, revient au dernier départ qui laisse encore deux tirages lus.",
      },
      {
        label: "Douze lignes",
        text: "L’appel montre les douze tirages les plus récents de ce qui est autorisé. Une date plus ancienne ne change pas ces lignes. Elle écarte le passé des gestes longs, moyenne et nombre d’or.",
      },
      {
        label: "Examen",
        text: "Les 25 derniers tirages gratuits restent les mêmes pour tous, juste avant la course. Le tirage suivant du champion lit toute l’archive révélée.",
      },
    ],
  },
  minutes: {
    title: "Minutes d’avant-course",
    body: "Y minutes, de 0 à 120, par demi-minute, 10 au départ. Ce temps est l’avant-course : les runners lisent les années n−1 et n, appellent l’IA locale et Brave. Une skill qui passe l’examen s’applique tout de suite, et le dessin se met à jour.",
    items: [
      {
        label: "Zéro",
        text: "La course s’enchaîne sans appel à l’IA ni à Brave. Les tours se lisent à l’écran, l’un après l’autre.",
      },
      {
        label: "Même durée en course",
        text: "Après l’avant-course, les mêmes Y minutes sont partagées entre les tirages : c’est la tranche d’un tour. Une réponse arrivée après sa tranche est appliquée à la fin de la tranche suivante, avant que ce tour se joue.",
      },
    ],
  },
  rayons: {
    title: "Rayons X",
    body: "Choisi avant Lancer, il reste figé pendant l’avant-course et la course. À l’arrêt ou à la fin, on peut le rouvrir pour relire, ou le couper avant le lancement suivant.",
    items: [
      {
        label: "Avant",
        text: "Skills reçues, solde d’examen, variation retenue. Les essais refusés sont dans un dépliable.",
      },
      {
        label: "En ce moment",
        text: "Qui appelle l’IA locale, qui cherche sur Brave, quelle proposition attend la fin de tranche. La carte du runner porte le même mot.",
      },
      {
        label: "Tour",
        text: "Grille jouée, trouvés, 2,50 € du ticket, 2,00 € par trouvé, solde. Sous le dessin, la chaîne relie le dernier point, le geste, la pensée et la case jouée.",
      },
    ],
  },
  lancer: {
    title: "Lancer",
    body: "Ouvre une génération. Le champion de la liste, le fichier importé, ou le dernier déjà écrit, devient le parent. Tant que ce bouton n’est pas pressé, les runners ne courent pas. Pendant l’avant-course ou la course, il s’écrit Relancer et n’est plus le geste mis en avant : Pause, ou Reprendre, l’est.",
  },
  pause: {
    title: "Pause",
    body: "Gèle le temps qui reste à l’avant-course ou à la tranche du tour, et n’envoie plus d’appel. Un appel déjà parti peut encore répondre. Reprendre rend le temps gelé.",
  },
  tour: {
    title: "Passer à la course, ou jouer le tour",
    body: "Pendant l’avant-course, le bouton coupe le temps restant et ouvre la course. Pendant la course, il joue tout de suite le tour en cours : l’arbitre révèle le tirage, le solde bouge, la tranche suivante commence.",
  },
  exporter: {
    title: "Exporter le champion",
    body: "Télécharge le champion en place : celui de la course finie, celui cliqué dans la liste, le fichier importé, ou le dernier déjà écrit. Le JSON porte ses skills, chaque version, et son journal. Le nom du fichier commence par runarcade-generation.",
  },
  importer: {
    title: "Importer le champion",
    body: "Lit un fichier JSON de champion. Un autre JSON est refusé, avec la phrase « Ce fichier n’est pas un champion runArcade. » Le champion lu devient le parent du prochain Lancer, et il est écrit.",
  },
  statut: {
    title: "Où en est la course",
    body: "La bande porte la phase, la génération et le temps qui reste. En course, elle ajoute le tour, une barre, et le meilleur solde. En avant-course, la barre suit le temps écoulé. Avant le lancement, une phrase rappelle de choisir les runners, les tirages et les minutes.",
    items: [
      {
        label: "Carte",
        text: "Un clic sur un runner ouvre sa fiche : le dessin en grand, ses skills et le journal de ses requêtes.",
      },
    ],
  },
  archive: {
    title: "Archive et course",
    body: "L’archive gratuite va du premier tirage des années n−1 et n jusqu’au tirage d’avant la course. La ligne suivante nomme le nombre de tirages de course et leurs dates. Ces tirages d’avant ne coûtent rien.",
  },
  horloge: {
    title: "Horloge",
    body: "L’avant-course dure Y minutes. Chaque tour de course a ensuite une tranche : ces mêmes Y minutes, divisées par le nombre de tirages. À zéro minute, il n’y a pas de tranche d’appel : les tours s’enchaînent. Un seul appel local part à la fois. L’ordre de passage tourne d’un cran à chaque tour.",
    items: [
      {
        label: "Appel médian",
        text: "Une fois des réponses mesurées, la ligne dit combien de runners une tranche peut servir à cette durée. Une réponse en retard joue au tour suivant.",
      },
    ],
  },
  services: {
    title: "IA locale, Brave et Neon",
    wide: true,
    body: "La ligne dit si chaque service est en attente, prêt, ou absent. L’IA locale répond par un seul objet JSON : une skill, ou une recherche Brave.",
    items: [
      {
        label: "IA locale",
        text: "Ollama, graine fixe, réponse courte. Le prompt lit les douze derniers tirages lisibles depuis la date de départ, sans la fenêtre d’examen, et rappelle le solde d’examen. Une réponse illisible est refusée. Le premier appel part sans image. Quand la ligne dit « le dessin part avec l’appel », les appels suivants joignent le dessin. Le journal nomme l’appel, la courbe, le masque, les cinq lectures, la date de création et le compte. Une lecture refusée cite les deux versions.",
      },
      {
        label: "Brave",
        text: "La recherche demandée par le runner s’arrête avant le tirage caché. Les pages de résultats de tirage sont écartées, ainsi qu’un texte qui citerait un tirage encore caché. Les notes qui restent entrent dans le prompt suivant.",
      },
      {
        label: "Neon",
        text: "Le champion est écrit à la fin de la course. La ligne dit si l’écriture est en cours, faite, ou refusée. Si elle est refusée, une copie reste dans ce navigateur.",
      },
    ],
  },
  generation: {
    title: "Génération",
    body: "Un lancement est une génération. La ligne nomme le parent et son numéro. Une version écrite le jour du premier tirage caché, ou après, reste de côté : elle ne joue pas ce tirage. Le compte de ces versions s’affiche ici.",
  },
  champions: {
    title: "Champions déjà écrits",
    body: "Les champions écrits dans Neon, les plus récents d’abord, vingt au plus. Un clic choisit le parent du prochain Lancer. La ligne donne la génération, le runner, le solde de course, le solde d’examen et les dates de la course.",
  },
  suivant: {
    title: "Tirage suivant",
    body: "Le champion propose la grille d’après, lue sur toute l’archive révélée des années n−1 et n. Ce tirage n’est pas dans la base. La date lue est celle du dernier tirage révélé. Lancer reprend ce champion pour la génération suivante.",
    items: [
      {
        label: "Courbe",
        text: "Les pastilles changent le dessin. Les cinq numéros et les deux étoiles annoncés restent ceux de toutes les courbes.",
      },
    ],
  },
  courbes: {
    title: "Courbes",
    wide: true,
    body: "Quatorze courbes. La pensée commence par les sommes, puis les rangs. Les décennies se comptent ensuite sur les numéros joués.",
    items: [
      {
        label: "Σn et Σ★",
        text: "Somme des cinq numéros, de 15 à 240. Somme des deux étoiles, de 3 à 23. Elles passent en premier : les rangs s’y ramènent.",
      },
      {
        label: "n1 à n5",
        text: "n1 est le plus petit, n5 le plus grand. L’écart entre la pensée et la somme se répartit sur les cinq cases. Une pensée à 12, 22 ou 32 reste dans ces eaux-là. Les rangs ne se calent pas sur 10, 20, 30, 40 ou 50.",
      },
      {
        label: "e1 et e2",
        text: "Les deux étoiles, ordonnées, au plus près de leur pensée, pour la somme des étoiles.",
      },
      {
        label: "d0 à d4",
        text: "Nombre de numéros joués dans 1–10, 11–20, 21–30, 31–40 et 41–50. Leur somme vaut 5. La décennie du rail est celle de ces numéros : elle ne les place pas.",
      },
    ],
  },
  persiste: {
    title: "Persiste",
    body: "Le cadre en pointillés recopie le dernier tirage révélé de l’archive : numéros, étoiles, sommes et décennies. C’est le nul gris, à côté de la proposition du champion.",
  },
  dessin: {
    title: "Signes du dessin",
    wide: true,
    body: "Chaque runner dessine la série révélée de sa courbe. Une skill qui la vise pose un masque : la fenêtre du geste. Tangente, cercle d’or, pas d’avant et vecteur sont quatre calques, toujours visibles. Quand la série est longue, le cadre montre vingt tirages : un curseur le glisse le long du trait, calé au départ sur le bout. La phrase sous le dessin dit le geste, la lecture, puis « Observation du …, vue N fois ».",
    items: [
      {
        label: "Trait",
        text: "La série révélée de la courbe affichée, du plus ancien au plus récent.",
      },
      {
        label: "Curseur",
        text: "Vingt tirages tiennent dans le cadre quand la série est plus longue. Le curseur va du plus ancien au bout. Le trait se laisse aussi glisser. Les calques restent au bout : ils sortent du cadre si l’on recule, et Au bout les ramène. Une série courte s’affiche entière, sans curseur.",
      },
      {
        label: "Masque",
        text: "Bande sur la fenêtre de la skill. La bande marquée pose la pensée. Une skill d’une autre courbe n’y paraît pas. Le survol nomme la skill et son geste.",
      },
      {
        label: "Calque tangente",
        text: "Pointillés : la pente entre les deux derniers points, prolongée des deux côtés.",
      },
      {
        label: "Calque cercle d’or",
        text: "Cercle, trait vers le niveau choisi, et niveaux d’or déjà calculés : 0,382, 0,618, 1,272, 1,618 ou 2,618.",
      },
      {
        label: "Calque pas d’avant",
        text: "Flèche du point d’avant vers le dernier point révélé.",
      },
      {
        label: "Calque vecteur",
        text: "Flèche du dernier point vers la pensée, avant le rappel aux sommes.",
      },
      {
        label: "Rappel",
        text: "Trait fin, de la pensée vers la case jouée, quand les sommes ont déplacé cette case.",
      },
      {
        label: "Projection",
        text: "Le point est la case jouée sur la courbe dessinée.",
      },
      {
        label: "Rail",
        text: "À gauche, les sommes et les décennies. À droite, n1 à n5, e1 et e2. Le survol d’une case dit la pensée et la valeur jouée.",
      },
    ],
  },
  gestes: {
    title: "Gestes",
    wide: true,
    body: "Le geste pose la pointe du vecteur, avant que les sommes ramènent la case. Le geste de base vaut pour toutes les courbes. Une skill dédiée à une courbe passe devant.",
    items: [
      {
        label: "Reste sur place",
        text: "La pensée reprend la dernière valeur.",
      },
      {
        label: "Poursuit le pas",
        text: "La pensée ajoute le dernier pas.",
      },
      {
        label: "Inverse le pas",
        text: "La pensée retire le dernier pas.",
      },
      {
        label: "Vise le nombre d’or",
        text: "La pensée vise une part de la bande. 1,618 et 2,618 visent encore 0,618. Bande : les bornes de la courbe. Entre les lignes : du plus bas au plus haut de la fenêtre. Du dernier pas : entre l’avant-dernier point et le dernier.",
      },
      {
        label: "Rejoint sa moyenne",
        text: "Moyenne des derniers tirages, de 2 à 60, ou des derniers jours, de 7 à 365, quand une fenêtre longue est écrite.",
      },
      {
        label: "Suit l’autre soir",
        text: "Mardi et vendredi sont le même jeu. La flèche recopie l’autre soir, à quatre jours au plus, plus le dernier pas de ce soir. Un vendredi suit le mardi d’il y a trois jours, un mardi suit le vendredi d’il y a quatre jours. Sans vis-à-vis, la flèche reprend le dernier pas du même soir. La phrase nomme le soir et le décalage. Une harmonique se compte en tirages du même soir : deux tirages mélangés font la semaine, retenue seulement si les deux soirs la portent.",
      },
    ],
  },
  solde: {
    title: "Solde",
    body: "Chaque runner part avec 50,00 €. Le tour coûte 2,50 €. Un numéro trouvé parmi les cinq boules rapporte 2,00 €, une étoile trouvée parmi les deux étoiles rapporte 2,00 €, quel que soit le rang. En dessous de 2,50 €, le runner s’arrête. Ce solde classe la course.",
    items: [
      {
        label: "Trouvé",
        text: "La case du rail passe au vert. Une somme ou une décennie juste se colore aussi, sans verser d’argent.",
      },
      {
        label: "Examen",
        text: "Solde séparé, sur les 25 derniers tirages lisibles, avec les mêmes 50,00 €, 2,50 € et 2,00 €. Le prompt de l’IA ne lit pas ces tirages. Une skill n’est gardée que si ce solde monte. À égalité, elle est refusée.",
      },
    ],
  },
  arbitre: {
    title: "Arbitre",
    body: "À la fin de la tranche, le tirage caché s’affiche : date, cinq numéros, deux étoiles. Le dessin s’était fait sans lui. Le solde est alors mis à jour, et les cases trouvées passent au vert.",
  },
  passe: {
    title: "Passé révélé",
    body: "Date du dernier tirage que les runners ont le droit de lire pendant le dessin. Le tirage du tour n’y figure pas. Il reste caché jusqu’à l’arbitre.",
  },
  fiche: {
    title: "Fiche du runner",
    body: "La fiche montre le solde de course, le solde d’examen et le nombre d’appels. Les pastilles redessinent la courbe choisie, sans créer d’observation. Les numéros annoncés pour le tour restent ceux de toutes les courbes. La liste donne chaque observation, la plus vue d’abord : la phrase, la date de création, le compte.",
  },
  skills: {
    title: "Skills et versions",
    body: "Une skill nomme un geste, une courbe et une fenêtre. Une skill sur une courbe déjà pilotée en devient une nouvelle version. Une seule skill nouvelle est gardée par lancement.",
    items: [
      {
        label: "Coupure",
        text: "Date du dernier tirage révélé lu pour écrire la version. Vide : la version a été écrite sans lire de tirage. Une version datée du jour du tirage caché, ou d’après, ne joue pas ce tirage.",
      },
      {
        label: "Origine",
        text: "Maison : le geste de départ ou une variation. IA : proposée par le modèle local et gardée parce que l’examen est monté.",
      },
      {
        label: "Examen de la version",
        text: "Solde d’examen au moment où cette version a été gardée.",
      },
    ],
  },
  journal: {
    title: "Journal des requêtes",
    body: "Les huit dernières lignes de ce runner. La ligne dit « avant-course » ou le numéro du tour, puis le genre : ia, brave, skill, refus ou erreur. La coupure est le dernier tirage lu par la requête. Un appel nomme s’il est parti sans image ou avec le dessin, puis la courbe, le masque, les cinq lectures, la date de création et le compte. Une lecture refusée cite ce que le modèle a écrit et ce que la mesure dit.",
  },
}
