/** Résout `@/` et les imports TypeScript sans extension pour `node --test`. */

const ROOT = new URL("../", import.meta.url)
const HAS_EXT = /\.(?:[cm]?[jt]sx?|json)(?:\?.*)?$/i

function rewrite(specifier) {
  if (specifier.startsWith("@/")) {
    return new URL(`src/${specifier.slice(2)}`, ROOT).href
  }
  return specifier
}

function withTs(specifier) {
  if (HAS_EXT.test(specifier)) return []
  return [
    `${specifier}.ts`,
    `${specifier}.tsx`,
    `${specifier}/index.ts`,
    `${specifier}/index.tsx`,
  ]
}

export async function resolve(specifier, context, nextResolve) {
  const rewritten = rewrite(specifier)
  const candidates = [rewritten, ...withTs(rewritten)]
  let lastError
  for (const candidate of candidates) {
    try {
      return await nextResolve(candidate, context)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
