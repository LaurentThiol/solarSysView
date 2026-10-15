import type { LabId } from "@/lib/capture/snapshot"

export function suggestionsFor(lab: LabId, tab?: string | null): string[] {
  if (lab === "analyse") {
    const extra =
      tab === "momentum"
        ? "RSI et MACD se contredisent-ils sur les derniers tirages de la fenêtre ?"
        : tab === "tendance"
          ? "ADX / Supertrend : tendance établie ou régime de range ?"
          : tab === "jumeaux"
            ? "Sur quels axes les jumeaux collent-ils, et que disent les deltas ? Ce n’est pas P(prochain tirage)."
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
      "Cette figure est-elle complète ? Que disent cassure, fausse cassure et taux de base ?",
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
    if (tab === "annuel") {
      return [
        "Compare les sommes des numéros de n, n−1 et n−2 : quels mois s’écartent de 128, et le Δ de moyenne dit-il autre chose qu’un mois court ?",
        "Le trait de fin de mois aligne-t-il les trois années, y compris en février ?",
        "Rappelle que chaque tirage est indépendant : une barre haute ne change pas la suivante.",
      ]
    }
    return [
      "Résume la courbe affichée : niveau, pente récente, SMA / Bollinger s’ils sont visibles, écarts n − n−1 (DeltaEvol) s’ils sont à l’écran, gains FR/EU (log, mardi/vendredi, longueur de report, masse empilée), pair/impair, forme (étendue, consécutifs, décennies).",
      "S’il y a une annotation chartiste : colle-t-elle à la courbe, ou est-ce une projection ? Compare au départ, à l’arrivée et à la lecture géométrique jointe.",
      "Ces extrêmes de retard ou de fréquence sont-ils remarquables sous l’hypothèse d’indépendance ?",
    ]
  }
  if (lab === "tirage") {
    return [
      "Que voit-on sur le filtre actuel (mois, numéros) ?",
      "Que peut-on en tirer comme pronostic d’évolution (hypothèse), au-delà de la lecture du tableau ?",
    ]
  }
  if (lab === "combinaisons") {
    return [
      "Explique le score affiché : loi officielle vs taux empirique sur la fenêtre.",
      "Les retards et totaux aident à choisir, ils ne changent pas P(rang). Confirme-le sur cette grille.",
    ]
  }
  if (lab === "jeux") {
    if (tab === "histoJeux") {
      return [
        "Décris le journal : tickets en attente vs tranchés, rangs obtenus, correspondances, spec Jeux s’il est là. Ce n’est pas un pronostic.",
        "Le test binomial vs 7,71 % dit si l’écart du journal au hasard est détectable. Un p petit décrit ce journal, pas le prochain tirage. Les copies et les grilles d’un même tirage ne sont pas des essais indépendants.",
      ]
    }
    return [
      "Combien de grilles restent, et quelles restrictions (somme, forme, décennies) ont le plus réduit l’univers ?",
      "Parmi les propositions de Combinaisons, combien survivent ici ? Sépare décompte et masse pondérée.",
    ]
  }
  if (lab === "pronostic") {
    return [
      "Combien de grilles restent après la cascade (somme → parité → espaces), et quelle couche a le plus réduit le volume ?",
      "Le proposeur (min/max±kσ vs percentiles) et le walk-forward : la couverture est-elle achetée par un univers encore trop large ?",
      "Rappelle que ce décompte est une hypothèse de lecture : P(rang) officiel ne change pas.",
    ]
  }
  if (lab === "morpho") {
    return [
      "Quelles formes géométriques sont visibles sur le glyphe, et que valent-elles statistiquement ?",
      "Sépare description du glyphe et anticipation P(forme suivante | contexte).",
    ]
  }
  if (lab === "probadynamic") {
    return [
      "Décris les dents de scie : quelles boules accumulent 1/50 ou 1/12, et lesquelles viennent d’être remises à zéro ?",
      "Sur la carte, les crêtes suivent-elles le moindre écart avec les trois voisines, ou seulement le rang du compteur ?",
      "Le bord droit des échelles 50, 100, 200 et de l’année est-il le même, et que change n−1 ou n−2 ?",
      "Rappelle que ce compteur décrit l’archive. Le tirage suivant reste uniforme.",
    ]
  }
  if (lab === "next") {
    return [
      "Décris le schéma : quelles boules sont proches parce qu’elles sont sorties ensemble récemment dans cette fenêtre ?",
      "Sur Triple, quels triplets portent le plus fort poids, et quelles trois boules le clic relie dans Chaque numéro ?",
      "Le poids suit la lecture du plus récent au plus ancien. Que change un autre espace (20, 50, 100, 200, année, année n−1) ?",
      "Rappelle que ces distances décrivent les tirages déjà réalisés de la fenêtre.",
      "pronosticNext : quelles grilles passent les curseurs actifs (total, pairs, décennies, n1–n5), et quelle chance reverse 20/50/100/200 — couples et triples — portent-elles ? Un champ OFF ne filtre pas.",
    ]
  }
  if (lab === "relief") {
    return [
      "Chaque ligne est un tirage : cinq points n1→n5, la hauteur est la valeur 1–50. Lis le profil du plus récent (halo or).",
      "Les marqueurs boule/point changent seulement la lisibilité (le point débouche 100 et 200 tirages).",
      "Le calque « rangs dans le temps » relie n1 à n1, n2 à n2… d’un tirage au suivant ; « Surfaces » remplit les facettes entre rangs voisins. C’est Évolution, pas une prédiction.",
      "Le décalage (temps, superposé, hexagone…) change-t-il le voisinage des profils, ou seulement l’esthétique ?",
      "Rappelle que ce n’est pas une prédiction : ce sont des sorties déjà tirées, posées en lignes de points.",
    ]
  }
  if (lab === "brain") {
    return [
      "Lis les fiches du working set (@rsi, @adx, @specialist.*) : que décrivent-elles, et quel pronostic d’évolution (hypothèse) portent-elles ?",
      "Cite la prévision d’un spécialiste s’il est sur la table (σ, score vs hasard 20/50/100). Une prévision de série nommée n’est pas une grille 5+2 : une 5+2, si vous en proposez une, est une hypothèse séparée.",
      "Démo : @rsi, @ete, @fft, @cluster et @score sont-ils sur la table, et que disent-ils sur cette fenêtre ?",
      "Démo Spécialistes : le formulaire Paire impair est-il cohérent (cible parité, features causales, consignes, score vs hasard) ?",
      "Quels handles du catalog manquent encore sur le plateau pour répondre ?",
      "Les souvenirs rappelés sont des lectures passées. Servez-vous-en pour un pronostic d’hypothèse, sans les prendre pour une série déjà prédite.",
    ]
  }
  return [
    "Explique ce que montre cet écran, à partir du visuel et des données jointes.",
    "Quels éléments techniques regarder en premier, et lesquels ignorer ?",
  ]
}

export const DEFAULT_QUESTION =
  "Explique ce que montre cet écran, à partir du visuel et des données jointes. Reste descriptif."
