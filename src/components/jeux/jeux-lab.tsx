"use client"

import { HistoJeuxPanel } from "@/components/jeux/histo-jeux-panel"
import { JeuxPanel } from "@/components/jeux/jeux-panel"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import { JEUX_JOURNAL_LABEL, JEUX_JOURNAL_TAB } from "@/lib/copy"
import { useLabTab } from "@/lib/use-lab-tab"

const TABS = [
  {
    id: "solutions",
    label: "Solutions",
    help: {
      title: "Solutions",
      body: "Décompte exact des grilles 5+2 qui respectent les restrictions. Ce n’est pas un pronostic.",
    },
  },
  {
    id: JEUX_JOURNAL_TAB,
    label: JEUX_JOURNAL_LABEL,
    help: {
      title: JEUX_JOURNAL_LABEL,
      body: "Journal (histoJeux) des grilles réellement jouées, datées sur un tirage mardi/vendredi. Rang après synchro FDJ, test binomial vs 7,71 %, spec Jeux pour relire les curseurs.",
    },
  },
] as const

export type JeuxTabId = (typeof TABS)[number]["id"]
const JEUX_TAB_IDS = TABS.map((item) => item.id) as JeuxTabId[]

export function JeuxLab() {
  const [tab, selectTab] = useLabTab(JEUX_TAB_IDS, "solutions")

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PillTabs
        idPrefix="jeux"
        label="Jeux"
        value={tab}
        onValueChange={selectTab}
        items={TABS}
      />
      <PillTabPanel idPrefix="jeux" tab={tab}>
        {tab === "solutions" ? <JeuxPanel /> : <HistoJeuxPanel />}
      </PillTabPanel>
    </div>
  )
}
