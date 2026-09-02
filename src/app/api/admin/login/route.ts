import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { adminPassword, checkPassword, loginCookie } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: string } | null
  const password = (body?.password || "").trim()
  const expected = adminPassword()
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_PASSWORD n’est pas défini dans .env" },
      { status: 400 }
    )
  }
  if (!password || !checkPassword(password)) {
    return NextResponse.json({ ok: false, error: "Mot de passe incorrect" }, { status: 401 })
  }
  const cookie = loginCookie(expected)
  const jar = await cookies()
  jar.set({
    name: cookie.name,
    value: cookie.value,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: cookie.maxAge,
    secure: process.env.NODE_ENV === "production",
  })
  return NextResponse.json({ ok: true })
}
