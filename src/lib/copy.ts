export const FDJ_ARCHIVE_URL =
  "https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique"

export const WINDOW_TERM = "Fenêtre de travail"

export const ERA_LABELS = {
  current: "Formule actuelle (12 ★)",
  all: "Tout l’historique",
} as const

export type EraId = keyof typeof ERA_LABELS

export const BREAKOUT_FAKE_LABEL = "fausse cassure"

export const JEUX_JOURNAL_LABEL = "Journal"
export const JEUX_JOURNAL_TAB = "histoJeux"

export const TAB_LABELS: Record<string, string> = {
  vue: "Vue",
  tendance: "Tendance",
  momentum: "Momentum",
  volatilite: "Volatilité",
  niveaux: "Niveaux",
  figures: "Figures",
  flux: "Flux",
  moyennes: "Moyennes",
  systeme: "Système",
  numeros: "Numéros",
  parite: "Pair / impair",
  hasard: "Hasard",
  bayes: "Bayésien",
  dependence: "Dépendance",
  jumeaux: "Jumeaux",
  proba: "Probabilités",
  memo: "Mémo",
  adresse: "Adresse",
  solutions: "Solutions",
  histoJeux: JEUX_JOURNAL_LABEL,
  melange: "Mélange",
  reseau: "Réseau",
  mecanique: "Mécanique",
  acoustique: "Acoustique",
  tf: "Temps-fréquence",
  tests: "Tests",
  couple: "Couple",
  triple: "Triple",
  lunaire: "Lunaire",
  solaire: "Solaire",
  autres: "Autres",
  synthese: "Synthèse",
  specialists: "Spécialistes",
  specialistes: "Spécialistes",
}

export function tabLabel(tab: string | null | undefined): string | null {
  if (!tab) return null
  return TAB_LABELS[tab] ?? tab
}

export const GLOSSARY_GROUP_LABELS = {
  fenetre: "Fenêtre",
  analyse: "Analyse",
  grilles: "Grilles",
  lecture: "Lecture",
  assistants: "Assistants",
} as const

export type GlossaryGroupId = keyof typeof GLOSSARY_GROUP_LABELS

export type GlossaryEntry = {
  term: string
  text: string
  group: GlossaryGroupId
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Fenêtre de travail",
    group: "fenetre",
    text: "Jeu de tirages lu par les laboratoires. Les presets (20/50/100 tirages, année civile, année n-1, année n-2, formule actuelle…) sont les mêmes partout. Le filtre Jour (Tous / Mardi / Vendredi / Synthèse) s’applique avant la fenêtre : 20 derniers mardi = 20 mardis. En Chartisme, l’échelle (longueur d’une figure) est distincte : elle ne change pas la fenêtre.",
  },
  {
    term: "Jour de tirage",
    group: "fenetre",
    text: "EuroMillions ne tire que le mardi et le vendredi. Mardi ou Vendredi isole ce jour avant last_N et le warmup. Synthèse garde le jeu mixte et compare mardi, vendredi et combiné. Le choix voyage avec ?jour= et le menu burger.",
  },
  {
    term: "Période X",
    group: "fenetre",
    text: "Longueur des indicateurs (SMA, RSI, Bollinger…) dans Analyse. Ce n’est pas la plage calendaire : celle-ci se règle dans Fenêtre de travail.",
  },
  {
    term: "Warmup",
    group: "fenetre",
    text: "Tirages juste avant la fenêtre (défaut 52). Ils initialisent EMA, RSI, Ichimoku, sans entrer dans χ², Bayes ni le VWAP de fenêtre.",
  },
  {
    term: "Année civile",
    group: "fenetre",
    text: "Preset de fenêtre : du 1er janvier à aujourd’hui (ou à la fin de l’archive chargée).",
  },
  {
    term: "Année n-1",
    group: "fenetre",
    text: "Preset de fenêtre : l’année civile qui précède celle du dernier tirage, du 1er janvier au 31 décembre.",
  },
  {
    term: "Année n-2",
    group: "fenetre",
    text: "Preset de fenêtre : l’année civile deux ans avant celle du dernier tirage, du 1er janvier au 31 décembre.",
  },
  {
    term: "Annuel",
    group: "fenetre",
    text: "Onglet Évolution : barres horizontales de la somme des 5 numéros. Les années n, n−1 et n−2 sont en tête, côte à côte. Mardi et vendredi se sélectionnent sur le graphique ; sur Tous, les deux pastilles sont éteintes. Synthèse relie la somme de chaque tirage, mardi et vendredi, par un trait continu. Un segment de ce trait passe au vert sur n et sur n−1 quand les deux sommes vont dans le même sens, même soir, à trois jours près. Le taux de similitude est la part de ces segments appariés : n/n−1, puis n−1/n−2. Un écart nul compte comme un sens différent. Un soir sans vis-à-vis ne compte pas. Aucun soir allumé, le taux lit mardi et vendredi. Un soir seul, il ne lit que ce soir. Décalage compare des suites de 6 à 10 tirages (8 au départ), chaînes de sens, entre n et n−1 puis n−1 et n−2. Synthèse allumée, il suit le trait continu, même si une soirée est masquée. Il retient un écart de −21 à +21 jours quand la chaîne coïncide et que |r| dépasse l’alignement et le 95e centile d’un nul. Les mois descendent, un trait horizontal ferme chaque mois, un trait vertical marque 128. Δ compare les moyennes de mois affichées. Ce n’est pas la fenêtre « année civile » : les trois années restent entières. Lecture d’archive, pas un pronostic : r n’est pas une probabilité.",
  },
  {
    term: "Formule actuelle (12 ★)",
    group: "fenetre",
    text: "Tirages depuis le pool d’étoiles 1–12 (2016). « Tout l’historique » mélange aussi les anciennes formules (1–9 puis 1–11).",
  },
  {
    term: "Variable",
    group: "analyse",
    text: "Grandeur mesurée sur la fenêtre (somme, étendue, parité, présence, retard…). Tous les onglets Technique lisent la même variable.",
  },
  {
    term: "Indépendance des tirages",
    group: "analyse",
    text: "Chaque tirage EuroMillions est indépendant. SMA, RSI, figures et jumeaux décrivent l’archive observée, pas le prochain tirage.",
  },
  {
    term: "Probabilités officielles",
    group: "analyse",
    text: "Table des 13 rangs FDJ pour une grille 5/50 + 2/12 (139 838 160 grilles). Identique pour toute grille valide, indépendante de la fenêtre. P(au moins un rang) ≈ 7,71 %. Tables : Glossaire du bandeau · Probabilités (?glossaire=proba).",
  },
  {
    term: "Hypergéométrique",
    group: "analyse",
    text: "Loi d’une urne sans remise. Elle donne les rangs officiels 5/50 + 2/12 et la composition pair/impair attendue (25 pairs / 25 impairs). Distincte des fréquences observées dans la fenêtre.",
  },
  {
    term: "Intervalle de Wilson",
    group: "analyse",
    text: "Intervalle de confiance sur une proportion (sorties d’une boule, taux de rangs). Plus honnête que la normale près de 0 ou 1, et pour de petits n. Visible dans Numéros, Hasard et le journal Jeux.",
  },
  {
    term: "Look-ahead",
    group: "analyse",
    text: "Biais qui utilise une information pas encore connue au moment du signal (ex. Chikou / Ichimoku projeté). Ce n’est pas un signal temps réel. Détail : Glossaire du bandeau · Mémo (?glossaire=memo).",
  },
  {
    term: "Jumeaux",
    group: "analyse",
    text: "Onglet Analyse : portrait d’un tirage dans l’espace des variables (somme, étendue, parité…) et voisins en cosinus de z-scores. Démo guidée (bouton ou /analyse?tab=jumeaux&demo=1), pop-up Suivant / Annuler. Ressemblance d’archive, pas un pronostic.",
  },
  {
    term: "Enregistrer",
    group: "grilles",
    text: "Garder un modèle (grille Combinaisons, réseau Spécialistes, étiquette Chartisme, secret Admin). Distinct de Consigner.",
  },
  {
    term: "Consigner",
    group: "grilles",
    text: "Logger une grille réellement jouée dans le journal, pour un tirage mardi/vendredi. Après synchro FDJ, le rang s’affiche.",
  },
  {
    term: "Journal",
    group: "grilles",
    text: "Onglet Jeux des grilles jouées (histoJeux). Pas une bibliothèque de modèles : ce sont les mises réellement posées.",
  },
  {
    term: "Pronostic par couches",
    group: "grilles",
    text: "Atelier /pronostic : on réduit l’univers 5+2 par des couches (somme, parité des rangs n1–n5, espaces). Les couches se resserrent. Le nombre affiché est le volume restant, pas P(prochain tirage). Le proposeur lit 20/50/100/année ; un walk-forward mesure la couverture. L’onglet Historique note chaque tirage passé avec une marge annoncée à l’avance, et peut interroger un comité de réseaux.",
  },
  {
    term: "Historique pronostic",
    group: "grilles",
    text: "Onglet /pronostic?tab=historic. Chaque tirage des 100 derniers est noté avec une marge d’erreur (moyenne ± k·σ des tirages antérieurs). En manuel, la marge est annoncée à l’avance. En automatique, elle est choisie après les tirages notés ; la partie jouée la fige sur les seuls tirages d’avant. Le comité ajoute onze têtes, une porte sur au plus dix essais d’avant, et un global. σ est recalée pour qu’1 σ couvre environ deux tiers, et les rangs sont remis en ordre. Mardi, vendredi, et mardi + vendredi sont confrontés. La mise est le nombre de grilles 5+2 restantes. Ce n’est pas P(prochain tirage).",
  },
  {
    term: "Statistique d’ordre",
    group: "grilles",
    text: "n1 est le plus petit numéro du tirage, n5 le plus grand — jamais l’ordre de sortie, non publié. e1 / e2 pour les étoiles. Les espaces de Pronostic bornent ces rangs.",
  },
  {
    term: "Figure / détection",
    group: "lecture",
    text: "Forme chartiste repérée sur une courbe. Une fausse cassure (fake breakout) n’est pas confirmée par l’activité et la clôture.",
  },
  {
    term: "Bouncing",
    group: "lecture",
    text: "Onglet Évolution qui cherche, sur n1…n5 et e1, e2, des arches dont la hauteur décroît comme une balle qui s’amortit (restitution e). La dérivée se lit sur chaque flanc du sommet : positive et décroissante à la montée, négative et décroissante à la descente. Un flanc trop court ne montre que le signe. Des curseurs resserrent le nombre de rebonds, l’ajustement, la forme, la dérivée, l’amortissement et l’amplitude. Lecture du tracé sur la fenêtre, pas un pronostic.",
  },
  {
    term: "Gagnants EU",
    group: "lecture",
    text: "Colonne FDJ « en Europe » : tous les pays participants, France comprise. On n’additionne pas FR et EU. Hors FR = EU − FR. Visible dans Tirage et dans Évolution · gains. Mardi et vendredi n’ont pas les mêmes mises : le filtre jour les sépare.",
  },
  {
    term: "Longueur de report",
    group: "lecture",
    text: "Nombre de tirages consécutifs sans gagnant du jackpot. 0 le soir où quelqu’un gagne. Distinct du 0/+1 des boules, qui dit seulement s’il y a report.",
  },
  {
    term: "probaDynamic",
    group: "lecture",
    text: "Compteur d’observateur. Chaque tirage sans un numéro ajoute 1/50 ; chaque tirage sans une étoile ajoute 1/12. La sortie remet la case à zéro. Les échelles 50, 100, 200, année civile, n−1 et n−2 montrent la trajectoire. Le tri par compteur lit le bord droit des 50 derniers tirages. La carte pose un pas par tirage en abscisse, le compteur en hauteur, et range les cases en profondeur par le moindre écart avec les trois voisines du tirage précédent. Le trait 9/50 (numéro) et 5/12 (étoile) est l’écart moyen sous la loi uniforme. Ce n’est pas une chance de sortie.",
  },
  {
    term: "Comptage de boîtes",
    group: "lecture",
    text: "Deux lectures du relief probaDynamic. L’aire compare les triangles à une nappe plate. La rugosité mesure les écarts de compteur entre cases voisines : 0 si c’est lisse, 1 si c’est aussi rugueux que le pas. Le mélange redistribue les compteurs dans chaque tirage. La pente n’est citée que si elle tient. Ce n’est pas une chance de sortie.",
  },
  {
    term: "Conversation",
    group: "assistants",
    text: "Fil de l’onglet IA autour d’une capture. Distinct d’une figure chartiste et d’une entrée du carnet Brain.",
  },
  {
    term: "Capture",
    group: "assistants",
    text: "Paquet visuel + données de la fenêtre, envoyé à IA ou exporté en PDF. Bouton du bandeau, raccourci « c ».",
  },
  {
    term: "Prévision",
    group: "assistants",
    text: "Sortie t+1 d’un spécialiste Brain (parité, somme…). Ce n’est pas une grille 5+2. Le score vs hasard dit s’il bat le modèle nul. Le décompte d’archive suit le jour ; l’entraînement API reste l’ère formule, borné au même weekday si Mardi ou Vendredi est choisi.",
  },
  {
    term: "Score vs hasard",
    group: "assistants",
    text: "Score d’un spécialiste sur 20 / 50 / 100 tirages. Positif = mieux que le hasard / la persistance. ≤ 0 : on n’enregistre pas, sauf force.",
  },
  {
    term: "Cycle lunaire",
    group: "assistants",
    text: "Mois synodique moyen (~29,53 j) dans Réf. Âge, éclairement et quartiers pour une date UTC. Ce n’est pas un pronostic.",
  },
  {
    term: "Cycle solaire",
    group: "assistants",
    text: "Dans Réf : rotation de Carrington (~27,3 j), cycle de Schwabe (~11 ans, minima SILSO) et solstices d’été et d’hiver (hémisphère nord). Le flux X GOES et les éruptions passent par SunPy (Fido), en catalogue, sans télécharger le TimeSeries.",
  },
  {
    term: "Gini",
    group: "assistants",
    text: "Critère de coupure d’un arbre decisionTree. Il mesure le mélange des deux classes de part et d’autre d’un seuil. La recherche le compare à l’entropie sur l’apprentissage seul.",
  },
  {
    term: "Entropie",
    group: "assistants",
    text: "Autre critère de coupure, plus sensible aux classes rares. decisionTree le choisit, ou Gini, sans regarder le contrôle.",
  },
  {
    term: "Seuil",
    group: "assistants",
    text: "Valeur où le flux se coupe, juste avant le tirage t. Le dessin et la liste écrivent le même nombre, à deux décimales (162.50).",
  },
  {
    term: "Feuille",
    group: "assistants",
    text: "Bout d’un arbre : une classe, un effectif d’apprentissage et un effectif de contrôle. Le numéro est celui du dessin.",
  },
  {
    term: "Remaniement",
    group: "assistants",
    text: "Nul de decisionTree : on détruit l’ordre des tirages, puis on rejoue caractéristiques, étiquettes, recherche et score. Cela annule le retour à la moyenne des pas et des lags.",
  },
  {
    term: "p",
    group: "assistants",
    text: "Pour une lecture decisionTree : (1 + remaniements au moins aussi bons) / (1 + N). Le flux est reconnu si p ≤ 0,05. Le journal affiche aussi le p corrigé sur l’ère.",
  },
  {
    term: "Contrôle",
    group: "assistants",
    text: "Derniers tirages tenus hors de la recherche (100, ou 30 % si la série est courte). Ils notent le verdict et chaque feuille. Ils ne choisissent pas la profondeur.",
  },
  {
    term: "decisionTree",
    group: "assistants",
    text: "Assistant qui cherche un seuil sur le flux, juste avant le tirage t. Une ligne du tableau est l’état du flux (somme, rangs, retard d’une boule, figure). L’indépendance n’est que l’hypothèse nulle : on détruit l’ordre des tirages et on rejoue tout le calcul. Le dessin montre chaque coupure. La suite propose un spécialiste, des chances vers Jeux, ou une règle chartiste — rien n’est écrit tant que vous ne le demandez pas.",
  },
  {
    term: "Question de flux",
    group: "assistants",
    text: "Ce que decisionTree demande au tirage t. Flux : somme haute, parité ≥ 3 pairs, ou n1 bas, sur toutes les séries ou sur une seule. Boules : la boule sort-elle. Figures : l’objectif de la figure est-il atteint. Le mot « retard » est réservé au retard d’une boule ; un pas ou un lag ne s’appelle pas retard.",
  },
  {
    term: "Profondeur",
    group: "assistants",
    text: "Nombre maximal de coupures successives de l’arbre (2, 3 ou 4). La recherche la choisit par validation temporelle, dans l’apprentissage seul. Le contrôle ne sert pas à la choisir.",
  },
  {
    term: "Apprentissage",
    group: "assistants",
    text: "Tirages sur lesquels l’arbre est cherché et dessiné. Les histogrammes de dtreeviz montrent cet apprentissage. Le contrôle, tenu à part, note ensuite chaque feuille.",
  },
  {
    term: "p corrigé",
    group: "assistants",
    text: "p de decisionTree revu par Benjamini–Hochberg sur toutes les lectures de la même ère, y compris les verdicts sans seuil. Une démonstration doit encore tenir après cette correction.",
  },
  {
    term: "Chemin",
    group: "assistants",
    text: "Suite de coupures de la racine jusqu’à une feuille. « Chemin seul » ne garde que les branches du prochain tirage. Le numéro de feuille est le même dans le dessin et dans la liste.",
  },
]

export function foldGlossaryQuery(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

export function filterGlossary(query: string, entries: readonly GlossaryEntry[] = GLOSSARY) {
  const needle = foldGlossaryQuery(query).trim()
  if (!needle) return [...entries]
  return entries.filter((entry) => {
    const hay = foldGlossaryQuery(
      `${entry.term} ${entry.text} ${GLOSSARY_GROUP_LABELS[entry.group]}`
    )
    return hay.includes(needle)
  })
}

export function groupedGlossary(entries: readonly GlossaryEntry[] = GLOSSARY) {
  const byGroup = new Map<GlossaryGroupId, GlossaryEntry[]>()
  for (const entry of entries) {
    const list = byGroup.get(entry.group) ?? []
    list.push(entry)
    byGroup.set(entry.group, list)
  }
  return (Object.keys(GLOSSARY_GROUP_LABELS) as GlossaryGroupId[])
    .map((id) => ({
      id,
      label: GLOSSARY_GROUP_LABELS[id],
      entries: byGroup.get(id) ?? [],
    }))
    .filter((group) => group.entries.length > 0)
}
