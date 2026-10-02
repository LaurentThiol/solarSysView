/**
 * Aide des champs de l’onglet Next · pronosticNext.
 * Séparée de l’aide Couple : celle-ci décrit des chances de grille.
 */

import type { NextHelpCopy } from "@/lib/next/help"

export const PRONOSTIC_NEXT_HELP = {
  tab: {
    title: "pronosticNext",
    body: "Curseurs sur le total, le nombre de pairs, les décennies et n1 à n5. Un champ laissé au bout de l’échelle est OFF et ne filtre pas. Les solutions reçoivent une chance lue sur 20, 50, 100 et 200 tirages, du plus récent au plus ancien, avec les couples et les triples.",
  },
  jour: {
    title: "Jour de tirage",
    body: "Le jour est choisi avant les horizons. 50 derniers vendredis, ce sont 50 vendredis. Mardi, vendredi, tous et synthèse suivent le même filtre que Couple.",
  },
  total: {
    title: "Total",
    body: "Somme des cinq numéros. Le minimum théorique est 15 (1+2+3+4+5), le maximum 240 (46+47+48+49+50). Mini sur 15 et maxi sur 240 : le champ est OFF. Resserrer l’un des deux curseurs le rend actif.",
  },
  parity: {
    title: "Pairs / impairs",
    body: "Nombre de numéros pairs parmi les cinq. Les impairs complètent à 5. Les curseurs sur 0 et 5 : le champ est OFF. Une valeur 3 pairs signifie 2 impairs. La bande 2–4 accepte ces trois comptes.",
  },
  decade: {
    title: "Décennie",
    body: "Combien de numéros dans chaque bande de dix : 1–10, 11–20, 21–30, 31–40, 41–50. Mini 0 et maxi 5 : cette décennie est OFF. Une seule bande resserrée filtre déjà. Les cinq bandes OFF ensemble ne retirent aucune grille.",
  },
  slot: {
    title: "n1 à n5",
    body: "Valeur de chaque numéro déjà trié. n1 est le plus petit, n5 le plus grand. La borne théorique de nᵢ est [i , 50 − 5 + i]. Les deux curseurs sur ces bornes : le rang est OFF. Les cinq numéros restent distincts, donc n1 < n2 < n3 < n4 < n5.",
  },
  release: {
    title: "Relâcher",
    body: "Remet les curseurs du champ au bout de l’échelle. Le champ redevient OFF. Tout relâcher remet le total, les pairs, les cinq décennies et n1 à n5.",
  },
  horizons: {
    title: "Horizons reverse",
    body: "20, 50, 100 et 200 tirages les plus récents du jour choisi. Dans chaque horizon le dernier tirage pèse n et le plus ancien pèse 1. Si deux horizons voient exactement les mêmes tirages, le plus long n’est pas recompté dans la moyenne. L’astérisque signale cet échantillon déjà pris.",
  },
  chance: {
    title: "Chance de tirage",
    body: "Part de la grille parmi les solutions qui passent les curseurs actifs. Trois lectures sont moyennées, chacune en écart au tirage uniforme, lissée pour qu’une absence ne vaille pas zéro : les boules présentes, les couples sortis ensemble, les triples sortis ensemble. Les horizons distincts pèsent autant. × égal compare cette part à un partage égal des solutions. Le tirage FDJ, lui, reste uniforme sur les 2 118 760 grilles de cinq numéros.",
  },
  marginal: {
    title: "Chance d’un numéro",
    body: "Probabilité que la grille tirée selon ces chances contienne le numéro. La somme des cinquante valeurs vaut 5, puisqu’une grille a cinq numéros. Sans écart d’archive, chaque numéro vaut 10 %.",
  },
  parts: {
    title: "Boules, couples, triples",
    body: "Écart logarithmique à la loi uniforme, après moyenne des horizons retenus. Positif : la grille ressemble aux sorties récentes plus que le hasard. Négatif : elle s’en écarte. La chance mélange les trois à parts égales.",
  },
} satisfies Record<string, NextHelpCopy>
