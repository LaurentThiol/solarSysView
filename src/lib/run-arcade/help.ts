/**
 * Aide contextuelle de runArcade.
 * Chaque entrée est le texte du point d’exclamation.
 */

import { TUNNEL_MAX_DAYS, TUNNEL_MIN_DAYS } from "./tunnel"

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
        label: "Jusqu’à douze lignes",
        text: "L’appel montre jusqu’à douze lignes ; un départ tardif peut n’en laisser que deux. Une date plus ancienne ne change pas ces lignes. Elle écarte le passé des gestes longs, moyenne et nombre d’or.",
      },
      {
        label: "Examen",
        text: "Au lancement, l’examen rejoue les 25 derniers tirages gratuits, juste avant la course : les mêmes pour tous. Pendant la course, il est rejoué quand une proposition arrive, sur les 25 derniers tirages lisibles de ce moment : la fenêtre avance d’un tirage par tour. Tant qu’un runner n’a pas été réexaminé, l’écran dit « au lancement ». Le tirage suivant du champion lit toute l’archive révélée.",
      },
      {
        label: "Calendrier",
        text: "La phrase à côté de la date nomme le premier tirage de course et sa date, les tirages lus depuis ce départ, ceux écartés avant, et les jours jusqu’au début de course. Changer la date ne décale pas la course : elle reste les derniers tirages de la piste. En départ aléatoire, la phrase le dit. Le schéma lit alors l’archive gratuite entière, sans les tirages de course.",
      },
    ],
  },
  minutes: {
    title: "Minutes d’avant-course",
    body: "Y minutes, de 0 à 120, par demi-minute, 10 au départ. Ce temps est l’horloge de l’avant-course : les runners lisent les années n−1 et n, appellent l’IA locale et Brave. Ces minutes ne comptent pas les jours entre le départ et la course. Une skill qui passe l’examen s’applique tout de suite, et le dessin se met à jour.",
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
  melanger: {
    title: "Mélanger",
    body: "Choisi avant Lancer, il reste figé pendant l’avant-course et la course. Éteint, une seule version pose la grille : celle au solde le plus haut, comme aujourd’hui. Allumé, chaque version encore en vie calcule sa pointe, et les pointes se moyennent. Le poids est l’écart déjà compté entre son solde et le hasard, sur les tirages révélés depuis sa naissance. Le tirage caché n’entre pas. Un écart nul ou négatif ne tire pas : la pointe est dessinée, elle ne pèse pas. Si tous les poids sont nuls, la plus récente joue seule. Les sommes ramènent les cases une fois. Un seul ticket. Le trait fort suit ce choix : la gagnante seule, ou la moyenne.",
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
    body: "Télécharge le champion en place : celui de la course finie, celui cliqué dans la liste, le fichier importé, ou le dernier déjà écrit. Une version écrite à la main, pas encore courue, n’est pas dans ce fichier. Le JSON porte ses skills, chaque version, et son journal. Le nom du fichier commence par runarcade-generation.",
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
        text: "Le bandeau nomme le modèle appelé, y compris quand la réponse est vide. Ollama, graine fixe, réponse courte. Pour cet appel, le modèle ne réfléchit pas. L’action tient dans les 320 jetons. Le prompt lit jusqu’à douze lignes ; un départ tardif peut n’en laisser que deux. Il lit depuis la date de départ, sans la fenêtre d’examen, et rappelle le solde d’examen, en disant s’il date du lancement ou d’un tour. Une réponse illisible est refusée. Le premier appel part sans image. Quand la ligne dit « le dessin part avec l’appel », les appels suivants joignent le dessin. Le journal nomme l’appel, la courbe, le masque, les cinq lectures, la date de création et le compte. Une lecture refusée cite les deux versions. Si le dessin ne se rend pas en 4 s, le journal écrit « dessin non joint » avec la raison, et l’appel part sans image. Après trois échecs de suite, le dessin n’est plus joint jusqu’au prochain Lancer.",
      },
      {
        label: "Brave",
        text: "La recherche nomme la relation retenue entre les valeurs déjà lues : deux courbes, au même tirage ou l’une en retard d’un ou deux tirages ; mardi et vendredi ; ou d’une année sur l’autre. Elle n’est retenue que si elle dépasse le hasard, une fois comptées toutes celles qu’on a essayées. Deux courbes tirées des mêmes boules, comme n1 et n2, ne comptent pas au même tirage : elles sont liées d’avance. S’il n’y a pas de relation, Brave n’est pas appelé. La recherche s’arrête avant le premier tirage de l’examen, que le prompt ne lit pas. Les pages de résultats de tirage sont écartées, ainsi qu’un texte qui citerait un tirage encore caché, dans un des formats de date que le filtre sait lire : date complète, jour et mois en lettres, ou jour sans année écrit 14/08, 14-08 ou 14.08. Si l’API des tirages ne répond pas, ou ne connaît pas le dernier tirage de la piste, la recherche est refusée. Une même recherche n’est lue qu’une seule fois par génération. La génération s’arrête à 40 recherches. Les notes qui restent entrent dans le prompt suivant ; une réponse vide ne les remplace pas.",
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
    body: "Les champions écrits dans Neon, les plus récents d’abord. Vingt par page, cinquante au plus : la liste demande la suite. Un clic sur une ligne choisit le parent du prochain Lancer, épinglé en tête. Le chevron montre le détail : le nom et la phrase de chaque skill, le départ, le pronostic écrit, et la note hors échantillon de ce champion. Les générations qui se suivent, n puis n+1, par date d’écriture, forment une lignée. Celle du parent est ouverte, les autres sont repliées. La ligne donne la génération, le runner, le solde de course et son repère du hasard, le solde d’examen, et les dates de la course en bout de ligne. Une pastille donne les tickets notés et le solde net hors échantillon de la lignée, quand il y en a. La liste se relit quand un champion vient d’être écrit. La note porte sur des tirages que la lignée n’avait jamais vus, une fois par date visée : relancer sur la même archive ne crée pas de note nouvelle. « Écarter » masque le champion dans ce navigateur. Il reste dans Neon et dans un export. « Voir les écartés » le remet. Écarter ne touche pas Neon.",
  },
  suivant: {
    title: "Tirage suivant",
    body: "Le champion propose la grille d’après, lue sur toute l’archive révélée des années n−1 et n, avec la version écrite à la main quand il y en a une. Ce tirage n’est pas dans la base. La date lue est celle du dernier tirage révélé. Neon n’est pas réécrit. Lancer reprend ce champion pour la génération suivante.",
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
        text: "Relue avec les skills du parent, version écrite à la main comprise, sur le passé d’avant ce tirage. La ligne compte les trouvés. L’export garde l’ancienne liste.",
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
        text: "Nombre de numéros joués dans 1–10, 11–20, 21–30, 31–40 et 41–50. Leur somme vaut 5. Une skill sur une décennie pousse doucement les rangs vers la répartition visée, sans les caler sur 10, 20, 30, 40 ou 50. Cinq pointes égales valent un par décennie : elles poussent doucement vers un numéro par décennie, au lieu de ne rien pousser.",
      },
    ],
  },
  persiste: {
    title: "Persiste",
    body: "Le cadre en pointillés recopie le dernier tirage révélé de l’archive : numéros, étoiles, sommes et décennies. C’est le nul gris, à côté de la proposition du champion. Dès qu’un champion est relu, ce cadre cède la place à « Dernier tirage » dans Résultat.",
  },
  dessin: {
    title: "Signes du dessin",
    wide: true,
    body: `Chaque runner dessine la série révélée de sa courbe. Une skill qui la vise pose un masque : la fenêtre du geste. Sur le runner ouvert, pendant l’avant-course et la course, chaque version encore en vie de la courbe a un trait fin jusqu’à sa pointe. Le trait fort est la pensée : la gagnante seule, ou la moyenne si Mélanger est allumé. Un trait en pointillés ne pèse pas. Tangente, cercle d’or, pas d’avant et vecteur sont quatre calques, toujours visibles. Quand la série est longue, le cadre montre vingt tirages : un curseur le glisse le long du trait, calé au départ sur le bout. La phrase sous le dessin dit le geste, la lecture, puis « Observation du …, vue N fois ». Un tunnel se lit entre ${TUNNEL_MIN_DAYS} et ${TUNNEL_MAX_DAYS} jours. Il ne joue pas le ticket.`,
    items: [
      {
        label: "Trait",
        text: "La série révélée de la courbe affichée, du plus ancien au plus récent.",
      },
      {
        label: "Curseur",
        text: "Vingt tirages tiennent dans le cadre quand la série est plus longue. Les derniers sont plus larges que le début, pour que le bout, les traits et le point ne recouvrent pas le rail. Le curseur va du plus ancien au bout. Le trait se laisse aussi glisser. Les calques restent au bout : ils sortent du cadre si l’on recule, et Au bout les ramène. Une série courte s’affiche entière, sans curseur.",
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
        text: "Flèche du dernier point vers la pensée, avant le rappel aux sommes. Sur le runner ouvert, pendant l’avant-course et la course, ce trait est le plus fort : la gagnante seule, ou la moyenne si Mélanger est allumé.",
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
        text: "À gauche, les sommes et les décennies. À droite, n1 à n5, e1 et e2. Le rail est à côté du dessin, ou en dessous si la place manque. Il ne recouvre pas le trait. Le survol d’une case dit la pensée et la valeur jouée.",
      },
      {
        label: "Versions",
        text: "Sur le dessin du runner ouvert, pendant l’avant-course et la course, un trait fin par version encore en vie de la courbe affichée. La ligne sous le dessin donne le nom, le geste et le poids. Le poids est l’écart au hasard depuis la naissance, ou 0 s’il est nul ou négatif. Le trait fort est la pensée. Éteint, Mélanger laisse la gagnante seule. Allumé, la pensée est la moyenne des pointes, pondérée par ces poids, puis le rappel vers la case jouée. Une version échue n’a pas de trait. Un poids nul ou négatif est en pointillés : il est dessiné, il ne pèse pas. Le survol dit la pointe et le poids.",
      },
      {
        label: "Tunnel",
        text: `La plus longue durée de ${TUNNEL_MIN_DAYS} à ${TUNNEL_MAX_DAYS} jours qui finit au dernier point révélé. Tous les points de cette durée tiennent dans la bande haut-bas des ${TUNNEL_MIN_DAYS} derniers jours. Le dernier point ne pose pas cette bande : s’il en est déjà sorti, l’écran dit « pas de tunnel ». S’il y en a une, l’écran dit « tunnel N jours, de A à B » et dessine la bande, du premier jour du tunnel au dernier point. Au-delà de ${TUNNEL_MAX_DAYS} jours, on coupe. Le tunnel ne joue pas le ticket.`,
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
        text: "La pensée vise une part de la bande : 0,272, 0,382, 0,618, 0,764 ou 0,854 selon le ratio choisi (1,272, 0,382, 0,618, 1,618 ou 2,618). Bande : les bornes de la courbe. Entre les lignes : du plus bas au plus haut de la fenêtre ; pour les étoiles, du plus bas de e1 au plus haut de e2. Du dernier pas : entre l’avant-dernier point et le dernier. Une fenêtre en jours est refusée pour ce geste : elle ne vaut que pour la moyenne et la figure.",
      },
      {
        label: "Rejoint sa moyenne",
        text: "Moyenne des derniers tirages, de 2 à 60, ou des derniers jours, de 7 à 365, quand une fenêtre longue est écrite. La fenêtre longue en jours ne vaut que pour ce geste et pour la figure.",
      },
      {
        label: "Suit l’autre soir",
        text: "Mardi et vendredi sont le même jeu. La flèche recopie l’autre soir, à quatre jours au plus, plus le dernier pas de ce soir. Un vendredi suit le mardi d’il y a trois jours, un mardi suit le vendredi d’il y a quatre jours. Sans vis-à-vis, la flèche reprend le dernier pas du même soir. La phrase nomme le soir et le décalage.",
      },
      {
        label: "Suit la suite logistique",
        text: "La dernière valeur est ramenée entre 0 et 1 sur la bande du geste : bornes de la courbe, ou entre les lignes. L’étendue « du dernier pas » est refusée : la dernière valeur serait toujours au bord de la bande, et R ne compterait pas. La pensée est un seul pas, X(n+1) = R×Xn×(1−Xn), ramené sur cette bande. R vaut 1, 1,5, 2, 2,8 ou 3,2. Le sommet du pas est R/4 de la bande. 3,5, 3,8 et 4 sont refusés. Une fenêtre en jours est refusée pour ce geste : elle ne vaut que pour la moyenne et la figure.",
      },
      {
        label: "Trace une figure",
        text: "Un calibre court avance d’un tirage dans la fenêtre. Triangle, cercle et hypoténuse lisent 3 tirages. Le polygone lit 4, 5, 6 ou 8 côtés. Sinus, tangente, arcsinus et arccosinus lisent une période de 4, 6, 8 ou 12 tirages. L’arc tangente tourne le dernier pas de 15, 30 ou 45 degrés. La fenêtre compte au moins le calibre plus deux tirages : une fenêtre plus courte est relevée à ce niveau, pour que le mot « masque » puisse valoir « correspond ». Une version déjà écrite garde sa fenêtre : si la figure ne tient pas dedans, la phrase dit « figure non lue, reste sur place », et la pensée reste sur place. Chaque cran est jugé dans son carré. Le sinus lit la phase du dernier cran : la pensée est le point suivant de l’onde qui colle le mieux à ce cran. La pensée part du dernier cran. Elle peut dépasser la fenêtre d’un quart de sa hauteur au plus, et ne sort jamais de la bande de la courbe. Le cercle d’or reste le calque des niveaux. Le cercle dessiné est toujours le cercle d’or, même pour une figure.",
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
        text: "Date du dernier tirage révélé lu pour écrire la version. C’est la naissance. Vide : le geste de base, écrit sans lire de tirage. Une version datée du jour du tirage caché, ou d’après, ne joue pas ce tirage.",
      },
      {
        label: "Durée",
        text: "X se compte sur les versions déjà gardées du même geste, toutes courbes confondues, dans les champions écrits. Pour chacune, on rejoue les tirages lisibles après la naissance, avec le même ticket. On s’arrête au premier bloc de 25 dont le solde retombe dans la bande du hasard. X est la médiane de ces durées, au moins 4. Sans version gardée, X reprend les tirages de la course : la ligne dit « course, faute d’expérience ». Sinon elle dit « mesuré ». Le geste de base n’a pas de fin. Une version joue tant que le tirage caché est après sa naissance et dans ces X tirages. La ligne dit la naissance, « joue encore N tirages », ou « échue ». Une version échue reste dans la liste. La précédente reprend, ou le geste de base s’il n’en reste aucune. Une version dont l’examen a vu le tirage caché reste écartée : la durée s’ajoute à cette règle.",
      },
      {
        label: "Origine",
        text: "Quatre mots s’affichent. maison : le geste de départ. variation : un essai de la variation maison, au lancement, gardé parce que l’examen est monté. ia : proposée par le modèle local et gardée parce que l’examen est monté. main : écrite à la main, avant Lancer.",
      },
      {
        label: "Examen de la version",
        text: "Solde d’examen au moment où cette version a été gardée, et « jusqu’au » : le dernier tirage que cet examen a rejoué. Si ce tirage est le tirage caché de la génération suivante, ou un tirage d’après, la version reste de côté : l’examen l’avait vu. La coupure ne change pas : la version doit rester visible à son propre examen.",
      },
      {
        label: "Fenêtre",
        text: "Le panneau montre la fenêtre sur la courbe : les derniers points, la bande, et la pointe que le geste poserait sur ce passé. Avant Lancer, ce passé est l’archive gratuite depuis la date affichée, sans les tirages de course. En course, le schéma du coureur reste les tirages révélés depuis son départ. En départ aléatoire, il lit l’archive gratuite entière, sans la course. Une skill sur toutes les courbes se dessine sur la courbe affichée.",
      },
      {
        label: "Champs",
        text: "Les champs n’apparaissent que pour le geste. La fenêtre va de 2 à 60 tirages. Les jours, de 7 à 365, n’apparaissent que pour la moyenne et la figure. Le soir n’a pas de champ libre : le décalage reste quatre jours.",
      },
      {
        label: "Version écrite",
        text: "Une version écrite à la main naît au dernier tirage de l’archive gratuite depuis le départ. Elle vit ensuite le X de son geste. Elle part avec le prochain Lancer et ne touche pas les versions déjà dans Neon. Le tirage suivant, les trois grilles et le pronostic la lisent déjà. L’export du champion déjà enregistré garde l’ancienne liste. La version n’entre dans un champion qu’à la fin de la course. Les versions précédentes restent. R1 les garde. Les autres peuvent encore varier à la maison.",
      },
      {
        label: "Concours",
        text: "À chaque tour, chaque version encore en vie est rejouée sur le passé lisible, avec le même examen : 50,00 €, 2,50 € et 2,00 €. Sur chaque courbe, le solde le plus haut pose la grille. À égalité, la plus récente reste. Les autres restent en masque, avec leur solde du tour. Une version échue ne concourt pas. Un seul ticket est joué. Mélanger, allumé au lancement, remplace ce choix par la moyenne des pointes, pondérée par l’écart au hasard depuis la naissance. Un écart nul ou négatif ne tire pas. Si tous les poids sont nuls, la plus récente joue seule. Éteint, une seule version pose la grille.",
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
