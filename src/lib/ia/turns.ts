import type { IaChatMessage, IaMessageLane } from "@/lib/ia/models"

export type IaTurn =
  | { kind: "user"; message: IaChatMessage; index: number }
  | { kind: "assistant"; message: IaChatMessage; index: number }
  | {
      kind: "compare"
      pairId: string
      a: IaChatMessage
      b: IaChatMessage | null
      aIndex: number
      bIndex: number | null
    }

export function groupIaTurns(messages: IaChatMessage[]): IaTurn[] {
  const out: IaTurn[] = []
  const seen = new Set<string>()
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (message.role === "user") {
      out.push({ kind: "user", message, index })
      continue
    }
    if (message.pairId) {
      if (seen.has(message.pairId)) continue
      seen.add(message.pairId)
      let aIndex = -1
      let bIndex: number | null = null
      let a: IaChatMessage | null = null
      let b: IaChatMessage | null = null
      messages.forEach((item, itemIndex) => {
        if (item.pairId !== message.pairId || item.role !== "assistant") return
        if (item.lane === "b") {
          b = item
          bIndex = itemIndex
        } else {
          a = item
          aIndex = itemIndex
        }
      })
      if (!a) {
        a = message
        aIndex = index
      }
      if (!b) {
        out.push({ kind: "assistant", message: a, index: aIndex })
        continue
      }
      out.push({ kind: "compare", pairId: message.pairId, a, b, aIndex, bIndex })
      continue
    }
    out.push({ kind: "assistant", message, index })
  }
  return out
}

export function historyForLane(messages: IaChatMessage[], lane: IaMessageLane): IaChatMessage[] {
  return messages.filter((message) => {
    if (!message.content.trim()) return false
    if (message.role === "user") return true
    if (!message.lane) return lane === "a"
    return message.lane === lane
  })
}
