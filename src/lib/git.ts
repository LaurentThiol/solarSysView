import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const opts = { timeout: 12_000, cwd: process.cwd() }

export type GitCommit = {
  sha: string
  short: string
  message: string
  html_url: string | null
}

export type GitStatus = {
  ok: boolean
  status: "up_to_date" | "behind" | "ahead" | "diverged" | "unavailable"
  sha: string | null
  current_short: string | null
  current_message: string | null
  branch: string | null
  dirty: boolean
  ahead: number
  behind: number
  remote_short: string | null
  remote_url: string | null
  html_url: string | null
  commits: GitCommit[]
  can_apply: boolean
  apply_hint: string
  error?: string
}

function githubHttps(url: string | null): string | null {
  if (!url) return null
  let next = url.trim()
  if (next.startsWith("git@github.com:")) {
    next = `https://github.com/${next.slice("git@github.com:".length)}`
  }
  const match = next.match(/github\.com[:/](.+?)(?:\.git)?$/)
  if (!match) return next.replace(/\.git$/, "")
  return `https://github.com/${match[1].replace(/\.git$/, "")}`
}

async function git(args: string[], timeout = 12_000): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { ...opts, timeout })
  return stdout.trim()
}

export async function gitStatus(refresh = false): Promise<GitStatus> {
  const hint = "./launch update"
  try {
    const short = await git(["rev-parse", "--short", "HEAD"])
    const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"])
    const dirty = (await git(["status", "--porcelain"])).length > 0
    let message: string | null = null
    try {
      message = await git(["log", "-1", "--pretty=%s"])
    } catch {
      message = null
    }
    const remoteUrl = githubHttps(await git(["remote", "get-url", "origin"]).catch(() => ""))
    let upstreamBranch = branch
    try {
      const upstream = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
      if (upstream.startsWith("origin/")) upstreamBranch = upstream.slice("origin/".length)
    } catch {
      if (branch === "HEAD") upstreamBranch = "main"
    }

    if (refresh) {
      try {
        await git(["fetch", "--quiet", "origin", upstreamBranch], 15_000)
      } catch {
        // réseau / identifiants : on compare avec le origin/* déjà connu
      }
    }

    let remoteSha: string | null = null
    try {
      remoteSha = await git(["rev-parse", `origin/${upstreamBranch}`])
    } catch {
      remoteSha = null
    }

    let ahead = 0
    let behind = 0
    if (remoteSha) {
      const counts = await git([
        "rev-list",
        "--left-right",
        "--count",
        `origin/${upstreamBranch}...HEAD`,
      ])
      const parts = counts.split(/\s+/).map(Number)
      behind = parts[0] || 0
      ahead = parts[1] || 0
    }

    const commits: GitCommit[] = []
    if (remoteSha && behind > 0) {
      const log = await git([
        "log",
        "--format=%H%x09%s",
        "-n",
        "12",
        `HEAD..origin/${upstreamBranch}`,
      ]).catch(() => "")
      for (const line of log.split("\n").filter(Boolean)) {
        const [full, ...rest] = line.split("\t")
        commits.push({
          sha: full,
          short: full.slice(0, 7),
          message: rest.join("\t") || "—",
          html_url: remoteUrl ? `${remoteUrl}/commit/${full}` : null,
        })
      }
    }

    let status: GitStatus["status"] = "unavailable"
    if (!remoteSha) status = "unavailable"
    else if (behind > 0 && ahead > 0) status = "diverged"
    else if (behind > 0) status = "behind"
    else if (ahead > 0) status = "ahead"
    else status = "up_to_date"

    const canApply =
      status === "behind" && !dirty && branch === upstreamBranch && process.env.NETLIFY !== "true"

    return {
      ok: true,
      status,
      sha: short,
      current_short: short,
      current_message: message,
      branch,
      dirty,
      ahead,
      behind,
      remote_short: remoteSha ? remoteSha.slice(0, 7) : null,
      remote_url: remoteUrl,
      html_url: remoteUrl
        ? `${remoteUrl}/commits/${encodeURIComponent(upstreamBranch)}`
        : null,
      commits,
      can_apply: canApply,
      apply_hint: hint,
    }
  } catch {
    return {
      ok: false,
      status: "unavailable",
      sha: null,
      current_short: null,
      current_message: null,
      branch: null,
      dirty: false,
      ahead: 0,
      behind: 0,
      remote_short: null,
      remote_url: null,
      html_url: null,
      commits: [],
      can_apply: false,
      apply_hint: hint,
      error: "git indisponible",
    }
  }
}

export async function applyGitUpdate(): Promise<{ ok: boolean; message: string; status: GitStatus }> {
  const before = await gitStatus(true)
  if (process.env.NETLIFY === "true") {
    return {
      ok: false,
      message: "Mise à jour Git impossible sur Netlify — déployez depuis GitHub.",
      status: before,
    }
  }
  if (!before.ok) {
    return { ok: false, message: before.error || "git indisponible", status: before }
  }
  if (before.status === "up_to_date") {
    return { ok: true, message: `Déjà à jour (${before.current_short}).`, status: before }
  }
  if (before.dirty) {
    return {
      ok: false,
      message: "Arbre de travail modifié — committez ou stash avant ./launch update.",
      status: before,
    }
  }
  if (before.status !== "behind") {
    return {
      ok: false,
      message:
        before.status === "diverged"
          ? "Historique divergé — mise à jour fast-forward impossible."
          : "Rien à tirer depuis origin.",
      status: before,
    }
  }
  try {
    const branch = before.branch || "main"
    await git(["pull", "--ff-only", "origin", branch], 30_000)
    const after = await gitStatus(false)
    return {
      ok: true,
      message: `Code mis à jour (${after.current_short}). Relancez ./launch pour prendre en compte le nouveau code.`,
      status: after,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "git pull a échoué",
      status: before,
    }
  }
}
