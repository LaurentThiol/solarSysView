import type { Metadata } from "next"

import { ChartismeLab } from "@/components/chartisme/chartisme-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Chartisme — Synchro",
  description:
    "Figures chartistes sur les courbes du logiciel : détection géométrique, annotation dessinée, atelier d’étiquetage, règles descriptives et rétro-test contre le hasard.",
}

export default function ChartismePage() {
  return (
    <PageShell
      title="Chartisme · figures"
      description={
        <>
          Les 17 figures de la table de référence sur les courbes exportées du
          logiciel : épaules, biseaux, triangles, drapeaux, tasse avec anse.
          Cassure validée seulement si l’activité dépasse sa moyenne mobile 20 et
          si la clôture confirme — sinon c’est un <em>fake breakout</em>.
        </>
      }
      notice="Les tirages sont indépendants. Une figure sur une courbe de retards ou de sorties est une propriété du tracé, pas une prédiction. Cet onglet ne touche pas aux grilles : il décrit, et le rétro-test mesure l’écart entre la figure et le hasard."
    >
      <ChartismeLab />
    </PageShell>
  )
}
