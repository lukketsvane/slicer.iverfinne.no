"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { finnKopipar, gjentaFlytting, type Kopipar, type Planval } from "@/lib/gjenta"
import { skrivPlan } from "@/lib/plan"
import type { ArketProps } from "./arket-legacy"

type GjentaProps = Pick<ArketProps, "plan" | "vald" | "valdGruppe" | "params" | "onChange" | "onVald">

/** Minnet høyrer til økta, medan kvar kopi høyrer til prosjektet og angrehistoria. */
export function useGjenta(p: GjentaProps) {
  const [par, setPar] = useState<Kopipar | null>(null)
  const foer = useRef<Planval>({ plan: p.plan, vald: p.vald })
  const kjelde = `${p.params.kjelde ?? ""}\n${p.params.scene ?? ""}`
  const sistKjelde = useRef(kjelde)
  const sendt = useRef<string | null>(null)
  useLayoutEffect(() => {
    const etter = { plan: p.plan, vald: p.vald }
    const ny = p.valdGruppe === null ? finnKopipar(foer.current, etter) : null
    if (sistKjelde.current !== kjelde || p.plan.length < foer.current.plan.length) setPar(null)
    else if (ny) setPar(ny)
    foer.current = etter
    sistKjelde.current = kjelde
    sendt.current = null
  }, [p.plan, p.vald, p.valdGruppe, kjelde])

  if (!par || p.vald !== par.til || p.valdGruppe !== null) return null
  const { kopi, grunn } = gjentaFlytting(p.plan, par)
  return {
    grunn,
    gjer: kopi ? () => {
      // To trykk før React har skrive den nye lista skal ikkje bruke same namn.
      const no = skrivPlan(p.plan)
      if (sendt.current === no) return
      sendt.current = no
      p.onChange({ ...p.params, plan: skrivPlan([...p.plan, kopi]) })
      p.onVald(kopi.id)
    } : undefined,
  }
}
