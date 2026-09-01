import { DrawsExplorer } from "@/components/draws-explorer"
import { FIRST_DRAW, LAST_DRAW } from "@/lib/draws"

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 sm:px-6">
          <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
            Synchro
          </p>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Archives des tirages EuroMillions
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {FIRST_DRAW.date.slice(0, 4) === LAST_DRAW.date.slice(0, 4)
              ? `Les ${LAST_DRAW.id - FIRST_DRAW.id + 1} tirages de ${FIRST_DRAW.date.slice(0, 4)}, du ${FIRST_DRAW.weekday} ${FIRST_DRAW.date} au ${LAST_DRAW.weekday} ${LAST_DRAW.date}.`
              : "Historique des tirages EuroMillions."}{" "}
            5 numéros (1–50) et 2 étoiles (1–12). Données recoupées avec les
            archives publiques ; source officielle : FDJ.
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <DrawsExplorer />
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          Jeu de hasard. Ces archives ne constituent ni un pronostic ni un
          conseil de jeu. Résultats officiels :{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique"
          >
            fdj.fr
          </a>
          .
        </p>
      </footer>
    </div>
  )
}
