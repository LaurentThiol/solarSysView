/**
 * Aide contextuelle des champs de l’onglet Next · Couple.
 * Chaque entrée est le texte du point d’exclamation.
 */

import { COUPLE_EDGE_LIMIT } from "./couple.ts"
import { MIN_COUNT_HELP } from "./min-count.ts"

export type NextHelpCopy = {
  title: string
  body: string
  items?: { label: string; text: string }[]
  wide?: boolean
}

export const NEXT_FIELD_HELP = {
  tab: {
    title: "Couple",
    body: "Place les boules 1–50 selon le poids de leurs co-sorties dans la fenêtre, lu du tirage le plus récent au plus ancien.",
  },
  jour: {
    title: "Jour de tirage",
    body: "EuroMillions ne tire que le mardi et le vendredi. Le filtre s’applique avant l’espace : 50 derniers vendredis, ce sont 50 vendredis. Changer de jour retire la boule choisie et le lien épinglé, couple ou triplet.",
    items: [
      {
        label: "Tous",
        text: "Mardi et vendredi ensemble, dans l’ordre des dates.",
      },
      {
        label: "Mardi",
        text: "Seuls les tirages du mardi entrent dans l’espace.",
      },
      {
        label: "Vendredi",
        text: "Seuls les tirages du vendredi entrent dans l’espace.",
      },
      {
        label: "Synthèse",
        text: "Même mélange mardi et vendredi que Tous.",
      },
    ],
  },
  space: {
    title: "Espace temporel",
    body: "La lecture commence par le tirage le plus récent de l’espace choisi. Changer d’espace retire la boule choisie et le lien épinglé, couple ou triplet.",
    items: [
      {
        label: "20",
        text: "Les 20 tirages les plus récents du jour choisi.",
      },
      {
        label: "50",
        text: "Les 50 tirages les plus récents du jour choisi.",
      },
      {
        label: "100",
        text: "Les 100 tirages les plus récents du jour choisi.",
      },
      {
        label: "200",
        text: "Les 200 tirages les plus récents du jour choisi.",
      },
      {
        label: "Année",
        text: "L’année civile du dernier tirage chargé, du 1er janvier au 31 décembre.",
      },
      {
        label: "Année n−1",
        text: "L’année civile précédente, comptée à partir du dernier tirage chargé.",
      },
    ],
  },
  summary: {
    title: "Fenêtre lue",
    body: "Nombre de tirages retenus, du plus récent vers le plus ancien, puis le nom de l’espace et la source. Neon lit la base en ligne. JSON local lit le fichier d’archive livré avec l’application.",
  },
  reading: {
    title: "Lecture à l’envers",
    body: "Rang 0 : tirage le plus récent de la fenêtre. « Il y a k tirages » compte les tirages plus récents que la dernière co-sortie. Les boules absentes de la fenêtre ne sont pas dessinées.",
  },
  absent: {
    title: "Boules absentes",
    body: "Numéros de 1 à 50 qui ne figurent dans aucun tirage de la fenêtre. Le volume ne les dessine pas.",
  },
  couples: {
    title: "Couples",
    body: "Paires de boules 1–50 sorties ensemble au moins une fois dans la fenêtre. Au départ, la liste va du plus fort poids au plus faible, puis du plus grand compte au plus petit. Un clic sur un en-tête trie cette colonne ; un second clic inverse le sens. Cliquer une ligne choisit la boule la plus petite, épingle le couple, et le relie dans Chaque numéro. Le sélecteur Compte, sous le titre, retire les sorties en dessous du seuil.",
  },
  observed: {
    title: "Couples observés",
    body: "Nombre de paires distinctes sorties ensemble au moins une fois. Quand le compte minimum en retire, le premier nombre est celui qui reste affiché, le second ce total. Une paire absente de ce total n’a aucune co-sortie dans la fenêtre.",
  },
  minCount: MIN_COUNT_HELP,
  pair: {
    title: "Couple",
    body: "Les deux numéros, du plus petit au plus grand. Le bouton de la ligne épingle ce couple : le volume relie ses deux boules, et Chaque numéro trace le lien à chaque co-sortie. Un clic sur l’en-tête range les couples du plus petit numéro au plus grand. Un second clic inverse.",
  },
  count: {
    title: "Compte",
    body: "Nombre de tirages de la fenêtre où les deux boules sortent ensemble. Chaque co-sortie compte 1, récente ou ancienne. Le premier clic sur l’en-tête met les plus grands comptes en haut. Un second clic inverse.",
  },
  weight: {
    title: "Poids",
    body: "Somme des poids des tirages où le couple sort. Le plus récent pèse n, le suivant n−1, le plus ancien pèse 1. À compte égal, une co-sortie récente donne un poids plus fort. Le premier clic sur l’en-tête met les plus forts poids en haut. Un second clic inverse. C’est l’ordre de départ.",
  },
  ago: {
    title: "Dernière co-sortie",
    body: "« Il y a k tirages » compte les tirages de la fenêtre plus récents que la dernière co-sortie. 0 : les deux boules sont dans le tirage le plus récent. Le premier clic sur l’en-tête met les co-sorties les plus récentes en haut. Un second clic met les plus anciennes en haut. Dans le détail d’une boule, les dates vont de la plus récente à la plus ancienne.",
  },
  ball: {
    title: "Boule choisie",
    body: "Boule cliquée dans le volume, ou première boule d’une ligne de la liste. Le détail donne ses partenaires, du plus fort poids au plus faible : compte, poids, ancienneté et dates de co-sortie.",
  },
  appearances: {
    title: "Sorties",
    body: "Nombre de tirages de la fenêtre où cette boule figure parmi les cinq numéros.",
  },
  clear: {
    title: "Effacer",
    body: "Retire la boule choisie et le couple épinglé. Le volume n’a plus de surbrillance.",
  },
  volume: {
    title: "Volume",
    body: `Schéma sur trois axes. Un trait joint un couple : les ${COUPLE_EDGE_LIMIT} plus forts poids sont dessinés, plus marqués quand le poids est grand. Glisser tourne la vue, la molette zoome. Un clic sans glisser choisit la boule sous le pointeur. Les boules absentes de la fenêtre ne sont pas dessinées.`,
  },
  frame: {
    title: "Recadrer",
    body: "Remet l’orientation et le zoom du volume à la vue de départ.",
  },
  stress: {
    title: "Stress",
    body: `Écart entre les distances du volume (3 axes) et les distances observées 1/(1+poids). 0 serait un dessin exact de cette matrice. Les ${COUPLE_EDGE_LIMIT} traits sont les couples de plus fort poids dans la fenêtre.`,
  },
} satisfies Record<string, NextHelpCopy>
