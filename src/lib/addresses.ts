import { JEUX_JOURNAL_LABEL, JEUX_JOURNAL_TAB, foldGlossaryQuery } from "./copy.ts"
import { NAV_GROUPS } from "./nav.ts"
import { SCHEMA_DOCS } from "./schemas/parse.ts"

export const ADDRESS_KIND_LABELS = {
  page: "Page",
  onglet: "Onglet",
  api: "API",
  raccourci: "Raccourci",
} as const

export type AddressKind = keyof typeof ADDRESS_KIND_LABELS

export const ADDRESS_GROUP_LABELS = {
  archive: "Archive",
  lecture: "Lecture",
  grilles: "Grilles",
  assistants: "Assistants",
  systeme: "Système",
  raccourcis: "Raccourcis",
} as const

export type AddressGroupId = keyof typeof ADDRESS_GROUP_LABELS

export type AddressAction = "navigate" | "open" | "none"

export type AddressEntry = {
  id: string
  href: string
  label: string
  text: string
  kind: AddressKind
  group: AddressGroupId
  action: AddressAction
  method?: string
  params?: string
}

function pageFromNav(): AddressEntry[] {
  return NAV_GROUPS.flatMap((family) =>
    family.items.map((item) => ({
      id: `page:${item.href}`,
      href: item.href,
      label: item.label,
      text: item.help.body,
      kind: "page" as const,
      group: family.id,
      action: "navigate" as const,
    }))
  )
}

const HOME: AddressEntry = {
  id: "page:/",
  href: "/",
  label: "Accueil",
  text: "Redirige vers Tirage. C’est l’entrée du logiciel.",
  kind: "page",
  group: "archive",
  action: "navigate",
}

const ANALYSE_TABS: { id: string; label: string; text: string; params?: string }[] = [
  {
    id: "vue",
    label: "Vue",
    text: "Vue d’ensemble de la variable : stats, profil glissant, série et chandeliers.",
  },
  {
    id: "tendance",
    label: "Tendance",
    text: "ADX / DMI, Supertrend, PSAR, Aroon et structure de Dow.",
  },
  {
    id: "momentum",
    label: "Momentum",
    text: "RSI, MACD, stochastique, CCI et Williams %R. Oscillateurs, pas un pronostic.",
  },
  {
    id: "volatilite",
    label: "Volatilité",
    text: "Bollinger, Keltner, Donchian, ATR et squeezes.",
  },
  {
    id: "niveaux",
    label: "Niveaux",
    text: "Ichimoku, Fibonacci, pivots et supports / résistances.",
  },
  {
    id: "figures",
    label: "Figures",
    text: "Chandeliers japonais et figures chartistes (heuristique ZigZag).",
  },
  {
    id: "flux",
    label: "Flux",
    text: "OBV, ADL, MFI, VWAP transposés à l’activité des tirages (pas un volume de marché).",
  },
  {
    id: "moyennes",
    label: "Moyennes",
    text: "SMA, EMA, WMA, HMA et VWMA sur la période X.",
  },
  {
    id: "systeme",
    label: "Système",
    text: "Backtest Donchian + ADX, walk-forward et analogie de sizing. Squelette pédagogique.",
  },
  {
    id: "numeros",
    label: "Numéros",
    text: "Grille 1–50 : sorties, retard, IC Wilson, envoi vers Vue.",
  },
  {
    id: "parite",
    label: "Pair / impair",
    text: "Composition vs la loi hypergéométrique (25 pairs / 25 impairs).",
  },
  {
    id: "hasard",
    label: "Hasard",
    text: "χ², intervalles de Wilson, Monte-Carlo des records de fréquence et de retard.",
  },
  {
    id: "bayes",
    label: "Bayésien",
    text: "Prédictive beta-binomiale P(boule au prochain tirage), prior uniforme.",
  },
  {
    id: "dependence",
    label: "Dépendance",
    text: "Lift des paires, backtest « 5 plus chauds », nuage somme (X) × étendue (Y).",
  },
  {
    id: "jumeaux",
    label: "Jumeaux",
    text: "Portrait multi-axes et voisins en cosinus de z-scores. Ressemblance d’archive, pas un pronostic.",
    params: "query=YYYY-MM-DD, axes=sum,spread,…",
  },
]

const CYCLES_TABS: { id: string; label: string; text: string }[] = [
  {
    id: "registre",
    label: "Registre",
    text: "Canaux alignés sur la fenêtre : phase au dernier tirage, période en jours et en tirages.",
  },
  {
    id: "atlas",
    label: "Atlas",
    text: "Poids du réseau de sélection (VSN) : quels canaux la courbe utilise.",
  },
  {
    id: "attention",
    label: "Attention",
    text: "Ruban quantile walk-forward et attention repliée sur les phases.",
  },
  {
    id: "comparaison",
    label: "Comparaison",
    text: "Cosinus des signatures de deux courbes, canaux qui divergent.",
  },
  {
    id: "nuls",
    label: "Nuls",
    text: "Ablation des horloges contre remaniement, phases permutées et loi marginale.",
  },
]

const HARMO_TABS: { id: string; label: string; text: string }[] = [
  {
    id: "melange",
    label: "Mélange",
    text: "Trois dictionnaires sur la même série : raies fixes, crêtes à IF variable, continuum.",
  },
  {
    id: "reseau",
    label: "Réseau",
    text: "Peigne de raies verrouillé (calendrier, scan de f0, THD, Lomb-Scargle).",
  },
  {
    id: "mecanique",
    label: "Mécanique",
    text: "Enveloppe de Hilbert, spectre de modulation, order tracking tacholess.",
  },
  {
    id: "acoustique",
    label: "Acoustique",
    text: "Welch / multitaper et HPSS pour le continuum et les bosses larges.",
  },
  {
    id: "tf",
    label: "Temps-fréquence",
    text: "ShortTimeFFT : droites horizontales vs trajectoires obliques.",
  },
  {
    id: "tests",
    label: "Tests",
    text: "Pics et THD contre des tirages uniformes aux mêmes dates.",
  },
]

function tabEntry(
  href: string,
  label: string,
  text: string,
  group: AddressGroupId,
  params?: string
): AddressEntry {
  return {
    id: `onglet:${href}`,
    href,
    label,
    text,
    kind: "onglet",
    group,
    action: "navigate",
    params,
  }
}

function apiEntry(
  href: string,
  method: string,
  label: string,
  text: string,
  group: AddressGroupId,
  params?: string
): AddressEntry {
  const mutating = !/^\s*GET(\s|$)/i.test(method) || /POST|PATCH|DELETE|PUT/i.test(method)
  return {
    id: `api:${method}:${href}`,
    href,
    label,
    text,
    kind: "api",
    group,
    action: mutating ? "none" : "open",
    method,
    params,
  }
}

const OVERLAYS: AddressEntry[] = [
  tabEntry(
    "?glossaire=vocab",
    "Glossaire · Vocabulaire",
    "Termes figés pour tout Synchro. Même pastille que le bandeau (raccourci « l »).",
    "systeme",
    "glossaire=vocab|proba|memo|chartisme"
  ),
  tabEntry(
    "?glossaire=proba",
    "Glossaire · Probabilités",
    "Table officielle 5/50 + 2/12 (139 838 160 grilles). Indépendante de la fenêtre.",
    "lecture",
    "glossaire=proba"
  ),
  tabEntry(
    "?glossaire=memo",
    "Glossaire · Mémo",
    "Périodes d’indicateurs et biais (look-ahead, sur-optimisation, indépendance).",
    "lecture",
    "glossaire=memo"
  ),
  tabEntry(
    "?glossaire=chartisme",
    "Glossaire · Chartisme",
    "Chaque courbe lue et les 18 figures : gabarit d’école, signal et objectif. Alias glossaire=courbes|figures.",
    "lecture",
    "glossaire=chartisme|courbes|figures"
  ),
  tabEntry(
    "?adresse=1",
    "Adresse",
    "Cet annuaire : pages, onglets, overlays du bandeau, API et raccourcis.",
    "systeme",
    "adresse=1|true|oui"
  ),
]

const TABS: AddressEntry[] = [
  ...ANALYSE_TABS.map((tab) =>
    tabEntry(`/analyse?tab=${tab.id}`, `Analyse · ${tab.label}`, tab.text, "lecture", tab.params)
  ),
  ...OVERLAYS,
  tabEntry("/jeux?tab=solutions", "Jeux · Solutions", "Décompte exact des grilles 5+2 sous contraintes. Ce n’est pas un pronostic.", "grilles"),
  ...SCHEMA_DOCS.map((doc) =>
    tabEntry(`/schemas/pronostic/${doc.id}`, `Schémas · ${doc.label}`, doc.text, "systeme")
  ),
  tabEntry(
    "/pronostic?tab=historic",
    "Pronostic · Historique",
    "Notation des 100 derniers tirages, un par un. La marge d’erreur est annoncée à l’avance, ou choisie après les tirages notés ; la partie jouée la fige avant chaque tirage. Un comité de onze têtes propose une autre prévision, comparée à la moyenne. Lecture d’archive : la loi officielle reste uniforme.",
    "grilles",
    "tab=historic"
  ),
  tabEntry(
    `/jeux?tab=${JEUX_JOURNAL_TAB}`,
    `Jeux · ${JEUX_JOURNAL_LABEL}`,
    "Journal des grilles réellement jouées (histoJeux). Rang après synchro FDJ, test binomial vs 7,71 %.",
    "grilles"
  ),
  ...CYCLES_TABS.map((tab) =>
    tabEntry(`/cycles?tab=${tab.id}`, `Cycles · ${tab.label}`, tab.text, "lecture")
  ),
  ...HARMO_TABS.map((tab) =>
    tabEntry(`/harmo?tab=${tab.id}`, `Harmo · ${tab.label}`, tab.text, "lecture")
  ),
  tabEntry(
    "/next?tab=couple",
    "Next · Couple",
    "Schéma 3D des boules 1–50. Le poids d’un couple est la somme des co-sorties, du tirage le plus récent au plus ancien, sur 20, 50, 100, 200, l’année civile ou l’année n−1. Un clic dans Couples relie ce couple dans Chaque numéro.",
    "lecture",
    "tab=couple"
  ),
  tabEntry(
    "/ref?tab=lunaire",
    "Réf · Lunaire",
    "Mois synodique : âge, éclairement, quartiers et calendrier du mois.",
    "assistants",
    "tab=lunaire|solaire|autres"
  ),
  tabEntry(
    "/ref?tab=solaire",
    "Réf · Solaire",
    "Rotation de Carrington, cycle de Schwabe, catalogue GOES XRS ou éruptions via SunPy.",
    "assistants"
  ),
  tabEntry(
    "/ref?tab=autres",
    "Réf · Autres",
    "Année tropique et Chandler en phase locale. F10.7, Kp, cosmiques, ENSO et QBO restent des séries mesurées.",
    "assistants"
  ),
  tabEntry(
    "/ref?tab=synthese",
    "Réf · Synthèse",
    "Plan de deux phases. Couleur : total numéros, total étoiles, n1–n5, E1, E2. Fenêtres 20, 50, 100.",
    "assistants"
  ),
  tabEntry(
    "/analyse?tab=jumeaux&demo=1",
    "Démo Jumeaux",
    "Lance la visite guidée de l’onglet Jumeaux (pop-up Suivant / Annuler).",
    "lecture",
    "demo=1|true|oui|jumeaux|twins"
  ),
  tabEntry(
    "/brain?demo=1",
    "Démo Brain",
    "Visite guidée : fenêtre, épingles, table, discussion locale. Ollama d’abord.",
    "assistants",
    "demo=1|true|oui"
  ),
  tabEntry(
    "/brain/dictionnaire?demo=1",
    "Démo Dictionnaire",
    "Visite guidée de la boucle d'apprentissage sur une courbe fixe. Rien n'est enregistré.",
    "assistants",
    "demo=1"
  ),
  tabEntry(
    "/brain/specialistes?demo=1",
    "Démo Spécialistes",
    "Visite guidée de l’atelier : nom, cible, traits, entraînement. Jamais une grille 5+2.",
    "assistants",
    "demo=1|specialistes"
  ),
  tabEntry(
    "/brain/decision-tree",
    "decisionTree",
    "Seuils du flux. L’indépendance n’est que le nul, rejoué sur l’ordre détruit.",
    "assistants"
  ),
  tabEntry(
    "/brain/decision-tree?demo=1",
    "Démo decisionTree",
    "Visite guidée : question, lecture, verdict, arbre, suite.",
    "assistants",
    "demo=1"
  ),
  tabEntry(
    "/analyse?variable=sum&preset=last_100&x=20&jour=mardi",
    "Analyse · recette fenêtre",
    "Ouvre Analyse sur la somme des numéros, 100 derniers mardis, période X = 20.",
    "lecture",
    "variable, preset, x, n (boule ou étoile), jour=mardi|vendredi|synthese"
  ),
  tabEntry(
    "/chartisme?curve=sum&preset=last_100",
    "Chartisme · recette courbe",
    "Ouvre Chartisme sur la courbe somme, fenêtre des 100 derniers tirages.",
    "lecture",
    "curve (ex. sum, n1, delay:7), preset"
  ),
  tabEntry(
    "/harmo?tab=tf&variable=sum",
    "Harmo · recette STFT",
    "Ouvre Harmo sur Temps-fréquence, série somme.",
    "lecture",
    "tab, variable, n, preset, x"
  ),
]

const APIS: AddressEntry[] = [
  apiEntry("/api/draws", "GET", "Tirages", "Archive EuroMillions paginée (Neon, sinon fichier local).", "archive", "era=current|all, year, last, weekday=mardi|vendredi, q, limit, offset"),
  apiEntry("/api/draws/latest", "GET", "Dernier tirage", "Le tirage le plus récent et sa date.", "archive"),
  apiEntry("/api/stats", "GET", "Stats d’archive", "Totaux, couverture et résumés sur l’ère demandée.", "archive", "era=current|all"),
  apiEntry("/api/analysis/proba", "GET", "Probabilités officielles", "Tables combinatoires 5/50 + 2/12, indépendantes de la fenêtre.", "lecture"),
  apiEntry("/api/analysis/variables", "GET", "Série d’une variable", "Valeurs d’une grandeur (somme, retard…) sur une plage.", "lecture", "variable, n, from_date, to_date, era, weekday"),
  apiEntry("/api/analysis/ohlc", "GET", "OHLC", "Barres agrégées pour chandeliers / Heikin-Ashi / Renko.", "lecture", "from_date, to_date, era, weekday"),
  apiEntry("/api/analysis/ta", "GET", "Indicateurs techniques", "Pack TA (RSI, MACD, Ichimoku…) calculé côté API.", "lecture", "from_date, to_date, era, weekday"),
  apiEntry("/api/analysis/inference", "GET", "Hasard / χ²", "Adéquation et intervalles de Wilson sur la fenêtre.", "lecture", "from_date, to_date, era, weekday"),
  apiEntry("/api/analysis/montecarlo", "GET", "Monte-Carlo", "Records de fréquence et de retard sous tirages uniformes.", "lecture", "from_date, to_date, n, seed, era, weekday"),
  apiEntry("/api/analysis/bayes", "GET", "Bayésien", "Prédictive beta-binomiale par boule.", "lecture", "from_date, to_date, era, weekday"),
  apiEntry("/api/analysis/dependence", "GET", "Dépendance", "Lift des paires et nuage somme (X) × étendue (Y).", "lecture", "from_date, to_date, era, weekday"),
  apiEntry("/api/analysis/numbers", "GET", "Numéros", "Sorties, retards et IC Wilson pour la grille 1–50.", "lecture", "from_date, to_date, era, weekday"),
  apiEntry("/api/analysis/lab", "GET", "Laboratoire complet", "Rapport groupé du labo Analyse (plus long à calculer).", "lecture", "from_date, to_date, era, weekday"),
  apiEntry("/api/cycles/status", "GET", "Cycles · statut", "torch optionnel. Le registre répond sans lui.", "lecture"),
  apiEntry("/api/cycles/registry", "GET", "Cycles · registre", "Canaux Réf, Harmo, Chartisme et séries sur la fenêtre.", "lecture", "variable, n, preset, weekday"),
  apiEntry("/api/cycles/panel", "GET", "Cycles · panneau", "Cible, phases et occupation, une ligne par tirage.", "lecture", "variable, n, preset, weekday"),
  apiEntry("/api/cycles/fit", "POST", "Cycles · fit TFT", "Walk-forward, VSN, attention, ablation et nuls. Pas une grille.", "lecture", "variable, encoder, horizon, epochs"),
  apiEntry("/api/harmo/status", "GET", "Harmo · statut", "Dépendances Python (PyWavelets, ssqueezepy, librosa).", "lecture"),
  apiEntry("/api/harmo/spectrum", "GET", "Harmo · spectre", "Raies / Lomb-Scargle sur la série.", "lecture"),
  apiEntry("/api/harmo/welch", "GET", "Harmo · Welch", "Densité spectrale (Welch / multitaper).", "lecture"),
  apiEntry("/api/harmo/stft", "GET", "Harmo · STFT", "Temps-fréquence et synchrosqueezing optionnel.", "lecture"),
  apiEntry("/api/harmo/envelope", "GET", "Harmo · enveloppe", "Hilbert et spectre de modulation.", "lecture"),
  apiEntry("/api/harmo/orders", "GET", "Harmo · ordres", "Order tracking tacholess sur une crête.", "lecture"),
  apiEntry("/api/harmo/unmix", "GET", "Harmo · mélange", "Séparation raies / crêtes / continuum.", "lecture"),
  apiEntry("/api/harmo/null", "GET", "Harmo · null", "Pics et THD contre des tirages uniformes.", "lecture"),
  apiEntry("/api/morpho/status", "GET", "Morpho · statut", "Backend VLM / CLIP disponible.", "lecture"),
  apiEntry("/api/morpho/analyze", "POST", "Morpho · analyser", "Détecteurs géométriques sur un glyphe 5×10.", "lecture"),
  apiEntry("/api/morpho/glyphs", "GET", "Morpho · glyphes", "Liste des glyphes pour la fenêtre.", "lecture"),
  apiEntry("/api/morpho/neighbors", "POST", "Morpho · voisins", "kNN visuel CLIP (ou repli géométrique).", "lecture"),
  apiEntry("/api/morpho/anticipate", "GET", "Morpho · anticipation", "P(forme suivante | contexte) vs uniforme.", "lecture"),
  apiEntry("/api/morpho/rules", "GET · POST", "Morpho · règles", "Règles QUAND/ALORS : lister ou créer.", "lecture"),
  apiEntry("/api/morpho/rules/{id}", "DELETE", "Morpho · supprimer une règle", "Retire une règle nommée.", "lecture"),
  apiEntry("/api/morpho/firings", "GET", "Morpho · déclenchements", "Historique d’évaluation des règles.", "lecture"),
  apiEntry("/api/morpho/rules/evaluate", "POST", "Morpho · évaluer", "Applique les règles sur la fenêtre.", "lecture"),
  apiEntry("/api/morpho/svg", "GET", "Morpho · SVG", "Glyphe vectoriel d’un tirage.", "lecture"),
  apiEntry("/api/morpho/vlm/status", "GET", "Morpho · VLM statut", "Ollama / Moondream chargé ou non.", "lecture"),
  apiEntry("/api/morpho/vlm/load", "POST", "Morpho · charger VLM", "Charge le modèle vision local.", "lecture"),
  apiEntry("/api/morpho/vlm", "POST", "Morpho · interroger VLM", "Légende ou question sur un glyphe.", "lecture"),
  apiEntry("/api/chartisme/catalog", "GET", "Chartisme · catalogue", "18 figures de la table de référence.", "lecture"),
  apiEntry("/api/chartisme/status", "GET", "Chartisme · statut", "Export, modèles optionnels, auto-cycle.", "lecture"),
  apiEntry("/api/chartisme/curves", "GET", "Chartisme · courbes", "Les 142 courbes exportées de l’archive.", "lecture"),
  apiEntry("/api/chartisme/figures", "GET", "Chartisme · figures", "Lectures déjà détectées pour une courbe.", "lecture"),
  apiEntry("/api/chartisme/svg", "GET", "Chartisme · SVG", "Tracé vectoriel d’une fenêtre.", "lecture"),
  apiEntry(
    "/api/chartisme/detect",
    "POST",
    "Chartisme · détecter",
    "Balayage géométrique aux échelles demandées. Avec reference_sigma, nomme le sens de la fenêtre et découpe ses tronçons. reference_slope_sigma compare leurs coefficients directeurs.",
    "lecture",
  ),
  apiEntry("/api/chartisme/similar", "POST", "Chartisme · similaires", "Recherche par ressemblance dans le jour affiché (mardi, vendredi, ou l’archive mixte).", "lecture", "weekday=mardi|vendredi"),
  apiEntry("/api/chartisme/labels", "GET · POST", "Chartisme · étiquettes", "Atelier d’étiquetage : lister ou poser une classe.", "lecture"),
  apiEntry("/api/chartisme/labels/{id}", "DELETE", "Chartisme · supprimer une étiquette", "Retire une classe libre.", "lecture"),
  apiEntry("/api/chartisme/rules", "GET · POST", "Chartisme · règles", "Règles descriptives : lister ou créer.", "lecture"),
  apiEntry("/api/chartisme/rules/{id}", "DELETE", "Chartisme · supprimer une règle", "Retire une règle chartiste.", "lecture"),
  apiEntry("/api/chartisme/firings", "GET", "Chartisme · déclenchements", "Historique d’évaluation des règles.", "lecture"),
  apiEntry("/api/chartisme/rules/evaluate", "POST", "Chartisme · évaluer", "Applique les règles sur la fenêtre.", "lecture"),
  apiEntry("/api/chartisme/backtest", "GET", "Chartisme · rétro-test", "Écart des figures vs remaniements (hasard).", "lecture"),
  apiEntry("/api/chartisme/training", "GET", "Chartisme · réseaux", "Disponibilité svgformer / GNN et dernier rapport.", "lecture"),
  apiEntry("/api/grids", "GET · POST", "Modèles de grilles", "Bibliothèque Combinaisons (Neon, sinon session).", "grilles"),
  apiEntry("/api/grids/{id}", "PATCH · DELETE", "Un modèle de grille", "Renommer ou supprimer un modèle enregistré.", "grilles"),
  apiEntry("/api/plays", "GET · POST", "Journal des mises", "Consignations histoJeux (date mardi/vendredi).", "grilles"),
  apiEntry("/api/plays/{id}", "PATCH · DELETE", "Une consignation", "Corriger ou retirer une grille jouée.", "grilles"),
  apiEntry("/api/brain/status", "GET", "Brain · statut", "Ollama / cloud et état du carnet.", "assistants"),
  apiEntry("/api/brain/readings", "GET · POST", "Brain · carnet", "Fiches épinglées : lister ou consigner une lecture.", "assistants"),
  apiEntry("/api/brain/readings/{id}/notes", "POST", "Brain · note", "Ajouter une note à une lecture du carnet.", "assistants"),
  apiEntry("/api/brain/retrieve", "POST", "Brain · retrieve", "Recherche dans le carnet / la table épinglée.", "assistants"),
  apiEntry("/api/brain/analogs", "POST", "Brain · analogie", "Voisins (dont Jumeaux) pour une fiche.", "assistants"),
  apiEntry(
    "/api/pronostic/committee",
    "POST",
    "Comité pronostic",
    "Onze têtes et un global sur une fenêtre de 20 ou 50 tirages d’avant. Renvoie (μ, σ) pour mardi, vendredi et le mixte mardi + vendredi. La marge k est appliquée dans l’onglet.",
    "grilles",
    "lookback=20|50, draws"
  ),
  apiEntry("/api/brain/lexicon/cards", "GET · POST", "Dictionnaire · fiches", "Lister ou corriger une fiche de concept.", "assistants"),
  apiEntry("/api/brain/lexicon/read", "POST", "Dictionnaire · lecture", "Demande 20/50/100 sur les six champs, relecture et horloges Réf.", "assistants", "weekday, era"),
  apiEntry("/api/brain/lexicon/mode", "GET · POST", "Dictionnaire · automatique", "Interrupteur : une demande à chaque tirage nouveau.", "assistants"),
  apiEntry("/api/brain/lexicon/help", "POST", "Dictionnaire · aide", "Question au modèle local. Le cloud n'écrit une note que si escalate et cloud_note sont posés.", "assistants"),
  apiEntry("/api/brain/specialists", "GET · POST", "Spécialistes", "Réseaux par série : lister ou entraîner.", "assistants", "era, weekday"),
  apiEntry("/api/brain/specialists/features", "GET", "Spécialistes · traits", "Catalogue des descripteurs utilisables.", "assistants"),
  apiEntry("/api/brain/specialists/{slug}", "GET", "Un spécialiste", "Fiche, scores 20/50/100, prévision t+1.", "assistants"),
  apiEntry("/api/brain/specialists/{slug}/infer", "POST", "Spécialiste · inférer", "Calcule la prévision de série nommée.", "assistants", "era, weekday"),
  apiEntry("/api/brain/specialists/{slug}", "DELETE", "Spécialiste · supprimer", "Retire un réseau enregistré.", "assistants"),
  apiEntry("/api/brain/decision-tree/status", "GET", "decisionTree · statut", "scikit-learn, dtreeviz et dot.", "assistants"),
  apiEntry(
    "/api/brain/decision-tree/tableau",
    "POST",
    "decisionTree · tableau",
    "Image du tableau que la question fabrique, avant que l’arbre le coupe.",
    "assistants",
    "question, label, series, era, curves, weekday"
  ),
  apiEntry("/api/brain/decision-tree", "GET · POST", "decisionTree", "Journal des lectures, ou lance une lecture (renvoie une tâche).", "assistants", "question, era, weekday"),
  apiEntry("/api/brain/decision-tree/jobs/{id}", "GET · DELETE", "decisionTree · tâche", "Étape, remaniements k/N, ou annulation.", "assistants"),
  apiEntry("/api/brain/decision-tree/{slug}", "GET", "decisionTree · lecture", "Verdict, règles, dessin.", "assistants"),
  apiEntry("/api/brain/decision-tree/{slug}/predict", "POST", "decisionTree · cas", "Classe le dernier état du flux.", "assistants"),
  apiEntry("/api/brain/decision-tree/{slug}/draft", "POST", "decisionTree · brouillon", "Brouillon de spécialiste ou règle chartiste, non enregistré.", "assistants"),
  apiEntry("/api/ref/catalog", "GET", "Réf · catalogue", "Cycles physiques candidats, hors lunaire et solaire déjà calculés.", "assistants"),
  apiEntry("/api/ref/phases", "GET", "Réf · phases", "Cycles à phase locale et séries mesurées (sans horloge inventée).", "assistants"),
  apiEntry(
    "/api/ref/trace",
    "GET",
    "Réf · trace",
    "Phase d’un cycle et grandeurs du tirage sur 20, 50 ou 100 tirages.",
    "assistants",
    "cycle, window=20|50|100"
  ),
  apiEntry(
    "/api/ref/plane",
    "GET",
    "Réf · plan",
    "Deux phases en axes, totaux et rangs n1–n5 / E1 / E2 sur chaque point.",
    "assistants",
    "x, y, window=20|50|100"
  ),
  apiEntry("/api/ref/lunar", "GET", "Réf · lunaire", "Phase synodique, éclairement et mois civil pour une date UTC.", "assistants", "date=YYYY-MM-DD"),
  apiEntry("/api/ref/solar", "GET", "Réf · solaire", "Carrington, Schwabe et disponibilité de SunPy.", "assistants", "date=YYYY-MM-DD"),
  apiEntry(
    "/api/ref/solar/goes",
    "GET",
    "Réf · GOES",
    "Catalogue Fido (XRS ou éruptions HEK). SunPy requis. Ne télécharge pas le TimeSeries.",
    "assistants",
    "start, end, kind=xrs|flares"
  ),
  apiEntry("/api/ia/status", "GET", "IA · statut", "Fournisseurs Gemini / OpenAI / local visibles.", "assistants"),
  apiEntry("/api/ia/local", "GET", "IA · modèles locaux", "Liste Ollama (et options locales).", "assistants"),
  apiEntry("/api/ia/chat", "POST", "IA · conversation", "Lecture d’une capture (flux SSE possible).", "assistants"),
  apiEntry("/api/llm/usage", "GET · POST", "Usage LLM", "Compteurs de jetons / appels, surfaces Brain et IA.", "assistants"),
  apiEntry("/api/llm/ping", "POST", "Ping LLM", "Test de joignabilité d’un fournisseur.", "assistants"),
  apiEntry("/api/alive", "GET", "Liveness", "L’API Python répond, sans ping Neon.", "systeme"),
  apiEntry("/api/health", "GET", "Santé", "Neon, nombre de tirages, dernier tirage, fraîcheur.", "systeme"),
  apiEntry("/api/startup", "GET", "Démarrage UI", "Contrôles du bandeau (API, Neon, GitHub, LLM).", "systeme", "refresh=1"),
  apiEntry("/api/github", "GET · POST", "GitHub", "État du dépôt ; POST pour fetch / mise à jour.", "systeme", "refresh=1"),
  apiEntry("/api/admin", "GET · POST", "Admin", "Secrets, tests, git. POST enregistre un secret.", "systeme"),
  apiEntry("/api/admin/login", "POST", "Admin · login", "Session mot de passe (ADMIN_PASSWORD).", "systeme"),
  apiEntry("/api/admin/sync", "POST", "Admin · synchro FDJ", "Lance une synchro archive depuis l’UI Admin.", "systeme"),
  apiEntry("/api/admin/test", "POST", "Admin · test secret", "Vérifie Neon / API / un service.", "systeme"),
  apiEntry(
    "/api/admin/dependencies",
    "GET",
    "Admin · bibliothèques",
    "Tableau de bord du suivi npm, pip et GitHub Actions. refresh=1 relit les registres.",
    "systeme",
    "refresh=1"
  ),
  apiEntry("/api/sync", "POST", "Synchro FDJ", "Télécharge et upsert l’historique (API Python).", "systeme"),
  apiEntry("/api/sync/ensure", "POST", "Rattrapage FDJ", "N’ajoute que les tirages manquants récents.", "systeme"),
  apiEntry("/api/reload-env", "POST", "Recharger .env", "Relit les secrets et le pool Neon.", "systeme"),
  apiEntry("/api/check", "POST", "Contrôle services", "Ping groupé (utilisé par le lanceur / Admin).", "systeme"),
  apiEntry("/api/shutdown", "POST", "Arrêt local", "Stoppe API + UI. Uniquement depuis localhost.", "systeme"),
]

const SHORTCUTS: AddressEntry[] = [
  {
    id: "raccourci:g",
    href: "g",
    label: "Menu burger",
    text: "Ouvre ou ferme le menu des sections. Inactif dans un champ de saisie.",
    kind: "raccourci",
    group: "raccourcis",
    action: "none",
  },
  {
    id: "raccourci:?",
    href: "?",
    label: "Aide contextuelle",
    text: "Affiche ou masque les points d’exclamation sur les champs et boutons.",
    kind: "raccourci",
    group: "raccourcis",
    action: "none",
  },
  {
    id: "raccourci:c",
    href: "c",
    label: "Capture",
    text: "Paquet visuel + données de la fenêtre, à envoyer à IA ou exporter en PDF.",
    kind: "raccourci",
    group: "raccourcis",
    action: "none",
  },
  {
    id: "raccourci:l",
    href: "l",
    label: "Glossaire",
    text: "Ouvre ou ferme le glossaire du bandeau (Vocabulaire, Probabilités, Mémo, Chartisme).",
    kind: "raccourci",
    group: "raccourcis",
    action: "none",
  },
  {
    id: "raccourci:a",
    href: "a",
    label: "Adresse",
    text: "Ouvre cet annuaire depuis n’importe quelle page (même pastille que le bandeau).",
    kind: "raccourci",
    group: "raccourcis",
    action: "none",
  },
  {
    id: "raccourci:escape",
    href: "Escape",
    label: "Fermer",
    text: "Ferme le menu, le glossaire, l’annuaire, une capture ou une démo.",
    kind: "raccourci",
    group: "raccourcis",
    action: "none",
  },
]

export const ADDRESSES: AddressEntry[] = [...pageFromNav(), HOME, ...TABS, ...APIS, ...SHORTCUTS]

export const ANALYSE_ADDRESS_TAB_IDS = ANALYSE_TABS.map((tab) => tab.id)

export function addressCopyValue(entry: AddressEntry) {
  if (entry.kind === "raccourci") return entry.href
  if (entry.method) return `${entry.method} ${entry.href}`
  return entry.href
}

export function filterAddresses(
  query: string,
  kind: AddressKind | "all" = "all",
  entries: readonly AddressEntry[] = ADDRESSES
) {
  const needle = foldGlossaryQuery(query).trim()
  return entries.filter((entry) => {
    if (kind !== "all" && entry.kind !== kind) return false
    if (!needle) return true
    const hay = foldGlossaryQuery(
      [
        entry.label,
        entry.text,
        entry.href,
        entry.method ?? "",
        entry.params ?? "",
        ADDRESS_GROUP_LABELS[entry.group],
        ADDRESS_KIND_LABELS[entry.kind],
      ].join(" ")
    )
    return hay.includes(needle)
  })
}

export function groupedAddresses(entries: readonly AddressEntry[] = ADDRESSES) {
  const byGroup = new Map<AddressGroupId, AddressEntry[]>()
  for (const entry of entries) {
    const list = byGroup.get(entry.group) ?? []
    list.push(entry)
    byGroup.set(entry.group, list)
  }
  return (Object.keys(ADDRESS_GROUP_LABELS) as AddressGroupId[])
    .map((id) => ({
      id,
      label: ADDRESS_GROUP_LABELS[id],
      entries: byGroup.get(id) ?? [],
    }))
    .filter((group) => group.entries.length > 0)
}

export function addressMatchesLocation(
  entry: AddressEntry,
  pathname: string,
  search: string
) {
  if (entry.action !== "navigate") return false
  const overlayHref = entry.href.startsWith("?")
  const url = new URL(entry.href, "https://synchro.local")
  if (!overlayHref && url.pathname !== pathname) return false
  const current = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  for (const [key, value] of url.searchParams) {
    if ((current.get(key) ?? "") !== value) return false
  }
  if (!overlayHref && url.searchParams.size === 0 && current.has("tab") && entry.kind === "page") {
    return false
  }
  return true
}
