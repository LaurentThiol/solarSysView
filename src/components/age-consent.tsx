"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

export const CONSENT_STORAGE_KEY = "synchro.consent.v1"

export function AgeConsent({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CONSENT_STORAGE_KEY) === "1") {
        setOpen(false)
      }
    } catch {
      // navigation privée : le bandeau revient à chaque visite
    }
  }, [])

  function accept() {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, "1")
    } catch {
      // ignore quota / private mode
    }
    setOpen(false)
    setBlocked(false)
  }

  if (!open) return <>{children}</>

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        {blocked ? (
          <>
            <h2 id="consent-title" className="text-lg font-semibold tracking-tight">
              Accès réservé aux majeurs
            </h2>
            <p id="consent-body" className="mt-3 text-sm leading-6 text-muted-foreground">
              Synchro est interdit aux mineurs. Vous pouvez fermer cet onglet.
            </p>
            <div className="mt-6">
              <Button type="button" variant="outline" onClick={() => setBlocked(false)}>
                Revenir
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
              Synchro
            </p>
            <h2 id="consent-title" className="mt-2 text-lg font-semibold tracking-tight">
              Avant de continuer
            </h2>
            <p id="consent-body" className="mt-3 text-sm leading-6 text-muted-foreground">
              Archives et analyses de tirages déjà sortis. Rien ici n’améliore les
              chances de gagner. Jeu interdit aux mineurs.
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Aide aux joueurs :{" "}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://www.joueurs-info-service.fr/"
                rel="noreferrer"
              >
                Joueurs Info Service
              </a>{" "}
              · 09 74 75 13 13
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button type="button" onClick={accept}>
                J’ai 18 ans ou plus
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setBlocked(true)}
              >
                Je n’ai pas 18 ans
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
