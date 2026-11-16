import type { Metadata } from "next"
import { MaalProvider } from "@/lib/i18n"
import { Studio } from "@/components/studio"

const TITLE = "slicerman"
const NOTE =
  "Snitt eit 3D-nett til flate delar for laser og CNC. Dra inn ei STL, sett tjukna, få DXF og kuttark. Ingen dyr programvare."

export const metadata: Metadata = {
  title: TITLE,
  description: NOTE,
  openGraph: {
    title: TITLE,
    description: NOTE,
    url: "https://slicer.iverfinne.no/nn",
    siteName: TITLE,
    type: "website",
    locale: "nn_NO",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: NOTE },
}

export default function Page() {
  return (
    <MaalProvider maal="nn">
      <Studio />
    </MaalProvider>
  )
}
