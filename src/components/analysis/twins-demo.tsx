"use client"

import { DemoPopup, DemoTourBar } from "@/components/brain/brain-demo"
import { TWINS_DEMO_STEPS, type TwinsDemoStepId } from "@/lib/twins-demo"

export function TwinsDemoBar({
  step,
  running,
  done,
  waiting,
  onStart,
  onStop,
}: {
  step: TwinsDemoStepId | null
  running: boolean
  done: boolean
  waiting?: boolean
  onStart: () => void
  onStop: () => void
}) {
  return (
    <DemoTourBar
      title="Démo Jumeaux"
      help={{
        title: "Démo Jumeaux",
        body: "Parcourt vraiment l’onglet : fenêtre, puces d’axes, masque somme × étendue × parité, heatmap, 8 voisins et le pont Brain (@analogs). Un pop-up vous arrête après chaque phase : Suivant ou Annuler. Les chiffres viennent des tirages chargés. Pas une prédiction.",
      }}
      steps={TWINS_DEMO_STEPS}
      step={step}
      running={running}
      done={done}
      waiting={waiting}
      idleHint="Pop-up Suivant / Annuler. Chiffres réels, à votre rythme."
      doneHint="Terminée : le masque, la query et le voisin restent sous vos yeux."
      startLabel="Lancer la démo"
      replayLabel="Rejouer"
      onStart={onStart}
      onStop={onStop}
      dataDemo="twins-bar"
    />
  )
}

export function TwinsDemoPopup({
  step,
  open,
  onNext,
  onCancel,
}: {
  step: TwinsDemoStepId | null
  open: boolean
  onNext: () => void
  onCancel: () => void
}) {
  return (
    <DemoPopup
      step={step}
      steps={TWINS_DEMO_STEPS}
      open={open}
      onNext={onNext}
      onCancel={onCancel}
      titleId="twins-demo-popup-title"
      nextId="twins-demo-next"
    />
  )
}
