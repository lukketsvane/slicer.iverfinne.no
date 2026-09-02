"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import * as THREE from "three"
import { MATERIALS, type Kutt, type Material, type Vec3, type View } from "@/lib/core"
import { broek, ramme as planRamme, ut, type Plan } from "@/lib/plan"
import { GROUND_Y, MAX_DIST, MIN_DIST, fritt, ramme, type Fit, type Rute } from "@/lib/ramme"
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
/** under dette er ei vriding ingen vriding, radianar; og under dette er eit
 *  klyp ingen klyp */
const VRI_MIN = 0.15
const KLYP_MIN = 0.04

/** planet slik skissa står no, i motoren sitt rom (mm, z opp) */
export type Skisse = { o: Vec3; n: Vec3 }

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

/**
 * Materialet som materiale: åringar i det planet flata har, endeved på
 * kutta. Kvart hjørne veit om det er plateflate (0) eller kutt (1) —
 * motoren merkte det der han bygde trekanten — og kva plan det høyrer til.
 * Det valde planet vert lyft, ikkje farga om: du skal kunne samanlikne
 * det med naboane.
 */
function makeWood(color: string, rough: number, uKorn: { value: number }, uVald: { value: number }) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.14, clearcoatRoughness: 0.55, side: THREE.DoubleSide })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uKorn = uKorn
    sh.uniforms.uVald = uVald
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aKant;\nattribute float aPlan;\nvarying vec3 vObj;\nvarying vec3 vNrmO;\nvarying float vKant;\nvarying float vPlan;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;\nvNrmO = normal;\nvKant = aKant;\nvPlan = aPlan;")
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;\nvarying vec3 vNrmO;\nvarying float vKant;\nvarying float vPlan;\nuniform float uKorn;\nuniform float uVald;\nfloat gKorn;")
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
function kvadratar(plana: readonly Plan[], f: Ramma) {
  const side = 1.6 * diag(f)
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
 * Skisseplanet er bunde til kameraet: eit skjermpunkt (x, y i NDC) og ein
 * vinkel φ. I rommet: d = cosφ·høgre + sinφ·opp, normalen n = fram × d,
 * og punktet o ligg på strålen gjennom skjermpunktet, i djupna til kroppen
 * sitt sentrum. Ingenting vert bygd av det. Det svingar med synet; eit
 * låst plan gjer det ikkje — det er heile skilnaden.
 *
 *   éin finger      snu synet
 *   to fingrar      dra flyttar lina på tvers, vri dreier henne, klyp
 *                   dollyar kameraet — alle tre samstundes, kvar med si
 *                   daudsone, som på eit kart
 *   med eit plan    dra skuvar planet langs normalen sin, vri vinklar det
 *   valt            om kring synsaksen, og skissa er gøymd
 *   dobbelttrykk    ramm inn på nytt
 *   ⇧ dra / ⌥ dra   det same for ei mus: flytt, vri
 */
function Handa({ f, fri, view, vald, plan, skisse, onPlan, onDoubleTap }: {
  f: Ramma | null
  fri: { w: number; h: number }
  view: View
  vald: number | null
  plan: readonly Plan[]
  skisse: MutableRefObject<Skisse | null>
  onPlan: (id: number, o: Vec3, n: Vec3) => void
  onDoubleTap: () => void
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as { enabled: boolean; target: THREE.Vector3; update?: () => void } | null
  const invalidate = useThree((s) => s.invalidate)
  const gruppe = useRef<THREE.Group>(null)
  /** skissa: skjermpunkt i NDC og vinkelen. Loddrett gjennom midten til å byrje med. */
  const pose = useRef({ x: 0, y: 0, phi: Math.PI / 2 })
  const side = f ? 1.6 * diag(f) * f.s : 1
  const line = useMemo(() => mkGeom([-0.5, 0, 0, 0.5, 0, 0]), [])
  const synleg = !!f && vald === null && view !== "kontur"
  useEffect(() => invalidate(), [synleg, invalidate])

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

  useFrame(() => {
    const g = gruppe.current
    if (!g) return
    g.visible = synleg
    if (!f || !synleg) return
    const { right, up, fwd } = aksar()
    const p = pose.current
    const d = right.clone().multiplyScalar(Math.cos(p.phi)).addScaledVector(up, Math.sin(p.phi))
    const n = new THREE.Vector3().crossVectors(fwd, d).normalize()
    const ray = new THREE.Vector3(p.x, p.y, 0.5).unproject(camera).sub(camera.position).normalize()
    const depth = tilVerd(f, f.midt).sub(camera.position).dot(fwd)
    const o = camera.position.clone().addScaledVector(ray, depth / Math.max(1e-6, ray.dot(fwd)))
    g.position.copy(o)
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, fwd, n))
    skisse.current = { o: fraaVerd(f, o), n: nFraaVerd(n) }
  })

  const naa = useRef({ f, vald, plan, view, onPlan, onDoubleTap, fri })
  naa.current = { f, vald, plan, view, onPlan, onDoubleTap, fri }

  useEffect(() => {
    const el = gl.domElement
    const pts = new Map<number, { x: number; y: number }>()
    type Tak = {
      cx: number; cy: number; d: number; a: number; sistA: number; vri: number
      pose: { x: number; y: number; phi: number }
      dist0: number
      /** planet som er valt, i verda, slik det stod då gesten byrja */
      pl: { id: number; o: THREE.Vector3; n: THREE.Vector3 } | null
      akt: { pan: boolean; vri: boolean; klyp: boolean }
      /** musa: éin peikar med ⇧ eller ⌥ */
      mus: "pan" | "vri" | null
    }
    let tak: Tak | null = null
    let snap: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
    let tapDown = { x: 0, y: 0, t: 0, id: -1 }
    let lastTap = { x: 0, y: 0, t: 0 }
    const vinkel = (ny: number, gml: number) => {
      let v = ny - gml
      while (v > Math.PI) v -= 2 * Math.PI
      while (v <= -Math.PI) v += 2 * Math.PI
      return v
    }
    const to = () => {
      const [a, b] = [...pts.values()]
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) }
    }
    const start = (cx: number, cy: number, d: number, a: number, mus: Tak["mus"]): Tak | null => {
      const { f, vald, plan } = naa.current
      if (!f) return null
      const p = vald === null ? null : plan.find((q) => q.id === vald)
      let pl: Tak["pl"] = null
      if (p) {
        const r = planRamme(p, f.min, f.max)
        pl = { id: p.id, o: tilVerd(f, r.o), n: nTilVerd(r.n) }
      }
      return {
        cx, cy, d, a, sistA: a, vri: 0, pose: { ...pose.current }, pl, mus,
        dist0: controls ? camera.position.distanceTo(controls.target) : 6,
        akt: { pan: false, vri: false, klyp: false },
      }
    }
    /** gesten so langt, brukt på skissa, planet eller kameraet */
    const bruk = (t: Tak, panX: number, panY: number, klyp: number) => {
      const { f, onPlan, fri } = naa.current
      if (!f) return
      const { right, up, fwd } = aksar()
      if (t.akt.klyp && controls) {
        const dist = Math.min(MAX_DIST, Math.max(MIN_DIST, t.dist0 / klyp))
        const dir = camera.position.clone().sub(controls.target).setLength(dist)
        camera.position.copy(controls.target).add(dir)
        controls.update?.()
      }
      if (t.pl) {
        const n = t.pl.n.clone()
        if (t.akt.vri) n.applyAxisAngle(fwd, t.vri)
        const o = t.pl.o.clone()
        if (t.akt.pan) {
          // normalen projisert på skjermen, i pikslar; draget prikka med han.
          // Eit plan sett rett framanfrå har inga retning å skuve i.
          const k = pxPer(Math.max(0.1, o.clone().sub(camera.position).dot(fwd)))
          const ns = new THREE.Vector2(n.dot(right) * k, -n.dot(up) * k)
          if (ns.length() > 0.05 * k) o.addScaledVector(n, (panX * ns.x + panY * ns.y) / ns.lengthSq())
        }
        onPlan(t.pl.id, broek(fraaVerd(f, o), f.min, f.max), nFraaVerd(n))
      } else {
        const p = pose.current
        p.phi = t.pose.phi - (t.akt.vri ? t.vri : 0)
        if (t.akt.pan) {
          // berre komponenten på tvers av lina; langs henne er ingenting
          const k = panX * Math.sin(t.pose.phi) + panY * Math.cos(t.pose.phi)
          p.x = t.pose.x + (2 * k * Math.sin(t.pose.phi)) / fri.w
          p.y = t.pose.y - (2 * k * Math.cos(t.pose.phi)) / fri.h
        }
      }
      invalidate()
    }
    const restore = () => {
      if (!snap || !controls) return
      camera.position.copy(snap.pos)
      controls.target.copy(snap.target)
      controls.update?.()
    }

    const ned = (e: PointerEvent) => {
      tapDown = pts.size === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : { x: 0, y: 0, t: 0, id: -1 }
      if (naa.current.view === "kontur") return
      if (e.pointerType !== "touch") {
        if (!(e.shiftKey || e.altKey) || e.button !== 0) return
        // musa: same gesten, éin peikar. Orbiten skal ikkje òg starte.
        e.stopImmediatePropagation()
        e.preventDefault()
        tak = start(e.clientX, e.clientY, 1, 0, e.altKey ? "vri" : "pan")
        if (tak) tak.akt[tak.mus === "vri" ? "vri" : "pan"] = true
        return
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1 && controls) snap = { pos: camera.position.clone(), target: controls.target.clone() }
      if (pts.size === 2) {
        // den fyrste fingeren rakk å snu synet litt før den andre landa;
        // det høyrer ikkje til gesten
        restore()
        const c = to()
        tak = start(c.cx, c.cy, c.d, c.a, null)
        if (controls) controls.enabled = false
      }
    }
    const rorsle = (e: PointerEvent) => {
      const t = tak
      if (!t) return
      if (t.mus) {
        const dx = e.clientX - t.cx
        const dy = e.clientY - t.cy
        t.vri = dx * 0.01
        bruk(t, dx, dy, 1)
        return
      }
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size !== 2) return
      const c = to()
      t.vri += vinkel(c.a, t.sistA)
      t.sistA = c.a
      const panX = c.cx - t.cx
      const panY = c.cy - t.cy
      const klyp = c.d / Math.max(1, t.d)
      if (!t.akt.pan && Math.hypot(panX, panY) > 6) t.akt.pan = true
      if (!t.akt.vri && Math.abs(t.vri) > VRI_MIN) t.akt.vri = true
      if (!t.akt.klyp && Math.abs(klyp - 1) > KLYP_MIN) t.akt.klyp = true
      bruk(t, panX, panY, klyp)
    }
    const opp = (e: PointerEvent) => {
      // dobbelttrykket: to korte, stillestandande trykk nær kvarandre
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
      if (tak?.mus) tak = null
      if (!pts.delete(e.pointerId)) return
      if (pts.size < 2) tak = null
      if (pts.size === 0) {
        snap = null
        if (controls) controls.enabled = true
      }
    }
    // iOS tek vassrette to-finger-sveip som navigasjon; berre ei ikkje-passiv
    // touchmove kan ta dei attende
    const taTouchen = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault()
    }
    el.addEventListener("touchstart", taTouchen, { passive: false })
    el.addEventListener("touchmove", taTouchen, { passive: false })
    el.addEventListener("pointerdown", ned, { capture: true })
    window.addEventListener("pointermove", rorsle, { passive: true })
    window.addEventListener("pointerup", opp)
    window.addEventListener("pointercancel", opp)
    return () => {
      el.removeEventListener("touchstart", taTouchen)
      el.removeEventListener("touchmove", taTouchen)
      el.removeEventListener("pointerdown", ned, { capture: true })
      window.removeEventListener("pointermove", rorsle)
      window.removeEventListener("pointerup", opp)
      window.removeEventListener("pointercancel", opp)
      if (controls) controls.enabled = true
    }
  }, [gl, controls, camera, invalidate])

  return (
    <group ref={gruppe} visible={false}>
      <mesh renderOrder={2}>
        <planeGeometry args={[side, side]} />
        <meshBasicMaterial color="#1f6feb" transparent opacity={0.08} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={line} scale={[side, 1, 1]} renderOrder={3}>
        <lineBasicMaterial color="#1f6feb" depthTest={false} />
      </lineSegments>
    </group>
  )
}

/** kroppen og delane, i kroppen si ramme */
function Kroppen({ f, kropp, lag, view, material, liste, vald, plan, spok, onVald }: {
  f: Ramma
  kropp: BuildRes | null
  lag: BuildRes | null
  view: View
  material: string
  liste: readonly Kutt[]
  vald: number | null
  plan: readonly Plan[]
  spok: readonly Plan[] | null
  onVald: (id: number | null) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const uKorn = useRef({ value: 1 })
  const uVald = useRef({ value: -1 })
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
  const gVald = useMemo(() => {
    const p = vald === null ? null : plan.find((q) => q.id === vald)
    return p ? kvadratar([p], f) : null
  }, [vald, plan, f])
  const gSpok = useMemo(() => (spok?.length ? kvadratar(spok, f) : null), [spok, f])
  useEffect(() => () => gKropp?.dispose(), [gKropp])
  useEffect(() => () => gLag?.dispose(), [gLag])
  useEffect(() => () => { gVald?.flate.dispose(); gVald?.kant.dispose() }, [gVald])
  useEffect(() => () => { gSpok?.flate.dispose(); gSpok?.kant.dispose() }, [gSpok])

  const mat = (material in MATERIALS ? material : "finer") as Material
  const surf = useMemo(() => makeWood(MATERIALS[mat].hex, 0.9, uKorn.current, uVald.current), [mat])
  useEffect(() => () => surf.dispose(), [surf])
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
    <group rotation={[-Math.PI / 2, 0, 0]} scale={f.s} position={[-f.cx * f.s, 0, f.cy * f.s]}>
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
        <lineSegments geometry={gVald.kant}>
          <lineBasicMaterial color="#e05a1a" depthTest={false} />
        </lineSegments>
      )}
      {gSpok && (
        <>
          <mesh geometry={gSpok.flate} raycast={() => null} renderOrder={2}>
            <meshBasicMaterial color="#141414" transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <lineSegments geometry={gSpok.kant}>
            <lineBasicMaterial color="#141414" transparent opacity={0.5} />
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

/**
 * Hugsa mellom teikningane: alt som skjer i arket teiknar studioet på nytt,
 * og scena skal berre teiknast på nytt når noko som ER scena har endra seg.
 */
export const Scene = memo(function Scene({ kropp, lag, kontur, view, material, rute, liste, plan, vald, spok, skisse, onVald, onPlan }: {
  kropp: BuildRes | null
  lag: BuildRes | null
  kontur: BuildRes | null
  view: View
  material: string
  rute: Rute
  liste: readonly Kutt[]
  plan: readonly Plan[]
  vald: number | null
  spok: readonly Plan[] | null
  skisse: MutableRefObject<Skisse | null>
  onVald: (id: number | null) => void
  onPlan: (id: number, o: Vec3, n: Vec3) => void
}) {
  const flat = view === "kontur"
  const f = useMemo(() => ramma(kropp ?? lag), [kropp, lag])
  const fk = useMemo(() => ramma(kontur), [kontur])
  const fri = useMemo(() => fritt(rute), [rute])
  const [reframe, setReframe] = useState(0)
  const dobbel = useCallback(() => setReframe((n) => n + 1), [])
  const bg = "#ffffff"
  return (
    <Canvas
      shadows="soft"
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
      {/* éin hard skugge som i eit verkstadlys, og kort fyll frå kvite flater */}
      <directionalLight position={[5.6, 6.9, 5.1]} intensity={2.3} castShadow shadow-mapSize={[2048, 2048]} shadow-radius={5} shadow-bias={-0.0002} shadow-normalBias={0.05} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} shadow-camera-near={0.5} shadow-camera-far={24} />
      <directionalLight position={[-6, 3, -2]} intensity={0.55} />
      <directionalLight position={[6, 2, 1]} intensity={0.4} />
      <directionalLight position={[2, 1.5, 7]} intensity={0.35} />
      <directionalLight position={[0.5, -3, 2]} intensity={0.3} />
      <group position={[0, GROUND_Y, 0]}>
        {flat
          ? fk && kontur && <Konturen f={fk} d={kontur} />
          : f && <Kroppen f={f} kropp={kropp} lag={lag} view={view} material={material} liste={liste} vald={vald} plan={plan} spok={spok} onVald={onVald} />}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <shadowMaterial transparent opacity={0.24} />
        </mesh>
      </group>
      <FitCamera fit={(flat ? fk : f)?.fit ?? null} rute={rute} flat={flat} reframe={reframe} />
      <Handa f={f} fri={fri} view={view} vald={vald} plan={plan} skisse={skisse} onPlan={onPlan} onDoubleTap={dobbel} />
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
        enableDamping
        dampingFactor={0.12}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI / 2 + 0.3}
        makeDefault
      />
    </Canvas>
  )
})
