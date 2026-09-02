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
 * SIDA ER SKJERMEN. iPhone 16e, lagra på heimskjermen, er det einaste
 * målet: ingenting på sida skal merkast, forstørrast eller rullast. Klypet
 * er ein gest reiskapen brukar sjølv, og eit klyp som forstørrar sida i
 * staden for objektet er eit klyp som gjekk til systemet. Difor er skalaen
 * låst her, og resten — gestane, merkinga, rullinga — i globals.css og i
 * studioet.
 */
export const viewport: Viewport = {
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // lina rundt sida er papiret: kvitt i lys, svart i mørk. Same tokena som
  // globals.css set — dei står her òg av di nettlesaren les dei før CSS-en.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
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
