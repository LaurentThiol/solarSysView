import { nameSense, type CurveSense } from "@/lib/chartisme/sense"

export const DEMO_VALUES = Array.from({ length: 20 }, (_, index) => index)
export const DEMO_SIGMA = 8

export const DEMO_STEPS = [
  {
    id: "curve",
    label: "Courbe",
    hint: "0…19, σ habituel 8",
    target: "lex-curve",
    title: "Courbe fixe",
    body: "Vingt points, de 0 à 19. L'écart-type habituel est 8. Les dates affichées sont fictives.",
  },
  {
    id: "sense",
    label: "Sens",
    hint: "monte:05",
    target: "lex-sense",
    title: "Sens",
    body: "nameSense nomme monte:05 : la fenêtre monte, et le nuage tient dans la moitié de l'écart-type habituel.",
  },
  {
    id: "episode",
    label: "Épisode",
    hint: "dates fictives, issue ouverte",
    target: "lex-episode",
    title: "Épisode",
    body: "Du 1er au 20 janvier 2024, symbole monte:05. L'issue n'est pas encore écrite.",
  },
  {
    id: "card",
    label: "Fiche",
    hint: "brouillon",
    target: "lex-card",
    title: "Fiche",
    body: "Vignette, équation de la droite des deux bouts, mots-clés. Le statut est brouillon.",
  },
  {
    id: "scope",
    label: "Portée",
    hint: "fenêtre ≥ 16",
    target: "lex-scope",
    title: "Portée",
    body: "La fiche couvre une fenêtre d'au moins 16 tirages, rapportée au σ de toute la courbe. Elle laisse de côté le symbole de jambe.",
  },
  {
    id: "confirm",
    label: "Confirmer",
    hint: "dans le bac démo",
    target: "lex-confirm",
    title: "Confirmer",
    body: "Le bac démo passe la fiche en confirmée. Rien n'est écrit sur le disque.",
  },
  {
    id: "outcome",
    label: "Issue",
    hint: "horizon scripté",
    target: "lex-outcome",
    title: "Issue",
    body: "Un horizon scripté écrit reached : les points qui suivent continuent de monter.",
  },
  {
    id: "skill",
    label: "Skill",
    hint: "remaniement",
    target: "lex-skill",
    title: "Skill",
    body: "Le même calcul sur la série remaniée. Un score ≤ 0 veut dire que ce sens est courant une fois l'ordre mélangé.",
  },
  {
    id: "help",
    label: "Aide",
    hint: "texte déjà écrit, cloud décoché",
    target: "lex-help",
    title: "Aide",
    body: "La question locale est déjà écrite. La case cloud reste décochée : la démo ne l'envoie pas.",
  },
] as const

export type LexiconDemoStepId = (typeof DEMO_STEPS)[number]["id"]

export function demoSense(): CurveSense | null {
  return nameSense(DEMO_VALUES, DEMO_SIGMA)
}

export function demoSkill(n = 8): number | null {
  const named = demoSense()
  if (!named) return null
  let same = 0
  for (let round = 0; round < n; round += 1) {
    const shuffled = DEMO_VALUES.slice()
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = (index * 3 + round * 5) % (index + 1)
      const hold = shuffled[index]
      shuffled[index] = shuffled[swap]
      shuffled[swap] = hold
    }
    const other = nameSense(shuffled, DEMO_SIGMA)
    if (other?.sense === named.sense) same += 1
  }
  return 0.5 - same / n
}

export const DEMO_QUESTION =
  "Quels faits manquent pour lire l'opposition préparée entre la somme et la parité à 20 tirages ? Ne pas ajouter de nombre absent de la demande."
