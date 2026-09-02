import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { AgeConsent } from "@/components/age-consent"
import { SiteHeader } from "@/components/startup-status"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Synchro — Archives EuroMillions",
  description:
    "Tous les tirages EuroMillions 2026, filtrables par mois et par numéros, avec export CSV.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AgeConsent />
        <SiteHeader />
        {children}
      </body>
    </html>
  )
}
