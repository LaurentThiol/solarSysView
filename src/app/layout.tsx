import type { ReactNode } from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { HelpModeProvider } from "@/components/help"
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <HelpModeProvider>
          <SiteHeader />
          {children}
        </HelpModeProvider>
      </body>
    </html>
  )
}
