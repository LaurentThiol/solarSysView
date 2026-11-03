import type { ChampionRecord } from "./champion"

/**
 * Le dernier champion connu de la page : celui de la dernière course finie ici, sinon celui que Neon
 * (ou la copie du navigateur) a rendu à l’ouverture. Une lecture lente de Neon ne remplace jamais une course finie.
 */
export function lastKnownChampion(opened: ChampionRecord | null, lastFinished: ChampionRecord | null) {
  return lastFinished ?? opened
}

/**
 * Le parent que Lancer, Relancer, Exporter et « Tirage suivant » lisent, du plus proche au plus ancien :
 * le champion cliqué ou le fichier importé, celui de la course finie, le parent de la course en cours,
 * puis le dernier champion connu.
 * Sans le parent de la course en cours, Relancer retombait sur le champion lu à l’ouverture de la page et la lignée reculait.
 */
export function parentChampion(input: {
  imported: ChampionRecord | null
  finished: ChampionRecord | null
  running: ChampionRecord | null
  stored: ChampionRecord | null
}) {
  return input.imported ?? input.finished ?? input.running ?? input.stored
}

/** Clé d’une ligne de « Champions déjà écrits » : le numéro Neon quand il existe, sinon la place dans la liste. */
export function championKey(item: Pick<ChampionRecord, "id" | "generation" | "runner" | "savedAt">, position: number) {
  return `${item.id ?? `ligne-${position}`}-${item.generation}-${item.runner}-${item.savedAt}`
}
