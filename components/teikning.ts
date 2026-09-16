"use client"

import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef, type MutableRefObject } from "react"
import type { Pt } from "@/lib/core"
import type { fritt } from "@/lib/ramme"
import { teiknaFirkant, teiknaKontur } from "@/lib/teikning"

type Teikning = {
  slag: "firkant" | "kontur"
  svg: SVGSVGElement | null
  lerret: HTMLCanvasElement
  arb: MutableRefObject<string | null>
  controls: { enabled: boolean } | null
  taKameraet: () => void
  invalidate: () => void
  fri: ReturnType<typeof fritt>
  S: number
  onStart: () => void
  paaFlata: (x: number, y: number) => Pt | null
  paaSkjermen: (punkt: Pt[]) => Pt[]
  onLukk: (omriss: Pt[], slag: "firkant" | "kontur", tol: number) => void
  /** hakar eit punkt fast — golvet, sidene på kant. `tol` er ein fingerbreidd i planet si eining */
  snapp?: (q: Pt, tol: number) => Pt
}

/** Eitt drag eig éin peikar. Berre det ferdige omrisset går til React. */
export function useTeikning(q: Teikning) {
  const naa = useRef(q)
  naa.current = q
  const drag = useRef<{ id: number; slag: Teikning["slag"]; x: number; y: number; a: Pt; b: Pt; punkt: Pt[]; tol: number } | null>(null)
  const bane = useMemo(() => q.svg?.querySelector("polygon"), [q.svg])
  const maal = useMemo(() => q.svg?.querySelector("text"), [q.svg])
  const melding = useRef("")
  useFrame(() => {
    const { svg, fri, S, paaSkjermen } = naa.current
    if (!svg || !bane) return
    const d = drag.current
    svg.dataset.teikn = d ? "dreg" : "klar"
    if (!d) {
      bane.setAttribute("points", "")
      if (maal) maal.textContent = melding.current
      return
    }
    const om = d.slag === "firkant" ? teiknaFirkant(d.a, d.b) : [...d.punkt, d.b]
    const px = paaSkjermen(om)
    bane.setAttribute("points", px.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "))
    if (maal) {
      const xs = om.map((p) => p[0]), ys = om.map((p) => p[1])
      maal.setAttribute("x", String(Math.max(fri.L + 12, Math.min(fri.L + fri.w - 160, Math.min(...px.map((p) => p[0]))))))
      maal.setAttribute("y", String(Math.max(fri.T + 24, Math.min(fri.T + fri.h - 12, Math.min(...px.map((p) => p[1])) - 16))))
      maal.textContent = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].map((v) => (v * S).toLocaleString("nn", { maximumFractionDigits: 1 })).join(" × ") + " mm"
    }
  })

  const { lerret, arb, controls, invalidate } = q
  useEffect(() => {
    const slepp = () => {
      const d = drag.current
      drag.current = null
      if (d && lerret.hasPointerCapture(d.id)) lerret.releasePointerCapture(d.id)
      if (arb.current === "teikn") arb.current = null
      if (controls && d) controls.enabled = true
      invalidate()
    }
    const paa = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (!e.isPrimary || drag.current || arb.current || (e.pointerType === "mouse" && e.button !== 0)) return
      if (!t || t.closest("button, a, input, [role=slider], [role=tab], [role=option], header, aside, [aria-label='kontrollar'], section[aria-label='verkty'], section[aria-label='bilete']")) return
      // Synskuben er WebGL på same lerret. Han må få både ned- og opptrykket.
      const rute = lerret.getBoundingClientRect(), fri = naa.current.fri
      const x = e.clientX - rute.left, y = e.clientY - rute.top
      if (x >= fri.L + fri.w - 76 && x <= fri.L + fri.w && y >= fri.T && y <= fri.T + 76) return
      const kameraPaa = controls?.enabled ?? true
      naa.current.taKameraet()
      naa.current.onStart()
      const raa = naa.current.paaFlata(e.clientX, e.clientY)
      const nabo = naa.current.paaFlata(e.clientX + 1.25, e.clientY)
      if (!raa || !nabo) { if (controls) controls.enabled = kameraPaa; return }
      e.preventDefault()
      e.stopImmediatePropagation()
      melding.current = ""
      const tol = Math.max(1e-5, Math.hypot(nabo[0] - raa[0], nabo[1] - raa[1]))
      // TI PIKSLAR: ein fingerbreidd, og tol er 1,25 piksel
      const a = naa.current.snapp?.(raa, tol * 8) ?? raa
      drag.current = { id: e.pointerId, slag: naa.current.slag, x: e.clientX, y: e.clientY, a, b: a, punkt: [a], tol }
      arb.current = "teikn"
      lerret.setPointerCapture(e.pointerId)
      invalidate()
    }
    const rorsle = (e: PointerEvent) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const sampla = e.getCoalescedEvents?.() ?? []
      for (const ev of [...sampla, e]) {
        const raa = naa.current.paaFlata(ev.clientX, ev.clientY)
        if (!raa) continue
        const b = naa.current.snapp?.(raa, d.tol * 8) ?? raa
        d.b = b
        const siste = d.punkt[d.punkt.length - 1]
        if (d.slag === "kontur" && Math.hypot(b[0] - siste[0], b[1] - siste[1]) >= d.tol) d.punkt.push(b)
      }
      invalidate()
    }
    const av = (e: PointerEvent) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const raa = e.type === "pointerup" ? naa.current.paaFlata(e.clientX, e.clientY) : null
      const b = raa && (naa.current.snapp?.(raa, d.tol * 8) ?? raa)
      slepp()
      if (!b) return
      if (d.slag === "firkant" && (Math.abs(e.clientX - d.x) < 12 || Math.abs(e.clientY - d.y) < 12)) return
      // Slippet sjølv er med, òg når nettlesaren ikkje sende siste move.
      const omriss = d.slag === "firkant" ? teiknaFirkant(d.a, b) : teiknaKontur([...d.punkt, b], d.tol)
      if (omriss) naa.current.onLukk(omriss, d.slag, d.tol)
      else melding.current = "teikn ein tydeleg kontur"
    }
    // Mist grepet: kast berre draget som eig peikaren, aldri lag ei plate.
    const mist = (e: PointerEvent) => { if (e.pointerId === drag.current?.id) slepp() }
    const gøymd = () => { if (document.visibilityState === "hidden") slepp() }
    window.addEventListener("pointerdown", paa, true)
    window.addEventListener("pointermove", rorsle, true)
    window.addEventListener("pointerup", av, true)
    window.addEventListener("pointercancel", av, true)
    window.addEventListener("lostpointercapture", mist, true)
    window.addEventListener("blur", slepp)
    document.addEventListener("visibilitychange", gøymd)
    return () => {
      window.removeEventListener("pointerdown", paa, true)
      window.removeEventListener("pointermove", rorsle, true)
      window.removeEventListener("pointerup", av, true)
      window.removeEventListener("pointercancel", av, true)
      window.removeEventListener("lostpointercapture", mist, true)
      window.removeEventListener("blur", slepp)
      document.removeEventListener("visibilitychange", gøymd)
      slepp()
    }
  }, [lerret, controls, arb, invalidate])
}
