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
    body: "De 1 à 18 coureurs, 8 au départ. Chacun commence avec un geste de base différent, le même pour toutes les courbes. R8 part avec la skill Suite numérique, un pas logistique à R = 2. Le premier s’appelle R1.",
    items: [
      {
        label: "Sans champion",
        text: "Chaque runner part de son geste de base. Rien n’est lu avant Lancer.",
      },
      {
        label: "Génération suivante",
        text: "Les enfants reçoivent les skills du champion, dans la dernière version écrite avant le premier tirage caché, et dont l’examen n’a pas lu ce tirage. R1 les garde telles quelles. Les autres essaient une variation maison : elle n’est gardée que si le solde d’examen monte.",
      },
    ],
  },
  tirages: {
    title: "Tirages de course",
    body: "Nombre de tirages payants, 25 au départ, de 4 à 120. La piste est les années civiles n−1 et n du dernier tirage chargé. La course en prend la fin et laisse au moins deux tirages devant : un nombre plus grand est ramené à cette piste. Une piste courte laisse peu de tirages gratuits : l’examen rejoue alors moins de 25 tours, ou aucun, et s’écrit « — ».",
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
        text: "Au lancement, l’examen rejoue les 25 derniers tirages gratuits, juste avant la course : les mêmes pour tous. Pendant la course, il est rejoué quand une proposition arrive, sur les 25 derniers tirages lisibles de ce moment : la fenêtre avance d’un tirage par tour. Tant qu’un runner n’a pas été réexaminé, l’écran dit « au lancement ». Le tirage suivant du champion lit toute l’archive révélée.",
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
        text: "Qui appelle l’IA locale, qui cherche sur Brave, quelle proposition attend la fin de tranche. La carte du runner porte le même mot. La recherche en cours cite la requête.",
      },
      {
        label: "Recherches Brave",
        text: "Chaque requête du runner, dès l’envoi. La ligne dit le runner, l’avant-course ou le tour, puis en cours, le nombre de résultats lisibles, ou l’erreur. La requête est écrite en dessous, sans les sites écartés.",
      },
      {
        label: "Tour",
        text: "Grille jouée, trouvés, 2,50 € du ticket, 2,00 € par trouvé, solde. Sous le dessin, la chaîne relie le dernier point, le geste, la pensée et la case jouée.",
      },
      {
        label: "Fonctionnel",
        text: "Six opérations, de Passage à Jeu, avec la règle sous chaque case. La phrase du haut nomme la première panne de ce moment. S’il n’y en a pas, elle garde la dernière de la course. Un appel ou une recherche coupé par la fin de la course, ou par l’arrêt du runner, s’écrit « interrompu » : ce n’est pas une panne. À zéro minute, Appel, Recherche, Attente et Examen sont sautés. La variation maison reste dans Avant.",
      },
    ],
  },
  lancer: {
    title: "Lancer",
    body: "Ouvre une génération. Le champion de la liste, le fichier importé, ou le dernier déjà écrit, devient le parent. Tant que ce bouton n’est pas pressé, les runners ne courent pas. Il reste éteint pendant la lecture de l’archive. Si la base ne répond pas, la page garde l’extrait embarqué, une ligne le dit, et la course peut partir sur lui. Pendant l’avant-course ou la course, il s’écrit Relancer, repart du parent de la course en cours, et n’est plus le geste mis en avant : Pause, ou Reprendre, l’est. Les champs Runners, Tirages, Minutes et Date se corrigent quand on les quitte, ou au lancement.",
  },
  pause: {
    title: "Pause",
    body: "Gèle le temps qui reste à l’avant-course ou à la tranche du tour, et n’envoie plus d’appel. Une recherche Brave demandée pendant la pause attend la reprise, et une nouvelle tentative de Brave, après « trop de requêtes », attend aussi : elle repart à la reprise. Si la capture du dessin se termine pendant la pause, l’appel attend la reprise avant de partir. Un appel déjà parti peut encore répondre. Reprendre rend le temps gelé.",
  },
  tour: {
    title: "Passer à la course, ou jouer le tour",
    body: "Pendant l’avant-course, le bouton coupe le temps restant et ouvre la course. Pendant la course, il joue tout de suite le tour en cours : l’arbitre révèle le tirage, le solde bouge, la tranche suivante commence. En pause, il avance d’un cran sans rendre le temps : le tour se joue, la course reste en pause, et aucun appel ne part jusqu’à Reprendre.",
  },
  exporter: {
    title: "Exporter le champion",
    body: "Télécharge le champion en place : celui de la course finie, celui cliqué dans la liste, le fichier importé, ou le dernier déjà écrit. Le JSON porte ses skills, chaque version, et son journal. Le nom du fichier commence par runarcade-generation.",
  },
  importer: {
    title: "Importer le champion",
    body: "Lit un fichier JSON de champion. Un autre JSON est refusé, avec la phrase « Ce fichier n’est pas un champion runArcade. » Le champion lu devient le parent du prochain Lancer. Il est écrit dans Neon, sauf s’il y est déjà (même génération, même runner, même date d’écriture) : l’écran dit alors « déjà dans Neon : rien n’est réécrit ». Si Neon refuse, l’écran le dit, et le champion attend « Réessayer l’écriture ».",
  },
  statut: {
    title: "Où en est la course",
    body: "La bande porte la phase, la génération et le temps qui reste. En course, elle ajoute le tour, une barre, et le meilleur solde avec son repère du hasard. En avant-course, la barre suit le temps écoulé. Avant le lancement, une phrase rappelle de choisir les runners, les tirages et les minutes.",
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
    body: "L’avant-course dure Y minutes. Chaque tour de course a ensuite une tranche : ces mêmes Y minutes, divisées par le nombre de tirages, sans descendre sous 0,7 s. Quand ce plancher joue, la ligne l’écrit et la course dure plus que Y minutes. À zéro minute, il n’y a pas de tranche d’appel : les tours s’enchaînent, 0,7 s chacun. Un seul appel local part à la fois. L’ordre de passage tourne d’un cran à chaque tour.",
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
    body: "La ligne dit si chaque service est en attente, prêt, ou absent. L’IA locale répond par un seul objet JSON : une skill, ou une recherche Brave. Une IA absente est sondée de nouveau toutes les 15 s : le prochain appel est la sonde, et les appels reprennent dès qu’elle répond.",
    items: [
      {
        label: "IA locale",
        text: "Ollama, graine fixe, réponse courte. Le prompt lit les douze derniers tirages lisibles depuis la date de départ, sans la fenêtre d’examen, et rappelle le solde d’examen, en disant s’il date du lancement ou d’un tour. Une réponse illisible est refusée. Le premier appel part sans image. Quand la ligne dit « le dessin part avec l’appel », les appels suivants joignent le dessin. Le journal nomme l’appel, la courbe, le masque, les cinq lectures, la date de création et le compte. Une lecture refusée cite les deux versions. Si le dessin ne se rend pas en 4 s, le journal écrit « dessin non joint » avec la raison, et l’appel part sans image. Après trois échecs de suite, le dessin n’est plus joint jusqu’au prochain Lancer.",
      },
      {
        label: "Brave",
        text: "La recherche nomme la relation retenue entre les valeurs déjà lues : deux courbes, au même tirage ou l’une en retard d’un ou deux tirages ; mardi et vendredi ; ou d’une année sur l’autre. Elle n’est retenue que si elle dépasse le hasard, une fois comptées toutes celles qu’on a essayées. Deux courbes tirées des mêmes boules, comme n1 et n2, ne comptent pas : elles sont liées d’avance. S’il n’y a pas de relation, Brave n’est pas appelé. La recherche s’arrête avant le premier tirage de l’examen, que le prompt ne lit pas. Les pages de résultats de tirage sont écartées, ainsi qu’un texte qui citerait un tirage encore caché, dans un des formats de date que le filtre sait lire : date complète, jour et mois en lettres, ou jour sans année écrit 14/08, 14-08 ou 14.08. Si l’API des tirages ne répond pas, ou ne connaît pas le dernier tirage de la piste, la recherche est refusée. Une même recherche n’est lue qu’une seule fois par génération. La génération s’arrête à 40 recherches. Les notes qui restent entrent dans le prompt suivant ; une réponse vide ne les remplace pas.",
      },
      {
        label: "Neon",
        text: "Le champion est écrit à la fin de la course. La ligne dit si l’écriture est en cours, faite, ou refusée. Si elle est refusée, il reste dans une file de ce navigateur, et le bouton « Réessayer l’écriture » le renvoie, le plus ancien d’abord. Si le navigateur refuse aussi la copie, la ligne le dit : le champion n’est gardé nulle part, et Exporter le champion le sauve. Un champion déjà dans Neon n’y est jamais écrit deux fois.",
      },
    ],
  },
  generation: {
    title: "Génération",
    body: "Un lancement est une génération. La ligne nomme le parent et son numéro. Une version écrite le jour du premier tirage caché, ou après, reste de côté : elle ne joue pas ce tirage. Il en va de même d’une version que l’examen a gardée en rejouant ce tirage, ou un tirage d’après. Le compte de ces versions s’affiche ici, avec le nombre de tirages de la course déjà dans la plage où le parent a été choisi.",
  },
  champions: {
    title: "Champions déjà écrits",
    body: "Les champions écrits dans Neon, les plus récents d’abord, vingt au plus. Un clic choisit le parent du prochain Lancer. La liste se relit quand un champion vient d’être écrit. La ligne donne la génération, le runner, le solde de course et son repère du hasard, le solde d’examen avec ses tours et ses dates, et les dates de la course.",
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
  resultat: {
    title: "Résultat",
    body: "À l’arrêt et à la fin de la course, trois grilles en boules se posent au-dessus du dessin du tirage suivant. Pendant l’avant-course et la course, elles restent cachées.",
    items: [
      {
        label: "Dernier tirage",
        text: "La grille du dernier tirage de la course du champion, avec sa date. C’est aussi le dernier tirage de l’archive quand la course est allée au bout et que l’archive n’a pas reçu de tirage depuis : Persiste le recopie alors. Sinon la ligne sous la grille donne les deux dates : Persiste recopie le dernier tirage de l’archive, pas celui-ci.",
      },
      {
        label: "Grille du champion",
        text: "Relue avec les skills enregistrées, sur le passé d’avant ce tirage. La ligne compte les trouvés.",
      },
      {
        label: "Anneau",
        text: "Un anneau marque une boule commune. Les numéros et les étoiles se comptent à part.",
      },
      {
        label: "Pronostic",
        text: "La grille du tirage suivant. Ce tirage n’est pas dans la base. Un anneau marque une boule reprise du dernier tirage.",
      },
      {
        label: "Ticket",
        text: "À la fin, si la grille encore en mémoire du champion est la même, la ligne ajoute 2,50 €, puis 2,00 € par trouvé. Après rechargement, seuls les trouvés et le solde de course restent.",
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
        text: "Nombre de numéros joués dans 1–10, 11–20, 21–30, 31–40 et 41–50. Leur somme vaut 5. Une skill sur une décennie pousse doucement les rangs vers la répartition visée, sans les caler sur 10, 20, 30, 40 ou 50.",
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
        text: "Cercle, trait vers le niveau choisi, et niveaux d’or déjà calculés : 0,382, 0,618, 1,272, 1,618 ou 2,618. Chaque niveau garde sa hauteur, quel que soit le ratio choisi. Le cercle dessiné est toujours le cercle d’or, même pour une figure : il est centré sur le dernier point, et son rayon suit l’écart au niveau choisi.",
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
        text: "La pensée vise une part de la bande : 0,272, 0,382, 0,618, 0,764 ou 0,854 selon le ratio choisi (1,272, 0,382, 0,618, 1,618 ou 2,618). Bande : les bornes de la courbe. Entre les lignes : du plus bas au plus haut de la fenêtre. Du dernier pas : entre l’avant-dernier point et le dernier.",
      },
      {
        label: "Rejoint sa moyenne",
        text: "Moyenne des derniers tirages, de 2 à 60, ou des derniers jours, de 7 à 365, quand une fenêtre longue est écrite.",
      },
      {
        label: "Suit l’autre soir",
        text: "Mardi et vendredi sont le même jeu. La flèche recopie l’autre soir, à quatre jours au plus, plus le dernier pas de ce soir. Un vendredi suit le mardi d’il y a trois jours, un mardi suit le vendredi d’il y a quatre jours. Sans vis-à-vis, la flèche reprend le dernier pas du même soir. La phrase nomme le soir et le décalage.",
      },
      {
        label: "Suit la suite logistique",
        text: "La dernière valeur est ramenée entre 0 et 1 sur la bande du geste : bornes de la courbe, ou entre les lignes. L’étendue « du dernier pas » est refusée : la dernière valeur serait toujours au bord de la bande, et R ne compterait pas. La pensée est un seul pas, X(n+1) = R×Xn×(1−Xn), ramené sur cette bande. R vaut 1, 1,5, 2, 2,8 ou 3,2. Le sommet du pas est R/4 de la bande. 3,5, 3,8 et 4 sont refusés.",
      },
      {
        label: "Trace une figure",
        text: "Un calibre court avance d’un tirage dans la fenêtre. Triangle, cercle et hypoténuse lisent 3 tirages. Le polygone lit 4, 5, 6 ou 8 côtés. Sinus, tangente, arcsinus et arccosinus lisent une période de 4, 6, 8 ou 12 tirages. L’arc tangente tourne le dernier pas de 15, 30 ou 45 degrés. La fenêtre compte au moins autant de tirages que le calibre : une fenêtre plus courte est relevée, sinon la figure ne se lit pas et la pensée reste sur place. Chaque cran est jugé dans son carré. Le sinus lit la phase du dernier cran : la pensée est le point suivant de l’onde qui colle le mieux à ce cran. La pensée part du dernier cran. Elle peut dépasser la fenêtre d’un quart de sa hauteur au plus, et ne sort jamais de la bande de la courbe. Le cercle d’or reste le calque des niveaux. Le cercle dessiné est toujours le cercle d’or, même pour une figure.",
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
        text: "Solde séparé, sur les 25 derniers tirages lisibles, avec les mêmes 50,00 €, 2,50 € et 2,00 €. Le prompt de l’IA ne lit pas ces tirages. Une skill n’est gardée que si ce solde monte. À égalité, elle est refusée. L’écran écrit les tours et les dates rejoués, puis « au lancement » ou « au tour N ». Sans tirage à rejouer, il s’affiche « — » et rien n’est gardé.",
      },
      {
        label: "Hasard",
        text: "Une grille quelconque trouve en moyenne 5/6 de numéro ou d’étoile par tour. Après N tours, son solde vaut 50,00 € − N × (2,50 € − 2,00 € × 5/6), à ± 2,00 € × √(0,6658 × N) près : 29,17 € ± 8 sur 25 tours. Un solde dans cette marge ne montre aucun talent : le meilleur de plusieurs runners la dépasse souvent par chance.",
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
    body: "La fiche montre le solde de course, le solde d’examen avec sa fenêtre (tours, dates, au lancement ou au tour N) et le nombre d’appels. Les pastilles redessinent la courbe choisie, sans créer d’observation. Les numéros annoncés pour le tour restent ceux de toutes les courbes. La liste donne chaque observation, la plus vue d’abord : la phrase, la date de création, le compte.",
  },
  skills: {
    title: "Skills et versions",
    body: "Une skill nomme un geste, une courbe et une fenêtre. Une skill sur une courbe déjà pilotée en devient une nouvelle version. Une courbe nouvelle ajoute une skill, au plus deux par runner et par lancement : une de la variation maison, au lancement, et une de l’IA locale.",
    items: [
      {
        label: "Coupure",
        text: "Date du dernier tirage révélé lu pour écrire la version. Vide : la version a été écrite sans lire de tirage. Une version datée du jour du tirage caché, ou d’après, ne joue pas ce tirage.",
      },
      {
        label: "Origine",
        text: "Trois mots s’affichent. maison : le geste de départ. variation : un essai de la variation maison, au lancement, gardé parce que l’examen est monté. ia : proposée par le modèle local et gardée parce que l’examen est monté.",
      },
      {
        label: "Examen de la version",
        text: "Solde d’examen au moment où cette version a été gardée, et « jusqu’au » : le dernier tirage que cet examen a rejoué. Si ce tirage est le tirage caché de la génération suivante, ou un tirage d’après, la version reste de côté : l’examen l’avait vu. La coupure ne change pas : la version doit rester visible à son propre examen.",
      },
    ],
  },
  journal: {
    title: "Journal des requêtes",
    body: "Les huit dernières lignes de ce runner. La ligne dit « avant-course » ou le numéro du tour, puis le genre : ia, brave, skill, refus ou erreur. La coupure est le dernier tirage lu par la requête. Une recherche Brave cite la relation retenue, pas une phrase libre. Un appel nomme s’il est parti sans image ou avec le dessin, puis la courbe, le masque, les cinq lectures, la date de création et le compte. Une lecture refusée cite ce que le modèle a écrit et ce que la mesure dit.",
  },
  couches: {
    title: "Couches",
    wide: true,
    body: "Deux fenêtres lisent les mêmes tirages. L’une pose n1 à n5 sur l’échelle 1–50, l’autre e1 et e2 sur l’échelle 1–12. Le trait vertical est le profil d’un tirage. La phrase donne les écarts entre couches, la cohérence face à la loi de l’urne, et, pour les numéros, la place dans l’étendue.",
    items: [
      {
        label: "n1 à n5",
        text: "Cinq couches, du plus petit au plus grand. Un clic sur une colonne choisit ce tirage. Sans clic, c’est le plus récent du cadre. Masquer un trait ne change pas les mesures.",
      },
      {
        label: "e1 et e2",
        text: "Les deux étoiles, ordonnées. L’écart est e2 moins e1. La cohérence compare leur pas à la loi de l’urne. Ce n’est pas un signal.",
      },
      {
        label: "Curseur",
        text: "Un seul curseur glisse les deux fenêtres. Vingt tirages tiennent dans le cadre. Au bout ramène les deux au dernier tirage lisible. Pendant la course, le tirage encore caché reste dehors.",
      },
    ],
  },
}
