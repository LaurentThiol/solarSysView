import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { SchemaReader } from "@/components/schemas/schema-reader"
import { PageShell } from "@/components/page-shell"
import { schemaIdFromSlug } from "@/lib/schemas/document"
import { findSchemaDoc, loadSchemaCatalog } from "@/lib/schemas/load"

type Params = { slug?: string[] }

export function generateStaticParams() {
  return loadSchemaCatalog().docs.map((doc) => ({
    slug: doc.id ? doc.id.split("/") : [],
  }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  const doc = findSchemaDoc(loadSchemaCatalog().docs, schemaIdFromSlug(slug))
  return {
    title: `${doc?.title ?? "Schémas"} — Synchro`,
    description: "Lecteur des schémas fonctionnels Mermaid versionnés dans docs/schemas.",
  }
}

export default async function SchemasPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const doc = findSchemaDoc(loadSchemaCatalog().docs, schemaIdFromSlug(slug))
  if (!doc) notFound()
  return (
    <PageShell
      title="Schémas"
      subtitle="Lecteur des schémas Mermaid du dépôt. Le dessin affiché est celui du fichier, dans l’ordre de lecture du module."
    >
      <SchemaReader docs={loadSchemaCatalog().docs} current={doc} />
    </PageShell>
  )
}
