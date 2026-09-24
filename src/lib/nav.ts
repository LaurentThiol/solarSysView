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
          body: "Courbes dans le temps, gains FR/EU (log, jour mardi/vendredi/synthèse, report, masse empilée, dessin chartiste), suivi pair/impair, forme de la grille, classements. Accès protégé par mot de passe admin.",
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
      body: "Laboratoires qui décrivent l’archive : indicateurs, formes, relief, figures, harmoniques.",
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
        href: "/harmo",
        label: "Harmo",
        help: {
          title: "Harmo",
          body: "Étude harmonique des séries de tirages : mélange réseau / mécanique / acoustique, FFT, STFT, Hilbert. Unités en cycles/tirage, pas des hertz. Le choix du jour (Tous, Mardi, Vendredi, Synthèse) reste sous le bandeau, comme Évolution. Décrit le tracé, pas le prochain tirage.",
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
      body: "Brain lit les fiches épinglées. Les Spécialistes publient une prévision de série nommée. IA lit une capture. Réf date des cycles physiques.",
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
        href: "/ref",
        label: "Réf",
        help: {
          title: "Réf",
          body: "Cycles physiques par sous-onglet, avec un nuage phase × tirage. La synthèse croise deux phases et colore le total, n1–n5 ou E1/E2 sur 20, 50 ou 100 tirages. Décrit une date, pas le prochain tirage.",
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
      body: "Secrets, synchro FDJ et mises à jour. Capture et Aide restent des outils du bandeau.",
    },
    items: [
      {
        href: "/admin",
        label: "Admin",
        help: {
          title: "Admin",
          body: "Secrets Neon / API, tests de connexion, suivi des LLM locaux, mises à jour GitHub et synchro FDJ → Postgres.",
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
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isNavItemActive(pathname, item.href)) return item.label
    }
  }
  return "Synchro"
}
