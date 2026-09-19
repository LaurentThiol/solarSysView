"use client"

import { useId } from "react"
import Link from "next/link"

import { AddressCatalog } from "@/components/help/address-catalog"

export function AddressPanel() {
  const searchId = useId()

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Annuaire de Synchro : chaque <strong>page</strong> du menu, chaque{" "}
        <strong>onglet</strong> adressable dans l’URL, les <strong>fonctions API</strong>{" "}
        (Next.js relaie vers Python en local) et les <strong>raccourcis</strong> du bandeau.
        Un clic ouvre la page ; Copier garde le chemin. Les GET se testent aussi dans un
        nouvel onglet. Même catalogue que la pastille <strong>Adresse</strong> du bandeau
        (raccourci « a »). Le vocabulaire reste dans{" "}
        <Link href="/analyse?tab=memo" className="underline underline-offset-2">
          Mémo
        </Link>{" "}
        et le bouton Glossaire.
      </p>
      <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
        Recettes d’URL utiles : <span className="font-mono">preset</span>,{" "}
        <span className="font-mono">variable</span>, <span className="font-mono">n</span>,{" "}
        <span className="font-mono">x</span>, <span className="font-mono">tab</span> (Analyse /
        Harmo / Jeux), <span className="font-mono">curve</span> (Chartisme),{" "}
        <span className="font-mono">demo=1</span> (Jumeaux, Brain, Spécialistes).
      </p>
      <AddressCatalog searchId={searchId} />
    </div>
  )
}
