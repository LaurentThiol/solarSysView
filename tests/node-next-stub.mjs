/**
 * Le job pytest n’installe pas `next` : la route Brave se teste avec une réponse JSON minimale à la place de `next/server`.
 * À enregistrer avec `register("./node-next-stub.mjs", import.meta.url)` avant d’importer la route.
 */
const NEXT_SERVER = `data:text/javascript,${encodeURIComponent(`
export class NextRequest extends Request {}
export const NextResponse = { json: (body, init) => Response.json(body, init) }
`)}`

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") return { url: NEXT_SERVER, shortCircuit: true }
  return nextResolve(specifier, context)
}
