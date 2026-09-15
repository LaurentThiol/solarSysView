import { NextResponse } from "next/server"

import { iaStatus } from "@/lib/ia/providers"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({ ok: true, ...(await iaStatus({ live: true })) })
}
