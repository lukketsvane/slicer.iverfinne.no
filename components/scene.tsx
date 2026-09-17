"use client"

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { GizmoHelper, GizmoViewcube, Html, OrbitControls, useGizmoContext } from "@react-three/drei"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type MutableRefObject, type ReactElement, type ReactNode } from "react"
import * as THREE from "three"
import { LAG_FARGAR, MATERIALS, inRing, lagFarge, shoelace, type Kutt, type Material, type Pt, type Rom, type Vec3 } from "@/lib/core"
import { akser, broek, dot, inn, OMRISS_TAK, omrissLine, omrissMidt, ramme as planRamme, snappPunkt, ut, type Plan, type Ramme, type Strek } from "@/lib/plan"
import type { Montasje } from "@/lib/montasje"
import { FOV_FLAT, FOV_NAER, GROUND_Y, MAX_DIST, MIN_DIST, NAER_LUFT, SKODDE_FJERN, SKODDE_NAER, fovSkala, fritt, ramme, type Fit, type Rute } from "@/lib/ramme"
import type { SkisseSyn } from "@/lib/snitt"
import { DELING_MAX, DELING_MIN } from "@/lib/params"
import type { BitBoks } from "@/lib/kropp"
import type { BuildRes } from "@/lib/worker"
import { DOBBELT_MS } from "./deler"
import { useTeikning } from "./teikning"
import { rettOpp, snapp, snappliner, teikneNormal, type Snappline } from "@/lib/teikning"

const FRAME = 2.2
const HEIM: Vec3 = [2.4, 1.7, 6.4]
const SKISSE = "#1f6feb"
const VALT = "#e05a1a"

function useTema() {
  const [t, setT] = useState({ paper: "#ffffff", ink: "#141414", warn: "#c62828" })
  useEffect(() => {
    const les = () => {
      const s = getComputedStyle(document.documentElement)
      const f = (k: string, fall: string) => s.getPropertyValue(k).trim() || fall
      setT({ paper: f("--paper", "#ffffff"), ink: f("--ink", "#141414"), warn: f("--warn", "#c62828") })
    }
    les()
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    mq.addEventListener("change", les)
    return () => mq.removeEventListener("change", les)
  }, [])
  return t
}

export type Skisse = { o: Vec3; n: Vec3 }
export type GestKva = "lys" | "snitt" | "zoom" | "strek" | "rute" | "side" | null
type Live = { id: number; i: number; s: Strek }
export type Modus = "form" | "bit" | "rute"
type Lys = { az: number; el: number }

type Ramma = { cx: number; cy: number; s: number; min: Vec3; max: Vec3; midt: Vec3; fit: Fit }

function ramma(d: BuildRes | null, ekstra?: { min: Vec3; max: Vec3 } | null): Ramma | null {
  if (!d) return null
  const bx: Vec3 = ekstra ? [Math.min(d.min[0], ekstra.min[0]), Math.min(d.min[1], ekstra.min[1]), Math.min(d.min[2], ekstra.min[2])] : d.min
  const bX: Vec3 = ekstra ? [Math.max(d.max[0], ekstra.max[0]), Math.max(d.max[1], ekstra.max[1]), Math.max(d.max[2], ekstra.max[2])] : d.max
  const cx = (bx[0] + bX[0]) / 2
  const cy = (bx[1] + bX[1]) / 2
  const h = Math.max(1e-6, bX[2] - Math.min(0, bx[2]))
  const w = Math.max(bX[0] - bx[0], bX[1] - bx[1])
  const s = FRAME / Math.max(w, h, 1e-6)
  return {
    cx, cy, s,
    min: d.min,
    max: d.max,
    midt: [(d.min[0] + d.max[0]) / 2, (d.min[1] + d.max[1]) / 2, (d.min[2] + d.max[2]) / 2],
    fit: { r: (Math.hypot(w, h) / 2) * s, w: w * s, h: h * s, cy: (h / 2) * s },
  }
}
const tilVerd = (f: Ramma, p: Vec3) => new THREE.Vector3(f.s * (p[0] - f.cx), f.s * p[2] + GROUND_Y, -f.s * (p[1] - f.cy))
const fraaVerd = (f: Ramma, v: THREE.Vector3): Vec3 => [v.x / f.s + f.cx, f.cy - v.z / f.s, (v.y - GROUND_Y) / f.s]
const nTilVerd = (n: Vec3) => new THREE.Vector3(n[0], n[2], -n[1])
const nFraaVerd = (v: THREE.Vector3): Vec3 => [v.x, -v.z, v.y]

function paaPlanetAv(camera: THREE.Camera, size: { width: number; height: number }, f: Ramma, r: Ramme, px: number, py: number): Pt | null {
  const ray = new THREE.Vector3((px / size.width) * 2 - 1, 1 - (py / size.height) * 2, 0.5).unproject(camera).sub(camera.position).normalize()
  const n = nTilVerd(r.n)
  const k = ray.dot(n)
  if (Math.abs(k) < 0.02) return null
  const t = tilVerd(f, r.o).sub(camera.position).dot(n) / k
  if (t <= 0) return null
  return inn(r, fraaVerd(f, camera.position.clone().addScaledVector(ray, t)))
}
const diag = (f: Ramma) => Math.hypot(f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2])
const vinkel = (ny: number, gml: number) => {
  let v = ny - gml
  while (v > Math.PI) v -= 2 * Math.PI
  while (v <= -Math.PI) v += 2 * Math.PI
  return v
}
const klem = (v: number, tak: number) => Math.min(tak, Math.max(-tak, v))

function makeWood(color: string, rough: number, uKorn: { value: number }, uVald: { value: number }, uBlink: { value: number }, uBlinkT: { value: number }) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.14, clearcoatRoughness: 0.55, side: THREE.DoubleSide })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uKorn = uKorn
    sh.uniforms.uVald = uVald
    sh.uniforms.uBlink = uBlink
    sh.uniforms.uBlinkT = uBlinkT
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aKant;\nattribute float aPlan;\nvarying vec3 vObj;\nvarying vec3 vNrmO;\nvarying float vKant;\nvarying float vPlan;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;\nvNrmO = normal;\nvKant = aKant;\nvPlan = aPlan;")
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;\nvarying vec3 vNrmO;\nvarying float vKant;\nvarying float vPlan;\nuniform float uKorn;\nuniform float uVald;\nuniform float uBlink;\nuniform float uBlinkT;\nfloat gKorn;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\nif (uBlink > -0.5 && abs(vPlan - uBlink) < 0.5) totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * uBlinkT;")
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "{",
          "  vec2 q = abs(vNrmO.z) > 0.7 ? vObj.xy : (abs(vNrmO.y) > 0.7 ? vObj.xz : vObj.yz);",
          "  float px = fwidth(q.x);",
          "  float attA = clamp(1.0 - px * 1.4, 0.0, 1.0);",
          "  float attF = clamp(1.0 - px * 4.0, 0.0, 1.0);",
          "  float aar = sin(q.x * 0.5 + 2.2 * sin(q.y * 0.035) + 1.4 * sin(q.x * 0.09)) * attA;",
          "  float fiber = sin(q.x * 3.7 + sin(q.y * 0.6) * 2.4) * attF;",
          "  gKorn = aar * 0.6 + fiber * 0.2;",
          "  vec3 celle = floor(vObj * 1.3);",
          "  float spek = (fract(sin(dot(celle, vec3(12.9898, 78.233, 37.719))) * 43758.5453) - 0.5) * attF;",
          "  float ved = mix(gKorn * 0.03, spek * 0.08 + gKorn * 0.02, vKant) * uKorn;",
          "  diffuseColor.rgb *= 1.0 + ved;",
          "  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.05, 1.03, 0.97), vKant * uKorn);",
          "  if (uVald > -0.5 && abs(vPlan - uVald) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.42, 0.12), 0.55);",
          "}",
        ].join("\n"),
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (vKant * 0.08 + gKorn * 0.025) * uKorn, 0.05, 1.0);")
  }
  return m
}

const mkGeom = (a: ArrayLike<number>) => {
  const g = new THREE.BufferGeometry()
  if (a.length) g.setAttribute("position", new THREE.Float32BufferAttribute(a as number[], 3))
  return g
}
function boksKantar(boksar: readonly { min: Vec3; max: Vec3 }[]) {
  const lin: number[] = []
  for (const b of boksar) {
    const h = (i: number): Vec3 => [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]
    for (let i = 0; i < 8; i++) {
      for (const bit of [1, 2, 4]) {
        if (i & bit) continue
        lin.push(...h(i), ...h(i | bit))
      }
    }
  }
  return mkGeom(lin)
}

function kvadratar(plana: readonly Plan[], f: Ramma, fak = 1.6) {
  const side = fak * diag(f)
  const pos: number[] = []
  const lin: number[] = []
  for (const pl of plana) {
    const r = planRamme(pl, f.min, f.max)
    const h = side / 2
    const c = ([[-h, -h], [h, -h], [h, h], [-h, h]] as [number, number][]).map((q) => ut(r, q))
    pos.push(...c[0], ...c[1], ...c[2], ...c[0], ...c[2], ...c[3])
    for (let i = 0; i < 4; i++) lin.push(...c[i], ...c[(i + 1) % 4])
  }
  return { flate: mkGeom(pos), kant: mkGeom(lin) }
}

const gruppa = (f: Ramma) => ({
  rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
  scale: f.s,
  position: [-f.cx * f.s, 0, f.cy * f.s] as [number, number, number],
})

function planIBoks(r: Ramme, min: Vec3, max: Vec3): Vec3[] {
  const d = dot(r.o, r.n)
  const tol = 1e-4 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  const to: Pt[] = []
  for (let a = 0; a < 3; a++) {
    if (Math.abs(r.n[a]) < 1e-9) continue
    const b = (a + 1) % 3
    const c = (a + 2) % 3
    for (const sb of [min[b], max[b]]) {
      for (const sc of [min[c], max[c]]) {
        const t = (d - sb * r.n[b] - sc * r.n[c]) / r.n[a]
        if (t < min[a] - tol || t > max[a] + tol) continue
        const p: Vec3 = [0, 0, 0]
        p[a] = t
        p[b] = sb
        p[c] = sc
        const q = inn(r, p)
        if (!to.some((e) => Math.hypot(e[0] - q[0], e[1] - q[1]) < tol)) to.push(q)
      }
    }
  }
  if (to.length < 3) return []
  const cx = to.reduce((e, q) => e + q[0], 0) / to.length
  const cy = to.reduce((e, q) => e + q[1], 0) / to.length
  to.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx))
  return to.map((q) => ut(r, q))
}
function polygonGeom(poly: readonly Vec3[]) {
  const pos: number[] = []
  const lin: number[] = []
  for (let i = 1; i + 1 < poly.length; i++) pos.push(...poly[0], ...poly[i], ...poly[i + 1])
  for (let i = 0; i < poly.length; i++) lin.push(...poly[i], ...poly[(i + 1) % poly.length])
  return { flate: mkGeom(pos), kant: mkGeom(lin) }
}
type Orbit = { enabled: boolean; enableDamping?: boolean; update?: () => void }
const roOrbit = (c: Orbit | null) => {
  if (!c) return
  const d = c.enableDamping
  c.enableDamping = false
  c.update?.()
  c.enableDamping = d
}
const taKameraet = (c: Orbit | null) => {
  if (!c) return
  c.enabled = false
  roOrbit(c)
}

function dynGeom(n: number) {
  const g = new THREE.BufferGeometry()
  const a = new THREE.BufferAttribute(new Float32Array(n * 3), 3)
  a.setUsage(THREE.DynamicDrawUsage)
  g.setAttribute("position", a)
  g.setDrawRange(0, 0)
  return g
}
function skrivPolygon(flate: THREE.BufferGeometry, kant: THREE.BufferGeometry, poly: THREE.Vector3[]) {
  const fa = flate.getAttribute("position") as THREE.BufferAttribute
  const ka = kant.getAttribute("position") as THREE.BufferAttribute
  let i = 0
  for (let k = 1; k + 1 < poly.length && i + 3 <= fa.count; k++) {
    fa.setXYZ(i++, poly[0].x, poly[0].y, poly[0].z)
    fa.setXYZ(i++, poly[k].x, poly[k].y, poly[k].z)
    fa.setXYZ(i++, poly[k + 1].x, poly[k + 1].y, poly[k + 1].z)
  }
  let j = 0
  for (let k = 0; k < poly.length && j + 2 <= ka.count; k++) {
    const q = poly[(k + 1) % poly.length]
    ka.setXYZ(j++, poly[k].x, poly[k].y, poly[k].z)
    ka.setXYZ(j++, q.x, q.y, q.z)
  }
  fa.needsUpdate = true
  ka.needsUpdate = true
  flate.setDrawRange(0, i)
  kant.setDrawRange(0, j)
}
function midtAv(r: Pt[]): Pt {
  let A = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const w = r[j][0] * r[i][1] - r[i][0] * r[j][1]
    A += w
    cx += (r[j][0] + r[i][0]) * w
    cy += (r[j][1] + r[i][1]) * w
  }
  if (Math.abs(A) < 1e-9) return [r.reduce((e, q) => e + q[0], 0) / r.length, r.reduce((e, q) => e + q[1], 0) / r.length]
  return [cx / (3 * A), cy / (3 * A)]
}
export function snittMidt(sn: SkisseSyn): Pt {
  let storst = sn.ringar[0]
  let areal = -Infinity
  for (const r of sn.ringar) {
    const a = shoelace(r)
    if (a > areal) {
      areal = a
      storst = r
    }
  }
  return midtAv(storst)
}
function strekRing(s: Strek, S: number): Pt[][] {
  const a = (s.a * Math.PI) / 180
  const c = Math.cos(a)
  const si = Math.sin(a)
  const cx = s.x * S
  const cy = s.y * S
  const hw = (s.w * S) / 2
  const hh = (s.h * S) / 2
  const p = (lx: number, ly: number): Pt => [cx + lx * c - ly * si, cy + lx * si + ly * c]
  if (s.form === "rekt") return [[p(-hw, -hh), p(hw, -hh), p(hw, hh), p(-hw, hh)]]
  if (s.form === "kontur" && s.punkt) return [s.punkt.map(([px, py]) => p(px * 2 * hw, py * 2 * hh))]
  const n = 48
  const ring: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI
    ring.push(p(hw * Math.cos(t), hh * Math.sin(t)))
  }
  return [ring]
}
function strekMidt(s: Strek, S: number): Pt {
  return [s.x * S, s.y * S]
}
function strekAreal(s: Strek): number {
  return s.w * s.h
}
function iStrek(s: Strek, S: number, q: Pt, tol: number): boolean {
  const a = (s.a * Math.PI) / 180
  const dx = q[0] - s.x * S
  const dy = q[1] - s.y * S
  const lx = dx * Math.cos(a) + dy * Math.sin(a)
  const ly = -dx * Math.sin(a) + dy * Math.cos(a)
  const hw = (s.w * S) / 2 + tol
  const hh = (s.h * S) / 2 + tol
  if (s.form !== "rund") return Math.abs(lx) <= hw && Math.abs(ly) <= hh
  return (lx / hw) ** 2 + (ly / hh) ** 2 <= 1
}

export type Sikt = { n: number; dir: Vec3 | null }

function Kuben({ laast, ...rest }: { laast: boolean } & ComponentProps<typeof GizmoViewcube>) {
  const { tweenCamera } = useGizmoContext()
  const trykk = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.object.position.lengthSq() > 1e-6 || !e.face) return null
    tweenCamera(e.face.normal)
    return null
  }
  return <GizmoViewcube {...rest} onClick={laast ? trykk : undefined} />
}

function FitCamera({ fit, rute, sikt, laast }: { fit: Fit | null; rute: Rute; sikt: Sikt; laast: boolean }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as (Orbit & { target: THREE.Vector3 }) | null
  const invalidate = useThree((s) => s.invalidate)
  const sist = useRef({ r: 0, rute: "", n: 0 })
  const nokkel = `${rute.W}|${rute.H}|${rute.venstre}|${rute.hogre}|${rute.topp}|${rute.botn}`
  useEffect(() => {
    if (!laast) return
    roOrbit(controls)
    invalidate()
  }, [laast, controls, invalidate])
  useEffect(() => {
    if (!fit || !controls) return
    const s = sist.current
    const heim = s.n !== sikt.n
    if (heim) {
      s.n = sikt.n
      s.r = 0
    }
    const flytta = s.rute !== nokkel
    if (!flytta && s.r && Math.abs(fit.r - s.r) / s.r < 0.1) return
    s.r = fit.r
    s.rute = nokkel
    roOrbit(controls)
    const persp = camera as THREE.PerspectiveCamera
    const r = ramme(fit, { rute, fovDeg: persp.fov ?? 30 })
    persp.aspect = r.fri.w / r.fri.h
    persp.setViewOffset(r.fri.w, r.fri.h, -r.fri.L, -r.fri.T, size.width, size.height)
    controls.target.set(0, r.y, 0)
    const h = sikt.dir ?? HEIM
    const dir = heim && !laast ? new THREE.Vector3(...h) : camera.position.clone().sub(controls.target)
    if (dir.lengthSq() < 1e-6) dir.set(...h)
    camera.position.copy(controls.target).add(dir.setLength(r.dist))
    controls.update?.()
    invalidate()
  }, [fit, nokkel, rute, sikt, laast, controls, camera, invalidate, size])
  return null
}

const PAN_SAM = 6
const VRI_SAM = 0.15
const KLYP_SAM = 0.04

type Tak = {
  id: number
  x0: number
  y0: number
  a0: number
  senter: { x: number; y: number }
  pose: { px: number; py: number; phi: number }
  pl: { id: number; o: THREE.Vector3; n: THREE.Vector3 } | null
}

const SNAPP_VRI = (5 * Math.PI) / 180
const SNAPP_PX = 4
function Streket({ f, r, valt, valdStrek, S, boks, arb, snapp, setLive, onSynStrek, onStrek }: {
  f: Ramma | null
  r: Ramme | null
  valt: Plan | null
  valdStrek: number | null
  S: number
  boks: HTMLElement | null
  arb: MutableRefObject<string | null>
  snapp: MutableRefObject<{ vri: boolean; pos: boolean }>
  setLive: (l: Live | null) => void
  onSynStrek: (id: number, i: number, s: Strek) => void
  onStrek: (id: number, i: number, s: Strek) => void
}): null {
  const camera = useThree((q) => q.camera)
  const size = useThree((q) => q.size)
  const controls = useThree((q) => q.controls) as Orbit | null
  const invalidate = useThree((q) => q.invalidate)
  const naa = useRef({ f, r, valt, valdStrek, S, setLive, onSynStrek, onStrek })
  naa.current = { f, r, valt, valdStrek, S, setLive, onSynStrek, onStrek }

  const stakRef = useRef<{ id: number; i: number; plan: number; slag: "flytt" | "stor" | "vri"; s0: Strek; s: Strek | null; r: Ramme; q0: Pt; ang0: number } | null>(null)

  useEffect(() => {
    if (!boks) return
    const slepp = () => {
      stakRef.current = null
      arb.current = null
      if (controls) controls.enabled = true
    }
    const ned = (e: PointerEvent) => {
      const h = (e.target as Element).closest<HTMLElement>("[data-handtak]")
      const slag = h?.dataset.handtak ?? ""
      if (!h || !slag.startsWith("strek-")) return
      if ((e.pointerType === "mouse" && e.button !== 0) || arb.current) return
      const { valt: pl, valdStrek: vi, r: rr, S: SS } = naa.current
      const s0 = pl && vi !== null ? pl.strek[vi] : undefined
      if (!pl || vi === null || !s0 || !rr) return
      e.preventDefault()
      e.stopPropagation()
      const midt = strekMidt(s0, SS)
      const q0 = (naa.current.f && paaPlanetAv(camera, size, naa.current.f, rr, e.clientX, e.clientY)) || midt
      stakRef.current = {
        id: e.pointerId, i: vi, plan: pl.id,
        slag: slag === "strek-flytt" ? "flytt" : slag === "strek-storleik" ? "stor" : "vri",
        s0, s: null, r: rr, q0, ang0: Math.atan2(q0[1] - midt[1], q0[0] - midt[0]),
      }
      arb.current = "strek"
      taKameraet(controls)
      try {
        h.setPointerCapture(e.pointerId)
      } catch {
      }
    }
    const rorsle = (e: PointerEvent) => {
      const stak = stakRef.current
      if (!stak || e.pointerId !== stak.id) return
      const g = naa.current.f
      const q = g && paaPlanetAv(camera, size, g, stak.r, e.clientX, e.clientY)
      if (!q) return
      const SS = naa.current.S
      const s0 = stak.s0
      const sn = { vri: false, pos: false }
      let s: Strek
      if (stak.slag === "flytt") {
        s = { ...s0, x: klem(s0.x + (q[0] - stak.q0[0]) / SS, 1.5), y: klem(s0.y + (q[1] - stak.q0[1]) / SS, 1.5) }
      } else if (stak.slag === "stor") {
        const a = (s0.a * Math.PI) / 180
        const dx = q[0] - stak.q0[0]
        const dy = q[1] - stak.q0[1]
        const lx = dx * Math.cos(a) + dy * Math.sin(a)
        const ly = -dx * Math.sin(a) + dy * Math.cos(a)
        const minst = 0.01 * SS
        let hw = Math.max(minst, (s0.w * SS) / 2 + lx)
        let hh = Math.max(minst, (s0.h * SS) / 2 - ly)
        if (s0.form === "rund" && Math.abs(hw - hh) <= Math.max(0.03 * SS, 0.05 * Math.max(hw, hh))) {
          hw = hh = (hw + hh) / 2
          sn.pos = true
        }
        s = { ...s0, w: Math.min(2, (2 * hw) / SS), h: Math.min(2, (2 * hh) / SS) }
      } else {
        const ang = Math.atan2(q[1] - s0.y * SS, q[0] - s0.x * SS)
        let a = (((s0.a + ((ang - stak.ang0) * 180) / Math.PI) % 360) + 360) % 360
        const naer = Math.round(a / 90) * 90
        if (Math.abs(a - naer) < 5) {
          a = naer % 360
          sn.vri = true
        }
        s = { ...s0, a: +a.toFixed(2) }
      }
      stak.s = s
      snapp.current = sn
      naa.current.setLive({ id: stak.plan, i: stak.i, s })
      naa.current.onSynStrek(stak.plan, stak.i, s)
      invalidate()
    }
    const opp = (e: PointerEvent) => {
      const stak = stakRef.current
      if (!stak || e.pointerId !== stak.id) return
      if (stak.s) naa.current.onStrek(stak.plan, stak.i, stak.s)
      naa.current.setLive(null)
      snapp.current = { vri: false, pos: false }
      slepp()
    }
    boks.addEventListener("pointerdown", ned)
    window.addEventListener("pointermove", rorsle, { passive: true })
    window.addEventListener("pointerup", opp, { passive: true })
    window.addEventListener("pointercancel", opp, { passive: true })
    return () => {
      boks.removeEventListener("pointerdown", ned)
      window.removeEventListener("pointermove", rorsle)
      window.removeEventListener("pointerup", opp)
      window.removeEventListener("pointercancel", opp)
    }
  }, [boks, camera, size, controls, invalidate, arb, snapp])
  return null
}

function Zoom({ onGest }: { onGest: (kva: GestKva) => void }): null {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as (Orbit & { target: THREE.Vector3 }) | null
  const invalidate = useThree((s) => s.invalidate)
  const naa = useRef({ onGest })
  naa.current = { onGest }

  useEffect(() => {
    if (!controls) return
    let dist0 = camera.position.distanceTo(controls.target)
    let total = 1
    let gaar = false
    let timer = 0
    const dolly = (klyp: number) => {
      const k = fovSkala(camera.fov)
      const dist = Math.min(MAX_DIST * k, Math.max(MIN_DIST * k, dist0 / klyp))
      const retn = camera.position.clone().sub(controls.target).setLength(dist)
      camera.position.copy(controls.target).add(retn)
      controls.update?.()
      invalidate()
    }
    const hjul = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      if (!gaar) {
        gaar = true
        dist0 = camera.position.distanceTo(controls.target)
        naa.current.onGest("zoom")
      }
      total *= Math.exp(-e.deltaY * 0.01)
      dolly(total)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        naa.current.onGest(null)
        total = 1
        gaar = false
      }, 500)
    }
    gl.domElement.addEventListener("wheel", hjul, { passive: false, capture: true })
    return () => {
      gl.domElement.removeEventListener("wheel", hjul, { capture: true })
      window.clearTimeout(timer)
    }
  }, [gl, camera, controls, invalidate])
  return null
}

type SnittVerd = { midt: THREE.Vector3; punkt: THREE.Vector3[] }

function Handa({ f, fri, sov, modus, montasje, sideDra, vald, plan, snitt, skisse, boks, storleik, valdStrek, live, rValt, bitar, valdBit, snappSteg, arb, snapp, setLive, onValdStrek, onStrek, onSynStrek, onPlan, onLys, onGest, onSkisse, onValdBit, onBitFlytt, onBitSkala, onBitVri, onRute }: {
  f: Ramma | null
  fri: ReturnType<typeof fritt>
  sov: boolean
  modus: Modus
  snappSteg: number
  arb: MutableRefObject<string | null>
  snapp: MutableRefObject<{ vri: boolean; pos: boolean }>
  montasje: boolean
  sideDra: MutableRefObject<boolean>
  vald: number | null
  plan: readonly Plan[]
  snitt: SkisseSyn | null
  skisse: MutableRefObject<Skisse | null>
  boks: HTMLDivElement | null
  storleik: number
  valdStrek: number | null
  live: Live | null
  rValt: Ramme | null
  bitar: readonly BitBoks[]
  valdBit: number | null
  setLive: (l: Live | null) => void
  onValdStrek: (i: number | null) => void
  onStrek: (id: number, i: number, s: Strek) => void
  onSynStrek: (id: number, i: number, s: Strek) => void
  onPlan: (id: number, o: Vec3, n: Vec3) => void
  onLys: (dx: number, dy: number) => void
  onGest: (kva: GestKva) => void
  onSkisse: (s: Skisse) => void
  onValdBit: (i: number | null) => void
  onBitFlytt: (dmm: Vec3) => void
  onBitSkala: (faktor: number) => void
  onBitVri: (grader: number) => void
  onRute: (dx: number, dy: number) => void
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as (Orbit & { target: THREE.Vector3 }) | null
  const invalidate = useThree((s) => s.invalidate)
  const gruppe = useRef<THREE.Group>(null)
  const pose = useRef({ px: 0, py: 0, phi: Math.PI / 2 })
  const boksFlate = useMemo(() => dynGeom(30), [])
  const boksKant = useMemo(() => dynGeom(24), [])
  useEffect(() => () => { boksFlate.dispose(); boksKant.dispose() }, [boksFlate, boksKant])
  const valt = useMemo(() => (vald === null ? null : plan.find((q) => q.id === vald) ?? null), [vald, plan])
  const synleg = !!f && vald === null && !montasje && modus !== "bit" && modus !== "rute"
  const snittVerd = useMemo<SnittVerd | null>(() => {
    if (!f || !snitt?.ringar.length) return null
    const alle = snitt.ringar.flat()
    const steg = Math.max(1, Math.ceil(alle.length / 240))
    const punkt: THREE.Vector3[] = []
    for (let i = 0; i < alle.length; i += steg) punkt.push(tilVerd(f, ut(snitt.r, alle[i])))
    return { midt: tilVerd(f, ut(snitt.r, snittMidt(snitt))), punkt }
  }, [f, snitt])
  const lapp = useMemo(() => {
    if (!f || !snitt?.ringar.length) return null
    const ledd = new Set(snitt.kryss.map((k) => k.mot)).size
    return { ord: `${ledd} ledd · ${Math.round(snitt.avstand)} mm`, varsel: ledd === 0 && plan.length > (valt ? 1 : 0) }
  }, [f, snitt, plan.length, valt])
  useEffect(() => invalidate(), [synleg, valt, boks, snittVerd, valdStrek, live, invalidate])
  const delar = useMemo(
    () =>
      boks && {
        flytt: boks.querySelector<HTMLElement>('[data-handtak="flytt"]'),
        vri: boks.querySelector<HTMLElement>('[data-handtak="vri"]'),
        arm: boks.querySelector<HTMLElement>("[data-arm]"),
        flyttarm: boks.querySelector<HTMLElement>("[data-flyttarm]"),
        merke: boks.querySelector<HTMLElement>("[data-merke]"),
        ord: boks.querySelector<HTMLElement>("[data-ord]"),
        sFlytt: boks.querySelector<HTMLElement>('[data-handtak="strek-flytt"]'),
        sStor: boks.querySelector<HTMLElement>('[data-handtak="strek-storleik"]'),
        sVri: boks.querySelector<HTMLElement>('[data-handtak="strek-vri"]'),
      },
    [boks],
  )
  const senterPx = useRef({ x: 0, y: 0 })
  const kamSist = useRef({ x: NaN, y: NaN, z: NaN, d: NaN, fov: NaN })
  const sist = useRef<{ o: THREE.Vector3; n: THREE.Vector3 } | null>(null)
  const skrive = useRef("")

  const aksar = () => {
    const M = camera.matrixWorld
    return {
      right: new THREE.Vector3().setFromMatrixColumn(M, 0).normalize(),
      up: new THREE.Vector3().setFromMatrixColumn(M, 1).normalize(),
      fwd: new THREE.Vector3().setFromMatrixColumn(M, 2).negate().normalize(),
    }
  }
  const pxPer = (depth: number) => fri.h / (2 * depth * Math.tan((camera.fov * Math.PI) / 360))
  const straale = (px: number, py: number) =>
    new THREE.Vector3((px / size.width) * 2 - 1, 1 - (py / size.height) * 2, 0.5).unproject(camera).sub(camera.position).normalize()
  const skjerm = (v: THREE.Vector3) => {
    const p = v.clone().project(camera)
    return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height }
  }

  const naa = useRef({ f, vald, valt, modus, montasje, fri, snittVerd, lapp, snitt, storleik, valdStrek, live, rValt, bitar, valdBit, snappSteg, setLive, onValdStrek, onStrek, onSynStrek, onPlan, onLys, onGest, onSkisse, onValdBit, onBitFlytt, onBitSkala, onBitVri, onRute })
  naa.current = { f, vald, valt, modus, montasje, fri, snittVerd, lapp, snitt, storleik, valdStrek, live, rValt, bitar, valdBit, snappSteg, setLive, onValdStrek, onStrek, onSynStrek, onPlan, onLys, onGest, onSkisse, onValdBit, onBitFlytt, onBitSkala, onBitVri, onRute }

  useFrame(() => {
    const g = gruppe.current
    if (!g) return
    g.visible = synleg
    if (boks) {
      const c = camera.position
      const d = controls ? c.distanceTo(controls.target) : 0
      const k = kamSist.current
      if (k.x !== c.x || k.y !== c.y || k.z !== c.z || k.d !== d || k.fov !== camera.fov) {
        kamSist.current = { x: c.x, y: c.y, z: c.z, d, fov: camera.fov }
        boks.dataset.kamera = `${c.x.toFixed(6)},${c.y.toFixed(6)},${c.z.toFixed(6)}`
        boks.dataset.fov = camera.fov.toFixed(3)
        if (controls) boks.dataset.avstand = d.toFixed(3)
      }
    }
    const gøym = () => {
      if (!boks) return
      boks.style.visibility = "hidden"
      if (delar?.merke) delete delar.merke.dataset.skisse
    }
    if (!f || (!synleg && !valt)) {
      sist.current = null
      gøym()
      return
    }
    camera.updateMatrixWorld()
    const { right, up, fwd } = aksar()
    let eige: { x: number; y: number } | null = null
    if (synleg) {
      const p = pose.current
      const d = right.clone().multiplyScalar(Math.cos(p.phi)).addScaledVector(up, Math.sin(p.phi))
      const n = new THREE.Vector3().crossVectors(d, fwd).normalize()
      const ray = straale(fri.L + fri.w / 2 + p.px, fri.T + fri.h / 2 + p.py)
      const depth = tilVerd(f, f.midt).sub(camera.position).dot(fwd)
      const o = camera.position.clone().addScaledVector(ray, depth / Math.max(1e-6, ray.dot(fwd)))
      const oM = fraaVerd(f, o)
      const nM = nFraaVerd(n)
      skisse.current = { o: oM, n: nM }
      const s = sist.current
      if (!s || s.o.distanceToSquared(o) > 1e-8 || s.n.distanceToSquared(n) > 1e-8) {
        sist.current = { o: o.clone(), n: n.clone() }
        skrivPolygon(boksFlate, boksKant, planIBoks({ o: oM, n: nM, ...akser(nM), k: 0 }, f.min, f.max).map((q) => tilVerd(f, q)))
        onSkisse(skisse.current)
      }
      eige = skjerm(o)
    }
    if (!boks || !delar) return
    const sett = (h: HTMLElement, x: number, y: number) => {
      h.style.left = `${x - 24}px`
      h.style.top = `${y - 24}px`
    }
    const { flytt, vri, arm, flyttarm, merke, ord, sFlytt, sStor, sVri } = delar
    if (flyttarm) flyttarm.hidden = true
    const sv = naa.current.snittVerd
    if (!sv) {
      boks.dataset.tom = ""
      delete boks.dataset.strek
      if (!eige) return gøym()
      senterPx.current = eige
      boks.style.visibility = "visible"
      boks.dataset.slag = "skisse"
      if (flytt) sett(flytt, eige.x, eige.y)
      if (merke) delete merke.dataset.skisse
      return
    }
    delete boks.dataset.tom
    const c = skjerm(sv.midt)
    senterPx.current = c
    let topp = c.y
    for (const q of sv.punkt) topp = Math.min(topp, skjerm(q).y)
    const vy = Math.max(Math.min(topp, c.y - 56), Math.min(c.y - 56, fri.T + 36))
    const inne = c.x > -40 && c.x < size.width + 40 && c.y > -40 && c.y < size.height + 40
    boks.style.visibility = inne ? "visible" : "hidden"
    boks.dataset.slag = synleg ? "skisse" : "plan"
    let flyttPx = c
    if (valt && naa.current.valdStrek === null && snitt) {
      const opptekne = [
        { x: c.x, y: vy },
        ...(snitt.spor ?? []).map((q) => skjerm(tilVerd(f, ut(snitt.r, q.botn)))),
        ...(valt.omriss && rValt ? valt.omriss.map((p) => skjerm(tilVerd(f, ut(rValt, [p[0] * storleik, p[1] * storleik])))) : []),
      ]
      const ledig = (p: { x: number; y: number }) => p.x >= fri.L + 24 && p.x <= fri.L + fri.w - 24 && p.y >= fri.T + 24 && p.y <= fri.T + fri.h - 24 && opptekne.every((q) => Math.abs(p.x - q.x) >= 48 || Math.abs(p.y - q.y) >= 48)
      const steg = [[0, 0], [0, 64], [-64, 0], [64, 0], [-64, 64], [64, 64], [0, 128], [-128, 0], [128, 0]]
      flyttPx = steg.map(([x, y]) => ({ x: c.x + x, y: c.y + y })).find(ledig) ?? c
    }
    if (flytt) sett(flytt, flyttPx.x, flyttPx.y)
    if (flyttarm && flyttPx !== c) {
      const x = flyttPx.x - c.x, y = flyttPx.y - c.y
      flyttarm.hidden = false
      flyttarm.style.width = `${Math.hypot(x, y)}px`
      flyttarm.style.transform = `translate(${c.x}px, ${c.y}px) rotate(${Math.atan2(y, x)}rad)`
    }
    if (vri) sett(vri, c.x, vy)
    if (arm) {
      arm.style.width = `${c.y - vy}px`
      arm.style.transform = `translate(${c.x}px, ${c.y}px) rotate(-90deg)`
    }
    const st = naa.current
    const S = st.storleik
    const s = st.live?.s ?? (st.valt && st.valdStrek !== null ? st.valt.strek[st.valdStrek] : undefined)
    if (s && st.rValt && sFlytt && sStor && sVri) {
      boks.dataset.strek = ""
      const a = (s.a * Math.PI) / 180
      const co = Math.cos(a)
      const si = Math.sin(a)
      const midt = strekMidt(s, S)
      const cx = midt[0]
      const cy = midt[1]
      const hw = (s.w * S) / 2
      const hh = (s.h * S) / 2
      const r = st.rValt
      const paa = (lx: number, ly: number) => skjerm(tilVerd(f, ut(r, [cx + lx * co - ly * si, cy + lx * si + ly * co])))
      const m = paa(0, 0)
      const ute = (q: { x: number; y: number }, fall: [number, number], ekstra: number) => {
        let vx = q.x - m.x
        let vy2 = q.y - m.y
        const L = Math.hypot(vx, vy2)
        if (L < 1) [vx, vy2] = fall
        else {
          vx /= L
          vy2 /= L
        }
        const R = Math.max(L + ekstra, 56)
        return { x: m.x + vx * R, y: m.y + vy2 * R }
      }
      const h = ute(paa(hw, -hh), [1, 1], 0)
      const t = ute(paa(0, hh), [0, -1], 36)
      sett(sFlytt, m.x, m.y)
      sett(sStor, h.x, h.y)
      sett(sVri, t.x, t.y)
    } else delete boks.dataset.strek
    if (merke) {
      merke.style.transform = `translate(${c.x + 30}px, ${c.y - 10}px)`
      merke.dataset.skisse = "snitt"
      const l = naa.current.lapp
      const ordStrek = (q: Strek) =>
        `${q.slag === "gods" ? "gods" : "hòl"} ${Math.round(q.w * S)}×${Math.round(q.h * S)} mm${q.a ? ` · ${Math.round(q.a)}°` : ""}`
      const tekst = s ? ordStrek(s) : `${synleg ? "" : `${valt!.id} · `}${l ? l.ord : synleg ? "skisse" : ""}`
      if (ord && tekst !== skrive.current) {
        skrive.current = tekst
        ord.textContent = tekst
      }
      if (l?.varsel) merke.dataset.varsel = ""
      else delete merke.dataset.varsel
      const sn = snapp.current
      if (sn.vri || sn.pos) merke.dataset.snapp = [sn.vri ? "vri" : "", sn.pos ? "pos" : ""].filter(Boolean).join(" ")
      else delete merke.dataset.snapp
    }
  })

  useEffect(() => {
    const el = gl.domElement
    const pts = new Map<number, { x: number; y: number }>()
    type Gest = "none" | "sam" | "lys" | "hFlytt" | "hVri" | "musFlytt" | "musVri" | "musRute"
    let mode: Gest = "none"
    let musRute = { x: 0, y: 0, id: -1 }
    const handtakGaar = () => sideDra.current || !!arb.current || mode === "hFlytt" || mode === "hVri"
    let svelgKlikk = false
    let sam = { x0: 0, y0: 0, d0: 1, sistA: 0, vri: 0, akt: { pan: false, vri: false, klyp: false }, sagt: null as GestKva }
    const bitStil = () => naa.current.modus === "bit" && naa.current.valdBit !== null
    const ruteStil = () => naa.current.modus === "rute"
    let last = { cx: 0, cy: 0, d: 0, a: 0 }
    let snap: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
    let tak: Tak | null = null
    let tapDown = { x: 0, y: 0, t: 0, id: -1 }

    const restore = (til: { pos: THREE.Vector3; target: THREE.Vector3 } | null = snap) => {
      if (!til || !controls) return
      roOrbit(controls)
      camera.position.copy(til.pos)
      controls.target.copy(til.target)
      controls.update?.()
      invalidate()
    }
    const her = () => (controls ? { pos: camera.position.clone(), target: controls.target.clone() } : null)
    const measure2 = () => {
      const [a, b] = [...pts.values()]
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) }
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
    const taTak = (x0: number, y0: number, id = -1): Tak | null => {
      const { f, valt } = naa.current
      if (!f) return null
      let pl: Tak["pl"] = null
      if (valt) {
        const r = planRamme(valt, f.min, f.max)
        pl = { id: valt.id, o: tilVerd(f, r.o), n: nTilVerd(r.n) }
      }
      return { id, x0, y0, a0: 0, senter: { ...senterPx.current }, pose: { ...pose.current }, pl }
    }
    const bruk = (t: Tak, dx: number, dy: number, ang: number) => {
      const { f, onPlan, fri } = naa.current
      if (!f) return
      const sn = { vri: false, pos: false }
      if (t.pl) {
        const { right, up, fwd } = aksar()
        const n = t.pl.n.clone()
        if (ang) {
          n.applyAxisAngle(fwd, ang)
          const ns = new THREE.Vector2(n.dot(right), -n.dot(up))
          const steg = (naa.current.snappSteg * Math.PI) / 180
          if (steg && ns.length() > 0.05) {
            const a = Math.atan2(ns.y, ns.x)
            const q = Math.round(a / steg) * steg
            if (Math.abs(a - q) < SNAPP_VRI) {
              n.applyAxisAngle(fwd, q - a)
              sn.vri = true
            }
          }
        }
        const o = t.pl.o.clone()
        if (dx || dy) {
          const k = pxPer(Math.max(0.1, o.clone().sub(camera.position).dot(fwd)))
          const ns = new THREE.Vector2(n.dot(right) * k, -n.dot(up) * k)
          if (ns.length() > 0.05 * k) {
            o.addScaledVector(n, (dx * ns.x + dy * ns.y) / ns.lengthSq())
            const dc = tilVerd(f, f.midt).sub(o).dot(n)
            if (Math.abs(dc) * ns.length() < SNAPP_PX) {
              o.addScaledVector(n, dc)
              sn.pos = true
            }
          }
        }
        onPlan(t.pl.id, broek(fraaVerd(f, o), f.min, f.max), nFraaVerd(n))
      } else {
        const p = pose.current
        let phi = t.pose.phi - ang
        const stegP = (naa.current.snappSteg * Math.PI) / 180
        if (ang && stegP) {
          const q = Math.round(phi / stegP) * stegP
          if (Math.abs(phi - q) < SNAPP_VRI) {
            phi = q
            sn.vri = true
          }
        }
        p.phi = phi
        const k = dx * Math.sin(t.pose.phi) + dy * Math.cos(t.pose.phi)
        p.px = klem(t.pose.px + k * Math.sin(t.pose.phi), fri.w / 2 - 24)
        p.py = klem(t.pose.py + k * Math.cos(t.pose.phi), fri.h / 2 - 24)
        if (dx || dy) {
          const m = skjerm(tilVerd(f, f.midt))
          const av = (m.x - (fri.L + fri.w / 2) - p.px) * Math.sin(phi) + (m.y - (fri.T + fri.h / 2) - p.py) * Math.cos(phi)
          if (Math.abs(av) < SNAPP_PX) {
            p.px += av * Math.sin(phi)
            p.py += av * Math.cos(phi)
            sn.pos = true
          }
        }
      }
      snapp.current = sn
      invalidate()
    }
    const flytt = (t: Tak, dx: number, dy: number) => bruk(t, dx, dy, 0)
    const flyttBit = (dx: number, dy: number) => {
      const { f } = naa.current
      if (!f) return
      const { right, fwd } = aksar()
      const midt = tilVerd(f, f.midt)
      const k = pxPer(Math.max(0.1, midt.clone().sub(camera.position).dot(fwd)))
      const v = right.clone().multiplyScalar(dx / k).add(new THREE.Vector3(0, -dy / k, 0))
      naa.current.onBitFlytt([v.x / f.s, -v.z / f.s, v.y / f.s])
    }
    const trykkBit = (px: number, py: number) => {
      const { f, bitar } = naa.current
      if (!f) return
      const ray = new THREE.Ray(camera.position.clone(), straale(px, py))
      const treff = new THREE.Vector3()
      let best: { i: number; d: number } | null = null
      bitar.forEach((b, i) => {
        const a = tilVerd(f, b.min)
        const c2 = tilVerd(f, b.max)
        const boks = new THREE.Box3(new THREE.Vector3(Math.min(a.x, c2.x), Math.min(a.y, c2.y), Math.min(a.z, c2.z)), new THREE.Vector3(Math.max(a.x, c2.x), Math.max(a.y, c2.y), Math.max(a.z, c2.z)))
        if (!ray.intersectBox(boks, treff)) return
        const d = treff.distanceTo(camera.position)
        if (!best || d < best.d) best = { i, d }
      })
      naa.current.onValdBit(best === null ? null : (best as { i: number }).i)
    }
    const vri = (t: Tak, ang: number) => bruk(t, 0, 0, ang)
    const slepp = () => {
      mode = "none"
      tak = null
      naa.current.onGest(null)
    }
    const sleppHandtak = () => {
      if (controls) controls.enabled = true
      slepp()
    }
    const paaPlanet = (px: number, py: number, r: Ramme): Pt | null => {
      const { f } = naa.current
      return f ? paaPlanetAv(camera, size, f, r, px, py) : null
    }
    const trykkStrek = (x: number, y: number) => {
      const { f, valt, valdStrek, rValt, storleik: S, snitt, onValdStrek } = naa.current
      if (!f || !valt || !rValt || (!valt.strek.length && valdStrek === null)) return
      const q = paaPlanet(x, y, rValt)
      if (!q) return
      const { fwd } = aksar()
      const tol = 8 / (pxPer(Math.max(0.1, tilVerd(f, rValt.o).sub(camera.position).dot(fwd))) * f.s)
      let treff = -1
      let minst = Infinity
      valt.strek.forEach((s, i) => {
        if (iStrek(s, S, q, tol) && strekAreal(s) < minst) {
          minst = strekAreal(s)
          treff = i
        }
      })
      if (treff >= 0) {
        if (treff !== valdStrek) onValdStrek(treff)
        svelgKlikk = true
        return
      }
      if (valdStrek === null || !snitt) return
      const pr: Pt = [q[0] + dot(rValt.o, rValt.u), q[1] + dot(rValt.o, rValt.v)]
      let n = 0
      for (const ring of snitt.ringar) if (inRing(ring, pr)) n++
      if (n % 2 === 1) {
        onValdStrek(null)
        svelgKlikk = true
      }
    }

    const DRAG_PX = 12
    let attheld: { id: number; x: number; y: number } | null = null

    const ned = (e: PointerEvent) => {
      svelgKlikk = false
      if (handtakGaar()) return e.stopImmediatePropagation()
      tapDown = pts.size === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : { x: 0, y: 0, t: 0, id: -1 }
      if (e.pointerType !== "touch") {
        if (ruteStil() && e.button === 0 && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.stopImmediatePropagation()
          e.preventDefault()
          mode = "musRute"
          musRute = { x: e.clientX, y: e.clientY, id: e.pointerId }
          taKameraet(controls)
          naa.current.onGest("rute")
          return
        }
        if (!(e.shiftKey || e.altKey) || e.button !== 0) return
        e.stopImmediatePropagation()
        e.preventDefault()
        tak = taTak(e.clientX, e.clientY, e.pointerId)
        if (!tak) return
        mode = e.altKey ? "musVri" : "musFlytt"
        naa.current.onGest("snitt")
        return
      }
      if (e.pointerType === "touch" && pts.size === 0) attheld = { id: e.pointerId, x: e.clientX, y: e.clientY }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1 && controls) snap = { pos: camera.position.clone(), target: controls.target.clone() }
      if (pts.size === 2 && mode !== "lys") {
        const heldAtt = !!attheld
        const staar = her()
        attheld = null
        taKameraet(controls)
        const c = measure2()
        last = c
        restore(heldAtt ? snap : staar)
        tak = taTak(c.cx, c.cy)
        sam = { x0: c.cx, y0: c.cy, d0: Math.max(1, c.d), sistA: c.a, vri: 0, akt: { pan: false, vri: false, klyp: false }, sagt: null }
        mode = "sam"
      }
      if (pts.size === 3) {
        mode = "lys"
        const c = centroid()
        last = { cx: c.x, cy: c.y, d: 0, a: 0 }
        const staar3 = her()
        taKameraet(controls)
        restore(attheld ? snap : staar3)
        naa.current.onGest("lys")
      }
    }

    const rorsle = (e: PointerEvent) => {
      if (attheld && e.pointerId === attheld.id && pts.size === 1 && mode === "none") {
        if (Math.hypot(e.clientX - attheld.x, e.clientY - attheld.y) < DRAG_PX) restore()
        else attheld = null
      }
      if (mode === "musRute") {
        if (e.pointerId !== musRute.id) return
        naa.current.onRute(e.clientX - musRute.x, e.clientY - musRute.y)
        return
      }
      if (mode === "musFlytt" || mode === "musVri") {
        if (!tak) return
        const dx = e.clientX - tak.x0
        const dy = e.clientY - tak.y0
        if (mode === "musVri") vri(tak, dx * 0.01)
        else flytt(tak, dx, dy)
        return
      }
      if (mode === "hFlytt" || mode === "hVri") {
        if (!tak || e.pointerId !== tak.id) return
        if (mode === "hFlytt") flytt(tak, e.clientX - tak.x0, e.clientY - tak.y0)
        else vri(tak, vinkel(Math.atan2(e.clientY - tak.senter.y, e.clientX - tak.senter.x), tak.a0))
        return
      }
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (mode === "lys") {
        if (pts.size < 3) return
        const c = centroid()
        naa.current.onLys(c.x - last.cx, c.y - last.cy)
        last = { cx: c.x, cy: c.y, d: 0, a: 0 }
        return
      }
      if (pts.size !== 2) return
      if (mode !== "sam") return
      const c = measure2()
      if (naa.current.montasje) {
        last = c
        return
      }
      sam.vri += vinkel(c.a, sam.sistA)
      sam.sistA = c.a
      const panX = c.cx - sam.x0
      const panY = c.cy - sam.y0
      const klyp = c.d / sam.d0
      if (!sam.akt.pan && Math.hypot(panX, panY) > PAN_SAM) sam.akt.pan = true
      if (!sam.akt.vri && Math.abs(sam.vri) > VRI_SAM) sam.akt.vri = true
      const paaBit = bitStil()
      const rute = ruteStil()
      const arbeider = sam.akt.pan || sam.akt.vri
      if (paaBit && !sam.akt.klyp && Math.abs(klyp - 1) > KLYP_SAM) sam.akt.klyp = true
      const sagt: GestKva = arbeider || (paaBit && sam.akt.klyp) ? (rute ? "rute" : "snitt") : null
      if (sagt !== sam.sagt) {
        sam.sagt = sagt
        naa.current.onGest(sagt)
      }
      if (paaBit) {
        if (sam.akt.klyp) naa.current.onBitSkala(klyp)
        if (sam.akt.vri) naa.current.onBitVri((-sam.vri * 180) / Math.PI)
        if (sam.akt.pan) flyttBit(panX, panY)
      } else if (rute) {
        if (sam.akt.pan) naa.current.onRute(panX, panY)
      } else {
        if (arbeider && tak) bruk(tak, sam.akt.pan ? panX : 0, sam.akt.pan ? panY : 0, sam.akt.vri ? sam.vri : 0)
      }
      last = c
    }

    const opp = (e: PointerEvent) => {
      if (e.pointerId === tapDown.id) {
        const flytta = Math.hypot(e.clientX - tapDown.x, e.clientY - tapDown.y)
        if (performance.now() - tapDown.t < 260 && flytta < 12) {
          if (naa.current.modus === "bit") trykkBit(e.clientX, e.clientY)
          else trykkStrek(e.clientX, e.clientY)
        } else if (flytta >= 12) {
          svelgKlikk = true
        }
        tapDown = { x: 0, y: 0, t: 0, id: -1 }
      }
      if (mode === "musRute") return sleppHandtak()
      if (mode === "musFlytt" || mode === "musVri") return slepp()
      if ((mode === "hFlytt" || mode === "hVri") && tak && e.pointerId === tak.id) return sleppHandtak()
      if (attheld && e.pointerId === attheld.id) attheld = null
      if (!pts.delete(e.pointerId)) return
      if (pts.size === 0) {
        slepp()
        snap = null
        if (controls) controls.enabled = true
      } else if (pts.size < 2 && mode !== "lys") slepp()
    }

    const nedHandtak = (e: PointerEvent) => {
      const h = (e.target as Element).closest<HTMLElement>("[data-handtak]")
      if (!h || (e.pointerType === "mouse" && e.button !== 0)) return
      const slag = h.dataset.handtak ?? ""
      if (slag.startsWith("strek-")) return
      e.preventDefault()
      e.stopPropagation()
      if (handtakGaar()) return
      const t = taTak(e.clientX, e.clientY, e.pointerId)
      if (!t) return
      if (slag === "vri") {
        t.a0 = Math.atan2(e.clientY - t.senter.y, e.clientX - t.senter.x)
        mode = "hVri"
      } else mode = "hFlytt"
      tak = t
      try {
        h.setPointerCapture(e.pointerId)
      } catch {
      }
      taKameraet(controls)
      naa.current.onGest("snitt")
    }
    const svelg = (e: MouseEvent) => {
      if (!svelgKlikk) return
      svelgKlikk = false
      if (e.target === el) e.stopImmediatePropagation()
    }

    const taTouchen = (e: TouchEvent) => { if (e.touches.length >= 2) e.preventDefault() }
    el.addEventListener("touchstart", taTouchen, { passive: false })
    el.addEventListener("touchmove", taTouchen, { passive: false })
    el.addEventListener("pointerdown", ned, { capture: true })
    boks?.addEventListener("pointerdown", nedHandtak)
    window.addEventListener("click", svelg, { capture: true })
    const vindu: [string, (e: PointerEvent) => void][] = [["pointermove", rorsle], ["pointerup", opp], ["pointercancel", opp]]
    for (const [n, h] of vindu) window.addEventListener(n, h as EventListener, { passive: true })
    return () => {
      el.removeEventListener("touchstart", taTouchen)
      el.removeEventListener("touchmove", taTouchen)
      el.removeEventListener("pointerdown", ned, { capture: true })
      boks?.removeEventListener("pointerdown", nedHandtak)
      window.removeEventListener("click", svelg, { capture: true })
      for (const [n, h] of vindu) window.removeEventListener(n, h as EventListener)
      if (controls) controls.enabled = true
    }
  }, [gl, controls, camera, invalidate, boks, sideDra])

  return (
    <group ref={gruppe} visible={false}>
      <Sovnen sov={sov}>
        <mesh geometry={boksFlate} renderOrder={2} frustumCulled={false}>
          <meshBasicMaterial color={SKISSE} transparent opacity={0.06} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <lineSegments geometry={boksKant} renderOrder={3} frustumCulled={false}>
          <lineBasicMaterial color={SKISSE} transparent opacity={0.4} depthTest={false} />
        </lineSegments>
      </Sovnen>
    </group>
  )
}

function Snittet({ f, snitt, farge }: { f: Ramma; snitt: SkisseSyn; farge: string }) {
  const g = useMemo(() => {
    const V = (q: Pt) => new THREE.Vector2(q[0], q[1])
    const ytre: THREE.Vector2[][] = []
    const hol: THREE.Vector2[][] = []
    for (const r of snitt.ringar) (shoelace(r) > 0 ? ytre : hol).push(r.map(V))
    if (!ytre.length) ytre.push(...hol.splice(0))
    const pos: number[] = []
    for (const o of ytre) {
      const mine = hol.filter((h) => inRing(o.map((v) => [v.x, v.y] as Pt), [h[0].x, h[0].y]))
      const tri = THREE.ShapeUtils.triangulateShape(o, mine)
      const alle = [...o, ...mine.flat()]
      for (const t of tri) for (const i of t) pos.push(...ut(snitt.r, [alle[i].x, alle[i].y]))
    }
    const lin: number[] = []
    for (const r of snitt.ringar) for (let i = 0; i < r.length; i++) lin.push(...ut(snitt.r, r[i]), ...ut(snitt.r, r[(i + 1) % r.length]))
    const w = Math.max(0.8, 0.012 * diag(f)) / 2
    const kr: number[] = []
    for (const { a, b } of snitt.kryss) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      const px = (-(b[1] - a[1]) / L) * w
      const py = ((b[0] - a[0]) / L) * w
      const c = [ut(snitt.r, [a[0] + px, a[1] + py]), ut(snitt.r, [b[0] + px, b[1] + py]), ut(snitt.r, [b[0] - px, b[1] - py]), ut(snitt.r, [a[0] - px, a[1] - py])]
      kr.push(...c[0], ...c[1], ...c[2], ...c[0], ...c[2], ...c[3])
    }
    return { flate: mkGeom(pos), kant: mkGeom(lin), kryss: mkGeom(kr) }
  }, [snitt, f])
  useEffect(() => () => { g.flate.dispose(); g.kant.dispose(); g.kryss.dispose() }, [g])
  return (
    <group {...gruppa(f)}>
      <mesh geometry={g.flate} raycast={() => null} renderOrder={4}>
        <meshBasicMaterial color={farge} transparent opacity={0.22} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={g.kant} renderOrder={5}>
        <lineBasicMaterial color={farge} depthTest={false} />
      </lineSegments>
      <mesh geometry={g.kryss} raycast={() => null} renderOrder={6}>
        <meshBasicMaterial color={farge} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Spora({ f, snitt, boks, onDeling }: {
  f: Ramma
  snitt: SkisseSyn
  boks: HTMLDivElement | null
  onDeling: (nokkel: string, t: number) => void
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as Orbit | null
  const spor = useMemo(() => snitt.spor ?? [], [snitt])
  const paa = (q: (typeof spor)[number], t: number): Pt => {
    const b = q.boge ?? [q.lo, q.hi]
    const d = Math.min(Math.max(0, t), 1) * (b.length - 1)
    const i = Math.min(b.length - 2, Math.floor(d))
    const f = d - i
    return [b[i][0] + (b[i + 1][0] - b[i][0]) * f, b[i][1] + (b[i + 1][1] - b[i][1]) * f]
  }
  const naa = useRef({ f, snitt, spor, onDeling })
  naa.current = { f, snitt, spor, onDeling }
  const skrive = useRef<Record<string, string>>({})
  const band = useMemo(() => {
    const lin: number[] = []
    for (const q of spor) {
      const n = (q.boge?.length ?? 2) - 1
      for (let i = 0; i < n; i++) {
        const a = DELING_MIN + ((DELING_MAX - DELING_MIN) * i) / n
        const b = DELING_MIN + ((DELING_MAX - DELING_MIN) * (i + 1)) / n
        lin.push(...ut(snitt.r, paa(q, a)), ...ut(snitt.r, paa(q, b)))
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(lin, 3))
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spor, snitt.r])
  useEffect(() => () => band.dispose(), [band])

  useEffect(() => {
    if (!boks) return
    let dra: { nokkel: string; id: number; A: THREE.Vector3; u: THREE.Vector3; aa: number } | null = null
    const ned = (e: PointerEvent) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-spor]")
      const q = naa.current.spor.find((x) => x.nokkel === el?.dataset.spor)
      const g = naa.current.f
      if (!e.isPrimary || !el || !q || !g) return
      e.preventDefault()
      e.stopPropagation()
      const A = tilVerd(g, ut(naa.current.snitt.r, paa(q, DELING_MIN)))
      const B = tilVerd(g, ut(naa.current.snitt.r, paa(q, DELING_MAX)))
      const u = B.clone().sub(A)
      const aa = u.dot(u)
      if (aa < 1e-9) return
      dra = { nokkel: q.nokkel, id: e.pointerId, A, u, aa }
      el.setPointerCapture(e.pointerId)
      taKameraet(controls)
    }
    const rorsle = (e: PointerEvent) => {
      if (!dra || e.pointerId !== dra.id) return
      const rute = gl.domElement.getBoundingClientRect()
      const d = new THREE.Vector3(((e.clientX - rute.left) / rute.width) * 2 - 1, 1 - ((e.clientY - rute.top) / rute.height) * 2, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize()
      const w0 = dra.A.clone().sub(camera.position)
      const b = dra.u.dot(d)
      const dd = dra.u.dot(w0)
      const ee = d.dot(w0)
      const nemn = dra.aa - b * b
      const sn = Math.abs(nemn) < 1e-9 ? 0 : (b * ee - dd) / nemn
      const t = DELING_MIN + Math.min(1, Math.max(0, sn)) * (DELING_MAX - DELING_MIN)
      naa.current.onDeling(dra.nokkel, +t.toFixed(3))
    }
    const opp = () => {
      if (!dra) return
      dra = null
      if (controls) controls.enabled = true
    }
    boks.addEventListener("pointerdown", ned)
    window.addEventListener("pointermove", rorsle, { passive: true })
    window.addEventListener("pointerup", opp, { passive: true })
    window.addEventListener("pointercancel", opp, { passive: true })
    return () => {
      boks.removeEventListener("pointerdown", ned)
      window.removeEventListener("pointermove", rorsle)
      window.removeEventListener("pointerup", opp)
      window.removeEventListener("pointercancel", opp)
      if (controls) controls.enabled = true
    }
  }, [boks, camera, controls, gl])

  useFrame(() => {
    if (!boks) return
    const g = naa.current.f
    if (!g) return
    camera.updateMatrixWorld()
    for (const q of naa.current.spor) {
      const el = boks.querySelector<HTMLElement>(`[data-spor="${q.nokkel}"]`)
      if (!el) continue
      const v = tilVerd(g, ut(naa.current.snitt.r, q.botn)).project(camera)
      const t = `translate(${(((v.x + 1) / 2) * size.width).toFixed(1)}px, ${(((1 - v.y) / 2) * size.height).toFixed(1)}px) translate(-50%, -50%)`
      if (skrive.current[q.nokkel] !== t) {
        skrive.current[q.nokkel] = t
        el.style.transform = t
      }
      const o = v.z > 1 ? "0" : "1"
      if (el.style.opacity !== o) el.style.opacity = o
    }
  })
  return (
    <group {...gruppa(f)}>
      <lineSegments geometry={band} renderOrder={7}>
        <lineBasicMaterial color={VALT} transparent opacity={0.4} depthTest={false} />
      </lineSegments>
    </group>
  )
}

const MIDT_MIN = 84
function Teikneplanet({ f, ut }: { f: Ramma; ut: MutableRefObject<(() => { o: Vec3; n: Vec3 }) | null> }): null {
  const camera = useThree((q) => q.camera)
  useEffect(() => {
    ut.current = () => {
      const fwd = new THREE.Vector3()
      camera.updateMatrixWorld()
      camera.getWorldDirection(fwd)
      return { o: broek(f.midt, f.min, f.max), n: teikneNormal(nFraaVerd(fwd.multiplyScalar(-1))) }
    }
    return () => { ut.current = null }
  }, [camera, f, ut])
  return null
}

function Teikninga({ f, S, fri, slag, svg, arb, plan, onLukk }: {
  f: Ramma
  S: number
  fri: ReturnType<typeof fritt>
  slag: "firkant" | "kontur"
  svg: SVGSVGElement | null
  arb: MutableRefObject<string | null>
  plan: readonly Plan[]
  onLukk: (o: Vec3, n: Vec3, omriss: Pt[]) => void
}): null {
  const camera = useThree((q) => q.camera)
  const gl = useThree((q) => q.gl)
  const size = useThree((q) => q.size)
  const controls = useThree((q) => q.controls) as Orbit | null
  const invalidate = useThree((q) => q.invalidate)
  const frose = useRef<Ramme | null>(null)
  const liner = useRef<Snappline[]>([])
  useTeikning({
    slag, svg, arb, fri, S, controls, invalidate, lerret: gl.domElement,
    taKameraet: () => taKameraet(controls),
    onStart: () => {
      const fwd = new THREE.Vector3()
      camera.updateMatrixWorld()
      camera.getWorldDirection(fwd)
      frose.current = planRamme({ o: broek(f.midt, f.min, f.max), n: teikneNormal(nFraaVerd(fwd.multiplyScalar(-1))) }, f.min, f.max)
      liner.current = snappliner(plan, f.min, f.max, S, frose.current)
    },
    snapp: (q, tol) => snapp(q, liner.current, tol),
    paaFlata: (x, y) => {
      const r = frose.current
      if (!r) return null
      const rute = gl.domElement.getBoundingClientRect()
      const q = paaPlanetAv(camera, rute, f, r, x - rute.left, y - rute.top)
      return q ? q.map((v) => +Math.max(-4, Math.min(4, v / S)).toFixed(4)) as Pt : null
    },
    paaSkjermen: (punkt) => {
      const r = frose.current
      if (!r) return []
      camera.updateMatrixWorld()
      return punkt.map((q) => {
        const v = tilVerd(f, ut(r, [q[0] * S, q[1] * S])).project(camera)
        return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height]
      })
    },
    onLukk: (omriss, slag, tol, snappa) => { const r = frose.current; if (r) onLukk(r.o, r.n, rettOpp(omriss, slag, plan.length ? tol * 32 : Infinity, Math.abs(r.n[2]) > 0.999, snappa)) },
  })
  return null
}

const LANG_MS = 600

function Omrisset({ f, r, omriss, runde, S, fri, boks, snappSteg, onPunkt, onLeggPunkt, onTaPunkt, onVriPunkt, onValdPunkt, onSlaaSaman }: {
  f: Ramma
  r: Ramme
  omriss: readonly Pt[]
  runde: readonly number[] | undefined
  S: number
  fri: ReturnType<typeof fritt>
  boks: HTMLDivElement | null
  snappSteg: number
  onPunkt: (i: number, q: Pt) => void
  onSlaaSaman: (i: number, mot: number) => void
  onLeggPunkt: (i: number, q: Pt) => void
  onTaPunkt: (i: number) => void
  onVriPunkt: (i: number) => void
  onValdPunkt: (i: number | null) => void
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as Orbit | null
  const naa = useRef({ f, r, omriss, runde, S, fri, snappSteg, onPunkt, onLeggPunkt, onTaPunkt, onVriPunkt, onValdPunkt, onSlaaSaman })
  naa.current = { f, r, omriss, runde, S, fri, snappSteg, onPunkt, onLeggPunkt, onTaPunkt, onVriPunkt, onValdPunkt, onSlaaSaman }
  const skrive = useRef<Record<string, string>>({})
  const lina = useMemo(() => {
    const l = omrissLine(omriss, runde)
    const n = l.length
    const pts: number[] = []
    for (let k = 0; k < n; k++) {
      pts.push(...ut(r, [l[k][0] * S, l[k][1] * S]), ...ut(r, [l[(k + 1) % n][0] * S, l[(k + 1) % n][1] * S]))
    }
    return mkGeom(pts)
  }, [r, omriss, runde, S])
  useEffect(() => () => lina.dispose(), [lina])

  useEffect(() => {
    if (!boks) return
    let dra: { i: number; id: number; q0: Pt; p0: Pt; x0: number; y0: number; ny: boolean; g: Ramma; r: Ramme; rPx: number; snapp: { slag: string; mot?: number } | null } | null = null
    let sisteTrykk = { i: -1, t: 0 }
    let svelgKlikk = false
    let lang = 0
    const svelg = (e: MouseEvent) => {
      if (!svelgKlikk) return
      svelgKlikk = false
      if (e.target === gl.domElement) e.stopPropagation()
    }
    const paaFlata = (e: PointerEvent, g: Ramma, rr: Ramme): Pt | null => {
      const rute = gl.domElement.getBoundingClientRect()
      const d = new THREE.Vector3(((e.clientX - rute.left) / rute.width) * 2 - 1, 1 - ((e.clientY - rute.top) / rute.height) * 2, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize()
      const n = nTilVerd(rr.n)
      const k = d.dot(n)
      if (Math.abs(k) < 0.02) return null
      const t = tilVerd(g, rr.o).sub(camera.position).dot(n) / k
      if (t <= 0) return null
      return inn(rr, fraaVerd(g, camera.position.clone().addScaledVector(d, t)))
    }
    const SNAPP_PX_OMRISS = 12
    const SNAPP_SAMAN_PX = 5
    const radius = (e: PointerEvent, g: Ramma, rr: Ramme): number => {
      const a = paaFlata(e, g, rr)
      const b = paaFlata({ clientX: e.clientX + SNAPP_PX_OMRISS, clientY: e.clientY } as PointerEvent, g, rr)
      if (!a || !b) return 0
      const S = naa.current.S || 1
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) / S
      return Number.isFinite(d) && d > 0 ? d : 0
    }
    const ned = (e: PointerEvent) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-punkt], [data-midt]")
      if (!e.isPrimary || !el) return
      const { f: g, r: rr, omriss: om, runde: ru } = naa.current
      const q0 = paaFlata(e, g, rr)
      if (!q0) return
      if (el.dataset.midt !== undefined) {
        const i = Number(el.dataset.midt)
        const a = om[i]
        const b = om[(i + 1) % om.length]
        if (!Number.isInteger(i) || !a || !b || om.length >= OMRISS_TAK) return
        e.preventDefault()
        e.stopPropagation()
        const ny = omrissMidt(om, new Set(ru ?? []), i)
        naa.current.onLeggPunkt(i, ny)
        naa.current.onValdPunkt(i + 1)
        dra = { i: i + 1, id: e.pointerId, q0, p0: ny, x0: e.clientX, y0: e.clientY, ny: true, g, r: rr, rPx: radius(e, g, rr), snapp: null }
        el.setPointerCapture(e.pointerId)
        taKameraet(controls)
        return
      }
      const i = Number(el.dataset.punkt)
      const p0 = om[i]
      if (!Number.isInteger(i) || !p0) return
      e.preventDefault()
      e.stopPropagation()
      naa.current.onValdPunkt(i)
      dra = { i, id: e.pointerId, q0, p0, x0: e.clientX, y0: e.clientY, ny: false, g, r: rr, rPx: radius(e, g, rr), snapp: null }
      el.setPointerCapture(e.pointerId)
      taKameraet(controls)
      if (om.length > 3) {
        lang = window.setTimeout(() => {
          lang = 0
          if (!dra || dra.i !== i) return
          dra = null
          if (controls) controls.enabled = true
          svelgKlikk = true
          naa.current.onTaPunkt(i)
        }, LANG_MS)
      }
    }
    const avlys = () => {
      if (!lang) return
      window.clearTimeout(lang)
      lang = 0
    }
    const rorsle = (e: PointerEvent) => {
      if (!dra || e.pointerId !== dra.id) return
      if (lang && Math.hypot(e.clientX - dra.x0, e.clientY - dra.y0) > 6) avlys()
      const q = paaFlata(e, dra.g, dra.r)
      if (!q) return
      const s = naa.current.S || 1
      let du = q[0] - dra.q0[0]
      let dv = q[1] - dra.q0[1]
      if (e.shiftKey) {
        if (Math.abs(du) >= Math.abs(dv)) dv = 0
        else du = 0
      }
      const fri: Pt = [dra.p0[0] + du / s, dra.p0[1] + dv / s]
      if (e.shiftKey || !dra.rPx) {
        dra.snapp = null
        naa.current.onPunkt(dra.i, fri)
        return
      }
      const sn = snappPunkt(naa.current.omriss, dra.i, fri, dra.rPx, (dra.rPx * SNAPP_SAMAN_PX) / SNAPP_PX_OMRISS, naa.current.snappSteg)
      dra.snapp = sn.slag ? { slag: sn.slag, mot: sn.mot } : null
      const merke = boks.querySelector<HTMLElement>(`[data-punkt="${dra.i}"]`)
      if (merke) {
        if (sn.slag) merke.dataset.snapp = sn.slag
        else delete merke.dataset.snapp
      }
      naa.current.onPunkt(dra.i, sn.p)
    }
    const opp = (e: PointerEvent) => {
      if (!dra || e.pointerId !== dra.id) return
      avlys()
      const d = dra
      dra = null
      if (controls) controls.enabled = true
      for (const q of boks.querySelectorAll<HTMLElement>("[data-punkt][data-snapp]")) delete q.dataset.snapp
      if (d.snapp?.slag === "punkt" && d.snapp.mot !== undefined) naa.current.onSlaaSaman(d.i, d.snapp.mot)
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) return
      const no = performance.now()
      const same = sisteTrykk.i === d.i && no - sisteTrykk.t < DOBBELT_MS
      sisteTrykk = { i: d.i, t: no }
      if (same && !d.ny) {
        sisteTrykk.i = -1
        svelgKlikk = true
        naa.current.onVriPunkt(d.i)
      }
    }
    boks.addEventListener("pointerdown", ned)
    window.addEventListener("click", svelg, { capture: true })
    window.addEventListener("pointermove", rorsle, { passive: true })
    window.addEventListener("pointerup", opp, { passive: true })
    window.addEventListener("pointercancel", opp, { passive: true })
    return () => {
      boks.removeEventListener("pointerdown", ned)
      window.removeEventListener("click", svelg, { capture: true })
      window.removeEventListener("pointermove", rorsle)
      window.removeEventListener("pointerup", opp)
      window.removeEventListener("pointercancel", opp)
      avlys()
      if (controls) controls.enabled = true
    }
  }, [boks, camera, controls, gl])

  useFrame(() => {
    if (!boks) return
    const g = naa.current.f
    const { r: rr, S: SS, omriss: om } = naa.current
    const n = om.length
    camera.updateMatrixWorld()
    const paaSkjerm = (q: Pt) => {
      const v = tilVerd(g, ut(rr, [q[0] * SS, q[1] * SS])).project(camera)
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, bak: v.z > 1 }
    }
    const { L, T, w, h } = naa.current.fri
    const iBandet = (p: { x: number; y: number }) => p.x >= L && p.x <= L + w && p.y >= T && p.y <= T + h
    const dekt = (p: { x: number; y: number }) => {
      const topp = document.elementFromPoint(p.x, p.y)
      return !!topp && topp !== gl.domElement && !boks.contains(topp)
    }
    const px = om.map(paaSkjerm)
    const rundeNo = new Set(naa.current.runde ?? [])
    const mpx = om.map((_, i) => paaSkjerm(omrissMidt(om, rundeNo, i)))
    const rom = n < OMRISS_TAK
    const langt = om.map((_, i) => {
      const j = (i + 1) % n
      return rom && Math.hypot(px[j].x - px[i].x, px[j].y - px[i].y) >= MIDT_MIN
    })
    const framme = (p: { x: number; y: number; bak: boolean }) => !p.bak && iBandet(p) && !dekt(p)
    const pOk = px.map(framme)
    const mOk = mpx.map((p, i) => langt[i] && framme(p))
    const sett = (el: HTMLElement | null, k: string, p: { x: number; y: number }, synleg: boolean) => {
      if (!el) return
      el.hidden = !synleg
      if (!synleg) return
      const t = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`
      if (skrive.current[k] !== t) {
        skrive.current[k] = t
        el.style.transform = t
      }
    }
    for (let i = 0; i < n; i++) {
      sett(boks.querySelector<HTMLElement>(`[data-midt="${i}"]`), `m${i}`, mpx[i], mOk[i])
      sett(boks.querySelector<HTMLElement>(`[data-punkt="${i}"]`), `p${i}`, px[i], pOk[i])
    }
  })
  return (
    <group {...gruppa(f)}>
      <lineSegments geometry={lina} renderOrder={7}>
        <lineBasicMaterial color={VALT} transparent opacity={0.5} depthTest={false} />
      </lineSegments>
    </group>
  )
}

function Streka({ f, r, strek, vald, live, S, farge }: { f: Ramma; r: Ramme; strek: readonly Strek[]; vald: number | null; live: Strek | null; S: number; farge: string }) {
  const g = useMemo(() => {
    const heil: number[] = []
    const stipla: number[] = []
    const avst: number[] = []
    strek.forEach((s0, i) => {
      const s = i === vald && live ? live : s0
      const ringar = strekRing(s, S)
      if (i === vald) {
        for (const ring of ringar) {
          for (let k = 0; k < ring.length; k++) heil.push(...ut(r, ring[k]), ...ut(r, ring[(k + 1) % ring.length]))
        }
        const a = (s.a * Math.PI) / 180
        const c = Math.cos(a)
        const si = Math.sin(a)
        const midt = strekMidt(s, S)
        const cx = midt[0]
        const cy = midt[1]
        const gl = Math.max(1.5, (Math.min(s.w, s.h) * S) / 4)
        const p = (lx: number, ly: number): Pt => [cx + lx * c - ly * si, cy + lx * si + ly * c]
        heil.push(...ut(r, p(-gl, 0)), ...ut(r, p(gl, 0)))
        if (s.slag === "gods") heil.push(...ut(r, p(0, -gl)), ...ut(r, p(0, gl)))
        return
      }
      let d = 0
      for (const ring of ringar) {
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k]
          const b = ring[(k + 1) % ring.length]
          const L = Math.hypot(b[0] - a[0], b[1] - a[1])
          stipla.push(...ut(r, a), ...ut(r, b))
          avst.push(d, d + L)
          d += L
        }
      }
    })
    const st = mkGeom(stipla)
    if (avst.length) st.setAttribute("lineDistance", new THREE.Float32BufferAttribute(avst, 1))
    return { heil: mkGeom(heil), stipla: st }
  }, [r, strek, vald, live, S])
  useEffect(() => () => { g.heil.dispose(); g.stipla.dispose() }, [g])
  const dash = Math.max(1, 0.015 * diag(f))
  return (
    <group {...gruppa(f)}>
      <lineSegments geometry={g.heil} renderOrder={7}>
        <lineBasicMaterial color={farge} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={g.stipla} renderOrder={7}>
        <lineDashedMaterial color={farge} dashSize={dash} gapSize={dash * 0.6} transparent opacity={0.7} depthTest={false} />
      </lineSegments>
    </group>
  )
}

function Demping({ onSein }: { onSein: (sein: boolean) => void }) {
  const sist = useRef(0)
  const seine = useRef(0)
  const raske = useRef(0)
  const sein = useRef(false)
  useFrame(() => {
    const n = performance.now()
    const d = n - sist.current
    sist.current = n
    if (d > 1000) return
    if (d > 80) {
      seine.current++
      raske.current = 0
    } else if (d < 40) {
      raske.current++
      seine.current = 0
    }
    if (!sein.current && seine.current >= 6) {
      sein.current = true
      onSein(true)
    } else if (sein.current && raske.current >= 30) {
      sein.current = false
      onSein(false)
    }
  })
  return null
}

const MONT_MS = 900
const MONT_SPREIING = 0.55
const mjukna = (t: number) => t * t * (3 - 2 * t)

function Montasjen({ f, mont, T, spel, vakn, material, onSteg, vald, onVeld }: {
  f: Ramma
  mont: Montasje
  T: MutableRefObject<number>
  spel: MutableRefObject<boolean>
  vakn: MutableRefObject<(() => void) | null>
  material: string
  onSteg: (s: number) => void
  vald: string | null
  onVeld: (adr: string) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    vakn.current = invalidate
    return () => { vakn.current = null }
  }, [vakn, invalidate])
  const mat = (material in MATERIALS ? material : "finer") as Material
  const geo = useMemo(
    () =>
      mont.delar.map((d) => ({
        flat: mkGeom(d.positions),
        boygd: d.boygd ? mkGeom(d.boygd) : null,
      })),
    [mont],
  )
  useEffect(() => () => { for (const g of geo) { g.flat.dispose(); g.boygd?.dispose() } }, [geo])
  const par = useMemo(
    () =>
      mont.delar.map((d) => {
        const a = new THREE.Matrix4().fromArray(d.flat)
        const b = new THREE.Matrix4().fromArray(d.ferdig)
        const pa = new THREE.Vector3()
        const pb = new THREE.Vector3()
        const qa = new THREE.Quaternion()
        const qb = new THREE.Quaternion()
        const sk = new THREE.Vector3()
        a.decompose(pa, qa, sk)
        b.decompose(pb, qb, sk)
        return { pa, pb, qa, qb }
      }),
    [mont],
  )
  const start = useMemo(() => {
    const iSteg = new Map<number, number>()
    const tal = new Map<number, number>()
    for (const d of mont.delar) tal.set(d.steg, (tal.get(d.steg) ?? 0) + 1)
    return mont.delar.map((d) => {
      const j = iSteg.get(d.steg) ?? 0
      iSteg.set(d.steg, j + 1)
      return d.steg + (j / Math.max(1, tal.get(d.steg) ?? 1)) * MONT_SPREIING
    })
  }, [mont])

  const netta = useRef<(THREE.Mesh | null)[]>([])
  const bogne = useRef<(THREE.Mesh | null)[]>([])
  const ned = useRef<{ x: number; y: number } | null>(null)
  const tak = (adr: string) => ({
    onPointerDown: (e: { clientX: number; clientY: number }) => { ned.current = { x: e.clientX, y: e.clientY } },
    onClick: (e: { clientX: number; clientY: number; detail: number; stopPropagation: () => void }) => {
      const d = ned.current
      ned.current = null
      if (!d || e.detail > 1 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return
      e.stopPropagation()
      onVeld(adr)
    },
  })
  const sist = useRef(-1)
  const sagtSteg = useRef(-1)
  const ein = useRef(new THREE.Vector3(1, 1, 1))

  useFrame((_, dt) => {
    if (spel.current) {
      T.current = Math.min(mont.steg, T.current + (Math.min(dt, 0.05) * 1000) / MONT_MS)
      if (T.current >= mont.steg) spel.current = false
      invalidate()
    }
    const t = T.current
    if (t === sist.current) return
    sist.current = t
    for (let i = 0; i < mont.delar.length; i++) {
      const m = netta.current[i]
      if (!m) continue
      const e = mjukna(Math.min(1, Math.max(0, (t - start[i]) / (1 - MONT_SPREIING))))
      const q = par[i]
      const b = bogne.current[i]
      if (b) {
        const nede = e >= 1
        b.visible = nede
        m.visible = !nede
        if (nede) continue
      }
      m.position.lerpVectors(q.pa, q.pb, e)
      m.quaternion.slerpQuaternions(q.qa, q.qb, e)
      m.matrix.compose(m.position, m.quaternion, ein.current)
      m.matrixWorldNeedsUpdate = true
    }
    const s = Math.min(mont.steg, Math.floor(t) + 1)
    if (s !== sagtSteg.current) {
      sagtSteg.current = s
      onSteg(s)
    }
  })

  return (
    <group {...gruppa(f)}>
      {mont.delar.map((d, i) => (
        <group key={d.adr}>
          <mesh
            ref={(el) => { netta.current[i] = el }}
            geometry={geo[i].flat}
            matrixAutoUpdate={false}
            castShadow
            receiveShadow
            {...tak(d.adr)}
          >
            {/* OG DEN VALDE STÅR I BLEKK. Adressa står i lina, men du peika
                på éi ribbe i ein stabel like ribber, og eit svar som ikkje
                seier KVA EIN du tok er eit halvt svar. Same oransje som eit
                valt plan i rommet. */}
            <meshStandardMaterial color={vald === d.adr ? VALT : MATERIALS[mat].hex} roughness={0.9} metalness={0} side={THREE.DoubleSide} />
          </mesh>
          {geo[i].boygd && (
            <mesh ref={(el) => { bogne.current[i] = el }} geometry={geo[i].boygd!} visible={false} castShadow receiveShadow {...tak(d.adr)}>
              <meshStandardMaterial color={vald === d.adr ? VALT : MATERIALS[mat].hex} roughness={0.9} metalness={0} side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

function Kroppen({ f, kropp, lag, view, skal, material, liste, vald, gruppe, plan, blink, sein, onVald }: {
  f: Ramma
  gruppe: readonly number[]
  kropp: BuildRes | null
  lag: BuildRes | null
  view: Rom
  skal: boolean
  material: string
  liste: readonly Kutt[]
  vald: number | null
  plan: readonly Plan[]
  blink: number | null
  sein: boolean
  onVald: (id: number | null) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const uKorn = useRef({ value: 1 })
  const uVald = useRef({ value: -1 })
  const uBlink = useRef({ value: -1 })
  const uBlinkT = useRef({ value: 0 })
  const ned = useRef<{ x: number; y: number } | null>(null)

  const gKropp = useMemo(() => {
    if (!kropp?.positions.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(kropp.positions, 3))
    g.setAttribute("normal", new THREE.BufferAttribute(kropp.normals, 3))
    const nv = kropp.positions.length / 3
    g.setAttribute("aKant", new THREE.BufferAttribute(new Float32Array(nv), 1))
    g.setAttribute("aPlan", new THREE.BufferAttribute(new Float32Array(nv).fill(-1), 1))
    return g
  }, [kropp])
  const gLag = useMemo(() => {
    if (!lag?.positions.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(lag.positions, 3))
    g.setAttribute("normal", new THREE.BufferAttribute(lag.normals, 3))
    const nv = lag.positions.length / 3
    g.setAttribute("aKant", new THREE.BufferAttribute(lag.kant.length === nv ? lag.kant : new Float32Array(nv), 1))
    const pl = new Float32Array(nv).fill(-1)
    if (lag.del.length === nv) for (let i = 0; i < nv; i++) pl[i] = liste[lag.del[i]]?.plan ?? -1
    g.setAttribute("aPlan", new THREE.BufferAttribute(pl, 1))
    return g
  }, [lag, liste])
  const gVald = useMemo(() => {
    const p = vald === null ? null : plan.find((q) => q.id === vald)
    return p ? polygonGeom(planIBoks(planRamme(p, f.min, f.max), f.min, f.max)) : null
  }, [vald, plan, f])
  useEffect(() => () => gKropp?.dispose(), [gKropp])
  useEffect(() => () => gLag?.dispose(), [gLag])
  useEffect(() => () => { gVald?.flate.dispose(); gVald?.kant.dispose() }, [gVald])
  const gGruppe = useMemo(
    () => gruppe.filter((id) => id !== vald).map((id) => plan.find((q) => q.id === id)).filter((q): q is Plan => !!q).map((q) => polygonGeom(planIBoks(planRamme(q, f.min, f.max), f.min, f.max))),
    [gruppe, vald, plan, f],
  )
  useEffect(() => () => { for (const g of gGruppe) { g.flate.dispose(); g.kant.dispose() } }, [gGruppe])

  const mat = (material in MATERIALS ? material : "finer") as Material
  const surf = useMemo(() => makeWood(MATERIALS[mat].hex, 0.9, uKorn.current, uVald.current, uBlink.current, uBlinkT.current), [mat])
  useEffect(() => () => surf.dispose(), [surf])
  const blinka = useRef<number | null>(null)
  const blinkT0 = useRef(0)
  const blinkSist = useRef(0)
  const seinRef = useRef(sein)
  seinRef.current = sein
  useEffect(() => {
    if (blink === null || blink === blinka.current || !gLag || !liste.some((k) => k.plan === blink)) return
    blinka.current = blink
    blinkT0.current = performance.now()
    blinkSist.current = blinkT0.current
    uBlink.current.value = blink
    uBlinkT.current.value = 1
    invalidate()
    const t = window.setTimeout(() => {
      uBlink.current.value = -1
      uBlinkT.current.value = 0
      invalidate()
    }, seinRef.current ? 2500 : 420)
    return () => window.clearTimeout(t)
  }, [blink, gLag, liste, invalidate])
  useFrame(() => {
    if (uBlink.current.value < 0) return
    const no = performance.now()
    const t = (no - blinkT0.current) / 400
    uBlinkT.current.value = t >= 1 ? 0 : Math.cos((Math.PI * t) / 2)
    if (t < 1 && !seinRef.current && no - blinkSist.current < 80) invalidate()
    blinkSist.current = no
  })
  useEffect(() => {
    uVald.current.value = vald ?? -1
    uKorn.current.value = mat === "akryl" ? 0 : mat === "papp" ? 0.5 : 1
    invalidate()
  }, [vald, mat, invalidate])

  const pluk = (e: { face?: { a: number } | null; clientX: number; clientY: number; detail: number; stopPropagation: () => void }) => {
    const d = ned.current
    ned.current = null
    if (!d || e.detail > 1 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 || !lag) return
    const a = e.face?.a
    if (a === undefined) return
    const i = lag.del[a]
    const k = i >= 0 ? liste[i] : undefined
    e.stopPropagation()
    onVald(k ? k.plan : null)
  }
  const solid = view === "flate"

  return (
    <group {...gruppa(f)}>
      {/*
        TO MESH-AR OG IKKJE EIN MED TO ANSIKT. Kroppen er den same
        geometrien i båe lesemåtane, men i «flate» ber han materialet som
        ein PROP og i «lag» som eit BARN — og byter eitt og same elementet
        mellom dei to, får det ingen av delane: React ser same slaget på
        same plassen og held instansen, materialprop-en fell bort, og
        instansen sit att med standardmaterialet sitt. Det er kvitt og
        ugjennomsiktig, og skalet la seg over delane som ei maling.
        To plassar i lista er to identitetar: ein av dei vert montert, den
        andre riven, og materialet fylgjer med.
      */}
      {gKropp && solid && <mesh geometry={gKropp} material={surf} castShadow receiveShadow />}
      {gKropp && !solid && skal && (
        <mesh geometry={gKropp} raycast={() => null} renderOrder={1}>
          <meshStandardMaterial color={MATERIALS[mat].hex} transparent opacity={0.18} depthWrite={false} roughness={1} />
        </mesh>
      )}
      {gLag && !solid && (
        <mesh
          geometry={gLag}
          material={surf}
          castShadow
          receiveShadow
          onPointerDown={(e) => { ned.current = { x: e.clientX, y: e.clientY } }}
          onClick={pluk}
        />
      )}
      {gGruppe.map((g, i) => (
        <lineSegments key={i} geometry={g.kant} renderOrder={3}>
          <lineBasicMaterial color={VALT} transparent opacity={0.45} depthTest={false} />
        </lineSegments>
      ))}
      {gVald && (
        <>
          {/* det valde planet: omrisset lyft fram, og flata so vidt synleg — same språk som skissa */}
          <mesh geometry={gVald.flate} raycast={() => null} renderOrder={2}>
            <meshBasicMaterial color={VALT} transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <lineSegments geometry={gVald.kant} renderOrder={3}>
            <lineBasicMaterial color={VALT} depthTest={false} />
          </lineSegments>
        </>
      )}
    </group>
  )
}

function Bitboksar({ f, bitar, vald }: { f: Ramma; bitar: readonly BitBoks[]; vald: number | null }) {
  const flokkar = useMemo(() => {
    const m = new Map<string, BitBoks[]>()
    bitar.forEach((b, i) => {
      if (i === vald) return
      const f2 = lagFarge(b.farge)
      const key = f2 === null ? "" : LAG_FARGAR[f2]
      const l = m.get(key)
      if (l) l.push(b)
      else m.set(key, [b])
    })
    return [...m.entries()].map(([farge, l]) => ({ farge, g: boksKantar(l) }))
  }, [bitar, vald])
  const den = useMemo(() => (vald === null || !bitar[vald] ? null : boksKantar([bitar[vald]])), [bitar, vald])
  useEffect(() => () => { for (const q of flokkar) q.g.dispose(); den?.dispose() }, [flokkar, den])
  return (
    <group {...gruppa(f)}>
      {flokkar.map((q) => (
        <lineSegments key={q.farge || "u"} geometry={q.g}>
          <lineBasicMaterial color={q.farge || SKISSE} transparent opacity={q.farge ? 0.85 : 0.4} />
        </lineSegments>
      ))}
      {den && (
        <lineSegments geometry={den} renderOrder={3}>
          <lineBasicMaterial color={VALT} depthTest={false} />
        </lineSegments>
      )}
    </group>
  )
}

type Sida = { i: 0 | 1 | 2; teikn: 1 | -1 }
const SIDER: Sida[] = [
  { i: 0, teikn: 1 }, { i: 0, teikn: -1 },
  { i: 1, teikn: 1 }, { i: 1, teikn: -1 },
  { i: 2, teikn: 1 }, { i: 2, teikn: -1 },
]

function Sidehandtak({ f, boks, boks3, dra, onSide, onGest }: {
  f: Ramma | null
  boks: HTMLDivElement | null
  boks3: BitBoks | null
  dra: MutableRefObject<boolean>
  onSide: (akse: 0 | 1 | 2, faktor: number) => void
  onGest: (kva: GestKva) => void
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as Orbit | null
  const naa = useRef({ f, boks3, size, onSide, onGest })
  naa.current = { f, boks3, size, onSide, onGest }
  const tak = useRef<{ a: 0 | 1 | 2; ut: number; px: [number, number]; x0: number; y0: number } | null>(null)
  const knappar = useRef<(HTMLElement | null)[]>([])
  const punkt = useMemo<Vec3>(() => [0, 0, 0], [])
  const skrive = useRef<string[]>([])

  useEffect(() => {
    if (!boks) return
    knappar.current = SIDER.map((_, k) => boks.querySelector<HTMLElement>(`[data-side="${k}"]`))
    const ned = (e: PointerEvent) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-side]")
      const k = el ? Number(el.dataset.side) : -1
      const b = naa.current.boks3
      const g = naa.current.f
      if (!e.isPrimary || !el || k < 0 || !b || !g) return
      e.preventDefault()
      e.stopPropagation()
      const sd = SIDER[k]
      const midt: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
      const p: Vec3 = [...midt] as Vec3
      p[sd.i] = sd.teikn > 0 ? b.max[sd.i] : b.min[sd.i]
      const ein: Vec3 = [...p] as Vec3
      ein[sd.i] += sd.teikn
      const A = tilVerd(g, p).project(camera)
      const B = tilVerd(g, ein).project(camera)
      const r = naa.current.size
      const px: [number, number] = [((B.x - A.x) / 2) * r.width, (-(B.y - A.y) / 2) * r.height]
      tak.current = { a: sd.i, ut: Math.max(1e-3, (b.max[sd.i] - b.min[sd.i]) / 2), px, x0: e.clientX, y0: e.clientY }
      el.setPointerCapture(e.pointerId)
      dra.current = true
      taKameraet(controls)
      naa.current.onGest("side")
    }
    const rorsle = (e: PointerEvent) => {
      const t = tak.current
      if (!t) return
      const L = t.px[0] * t.px[0] + t.px[1] * t.px[1]
      if (L < 1e-6) return
      const mm = ((e.clientX - t.x0) * t.px[0] + (e.clientY - t.y0) * t.px[1]) / L
      naa.current.onSide(t.a, Math.max(0.02, (t.ut + mm) / t.ut))
    }
    const opp = () => {
      if (!tak.current) return
      tak.current = null
      dra.current = false
      if (controls) controls.enabled = true
      naa.current.onGest(null)
    }
    boks.addEventListener("pointerdown", ned)
    window.addEventListener("pointermove", rorsle, { passive: true })
    window.addEventListener("pointerup", opp, { passive: true })
    window.addEventListener("pointercancel", opp, { passive: true })
    return () => {
      boks.removeEventListener("pointerdown", ned)
      window.removeEventListener("pointermove", rorsle)
      window.removeEventListener("pointerup", opp)
      window.removeEventListener("pointercancel", opp)
      dra.current = false
      if (controls) controls.enabled = true
    }
  }, [boks, camera, controls, dra])

  useFrame(() => {
    if (!boks) return
    const g = naa.current.f
    const b = naa.current.boks3
    if (!g || !b) {
      boks.style.visibility = "hidden"
      return
    }
    boks.style.visibility = "visible"
    camera.updateMatrixWorld()
    const mx = (b.min[0] + b.max[0]) / 2
    const my = (b.min[1] + b.max[1]) / 2
    const mz = (b.min[2] + b.max[2]) / 2
    for (let k = 0; k < SIDER.length; k++) {
      const sd = SIDER[k]
      const el = knappar.current[k]
      if (!el) continue
      const p = punkt
      p[0] = mx
      p[1] = my
      p[2] = mz
      p[sd.i] = sd.teikn > 0 ? b.max[sd.i] : b.min[sd.i]
      const v = tilVerd(g, p).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      const t = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
      if (skrive.current[k] !== t) {
        skrive.current[k] = t
        el.style.transform = t
      }
      const o = v.z > 1 ? "0" : "1"
      if (el.style.opacity !== o) el.style.opacity = o
    }
  })
  return null
}

const SIDEORD = ["høgre", "venstre", "topp", "botn", "framme", "bak"]
const KUBE_SKALA = 0.75
const KUBE_HOVER = "#dcdcdc"

function Skodda() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null
  useFrame(() => {
    const f = scene.fog as THREE.Fog | null
    if (!f || !controls) return
    const d = camera.position.distanceTo(controls.target)
    f.near = d + SKODDE_NAER
    f.far = d + SKODDE_FJERN
    const naer = Math.max(0.1, d - NAER_LUFT)
    if (camera.near !== naer || camera.far !== f.far) {
      camera.near = naer
      camera.far = f.far
      camera.updateProjectionMatrix()
    }
  })
  return null
}

const FLAT_INN = 0.99939
const FLAT_UT = 0.99844
const FLAT_FART = 3.4

function Flatsynet() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as (Orbit & { target: THREE.Vector3; minDistance: number; maxDistance: number }) | null
  const invalidate = useThree((s) => s.invalidate)
  const t = useRef(0)
  const dPer = useRef(0)
  const retn = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    if (!controls) return
    const d = camera.position.distanceTo(controls.target)
    if (d < 1e-6) return
    const v = retn.current.copy(camera.position).sub(controls.target).divideScalar(d)
    const cos = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z))
    const rett = cos >= (t.current > 0 ? FLAT_UT : FLAT_INN)
    const steg = Math.min(dt, 0.05) * FLAT_FART
    const ny = rett ? Math.min(1, t.current + steg) : Math.max(0, t.current - steg)
    if (ny === t.current) {
      dPer.current = d / fovSkala(camera.fov)
      return
    }
    if (dPer.current <= 0) dPer.current = d / fovSkala(camera.fov)
    t.current = ny
    const fov = FOV_NAER * Math.pow(FOV_FLAT / FOV_NAER, ny)
    const k = fovSkala(fov)
    camera.fov = fov
    camera.updateProjectionMatrix()
    controls.minDistance = MIN_DIST * k
    controls.maxDistance = MAX_DIST * k
    camera.position.copy(controls.target).addScaledVector(v, dPer.current * k)
    invalidate()
  })
  return null
}

function Kamerataket({ ut }: { ut: MutableRefObject<((f: number) => void) | null> }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update?: () => void } | null
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    ut.current = (f: number) => {
      if (!controls || !Number.isFinite(f) || f <= 0) return
      const k = fovSkala((camera as THREE.PerspectiveCamera).fov)
      const d = Math.min(MAX_DIST * k, Math.max(MIN_DIST * k, camera.position.distanceTo(controls.target) / f))
      const retn = camera.position.clone().sub(controls.target).setLength(d)
      camera.position.copy(controls.target).add(retn)
      controls.update?.()
      invalidate()
    }
    return () => {
      ut.current = null
    }
  }, [camera, controls, invalidate, ut])
  return null
}

function Sovnen({ sov, children }: { sov: boolean; children: ReactNode }) {
  const grp = useRef<THREE.Group>(null)
  const naa = useRef(1)
  const skrive = useRef(NaN)
  const grunn = useRef(new WeakMap<THREE.Material, number>())
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => { invalidate() }, [sov, invalidate])
  useFrame((_, dt) => {
    const g = grp.current
    if (!g) return
    const maal = sov ? 0 : 1
    if (naa.current !== maal) {
      const steg = Math.min(1, dt) / (sov ? 0.5 : 0.09)
      naa.current = sov ? Math.max(0, naa.current - steg) : Math.min(1, naa.current + steg)
      invalidate()
    }
    const t = naa.current
    const a = t * t * (3 - 2 * t)
    g.visible = a > 0.002
    if (!g.visible) return
    if (a === skrive.current) return
    skrive.current = a
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material
      for (const q of Array.isArray(m) ? m : m ? [m] : []) {
        let b = grunn.current.get(q)
        if (b === undefined) {
          b = q.opacity
          grunn.current.set(q, b)
        }
        q.transparent = b < 1 || a < 1
        q.opacity = b * a
      }
    })
  })
  return <group ref={grp}>{children}</group>
}

const IkonSkal = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4.5" width="18" height="15" rx="1.5" strokeWidth={1.5} strokeDasharray="3 2.6" />
    <path d="M8 8.5v7M12 8.5v7M16 8.5v7" strokeWidth={2.2} />
  </svg>
)
const IkonLupe = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="6" /><path d="m20 20-4.4-4.4M8.5 11h5" />
  </svg>
)

const IkonLaas = (open: boolean) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="9" rx="1.6" />
    <path d={open ? "M8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2" : "M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"} />
  </svg>
)

const IkonHeim = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
)

const IkonFlytt = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v18M3 12h18" /><path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" />
  </svg>
)
const IkonVri = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M17 3v4.5h-4.5" />
  </svg>
)
const IkonStor = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 19 19 5" /><path d="M13 5h6v6" /><path d="M11 19H5v-6" />
  </svg>
)

export const Scene = memo(function Scene({ kropp, lag, view, skal, onSkal, sov, modus, montasje, material, rute, liste, plan, vald, snitt, blink, skisse, storleik, valdStrek, valdBit, onVald, onDeling, onValdStrek, snappSteg, teikn, teiknSlag, onTeiknLukk, onPunkt, onSlaaSaman, onLeggPunkt, onTaPunkt, onVriPunkt, valdPunkt, onValdPunkt, mont, montT, montSpel, montVakn, onMontSteg, montVald, onMontVald, onPlan, onStrek, onSynStrek, onGest, onSkisse, onValdBit, onBitFlytt, onBitSkala, onBitVri, onBitSide, onRute, rammInn, synTil, benk, gruppe, teikneplan }: {
  kropp: BuildRes | null
  lag: BuildRes | null
  view: Rom
  skal: boolean
  onSkal: () => void
  sov: boolean
  modus: Modus
  material: string
  rute: Rute
  liste: readonly Kutt[]
  plan: readonly Plan[]
  vald: number | null
  snitt: SkisseSyn | null
  blink: number | null
  skisse: MutableRefObject<Skisse | null>
  storleik: number
  valdStrek: number | null
  valdBit: number | null
  onVald: (id: number | null) => void
  onDeling: (nokkel: string, t: number) => void
  onValdStrek: (i: number | null) => void
  snappSteg: number
  teikn: boolean
  teiknSlag: "firkant" | "kontur"
  onTeiknLukk: (o: Vec3, n: Vec3, omriss: Pt[]) => void
  onPunkt: (id: number, i: number, q: Pt) => void
  onSlaaSaman: (id: number, i: number, mot: number) => void
  onLeggPunkt: (id: number, i: number, q: Pt) => void
  onTaPunkt: (id: number, i: number) => void
  onVriPunkt: (id: number, i: number) => void
  montasje: boolean
  mont: Montasje | null
  montT: MutableRefObject<number>
  montSpel: MutableRefObject<boolean>
  montVakn: MutableRefObject<(() => void) | null>
  onMontSteg: (s: number) => void
  montVald: string | null
  onMontVald: (adr: string) => void
  valdPunkt: number | null
  onValdPunkt: (i: number | null) => void
  onPlan: (id: number, o: Vec3, n: Vec3) => void
  onStrek: (id: number, i: number, s: Strek) => void
  onSynStrek: (id: number, i: number, s: Strek) => void
  onGest: (kva: GestKva) => void
  onSkisse: (s: Skisse) => void
  onValdBit: (i: number | null) => void
  onBitFlytt: (dmm: Vec3) => void
  onBitSkala: (faktor: number) => void
  onBitVri: (grader: number) => void
  onBitSide: (akse: 0 | 1 | 2, faktor: number) => void
  onRute: (dx: number, dy: number) => void
  rammInn: number
  synTil?: { n: number; dir: Vec3 } | null
  teikneplan?: MutableRefObject<(() => { o: Vec3; n: Vec3 }) | null>
  benk: boolean
  gruppe: readonly number[]
}) {
  const bitar = useMemo(() => kropp?.bitar ?? [], [kropp])
  const [sikt, setSikt] = useState<Sikt>({ n: 0, dir: null })
  const fRaa = useMemo(() => ramma(kropp ?? lag, mont?.boks), [kropp, lag, mont])
  const syn = useRef<{ cx: number; cy: number; s: number; fit: Fit } | null>(null)
  const synN = useRef<string>("")
  const synNokkel = `${sikt.n}|${rammInn}|${mont ? `${mont.boks.min.join(",")}/${mont.boks.max.join(",")}` : ""}`
  if (fRaa && (!syn.current || synN.current !== synNokkel)) {
    synN.current = synNokkel
    syn.current = { cx: fRaa.cx, cy: fRaa.cy, s: fRaa.s, fit: fRaa.fit }
  }
  const f = useMemo(() => (fRaa && syn.current ? { ...fRaa, ...syn.current } : fRaa), [fRaa, synNokkel])
  const valt = useMemo(() => (vald === null ? null : plan.find((q) => q.id === vald) ?? null), [vald, plan])
  const rValt = useMemo(() => (valt && f ? planRamme(valt, f.min, f.max) : null), [valt, f])
  const [live, setLive] = useState<Live | null>(null)
  const fri = useMemo(() => fritt(rute), [rute])
  const heim = useCallback(() => setSikt((s) => ({ n: s.n + 1, dir: null })), [])
  const synN0 = useRef(synTil?.n ?? 0)
  useEffect(() => {
    if (!synTil || synTil.n === synN0.current) return
    synN0.current = synTil.n
    setSikt((s) => ({ n: s.n + 1, dir: synTil.dir }))
  }, [synTil])
  const zoom = useRef<((f: number) => void) | null>(null)
  const lupe = useRef<number | null>(null)
  const [boks, setBoks] = useState<HTMLDivElement | null>(null)
  const [sider, setSider] = useState<HTMLDivElement | null>(null)
  const [sporBoks, setSporBoks] = useState<HTMLDivElement | null>(null)
  const arb = useRef<string | null>(null)
  const snapp = useRef({ vri: false, pos: false })
  const [punktBoks, setPunktBoks] = useState<HTMLDivElement | null>(null)
  const [teiknSvg, setTeiknSvg] = useState<SVGSVGElement | null>(null)
  const [sein, setSein] = useState(false)
  const sideDra = useRef(false)
  const [laast, setLaast] = useState(false)
  const [lys, setLys] = useState<Lys>({ az: 0.62, el: 0.92 })
  const flyttLys = useCallback((dx: number, dy: number) => {
    setLys((l) => ({ az: l.az + dx * 0.012, el: Math.min(1.45, Math.max(0.12, l.el + dy * 0.012)) }))
  }, [])
  const lysPos = useMemo<[number, number, number]>(() => {
    const R = 8.6
    const h = R * Math.cos(lys.el)
    return [h * Math.cos(lys.az), R * Math.sin(lys.el), h * Math.sin(lys.az)]
  }, [lys])
  const tema = useTema()
  const bg = tema.paper
  return (
    <>
      <Canvas
        shadows="percentage"
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.NeutralToneMapping }}
        camera={{ position: [2.4, 2.1, 6.4], fov: 30 }}
        className="touch-none"
        onPointerMissed={() => onVald(null)}
      >
        <color attach="background" args={[bg]} />
        <fog attach="fog" args={[bg, 22, 48]} />
        <directionalLight position={lysPos} intensity={2.3} castShadow shadow-mapSize={[2048, 2048]} shadow-radius={5} shadow-bias={-0.0002} shadow-normalBias={0.05} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} shadow-camera-near={0.5} shadow-camera-far={24} />
        <directionalLight position={[-6, 3, -2]} intensity={0.55} />
        <directionalLight position={[6, 2, 1]} intensity={0.4} />
        <directionalLight position={[2, 1.5, 7]} intensity={0.35} />
        <directionalLight position={[0.5, -3, 2]} intensity={0.3} />
        <group position={[0, GROUND_Y, 0]}>
          {/*
            MONTASJEN STÅR I STADEN FOR ALT DETTE, og ikkje oppå det.

            Det er dei same delane: to utgåver av dei same delane i eitt
            bilete er eit objekt du ikkje kan lese. Og alt det andre her —
            snittet, ledda, streka, omrisset, boksane — høyrer til å ENDRE
            kroppen. Montasjen endrar ingenting; han syner deg kva du skal
            gjere med hendene. Eit snitt gjennom eit objekt som er halvvegs
            teke frå kvarandre er ei line utan noko på den andre sida.
          */}
          {f && mont ? (
            <Montasjen f={f} mont={mont} T={montT} spel={montSpel} vakn={montVakn} material={material} onSteg={onMontSteg} vald={montVald} onVeld={onMontVald} />
          ) : (
          <>
          {f && <Kroppen f={f} kropp={kropp} lag={lag} view={view} skal={skal} material={material} liste={liste} vald={vald} gruppe={gruppe} plan={plan} blink={blink} sein={sein} onVald={onVald} />}
          {f && modus === "bit" && bitar.length > 0 && <Bitboksar f={f} bitar={bitar} vald={valdBit} />}
        <Sidehandtak f={f} boks={sider} boks3={modus === "bit" && valdBit !== null ? (bitar[valdBit] ?? null) : null} dra={sideDra} onSide={onBitSide} onGest={onGest} />
          {!teikn && f && snitt && snitt.ringar.length > 0 && (
            <Sovnen sov={sov}>
              <Snittet f={f} snitt={snitt} farge={vald === null ? SKISSE : VALT} />
            </Sovnen>
          )}
          {/* LEDDA SOM HANDTAK: berre på eit LÅST plan, og berre når det er
              valt — ein prikk per ledd på kvar ribbe ville vore ei stjerne
              av prikkar over heile kroppen. */}
          {!teikn && f && vald !== null && !montasje && snitt?.spor?.length ? (
            <Sovnen sov={sov}>
              <Spora f={f} snitt={snitt} boks={sporBoks} onDeling={onDeling} />
            </Sovnen>
          ) : null}
          {!teikn && f && valt && rValt && valt.strek.length > 0 && <Streka f={f} r={rValt} strek={valt.strek} vald={valdStrek} live={live && live.id === valt.id ? live.s : null} S={storleik} farge={VALT} />}
          {/* FLATA DU TEIKNAR. Ho står over alt anna medan ho vert til, av
              di ho er det einaste på skjermen som ikkje finst enno. Han
              teiknar ingenting sjølv — han set berre hjørna i flata over. */}
          {f && teikneplan && <Teikneplanet f={f} ut={teikneplan} />}
          {f && teikn && (
            <Teikninga
              f={f}
              S={storleik}
              fri={fri}
              slag={teiknSlag}
              svg={teiknSvg}
              arb={arb}
              plan={plan}
              onLukk={onTeiknLukk}
            />
          )}
          {!teikn && valdStrek === null && f && valt?.omriss?.length && rValt ? (
            <Omrisset
              f={f}
              r={rValt}
              omriss={valt.omriss}
              runde={valt.runde}
              S={storleik}
              fri={fri}
              boks={punktBoks}
              snappSteg={snappSteg}
              onPunkt={(i, q) => onPunkt(valt.id, i, q)}
              onSlaaSaman={(i, mot) => onSlaaSaman(valt.id, i, mot)}
              onLeggPunkt={(i, q) => onLeggPunkt(valt.id, i, q)}
              onTaPunkt={(i) => onTaPunkt(valt.id, i)}
              onVriPunkt={(i) => onVriPunkt(valt.id, i)}
              onValdPunkt={onValdPunkt}
            />
          ) : null}
          </>
          )}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[60, 60]} />
            <shadowMaterial transparent opacity={0.24} />
          </mesh>
        </group>
        <FitCamera fit={f?.fit ?? null} rute={rute} sikt={sikt} laast={laast} />
        <Kamerataket ut={zoom} />
        {/*
          SYNSKUBEN, øvst til høgre i det FRIE bandet: marginen er kanten av
          arket og kolonna, ikkje kanten av lerretet, so han står i biletet og
          ikkje under kontrollane.
        */}
        <GizmoHelper alignment="top-right" margin={[rute.hogre + 38, rute.topp + 38]}>
          <Sovnen sov={sov}>
            <group scale={KUBE_SKALA}>
              <Kuben
                laast={laast}
                faces={SIDEORD}
                color={tema.paper}
                textColor={tema.ink}
                strokeColor={tema.ink}
                hoverColor={KUBE_HOVER}
                opacity={0.92}
                font="26px Inter, ui-sans-serif, system-ui, sans-serif"
              />
            </group>
          </Sovnen>
        </GizmoHelper>
        {/* ETTER synskuben, med vilje: begge skriv på kameraet i same
            biletet, og den som skriv sist er den som vert teikna. Rekninga
            i `Flatsynet` tek seg att om rekkjefylgja skulle svikte — det
            kostar eit bilete eller to, ikkje storleiken på objektet. */}
        <Flatsynet />
        {/* OG SKODDA ETTER FLATSYNET, av same grunn den andre vegen: ho LES
            avstanden, og flatsynet gongar han med 1,17 per bilete medan
            synet rettar seg ut. Stod ho før, las ho avstanden frå biletet
            FØR — og då låg skodda eit hakk for nær (objektet tona bort i
            bakgrunnen på veg inn i flatsynet) og `near` eit hakk for langt
            ute (objektet vart klipt bort på veg ut av det). Eit blink kvar
            gong du trykte på ei side av kuben. */}
        <Skodda />
        <Demping onSein={setSein} />
        {/* Eiga teikning har inga knivskisse eller gamle handtak å ta i. */}
        <Streket f={teikn ? null : f} r={rValt} valt={valt} valdStrek={valdStrek} S={storleik} boks={boks} arb={arb} snapp={snapp} setLive={setLive} onSynStrek={onSynStrek} onStrek={onStrek} />
        <Zoom onGest={onGest} />
        <Handa f={teikn ? null : f} fri={fri} sov={sov} modus={modus} montasje={montasje} sideDra={sideDra} vald={vald} plan={plan} snitt={snitt} skisse={skisse} boks={boks} storleik={storleik} valdStrek={valdStrek} live={live} rValt={rValt} bitar={bitar} valdBit={valdBit} snappSteg={snappSteg} arb={arb} snapp={snapp} setLive={setLive} onValdStrek={onValdStrek} onStrek={onStrek} onSynStrek={onSynStrek} onPlan={onPlan} onLys={flyttLys} onGest={onGest} onSkisse={onSkisse} onValdBit={onValdBit} onBitFlytt={onBitFlytt} onBitSkala={onBitSkala} onBitVri={onBitVri} onRute={onRute} />
        {/* Kroppen snur heile vegen rundt — undersida er der ledda sit, og
            eit syn du ikkje kjem til er ein kontroll som manglar. */}
        <OrbitControls
          target={[0, 0.35, 0]}
          enablePan={benk}
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
          enableRotate={!laast}
          screenSpacePanning
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
          enableZoom
          minDistance={MIN_DIST}
          maxDistance={MAX_DIST}
          rotateSpeed={0.9}
          enableDamping={!sein}
          dampingFactor={0.12}
          minPolarAngle={0.02}
          maxPolarAngle={Math.PI - 0.02}
          makeDefault
        />
      </Canvas>
      {/*
        INNRAMMINGA, under synskuben øvst til høgre. Ho låg i dobbelttrykket
        før, der ho kom av seg sjølv midt i ei sikting; her er ho ein knapp
        du trykkjer på.
      */}
      <div className="synskube" style={{ right: rute.hogre + 16, top: rute.topp + 72 }}>
        {/*
          LÅSEN, ØVST: synsvinkelen står der du sette han.

          Synet er ei avgjerd (sjå README), og dette er den avgjerda teken
          heilt ut: med låsen på snur korkje éin finger eller heimknappen
          objektet, og synskuben berre til dei seks sidene — eit aksesyn er
          eit arbeidsplan og ikkje ei vinkling. Du kan framleis gå nærare og lenger unna —
          det er ikkje ei ny vinkling, det er det same synet på nært hald.
        */}
        <button type="button" data-laas="" aria-pressed={laast} aria-label="lås synet" title={laast ? "synsvinkelen er låst: berre dei seks sidene på synskuben snur. trykk for å sleppe han" : "lås synsvinkelen: éin finger og heimknappen snur han ikkje meir, synskuben berre til dei seks sidene"} onClick={() => setLaast((v) => !v)}>
          {IkonLaas(!laast)}
        </button>
        <button type="button" data-heim="" aria-label="ramm inn" title="ramm inn objektet på nytt (F)" onClick={heim}>
          {IkonHeim}
        </button>
        {/* SKALET. Kroppen slik han var ligg gjennomsiktig kring delane og
            seier kor mykje av forma ribbene fangar. Han er òg det som står
            mellom deg og dei når du vil sjå spora — difor ein brytar, her,
            i spalta for det rommet SYNER. I «flate» er kroppen kroppen, og
            då er det ingenting å slå av. Det same i montasjen: der er det
            delane som reiser seg, og eit skal kring dei finst ikkje. */}
        {view === "lag" && !montasje && (
          <button type="button" data-skal="" aria-pressed={skal} aria-label="skalet" title={skal ? "skalet: kroppen slik han var. trykk for å sjå berre delane" : "skalet er av: berre delane står. trykk for å sjå kroppen kring dei"} onClick={onSkal}>
            {IkonSkal}
          </button>
        )}
        {/* LUPA: éin finger. Trykk og dra opp for å gå nærare, ned for å gå
            lenger unna — den same dollyen klypet gjer, for handa som held
            telefonen og berre har ein tommel ledig. */}
        <button
          type="button"
          data-lupe=""
          aria-label="zoom"
          title="dra opp og ned: nærare og lenger unna"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            lupe.current = e.clientY
          }}
          onPointerMove={(e) => {
            if (lupe.current === null) return
            const dy = e.clientY - lupe.current
            lupe.current = e.clientY
            zoom.current?.(Math.exp(-dy * 0.008))
          }}
          onPointerUp={() => { lupe.current = null }}
          onPointerCancel={() => { lupe.current = null }}
        >
          {IkonLupe}
        </button>
      </div>
      {/*
        HANDTAKA ER DOM, IKKJE NETT. Eit handtak på 48 pikslar skal kunne
        takast med tommelen og finnast av ein som ikkje ser; ein trekant i
        WebGL kan ingen av delane. Flytt får ledig rom med line til snittet,
        vri står på toppen; scena skriv plassen kvar teikning. Lappen ber
        `data-skisse="snitt"` nett når det finst eit snitt å lese av. Med
        eit strek valt står tre handtak på streken i staden (`data-strek`).
      */}
      {/* PRIKKANE PÅ SIDENE: seks knappar, plasserte av scena kvar teikning.
          Dei ligg i sitt eige lag so dei ikkje deler tilstand med handtaka
          på snittet — dei to er aldri framme samstundes, men eit lag som
          ber to meiningar er eit lag nokon gløymer å slå av. */}
      {/* LEDDA SOM HANDTAK: éin prikk per ledd i det valde planet, på den
          lukka enden av sporet. Scena skriv plassen deira kvar teikning
          (sjå `Spora`); dei står berre der det finst eit låst plan valt. */}
      {/* Og dei står ikkje medan montasjen gjer det: komponentane som set
          plassen deira kvar teikning (`Spora`, `Omrisset`) er ikkje monterte
          då, so knappane ville hopa seg opp usette i hjørnet av lerretet —
          synlege, trykkbare og utan nokon bak seg. */}
      <div ref={setSporBoks} className="spor">
        {vald !== null && !montasje && !teikn &&
          (snitt?.spor ?? []).map((q) => (
            <button key={q.nokkel} type="button" data-spor={q.nokkel} aria-label={`ledd ${q.nokkel}`} title={`dra: kor djupt ledd ${q.nokkel} går`}>
              <span aria-hidden="true" />
            </button>
          ))}
      </div>
      {/* PUNKTA I OMRISSET: eitt handtak per punkt i det valde planet, sett
          på plass av scena kvar teikning (sjå `Omrisset`). Dei står berre
          der handa har frose profilen — elles er profilen nettet, og det er
          ingen punkt å ta i.

          OG EIT MIDTMERKE PER KANT, mindre og rundt: eit punkt du ikkje har
          enno. Firkanta er eit hjørne som står, rundt er ein stad eit hjørne
          kan verte til. Scena gøymer dei der kanten er for kort til at
          fingeren kan skilje dei frå punkta i endane. */}
      {/* FLATA DU TEIKNAR, som DOM og ikkje som eit overlegg inni lerretet:
          eit overlegg ligg oppå og stel trykka. React set kor mange punkt
          det er; `Teikninga` set KVAR dei er, kvar ramme — nøyaktig same
          arbeidsdelinga som `.punkt` har. */}
      {teikn && (
        <svg ref={setTeiknSvg} data-teikn="klar" className="teiknflate" aria-hidden="true">
          <polygon points="" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinejoin="round" />
          <text className="teiknmaal" />
        </svg>
      )}
      <div ref={setPunktBoks} className="punkt">
        {(montasje || teikn || valdStrek !== null ? [] : valt?.omriss ?? []).map((_, i) => (
          <button key={`m${i}`} type="button" data-midt={i} hidden aria-label={`legg til eit punkt mellom ${i + 1} og ${((i + 1) % (valt?.omriss?.length ?? 1)) + 1}`} title="dra: eit punkt til, midt på kanten">
            <span aria-hidden="true" />
          </button>
        ))}
        {(montasje || teikn || valdStrek !== null ? [] : valt?.omriss ?? []).map((_, i) => (
          <button key={`p${i}`} type="button" data-punkt={i} data-rund={valt?.runde?.includes(i) ? "" : undefined} data-vald={i === valdPunkt ? "" : undefined} aria-current={i === valdPunkt} aria-label={`punkt ${i + 1} i omrisset${valt?.runde?.includes(i) ? ", boge" : ""}`} title="dra: flytt punktet — skift låser aksen. dobbelttrykk: hjørne eller boge. pilene flyttar det ein millimeter, ti med skift; ⌫ eller eit langt trykk tek det bort">
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      <div ref={setSider} className="sider" style={{ visibility: "hidden" }}>
        {SIDER.map((sd, k) => (
          <button
            key={k}
            type="button"
            data-side={k}
            aria-label={`storleik ${"xyz"[sd.i]}${sd.teikn > 0 ? "+" : "−"}`}
            title={`dra: ${"xyz"[sd.i]}-sida av biten`}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      <div ref={setBoks} className="handtak" data-slag="skisse" style={{ visibility: "hidden" }}>
        <span data-arm="" aria-hidden="true" />
        <span data-flyttarm="" aria-hidden="true" hidden style={{ height: 1, background: "var(--snitt)", opacity: 0.45, transformOrigin: "0 0" }} />
        <button type="button" data-handtak="flytt" aria-label="flytt snittet" title="dra: flytt snittet over kroppen">{IkonFlytt}</button>
        <button type="button" data-handtak="vri" aria-label="vri snittet" title="dra: vri snittet">{IkonVri}</button>
        <button type="button" data-handtak="strek-flytt" aria-label="flytt streken" title="dra: flytt streken i planet">{IkonFlytt}</button>
        <button type="button" data-handtak="strek-storleik" aria-label="storleiken på streken" title="dra: breidd og høgd. ein rund strek snappar til sirkel når måla er nære">{IkonStor}</button>
        <button type="button" data-handtak="strek-vri" aria-label="vri streken" title="dra: vri streken. snappar til 0° og 90°">{IkonVri}</button>
        <span data-merke="" aria-hidden="true">
          <span data-ord="">skisse</span>
          <span data-tikk="" />
        </span>
      </div>
    </>
  )
})
