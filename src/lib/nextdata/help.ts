/**
 * Aide contextuelle de Grilles · nextData, de nextDataTraining et de la Synthèse Méga.
 * Chaque entrée est le texte du point d’exclamation.
 */

import type { HelpCopy } from "@/components/help"

export const FOCUS_LENGTHS = [20, 50, 100] as const
export type FocusLength = (typeof FOCUS_LENGTHS)[number]

export function isFocusLength(value: number): value is FocusLength {
  return (FOCUS_LENGTHS as readonly number[]).includes(value)
}

export const NEXTDATA_HELP = {
  banner: {
    title: "nextData",
    wide: true,
    body: "Deux lectures du prochain tirage 5+2, construites sur les numéros réellement sortis. n1 est le plus petit des cinq, n5 le plus grand : la FDJ ne publie pas l’ordre de sortie.\n\nLes deux modèles partent à chaque pronostic. L’interrupteur choisit la grille mise en avant, celle qui part vers Jeux. L’anneau d’une boule suit la largeur de sa bande 10–90, calibrée sur le retour : plus il est épais, moins le rang est serré.\n\nCe n’est pas une probabilité de gain FDJ. Le retour arrière dit seulement à quel point la même lecture, au même réglage, aurait collé aux tirages déjà sortis.",
  },
  focus: {
    title: "Focus 20, 50 ou 100",
    body: "Les 20, 50 ou 100 derniers tirages du corpus coché. Changer de focus relance le recomptage et les deux entraînements.",
    items: [
      {
        label: "Trois ans",
        text: "Ces tirages pèsent trois fois plus que le reste des années. Ils ne sont pas les seuls à être appris. Raccourcir le focus rétrécit cette zone : le reste des années pèse davantage.",
      },
      {
        label: "Fenêtre seule",
        text: "La perte ne voit qu’eux, et tous : leurs décalages lisent les tirages d’avant le focus, comme Darts. La fenêtre apprend donc sur 20, 50 ou 100 tirages, avec les mêmes 16 décalages que le mode trois ans. C’est cette lecture qui concentre l’apprentissage sur le focus.",
      },
      {
        label: "Lecture",
        text: "La base, les courbes et le retour arrière utilisent la même queue de tirages.",
      },
    ],
  },
  years: {
    title: "Années n, n−1, n−2",
    body: "Années civiles du dernier tirage synchronisé. n est l’année de ce tirage, n−1 l’année d’avant, n−2 celle d’encore avant. n reste toujours cochée : ses tirages précèdent le prochain tirage, celui que les modèles prévoient.",
    items: [
      {
        label: "Corpus",
        text: "Décocher n−1 ou n−2 retire ses tirages de l’apprentissage. Une année vide n’apparaît pas dans « années présentes ».",
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
        text: "LightGBM n’apprend que sur les 20, 50 ou 100 derniers, à poids égal. Les tirages d’avant servent de contexte aux décalages.",
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
    body: "LightGBM et CatBoost lisent les mêmes décalages et les mêmes covariables, puis prévoient chaque rang de la même façon : n1 à n5, e1 et e2 directement, la chaîne des écarts bornant l’espacement. Chacun propose sa grille. Le voisin entier le mieux noté est affiché.",
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
        text: "Chronos-2 prévoit ensemble la somme, la somme des étoiles et n1, avec leurs bandes 10–90, sans être entraîné sur l’archive : il lit les tirages d’avant et les covariables cochées. Les horloges (calendrier, lune) et Pulse sont connus pour le tirage prévu ; les autres familles s’arrêtent au dernier tirage sorti. Ces bandes se mélangent à celles de LightGBM ; n1 rejoint son niveau. Chaque série a son poids, réglé sur les dix tirages d’avant : il penche vers la lecture qui s’y est le moins trompée, et reste à moitié-moitié tant que ces tirages ne sont pas calculés. CatBoost reste seul. ./launch install-nextdata télécharge autogluon/chronos-2-small. Si Chronos ne répond pas, un bandeau dit pourquoi ; il est retenté au prochain démarrage de l’API.",
      },
      {
        label: "Darts",
        text: "S’il est installé, il remplace la médiane temporelle LightGBM du prochain pas, avec les mêmes arbres. La chaîne des rangs reste LightGBM. Darts n’est pas chargé à l’ouverture de la page ; s’il échoue, la page dit pourquoi et LightGBM garde sa médiane.",
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
    body: "Cases cochées par défaut. Une famille éteinte sort de LightGBM, de CatBoost et de Chronos. Les horloges et Pulse sont connus avant le tirage. Le reste n’est connu qu’une fois les boules sorties : les modèles ne le voient que jusqu’au dernier tirage. Un jeton, « Sans les retards », retire cette part et laisse la famille cochée. Un clic l’éteint. Éteindre la famille l’éteint aussi.",
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
        text: "Écart max−min des numéros, hauts et bas, consécutifs des numéros et des étoiles, centre, résidu de cycle court. Les cinq retards des numéros sortis, du plus court au plus long, et les deux retards des étoiles, de même. Chacun est le nombre de tirages depuis la sortie précédente, compté avant de revoir la boule et plafonné à 25 comme l’ancienneté des couples. L’étendue des étoiles est l’écart e2 − e1, déjà prévu avec les rangs.",
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
        text: "Combien de numéros, puis d’étoiles, du tirage figuraient déjà au tirage d’avant (n−1) et à celui d’encore avant (n−2) : les comptes du bloc Persist d’Évolution.",
      },
      {
        label: "Couples",
        text: "Les 10 paires réellement sorties parmi les cinq numéros. Leurs dix anciennetés, leurs dix parts et leurs dix affinités sont gardées triées, de la plus petite à la plus grande. L’ancienneté est plafonnée à 25 tirages. La part est rapportée aux tirages lus, l’affinité à son maximum : rien ne grandit avec la longueur de l’historique. Le plus petit retard de paire et le recouvrement avec le tirage précédent restent à part. L’historique s’arrête avant le tirage en cours. La paire d’étoiles garde sa propre ancienneté, plafonnée de même.",
      },
      {
        label: "Triples",
        text: "Les 10 triplets réellement sortis, avec les mêmes dix valeurs triées. Deux étoiles ne forment pas de triple.",
      },
      {
        label: "Pulse",
        text: "Chaque boule, puis chaque étoile de l’urne, a sa propre onde simple, ajustée sur ses seules sorties d’avant le tirage. π est sa probabilité fréquentielle au tirage prévu : le taux de ses sorties quand son onde a le même signe, ramené vers 5/50, ou 2 sur l’urne, quand son p de Rayleigh est grand. Les colonnes nomment les cinq boules et les deux étoiles de plus fort π, avec ce π, puis la somme, n1, l’étendue et la parité de ces boules, la somme et e1 de ces étoiles. Le faisceau ajoute le log π de chaque numéro de la grille, le sien. Éteindre Pulse retire ces colonnes et ce terme. Le pas d’après prolonge l’onde de chaque numéro, il ne la réajuste pas. Cycle double, paires et triplets restent sur la page Pulse.",
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
    body: "Pour chaque tirage du focus, les modèles ne voient que les tirages d’avant, au réglage du pronostic. On compare ensuite au tirage qui est sorti. La persistance rejoue le tirage précédent. La moyenne reprend la somme moyenne d’avant. Chaque mesure porte sa marge à 95 % : sur cinquante tirages, deux MAE proches ne se départagent pas toujours. Le tableau des bandes dit combien de tirages tombaient dans la bande 10–90, avant et après calibrage.",
  },
  chemin: {
    title: "Comment n1…n5 et e1, e2 sont obtenus",
    wide: true,
    body: "Chaque rang est prévu directement, deux fois. Le niveau est le quantile prévu pour ce rang, seul. Le delta ajoute au dernier rang sorti le pas n − n−1. Le barreau donne leur poids : l’inverse de la largeur de bande, un peu moins pour le delta. Avec Chronos, le niveau de n1 mélange celui de LightGBM et celui de Chronos : la figure donne la médiane de Chronos et sa part.\n\nLa chaîne part de n1 et ajoute les écarts g1 à g4 ; pour les étoiles, e1 puis l’écart e2 − e1. Elle reste affichée, sans poids : la médiane d’une somme n’est pas la somme des médianes, et additionner des médianes d’écarts tirait n2…n5 vers le bas (n5 vers 39 quand sa médiane est 44). Ses bandes d’écarts tiennent encore l’espacement : un écart du mélange qui en sort est ramené au bord.\n\nLa somme, puis l’étendue, rapprochent ensuite la grille de leurs cibles, un pas à la fois, sur le rang que ce pas éloigne le moins de son centre, à l’échelle de sa bande. La correction se répartit au lieu de pousser n5 puis n4. La boule est le voisin retenu.",
  },
  grille: {
    title: "Grille 5+2",
    wide: true,
    body: "Cinq numéros triés et deux étoiles. L’anneau suit la largeur de la bande 10–90 du rang : un anneau large dit que le modèle hésite. Chaque rang a la bande de sa prévision directe, sans sortir des valeurs possibles du rang ; elle est ensuite calibrée sur le retour, comme les autres bandes. Sous les boules, l’étendue et les consécutifs de cette grille, numéros puis étoiles, avec les mêmes comptes que la page Évolution.",
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
    body: "Chaque ligne note la même fenêtre de focus. La plus basse erreur de somme est surlignée, persistance et moyenne comprises. Elle n’impose pas l’interrupteur. Si son écart apparié avec la deuxième lecture contient zéro, la ligne le dit : « non tranché face à » cette lecture. Les lignes Persist ne concourent pas : elles ne diffèrent de leur lecture que de quelques échanges, et la carte Avec et sans Persist les compare.",
    items: [
      {
        label: "MAE",
        text: "Moyenne des écarts absolus entre la somme prévue et la somme sortie.",
      },
      {
        label: "IC 95 %",
        text: "Intervalle de Student de cette moyenne. Sur cinquante tirages, il s’étend souvent à ±5 points : deux MAE dont les intervalles se chevauchent peuvent encore se départager par paires, colonne suivante.",
      },
      {
        label: "RMSE",
        text: "Même écart, en donnant plus de poids aux grosses erreurs.",
      },
      {
        label: "Numéros communs",
        text: "Combien des cinq numéros prévus figuraient dans le tirage, en moyenne entre 0 et 5. Une grille prise au hasard en partage 0,5. La loi exacte du hasard donne la plage écrite sous le tableau ; au survol, combien de fois sur 100 une grille au hasard fait au moins autant.",
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
  apparie: {
    title: "Contre la moyenne",
    wide: true,
    body: "La lecture et la moyenne sont notées sur les mêmes tirages du retour. À chaque tirage, on retranche l’erreur absolue de somme de la moyenne à celle de la lecture. La case donne la moyenne de ces écarts et son intervalle à 95 %, par la loi de Student : c’est le test de Diebold et Mariano à un pas. Apparier retire le bruit commun au tirage, car une somme sortie très haute trompe toutes les lectures à la fois : l’intervalle est bien plus étroit que celui de deux MAE prises chacune de leur côté.",
    items: [
      {
        label: "Erreur plus basse",
        text: "Tout l’intervalle est sous zéro : la lecture se trompe moins que la moyenne, au-delà du hasard des tirages.",
      },
      {
        label: "Erreur plus haute",
        text: "Tout l’intervalle est au-dessus de zéro : la moyenne fait mieux.",
      },
      {
        label: "Non tranché",
        text: "L’intervalle contient zéro : ces tirages ne départagent pas les deux. Sur des tirages au hasard, c’est le verdict attendu contre la moyenne.",
      },
      {
        label: "Lignes Persist",
        text: "Une jumelle se compare à sa lecture sans Persist : l’écart dit ce que les échanges changent à l’erreur de somme.",
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
        text: "Part des tirages du retour tombés dans la bande du modèle, son intervalle de Wilson à 95 % entre parenthèses, et le nombre de tirages lus.",
      },
      {
        label: "Calibrée",
        text: "Même part, chaque tirage étant calibré sur les seuls tirages d’avant. Il en faut neuf : les premiers ne comptent pas. Près de 80 % veut dire que la bande dit vrai ; un intervalle qui contient 80 % ne la contredit pas.",
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
  persist: {
    title: "Persist ±1, ±2, ±3",
    wide: true,
    body: "Reprend l’observation du bloc Persist d’Évolution : le tirage n garde souvent un numéro ou une étoile de n−1 ou n−2. Une fois la grille choisie, un numéro prévu à ±1, ±2 ou ±3 d’une boule de n−1 ou n−2 cède sa place à cette boule. Le modèle ne change pas, seule la grille finale bouge.\n\nCe n’est pas la Persistance du retour, qui rejoue tout le tirage d’avant : Persist ne reprend qu’une ou deux boules proches. Il faut relancer le pronostic pour changer de réglage : les pas sont relus du cache, seuls les échanges se refont.",
    items: [
      {
        label: "Rayon",
        text: "±1 : seul un numéro voisin d’une boule de n−1 ou n−2 est remplacé. Plus le rayon est large, plus la grille s’éloigne des rangs prévus : chaque échange déplace une boule d’au plus le rayon.",
      },
      {
        label: "1 ou 2 numéros",
        text: "Nombre de numéros de n−1 ou n−2 que la grille doit tenir. Ceux qu’elle a déjà comptent : une grille qui en a assez ne bouge pas. Les échanges vont du plus proche au plus loin, n−1 avant n−2 à égalité, et une boule reprise ne sert qu’une fois.",
      },
      {
        label: "Étoile",
        text: "Même règle pour une étoile, toujours une seule : deux étoiles reprises sont rares, environ 9 % au hasard.",
      },
      {
        label: "Coût",
        text: "Le retour et nextDataTraining notent la grille avec et sans Persist. Un échange est gagné si la boule reprise sort et pas celle qu’elle remplace, perdu dans le cas inverse. La table de l’archive dit ce qu’un échange rapporte en moyenne.",
      },
    ],
  },
  persistArchive: {
    title: "Persist sur l’archive",
    wide: true,
    body: "Tous les tirages reçus, toutes années, mardi ou vendredi seul si le filtre le demande. À chaque tirage, chaque boule possible est rangée selon sa distance à n−1 ∪ n−2 : 0 si elle y était, puis 1, 2, 3, 4 ou plus. Le taux est la part de ces boules qui sont sorties, avec son intervalle à 95 %. Le hasard donne 5/50 = 10 % à chaque numéro et 2/12 ≈ 16,7 % à chaque étoile, quelle que soit la distance.",
    items: [
      {
        label: "Au moins une reprise",
        text: "Part des tirages qui gardent au moins un numéro, une étoile, ou l’un des deux, de n−1 ou n−2 : le +1 du bloc Persist. Le hasard tient compte de la taille réelle de n−1 ∪ n−2 à chaque tirage.",
      },
      {
        label: "Échange",
        text: "Remplacer une boule à distance 1 à r par une boule de n−1 ou n−2 change les communs de p(0) − p(1…r) en moyenne, par échange. Si l’intervalle contient 0, l’archive ne distingue pas l’échange du hasard.",
      },
      {
        label: "Échanges pour voir +1 pt",
        text: "Combien d’échanges il faudrait pour qu’un gain d’un point par boule reprise sorte du bruit, avec 80 % de chances de le voir et 5 % de risque de le voir à tort.",
      },
    ],
  },
  persistPair: {
    title: "Avec et sans Persist",
    wide: true,
    body: "Même modèle, même tirage noté : la grille du modèle et sa jumelle Persist. Gagné : la boule reprise sort, pas celle qu’elle remplace. Perdu : l’inverse. Neutre : ni l’une ni l’autre, ou les deux. Le net est gagnés moins perdus, le p le test exact des signes sur ces deux comptes. Au hasard, le net reste dans la marge affichée 95 fois sur 100. Le tableau donne l’erreur moyenne de chaque champ, sans et avec Persist : un écart positif est de l’erreur ajoutée par les échanges.",
  },
  poids: {
    title: "Poids des variables",
    body: "Les quinze colonnes les plus utilisées pour la somme et pour n1, une liste pour LightGBM et une pour CatBoost. Le nom dit le décalage : lag:sum:2 est la somme d’il y a deux tirages. La famille regroupe calendrier, lune, forme, décennies, delta, répétitions, couples, triples, pulse ou la série elle-même. Le chiffre est la part du gain, en pour cent : chaque modèle (somme, n1) est ramené à 100 avant la moyenne, pour que la somme, dont l’échelle est plus large, ne couvre pas n1. Une part élevée dit que la colonne a servi à couper les arbres, pas qu’elle annonce le prochain tirage à elle seule.",
  },
  rayons: {
    title: "Rayons X",
    wide: true,
    body: "Montre le calcul du réglage affiché, opération par opération : cadre, pas, quantiles, Chronos, arbitrage, projection, calibrage, Persist. Les écarts de règle sont en tête. L’interrupteur ne relance pas le calcul et ne fabrique pas un ticket. Méga n’y entre pas : une ligne Méga est un autre réglage, relu du même cache.",
  },
} satisfies Record<string, HelpCopy>

export const NEXTDATA_TRAINING_HELP = {
  banner: {
    title: "nextDataTraining",
    wide: true,
    body: "Même réglage que nextData, mesuré sur les dix tirages d’avant : mêmes arbres, mêmes quantiles, même faisceau de grilles voisines, Darts et Chronos compris. Les dix décalages sont les dix derniers tirages du retour de nextData. −1 cache seulement le dernier tirage et le prévoit. −10 se place dix tirages plus tôt et prévoit celui qui venait juste après.\n\nL’écart est prévu moins sorti. Au-dessus de zéro, la lecture était trop haute. Ce n’est pas une prévision à dix coups d’avance, et ce n’est pas une probabilité de gain FDJ.\n\nPersistance et moyenne sont les repères sans modèle : rejouer le tirage d’avant, ou prévoir la somme moyenne d’avant.\n\nChronos et DeltaEvol sont les mêmes interrupteurs que sur nextData. La puce Delta, elle, est une covariable : elle entre dans l’apprentissage.\n\nLa barre compte les pas calculés : les dix décalages d’abord, puis les tirages d’avant, qui calibrent leurs bandes. Un pas déjà calculé, ici ou sur nextData, est relu ; après un nouveau tirage, seul ce tirage est à calculer. Tant qu’un pas tourne, le trait défile et le temps écoulé s’affiche à côté du pourcentage : le calcul continue. Ce n’est pas une estimation du temps restant.",
  },
  decalage: {
    title: "Décalage −x",
    body: "x va de 1 à 10. L’apprentissage s’arrête avant le tirage noté. Le tirage d’après la coupure est connu : on mesure l’écart, on ne le devine pas.",
  },
  somme: {
    title: "Écart de somme",
    body: "Chaque point est un décalage. Le trait est l’écart signé de la somme des cinq numéros. Deux repères sans modèle : la persistance rejoue le tirage d’avant la coupure, la moyenne prévoit la somme moyenne des tirages d’avant. La moyenne est le plus dur des deux : sur des tirages au hasard, elle se trompe d’environ 25 en moyenne, la persistance d’environ 35. Passer sous la persistance ne prouve donc rien. Sur dix décalages, une MAE varie d’environ ±6 points au seul gré des tirages : les cartes disent si l’écart à chaque repère est tranché.",
  },
  verdicts: {
    title: "Contre la moyenne, contre la persistance",
    wide: true,
    body: "Une lecture et son repère sont notés sur les mêmes décalages. À chaque décalage, on retranche l’erreur absolue de somme du repère à celle de la lecture. La carte donne la moyenne de ces écarts et son intervalle à 95 %, par la loi de Student : c’est le test de Diebold et Mariano à un pas. Apparier retire le bruit commun au tirage, car une somme sortie très haute trompe toutes les lectures à la fois.\n\n« Erreur plus basse » : tout l’intervalle est sous zéro, la lecture se trompe moins que le repère. « Erreur plus haute » : il est au-dessus. « Non tranché » : il contient zéro, et ces décalages ne départagent pas les deux.\n\nL’IC 95 % de la MAE est l’intervalle de Student de la moyenne des erreurs absolues. Sur dix décalages, il s’étend souvent à ±13 points autour de la MAE : dix tirages départagent rarement deux lectures.",
  },
  chronos: {
    title: "Chronos inclus",
    wide: true,
    body: "Même interrupteur que nextData. Sans Chronos, LightGBM et CatBoost partent seuls. Chronos inclus mélange les bandes 10–90 de Chronos-2 à celles de LightGBM, sur la somme, la somme des étoiles et le niveau de n1. Chronos-2 lit les mêmes covariables cochées : les horloges du tirage prévu, le reste jusqu’au tirage d’avant. Chaque série a son poids, réglé sur les dix tirages d’avant le décalage, jamais sur le tirage noté ; moitié-moitié tant qu’ils ne sont pas calculés. CatBoost reste seul. Si Chronos ne répond pas, le bandeau dit pourquoi.",
  },
  delta: {
    title: "Niveaux ou DeltaEvol",
    body: "Même interrupteur que nextData, et il ne relance pas l’entraînement. Niveaux : l’écart prévu moins sorti. DeltaEvol : cet écart moins celui du décalage précédent, sur la courbe seulement. Le tableau des rangs reste l’écart brut.",
  },
  rangs: {
    title: "Écarts de rangs",
    body: "Une case, un décalage et un rang. n1 est le plus petit numéro, n5 le plus grand. Le nombre est prévu moins sorti. Une case marquée d’un point : le numéro sorti tombe dans la bande 10–90, calibrée dès que le décalage a neuf tirages d’avant. Brute compte les tirages dans la bande du modèle, Calibrée dans la bande corrigée sur les tirages du focus qui précèdent ce décalage. Une bande juste en contient environ huit sur dix ; moins, le modèle se croit plus sûr qu’il ne l’est. Sous chaque compte, l’intervalle de Wilson à 95 % de cette part : 8/10 va de 49 à 94 %, et dix décalages ne distinguent pas 60 % de 80 %. Les lignes étendue, consécutifs, étendue ★ et consécutifs ★ reprennent les comptes de la page Évolution.\n\nLa figure du calcul suit le décalage qui vient d’être mesuré. Un clic sur l’en-tête d’une colonne la laisse sur ce décalage ; un second clic la laisse de nouveau suivre.",
  },
  boules: {
    title: "Prévu et sorti",
    body: "Deux lignes par décalage. Sorti est le tirage FDJ, prévu est la grille de la lecture choisie, rangée n1 à n5 puis e1 et e2. Une boule cerclée est dans les deux grilles. Communs compte ces boules, de 0 à 5 et de 0 à 2. Étendue et consécutifs suivent la page Évolution. Le petit nombre à côté du prévu est l’écart prévu moins sorti, omis quand il est nul. Positif : la lecture était trop haute. La moyenne, en bas, reprend les communs et ces écarts. Sous Moyenne, la plage du hasard : une grille prise au hasard, notée sur autant de décalages, y tombe 95 fois sur 100 (loi exacte, 0,5 numéro et 0,33 étoile par tirage en moyenne). Avec Persist, une troisième ligne donne la grille jumelle : une boule en pointillés vient de n−1 ou n−2.",
  },
  persist: {
    title: "Persist sur dix décalages",
    wide: true,
    body: "Même interrupteur que nextData. Chaque lecture garde sa grille et reçoit une jumelle Persist, notée sur le même tirage avec les mêmes bandes. Sur dix décalages, il y a rarement plus d’une vingtaine d’échanges : le net tient presque toujours dans la marge du hasard. La table de l’archive, calculée sur tous les tirages reçus, est la mesure qui compte. Sur la courbe de somme, le pointillé est la jumelle de la lecture choisie.",
  },
  mega: {
    title: "Méga",
    wide: true,
    body: "Compare le réglage affiché à ses voisins, un facteur à la fois. Les autres focus, parmi 20, 50 et 100. À 20, les dix décalages restent calibrés : le plus ancien a encore dix tirages du focus devant lui, et le calibrage en demande neuf. Les autres profondeurs d’années : n seule, puis n et n−1, puis n, n−1 et n−2. Chaque covariable retirée seule, dès que deux familles au moins sont cochées. Sans Chronos, douze blocs en plus, pour les familles cochées : la date ou les cycles du calendrier, le profil ou les retards de la forme, l’ancienneté, les parts ou les affinités des couples et des triples, les numéros ou les étoiles de Pulse. Chronos inclus ne les ajoute pas. Niveaux et DeltaEvol ne font pas de ligne : ils changent les courbes, pas le calcul. Le jour reste celui du bouton. Le nombre d’arbres est celui du pronostic, le même pour toutes les lignes, pour que la ligne retenue se rejoue telle quelle sur nextData. Chronos n’entre que s’il est déjà inclus.\n\nLes lignes sont notées sur les dix mêmes décalages, ceux du réglage affiché. −1 prévoit le dernier tirage, −10 celui d’il y a dix tirages. Le nombre d’une colonne LGB ou CB est l’erreur absolue moyenne de la somme des cinq numéros. Le tri, le mot « retenu » et le bandeau ne lisent que LightGBM · trois ans, la lecture Corpus.\n\nUne variante est retenue seulement si, sur ces dix dates, son erreur de somme Corpus reste sous celle du réglage affiché sur tout l’intervalle à 95 %, après correction de Holm. Deux groupes : les focus, les années et les familles d’un côté, les blocs de l’autre. Plusieurs lignes peuvent l’être : le bandeau nomme celle dont l’écart moyen est le plus négatif. Sinon le réglage affiché tient. Sur dix décalages, une MAE bouge d’environ ±6 points. Le verdict demande l’intervalle entier. La case la plus basse peut rester non tranchée.\n\nLes ajustements partagent le cache des pas. Plusieurs tournent en parallèle, tant que la charge de la machine reste sous 80 % ; sans /proc (macOS), la charge se lit sur la moyenne d’une minute. Un clic sur une ligne remet ses boutons. Une ligne de bloc pose un jeton, lu aussi par nextData. Entraîner relit alors le cache.",
    items: [
      {
        label: "Lecture Corpus",
        text: "LightGBM appris sur toutes les années cochées. Hors focus, chaque tirage pèse 1. Dans le focus, il pèse 3. Seule cette lecture départage les lignes. Fenêtre seule et CatBoost restent dans le tableau.",
      },
      {
        label: "Écart apparié",
        text: "À chaque décalage, on retranche l’erreur absolue de somme du réglage affiché à celle de la variante. « vs affiché » donne la moyenne de ces écarts et son intervalle de Student à 95 % : le test de Diebold et Mariano à un pas. Un nombre négatif : la variante est plus près de la somme sortie. « Erreur plus basse » : tout l’intervalle est sous zéro. « Erreur plus haute » : il est au-dessus. « Non tranché » : il contient zéro.",
      },
      {
        label: "Holm",
        text: "Deux groupes. Les focus, les années et les familles retirées se corrigent entre eux. Les blocs se corrigent entre eux. Dans un groupe, on classe les p du plus petit au plus grand. Le premier est jugé à 5 % divisé par le nombre de lignes du groupe. Le suivant, à 5 % divisé par le nombre encore en lice. Dès qu’une ligne ne passe pas, les suivantes de son groupe non plus. Une case qui lisait « erreur plus basse » ou « erreur plus haute » devient alors « non tranché après Holm ». Le bandeau compare les retenues des deux groupes et nomme la plus négative.",
      },
      {
        label: "Chronos",
        text: "S’il est inclus, il se mélange à LightGBM sur la somme, la somme des étoiles et le niveau de n1, moitié-moitié : les dix tirages d’avant qui règlent ses poids ne sont pas calculés dans ce parcours. Il tourne dans l’API, un pas à la fois, pendant que les arbres avancent. CatBoost garde sa somme. La MAE du réglage affiché peut donc s’écarter de celle d’Entraîner.",
      },
      {
        label: "Tirets",
        text: "Une ligne trop courte n’a pas les 24 tirages du corpus. Une ligne décalée ne porte pas les mêmes dix dates : ses cases restent vides, et Holm ne la voit pas. Tant qu’un morceau manque, « vs affiché » et « vs persistance » restent en tirets, même si une MAE est déjà écrite.",
      },
    ],
  },
} satisfies Record<string, HelpCopy>

export const NEXTDATA_SWEEP_HELP = {
  synthese: {
    title: "Synthèse Méga",
    wide: true,
    body: "Le tableau note le réglage des boutons et ses voisins sur les mêmes dix décalages. Chaque ligne ne change qu’un facteur : un autre focus, 20, 50 ou 100, une autre profondeur d’années, une covariable retirée, ou, sans Chronos, un bloc d’une grande famille. Le jour reste celui du bouton, le nombre d’arbres celui du pronostic.\n\nLa première ligne est le réglage affiché, même quand sa MAE est plus haute. Les autres suivent l’erreur de somme de LightGBM · trois ans, de la plus basse à la plus haute. À erreur égale, l’ordre suit l’alphabet français des libellés. Une erreur manquante passe en bas.\n\nLe bandeau ne nomme un gagnant qu’une fois toutes les lignes complètes. « Comparaison en cours » : des décalages manquent encore. Un libellé « se trompe moins… après correction de Holm » : cette ligne est la retenue dont l’écart moyen est le plus négatif, entre les deux groupes. « Le réglage affiché tient » : aucune variante ne reste sous lui sur tout l’intervalle, une fois Holm appliqué. Plusieurs lignes peuvent porter le mot « retenu » et le fond teinté. Le bandeau n’en nomme qu’une.\n\nLa phrase grise sous le bandeau répète la règle. Sans Chronos, elle sépare le groupe des blocs de celui des focus, des années et des familles. Avec Chronos, elle ajoute que le mélange est moitié-moitié, et que la MAE du réglage affiché peut s’écarter de celle d’Entraîner. La ligne de charge dit ce que la machine faisait pendant la dernière tranche.",
    items: [
      {
        label: "Ce qui décide",
        text: "Seule la lecture Corpus, LightGBM · trois ans, entre dans le tri, dans « vs affiché » et dans Holm. La fenêtre, CatBoost, Persist, les numéros communs et la persistance restent des lectures à côté.",
      },
      {
        label: "L’écart qui retient",
        text: "Pour chaque date, |erreur de somme de la ligne| − |erreur de somme du réglage affiché|. La moyenne de ces dix écarts a un intervalle de Student à 95 %. La ligne est retenue si cet intervalle est tout entier sous zéro et si son p passe la correction de Holm. Le plus négatif des écarts retenus est celui du bandeau.",
      },
      {
        label: "Pendant le calcul",
        text: "Une MAE, des communs ou un compte de décalages peuvent déjà s’afficher. « vs affiché » et « vs persistance » attendent que chaque morceau de chaque ligne soit prêt. Le bouton d’une ligne s’ouvre à ce moment-là.",
      },
      {
        label: "Rejouer la ligne",
        text: "Le clic remet le focus, les années, les covariables et Chronos. Une ligne trop courte ou décalée ne se rejoue pas. Entraîner relit les pas déjà au cache.",
      },
    ],
  },
  reglage: {
    title: "Réglage",
    wide: true,
    body: "Le nom de la ligne, et le seul facteur qui la sépare du réglage affiché. La première ligne reprend les boutons tels quels : focus, années, covariables, le jeton de bloc s’il est posé, et Chronos s’il est déjà inclus. Chaque autre ligne n’en change qu’un.\n\nLe mot « retenu » et le fond teinté arrivent ensemble, parcours fini : Holm garde cette ligne, et son erreur de somme Corpus est plus basse que celle du réglage affiché sur tout l’intervalle. Le bouton reprend le focus, les années, les covariables, le jeton et Chronos de la ligne. Il s’ouvre quand le parcours est fini. Une ligne vide reste fermée. La petite ligne grise sous le nom est la raison d’une ligne vide.",
    items: [
      {
        label: "Focus 20, 50 ou 100",
        text: "Une autre longueur. Les années et les covariables restent celles des boutons. Les dix dates notées aussi. À 20, les dix décalages restent calibrés.",
      },
      {
        label: "Années",
        text: "Une profondeur qui n’est pas celle des boutons. Il y en a trois : n ; n, n−1 ; n, n−1, n−2. n, l’année du dernier tirage, reste toujours. La profondeur déjà affichée n’a pas de seconde ligne : c’est la première.",
      },
      {
        label: "Sans une famille",
        text: "Cette covariable sort de LightGBM, de CatBoost et de Chronos. Les autres restent. Ces lignes n’apparaissent que si au moins deux familles sont cochées.",
      },
      {
        label: "Sans un bloc",
        text: "Une part de la famille sort, le reste reste. Calendrier : la date, ou les cycles. Forme : le profil, ou les retards. Couples et triples : l’ancienneté, les parts, ou les affinités. Pulse : les numéros, ou les étoiles. Ces lignes n’apparaissent que sans Chronos. Le clic pose le jeton sur nextDataTraining et sur nextData.",
      },
      {
        label: "Ligne vide",
        text: "« Il faut au moins 24 tirages » : le corpus de ces années est trop court. « Ces années ne portent pas les mêmes tirages » : les dix dates ne sont pas celles du réglage affiché. Les cases de valeur sont des tirets, et Holm ignore la ligne.",
      },
    ],
  },
  focus: {
    title: "Focus",
    wide: true,
    body: "20, 50 ou 100 : la longueur de focus demandée pour la ligne, après le filtre du jour. Ce nombre change ce que les modèles apprennent. Les dix dates notées restent celles du réglage affiché : −1 à −10 sont les dix derniers tirages de ce corpus, et ces dix tirages sont dans la fenêtre. Si le corpus est plus court que le focus affiché, l’apprentissage s’arrête au dernier tirage disponible : les focus plus longs apprennent alors la même queue.",
    items: [
      {
        label: "Trois ans, poids ×3",
        text: "LightGBM apprend sur les années cochées. Hors focus, chaque tirage pèse 1. Dans le focus, il pèse 3. Allonger le focus allonge la zone qui pèse trois. Le raccourcir laisse plus de poids au reste des années. C’est la lecture Corpus, celle du verdict.",
      },
      {
        label: "Fenêtre seule",
        text: "La perte ne voit que ces 20, 50 ou 100 tirages, à poids égal. Les tirages d’avant le focus restent lisibles par les décalages, comme Darts et comme sur nextData. Raccourcir le focus concentre cette fenêtre. À 20, les dix décalages notés restent calibrés : chacun a au moins neuf tirages du focus devant lui.",
      },
      {
        label: "Même queue",
        text: "Les dix sommes comparées sont celles des mêmes tirages. Le focus ne décale pas le calendrier noté. Il change le poids, et le nombre de tirages que la fenêtre seule apprend.",
      },
    ],
  },
  annees: {
    title: "Années",
    wide: true,
    body: "Profondeur demandée, dans l’ordre n, n−1, n−2. n est l’année civile du dernier tirage synchronisé, n−1 l’année d’avant, n−2 celle d’encore avant. Le signe moins fait partie du nom de la profondeur.",
    items: [
      {
        label: "Ce qui sort du corpus",
        text: "Retirer n−1 ou n−2 retire ses tirages de l’apprentissage, et de la mémoire des couples, des triples et des retards. Une année cochée sans tirage n’entre pas dans l’apprentissage. Le libellé garde la profondeur demandée, pas la liste des années réellement remplies.",
      },
      {
        label: "Mêmes dix dates",
        text: "La ligne n’est notée que si ses dix derniers tirages sont exactement ceux du réglage affiché. Sinon la ligne grise dit que ces années ne portent pas les mêmes tirages, et les valeurs restent en tirets : deux calendriers ne se comparent pas.",
      },
    ],
  },
  covariables: {
    title: "Covariables de la ligne",
    wide: true,
    body: "« Celles des boutons » : les familles cochées au-dessus. C’est le cas du réglage affiché, des autres focus et des autres années. « Sans » suivi d’un nom : cette seule famille est éteinte, les autres restent. « Sans les retards », ou un autre bloc : cette part sort, la famille reste cochée. Ces lignes n’apparaissent que sans Chronos.",
    items: [
      {
        label: "Familles",
        text: "Calendrier, Lune, Forme, Décennies, Delta, Répétitions, Couples, Triples, Pulse. Une famille éteinte sort de LightGBM, de CatBoost et de Chronos. Les horloges et Pulse sont connus pour le tirage prévu. Les autres familles ne sont vues que jusqu’au dernier tirage sorti.",
      },
      {
        label: "Bloc",
        text: "Sans Chronos, la colonne dit « sans les retards », ou le nom du bloc. La famille reste cochée. Le clic pose ce jeton. Entraîner et Pronostiquer l’envoient. L’éteindre, ou éteindre la famille, retire ces colonnes. Un pas sans jeton garde sa clé de cache.",
      },
      {
        label: "Ce qui ne varie pas",
        text: "Le jour de tirage reste celui du bouton, mardi, vendredi ou les deux. Le nombre d’arbres est celui du pronostic, 32 sauf autre réglage du serveur, quantiles 10, 50 et 90. Ils ne sont pas des colonnes : toutes les lignes les partagent, et le cache des pas aussi.",
      },
    ],
  },
  mae: {
    title: "MAE de somme",
    wide: true,
    body: "Erreur absolue moyenne de la somme des cinq numéros, en points de somme. À chaque décalage, l’erreur est la valeur absolue de prévu moins sorti. La case est la moyenne de ces erreurs, avec une décimale : 12,26 s’affiche 12,3. Plus le nombre est bas, plus la somme de la grille collait aux sommes déjà sorties.\n\nLe survol de la case LGB · 3 ans donne l’intervalle de Student à 95 % de cette moyenne, avec un degré de liberté de moins que le nombre de décalages entrés dans la moyenne. Le bas est ramené à 0 : une erreur absolue moyenne ne descend pas en dessous. Sur dix décalages, l’intervalle s’étend souvent d’environ ±6 points. Deux cases proches peuvent encore se départager par paires, dans « vs affiché ».\n\nPendant le calcul, la case montre la moyenne des décalages déjà prêts pour cette ligne. Le verdict attend que toutes les lignes soient complètes. Une ligne trop courte ou décalée reste en tirets.",
    items: [
      {
        label: "LGB · 3 ans",
        text: "LightGBM, trois ans, poids ×3 dans le focus. C’est la lecture Corpus. Seule cette colonne trie les lignes, pose le mot « retenu » et alimente « vs affiché » et « vs persistance ». Les communs sont aussi ceux de cette grille.",
      },
      {
        label: "LGB · fenêtre",
        text: "Le même LightGBM, appris seulement sur les 20, 50 ou 100 tirages du focus, à poids égal. Sa MAE ne départage pas les lignes.",
      },
      {
        label: "CB · 3 ans et CB · fenêtre",
        text: "CatBoost, sur les mêmes décalages, les mêmes quantiles et les mêmes covariables. Chronos ne se mélange pas à ces deux lectures. Un tiret : CatBoost n’a pas produit la grille.",
      },
      {
        label: "Darts et Chronos",
        text: "S’il est installé, Darts remplace la médiane temporelle LightGBM du pas, sur la somme et la somme des étoiles. La chaîne des rangs reste LightGBM. Si Chronos est inclus, ses bandes se mélangent à celles de LightGBM, sur la somme, la somme des étoiles et le niveau de n1. Dans ce tableau le poids reste moitié-moitié : les dix tirages d’avant qui le règlent ne sont pas calculés. La somme, donc la MAE, peut s’écarter de celle du bouton Entraîner.",
      },
    ],
  },
  versusAffiche: {
    title: "Contre le réglage affiché",
    wide: true,
    body: "Écart d’erreur de somme, lecture Corpus, entre cette ligne et la première. À chaque décalage commun : |somme prévue de la ligne − somme sortie| − |somme prévue du réglage affiché − somme sortie|. La case donne la moyenne de ces écarts, son intervalle de Student à 95 %, et le mot qui va avec. C’est le test de Diebold et Mariano à un pas. Apparier retire le bruit du tirage : une somme sortie très haute trompe les deux lignes ensemble, et l’intervalle est bien plus étroit que celui de deux MAE prises chacune de leur côté.\n\nUn exemple de case : « erreur plus basse (-2,5 ; IC -4,0 à -1,0) ». -2,5 est l’écart moyen, en points de somme. L’intervalle va de -4,0 à -1,0. La première ligne est le repère : sa case reste un tiret. Les autres cases restent des tirets tant qu’un morceau du parcours manque. Avec un seul décalage, l’intervalle n’existe pas et la case dit « un seul tirage ».",
    items: [
      {
        label: "Erreur plus basse",
        text: "Tout l’intervalle est sous zéro. La ligne se trompe moins que le réglage affiché. C’est la condition de sens pour le mot « retenu ». Holm doit encore laisser passer le p.",
      },
      {
        label: "Erreur plus haute",
        text: "Tout l’intervalle est au-dessus de zéro. Le réglage affiché se trompe moins. Si Holm laisse passer ce p, le mot reste « erreur plus haute ». La ligne n’est pas surlignée.",
      },
      {
        label: "Non tranché",
        text: "L’intervalle contient zéro. Ces décalages ne départagent pas les deux lectures. C’est aussi le cas quand un seul décalage ne trace pas d’intervalle.",
      },
      {
        label: "Non tranché après Holm",
        text: "L’intervalle était tout entier d’un côté, puis le p ne passe plus une fois les autres lignes prises en compte. Exemple : « non tranché après Holm (-1,0 ; IC -2,0 à -0,1) ». Holm classe les p du plus petit au plus grand. Le premier est jugé à 5 % divisé par le nombre de lignes comparées. Chaque suivant, à 5 % divisé par le nombre encore en lice. Dès qu’une ligne ne passe pas, les suivantes non plus. Le mot « retenu » n’est posé que si Holm passe et que le verdict est « erreur plus basse ».",
      },
    ],
  },
  versusPersistance: {
    title: "Contre la persistance",
    wide: true,
    body: "Même écart apparié que « vs affiché », lecture Corpus contre la persistance, sur les décalages de la ligne. La persistance rejoue la somme du tirage juste avant la coupure. À chaque date : |erreur Corpus| − |erreur de la persistance|. « Erreur plus basse » : Corpus se trompe moins que rejouer le tirage d’avant, sur tout l’intervalle de Student à 95 %.\n\nLe mot « retenu » se décide dans « vs affiché ». Cette colonne est le repère sans modèle. Sur des tirages au hasard, la persistance se trompe d’environ 35 points de somme, la moyenne des sommes d’environ 25 : passer sous la persistance est le repère le plus facile. La case attend la fin du parcours. Un écart négatif veut dire que Corpus est plus près de la somme sortie. L’intervalle qui contient zéro laisse « non tranché ».",
  },
  persist: {
    title: "Jumelle Persist",
    wide: true,
    body: "MAE de somme de la jumelle Persist de la lecture Corpus, sur les mêmes décalages, avec une décimale. Le modèle ne change pas. Après la grille, un numéro prévu à ±1, ±2 ou ±3 d’une boule de n−1 ou de n−2 cède sa place à cette boule, dans le rayon et le nombre d’échanges des boutons Persist. La somme de la grille jumelle peut donc bouger, et son erreur aussi.\n\nLa colonne apparaît quand Persist est armé et qu’une ligne a pu noter sa jumelle. Le mot « retenu » se décide dans « vs affiché », sur la grille sans ces échanges. Le coût boule à boule, gagné si la boule reprise sort et pas celle qu’elle remplace, se lit sur la carte Avec et sans Persist.",
  },
  communs: {
    title: "Numéros communs",
    wide: true,
    body: "Moyenne, sur les décalages déjà prêts, du nombre de numéros de la grille Corpus qui figurent dans les cinq numéros sortis. Le compte de chaque tirage va de 0 à 5. La case a deux décimales : 0,58 est un peu plus d’un demi-numéro par tirage.\n\nLa grille est celle de LightGBM · trois ans, la même que la ligne Prévu de l’entraînement. Une boule compte quand son numéro est sorti, quel que soit le rang. Les étoiles ne sont pas dans cette case. Une grille prise au hasard en partage 0,50 : cinq numéros prévus et cinq sortis parmi cinquante, soit 5×5/50.\n\nLe mot « retenu » se décide sur l’erreur de somme. Une ligne peut avoir plus de communs et une erreur de somme plus haute. Le bandeau suit la somme.",
  },
  decalages: {
    title: "Décalages prêts",
    wide: true,
    body: "Décalages dont tous les morceaux sont au cache, sur les décalages demandés pour cette ligne. 10/10 : −1 à −10 sont notés. −1 cache le dernier tirage et le prévoit. −10 se place dix tirages plus tôt et prévoit celui qui venait juste après. L’apprentissage s’arrête avant le tirage noté.\n\nUn décalage est prêt quand chaque morceau du pas est là : LightGBM, CatBoost s’il est installé, Darts s’il est installé, Chronos s’il est inclus et disponible. La barre du parcours compte ces morceaux une seule fois quand plusieurs lignes partagent le même pas. La case compte les décalages de la ligne, pas les morceaux.\n\n0/10 : aucun décalage de la ligne n’est encore prêt. La MAE déjà affichée sur 7/10 ne porte que sur ces sept dates. Le verdict et le clic attendent que chaque ligne affichable soit au complet. Un tiret : la ligne n’a aucun décalage à noter, parce qu’elle est trop courte ou que ses dates ne sont pas celles du réglage affiché.",
  },
  charge: {
    title: "Charge du parcours",
    wide: true,
    body: "Ce que la machine faisait pendant la dernière tranche, et combien de calculs d’arbres cette tranche s’autorisait.\n\n« Charge 42 % » est la part du temps CPU qui n’était pas en attente, lue entre le début et la fin de la tranche. Sans /proc, c’est la charge moyenne d’une minute divisée par le nombre de cœurs : la lecture de macOS. « Charge — » : aucune des deux mesures n’a pu être lue.\n\n« 3 processus sur 6 » : la tranche pouvait faire tourner trois calculs d’arbres, le plafond est six. Le plafond est 80 % des cœurs, au moins un. Un créneau de plus s’ouvre sous 60 % de CPU, tant que la mémoire libre, quand elle est lisible, reste au moins à 20 %. Entre 60 et 80 %, le nombre reste celui déjà ouvert. Au-dessus de 80 % de CPU, ou sous 20 % de mémoire libre, aucun processus nouveau ne s’ouvre. « 1 processus » : le calcul reste dans l’API, sans pool.\n\nChronos ne compte pas dans ces processus. Il reste dans l’API, un pas à la fois, pendant que les arbres tournent. Chaque appel dure au plus vingt-cinq secondes, puis la page redemande la suite : la charge est celle de la tranche qui vient de finir. Un pas déjà au cache n’est pas réajusté.",
  },
} satisfies Record<string, HelpCopy>
