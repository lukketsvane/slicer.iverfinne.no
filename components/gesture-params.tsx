"use client"

import { useEffect } from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"

export type NudgeAxis = "vertical" | "horizontal"
/** kva ein gest held på med, til lesing på skjermen */
export type GestKva = "storleik" | "ribber" | "vend" | "lys" | null

/**
 * FINGRANE PÅ OBJEKTET.
 *
 * Ein skyvar er presis og treg; ein gest er upresis og rask. Reiskapen
 * treng begge, men gestane har vore fattige: to fingrar skrudde ribbetalet,
 * klypet flytta kameraet, og det var det. Kameraet er det EINASTE i heile
 * reiskapen som ikkje endrar noko, av di det rammar inn objektet av seg
 * sjølv same kva. Å bruke den beste gesten på skjermen til å gjere det som
 * skjer av seg sjølv er å kaste henne bort.
 *
 * So no ligg objektet under fingrane:
 *
 *   éin finger        snu synet (OrbitControls)
 *   dobbelttrykk      ramm inn på nytt, heim i standardvinkelen
 *   to fingrar, klyp  STORLEIKEN. Du dreg objektet stort og lite.
 *   to fingrar, vri   VEND. Objektet snur seg på bordet, og ribbene
 *                     fylgjer ikkje med: du ser med det same om ei anna
 *                     vending gjev eit betre snitt.
 *   to fingrar, dra   ribbetalet, loddrett og vassrett kvar sin veg
 *   tre fingrar       hovudlyset
 *
 * Klassifiseringa skjer ÉIN gong, etter ei daudsone, og alle fire kandidatar
 * vert målte i same eining: pikslar. Vridinga vert rekna om til bogelengda
 * kvar finger har gått, so ein liten vri på to fingrar tett i hop ikkje
 * skuggar for eit drag.
 *
 * Klypet tek ikkje lenger kameraet. Det er eit medvite tap: du kan ikkje
 * zoome med fingrane. Til gjengjeld rammar kameraet inn av seg sjølv, og
 * dobbelttrykket set det heim.
 */
export function GestureParams({
  onNudge,
  onSkala,
  onVend,
  onLight,
  onDoubleTap,
  onGest,
}: {
  onNudge: (axis: NudgeAxis, deltaPx: number) => void
  /**
   * Klyp og vri gjev TOTALEN sidan gesten byrja, ikkje eit steg per
   * hending: fingrane som står tre gonger so langt frå kvarandre skal gje
   * eit objekt som er tre gonger so stort, same kor mange hendingar som
   * kom fram undervegs. Nettlesaren slår saman rørsler når hovudtråden er
   * oppteken, og eit bygg tek hundre millisekund: eit klyp som la saman
   * steg mista det som vart slege saman, og same gesten gav tre gonger
   * den eine gongen og ein og ein halv den neste.
   */
  onSkala?: (faktorFraaStart: number) => void
  onVend?: (graderFraaStart: number) => void
  onLight?: (dxPx: number, dyPx: number) => void
  onDoubleTap?: () => void
  /** kva gesten held på med, eller null når ingen finger er nede */
  onGest?: (kva: GestKva) => void
}) {
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as {
    enabled: boolean
    target?: THREE.Vector3
    update?: () => void
  } | null
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    const el = gl.domElement
    const pts = new Map<number, { x: number; y: number }>()
    let mode: "none" | "klyp" | "vri" | "v" | "h" | "light" = "none"
    let last = { cx: 0, cy: 0, d: 0, a: 0 }
    /** stoda då gesten vart klassifisert, som klyp og vri måler frå */
    let start = { d: 0, a: 0 }
    /** summen av vridinga, so ho kan gå forbi eit halvt omdreiing */
    let vridd = 0
    let snap: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
    // dobbelttrykket: to korte, stillestandande trykk nær kvarandre i tid
    // og rom — same terskel som iOS sjølv brukar på kartet
    let tapDown = { x: 0, y: 0, t: 0, id: -1 }
    let lastTap = { x: 0, y: 0, t: 0 }

    const restore = () => {
      if (!snap) return
      camera.position.copy(snap.pos)
      if (controls?.target) {
        controls.target.copy(snap.target)
        controls.update?.()
      }
      invalidate()
    }

    const measure2 = () => {
      const [a, b] = [...pts.values()]
      return {
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        d: Math.hypot(a.x - b.x, a.y - b.y),
        a: Math.atan2(b.y - a.y, b.x - a.x),
      }
    }

    /** vinkelskilnad inn i (-π, π] */
    const vinkel = (ny: number, gml: number) => {
      let v = ny - gml
      while (v > Math.PI) v -= 2 * Math.PI
      while (v <= -Math.PI) v += 2 * Math.PI
      return v
    }

    const centroid = () => {
      let x = 0
      let y = 0
      for (const p of pts.values()) {
        x += p.x
        y += p.y
      }
      return { x: x / pts.size, y: y / pts.size }
    }

    const down = (e: PointerEvent) => {
      // trykk-kandidat for mus og finger begge: fyrste peikar, åleine
      tapDown =
        pts.size === 0 && e.isPrimary
          ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
          : { x: 0, y: 0, t: 0, id: -1 }
      if (e.pointerType !== "touch") return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1) {
        snap = {
          pos: camera.position.clone(),
          target: controls?.target?.clone() ?? new THREE.Vector3(0, 0.35, 0),
        }
      }
      if (pts.size === 2 && mode !== "light") {
        mode = "none"
        last = measure2()
        if (controls) controls.enabled = false
      }
      if (pts.size === 3) {
        mode = "light"
        const c = centroid()
        last = { cx: c.x, cy: c.y, d: 0, a: 0 }
        if (controls) controls.enabled = false
        restore()
        onGest?.("lys")
      }
    }

    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (mode === "light") {
        if (pts.size < 3) return
        const c = centroid()
        onLight?.(c.x - last.cx, c.y - last.cy)
        last = { cx: c.x, cy: c.y, d: 0, a: 0 }
        return
      }
      if (pts.size !== 2) return
      const c = measure2()
      const dx = c.cx - last.cx
      const dy = c.cy - last.cy
      const dd = c.d - last.d
      const dv = vinkel(c.a, last.a)
      // Vridinga målt i pikslar: bogen kvar finger har gått.
      const boge = dv * (c.d / 2)
      if (mode === "none") {
        // Gesten vert klassifisert ÉIN gong, etter ei daudsone, og alle
        // fire kandidatane står i same eining.
        const A = Math.abs(boge)
        const D = Math.abs(dd)
        const X = Math.abs(dx)
        const Y = Math.abs(dy)
        if (A > 6 && A > 1.3 * Math.max(D, X, Y)) mode = "vri"
        else if (D > 6 && D > 1.2 * Math.max(X, Y, A)) mode = "klyp"
        else if (Y > 6 && Y > 1.3 * Math.max(X, D, A)) mode = "v"
        else if (X > 6 && X > 1.3 * Math.max(Y, D, A)) mode = "h"
        else return
        // Nullpunktet er der gesten VART til, ikkje der fingrane landa:
        // daudsona skal ikkje telje med i totalen.
        start = { d: last.d, a: last.a }
        vridd = 0
        // Den fyrste fingeren rakk å snu synet litt før den andre landa.
        // Den rotasjonen høyrer ikkje til gesten, so han vert lagd attende.
        restore()
        onGest?.(
          mode === "klyp" ? "storleik" : mode === "vri" ? "vend" : "ribber",
        )
      }
      if (mode === "klyp") {
        if (start.d > 8 && c.d > 8) onSkala?.(c.d / start.d)
      } else if (mode === "vri") {
        // Skjermen har y nedover, so ein vri med klokka aukar vinkelen.
        // Objektet skal fylgje fingrane, og ei rotasjon med klokka sett
        // ovanfrå er negativ kring den ståande aksen.
        vridd += dv
        onVend?.((-vridd * 180) / Math.PI)
      } else if (mode === "v") {
        onNudge("vertical", -dy)
      } else {
        onNudge("horizontal", dx)
      }
      last = c
    }

    const up = (e: PointerEvent) => {
      // dobbelttrykket, for mus og finger begge — FØR fingerbokhaldet,
      // av di musa aldri står i pts
      if (e.pointerId === tapDown.id) {
        const now = performance.now()
        const still =
          now - tapDown.t < 260 &&
          Math.hypot(e.clientX - tapDown.x, e.clientY - tapDown.y) < 12
        if (still) {
          const twin =
            now - lastTap.t < 340 &&
            Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 48
          if (twin) {
            lastTap = { x: 0, y: 0, t: 0 }
            onDoubleTap?.()
          } else {
            lastTap = { x: e.clientX, y: e.clientY, t: now }
          }
        }
        tapDown = { x: 0, y: 0, t: 0, id: -1 }
      }
      if (!pts.delete(e.pointerId)) return
      if (pts.size === 0) {
        mode = "none"
        snap = null
        if (controls) controls.enabled = true
        onGest?.(null)
      } else if (pts.size < 2 && mode !== "light") {
        mode = "none"
        onGest?.(null)
      }
    }

    /**
     * KLYPET PÅ EI STYREFLATE.
     *
     * Nettlesaren sender det som eit hjul med ctrl nede, og det er det
     * einaste klypet ein får på skrivebordet: rotasjon med to fingrar når
     * aldri fram til sida i det heile. So styreflata får storleiken, og
     * vendinga har tastane komma og punktum.
     */
    const hjul = (e: WheelEvent) => {
      if (!e.ctrlKey || !onSkala) return
      e.preventDefault()
      e.stopPropagation()
      // Hjulet har ingen start og ingen slutt, so gesten er «hakk som kjem
      // tett»: totalen står til det har vore stille i eit halvt sekund.
      //
      // Og gesten skal MELDE SEG ÉIN GONG. `onGest("storleik")` låser
      // grunnstoda klypet vert målt frå, og han vart meldt på kvart
      // einaste hakk: grunnstoda flytta seg til den storleiken hjulet
      // nettopp hadde laga, medan totalen heldt fram med å vekse frå éin.
      // Kvart hakk gonga seg sjølv, og eit par sekund på styreflata slo
      // storleiken i taket på tolv hundre millimeter same kor lite du dreg.
      if (!hjulGaar) {
        hjulGaar = true
        onGest?.("storleik")
      }
      hjulTotal *= Math.exp(-e.deltaY * 0.01)
      onSkala(hjulTotal)
      window.clearTimeout(hjulTimer)
      hjulTimer = window.setTimeout(() => {
        onGest?.(null)
        hjulTotal = 1
        hjulGaar = false
      }, 500)
    }
    let hjulTimer = 0
    let hjulTotal = 1
    let hjulGaar = false

    el.addEventListener("pointerdown", down)
    el.addEventListener("wheel", hjul, { passive: false, capture: true })
    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      el.removeEventListener("pointerdown", down)
      el.removeEventListener("wheel", hjul, { capture: true } as EventListenerOptions)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      window.clearTimeout(hjulTimer)
      if (controls) controls.enabled = true
    }
  }, [gl, controls, camera, invalidate, onNudge, onSkala, onVend, onLight, onDoubleTap, onGest])

  return null
}
