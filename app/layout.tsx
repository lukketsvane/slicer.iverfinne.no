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
  metadataBase: new URL("https://slicerman.iverfinne.no"),
  title: TITLE,
  description: NOTE,
  openGraph: {
    title: TITLE,
    description: NOTE,
    url: "https://slicerman.iverfinne.no",
    siteName: TITLE,
    type: "website",
    locale: "nn_NO",
  },
  applicationName: TITLE,
  appleWebApp: { capable: true, statusBarStyle: "default", title: TITLE },
}

export const viewport: Viewport = {
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
