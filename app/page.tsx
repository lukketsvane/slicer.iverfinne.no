import { MaalProvider } from "@/lib/i18n"
import { Studio } from "@/components/studio"

export default function Page() {
  return (
    <MaalProvider maal="en">
      <Studio />
    </MaalProvider>
  )
}
