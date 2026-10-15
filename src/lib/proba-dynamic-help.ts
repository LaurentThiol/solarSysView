/**
 * Aide et phrase de survol de probaDynamic.
 */

import type { HelpCopy } from "@/components/help"
import { formatFr } from "@/lib/frequency-board"
import type { ProbaKind } from "@/lib/proba-dynamic"

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
    body: "Dizaines et unités rangent les boules par groupe, dans l’ordre du numéro. Le compteur croissant ou décroissant lit la valeur au bord droit des 50 derniers tirages, numéros entre eux et étoiles entre elles. À égalité, le plus petit numéro passe devant.",
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
    body: "Un clic épingle la boule. Chaque échelle trace alors son compteur, de l’ancien tirage au plus récent, avec le trait de l’écart moyen. Un second clic retire l’épingle.",
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
