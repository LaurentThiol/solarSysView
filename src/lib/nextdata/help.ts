/**
 * Aide contextuelle de Grilles · nextData.
 * Chaque entrée est le texte du point d’exclamation.
 */

import type { HelpCopy } from "@/components/help"

export const NEXTDATA_HELP = {
  banner: {
    title: "nextData",
    wide: true,
    body: "Deux lectures du prochain tirage 5+2, construites sur les numéros réellement sortis. n1 est le plus petit des cinq, n5 le plus grand : la FDJ ne publie pas l’ordre de sortie.\n\nLes deux modèles partent à chaque pronostic. L’interrupteur choisit la grille mise en avant, celle qui part vers Jeux. L’anneau d’une boule suit la largeur de sa bande 10–90, calibrée sur le retour : plus il est épais, moins le rang est serré.\n\nCe n’est pas une probabilité de gain FDJ. Le retour arrière dit seulement à quel point la même lecture, au même réglage, aurait collé aux tirages déjà sortis.",
  },
  focus: {
    title: "Focus 50 ou 100",
    body: "Les 50 ou 100 derniers tirages du corpus coché. Changer de focus relance le recomptage et les deux entraînements.",
    items: [
      {
        label: "Trois ans",
        text: "Ces tirages pèsent trois fois plus que le reste des années. Ils ne sont pas les seuls à être appris.",
      },
      {
        label: "Fenêtre seule",
        text: "La perte ne voit qu’eux. Avec 50 tirages les décalages sont ramenés à 12, avec 100 ils restent à 16, pour laisser assez de lignes.",
      },
      {
        label: "Lecture",
        text: "La base, les courbes et le retour arrière utilisent la même queue de tirages.",
      },
    ],
  },
  years: {
    title: "Années n, n−1, n−2",
    body: "Années civiles du dernier tirage synchronisé. n est l’année de ce tirage, n−1 l’année d’avant, n−2 celle d’encore avant. Au moins une année reste cochée.",
    items: [
      {
        label: "Corpus",
        text: "Décocher une année retire ses tirages de l’apprentissage. Une année vide n’apparaît pas dans « années présentes ».",
      },
      {
        label: "Mémoire",
        text: "En fenêtre seule, les années cochées d’avant le focus remplissent encore l’ancienneté des couples, des triples et des retards. Elles n’entrent pas dans la perte.",
      },
    ],
  },
  train: {
    title: "Deux entraînements",
    wide: true,
    body: "Les deux grilles sont calculées ensemble, pour les comparer tout de suite. L’interrupteur ne relance pas le calcul : il choisit la grille encadrée et celle envoyée vers Jeux.",
    items: [
      {
        label: "Trois ans · poids ×3",
        text: "LightGBM apprend sur toutes les années cochées. Hors focus, chaque tirage pèse 1. Dans le focus, il pèse 3.",
      },
      {
        label: "Fenêtre seule",
        text: "LightGBM n’apprend que sur les 50 ou 100 derniers, à poids égal. Les tirages d’avant servent de contexte aux décalages.",
      },
      {
        label: "Erreur de somme",
        text: "La lecture au MAE le plus bas est signalée, persistance et moyenne comprises : si la moyenne des sommes fait mieux, c’est elle qui est nommée. L’interrupteur reste votre choix : une petite erreur de somme ne désigne pas la grille à jouer.",
      },
    ],
  },
  jour: {
    title: "Jour de tirage",
    body: "EuroMillions ne tire que le mardi et le vendredi. Le filtre s’applique avant le focus.",
    items: [
      {
        label: "Tous",
        text: "Mardi et vendredi ensemble. Le pas suivant est le prochain des deux.",
      },
      {
        label: "Mardi",
        text: "Seuls les mardis comptent. Le pas suivant est le prochain mardi.",
      },
      {
        label: "Vendredi",
        text: "Seuls les vendredis comptent. Le pas suivant est le prochain vendredi.",
      },
    ],
  },
  moteur: {
    title: "LightGBM, CatBoost et Chronos",
    wide: true,
    body: "LightGBM et CatBoost lisent les mêmes décalages et les mêmes covariables, puis enchaînent les rangs de la même façon : n1, puis les écarts jusqu’à n5, puis e1 et l’écart d’étoiles. Chacun propose sa grille. Le voisin entier le mieux noté est affiché.",
    items: [
      {
        label: "Sans Chronos",
        text: "Réglage de départ. LightGBM et CatBoost partent sans modèle de fondation.",
      },
      {
        label: "CatBoost",
        text: "Même corpus, même focus, mêmes quantiles. Il complète LightGBM, il ne le remplace pas. Les deux grilles restent côte à côte. Il faut ./launch install-nextdata.",
      },
      {
        label: "Chronos inclus",
        text: "Médiane zéro-shot sur la somme, la somme des étoiles et n1, mélangée à LightGBM. Le mélange penche vers la lecture qui s’est moins trompée sur le dernier tirage. CatBoost reste seul. Le premier appel télécharge amazon/chronos-t5-small.",
      },
      {
        label: "Darts",
        text: "S’il est installé, il remplace la médiane temporelle LightGBM du prochain pas. La chaîne des rangs reste LightGBM. Darts n’est pas chargé à l’ouverture de la page.",
      },
      {
        label: "Étendue et consécutifs",
        text: "Même définition que la page Évolution. Étendue = max − min : 4 à 49 pour les numéros, 1 à 11 pour les étoiles. Consécutifs = paires n, n+1 : 0 à 4 pour les numéros, 0 ou 1 pour les étoiles. Ces quatre lectures sont prévues avec la somme et la parité. L’étendue des numéros rapproche la grille projetée de cette cible, un pas à la fois, sans changer la somme. Les voisines sont ensuite classées sur l’étendue et les consécutifs.",
      },
    ],
  },
  bibliotheque: {
    title: "Bibliothèque mise en avant",
    body: "Choisit la grille envoyée vers Jeux : celle de LightGBM ou celle de CatBoost, pour le mode d’entraînement encadré. Les deux restent calculées. CatBoost absent : le bouton reste sur LightGBM.",
  },
  delta: {
    title: "Niveaux ou DeltaEvol",
    body: "Niveaux : la valeur du tirage, somme ou rang. DeltaEvol : l’écart avec le tirage d’avant, la même lecture que dans Évolution. La bande du prochain tirage se lit alors contre le dernier tirage sorti. Le bouton ne relance pas le modèle, il change les courbes.",
  },
  covariates: {
    title: "Covariables",
    wide: true,
    body: "Cases cochées par défaut. Une famille éteinte sort de LightGBM et de CatBoost. Les horloges sont connues avant le tirage. Le reste n’est connu qu’une fois les boules sorties : les modèles ne le voient que jusqu’au dernier tirage.",
    items: [
      {
        label: "Calendrier",
        text: "Mardi ou vendredi, mois, jour de l’année, rotation de Carrington, cycle de Schwabe, année tropique.",
      },
      {
        label: "Lune",
        text: "Phase synodique, en sinus et cosinus, pour éviter le saut de nouvelle lune.",
      },
      {
        label: "Forme",
        text: "Écart max−min des numéros, hauts et bas, consécutifs des numéros et des étoiles, centre, résidu de cycle court, retard moyen des cinq numéros sortis. L’étendue des étoiles est l’écart e2 − e1, déjà prévu avec les rangs.",
      },
      {
        label: "Décennies",
        text: "Combien de numéros dans 1–10, 11–20, 21–30, 31–40 et 41–50, et combien de ces bandes sont occupées.",
      },
      {
        label: "Delta",
        text: "Écart au tirage précédent de la somme, de la somme des étoiles, de n1 à n5, de e1 et de e2.",
      },
      {
        label: "Répétitions",
        text: "Combien de numéros du tirage figuraient déjà au tirage d’avant.",
      },
      {
        label: "Couples",
        text: "Les 10 paires réellement sorties parmi les cinq numéros. Ancienneté, compte, affinité de rang et recouvrement avec le tirage précédent. L’historique s’arrête avant le tirage en cours. La paire d’étoiles a sa propre ancienneté.",
      },
      {
        label: "Triples",
        text: "Les 10 triplets réellement sortis, avec les mêmes mesures. Deux étoiles ne forment pas de triple.",
      },
    ],
  },
  run: {
    title: "Pronostiquer",
    body: "Lance les deux entraînements sur l’archive affichée. Le focus, les années, le jour et les covariables sont ceux des boutons. Le prochain tirage se calcule d’abord, puis le retour, tirage par tirage, au même réglage : mêmes arbres, mêmes quantiles, Darts et Chronos compris. Chaque tirage du retour n’apprend que les tirages d’avant.\n\nLe premier calcul est long : chaque pas ajuste LightGBM et CatBoost sur les deux modes, et plusieurs pas tournent en parallèle. Un pas déjà calculé est relu, ici comme sur nextDataTraining ; après un nouveau tirage, seul ce tirage est à calculer. Arrêter garde les pas déjà faits.",
  },
  source: {
    title: "Archive lue",
    body: "« Archive synchronisée » : les tirages viennent de la base, formule actuelle. « Jeu embarqué » : le fichier livré avec l’interface, en attendant la base. Le nombre annoncé est celui qui part au pronostic.",
  },
  tabPronostic: {
    title: "Pronostic",
    body: "Les deux grilles du prochain tirage, leurs cinq voisines, et les courbes du focus. La carte encadrée est celle de l’interrupteur.",
  },
  tabBase: {
    title: "Base recomptée",
    body: "Effectifs des numéros, des étoiles, des couples et des triples réellement sortis dans le focus. Le score d’une grille voisine s’appuie sur ce recomptage, pas sur une part égale 1/50.",
  },
  tabRetour: {
    title: "Retour arrière",
    body: "Pour chaque tirage du focus, les modèles ne voient que les tirages d’avant, au réglage du pronostic. On compare ensuite au tirage qui est sorti. La persistance rejoue le tirage précédent. La moyenne reprend la somme moyenne d’avant. Le tableau des bandes dit combien de tirages tombaient dans la bande 10–90, avant et après calibrage.",
  },
  chemin: {
    title: "Comment n1…n5 et e1, e2 sont obtenus",
    wide: true,
    body: "Trois lectures par rang. La chaîne part de n1 et ajoute les écarts g1 à g4 ; pour les étoiles, e1 puis l’écart e2 − e1. Le niveau est le quantile prévu pour ce rang, seul. Le delta ajoute au dernier rang sorti le pas n − n−1. Le barreau donne le poids : l’inverse de la largeur de bande, un peu moins pour le delta. Un écart du mélange qui sort de la bande 10–90 est ramené au bord, puis la somme rapproche la grille. La boule est le voisin retenu.",
  },
  grille: {
    title: "Grille 5+2",
    wide: true,
    body: "Cinq numéros triés et deux étoiles. L’anneau suit la largeur de la bande 10–90 du rang : un anneau large dit que le modèle hésite. De n2 à n5, et pour e2, cette bande cumule celles de n1 et des écarts en quadrature, sans sortir des valeurs possibles du rang. Elle est ensuite calibrée sur le retour, comme les autres bandes. Sous les boules, l’étendue et les consécutifs de cette grille, numéros puis étoiles, avec les mêmes comptes que la page Évolution.",
    items: [
      {
        label: "Mise en avant",
        text: "Le mode choisi par l’interrupteur. C’est cette grille que Envoyer vers Jeux force, somme comprise.",
      },
      {
        label: "Comparaison",
        text: "L’autre entraînement, laissé visible avec son MAE de somme sur le retour.",
      },
      {
        label: "MAE somme",
        text: "Erreur absolue moyenne de la somme des cinq numéros, tirage après tirage, sur le focus. Plus le nombre est bas, plus la somme prévue collait aux sommes déjà sorties.",
      },
    ],
  },
  suivantes: {
    title: "Cinq suivantes",
    body: "Voisins de la grille projetée : un rang bouge de 1 à 3, l’ordre et la bande de somme restent tenus. Elles sont classées par distance aux rangs prévus, à l’étendue et aux consécutifs (numéros et étoiles, comme sur Évolution), puis par les fréquences, les couples et les triples recomptés dans le focus.",
  },
  jeux: {
    title: "Envoyer vers Jeux",
    body: "Pose la grille mise en avant comme numéros et étoiles forcés, avec sa somme exacte. Jeux ne compte alors plus qu’une solution 5+2. L’autre grille ne part pas.",
  },
  courbes: {
    title: "Courbes du focus",
    body: "Trait plein : ce qui est sorti. Trait long : trois ans. Trait court : fenêtre seule. Le fin trait du dernier pas est la bande du mode choisi. DeltaEvol remplace chaque niveau par l’écart au tirage d’avant, et la bande par son écart au dernier tirage sorti. Étendue et consécutifs, numéros puis étoiles, suivent le même dessin que la page Évolution.",
  },
  baseIntro: {
    title: "Effectifs du focus",
    body: "Chaque case est un numéro de 1 à 50. L’intensité suit le nombre de sorties dans le focus, pas une part théorique. L’anneau marque les boules de la grille mise en avant. Un numéro absent du focus reste visible, avec un effectif à zéro : il n’est pas retiré du modèle, il pèse seulement très peu.",
  },
  couples: {
    title: "Couples sortis",
    body: "Paires réellement tombées ensemble dans le focus. Le compte est le nombre de co-sorties. L’affinité donne plus de poids aux tirages récents : le dernier pèse n, le plus ancien pèse 1. « Il y a » compte les tirages depuis la dernière fois. Une ligne en gras touche les deux numéros de la grille mise en avant.",
  },
  triples: {
    title: "Triples sortis",
    body: "Trois numéros réellement tombés dans le même tirage, sur le focus. Même compte, même affinité de rang, même ancienneté que les couples.",
  },
  metriques: {
    title: "Lectures du retour",
    wide: true,
    body: "Chaque ligne note la même fenêtre de focus. La plus basse erreur de somme est surlignée, persistance et moyenne comprises. Elle n’impose pas l’interrupteur.",
    items: [
      {
        label: "MAE",
        text: "Moyenne des écarts absolus entre la somme prévue et la somme sortie.",
      },
      {
        label: "RMSE",
        text: "Même écart, en donnant plus de poids aux grosses erreurs.",
      },
      {
        label: "Numéros communs",
        text: "Combien des cinq numéros prévus figuraient dans le tirage, en moyenne entre 0 et 5. Une grille prise au hasard en partage 0,5.",
      },
      {
        label: "Étoiles communes",
        text: "Même compte pour les deux étoiles, entre 0 et 2. Au hasard : 0,33.",
      },
      {
        label: "Persistance",
        text: "La prévision est le tirage juste avant. Repère simple : faire mieux que rejouer le dernier.",
      },
      {
        label: "Moyenne",
        text: "La somme prévue est la moyenne des sommes déjà vues. Pas de grille associée.",
      },
    ],
  },
  bandes: {
    title: "Bandes 10–90 calibrées",
    wide: true,
    body: "Une bande 10–90 devrait contenir huit tirages sur dix. Apprise sur peu de tirages, elle se croit plus sûre qu’elle n’est : la colonne Brute le mesure sur le retour. Le calibrage dit conforme corrige chaque bord. Sur les tirages du retour qui précèdent, on relève de combien la bande a manqué le tirage sorti, par le bas et par le haut ; le bord est déplacé de l’écart qui, parmi ces manques, laisse passer au plus un tirage sur dix.",
    items: [
      {
        label: "Brute",
        text: "Part des tirages du retour tombés dans la bande du modèle, et le nombre de tirages lus.",
      },
      {
        label: "Calibrée",
        text: "Même part, chaque tirage étant calibré sur les seuls tirages d’avant. Il en faut neuf : les premiers ne comptent pas. Près de 80 % veut dire que la bande dit vrai.",
      },
      {
        label: "Élargie au prochain tirage",
        text: "Déplacement des bords de la bande du prochain tirage, calibrée sur tout le retour. Négatif en bas ou positif en haut : la bande s’élargit. L’inverse la resserre.",
      },
      {
        label: "La grille",
        text: "Le calibrage change les bandes, les anneaux et les courbes. Il ne change pas la grille, choisie sur les bandes du modèle, au retour comme au prochain tirage.",
      },
    ],
  },
  tirages: {
    title: "Tirage par tirage",
    body: "Pour une date du focus : les cinq numéros sortis, les cinq prévus par ce mode, et combien sont communs. Le modèle qui a produit la ligne n’avait pas encore vu ce tirage.",
  },
  poids: {
    title: "Poids des variables",
    body: "Les quinze colonnes les plus utilisées pour la somme et pour n1, une liste pour LightGBM et une pour CatBoost. Le nom dit le décalage : lag:sum:2 est la somme d’il y a deux tirages. La famille regroupe calendrier, lune, forme, décennies, delta, répétitions, couples, triples ou la série elle-même. Un gain élevé dit que la colonne a servi à couper les arbres, pas qu’elle annonce le prochain tirage à elle seule.",
  },
} satisfies Record<string, HelpCopy>

export const NEXTDATA_TRAINING_HELP = {
  banner: {
    title: "nextDataTraining",
    wide: true,
    body: "Même réglage que nextData, mesuré sur les dix tirages d’avant : mêmes arbres, mêmes quantiles, même faisceau de grilles voisines, Darts et Chronos compris. Les dix décalages sont les dix derniers tirages du retour de nextData. −1 cache seulement le dernier tirage et le prévoit. −10 se place dix tirages plus tôt et prévoit celui qui venait juste après.\n\nL’écart est prévu moins sorti. Au-dessus de zéro, la lecture était trop haute. Ce n’est pas une prévision à dix coups d’avance, et ce n’est pas une probabilité de gain FDJ.\n\nPersistance et moyenne sont les repères sans modèle : rejouer le tirage d’avant, ou prévoir la somme moyenne d’avant.\n\nChronos et DeltaEvol sont les mêmes interrupteurs que sur nextData. La puce Delta, elle, est une covariable : elle entre dans l’apprentissage.\n\nLa barre compte les pas calculés : les dix décalages d’abord, puis les tirages d’avant, qui calibrent leurs bandes. Un pas déjà calculé, ici ou sur nextData, est relu ; après un nouveau tirage, seul ce tirage est à calculer. Ce n’est pas une estimation du temps restant.",
  },
  decalage: {
    title: "Décalage −x",
    body: "x va de 1 à 10. L’apprentissage s’arrête avant le tirage noté. Le tirage d’après la coupure est connu : on mesure l’écart, on ne le devine pas.",
  },
  somme: {
    title: "Écart de somme",
    body: "Chaque point est un décalage. Le trait est l’écart signé de la somme des cinq numéros. Deux repères sans modèle : la persistance rejoue le tirage d’avant la coupure, la moyenne prévoit la somme moyenne des tirages d’avant. La moyenne est le plus dur des deux : sur des tirages au hasard, elle se trompe d’environ 25 en moyenne, la persistance d’environ 35. Passer sous la persistance ne prouve donc rien. Sur dix décalages, quelques points d’écart entre deux MAE tiennent encore du hasard.",
  },
  chronos: {
    title: "Chronos inclus",
    wide: true,
    body: "Même interrupteur que nextData. Sans Chronos, LightGBM et CatBoost partent seuls. Chronos inclus mélange une médiane zéro-shot à LightGBM, sur la somme, la somme des étoiles et n1. Le poids penche vers la lecture qui s’est moins trompée sur le dernier tirage connu, pas sur le tirage noté. CatBoost reste seul.",
  },
  delta: {
    title: "Niveaux ou DeltaEvol",
    body: "Même interrupteur que nextData, et il ne relance pas l’entraînement. Niveaux : l’écart prévu moins sorti. DeltaEvol : cet écart moins celui du décalage précédent, sur la courbe seulement. Le tableau des rangs reste l’écart brut.",
  },
  rangs: {
    title: "Écarts de rangs",
    body: "Une case, un décalage et un rang. n1 est le plus petit numéro, n5 le plus grand. Le nombre est prévu moins sorti. Une case marquée d’un point : le numéro sorti tombe dans la bande 10–90, calibrée dès que le décalage a neuf tirages d’avant. Brute compte les tirages dans la bande du modèle, Calibrée dans la bande corrigée sur les tirages du focus qui précèdent ce décalage. Une bande juste en contient environ huit sur dix ; moins, le modèle se croit plus sûr qu’il ne l’est. Les lignes étendue, consécutifs, étendue ★ et consécutifs ★ reprennent les comptes de la page Évolution.\n\nLa figure du calcul suit le décalage qui vient d’être mesuré. Un clic sur l’en-tête d’une colonne la laisse sur ce décalage ; un second clic la laisse de nouveau suivre.",
  },
  boules: {
    title: "Prévu et sorti",
    body: "Deux lignes par décalage. Sorti est le tirage FDJ, prévu est la grille de la lecture choisie, rangée n1 à n5 puis e1 et e2. Une boule cerclée est dans les deux grilles. Communs compte ces boules, de 0 à 5 et de 0 à 2. Étendue et consécutifs suivent la page Évolution. Le petit nombre à côté du prévu est l’écart prévu moins sorti, omis quand il est nul. Positif : la lecture était trop haute. La moyenne, en bas, reprend les communs et ces écarts.",
  },
} satisfies Record<string, HelpCopy>
