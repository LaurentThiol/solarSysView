/**
 * Aide et phrase de survol de probaDynamic.
 */

import type { HelpCopy } from "@/components/help"
import { formatFr } from "@/lib/frequency-board"
import type { ProbaKind } from "@/lib/proba-dynamic"
import type { MapPlacement } from "@/lib/proba-map"

function formatChargeDate(isoDate: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDate.slice(0, 10)}T12:00:00`))
}

export const PROBA_DYNAMIC_HELP = {
  regle: {
    title: "Compteur",
    body: "Chaque tirage sans le numéro ajoute 1/50. Chaque tirage sans l’étoile ajoute 1/12. La colonne où la boule sort vaut 0. Le calcul garde la mémoire d’avant l’échelle, sinon une boule absente serait plafonnée à la longueur de la fenêtre.",
  },
  echelles: {
    title: "Échelles",
    body: "50, 100, 200, l’année civile, l’année n−1 et l’année n−2 montrent la même dent de scie sur des longueurs différentes. Le bord droit des échelles qui finissent au même tirage est le même nombre : ce qui change, c’est le chemin.",
  },
  tri: {
    title: "Tri",
    body: "Dizaines et unités rangent les boules par groupe, dans l’ordre du numéro. Le compteur croissant ou décroissant lit la valeur au bord droit des 50 derniers tirages, numéros entre eux et étoiles entre elles. À égalité, le plus petit numéro passe devant. La carte remplace les matrices par un relief.",
  },
  carte: {
    title: "Carte",
    body: "Les tirages se suivent en abscisse, un pas par tirage, sans les vides du calendrier. La hauteur est le compteur, non lissé. Les cases en profondeur ne sont pas attachées à une boule. Au premier tirage elles vont du plus petit compteur au plus grand. Ensuite Pose choisit la règle. À égalité, le plus petit numéro gagne.",
  },
  pose: {
    title: "Pose",
    body: "Somme minimise la somme des écarts aux voisines du tirage d’avant, trois au milieu et deux au bord : le bord est moins cher et peut recevoir un compteur trop bas. Moyenne divise cet écart par le nombre de voisines, le bord pèse comme le milieu, et le numéro épinglé reste suivi. Brut retrie chaque colonne par compteur, sans voisines : les zéros devant, le maximum au fond, et la trace épinglée saute de case. La hauteur reste le compteur, non lissé.",
  },
  echelle: {
    title: "Échelle de la carte",
    body: "Tout lit l’archive filtrée par le jour. 50, 100, 200, l’année, n−1 et n−2 reprennent les mêmes fenêtres que les matrices, mémoire d’avant comprise.",
  },
  bande: {
    title: "Bande",
    body: "Numéros : 50 cases, pas de 1/50, trait 9/50. Étoiles : 12 cases, pas de 1/12, trait 5/12. Une échelle qui mélange deux pools d’étoiles ne dessine pas les étoiles.",
  },
  plancher: {
    title: "Plancher",
    body: "Hauteur du plan translucide, en absences. 9 est l’écart moyen d’un numéro, 5 celui d’une étoile. Le curseur déplace ce repère sur le relief et sur la dent de scie. À fond à droite, le plan disparaît. Il ne change pas le compteur.",
  },
  curseur: {
    title: "Curseur",
    body: "Choisit un numéro de 1 à 50, ou une étoile de 1 à 12. Le pas est une boule, plus fin qu’un clic sur le relief. Auto avance d’une boule à la suivante et reprend à 1 après la dernière.",
  },
  dizaines: {
    title: "Dizaines",
    body: "Numéros par groupes 1–10, 11–20, 21–30, 31–40, 41–50. Les étoiles se coupent en 1–10, puis 11–12.",
  },
  unites: {
    title: "Unités",
    body: "Groupes du chiffre des unités, de 1 à 9, puis 0. L’étoile 11 suit le 1, l’étoile 12 suit le 2, l’étoile 10 ferme le groupe 0.",
  },
  compteur: {
    title: "Compteur",
    body: "Croissant ou décroissant sur le retard des 50 derniers tirages, divisé par 50 pour un numéro et par 12 pour une étoile. Les six échelles gardent ce même ordre.",
  },
  numeros: {
    title: "Numéros",
    body: "Bande 1–50. La couleur monte de 0 à 1. Le trait de loi est 9/50 : l’écart moyen quand 5 numéros sortent sur 50. Au-delà de 1, cinquante absences, la case passe au rouge.",
  },
  etoiles: {
    title: "Étoiles",
    body: "Bande 1–12, pas de 1/12. Le trait de loi est 5/12 : l’écart moyen quand 2 étoiles sortent sur 12. Seuls les tirages du pool 12 ★ entrent dans la mémoire. Une échelle qui mélange deux pools ne dessine pas les étoiles.",
  },
  dent: {
    title: "Dent de scie",
    body: "Un clic épingle la boule. Le curseur fait la même chose, de une en une. Chaque échelle trace alors son compteur, de l’ancien tirage au plus récent, avec le trait de l’écart moyen. Sur la carte, la dent de scie brute de la boule épinglée est tracée sous le relief. Un second clic retire l’épingle.",
  },
  jour: {
    title: "Jour",
    body: "Mardi ou Vendredi ne compte que ce jour : chaque tirage retenu ajoute 1/50 ou 1/12. Tous et Synthèse lisent le même fil mélangé. Le compteur n’a pas de colonne mardi et vendredi séparée.",
  },
} as const satisfies Record<string, HelpCopy>

export function chargePhrase(input: {
  kind: ProbaKind
  value: number
  date: string
  charge: number
  delay: number
  rarity: number
  censored: boolean
  windowFloor: number
}) {
  const noun = input.kind === "number" ? "Numéro" : "Étoile"
  const absence =
    input.delay === 0
      ? "vient de sortir"
      : `retard ${input.delay} tirage${input.delay > 1 ? "s" : ""} · loi ${formatFr(input.rarity * 100, 1)} %`
  const base = `${noun} ${input.value} · ${formatChargeDate(input.date)} · compteur ${formatFr(input.charge, 2)} · ${absence}`
  if (!input.censored) return base
  return `${base} · la fenêtre seule dit au moins ${formatFr(input.windowFloor, 2)}`
}

export function mapPhrase(input: {
  kind: ProbaKind
  ball: number
  date: string
  slot: number
  slots: number
  charge: number
  cost: number
  neighbors: readonly number[]
  placement?: MapPlacement
}) {
  const noun = input.kind === "number" ? "Numéro" : "Étoile"
  const head = `${formatChargeDate(input.date)} · case ${input.slot + 1}/${input.slots} · ${noun} ${input.ball} · compteur ${formatFr(input.charge, 2)}`
  if (input.placement === "brut") return `${head} · colonne rangée par compteur, sans voisines`
  if (input.neighbors.length === 0) return `${head} · premier tirage, cases rangées par compteur`
  const refs = input.neighbors.map((value) => formatFr(value, 2)).join(", ")
  const gap = input.placement === "moyenne" ? "écart moyen" : "écart"
  return `${head} · voisines ${refs} · ${gap} ${formatFr(input.cost, 2)}`
}
