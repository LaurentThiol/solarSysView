import type { LabId } from "@/lib/capture/snapshot"

export function suggestionsFor(lab: LabId, tab?: string | null): string[] {
  if (lab === "analyse") {
    const extra =
      tab === "momentum"
        ? "RSI et MACD se contredisent-ils sur les derniers tirages de la fenêtre ?"
        : tab === "tendance"
          ? "ADX / Supertrend : tendance établie ou régime de range ?"
          : null
    return [
      extra,
      "Explique ce que montrent les derniers indicateurs (RSI, MACD, ADX) sur cette fenêtre.",
      "Cette pente est-elle une tendance ou un artefact de petite fenêtre ?",
      "Quels indicateurs sont redondants ici, et lesquels se complètent ?",
    ].filter((item): item is string => Boolean(item))
  }
  if (lab === "chartisme") {
    return [
      "Cette figure est-elle complète ? Que disent cassure, fake breakout et taux de base ?",
      "Compare la confiance géométrique au taux de base mesuré sur cette échelle.",
      "Que signifie l’objectif projeté, et dans quels cas il ne s’applique pas ?",
    ]
  }
  if (lab === "harmo") {
    return [
      "Ce pic spectral est-il un artefact de fenêtre / de Nyquist, ou une raie lisible ?",
      "Traduis les unités (cycles/tirage, cycles/an) et le mélange réseau / mécanique / acoustique.",
      "Que changeraient une autre fenêtre FFT ou une série plus longue ?",
    ]
  }
  if (lab === "evolution") {
    return [
      "Résume la courbe affichée : niveau, pente récente, pair/impair, forme (étendue, consécutifs, décennies).",
      "Ces extrêmes de retard ou de fréquence sont-ils remarquables sous l’hypothèse d’indépendance ?",
    ]
  }
  if (lab === "tirage") {
    return [
      "Que voit-on sur le filtre actuel (mois, numéros) ?",
      "Comment lire ce tableau sans en faire un pronostic ?",
    ]
  }
  if (lab === "combinaisons") {
    return [
      "Explique le score affiché : loi officielle vs taux empirique sur la fenêtre.",
      "Les retards et totaux aident à choisir, ils ne changent pas P(rang). Confirme-le sur cette grille.",
    ]
  }
  if (lab === "jeux") {
    return [
      "Combien de grilles restent, et quelles restrictions (somme, forme, décennies) ont le plus réduit l’univers ?",
      "Parmi les propositions de Combinaisons, combien survivent ici ? Sépare décompte et masse pondérée.",
    ]
  }
  if (lab === "morpho") {
    return [
      "Quelles formes géométriques sont visibles sur le glyphe, et que valent-elles statistiquement ?",
      "Sépare description du glyphe et anticipation P(forme suivante | contexte).",
    ]
  }
  if (lab === "relief") {
    return [
      "Décris le relief : où sont les sommets, que code la couleur, et quel décalage a produit cette carte.",
      "Le mode de décalage (angle d’or, Hilbert, hexagone…) change-t-il la lecture, ou seulement l’esthétique ?",
      "Rappelle que la hauteur n’est pas une prédiction : ce sont des sorties déjà tirées, empilées.",
    ]
  }
  return [
    "Explique ce que montre cet écran, à partir du visuel et des données jointes.",
    "Quels éléments techniques regarder en premier, et lesquels ignorer ?",
  ]
}

export const DEFAULT_QUESTION =
  "Explique ce que montre cet écran, à partir du visuel et des données jointes. Reste descriptif."
