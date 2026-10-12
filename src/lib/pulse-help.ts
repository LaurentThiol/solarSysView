/**
 * Aide contextuelle de Pulse.
 * Chaque entrée est le texte du point d’exclamation.
 */

export type PulseHelpCopy = {
  title: string
  body: string
  items?: { label: string; text: string }[]
  wide?: boolean
}

const FAMILY_ITEMS = [
  {
    label: "Cycle simple",
    text: "Une période entre 2 tirages et la moitié de la fenêtre, sans dépasser 60. La phase se cale sur les sorties. Le rayon R doit atteindre 0,5 et 85 % du meilleur rayon. Si une période plus longue, multiple de celle-ci, concentre aussi bien les sorties, Pulse garde cette fondamentale. Ce cycle est calculé dans tous les cas : c’est la base des autres.",
  },
  {
    label: "Double cycle",
    text: "Produit du cycle principal et d’un second cycle, ni multiple ni diviseur du premier. Il remplace le cycle simple seulement si la concordance gagne au moins 5 points, et si ce gain dépasse celui de 16 mélanges des mêmes sorties.",
  },
  {
    label: "Rotation de paire",
    text: "Deux boules, ou deux étoiles, du même échantillon. Leurs périodes diffèrent d’au plus un tirage et restent fortes une fois ramenées à la période commune. Leurs phases sont distantes de 0,40 à 0,60 tour : presque opposées.",
  },
  {
    label: "Rotation de triplet",
    text: "Trois boules, ou trois étoiles, avec la même règle de période. Les trois phases sont espacées d’un tiers de tour, à 0,08 tour près.",
  },
] as const

const PRESET_ITEMS = [
  {
    label: "20 derniers tirages",
    text: "Les 20 tirages les plus récents du jour choisi. Une seule tranche. La période ne dépasse pas 10 tirages.",
  },
  {
    label: "50 derniers tirages",
    text: "Les 50 tirages les plus récents du jour choisi. Une seule tranche. La période ne dépasse pas 25 tirages.",
  },
  {
    label: "100 derniers tirages",
    text: "Les 100 tirages les plus récents du jour choisi. Une seule tranche. La période ne dépasse pas 50 tirages.",
  },
  {
    label: "200 derniers tirages",
    text: "Les 200 tirages les plus récents du jour choisi. La période est plafonnée à 60 tirages. La fenêtre est redécoupée en tranches.",
  },
  {
    label: "Année civile",
    text: "Année civile du dernier tirage chargé, du 1er janvier jusqu’à ce tirage. Redécoupée en tranches dès qu’elle compte au moins 40 tirages.",
  },
  {
    label: "Année n-1",
    text: "Année civile précédente, du 1er janvier au 31 décembre, comptée à partir du dernier tirage chargé. Redécoupée en tranches dès 40 tirages.",
  },
  {
    label: "Année n-2",
    text: "Année civile deux ans avant le dernier tirage chargé, du 1er janvier au 31 décembre. Redécoupée en tranches dès 40 tirages.",
  },
] as const

export const PULSE_HELP = {
  reglages: {
    title: "Générateurs et fenêtres",
    body: "Choix lus au lancement. Rien n’est calculé avant le bouton. Changer le jour, un générateur ou un échantillon laisse le résultat affiché : il faut relancer pour le remplacer.",
  },
  jour: {
    title: "Jour de tirage",
    body: "EuroMillions ne tire que le mardi et le vendredi. Le filtre s’applique avant l’échantillon : 20 derniers vendredis, ce sont 20 vendredis. L’horloge compte ces tirages, pas les jours du calendrier.",
    items: [
      {
        label: "Tous",
        text: "Mardi et vendredi ensemble, dans l’ordre des dates. Un pas de l’horloge, c’est un tirage.",
      },
      {
        label: "Mardi",
        text: "Seuls les tirages du mardi entrent dans les échantillons.",
      },
      {
        label: "Vendredi",
        text: "Seuls les tirages du vendredi entrent dans les échantillons.",
      },
      {
        label: "Synthèse",
        text: "Même mélange mardi et vendredi que Tous. Pulse ne sépare pas les deux soirs.",
      },
    ],
  },
  generateurs: {
    title: "Générateurs",
    body: "Familles d’ondes cherchées sur les présences : 1 si le numéro sort, 0 sinon. Au moins une famille reste cochée. Décocher Cycle simple ne l’ôte pas. Double cycle, rotation de paire et rotation de triplet ne s’ajoutent que s’ils sont cochés, et seulement s’ils passent leur seuil.",
    wide: true,
    items: FAMILY_ITEMS.map((item) => ({ label: item.label, text: item.text })),
  },
  echantillons: {
    title: "Échantillons",
    body: "Fenêtres sur lesquelles chaque numéro est syntonisé. Au moins un échantillon reste coché. Le jour choisi filtre avant le décompte. 200 tirages, l’année civile, l’année n−1 et l’année n−2, dès 40 tirages, sont relus par blocs de 40 glissés de 10, puis recollés tant que la période ne change pas et que la phase bouge de moins de 0,15 tour.",
    wide: true,
    items: PRESET_ITEMS.map((item) => ({ label: item.label, text: item.text })),
  },
  lancer: {
    title: "Lancer la syntonisation",
    body: "Calcule les 50 boules et les 12 étoiles sur chaque échantillon coché, avec les générateurs cochés. Le bouton reste inactif s’il manque un générateur ou un échantillon. Les tirages restent indépendants : le résultat décrit le tracé de l’archive, pas le tirage suivant.",
  },
  avertissement: {
    title: "Lecture du tracé",
    body: "Les tirages sont indépendants. Pulse décrit l’archive, pas le prochain tirage. Une période de 10 tirages vaut 0,1 cycle par tirage. L’horloge est l’index du tirage dans la fenêtre, pas le calendrier.",
  },
  concordance: {
    title: "Concordance",
    body: "Part des sorties qui tombent là où l’onde est positive, ramenée de 0 à 100 %. Cycle simple : le demi-tour du cosinus. Double cycle : le produit des deux cosinus. 0 % : une sortie sur deux seulement. 100 % : toutes. Sur la grille, la pastille prend la concordance la plus haute ; à égalité, la tranche la plus longue. La couleur suit ce taux, pâle près de 0 % et saturée près de 100 %.",
  },
  synthese: {
    title: "Synthèse",
    body: "Grille des 50 boules et des 12 étoiles après la syntonisation, puis la liste des fenêtres réellement lues. Un clic sur un numéro ouvre sa fiche.",
  },
  fiche: {
    title: "Fiche",
    body: "Tranches datées du numéro choisi, puis l’onde théorique et les sorties de la tranche affichée.",
  },
  groupes: {
    title: "Groupes",
    body: "Paires et triplets en rotation, au plus 24, du plus fort taux au plus faible. Boules avec boules, étoiles avec étoiles, et seulement dans un même échantillon. Il faut cocher la rotation voulue, puis relancer.",
  },
  boules: {
    title: "Boules",
    body: "Numéros 1 à 50. Le pourcentage est la concordance de la tranche la plus forte. Un clic ouvre la fiche sur cette tranche.",
  },
  etoiles: {
    title: "Étoiles",
    body: "Étoiles 1 à 12. Même lecture que les boules : concordance la plus forte, couleur de la pastille, puis fiche.",
  },
  fenetres: {
    title: "Fenêtres lues",
    body: "Pour chaque échantillon coché, le nombre de tirages retenus après le filtre du jour, et les dates du premier au dernier. Pulse ne prend pas de warmup : toute la fenêtre entre dans le calcul.",
  },
  numero: {
    title: "Numéro choisi",
    body: "Boule ou étoile ouverte depuis la synthèse. Le générateur, la période, la concordance, R et p sont ceux de la tranche retenue en tête.",
  },
  generateur: {
    title: "Générateur",
    body: "Famille retenue pour la tranche affichée en tête. Cycle simple : une seule période. Double cycle : cette période multipliée par une seconde. Sur une carte de groupe, Paire ou Triplet nomme la rotation.",
  },
  periode: {
    title: "Période",
    body: "Longueur du cycle, en tirages. Elle va de 2 à 60, et jamais au-delà de la moitié de la tranche. C’est la fondamentale : une harmonique plus courte est écartée quand la période longue concentre aussi bien les sorties.",
  },
  rayon: {
    title: "Rayon R",
    body: "Rayon de la moyenne des sorties placées sur le cercle de la période. 0 : elles sont éparpillées sur le tour. 1 : elles tombent toutes à la même phase. C’est ce rayon qui choisit la période.",
  },
  p: {
    title: "Valeur p",
    body: "exp(−n R²), avec n le nombre de sorties de la tranche. Il est petit quand les sorties se groupent en phase. Dans un groupe, p est la plus grande des p des membres : un pic porté par peu de sorties ne suffit pas. Ce n’est pas une chance sur le tirage suivant.",
  },
  liens: {
    title: "Groupes du numéro",
    body: "Identifiants des paires ou triplets qui contiennent ce numéro dans le résultat courant. Le détail est dans l’onglet Groupes.",
  },
  tranches: {
    title: "Tranches",
    body: "Découpage daté de l’échantillon. Une fenêtre courte reste d’un seul tenant. Les fenêtres longues sont recollées tant que la fondamentale tient et que la phase bouge de moins de 0,15 tour. Le bouton actif charge l’onde de cette tranche.",
    wide: true,
  },
  onde: {
    title: "Onde et sorties",
    body: "La tranche active, tirage par tirage. Le demi-cycle positif est la partie haute du trait : c’est elle que la concordance compte. Cycle simple : un cosinus. Double cycle : le produit des deux cosinus.",
    wide: true,
    items: [
      {
        label: "Sortie",
        text: "Barre à 1 si le numéro figure dans le tirage, à 0 sinon.",
      },
      {
        label: "Onde",
        text: "Trait entre −1 et +1. Au-dessus de 0, la sortie tombe dans le demi-cycle positif.",
      },
    ],
  },
  rotation: {
    title: "Rotation",
    body: "Période secondaire qui fait tourner les membres du groupe : une paire reste presque opposée, un triplet reste espacé d’un tiers de tour. Si elle ne gagne pas 5 points de concordance sur le cycle commun, la carte indique une rotation sur la période commune.",
  },
  phases: {
    title: "Phases",
    body: "Place de chaque membre sur le tour, de 0 à 1. 0 ouvre le cycle. L’ordre suit le tour. Un tiret : la phase n’a pas pu être lue.",
  },
  sorties: {
    title: "Sorties",
    body: "Nombre de tirages de la tranche où le numéro est sorti. Pour un groupe, c’est le plus petit de ces nombres parmi les membres.",
  },
} satisfies Record<string, PulseHelpCopy>
