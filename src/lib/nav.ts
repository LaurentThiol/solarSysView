export type NavHelp = {
  title: string
  body: string
}

export type NavItem = {
  href: string
  label: string
  help: NavHelp
}

export type NavGroupId = "archive" | "lecture" | "grilles" | "assistants" | "systeme"

export type NavGroup = {
  id: NavGroupId
  label: string
  home: string
  help: NavHelp
  items: readonly NavItem[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "archive",
    label: "Archive",
    home: "/tirage",
    help: {
      title: "Archive",
      body: "Tirages officiels et leur évolution dans le temps.",
    },
    items: [
      {
        href: "/tirage",
        label: "Tirage",
        help: {
          title: "Tirage",
          body: "Archives EuroMillions : filtrer par mois, numéros ou jour (mardi / vendredi / synthèse), puis exporter en CSV.",
        },
      },
      {
        href: "/evolution",
        label: "Évolution",
        help: {
          title: "Évolution",
          body: "Courbes dans le temps, Annuel (somme des numéros sur n, n−1 et n−2, trait en fin de mois), gains FR/EU (log, jour mardi/vendredi/synthèse, report, masse empilée, dessin chartiste), suivi pair/impair, forme de la grille, classements. Accès protégé par mot de passe admin.",
        },
      },
    ],
  },
  {
    id: "lecture",
    label: "Lecture",
    home: "/analyse",
    help: {
      title: "Lecture",
      body: "Laboratoires qui décrivent l’archive : indicateurs, formes, relief, figures, harmoniques, cycles comparés, proximité des boules, compteurs d’observateur.",
    },
    items: [
      {
        href: "/analyse",
        label: "Analyse",
        help: {
          title: "Analyse",
          body: "Indicateurs, numéros, hasard, Jumeaux (empreintes + démo guidée). Probabilités et mémo sont dans le Glossaire du bandeau ; l’annuaire des chemins est dans Adresse. Tous les onglets lisent la même fenêtre de travail, y compris le filtre jour.",
        },
      },
      {
        href: "/morpho",
        label: "Morpho",
        help: {
          title: "Morpho",
          body: "Glyphes 5×10, lexique de formes, voisins visuels CLIP, VLM local, règles QUAND/ALORS et anticipation.",
        },
      },
      {
        href: "/relief",
        label: "Relief",
        help: {
          title: "Relief",
          body: "Une ligne n1→n5 par tirage. Boule ou point. Zoom plus serré à 100/200. Calque rangs dans le temps, surfaces optionnelles. Tiges masquables. Le glyphe 5×10 reste Morpho.",
        },
      },
      {
        href: "/chartisme",
        label: "Chartisme",
        help: {
          title: "Chartisme",
          body: "Figures chartistes sur les courbes du logiciel : détection, annotation dessinée, atelier d'étiquetage, règles descriptives et rétro-test contre le hasard. Ne touche pas aux grilles.",
        },
      },
      {
        href: "/cycles",
        label: "Cycles",
        help: {
          title: "Cycles",
          body: "Registre commun des horloges (Réf, Harmo, Chartisme, séries) et TFT d’interprétation : poids des variables, attention repliée, ablation. Compare les cycles d’un module à l’autre. Décrit l’archive, pas le prochain tirage.",
        },
      },
      {
        href: "/harmo",
        label: "Harmo",
        help: {
          title: "Harmo",
          body: "Étude harmonique des séries de tirages : mélange réseau / mécanique / acoustique, FFT, STFT, Hilbert. Unités en cycles/tirage et cycles/an. Le choix du jour (Tous, Mardi, Vendredi, Synthèse) reste sous le bandeau, comme Évolution. Décrit le tracé, pas le prochain tirage.",
        },
      },
      {
        href: "/pulse",
        label: "Pulse",
        help: {
          title: "Pulse",
          body: "Générateurs d’onde sur les présences des boules et des étoiles. Cycle simple, double cycle, rotation de paire ou de triplet. Périodes de 2 à 60 tirages, concordance et tranches datées. Décrit le tracé, pas le prochain tirage.",
        },
      },
      {
        href: "/probadynamic",
        label: "probaDynamic",
        help: {
          title: "probaDynamic",
          body: "Chaque tirage sans le numéro ajoute 1/50, sans l’étoile ajoute 1/12. La sortie remet ce compteur à zéro. Six échelles : 50, 100, 200, année civile, n−1, n−2. Tri par dizaines, par unités, ou par le compteur des 50 derniers. La carte aligne les tirages en abscisse, le compteur en hauteur, et 50 cases en profondeur selon le moindre écart avec les trois voisines du tirage précédent. Lecture d’archive : le tirage suivant reste uniforme.",
        },
      },
      {
        href: "/next",
        label: "Next",
        help: {
          title: "Next",
          body: "Lecture des tirages réalisés, du plus récent au plus ancien. Couple place les 50 boules selon le poids de leurs co-sorties ; Triple fait de même pour les triplets, trois boules du même tirage. Fenêtres : 20, 50, 100, 200, année civile, année n−1 ou année n−2. Le graphique Évolution dans le temps reprend la même base ; un clic dans Couples ou Triplets relie ce lien dans Chaque numéro. pronosticNext pose le total, les pairs, les décennies et n1–n5 : un champ sans borne reste OFF, puis donne la chance de chaque grille d’après ces lectures reverse, couples et triples compris.",
        },
      },
    ],
  },
  {
    id: "grilles",
    label: "Grilles",
    home: "/combinaisons",
    help: {
      title: "Grilles",
      body: "Composer des grilles 5+2, poser un pronostic par couches, compter les solutions, consigner les mises jouées.",
    },
    items: [
      {
        href: "/combinaisons",
        label: "Combinaisons",
        help: {
          title: "Combinaisons",
          body: "Composer, proposer et comparer des grilles EuroMillions. Enregistrer garde un modèle ; Consigner l’envoie dans le journal. Le score est une proba de gain, pas un pronostic.",
        },
      },
      {
        href: "/pronostic",
        label: "Pronostic",
        help: {
          title: "Pronostic",
          body: "Atelier : réduire l’univers 5+2 par couches et compter les solutions. Historique : noter chaque tirage passé avec une marge d’erreur, compter la mise en grilles, et comparer un comité de réseaux à la moyenne. Le tirage officiel reste uniforme.",
        },
      },
      {
        href: "/nextdata",
        label: "nextData",
        help: {
          title: "nextData",
          body: "Deux grilles 5+2 pour le prochain tirage, lues par LightGBM et par CatBoost. Trois ans apprend sur n, n−1 et n−2, avec un poids plus fort sur les 20, 50 ou 100 derniers. Fenêtre seule n’apprend que sur ces tirages. La base recompte les numéros, couples et triples sortis. Ce n’est pas une probabilité de gain FDJ.",
        },
      },
      {
        href: "/nextdatatraining",
        label: "nextDataTraining",
        help: {
          title: "nextDataTraining",
          body: "Même réglage que nextData, reculé de 1 à 10 tirages. À chaque cran, le modèle ne voit pas le tirage qu’il prévoit. La courbe est l’écart entre cette prévision et le tirage sorti, à côté de la persistance. Ce n’est pas un ticket.",
        },
      },
      {
        href: "/jeux",
        label: "Jeux",
        help: {
          title: "Jeux",
          body: "Solutions : compteur combinatoire (somme, parité, forme, chances). Journal : grilles jouées, relues contre le tirage FDJ, test binomial vs 7,71 %. Ce n’est pas un pronostic.",
        },
      },
    ],
  },
  {
    id: "assistants",
    label: "Assistants",
    home: "/brain",
    help: {
      title: "Assistants",
      body: "Brain lit les fiches épinglées. Le Dictionnaire tient les concepts confirmés à la main. Les Spécialistes publient une prévision de série nommée. decisionTree cherche un seuil de flux. runArcade dessine la pensée de chaque runner. IA lit une capture. Réf date des cycles physiques.",
    },
    items: [
      {
        href: "/brain",
        label: "Brain",
        help: {
          title: "Brain",
          body: "Épingle des noms (@rsi, @ete…) : Brain ne lit que ce qui est sur la table. Discussion en local (Ollama). Gemini / OpenAI seulement si vous le demandez. L’onglet IA reste la lecture de captures.",
        },
      },
      {
        href: "/brain/specialistes",
        label: "Spécialistes",
        help: {
          title: "Spécialistes",
          body: "Un petit réseau par série (parité, somme…). Entraîné sur l’ère formule, noté 20/50/100. Le décompte d’archive suit le jour ; l’entraînement API reste borné au même weekday si Mardi ou Vendredi est choisi. Jamais une grille 5+2. Démo guidée avec pastilles explicatives.",
        },
      },
      {
        href: "/brain/decision-tree",
        label: "decisionTree",
        help: {
          title: "decisionTree",
          body: "Le flux est le tableau montré avant la lecture : une ligne est l’état juste avant le tirage t. Un arbre cherche ensuite où ce tableau se coupe (somme, rangs, retards, figures). L’indépendance n’est que l’hypothèse nulle. On détruit l’ordre des tirages et on rejoue caractéristiques, étiquettes, recherche et score. Un seuil qui tient sur l’ordre réel et disparaît sur l’ordre détruit est un seuil de flux. S’il ne dépasse pas ce nul, aucun seuil n’est visible — ce n’est pas une conclusion d’indépendance. Le dessin montre chaque coupure. La suite mène vers un spécialiste, Jeux ou une règle chartiste, sans rien écrire en silence.",
        },
      },
      {
        href: "/brain/run-arcade",
        label: "runArcade",
        help: {
          title: "runArcade",
          body: "Chaque runner a son univers. Il lit gratuitement les années n−1 et n, s’entraîne Y minutes avec l’IA locale et Brave, puis court les tirages choisis, 25 au départ, une tranche d’horloge par tour. Il pense la somme, puis les rangs : le trait est la courbe fondamentale, la bande le masque, le vecteur est sa pensée, le point la case jouée. Tangente, cercle d’or, pas d’avant et vecteur restent en calques. Quand la série est longue, un curseur glisse vingt tirages le long du trait, calé au départ sur le bout. n1 à n5 ne se calent pas sur 10, 20, 30, 40 ou 50. La décennie du rail est celle des numéros joués. Le geste soir aligne mardi et vendredi, à quatre jours au plus. Le geste suite pose un pas X(n+1) = R×Xn×(1−Xn). R vaut 1, 1,5, 2, 2,8 ou 3,2. Une skill n’est gardée que si l’examen monte. Le logiciel date chaque observation et compte ses reconnaissances. Le solde classe la course. Le champion part dans Neon et ouvre la génération suivante. Rayons X, choisi avant le lancement, montre la préparation de chaque runner et le reçu de chaque tour.",
        },
      },
      {
        href: "/brain/dictionnaire",
        label: "Dictionnaire",
        help: {
          title: "Dictionnaire",
          body: "Fiches de concepts : vignette, équation, mots-clés, portée. Neuf sens de fenêtre sont semés depuis le code. Un brouillon du modèle local se confirme à la main. Lecture 20/50/100 et démo guidée.",
        },
      },
      {
        href: "/ref",
        label: "Réf",
        help: {
          title: "Réf",
          body: "Cycles physiques par sous-onglet, avec un nuage phase × tirage. Un trait vertical marque un solstice ou un équinoxe. Un losange marque un jackpot gagné (rang 1). La synthèse croise deux phases et colore le total, n1–n5 ou E1/E2 sur 20, 50 ou 100 tirages. Décrit une date, pas le prochain tirage.",
        },
      },
      {
        href: "/ia",
        label: "IA",
        help: {
          title: "IA",
          body: "Lecture d’une capture : visuel du laboratoire plus les données de la fenêtre. Gemini, OpenAI ou un modèle local, puis le modèle. Historique : renommer, épingler, exporter ou supprimer. Décrit l’archive, puis peut pronostiquer (hypothèse, pas une certitude).",
        },
      },
    ],
  },
  {
    id: "systeme",
    label: "Système",
    home: "/admin",
    help: {
      title: "Système",
      body: "Secrets, synchro FDJ, mises à jour, journal des modifications et schémas fonctionnels. Capture et Aide restent des outils du bandeau.",
    },
    items: [
      {
        href: "/admin",
        label: "Admin",
        help: {
          title: "Admin",
          body: "Secrets Neon / API, tests de connexion, suivi des LLM locaux, mises à jour GitHub, tableau de bord des bibliothèques et synchro FDJ → Postgres.",
        },
      },
      {
        href: "/schemas",
        label: "Schémas",
        help: {
          title: "Schémas",
          body: "Lecteur des schémas Mermaid versionnés dans docs/schemas. Texte éclairci, recherche dans les libellés, export PNG du cadre, liens en toutes lettres, zoom et plein écran.",
        },
      },
      {
        href: "/journal",
        label: "Journal",
        help: {
          title: "Journal",
          body: "Suivi des modifications de Synchro : synthèse des PR, timeline et recherche. Le texte se réécrit ici. Distinct du journal des mises, dans Jeux.",
        },
      },
    ],
  },
] as const

export function allNavItems(): NavItem[] {
  return NAV_GROUPS.flatMap((family) => [...family.items])
}

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/brain") return pathname === "/brain"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function navGroupForPath(pathname: string): NavGroup {
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => isNavItemActive(pathname, item.href))) return group
  }
  return NAV_GROUPS[0]
}

export function pageTitleForPath(pathname: string): string {
  return pageNavItem(pathname)?.label ?? "Synchro"
}

export function pageHelpForPath(pathname: string): NavHelp {
  return (
    pageNavItem(pathname)?.help ?? {
      title: "Synchro",
      body: "Archives EuroMillions FDJ. Le menu ouvre Tirage, les laboratoires, les grilles et les assistants.",
    }
  )
}

function pageNavItem(pathname: string): NavItem | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isNavItemActive(pathname, item.href)) return item
    }
  }
  return null
}
