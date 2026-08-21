"use client"

import { useEffect } from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"

export type NudgeAxis = "vertical" | "horizontal"

/**
 * Fingergestar på lerretet. Ein skyvar er presis, men treg; ein gest er
 * upresis, men rask. Reiskapen treng begge, og dei må ikkje slåst om
 * dei same fingrane.
 *
 *  - éin finger        → OrbitControls, snu objektet
 *  - dobbelttrykk      → onDoubleTap, ramm inn objektet på nytt
 *  - to fingrar loddrett / vassrett → onNudge, skrur ribbetalet
 *  - klyp              → kamera nærare og lenger unna
 *  - tre fingrar       → onLight, styrer hovudlyset. Kameraet står stille;
 *                        posituren frå før fingrane landa vert lagd
 *                        tilbake med det same gesten er avgjord, slik at
 *                        den tilfeldige rotasjonen frå den fyrste fingeren
 *                        ikkje vert hengande att.
 */
export function GestureParams({
  onNudge,
  onLight,
  onDoubleTap,
}: {
  onNudge: (axis: NudgeAxis, deltaPx: number) => void
  onLight?: (dxPx: number, dyPx: number) => void
  onDoubleTap?: () => void
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
    let mode: "none" | "pinch" | "v" | "h" | "light" = "none"
    let last = { cx: 0, cy: 0, d: 0 }
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
      }
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
        last = { cx: c.x, cy: c.y, d: 0 }
        if (controls) controls.enabled = false
        restore()
      }
    }

    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (mode === "light") {
        if (pts.size < 3) return
        const c = centroid()
        onLight?.(c.x - last.cx, c.y - last.cy)
        last = { cx: c.x, cy: c.y, d: 0 }
        return
      }
      if (pts.size !== 2) return
      const c = measure2()
      const dx = c.cx - last.cx
      const dy = c.cy - last.cy
      const dd = c.d - last.d
      if (mode === "none") {
        // gesten vert klassifisert éin gong, etter ei lita daudsone
        if (Math.abs(dd) > Math.max(Math.abs(dx), Math.abs(dy)) * 1.2 && Math.abs(dd) > 5) {
          mode = "pinch"
        } else if (Math.abs(dy) > Math.abs(dx) * 1.3 && Math.abs(dy) > 5) {
          mode = "v"
        } else if (Math.abs(dx) > Math.abs(dy) * 1.3 && Math.abs(dx) > 5) {
          mode = "h"
        } else {
          return
        }
        if (mode !== "pinch") restore()
      }
      if (mode === "pinch") {
        if (last.d > 0 && c.d > 0) {
          const target = controls?.target?.clone() ?? new THREE.Vector3(0, 0.35, 0)
          const offset = camera.position.clone().sub(target)
          const dist = THREE.MathUtils.clamp(offset.length() * (last.d / c.d), 2.4, 16)
          camera.position.copy(target).add(offset.setLength(dist))
          invalidate()
        }
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
      } else if (pts.size < 2 && mode !== "light") {
        mode = "none"
      }
    }

    el.addEventListener("pointerdown", down)
    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      el.removeEventListener("pointerdown", down)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      if (controls) controls.enabled = true
    }
  }, [gl, controls, camera, invalidate, onNudge, onLight, onDoubleTap])

  return null
}
