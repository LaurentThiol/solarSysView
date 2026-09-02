import { NextResponse } from "next/server"

import { apiBase, isNetlify } from "@/lib/api-base"
import { applyGitUpdate, gitStatus } from "@/lib/git"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get("refresh") === "1"
  return NextResponse.json(await gitStatus(refresh))
}

export async function POST() {
  if (isNetlify() || apiBase() === "") {
    return NextResponse.json(
      {
        ok: false,
        message: "Mise à jour Git depuis l’UI uniquement en local (./launch update).",
        status: await gitStatus(false),
      },
      { status: 400 }
    )
  }
  const result = await applyGitUpdate()
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
