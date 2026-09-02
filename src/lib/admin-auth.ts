import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

import { isLocalHost, isNetlify } from "@/lib/api-base"
import { liveEnv } from "@/lib/env-file"

const COOKIE = "synchro_admin"
const MAX_AGE = 60 * 60 * 24 * 7

export function adminPassword(): string {
  return liveEnv("ADMIN_PASSWORD")
}

export function isLocalRequest(request: Request): boolean {
  if (isNetlify()) return false
  try {
    const hostname = new URL(request.url).hostname
    return isLocalHost(hostname)
  } catch {
    return false
  }
}

function sign(secret: string): string {
  const exp = Date.now() + MAX_AGE * 1000
  const body = String(exp)
  const sig = createHmac("sha256", secret).update(body).digest("hex")
  return `${body}.${sig}`
}

function verify(token: string, secret: string): boolean {
  const [body, sig] = token.split(".")
  if (!body || !sig) return false
  if (Number(body) < Date.now()) return false
  const expected = createHmac("sha256", secret).update(body).digest("hex")
  if (expected.length !== sig.length) return false
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function isAuthenticated(request: Request): Promise<boolean> {
  if (isLocalRequest(request) && !adminPassword()) return true
  const secret = adminPassword()
  if (!secret) return false
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value || ""
  return verify(token, secret)
}

export function loginCookie(password: string): { name: string; value: string; maxAge: number } {
  return {
    name: COOKIE,
    value: sign(password),
    maxAge: MAX_AGE,
  }
}

export function clearCookie(): { name: string; value: string; maxAge: number } {
  return { name: COOKIE, value: "", maxAge: 0 }
}

export function checkPassword(candidate: string): boolean {
  const expected = adminPassword()
  if (!expected) return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
