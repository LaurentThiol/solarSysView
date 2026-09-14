import type { IaThread } from "@/lib/ia/threads"
import {
  threadFileSlug,
  threadToMarkdown,
  threadsExportPayload,
} from "@/lib/ia/threads"

export {
  parseThreadsExport,
  threadFileSlug,
  threadToMarkdown,
  THREADS_EXPORT_KIND,
  THREADS_EXPORT_VERSION,
  threadsExportPayload,
} from "@/lib/ia/threads"

export function downloadText(filename: string, content: string, mime: string) {
  if (typeof document === "undefined") return
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadThreadMarkdown(thread: IaThread) {
  downloadText(`${threadFileSlug(thread.title, thread.id)}.md`, threadToMarkdown(thread), "text/markdown")
}

export function downloadThreadJson(thread: IaThread, includeImages = false) {
  downloadText(
    `${threadFileSlug(thread.title, thread.id)}.json`,
    JSON.stringify(threadsExportPayload([thread], { includeImages }), null, 2),
    "application/json"
  )
}

export function downloadThreadsJson(threads: IaThread[]) {
  downloadText(
    `synchro-ia-lectures.json`,
    JSON.stringify(threadsExportPayload(threads), null, 2),
    "application/json"
  )
}
