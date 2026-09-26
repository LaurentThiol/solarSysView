/** Lien vers la fiche du symbole `monte:05`. */
export function ficheHref(symbol: string | null | undefined): string | null {
  if (!symbol || !symbol.includes(":")) return null
  const [sense, register] = symbol.split(":")
  if (!sense || !register) return null
  return `/brain/dictionnaire?fiche=sense.${sense}.${register}`
}
