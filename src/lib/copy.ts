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

export const GLOSSARY: { term: string; text: string }[] = [
  {
    term: "Fenêtre de travail",
    text: "Jeu de tirages lu par les laboratoires. Les presets (20/50/100 tirages, année civile, année n-1, formule actuelle…) sont les mêmes partout. En Chartisme, l’échelle (longueur d’une figure) est distincte : elle ne change pas la fenêtre.",
  },
  {
    term: "Enregistrer",
    text: "Garder un modèle (grille Combinaisons, réseau Spécialistes, étiquette Chartisme, secret Admin). Distinct de Consigner.",
  },
  {
    term: "Consigner",
    text: "Logger une grille réellement jouée dans le journal, pour un tirage mardi/vendredi. Après synchro FDJ, le rang s’affiche.",
  },
  {
    term: "Journal",
    text: "Onglet Jeux des grilles jouées (histoJeux). Pas une bibliothèque de modèles : ce sont les mises réellement posées.",
  },
  {
    term: "Figure / détection",
    text: "Forme chartiste repérée sur une courbe. Une fausse cassure (fake breakout) n’est pas confirmée par l’activité et la clôture.",
  },
  {
    term: "Conversation",
    text: "Fil de l’onglet IA autour d’une capture. Distinct d’une figure chartiste et d’une entrée du carnet Brain.",
  },
  {
    term: "Capture",
    text: "Paquet visuel + données de la fenêtre, envoyé à IA ou exporté en PDF. Bouton du bandeau, raccourci « c ».",
  },
  {
    term: "Prévision",
    text: "Sortie t+1 d’un spécialiste Brain (parité, somme…). Ce n’est pas une grille 5+2. Le score vs hasard dit s’il bat le modèle nul.",
  },
  {
    term: "Score vs hasard",
    text: "Score d’un spécialiste sur 20 / 50 / 100 tirages. Positif = mieux que le hasard / la persistance. ≤ 0 : on n’enregistre pas, sauf force.",
  },
  {
    term: "Année civile",
    text: "Preset de fenêtre : du 1er janvier à aujourd’hui (ou à la fin de l’archive chargée).",
  },
  {
    term: "Année n-1",
    text: "Preset de fenêtre : l’année civile qui précède celle du dernier tirage, du 1er janvier au 31 décembre.",
  },
  {
    term: "Formule actuelle (12 ★)",
    text: "Tirages depuis le pool d’étoiles 1–12 (2016). « Tout l’historique » mélange aussi les anciennes formules (1–9 puis 1–11).",
  },
  {
    term: "Jumeaux",
    text: "Onglet Analyse : portrait d’un tirage dans l’espace des variables (somme, étendue, parité…) et voisins en cosinus de z-scores. Démo guidée (bouton ou /analyse?tab=jumeaux&demo=1), pop-up Suivant / Annuler. Ressemblance d’archive, pas un pronostic.",
  },
  {
    term: "Gagnants EU",
    text: "Colonne FDJ « en Europe » : tous les pays participants, France comprise. On n’additionne pas FR et EU. Hors FR = EU − FR. Visible dans Tirage et dans Évolution · gains.",
  },
]
