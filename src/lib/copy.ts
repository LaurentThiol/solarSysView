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
    text: "Jeu de tirages lu par les laboratoires. Les presets (20/50/100 tirages, année civile, année n-1, formule actuelle…) sont les mêmes partout. En Chartisme, l’échelle (longueur d’une figure) est distincte : elle ne change pas la fenêtre.",
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
    text: "Table des 13 rangs FDJ pour une grille 5/50 + 2/12 (139 838 160 grilles). Identique pour toute grille valide, indépendante de la fenêtre. P(au moins un rang) ≈ 7,71 %. Tables : Analyse · Glossaire · Probabilités.",
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
    text: "Biais qui utilise une information pas encore connue au moment du signal (ex. Chikou / Ichimoku projeté). Ce n’est pas un signal temps réel. Détail : Analyse · Glossaire · Mémo.",
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
    term: "Figure / détection",
    group: "lecture",
    text: "Forme chartiste repérée sur une courbe. Une fausse cassure (fake breakout) n’est pas confirmée par l’activité et la clôture.",
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
    text: "Sortie t+1 d’un spécialiste Brain (parité, somme…). Ce n’est pas une grille 5+2. Le score vs hasard dit s’il bat le modèle nul.",
  },
  {
    term: "Score vs hasard",
    group: "assistants",
    text: "Score d’un spécialiste sur 20 / 50 / 100 tirages. Positif = mieux que le hasard / la persistance. ≤ 0 : on n’enregistre pas, sauf force.",
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
