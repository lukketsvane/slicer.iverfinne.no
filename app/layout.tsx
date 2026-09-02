import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-inter",
})

const TITLE = "slicerman"
const NOTE =
  "Snitt eit 3D-nett til flate delar for laser og CNC. Dra inn ei STL, sett tjukna, få DXF og kuttark. Ingen dyr programvare."

export const metadata: Metadata = {
  metadataBase: new URL("https://slicer.iverfinne.no"),
  title: TITLE,
  description: NOTE,
  openGraph: {
    title: TITLE,
    description: NOTE,
    url: "https://slicer.iverfinne.no",
    siteName: TITLE,
    type: "website",
    locale: "nn_NO",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: NOTE },
  applicationName: TITLE,
  // gjennomsiktig statusline: topplina tek den tryggje sona sjølv (sjå toppline.tsx)
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: TITLE },
}

/**
 * Sida kan forstørrast.
 *
 * Ho var låst med `maximum-scale=1`, av di klypet er ein gest reiskapen
 * bruker sjølv — og eit klyp som forstørrar sida i staden for objektet er
 * eit klyp som gjer feil ting. Men lerretet har `touch-action: none` og tek
 * fingrane sine sjølv; låsen gjaldt difor berre resten av sida, der ingen
 * gest konkurrerer og der den minste teksten er ti pikslar. Den som treng
 * å forstørre for å lese, skal få lov.
 */
export const viewport: Viewport = {
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nn" className={inter.variable}>
      <body className="overflow-hidden antialiased">
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
