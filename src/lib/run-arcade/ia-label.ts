/** Bandeau : le modèle local appelé, puis l’état déjà dit par la ligne des services. */
export function iaUsedLabel(model: string | null | undefined, detail: string | null): string {
  if (!model) return "IA utilisée : pas encore d’appel."
  return detail ? `IA utilisée : ${model}. ${detail}` : `IA utilisée : ${model}.`
}
