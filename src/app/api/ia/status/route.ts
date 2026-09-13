import { NextResponse } from "next/server"

import { iaStatus } from "@/lib/ia/providers"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ ok: true, ...iaStatus() })
}
