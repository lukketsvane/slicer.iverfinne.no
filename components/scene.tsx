"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import * as THREE from "three"
import { MATERIALS, inRing, shoelace, type Kutt, type Material, type Pt, type Vec3, type View } from "@/lib/core"
import { akser, broek, dot, inn, ramme as planRamme, ut, type Plan, type Ramme, type Strek } from "@/lib/plan"
import { GROUND_Y, MAX_DIST, MIN_DIST, MIN_NAER, fritt, ramme, type Fit, type Rute } from "@/lib/ramme"
import type { SkisseSyn } from "@/lib/snitt"
import type { BuildRes } from "@/lib/worker"

/**
 * SCENA. Kroppen som skugge, delane som står, og skisseplanet som svingar
 * med kameraet. Motoren reknar i millimeter med Z opp; scena har Y opp.
 * Omrekninga skjer HER og ingen annan stad, og ho vert snudd nøyaktig
 * attende når eit plan går frå kameraet inn i kroppen sitt rom.
 *
 * Skalaen er ikkje fast: ein knapp på førti millimeter og ein benk på tolv
 * hundre vert begge skalerte til den same ramma, og ramma er KROPPEN sin —
 * ikkje delane sine — so å låse eit plan ikkje flyttar noko.
 */
const FRAME = 2.2
const HEIM = { flat: [0, 0, 1] as Vec3, rom: [2.4, 1.7, 6.4] as Vec3 }
const SKISSE = "#1f6feb"
const VALT = "#e05a1a"

/**
 * FARGANE SCENA TEIKNAR MED, LESNE AV CSS.
 *
 * Papiret og blekket står i `globals.css` og ingen annan stad — òg for
 * lerretet, som elles ville hatt sin eigen kvitfarge å gløyme når systemet
 * står mørkt. Media-spørsmålet er det einaste som seier frå: det finst
 * ingen brytar, og telefonen har alt valt.
 */
function useTema() {
  const [t, setT] = useState({ paper: "#ffffff", ink: "#141414" })
  useEffect(() => {
    const les = () => {
      const s = getComputedStyle(document.documentElement)
      const f = (k: string, fall: string) => s.getPropertyValue(k).trim() || fall
      setT({ paper: f("--paper", "#ffffff"), ink: f("--ink", "#141414") })
    }
    les()
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    mq.addEventListener("change", les)
    return () => mq.removeEventListener("change", les)
  }, [])
  return t
}

/** planet slik skissa står no, i motoren sitt rom (mm, z opp) */
export type Skisse = { o: Vec3; n: Vec3 }
/** kva ein gest held på med, til lesing på skjermen */
export type GestKva = "storleik" | "vend" | "lys" | "snitt" | "zoom" | "strek" | null
/** eit strek medan fingeren har det: teikna her, snitta av motoren, skrive i parametrane fyrst når det vert sleppt */
type Live = { id: number; i: number; s: Strek }
/**
 * TO GESTMODUSAR, EIN BRYTAR. «form» er dei gamle gestane: to fingrar på
 * objektet klyp storleiken, vrir vendinga og dreg snittet på tvers — éin
 * gest om gongen, den som leier vinn. «skisse» er reiskapen for sjølve
 * planet: dra flyttar det, vri vinklar det, klyp dollyar kameraet — alle
 * tre samstundes, som på eit kart. Med eit låst plan valt gjeld skisse-
 * gestane DET planet, i begge modusane.
 */
export type Modus = "form" | "skisse"
type Lys = { az: number; el: number }

type Ramma = { cx: number; cy: number; s: number; min: Vec3; max: Vec3; midt: Vec3; fit: Fit }

function ramma(d: BuildRes | null): Ramma | null {
  if (!d) return null
  const { min, max } = d
  const cx = (min[0] + max[0]) / 2
  const cy = (min[1] + max[1]) / 2
  const h = Math.max(1e-6, max[2] - Math.min(0, min[2]))
  const w = Math.max(max[0] - min[0], max[1] - min[1])
  const s = FRAME / Math.max(w, h, 1e-6)
  return {
    cx, cy, s, min, max,
    midt: [cx, cy, (min[2] + max[2]) / 2],
    fit: { r: (Math.hypot(w, h) / 2) * s, w: w * s, h: h * s, cy: (h / 2) * s },
  }
}
/** gruppa: vend −90° om x, skaler, sentrer — og det inverse */
const tilVerd = (f: Ramma, p: Vec3) => new THREE.Vector3(f.s * (p[0] - f.cx), f.s * p[2] + GROUND_Y, -f.s * (p[1] - f.cy))
const fraaVerd = (f: Ramma, v: THREE.Vector3): Vec3 => [v.x / f.s + f.cx, f.cy - v.z / f.s, (v.y - GROUND_Y) / f.s]
const nTilVerd = (n: Vec3) => new THREE.Vector3(n[0], n[2], -n[1])
const nFraaVerd = (v: THREE.Vector3): Vec3 => [v.x, -v.z, v.y]
const diag = (f: Ramma) => Math.hypot(f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2])
/** vinkelskilnad inn i (-π, π] */
const vinkel = (ny: number, gml: number) => {
  let v = ny - gml
  while (v > Math.PI) v -= 2 * Math.PI
  while (v <= -Math.PI) v += 2 * Math.PI
  return v
}
const klem = (v: number, tak: number) => Math.min(tak, Math.max(-tak, v))

/**
 * Materialet som materiale: åringar i det planet flata har, endeved på
 * kutta. Kvart hjørne veit om det er plateflate (0) eller kutt (1) —
 * motoren merkte det der han bygde trekanten — og kva plan det høyrer til.
 * Det valde planet vert lyft, ikkje farga om: du skal kunne samanlikne
 * det med naboane.
 */
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
      // den delen som nett vart skoren lyser éin gong: kvitteringa for skjer
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\nif (uBlink > -0.5 && abs(vPlan - uBlink) < 0.5) totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * uBlinkT;")
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "{",
          "  vec2 q = abs(vNrmO.z) > 0.7 ? vObj.xy : (abs(vNrmO.y) > 0.7 ? vObj.xz : vObj.yz);",
          // kvar sinus døyr av sin eigen skjermromsderiverte, so mønsteret løyser seg i ro og ikkje i moaré
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
/** kvadrat per plan, i millimeter: flatene som trekantar og kantane som liner */
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

/** gruppa delane står i: vend −90° om x, skaler, sentrer. Alt som er millimeter går gjennom henne, og berre henne. */
const gruppa = (f: Ramma) => ({
  rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
  scale: f.s,
  position: [-f.cx * f.s, 0, f.cy * f.s] as [number, number, number],
})

/**
 * PLANET KLIPT TIL BOKSEN KRING KROPPEN. Eit blad på 1,6 diagonalar over
 * heile skjermen sa ingenting om kvar kuttet går; polygonet der planet
 * skjer boksen gjer det. Hjørna er der planet skjer dei tolv kantane,
 * sorterte kring midten sin i planet si eiga ramme. Teikning, ikkje mål:
 * ingenting nedstraums les det.
 */
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
/** eit konvekst polygon som geometri: ei vifte av trekantar, og kantane som liner */
function polygonGeom(poly: readonly Vec3[]) {
  const pos: number[] = []
  const lin: number[] = []
  for (let i = 1; i + 1 < poly.length; i++) pos.push(...poly[0], ...poly[i], ...poly[i + 1])
  for (let i = 0; i < poly.length; i++) lin.push(...poly[i], ...poly[(i + 1) % poly.length])
  return { flate: mkGeom(pos), kant: mkGeom(lin) }
}
/** ein geometri med fast tak på punkt, skriven om att når skissa flyttar seg */
function dynGeom(n: number) {
  const g = new THREE.BufferGeometry()
  const a = new THREE.BufferAttribute(new Float32Array(n * 3), 3)
  a.setUsage(THREE.DynamicDrawUsage)
  g.setAttribute("position", a)
  g.setDrawRange(0, 0)
  return g
}
/** det same polygonet inn i to ferdige geometriar, i verda */
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
/** midten av eit polygon (arealvekta); ein ring utan areal får snittet av punkta */
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
/** midten av snittet: tyngdepunktet i det største stykket, i profilen si ramme. Der set studioet nye strek. */
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
/**
 * EIT STREK SOM PUNKT I PLANET SI RAMME, millimeter frå planet sitt punkt:
 * fire hjørne, eller ein ellipse. Same dreiing som feltet les han med i
 * `snitt.ts` — mot klokka i (u, v) — so det som vert teikna her er det
 * som vert skore der.
 */
function strekRing(s: Strek, S: number): Pt[] {
  const a = (s.a * Math.PI) / 180
  const c = Math.cos(a)
  const si = Math.sin(a)
  const cx = s.x * S
  const cy = s.y * S
  const hw = (s.w * S) / 2
  const hh = (s.h * S) / 2
  const p = (lx: number, ly: number): Pt => [cx + lx * c - ly * si, cy + lx * si + ly * c]
  if (s.form === "rekt") return [p(-hw, -hh), p(hw, -hh), p(hw, hh), p(-hw, hh)]
  const n = 48
  const ring: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI
    ring.push(p(hw * Math.cos(t), hh * Math.sin(t)))
  }
  return ring
}
/** ligg punktet (planet si ramme) i streken, med `tol` millimeter mon — fingeren er ikkje ein peikar */
function iStrek(s: Strek, S: number, q: Pt, tol: number): boolean {
  const a = (s.a * Math.PI) / 180
  const dx = q[0] - s.x * S
  const dy = q[1] - s.y * S
  const lx = dx * Math.cos(a) + dy * Math.sin(a)
  const ly = -dx * Math.sin(a) + dy * Math.cos(a)
  const hw = (s.w * S) / 2 + tol
  const hh = (s.h * S) / 2 + tol
  if (s.form === "rekt") return Math.abs(lx) <= hw && Math.abs(ly) <= hh
  return (lx / hw) ** 2 + (ly / hh) ** 2 <= 1
}

/** kvar synet skal stå: eit tal som tel kvar gong nokon ber om det, og
 *  retninga dei bad om — heimvinkelen når ingen har peika på ei side */
export type Sikt = { n: number; dir: Vec3 | null }

function FitCamera({ fit, rute, flat, sikt }: { fit: Fit | null; rute: Rute; flat: boolean; sikt: Sikt }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update?: () => void } | null
  const invalidate = useThree((s) => s.invalidate)
  const sist = useRef({ r: 0, rute: "", n: 0, flat: null as boolean | null })
  const nokkel = `${rute.W}|${rute.H}|${rute.venstre}|${rute.hogre}|${rute.topp}|${rute.botn}`
  useEffect(() => {
    if (!fit || !controls) return
    const s = sist.current
    // synskuben, eller byte mellom teikning og objekt: ramm inn, uansett
    const heim = s.n !== sikt.n || s.flat !== flat
    if (heim) {
      s.n = sikt.n
      s.flat = flat
      s.r = 0
    }
    const flytta = s.rute !== nokkel
    if (!flytta && s.r && Math.abs(fit.r - s.r) / s.r < 0.1) return
    s.r = fit.r
    s.rute = nokkel
    const persp = camera as THREE.PerspectiveCamera
    // rekninga står i lib/ramme.ts, der ho kan prøvast utanfor ein nettlesar
    const r = ramme(fit, { rute, fovDeg: persp.fov ?? 30, flat })
    // objektet står midt i det FRIE bandet: ei forskyving av projeksjonen,
    // ikkje av siktepunktet — elles snurrar objektet kring eit punkt utanfor seg
    persp.aspect = r.fri.w / r.fri.h
    persp.setViewOffset(r.fri.w, r.fri.h, -r.fri.L, -r.fri.T, size.width, size.height)
    controls.target.set(0, r.y, 0)
    const h = sikt.dir ?? (flat ? HEIM.flat : HEIM.rom)
    const dir = heim ? new THREE.Vector3(...h) : camera.position.clone().sub(controls.target)
    if (dir.lengthSq() < 1e-6) dir.set(...h)
    camera.position.copy(controls.target).add(dir.setLength(r.dist))
    controls.update?.()
    invalidate()
  }, [fit, nokkel, rute, sikt, controls, camera, invalidate, flat, size])
  return null
}

/**
 * HANDA OG SKISSA.
 *
 * Skisseplanet er bunde til kameraet: eit skjermpunkt (pikslar frå midten
 * av det frie bandet) og ein vinkel φ. I rommet: d = cosφ·høgre + sinφ·opp,
 * normalen n = d × fram, og punktet o ligg på strålen gjennom skjermpunktet,
 * i djupna til kroppen sitt sentrum. Ingenting vert bygd av det. Det
 * svingar med synet; eit låst plan gjer det ikkje — det er heile skilnaden.
 *
 *   éin finger        snu synet (OrbitControls)
 *   to fingrar, klyp  STORLEIKEN. Du dreg objektet stort og lite.
 *   to fingrar, vri   VEND. Objektet snur seg på bordet, og plana fylgjer
 *                     ikkje med: du ser med det same om ei anna vending
 *                     gjev eit betre snitt.
 *   to fingrar, dra   SNITTET. Komponenten på tvers av lina flyttar skissa
 *                     over kroppen; med eit plan valt skuvar draget DET
 *                     planet langs normalen sin i staden.
 *   tre fingrar       hovudlyset
 *   handtaka          éin finger på det runde flyttar, på det vesle vrir
 *   ⇧ dra / ⌥ dra     det same for ei mus: flytt, vri. ⌃ hjul er klypet.
 *
 * Klassifiseringa skjer ÉIN gong, etter ei daudsone, og alle fire kandidatar
 * (klyp, vri, dra loddrett, dra vassrett) vert målte i same eining: pikslar.
 * Vridinga vert rekna om til bogen kvar finger har gått, so ein liten vri på
 * to fingrar tett i hop ikkje skuggar for eit drag. Klyp og vri gjev TOTALEN
 * sidan gesten byrja, ikkje eit steg per hending: nettlesaren slår saman
 * rørsler når hovudtråden er oppteken, og eit bygg tek hundre millisekund.
 *
 * Konturen er ei teikning og ikkje eit objekt: der er to fingrar det eit
 * lerret alltid har brukt dei til — flytte og zoome — og skissa er gøymd.
 */
/** daudsona i pikslar, og kor klårt leiaren må leie */
const DAUD = 8
const NOK = 1.25
/** under femten grader er ei vriding ingen kandidat: utilsikta rull ligg under ti */
const VRI_MIN = 0.26
/** skissemodusen: under dette er ei vriding inga vriding, og eit klyp ingen klyp */
const VRI_SAM = 0.15
const KLYP_SAM = 0.04

type Tak = {
  id: number
  x0: number
  y0: number
  /** vinkelen frå midten då vrihandtaket vart teke, og midten sjølv */
  a0: number
  senter: { x: number; y: number }
  pose: { px: number; py: number; phi: number }
  /** planet som er valt, i verda, slik det stod då gesten byrja */
  pl: { id: number; o: THREE.Vector3; n: THREE.Vector3 } | null
}

/** snappet: fem grader til loddrett og vassrett på skjermen, fire pikslar til midtplanet i kroppen */
const SNAPP_VRI = (5 * Math.PI) / 180
const SNAPP_PX = 4
/** snittet i verda, til handtaka: midten av det største stykket, og punkta på ringane (tynna) */
type SnittVerd = { midt: THREE.Vector3; punkt: THREE.Vector3[] }

function Handa({ f, fri, view, modus, vald, plan, snitt, skisse, boks, storleik, valdStrek, live, rValt, setLive, onValdStrek, onStrek, onSynStrek, onPlan, onSkala, onVend, onLys, onGest, onSkisse }: {
  f: Ramma | null
  fri: ReturnType<typeof fritt>
  view: View
  modus: Modus
  vald: number | null
  plan: readonly Plan[]
  /** snittet motoren las av skissa — eller av det valde planet */
  snitt: SkisseSyn | null
  skisse: MutableRefObject<Skisse | null>
  /** handtaka som DOM, over lerretet: scena skriv plassen deira kvar teikning */
  boks: HTMLDivElement | null
  /** streka er brøkar av denne: den lengste sida av kroppen, mm */
  storleik: number
  /** det valde streket i det valde planet, og det same medan det vert drege */
  valdStrek: number | null
  live: Live | null
  /** det valde planet si ramme i millimeter — der streka står */
  rValt: Ramme | null
  setLive: (l: Live | null) => void
  onValdStrek: (i: number | null) => void
  /** streken sleppt: skriv han. Og medan han vert drege: snitt planet med han der han står */
  onStrek: (id: number, i: number, s: Strek) => void
  onSynStrek: (id: number, i: number, s: Strek) => void
  onPlan: (id: number, o: Vec3, n: Vec3) => void
  onSkala: (faktor: number) => void
  onVend: (grader: number) => void
  onLys: (dx: number, dy: number) => void
  onGest: (kva: GestKva) => void
  /** skissa har flytt seg: motoren skal snitte henne om att */
  onSkisse: (s: Skisse) => void
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as { enabled: boolean; target: THREE.Vector3; update?: () => void } | null
  const invalidate = useThree((s) => s.invalidate)
  const gruppe = useRef<THREE.Group>(null)
  /** skissa: pikslar frå midten av det frie bandet, og vinkelen. Loddrett gjennom midten til å byrje med. */
  const pose = useRef({ px: 0, py: 0, phi: Math.PI / 2 })
  /** planet klipt til boksen kring kroppen, i verda; tolv hjørne er taket */
  const boksFlate = useMemo(() => dynGeom(30), [])
  const boksKant = useMemo(() => dynGeom(24), [])
  useEffect(() => () => { boksFlate.dispose(); boksKant.dispose() }, [boksFlate, boksKant])
  const valt = useMemo(() => (vald === null ? null : plan.find((q) => q.id === vald) ?? null), [vald, plan])
  const synleg = !!f && vald === null && view !== "kontur"
  /** snittet i verda: handtaka står PÅ det — flytt i midten, vri på toppen */
  const snittVerd = useMemo<SnittVerd | null>(() => {
    if (!f || !snitt?.ringar.length) return null
    const alle = snitt.ringar.flat()
    const steg = Math.max(1, Math.ceil(alle.length / 240))
    const punkt: THREE.Vector3[] = []
    for (let i = 0; i < alle.length; i += steg) punkt.push(tilVerd(f, ut(snitt.r, alle[i])))
    return { midt: tilVerd(f, ut(snitt.r, snittMidt(snitt))), punkt }
  }, [f, snitt])
  /** lappen ved snittet: ledda det ville fått, og kor langt inne det står — begge lesne av motoren. Raud utan eit einaste ledd mot plan som finst. */
  const lapp = useMemo(() => {
    if (!f || !snitt?.ringar.length) return null
    const ledd = new Set(snitt.kryss.map((k) => k.mot)).size
    return { ord: `${ledd} ledd · ${Math.round(snitt.avstand)} mm`, varsel: ledd === 0 && plan.length > (valt ? 1 : 0) }
  }, [f, snitt, plan.length, valt])
  useEffect(() => invalidate(), [synleg, valt, boks, snittVerd, valdStrek, live, invalidate])
  /** handtaka og lappen i boksen, funne éin gong */
  const delar = useMemo(
    () =>
      boks && {
        flytt: boks.querySelector<HTMLElement>('[data-handtak="flytt"]'),
        vri: boks.querySelector<HTMLElement>('[data-handtak="vri"]'),
        arm: boks.querySelector<HTMLElement>("[data-arm]"),
        merke: boks.querySelector<HTMLElement>("[data-merke]"),
        ord: boks.querySelector<HTMLElement>("[data-ord]"),
        sFlytt: boks.querySelector<HTMLElement>('[data-handtak="strek-flytt"]'),
        sStor: boks.querySelector<HTMLElement>('[data-handtak="strek-storleik"]'),
        sVri: boks.querySelector<HTMLElement>('[data-handtak="strek-vri"]'),
      },
    [boks],
  )
  const senterPx = useRef({ x: 0, y: 0 })
  /** skissa slik ho sist gjekk til motoren, i verda: flyttar ho seg ikkje, spør vi ikkje om att */
  const sist = useRef<{ o: THREE.Vector3; n: THREE.Vector3 } | null>(null)
  /** det siste snappet ein gest gjorde: tikken på lappen */
  const snapp = useRef({ vri: false, pos: false })
  const skrive = useRef("")

  /** kameraet sine aksar i verda */
  const aksar = () => {
    const M = camera.matrixWorld
    return {
      right: new THREE.Vector3().setFromMatrixColumn(M, 0).normalize(),
      up: new THREE.Vector3().setFromMatrixColumn(M, 1).normalize(),
      fwd: new THREE.Vector3().setFromMatrixColumn(M, 2).negate().normalize(),
    }
  }
  /** pikslar per sceneeining i djupna `depth` */
  const pxPer = (depth: number) => fri.h / (2 * depth * Math.tan((camera.fov * Math.PI) / 360))
  /** strålen gjennom eit skjermpunkt i pikslar */
  const straale = (px: number, py: number) =>
    new THREE.Vector3((px / size.width) * 2 - 1, 1 - (py / size.height) * 2, 0.5).unproject(camera).sub(camera.position).normalize()
  /** eit punkt i verda på skjermen, i pikslar */
  const skjerm = (v: THREE.Vector3) => {
    const p = v.clone().project(camera)
    return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height }
  }

  const naa = useRef({ f, vald, valt, view, modus, fri, snittVerd, lapp, snitt, storleik, valdStrek, live, rValt, setLive, onValdStrek, onStrek, onSynStrek, onPlan, onSkala, onVend, onLys, onGest, onSkisse })
  naa.current = { f, vald, valt, view, modus, fri, snittVerd, lapp, snitt, storleik, valdStrek, live, rValt, setLive, onValdStrek, onStrek, onSynStrek, onPlan, onSkala, onVend, onLys, onGest, onSkisse }

  useFrame(() => {
    const g = gruppe.current
    if (!g) return
    g.visible = synleg
    // KAMERAET, TIL LESING UTANFRÅ, og før alt anna: eit drag på eit handtak
    // skal ikkje flytte det, og konturen — som ikkje har handtak i det heile
    // — skal likevel kunne seiast noko om. Avstanden er kor nær du har fått
    // kome; ho er det einaste zoomen kan lesast av på.
    if (boks) {
      boks.dataset.kamera = [camera.position.x, camera.position.y, camera.position.z].map((c) => c.toFixed(6)).join(",")
      if (controls) boks.dataset.avstand = camera.position.distanceTo(controls.target).toFixed(3)
    }
    const gøym = () => {
      if (!boks) return
      boks.style.visibility = "hidden"
      if (delar?.merke) delete delar.merke.dataset.skisse
    }
    if (!f || view === "kontur" || (!synleg && !valt)) {
      sist.current = null
      gøym()
      return
    }
    // kameraet kan ha flytt seg i denne teikninga; matrisa skal vera hans no
    camera.updateMatrixWorld()
    const { right, up, fwd } = aksar()
    /** skissa sitt eige punkt på skjermen: der flyttehandtaket står når snittet er tomt */
    let eige: { x: number; y: number } | null = null
    if (synleg) {
      const p = pose.current
      const d = right.clone().multiplyScalar(Math.cos(p.phi)).addScaledVector(up, Math.sin(p.phi))
      // (d, fram, n) høgrehendt, elles er matrisa ei spegling og ikkje ei dreiing
      const n = new THREE.Vector3().crossVectors(d, fwd).normalize()
      const ray = straale(fri.L + fri.w / 2 + p.px, fri.T + fri.h / 2 + p.py)
      const depth = tilVerd(f, f.midt).sub(camera.position).dot(fwd)
      const o = camera.position.clone().addScaledVector(ray, depth / Math.max(1e-6, ray.dot(fwd)))
      const oM = fraaVerd(f, o)
      const nM = nFraaVerd(n)
      skisse.current = { o: oM, n: nM }
      // Flytta seg? Då vert planet klipt til boksen på nytt, og motoren
      // får skissa: han svarar med snittet so fort han rekk, og det siste vinn.
      const s = sist.current
      if (!s || s.o.distanceToSquared(o) > 1e-8 || s.n.distanceToSquared(n) > 1e-8) {
        sist.current = { o: o.clone(), n: n.clone() }
        skrivPolygon(boksFlate, boksKant, planIBoks({ o: oM, n: nM, ...akser(nM) }, f.min, f.max).map((q) => tilVerd(f, q)))
        onSkisse(skisse.current)
      }
      eige = skjerm(o)
    }
    if (!boks || !delar) return
    /** eit handtak på 48 pikslar med midten i (x, y) — som plass, ikkje som transform: knappane er flate */
    const sett = (h: HTMLElement, x: number, y: number) => {
      h.style.left = `${x - 24}px`
      h.style.top = `${y - 24}px`
    }
    const { flytt, vri, arm, merke, ord, sFlytt, sStor, sVri } = delar
    const sv = naa.current.snittVerd
    if (!sv) {
      // Ingen profil: kuttet råkar ikkje kroppen. Berre flyttehandtaket står
      // att, på skissa sitt eige punkt — det er vegen attende. Eit valt plan
      // utan profil har ingenting å ta i.
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
    // vrihandtaket står på toppen av snittet slik det ligg på skjermen — aldri nærare
    // midten enn 56 pikslar, og aldri over det frie bandet: zoomar du inn so toppen går
    // av skjermen, står handtaket i overkanten og kan framleis takast
    let topp = c.y
    for (const q of sv.punkt) topp = Math.min(topp, skjerm(q).y)
    const vy = Math.max(Math.min(topp, c.y - 56), Math.min(c.y - 56, fri.T + 36))
    const inne = c.x > -40 && c.x < size.width + 40 && c.y > -40 && c.y < size.height + 40
    boks.style.visibility = inne ? "visible" : "hidden"
    boks.dataset.slag = synleg ? "skisse" : "plan"
    if (flytt) sett(flytt, c.x, c.y)
    if (vri) sett(vri, c.x, vy)
    if (arm) {
      arm.style.width = `${c.y - vy}px`
      arm.style.transform = `translate(${c.x}px, ${c.y}px) rotate(-90deg)`
    }
    // STREKEN SOM ER VALT: tre handtak på han — flytt i midten, storleiken i
    // hjørnet nede til høgre, vri utanfor toppkanten, alle lesne av streken
    // slik fingeren har han. Planet sine eigne handtak står bort imens.
    const st = naa.current
    const S = st.storleik
    const s = st.live?.s ?? (st.valt && st.valdStrek !== null ? st.valt.strek[st.valdStrek] : undefined)
    if (s && st.rValt && sFlytt && sStor && sVri) {
      boks.dataset.strek = ""
      const a = (s.a * Math.PI) / 180
      const co = Math.cos(a)
      const si = Math.sin(a)
      const cx = s.x * S
      const cy = s.y * S
      const hw = (s.w * S) / 2
      const hh = (s.h * S) / 2
      const r = st.rValt
      const paa = (lx: number, ly: number) => skjerm(tilVerd(f, ut(r, [cx + lx * co - ly * si, cy + lx * si + ly * co])))
      const m = paa(0, 0)
      // storleiken langs midten→hjørnet, vri langs midten→toppen: aldri nærare
      // midten enn 56 pikslar, elles ligg tre handtak oppå kvarandre på eit lite strek
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
      // lappen finst berre når det finst eit snitt å lese av. Ord og tal, ikkje setningar: ledda og kor langt inne — eller streken sine mål.
      merke.dataset.skisse = "snitt"
      const l = naa.current.lapp
      const tekst = s
        ? `${s.slag === "gods" ? "gods" : "hòl"} ${Math.round(s.w * S)}×${Math.round(s.h * S)} mm${s.a ? ` · ${Math.round(s.a)}°` : ""}`
        : `${synleg ? "" : `${valt!.id} · `}${l ? l.ord : synleg ? "skisse" : ""}`
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
    type Gest = "none" | "klyp" | "vri" | "dra" | "sam" | "lys" | "hFlytt" | "hVri" | "musFlytt" | "musVri" | "sFlytt" | "sStor" | "sVri"
    let mode: Gest = "none"
    /** eit handtak er teke: ingen peikar når lerretet — korkje orbiten, gestmotoren eller augneblinksbiletet */
    const handtakGaar = () => mode === "hFlytt" || mode === "hVri" || mode === "sFlytt" || mode === "sStor" || mode === "sVri"
    /** taket på eit strek: kva plan og kva strek, slik han stod, planet si ramme, og punktet under fingeren i henne */
    let stak: { id: number; i: number; plan: number; s0: Strek; s: Strek | null; r: Ramme; q0: Pt; ang0: number } | null = null
    /** eit trykk som valde eller slepte eit strek: klikket som fylgjer skal ikkje òg velje ein del eller sleppe planet */
    let svelgKlikk = false
    /** skissemodusen: dra, vri og klyp SAMSTUNDES, kvar med si daudsone */
    let sam = { d0: 1, sistA: 0, vri: 0, dist0: 6, akt: { pan: false, vri: false, klyp: false }, sagt: null as GestKva }
    /** skissegestane gjeld når brytaren står på skisse — og alltid når eit låst plan er valt */
    const skisseStil = () => naa.current.modus === "skisse" || naa.current.valt !== null
    let last = { cx: 0, cy: 0, d: 0, a: 0 }
    /** stoda då gesten vart klassifisert, som klyp, vri og drag måler frå */
    let start = { cx: 0, cy: 0, d: 0, a: 0 }
    /** summen av vridinga, so ho kan gå forbi eit halvt omdreiing */
    let vridd = 0
    /** der den andre fingeren landa: alle fire kandidatar vert målte SIDAN ankeret */
    let anker = { cx: 0, cy: 0, d: 0, a: 0 }
    let sumVri = 0
    /** kven som leier, og kor mange hendingar han har leidd */
    let leiar: "klyp" | "vri" | "v" | "h" | null = null
    let iRad = 0
    let snap: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
    let tak: Tak | null = null
    // trykket: kort, og stillestandande
    let tapDown = { x: 0, y: 0, t: 0, id: -1 }

    const restore = () => {
      if (!snap || !controls) return
      camera.position.copy(snap.pos)
      controls.target.copy(snap.target)
      controls.update?.()
      invalidate()
    }
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
    /** det gesten tek i: skissa slik ho står, eller det valde planet slik det står */
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
    /**
     * Gesten so langt, brukt på skissa eller planet: eit drag på (dx, dy)
     * pikslar og ei vriding på `ang` radianar på skjermen (med klokka er
     * positivt). Skissa flyttar på tvers av lina — langs henne er ingenting
     * — og midten held seg i det frie bandet, so handtaket alltid kan
     * nåast. Planet skuvar langs normalen sin og dreier kring synsaksen.
     */
    const bruk = (t: Tak, dx: number, dy: number, ang: number) => {
      const { f, onPlan, fri } = naa.current
      if (!f) return
      const sn = { vri: false, pos: false }
      if (t.pl) {
        const { right, up, fwd } = aksar()
        // ei dreiing kring synsaksen: med klokka på skjermen er positivt kring «fram»
        const n = t.pl.n.clone()
        if (ang) {
          n.applyAxisAngle(fwd, ang)
          // SNAPPET: sporet på skjermen fell på loddrett eller vassrett innan fem grader.
          // Ei dreiing om «fram» aukar skjermvinkelen til normalen like mykje.
          const ns = new THREE.Vector2(n.dot(right), -n.dot(up))
          if (ns.length() > 0.05) {
            const a = Math.atan2(ns.y, ns.x)
            const q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2)
            if (Math.abs(a - q) < SNAPP_VRI) {
              n.applyAxisAngle(fwd, q - a)
              sn.vri = true
            }
          }
        }
        const o = t.pl.o.clone()
        if (dx || dy) {
          // normalen projisert på skjermen, i pikslar; draget prikka med han.
          // Eit plan sett rett framanfrå har inga retning å skuve i.
          const k = pxPer(Math.max(0.1, o.clone().sub(camera.position).dot(fwd)))
          const ns = new THREE.Vector2(n.dot(right) * k, -n.dot(up) * k)
          if (ns.length() > 0.05 * k) {
            o.addScaledVector(n, (dx * ns.x + dy * ns.y) / ns.lengthSq())
            // og midtplanet i kroppen tek planet innan fire pikslar
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
        if (ang) {
          const q = Math.round(phi / (Math.PI / 2)) * (Math.PI / 2)
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
          // midten av kroppen på skjermen, målt frå midten av det frie bandet: lina tek han innan fire pikslar
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
    const vri = (t: Tak, ang: number) => bruk(t, 0, 0, ang)
    /** klypet i skissemodusen dollyar kameraet: totalen sidan gesten byrja */
    const dolly = (klyp: number) => {
      if (!controls) return
      const dist = Math.min(MAX_DIST, Math.max(MIN_DIST, sam.dist0 / klyp))
      // retninga FØR kameraet vert flytt: `copy` går føre argumentet sitt, og
      // eit nullpunkt vart til eit kamera rett over objektet i azimut null
      const retn = camera.position.clone().sub(controls.target).setLength(dist)
      camera.position.copy(controls.target).add(retn)
      controls.update?.()
      invalidate()
    }
    const slepp = () => {
      mode = "none"
      tak = null
      stak = null
      naa.current.onGest(null)
    }
    /** handtaket sleppt: orbiten får kameraet att */
    const sleppHandtak = () => {
      if (controls) controls.enabled = true
      slepp()
    }
    /** der strålen gjennom eit skjermpunkt råkar planet, i planet si ramme — millimeter frå planet sitt punkt. Null når planet står på kant. */
    const paaPlanet = (px: number, py: number, r: Ramme): Pt | null => {
      const { f } = naa.current
      if (!f) return null
      const ray = straale(px, py)
      const n = nTilVerd(r.n)
      const k = ray.dot(n)
      if (Math.abs(k) < 0.02) return null
      const t = tilVerd(f, r.o).sub(camera.position).dot(n) / k
      if (t <= 0) return null
      return inn(r, fraaVerd(f, camera.position.clone().addScaledVector(ray, t)))
    }
    /**
     * EIT TRYKK MED EIT PLAN VALT: på eit strek vel det streken, på snittet
     * utanom streka slepp det streken — planet står. Lese i planet si ramme
     * med åtte pikslar mon, for fingeren er ikkje ein peikar. Klikket som
     * fylgjer vert svelgt, elles ville det òg velje delen under eller sleppe
     * planet. Utanfor snittet går trykket sin vanlege veg.
     */
    const trykkStrek = (x: number, y: number) => {
      const { f, valt, valdStrek, rValt, storleik: S, snitt, view, onValdStrek } = naa.current
      if (!f || !valt || !rValt || view === "kontur" || (!valt.strek.length && valdStrek === null)) return
      const q = paaPlanet(x, y, rValt)
      if (!q) return
      const { fwd } = aksar()
      const tol = 8 / (pxPer(Math.max(0.1, tilVerd(f, rValt.o).sub(camera.position).dot(fwd))) * f.s)
      // fleire strek under fingeren: det minste vinn, so eit hòl inni eit gods kan takast
      let treff = -1
      let minst = Infinity
      valt.strek.forEach((s, i) => {
        if (iStrek(s, S, q, tol) && s.w * s.h < minst) {
          minst = s.w * s.h
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

    const ned = (e: PointerEvent) => {
      svelgKlikk = false
      // eit handtak er teke: ein finger til på lerretet skal ikkje snu eller zoome medan det varer
      if (handtakGaar()) return e.stopImmediatePropagation()
      // trykk-kandidat for mus og finger begge: fyrste peikar, åleine
      tapDown = pts.size === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : { x: 0, y: 0, t: 0, id: -1 }
      const flat = naa.current.view === "kontur"
      if (e.pointerType !== "touch") {
        if (flat || !(e.shiftKey || e.altKey) || e.button !== 0) return
        // musa: same gesten, éin peikar. Orbiten skal ikkje òg starte.
        e.stopImmediatePropagation()
        e.preventDefault()
        tak = taTak(e.clientX, e.clientY, e.pointerId)
        if (!tak) return
        mode = e.altKey ? "musVri" : "musFlytt"
        naa.current.onGest("snitt")
        return
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1 && controls) snap = { pos: camera.position.clone(), target: controls.target.clone() }
      if (pts.size === 2 && mode !== "lys" && !flat) {
        if (controls) controls.enabled = false
        const c = measure2()
        last = c
        if (skisseStil()) {
          // skissa: den fyrste fingeren rakk å snu synet litt før den andre
          // landa; det høyrer ikkje til gesten. Og alle tre gestane er
          // levande frå no, kvar med si daudsone.
          restore()
          tak = taTak(c.cx, c.cy)
          sam = { d0: Math.max(1, c.d), sistA: c.a, vri: 0, dist0: controls ? camera.position.distanceTo(controls.target) : 6, akt: { pan: false, vri: false, klyp: false }, sagt: null }
          mode = "sam"
        } else {
          mode = "none"
          anker = c
          sumVri = 0
          leiar = null
          iRad = 0
        }
      }
      if (pts.size === 3) {
        mode = "lys"
        const c = centroid()
        last = { cx: c.x, cy: c.y, d: 0, a: 0 }
        if (controls) controls.enabled = false
        restore()
        naa.current.onGest("lys")
      }
    }

    const rorsle = (e: PointerEvent) => {
      if (mode === "sFlytt" || mode === "sStor" || mode === "sVri") {
        if (!stak || e.pointerId !== stak.id) return
        const q = paaPlanet(e.clientX, e.clientY, stak.r)
        if (!q) return
        const S = naa.current.storleik
        const s0 = stak.s0
        const sn = { vri: false, pos: false }
        let s: Strek
        if (mode === "sFlytt") {
          s = { ...s0, x: klem(s0.x + (q[0] - stak.q0[0]) / S, 1.5), y: klem(s0.y + (q[1] - stak.q0[1]) / S, 1.5) }
        } else if (mode === "sStor") {
          // hjørnet nede til høgre fylgjer fingeren og midten står: det fingeren
          // har gått i streken si eiga ramme, lagt til halvsidene — som skilnad
          // frå der han tok tak, so handtaket kan stå utanfor hjørnet utan at
          // storleiken hoppar. Ein rund strek held same mål begge vegar.
          const a = (s0.a * Math.PI) / 180
          const dx = q[0] - stak.q0[0]
          const dy = q[1] - stak.q0[1]
          const lx = dx * Math.cos(a) + dy * Math.sin(a)
          const ly = -dx * Math.sin(a) + dy * Math.cos(a)
          const minst = 0.01 * S
          let hw = Math.max(minst, (s0.w * S) / 2 + lx)
          let hh = Math.max(minst, (s0.h * S) / 2 - ly)
          if (s0.form === "rund") hw = hh = Math.max(minst, (s0.w * S) / 2 + (lx - ly) / 2)
          s = { ...s0, w: Math.min(2, (2 * hw) / S), h: Math.min(2, (2 * hh) / S) }
        } else {
          // vinkelen i planet, kring midten; snappar til 0 og 90 innan fem grader
          const ang = Math.atan2(q[1] - s0.y * S, q[0] - s0.x * S)
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
      if (pts.size !== 2 || naa.current.view === "kontur") return
      const c = measure2()
      if (mode === "sam") {
        if (!tak) return
        sam.vri += vinkel(c.a, sam.sistA)
        sam.sistA = c.a
        const panX = c.cx - tak.x0
        const panY = c.cy - tak.y0
        const klyp = c.d / sam.d0
        if (!sam.akt.pan && Math.hypot(panX, panY) > 6) sam.akt.pan = true
        if (!sam.akt.vri && Math.abs(sam.vri) > VRI_SAM) sam.akt.vri = true
        if (!sam.akt.klyp && Math.abs(klyp - 1) > KLYP_SAM) sam.akt.klyp = true
        if (sam.akt.klyp) dolly(klyp)
        if (sam.akt.pan || sam.akt.vri) bruk(tak, sam.akt.pan ? panX : 0, sam.akt.pan ? panY : 0, sam.akt.vri ? sam.vri : 0)
        const sagt: GestKva = sam.akt.pan || sam.akt.vri ? "snitt" : sam.akt.klyp ? "zoom" : null
        if (sagt !== sam.sagt) {
          sam.sagt = sagt
          naa.current.onGest(sagt)
        }
        last = c
        return
      }
      const dv = vinkel(c.a, last.a)
      // Vinkelen vert lagd saman heile vegen, òg medan gesten er namnlaus: det er han klassifiseringa les.
      sumVri += dv
      if (mode === "none") {
        /**
         * GESTEN FÅR NAMN ÉIN GONG, PÅ TOTALANE. Alle fire står i same
         * eininga — pikslar. Vridinga vert rekna om til bogen kvar finger
         * har gått, med radien fingrane hadde DÅ DEI LANDA. Under VRI_MIN
         * er vridinga ingen kandidat i det heile.
         */
        const A = Math.abs(sumVri) > VRI_MIN ? Math.abs(sumVri) * (anker.d / 2) : 0
        const D = Math.abs(c.d - anker.d)
        const X = Math.abs(c.cx - anker.cx)
        const Y = Math.abs(c.cy - anker.cy)
        const M = Math.max(A, D, X, Y)
        if (M < DAUD) {
          // `last` er FØRRE HENDING òg medan gesten er namnlaus, elles vert
          // den same vridinga lagd saman om att: ein sum av delsummar
          last = c
          return
        }
        // Den som leier må leie KLÅRT — med eit forhold OG ei heil daudsone
        // — og i tre bilete på rad. Ti bilete på rad tek han uansett.
        const storst: "klyp" | "vri" | "v" | "h" = A === M ? "vri" : D === M ? "klyp" : Y === M ? "v" : "h"
        if (storst !== leiar) {
          leiar = storst
          iRad = 0
        }
        iRad++
        const nest = Math.max(...[A, D, X, Y].filter((v) => v !== M), 0)
        const klaart = M > NOK * nest && M - nest >= DAUD
        if (!(klaart && iRad >= 3) && iRad < 10) {
          last = c
          return
        }
        mode = leiar === "klyp" ? "klyp" : leiar === "vri" ? "vri" : "dra"
        // Nullpunktet er der gesten VART til, ikkje der fingrane landa:
        // daudsona skal ikkje telje med i totalen. For vridinga er det
        // motsett — ho tek med seg det ho alt har samla; du gjorde gesten,
        // du skal få han. `- dv` av di denne hendinga alt ligg i sumVri.
        start = c
        vridd = mode === "vri" ? sumVri - dv : 0
        // Den fyrste fingeren rakk å snu synet litt før den andre landa.
        // Den rotasjonen høyrer ikkje til gesten, so han vert lagd attende.
        restore()
        tak = taTak(c.cx, c.cy)
        naa.current.onGest(mode === "klyp" ? "storleik" : mode === "vri" ? "vend" : "snitt")
      }
      if (mode === "klyp") {
        if (start.d > 8 && c.d > 8) naa.current.onSkala(c.d / start.d)
      } else if (mode === "vri") {
        // Skjermen har y nedover, so ein vri med klokka aukar vinkelen. Objektet
        // skal fylgje fingrane, og med klokka ovanfrå er negativt kring z.
        vridd += dv
        naa.current.onVend((-vridd * 180) / Math.PI)
      } else if (mode === "dra" && tak) {
        flytt(tak, c.cx - start.cx, c.cy - start.cy)
      }
      last = c
    }

    const opp = (e: PointerEvent) => {
      // trykket, for mus og finger begge — FØR fingerbokhaldet, av di musa aldri står i pts
      if (e.pointerId === tapDown.id) {
        // EIT TRYKK ER EIT TRYKK. Det andre i eit dobbelttrykk ramma inn på
        // nytt før, og ei ramme du ikkje bad om midt i ei sikting kastar
        // vinkelen du stod og fann. Innramminga står i synskuben no.
        if (performance.now() - tapDown.t < 260 && Math.hypot(e.clientX - tapDown.x, e.clientY - tapDown.y) < 12) {
          trykkStrek(e.clientX, e.clientY)
        }
        tapDown = { x: 0, y: 0, t: 0, id: -1 }
      }
      if (mode === "musFlytt" || mode === "musVri") return slepp()
      if ((mode === "hFlytt" || mode === "hVri") && tak && e.pointerId === tak.id) return sleppHandtak()
      if ((mode === "sFlytt" || mode === "sStor" || mode === "sVri") && stak && e.pointerId === stak.id) {
        // sleppt: det streken vart til er éi endring i parametrane — og eitt steg i angre
        if (stak.s) naa.current.onStrek(stak.plan, stak.i, stak.s)
        naa.current.setLive(null)
        snapp.current = { vri: false, pos: false }
        return sleppHandtak()
      }
      if (!pts.delete(e.pointerId)) return
      if (pts.size === 0) {
        slepp()
        snap = null
        if (controls) controls.enabled = true
      } else if (pts.size < 2 && mode !== "lys") slepp()
    }

    /**
     * KLYPET PÅ EI STYREFLATE kjem som eit hjul med ctrl nede, og det er
     * det einaste klypet skrivebordet har. Hjulet har ingen start og ingen
     * slutt, so gesten er «hakk som kjem tett»: totalen står til det har
     * vore stille i eit halvt sekund, og gesten MELDER SEG ÉIN GONG —
     * grunnstoda han vert målt frå skal ikkje flytte seg for kvart hakk.
     */
    let hjulTimer = 0
    let hjulTotal = 1
    let hjulGaar = false
    const hjul = (e: WheelEvent) => {
      if (!e.ctrlKey || naa.current.view === "kontur") return
      e.preventDefault()
      e.stopPropagation()
      if (!hjulGaar) {
        hjulGaar = true
        naa.current.onGest("storleik")
      }
      hjulTotal *= Math.exp(-e.deltaY * 0.01)
      naa.current.onSkala(hjulTotal)
      window.clearTimeout(hjulTimer)
      hjulTimer = window.setTimeout(() => {
        naa.current.onGest(null)
        hjulTotal = 1
        hjulGaar = false
      }, 500)
    }

    /**
     * HANDTAKA: éin finger, same gesten som to. Delegert frå boksen, so
     * referansane aldri er i vegen. Handtaket EIG fingeren: peikaren vert
     * fanga på det, og orbiten er av so lenge draget varer — same finger
     * skal aldri snu eller zoome kameraet, heller ikkje om han glid ut av
     * handtaket, og ein finger til på lerretet vert avvist imens (sjå `ned`).
     */
    const nedHandtak = (e: PointerEvent) => {
      const h = (e.target as Element).closest<HTMLElement>("[data-handtak]")
      if (!h || (e.pointerType === "mouse" && e.button !== 0)) return
      e.preventDefault()
      e.stopPropagation()
      if (handtakGaar()) return
      const slag = h.dataset.handtak ?? ""
      const strek = slag.startsWith("strek-")
      if (strek) {
        const { valt, valdStrek, rValt, storleik: S } = naa.current
        const s0 = valt && valdStrek !== null ? valt.strek[valdStrek] : undefined
        if (!valt || valdStrek === null || !s0 || !rValt) return
        const q0 = paaPlanet(e.clientX, e.clientY, rValt) ?? [s0.x * S, s0.y * S]
        stak = { id: e.pointerId, i: valdStrek, plan: valt.id, s0, s: null, r: rValt, q0, ang0: Math.atan2(q0[1] - s0.y * S, q0[0] - s0.x * S) }
        mode = slag === "strek-flytt" ? "sFlytt" : slag === "strek-storleik" ? "sStor" : "sVri"
      } else {
        const t = taTak(e.clientX, e.clientY, e.pointerId)
        if (!t) return
        if (slag === "vri") {
          t.a0 = Math.atan2(e.clientY - t.senter.y, e.clientX - t.senter.x)
          mode = "hVri"
        } else mode = "hFlytt"
        tak = t
      }
      try {
        h.setPointerCapture(e.pointerId)
      } catch {
        // ein peikar som alt er sleppt
      }
      if (controls) controls.enabled = false
      naa.current.onGest(strek ? "strek" : "snitt")
    }
    const svelg = (e: MouseEvent) => {
      if (!svelgKlikk) return
      svelgKlikk = false
      if (e.target === el) e.stopImmediatePropagation()
    }

    // iOS tek vassrette to-finger-sveip som navigasjon; berre ei ikkje-passiv touchmove tek dei attende
    const taTouchen = (e: TouchEvent) => { if (e.touches.length >= 2) e.preventDefault() }
    el.addEventListener("touchstart", taTouchen, { passive: false })
    el.addEventListener("touchmove", taTouchen, { passive: false })
    el.addEventListener("pointerdown", ned, { capture: true })
    el.addEventListener("wheel", hjul, { passive: false, capture: true })
    boks?.addEventListener("pointerdown", nedHandtak)
    window.addEventListener("click", svelg, { capture: true })
    const vindu: [string, (e: PointerEvent) => void][] = [["pointermove", rorsle], ["pointerup", opp], ["pointercancel", opp]]
    for (const [n, h] of vindu) window.addEventListener(n, h as EventListener, { passive: true })
    return () => {
      el.removeEventListener("touchstart", taTouchen)
      el.removeEventListener("touchmove", taTouchen)
      el.removeEventListener("pointerdown", ned, { capture: true })
      el.removeEventListener("wheel", hjul, { capture: true } as EventListenerOptions)
      boks?.removeEventListener("pointerdown", nedHandtak)
      window.removeEventListener("click", svelg, { capture: true })
      for (const [n, h] of vindu) window.removeEventListener(n, h as EventListener)
      window.clearTimeout(hjulTimer)
      if (controls) controls.enabled = true
    }
  }, [gl, controls, camera, invalidate, boks])

  // Planet, klipt til boksen kring kroppen, so vidt synleg — og kanten som
  // ei tynn line. Råkar skissa ikkje kroppen, er lina alt du ser av henne.
  return (
    <group ref={gruppe} visible={false}>
      <mesh geometry={boksFlate} renderOrder={2} frustumCulled={false}>
        <meshBasicMaterial color={SKISSE} transparent opacity={0.06} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={boksKant} renderOrder={3} frustumCulled={false}>
        <lineBasicMaterial color={SKISSE} transparent opacity={0.4} depthTest={false} />
      </lineSegments>
    </group>
  )
}

/**
 * SNITTET, SLIK MOTOREN LAS DET. Profilen skissa — eller det valde planet —
 * gjev gjennom kroppen: fylt, med kanten skarp, og strekane der planet
 * kryssar eit låst plan i gods: ledda det ville fått. Ringane kjem i planet
 * si ramme i millimeter; `ut` set dei i kroppen sitt rom, og gruppa er den
 * same som delane står i, so skalaen ikkje kan drive. Teikna over alt: det
 * er det du ville fått, ikkje ein ting i rommet.
 */
function Snittet({ f, snitt, farge }: { f: Ramma; snitt: SkisseSyn; farge: string }) {
  const g = useMemo(() => {
    const V = (q: Pt) => new THREE.Vector2(q[0], q[1])
    const ytre: THREE.Vector2[][] = []
    const hol: THREE.Vector2[][] = []
    for (const r of snitt.ringar) (shoelace(r) > 0 ? ytre : hol).push(r.map(V))
    // ringar utan eit ytre er ytre: teikn det som er
    if (!ytre.length) ytre.push(...hol.splice(0))
    const pos: number[] = []
    for (const o of ytre) {
      const mine = hol.filter((h) => inRing(o.map((v) => [v.x, v.y] as Pt), [h[0].x, h[0].y]))
      // earcut; han kan ta bort eit dublert endepunkt, so punktlista vert lesen ETTERPÅ
      const tri = THREE.ShapeUtils.triangulateShape(o, mine)
      const alle = [...o, ...mine.flat()]
      for (const t of tri) for (const i of t) pos.push(...ut(snitt.r, [alle[i].x, alle[i].y]))
    }
    const lin: number[] = []
    for (const r of snitt.ringar) for (let i = 0; i < r.length; i++) lin.push(...ut(snitt.r, r[i]), ...ut(snitt.r, r[(i + 1) % r.length]))
    // kryssa som korte, tjukke strekar i planet: breidda fylgjer kroppen, so dei er like synlege på ein knapp og ein benk
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

/**
 * STREKA I DET VALDE PLANET, teikna der dei står: det valde med heil strek
 * og eit pluss eller minus i midten, dei andre stipla so dei kan finnast og
 * takast. Berre ei teikning — profilen med streka skorne kjem frå motoren,
 * og medan eit strek vert drege står han her lokalt (`live`) til motoren
 * har snitta han. Same gruppe som delane, so skalaen ikkje kan drive.
 */
function Streka({ f, r, strek, vald, live, S, farge }: { f: Ramma; r: Ramme; strek: readonly Strek[]; vald: number | null; live: Strek | null; S: number; farge: string }) {
  const g = useMemo(() => {
    const heil: number[] = []
    const stipla: number[] = []
    const avst: number[] = []
    strek.forEach((s0, i) => {
      const s = i === vald && live ? live : s0
      const ring = strekRing(s, S)
      if (i === vald) {
        for (let k = 0; k < ring.length; k++) heil.push(...ut(r, ring[k]), ...ut(r, ring[(k + 1) % ring.length]))
        // glyfen: pluss for gods, minus for hòl, ein fjerdedel av den minste sida
        const a = (s.a * Math.PI) / 180
        const c = Math.cos(a)
        const si = Math.sin(a)
        const cx = s.x * S
        const cy = s.y * S
        const gl = Math.max(1.5, (Math.min(s.w, s.h) * S) / 4)
        const p = (lx: number, ly: number): Pt => [cx + lx * c - ly * si, cy + lx * si + ly * c]
        heil.push(...ut(r, p(-gl, 0)), ...ut(r, p(gl, 0)))
        if (s.slag === "gods") heil.push(...ut(r, p(0, -gl)), ...ut(r, p(0, gl)))
        return
      }
      // stipla: avstanden langs ringen, so mønsteret ikkje byrjar om att for kvart lille stykke av ein ellipse
      let d = 0
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k]
        const b = ring[(k + 1) % ring.length]
        const L = Math.hypot(b[0] - a[0], b[1] - a[1])
        stipla.push(...ut(r, a), ...ut(r, b))
        avst.push(d, d + L)
        d += L
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

/**
 * DEMPINGA ER EIT SPØRSMÅL OM BILETE PER SEKUND./**
 * DEMPINGA ER EIT SPØRSMÅL OM BILETE PER SEKUND. Rotasjonen glid til ro i
 * staden for å stogge daudt — men glidinga er femti bilete, og på ei maskin
 * som teiknar fem i sekundet er femti bilete ti sekund der ingen knapp
 * svarar. Målt: 7,5 s hale etter eitt drag i ein programvare-GL, og låsen
 * svara etter åtte. So dempinga fylgjer biletetakta: er bileta seine,
 * stoggar rotasjonen der fingeren slepp; vert dei raske att, glid ho.
 */
function Demping({ onSein }: { onSein: (sein: boolean) => void }) {
  const sist = useRef(0)
  const seine = useRef(0)
  const raske = useRef(0)
  const sein = useRef(false)
  useFrame(() => {
    const n = performance.now()
    const d = n - sist.current
    sist.current = n
    // ei pause er ikkje eit mål på takta; berre bilete som fylgjer kvarandre tel
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

/** kroppen og delane, i kroppen si ramme */
function Kroppen({ f, kropp, lag, view, material, liste, vald, plan, spok, blink, sein, onVald }: {
  f: Ramma
  kropp: BuildRes | null
  lag: BuildRes | null
  view: View
  material: string
  liste: readonly Kutt[]
  vald: number | null
  plan: readonly Plan[]
  spok: readonly Plan[] | null
  /** planet som nett vart skore: delen hans lyser éin gong når han kjem */
  blink: number | null
  /** bileta er seine: blinken er då eitt bilete og ei klokke, ikkje ei rekkje teikningar */
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
  // Kva plan kvart hjørne høyrer til: motoren merkjer lina i kuttlista,
  // og lina kjenner planet sitt. Lista kjem eit steg etter nettet, so eit
  // bel er merket tomt.
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
  // det valde planet klipt til boksen, som skissa — ikkje eit blad over heile skjermen
  const gVald = useMemo(() => {
    const p = vald === null ? null : plan.find((q) => q.id === vald)
    return p ? polygonGeom(planIBoks(planRamme(p, f.min, f.max), f.min, f.max)) : null
  }, [vald, plan, f])
  // skuggeplana er mange og ligg oppå kvarandre: lette, og ikkje større enn kroppen treng
  const gSpok = useMemo(() => (spok?.length ? kvadratar(spok, f, 1.15) : null), [spok, f])
  useEffect(() => () => gKropp?.dispose(), [gKropp])
  useEffect(() => () => gLag?.dispose(), [gLag])
  useEffect(() => () => { gVald?.flate.dispose(); gVald?.kant.dispose() }, [gVald])
  useEffect(() => () => { gSpok?.flate.dispose(); gSpok?.kant.dispose() }, [gSpok])

  const mat = (material in MATERIALS ? material : "finer") as Material
  const surf = useMemo(() => makeWood(MATERIALS[mat].hex, 0.9, uKorn.current, uVald.current, uBlink.current, uBlinkT.current), [mat])
  useEffect(() => () => surf.dispose(), [surf])
  /**
   * KVITTERINGA FOR SKJER: den nye delen lyser i det han kjem og døyr ut
   * over fire hundre millisekund — det er fyrst når lista kjenner planet at
   * hjørna hans er merkte, so blinken går på det biletet som uansett
   * teiknar han. Same plan blinkar ikkje to gonger. Utdøyinga er ei rekkje
   * bilete berre når bileta er raske: på ei sein maskin er kvart bilete ein
   * halv sekund, og ei rekkje av dei ville stått i vegen for lina som skal
   * seie at planet er skore. Der er blinken eitt bilete, og klokka sløkkjer.
   */
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
    // Sløkkinga er eit bilete til. Er bileta seine, kjem det fyrst når det
    // som fylgjer eit skjer — lina, lista, plata — har fått teikne seg.
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
    // akryl har ikkje ved
    uKorn.current.value = mat === "akryl" ? 0 : mat === "papp" ? 0.5 : 1
    invalidate()
  }, [vald, mat, invalidate])

  const pluk = (e: { face?: { a: number } | null; clientX: number; clientY: number; detail: number; stopPropagation: () => void }) => {
    // eit trykk, ikkje eit drag som enda på ein del; og ikkje dobbelttrykket
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
      {gKropp && !solid && (
        // skuggen av kroppen. Ikkje til å peike på: han ligg utanpå delane
        // og ville teke kvart einaste trykk.
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
      {gSpok && (
        <>
          <mesh geometry={gSpok.flate} raycast={() => null} renderOrder={2}>
            <meshBasicMaterial color={SKISSE} transparent opacity={0.05} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <lineSegments geometry={gSpok.kant}>
            <lineBasicMaterial color={SKISSE} transparent opacity={0.45} />
          </lineSegments>
        </>
      )}
    </group>
  )
}

/** konturen: profilane flatt ved sida av kvarandre, ei teikning i blekk */
function Konturen({ f, d, ink }: { f: Ramma; d: BuildRes; ink: string }) {
  const thin = useMemo(() => mkGeom(d.lines), [d])
  const bold = useMemo(() => mkGeom(d.heavy), [d])
  useEffect(() => () => { thin.dispose(); bold.dispose() }, [thin, bold])
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={f.s} position={[-f.cx * f.s, 0, f.cy * f.s]}>
      {/* det tynne er alle profillinene, det tunge er omrisset som vert skore */}
      <lineSegments geometry={thin}><lineBasicMaterial color={ink} transparent opacity={0.22} /></lineSegments>
      <lineSegments geometry={bold}><lineBasicMaterial color={ink} /></lineSegments>
    </group>
  )
}

/**
 * SYNSKUBEN. Ei avlesing du kan trykkje på: kuben svingar med kameraet, so
 * du ser kva veg du ser frå — og eit trykk opnar dei seks sidene som ord,
 * parvis, motstykke ved motstykke.
 *
 * Sidene er IKKJE knappar på kuben sjølv, og det er ikkje ei forgløyming:
 * ei side som vender på skrå er tretten pikslar høg på skjermen. Kuben er
 * ÉIN knapp på seks og femti, og orda under han er trykkflater ein tommel
 * finn. Ein synskube som krev ein muspeikar er ein synskube for ei anna
 * maskin enn denne.
 *
 * Retningane er verda si: y er opp, og z peikar mot deg i heimvinkelen.
 * Topp og botn står to hundredelar frå loddrett, so vendinga kring
 * loddlina er eit tal og ikkje ei deling på null. Rekkjefylgja er den orda
 * står i: topp og botn, framme og bak, venstre og høgre.
 */
const SIDER: readonly { id: string; ord: string; hint: string; css: string; dir: Vec3 }[] = [
  { id: "topp", ord: "topp", hint: "ovanfrå", css: "rotateX(90deg) translateZ(28px)", dir: [0, 1, 0.02] },
  { id: "botn", ord: "botn", hint: "nedanfrå", css: "rotateX(-90deg) translateZ(28px)", dir: [0, -1, 0.02] },
  { id: "framme", ord: "framme", hint: "framanfrå", css: "translateZ(28px)", dir: [0, 0, 1] },
  { id: "bak", ord: "bak", hint: "bakanfrå", css: "rotateY(180deg) translateZ(28px)", dir: [0, 0, -1] },
  { id: "venstre", ord: "venstre", hint: "frå venstre", css: "rotateY(-90deg) translateZ(28px)", dir: [-1, 0, 0] },
  { id: "hogre", ord: "høgre", hint: "frå høgre", css: "rotateY(90deg) translateZ(28px)", dir: [1, 0, 0] },
]

/**
 * Kuben si vending, skriven kvar teikning slik handtaka vert det.
 *
 * Kameramatrisa snudd tek verda inn i kameraet sitt rom; CSS har y nedover,
 * so ho vert spegla på begge sider (S·R·S med S = diag(1, −1, 1)) før ho
 * vert skriven. Ingen animasjon og ingen overgang: kuben ER synet, og eit
 * syn som kjem etterpå er ei løgn i to hundre millisekund.
 */
function Vendinga({ el }: { el: HTMLElement | null }) {
  const camera = useThree((s) => s.camera)
  const m = useRef(new THREE.Matrix4())
  useFrame(() => {
    if (!el) return
    camera.updateMatrixWorld()
    const e = m.current.copy(camera.matrixWorld).invert().elements
    const c = (rad: number, kol: number) => e[kol * 4 + rad] * (rad === 1 ? -1 : 1) * (kol === 1 ? -1 : 1)
    el.style.transform = `matrix3d(${c(0, 0)},${c(1, 0)},${c(2, 0)},0,${c(0, 1)},${c(1, 1)},${c(2, 1)},0,${c(0, 2)},${c(1, 2)},${c(2, 2)},0,0,0,0,1)`
  })
  return null
}

/** ramm inn att: objektet heilt, i heimvinkelen */
const IkonHeim = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
)

/** ikona i handtaka: fire piler for å flytte, ein boge for å vri */
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
/** storleiken på eit strek: ein skrå dobbelpil, hjørnet som vert drege */
const IkonStor = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 19 19 5" /><path d="M13 5h6v6" /><path d="M11 19H5v-6" />
  </svg>
)

/**
 * Hugsa mellom teikningane: alt som skjer i arket teiknar studioet på nytt,
 * og scena skal berre teiknast på nytt når noko som ER scena har endra seg.
 * Lyset bur her: det er ikkje ein parameter, det er korleis du ser på det.
 */
export const Scene = memo(function Scene({ kropp, lag, kontur, view, modus, material, rute, liste, plan, vald, spok, snitt, blink, skisse, storleik, valdStrek, onVald, onValdStrek, onPlan, onStrek, onSynStrek, onSkala, onVend, onGest, onSkisse }: {
  kropp: BuildRes | null
  lag: BuildRes | null
  kontur: BuildRes | null
  view: View
  modus: Modus
  material: string
  rute: Rute
  liste: readonly Kutt[]
  plan: readonly Plan[]
  vald: number | null
  spok: readonly Plan[] | null
  /** snittet motoren las av skissa eller det valde planet; kva som er aktivt avgjer studioet */
  snitt: SkisseSyn | null
  /** planet som nett vart skore, til kvitteringa */
  blink: number | null
  skisse: MutableRefObject<Skisse | null>
  /** streka er brøkar av storleiken; det valde streket er ein plass i det valde planet si liste */
  storleik: number
  valdStrek: number | null
  onVald: (id: number | null) => void
  onValdStrek: (i: number | null) => void
  onPlan: (id: number, o: Vec3, n: Vec3) => void
  /** eit strek sleppt — og eit strek medan det vert drege, til snittet */
  onStrek: (id: number, i: number, s: Strek) => void
  onSynStrek: (id: number, i: number, s: Strek) => void
  onSkala: (faktor: number) => void
  onVend: (grader: number) => void
  onGest: (kva: GestKva) => void
  onSkisse: (s: Skisse) => void
}) {
  const flat = view === "kontur"
  const f = useMemo(() => ramma(kropp ?? lag), [kropp, lag])
  /** det valde planet og ramma hans i millimeter — der streka står */
  const valt = useMemo(() => (vald === null ? null : plan.find((q) => q.id === vald) ?? null), [vald, plan])
  const rValt = useMemo(() => (valt && f ? planRamme(valt, f.min, f.max) : null), [valt, f])
  const [live, setLive] = useState<Live | null>(null)
  const fk = useMemo(() => ramma(kontur), [kontur])
  const fri = useMemo(() => fritt(rute), [rute])
  const [sikt, setSikt] = useState<Sikt>({ n: 0, dir: null })
  const [kube, setKube] = useState<HTMLSpanElement | null>(null)
  /** sidene som ord, opne eller ikkje: eit trykk på kuben, eit trykk utanfor att */
  const [sider, setSider] = useState(false)
  const heim = useCallback(() => setSikt((s) => ({ n: s.n + 1, dir: null })), [])
  useEffect(() => {
    if (!sider) return
    const ute = (e: PointerEvent) => { if (!(e.target as HTMLElement | null)?.closest?.(".synskube")) setSider(false) }
    const tast = (e: KeyboardEvent) => { if (e.key === "Escape") setSider(false) }
    window.addEventListener("pointerdown", ute)
    window.addEventListener("keydown", tast)
    return () => {
      window.removeEventListener("pointerdown", ute)
      window.removeEventListener("keydown", tast)
    }
  }, [sider])
  const settSide = useCallback((dir: Vec3) => setSikt((s) => ({ n: s.n + 1, dir })), [])
  const [boks, setBoks] = useState<HTMLDivElement | null>(null)
  const [sein, setSein] = useState(false)
  // Éi styrbar hovudlyskjelde på ein fast kuppel, pluss fire svake fyll:
  // eit uttak skal kaste éin hard skugge, slik det gjer i eit verkstadlys.
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
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.NeutralToneMapping }}
        camera={{ position: [2.4, 2.1, 6.4], fov: 30 }}
        className="touch-none"
        // eit trykk utanfor delane peikar på ingenting
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
          {flat
            ? fk && kontur && <Konturen f={fk} d={kontur} ink={tema.ink} />
            : f && <Kroppen f={f} kropp={kropp} lag={lag} view={view} material={material} liste={liste} vald={vald} plan={plan} spok={spok} blink={blink} sein={sein} onVald={onVald} />}
          {!flat && f && snitt && snitt.ringar.length > 0 && <Snittet f={f} snitt={snitt} farge={vald === null ? SKISSE : VALT} />}
          {!flat && f && valt && rValt && valt.strek.length > 0 && <Streka f={f} r={rValt} strek={valt.strek} vald={valdStrek} live={live && live.id === valt.id ? live.s : null} S={storleik} farge={VALT} />}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[60, 60]} />
            <shadowMaterial transparent opacity={0.24} />
          </mesh>
        </group>
        <FitCamera fit={(flat ? fk : f)?.fit ?? null} rute={rute} flat={flat} sikt={sikt} />
        <Vendinga el={kube} />
        <Demping onSein={setSein} />
        <Handa f={f} fri={fri} view={view} modus={modus} vald={vald} plan={plan} snitt={snitt} skisse={skisse} boks={boks} storleik={storleik} valdStrek={valdStrek} live={live} rValt={rValt} setLive={setLive} onValdStrek={onValdStrek} onStrek={onStrek} onSynStrek={onSynStrek} onPlan={onPlan} onSkala={onSkala} onVend={onVend} onLys={flyttLys} onGest={onGest} onSkisse={onSkisse} />
        {/* Konturen er ei teikning: éin finger dreg, klypet zoomar, ingenting
            snur. Kroppen snur heile vegen rundt — undersida er der ledda sit,
            og eit syn du ikkje kjem til er ein kontroll som manglar. */}
        <OrbitControls
          target={[0, 0.35, 0]}
          enablePan={flat}
          enableRotate={!flat}
          screenSpacePanning
          mouseButtons={flat ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN } : undefined}
          touches={flat ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
          enableZoom
          minDistance={flat ? MIN_NAER : MIN_DIST}
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
        SYNSKUBEN, øvst til venstre i det frie bandet. Kuben svingar med
        kameraet og seier kva veg du ser frå; ei side set synet. Under han
        står innramminga — den som låg i dobbelttrykket før, der ho kom av
        seg sjølv midt i ei sikting. Konturen er ei flat teikning og har
        inga vending å syne: der står berre innramminga.
      */}
      <div className="synskube" style={{ left: rute.venstre + 16, top: rute.topp + 36 }}>
        {!flat && (
          <button
            type="button"
            className="bur"
            data-kube=""
            aria-expanded={sider}
            aria-label="synet"
            title="synet: kva veg du ser frå. trykk for dei seks sidene"
            onClick={() => setSider((v) => !v)}
          >
            {/* Kuben inni knappen, og ikkje knappen sjølv: ei flate som står
                på kant er null pikslar brei, og ein knapp som forsvinn i eit
                sidesyn er ein knapp som ikkje finst. */}
            <span className="vend" ref={setKube}>
              {SIDER.map((q) => (
                <span key={q.id} data-side={q.id} style={{ transform: q.css }} aria-hidden="true">{q.ord}</span>
              ))}
            </span>
          </button>
        )}
        {sider && !flat && (
          <div className="sider" data-sider="">
            {SIDER.map((q) => (
              <button
                key={q.id}
                type="button"
                data-vel={q.id}
                title={`sjå objektet ${q.hint}`}
                onClick={() => { settSide(q.dir); setSider(false) }}
              >
                {q.ord}
              </button>
            ))}
          </div>
        )}
        <button type="button" data-heim="" aria-label="ramm inn" title="ramm inn objektet på nytt" onClick={heim}>
          {IkonHeim}
        </button>
      </div>
      {/*
        HANDTAKA ER DOM, IKKJE NETT. Eit handtak på 48 pikslar skal kunne
        takast med tommelen og finnast av ein som ikkje ser; ein trekant i
        WebGL kan ingen av delane. Dei står PÅ snittet — flytt i midten, vri
        på toppen — og scena skriv plassen deira kvar teikning. Lappen ber
        `data-skisse="snitt"` nett når det finst eit snitt å lese av. Med
        eit strek valt står tre handtak på streken i staden (`data-strek`).
      */}
      <div ref={setBoks} className="handtak" data-slag="skisse" style={{ visibility: "hidden" }}>
        <span data-arm="" aria-hidden="true" />
        <button type="button" data-handtak="flytt" aria-label="flytt snittet" title="dra: flytt snittet over kroppen">{IkonFlytt}</button>
        <button type="button" data-handtak="vri" aria-label="vri snittet" title="dra: vri snittet">{IkonVri}</button>
        <button type="button" data-handtak="strek-flytt" aria-label="flytt streken" title="dra: flytt streken i planet">{IkonFlytt}</button>
        <button type="button" data-handtak="strek-storleik" aria-label="storleiken på streken" title="dra: breidd og høgd. ein rund strek held same mål begge vegar">{IkonStor}</button>
        <button type="button" data-handtak="strek-vri" aria-label="vri streken" title="dra: vri streken. snappar til 0° og 90°">{IkonVri}</button>
        <span data-merke="" aria-hidden="true">
          <span data-ord="">skisse</span>
          <span data-tikk="" />
        </span>
      </div>
    </>
  )
})
