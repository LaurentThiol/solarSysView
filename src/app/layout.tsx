import type { ReactNode } from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import {
  CaptureDrawer,
  CaptureFlash,
  CaptureProvider,
  CaptureRoot,
} from "@/components/capture"
import { HelpModeProvider } from "@/components/help"
import { SiteHeader } from "@/components/startup-status"
import { WatchlistSync } from "@/components/brain/watchlist-sync"
import { devStopGuardSource } from "@/lib/dev-stop-guard"

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
    "Archives EuroMillions FDJ : tirages filtrables, laboratoires d’analyse et outils de grilles, avec export CSV.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: devStopGuardSource }} />
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground"
        >
          Aller au contenu
        </a>
        <HelpModeProvider>
          <CaptureProvider>
            <SiteHeader />
            <WatchlistSync />
            <CaptureRoot>{children}</CaptureRoot>
            <CaptureDrawer />
            <CaptureFlash />
          </CaptureProvider>
        </HelpModeProvider>
      </body>
    </html>
  )
}
