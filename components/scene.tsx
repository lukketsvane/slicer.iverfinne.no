"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import * as THREE from "three"
import { MATERIALS, inRing, shoelace, type Kutt, type Material, type Pt, type Vec3, type View } from "@/lib/core"
import { akser, broek, dot, inn, ramme as planRamme, ut, type Plan, type Ramme } from "@/lib/plan"
import { GROUND_Y, MAX_DIST, MIN_DIST, fritt, ramme, type Fit, type Rute } from "@/lib/ramme"
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

/** planet slik skissa står no, i motoren sitt rom (mm, z opp) */
export type Skisse = { o: Vec3; n: Vec3 }
/** kva ein gest held på med, til lesing på skjermen */
export type GestKva = "storleik" | "vend" | "lys" | "snitt" | "zoom" | null
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
/** kvar planet står på kroppen: millimeter frå kanten av boksen langs normalen, med den aksen normalen helst peikar langs */
function lesPlass(r: Ramme, min: Vec3, max: Vec3): string {
  const d = dot(r.o, r.n)
  let lo = Infinity
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) lo = Math.min(lo, x * r.n[0] + y * r.n[1] + z * r.n[2])
  const a = [Math.abs(r.n[0]), Math.abs(r.n[1]), Math.abs(r.n[2])]
  return `${"xyz"[a.indexOf(Math.max(...a))]} ${Math.round(d - lo)} mm`
}

function FitCamera({ fit, rute, flat, reframe }: { fit: Fit | null; rute: Rute; flat: boolean; reframe: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update?: () => void } | null
  const invalidate = useThree((s) => s.invalidate)
  const sist = useRef({ r: 0, rute: "", reframe: 0, flat: null as boolean | null })
  const nokkel = `${rute.W}|${rute.H}|${rute.venstre}|${rute.hogre}|${rute.topp}|${rute.botn}`
  useEffect(() => {
    if (!fit || !controls) return
    const s = sist.current
    // dobbelttrykk, eller byte mellom teikning og objekt: heim, uansett
    const heim = s.reframe !== reframe || s.flat !== flat
    if (heim) {
      s.reframe = reframe
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
    const h = flat ? HEIM.flat : HEIM.rom
    const dir = heim ? new THREE.Vector3(...h) : camera.position.clone().sub(controls.target)
    if (dir.lengthSq() < 1e-6) dir.set(...h)
    camera.position.copy(controls.target).add(dir.setLength(r.dist))
    controls.update?.()
    invalidate()
  }, [fit, nokkel, rute, reframe, controls, camera, invalidate, flat, size])
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
 *   dobbelttrykk      ramm inn på nytt, heim i standardvinkelen
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

function Handa({ f, fri, view, modus, vald, plan, snitt, skisse, boks, onPlan, onDoubleTap, onSkala, onVend, onLys, onGest, onRaakar, onSkisse }: {
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
  onPlan: (id: number, o: Vec3, n: Vec3) => void
  onDoubleTap: () => void
  onSkala: (faktor: number) => void
  onVend: (grader: number) => void
  onLys: (dx: number, dy: number) => void
  onGest: (kva: GestKva) => void
  onRaakar: (b: boolean) => void
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
    let storst = snitt.ringar[0]
    let areal = -Infinity
    for (const r of snitt.ringar) {
      const a = shoelace(r)
      if (a > areal) {
        areal = a
        storst = r
      }
    }
    const alle = snitt.ringar.flat()
    const steg = Math.max(1, Math.ceil(alle.length / 240))
    const punkt: THREE.Vector3[] = []
    for (let i = 0; i < alle.length; i += steg) punkt.push(tilVerd(f, ut(snitt.r, alle[i])))
    return { midt: tilVerd(f, ut(snitt.r, midtAv(storst))), punkt }
  }, [f, snitt])
  /** lappen ved snittet: ledda det ville fått, og kvar det står. Raud utan eit einaste ledd mot plan som finst. */
  const lapp = useMemo(() => {
    if (!f || !snitt?.ringar.length) return null
    const ledd = new Set(snitt.kryss.map((k) => k.mot)).size
    return { ord: `${ledd} ledd · ${lesPlass(snitt.r, f.min, f.max)}`, varsel: ledd === 0 && plan.length > (valt ? 1 : 0) }
  }, [f, snitt, plan.length, valt])
  useEffect(() => invalidate(), [synleg, valt, boks, snittVerd, invalidate])
  /** handtaka og lappen i boksen, funne éin gong */
  const delar = useMemo(
    () =>
      boks && {
        flytt: boks.querySelector<HTMLElement>('[data-handtak="flytt"]'),
        vri: boks.querySelector<HTMLElement>('[data-handtak="vri"]'),
        arm: boks.querySelector<HTMLElement>("[data-arm]"),
        merke: boks.querySelector<HTMLElement>("[data-merke]"),
        ord: boks.querySelector<HTMLElement>("[data-ord]"),
      },
    [boks],
  )
  const senterPx = useRef({ x: 0, y: 0 })
  const raakar = useRef<boolean | null>(null)
  const dregHandtak = useRef(false)
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

  const naa = useRef({ f, vald, valt, view, modus, fri, snittVerd, lapp, onPlan, onDoubleTap, onSkala, onVend, onLys, onGest, onSkisse })
  naa.current = { f, vald, valt, view, modus, fri, snittVerd, lapp, onPlan, onDoubleTap, onSkala, onVend, onLys, onGest, onSkisse }

  useFrame(() => {
    const g = gruppe.current
    if (!g) return
    g.visible = synleg
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
      // råkar skissa kroppen? Skjer pulserer fyrste gongen ho gjer det.
      const b = broek(oM, f.min, f.max)
      const r = b.every((c) => c > -0.05 && c < 1.05)
      if (r !== raakar.current) {
        raakar.current = r
        onRaakar(r)
      }
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
    const { flytt, vri, arm, merke, ord } = delar
    const sv = naa.current.snittVerd
    if (!sv) {
      // Ingen profil: kuttet råkar ikkje kroppen. Berre flyttehandtaket står
      // att, på skissa sitt eige punkt — det er vegen attende. Eit valt plan
      // utan profil har ingenting å ta i.
      boks.dataset.tom = ""
      if (!eige) return gøym()
      senterPx.current = eige
      boks.style.visibility = "visible"
      boks.dataset.slag = "skisse"
      if (flytt) flytt.style.transform = `translate(${eige.x}px, ${eige.y}px) translate(-50%, -50%)`
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
    if (flytt) flytt.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%)`
    if (vri) vri.style.transform = `translate(${c.x}px, ${vy}px) translate(-50%, -50%)`
    if (arm) {
      arm.style.width = `${c.y - vy}px`
      arm.style.transform = `translate(${c.x}px, ${c.y}px) rotate(-90deg)`
    }
    if (merke) {
      merke.style.transform = `translate(${c.x + 30}px, ${c.y - 10}px)`
      // lappen finst berre når det finst eit snitt å lese av
      merke.dataset.skisse = "snitt"
      const l = naa.current.lapp
      const tekst = `${synleg ? "skisse" : `plan ${valt!.id}`}${l ? ` · ${l.ord}` : ""}`
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
    type Gest = "none" | "klyp" | "vri" | "dra" | "sam" | "lys" | "hFlytt" | "hVri" | "musFlytt" | "musVri"
    let mode: Gest = "none"
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
    // dobbelttrykket: to korte, stillestandande trykk nær kvarandre i tid og rom
    let tapDown = { x: 0, y: 0, t: 0, id: -1 }
    let lastTap = { x: 0, y: 0, t: 0 }

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
      dregHandtak.current = false
      naa.current.onGest(null)
    }

    const ned = (e: PointerEvent) => {
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
      // dobbelttrykket, for mus og finger begge — FØR fingerbokhaldet, av di musa aldri står i pts
      if (e.pointerId === tapDown.id) {
        const now = performance.now()
        if (now - tapDown.t < 260 && Math.hypot(e.clientX - tapDown.x, e.clientY - tapDown.y) < 12) {
          if (now - lastTap.t < 340 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 48) {
            lastTap = { x: 0, y: 0, t: 0 }
            naa.current.onDoubleTap()
          } else lastTap = { x: e.clientX, y: e.clientY, t: now }
        }
        tapDown = { x: 0, y: 0, t: 0, id: -1 }
      }
      if (mode === "musFlytt" || mode === "musVri") return slepp()
      if ((mode === "hFlytt" || mode === "hVri") && tak && e.pointerId === tak.id) return slepp()
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

    /** handtaka: éin finger, same gesten som to. Delegert frå boksen, so referansane aldri er i vegen. */
    const nedHandtak = (e: PointerEvent) => {
      const h = (e.target as Element).closest<HTMLElement>("[data-handtak]")
      if (!h || (e.pointerType === "mouse" && e.button !== 0)) return
      e.preventDefault()
      e.stopPropagation()
      const t = taTak(e.clientX, e.clientY, e.pointerId)
      if (!t) return
      if (h.dataset.handtak === "vri") {
        t.a0 = Math.atan2(e.clientY - t.senter.y, e.clientX - t.senter.x)
        mode = "hVri"
      } else mode = "hFlytt"
      tak = t
      dregHandtak.current = true
      try {
        h.setPointerCapture(e.pointerId)
      } catch {
        // ein peikar som alt er sleppt
      }
      naa.current.onGest("snitt")
    }

    // iOS tek vassrette to-finger-sveip som navigasjon; berre ei ikkje-passiv touchmove tek dei attende
    const taTouchen = (e: TouchEvent) => { if (e.touches.length >= 2) e.preventDefault() }
    el.addEventListener("touchstart", taTouchen, { passive: false })
    el.addEventListener("touchmove", taTouchen, { passive: false })
    el.addEventListener("pointerdown", ned, { capture: true })
    el.addEventListener("wheel", hjul, { passive: false, capture: true })
    boks?.addEventListener("pointerdown", nedHandtak)
    const vindu: [string, (e: PointerEvent) => void][] = [["pointermove", rorsle], ["pointerup", opp], ["pointercancel", opp]]
    for (const [n, h] of vindu) window.addEventListener(n, h as EventListener, { passive: true })
    return () => {
      el.removeEventListener("touchstart", taTouchen)
      el.removeEventListener("touchmove", taTouchen)
      el.removeEventListener("pointerdown", ned, { capture: true })
      el.removeEventListener("wheel", hjul, { capture: true } as EventListenerOptions)
      boks?.removeEventListener("pointerdown", nedHandtak)
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
    }, seinRef.current ? 1500 : 420)
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
      {gKropp && (solid ? (
        <mesh geometry={gKropp} material={surf} castShadow receiveShadow />
      ) : (
        // skuggen av kroppen. Ikkje til å peike på: han ligg utanpå delane
        // og ville teke kvart einaste trykk.
        <mesh geometry={gKropp} raycast={() => null} renderOrder={1}>
          <meshStandardMaterial color={MATERIALS[mat].hex} transparent opacity={0.18} depthWrite={false} roughness={1} />
        </mesh>
      ))}
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

/** konturen: profilane flatt ved sida av kvarandre, ei teikning */
function Konturen({ f, d }: { f: Ramma; d: BuildRes }) {
  const thin = useMemo(() => mkGeom(d.lines), [d])
  const bold = useMemo(() => mkGeom(d.heavy), [d])
  useEffect(() => () => { thin.dispose(); bold.dispose() }, [thin, bold])
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={f.s} position={[-f.cx * f.s, 0, f.cy * f.s]}>
      <lineSegments geometry={thin}><lineBasicMaterial color="#9a9a9a" transparent opacity={0.55} /></lineSegments>
      <lineSegments geometry={bold}><lineBasicMaterial color="#000000" /></lineSegments>
    </group>
  )
}

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

/**
 * Hugsa mellom teikningane: alt som skjer i arket teiknar studioet på nytt,
 * og scena skal berre teiknast på nytt når noko som ER scena har endra seg.
 * Lyset bur her: det er ikkje ein parameter, det er korleis du ser på det.
 */
export const Scene = memo(function Scene({ kropp, lag, kontur, view, modus, material, rute, liste, plan, vald, spok, snitt, blink, skisse, onVald, onPlan, onSkala, onVend, onGest, onRaakar, onSkisse }: {
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
  onVald: (id: number | null) => void
  onPlan: (id: number, o: Vec3, n: Vec3) => void
  onSkala: (faktor: number) => void
  onVend: (grader: number) => void
  onGest: (kva: GestKva) => void
  onRaakar: (b: boolean) => void
  onSkisse: (s: Skisse) => void
}) {
  const flat = view === "kontur"
  const f = useMemo(() => ramma(kropp ?? lag), [kropp, lag])
  const fk = useMemo(() => ramma(kontur), [kontur])
  const fri = useMemo(() => fritt(rute), [rute])
  const [reframe, setReframe] = useState(0)
  const dobbel = useCallback(() => setReframe((n) => n + 1), [])
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
  const bg = "#ffffff"
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
            ? fk && kontur && <Konturen f={fk} d={kontur} />
            : f && <Kroppen f={f} kropp={kropp} lag={lag} view={view} material={material} liste={liste} vald={vald} plan={plan} spok={spok} blink={blink} sein={sein} onVald={onVald} />}
          {!flat && f && snitt && snitt.ringar.length > 0 && <Snittet f={f} snitt={snitt} farge={vald === null ? SKISSE : VALT} />}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[60, 60]} />
            <shadowMaterial transparent opacity={0.24} />
          </mesh>
        </group>
        <FitCamera fit={(flat ? fk : f)?.fit ?? null} rute={rute} flat={flat} reframe={reframe} />
        <Demping onSein={setSein} />
        <Handa f={f} fri={fri} view={view} modus={modus} vald={vald} plan={plan} snitt={snitt} skisse={skisse} boks={boks} onPlan={onPlan} onDoubleTap={dobbel} onSkala={onSkala} onVend={onVend} onLys={flyttLys} onGest={onGest} onRaakar={onRaakar} onSkisse={onSkisse} />
        {/* konturen er ei teikning: éin finger dreg, klypet zoomar, ingenting snur */}
        <OrbitControls
          target={[0, 0.35, 0]}
          enablePan={flat}
          enableRotate={!flat}
          screenSpacePanning
          mouseButtons={flat ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN } : undefined}
          touches={flat ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
          enableZoom
          minDistance={MIN_DIST}
          maxDistance={MAX_DIST}
          rotateSpeed={0.9}
          enableDamping={!sein}
          dampingFactor={0.12}
          minPolarAngle={0.12}
          maxPolarAngle={Math.PI / 2 + 0.3}
          makeDefault
        />
      </Canvas>
      {/*
        HANDTAKA ER DOM, IKKJE NETT. Eit handtak på 48 pikslar skal kunne
        takast med tommelen og finnast av ein som ikkje ser; ein trekant i
        WebGL kan ingen av delane. Dei står PÅ snittet — flytt i midten, vri
        på toppen — og scena skriv plassen deira kvar teikning. Lappen ber
        `data-skisse="snitt"` nett når det finst eit snitt å lese av.
      */}
      <div ref={setBoks} className="handtak" data-slag="skisse" style={{ visibility: "hidden" }}>
        <span data-arm="" aria-hidden="true" />
        <button type="button" data-handtak="flytt" aria-label="flytt snittet" title="dra: flytt snittet over kroppen">{IkonFlytt}</button>
        <button type="button" data-handtak="vri" aria-label="vri snittet" title="dra: vri snittet">{IkonVri}</button>
        <span data-merke="" aria-hidden="true">
          <span data-ord="">skisse</span>
          <span data-tikk="" />
        </span>
      </div>
    </>
  )
})
