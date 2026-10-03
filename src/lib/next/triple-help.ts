/**
 * Aide contextuelle des champs de l’onglet Next · Triple.
 * Chaque entrée est le texte du point d’exclamation.
 */

import { TRIPLE_EDGE_LIMIT } from "./triple.ts"

export type NextTripleHelpCopy = {
  title: string
  body: string
  items?: { label: string; text: string }[]
  wide?: boolean
}

export const NEXT_TRIPLE_FIELD_HELP = {
  tab: {
    title: "Triple",
    body: "Place les boules 1–50 selon le poids des triplets observés dans la fenêtre, lu du tirage le plus récent au plus ancien. Un triplet, ce sont trois boules sorties dans le même tirage.",
  },
  triples: {
    title: "Triplets",
    body: "Triplets de boules 1–50 sortis ensemble au moins une fois dans la fenêtre. Au départ, la liste va du plus fort poids au plus faible, puis du plus grand compte au plus petit. Un clic sur un en-tête trie cette colonne ; un second clic inverse le sens. Cliquer une ligne choisit la boule la plus petite, épingle le triplet, et le relie dans Chaque numéro.",
  },
  observed: {
    title: "Triplets observés",
    body: "Nombre de triplets distincts sortis ensemble au moins une fois. Un triplet absent de la liste n’a aucune co-sortie dans la fenêtre.",
  },
  trio: {
    title: "Triplet",
    body: "Les trois numéros, du plus petit au plus grand. Le bouton de la ligne épingle ce triplet : le volume relie ses trois boules, et Chaque numéro trace le lien à chaque co-sortie. Un clic sur l’en-tête range les triplets du plus petit numéro au plus grand. Un second clic inverse.",
  },
  count: {
    title: "Compte",
    body: "Nombre de tirages de la fenêtre où les trois boules sortent ensemble. Chaque co-sortie compte 1, récente ou ancienne. Le premier clic sur l’en-tête met les plus grands comptes en haut. Un second clic inverse.",
  },
  weight: {
    title: "Poids",
    body: "Somme des poids des tirages où le triplet sort. Le plus récent pèse n, le suivant n−1, le plus ancien pèse 1. À compte égal, une co-sortie récente donne un poids plus fort. Le premier clic sur l’en-tête met les plus forts poids en haut. Un second clic inverse. C’est l’ordre de départ.",
  },
  ago: {
    title: "Dernière co-sortie",
    body: "« Il y a k tirages » compte les tirages de la fenêtre plus récents que la dernière co-sortie des trois boules. 0 : les trois boules sont dans le tirage le plus récent. Le premier clic sur l’en-tête met les co-sorties les plus récentes en haut. Un second clic met les plus anciennes en haut. Dans le détail d’une boule, les dates vont de la plus récente à la plus ancienne.",
  },
  ball: {
    title: "Boule choisie",
    body: "Boule cliquée dans le volume, ou première boule d’une ligne de la liste. Le détail donne les triplets qui la contiennent, du plus fort poids au plus faible : compte, poids, ancienneté et dates de co-sortie.",
  },
  appearances: {
    title: "Sorties",
    body: "Nombre de tirages de la fenêtre où cette boule figure parmi les cinq numéros.",
  },
  clear: {
    title: "Effacer",
    body: "Retire la boule choisie et le triplet épinglé. Le volume n’a plus de surbrillance.",
  },
  volume: {
    title: "Volume",
    body: `Schéma sur trois axes. Un trait joint deux boules d’un triplet : les ${TRIPLE_EDGE_LIMIT} plus forts poids sont dessinés, plus marqués quand le poids est grand. Glisser tourne la vue, la molette zoome. Un clic sans glisser choisit la boule sous le pointeur. Les boules absentes de la fenêtre ne sont pas dessinées.`,
  },
  frame: {
    title: "Recadrer",
    body: "Remet l’orientation et le zoom du volume à la vue de départ.",
  },
  stress: {
    title: "Stress",
    body: `Écart entre les distances du volume (3 axes) et les distances observées. Entre deux boules, la distance vaut 1/(1+somme des poids des triplets qui les contiennent toutes les deux). 0 serait un dessin exact de cette matrice. Les ${TRIPLE_EDGE_LIMIT} triplets dessinés sont ceux de plus fort poids dans la fenêtre.`,
  },
} satisfies Record<string, NextTripleHelpCopy>
