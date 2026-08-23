"use client"

import { useEffect, useMemo, useRef } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { MATERIALS, type Material, type View } from "@/lib/core"
import type { BuildRes } from "@/lib/worker"

/**
 * Objektet i scena.
 *
 * Motoren reknar i millimeter med Z opp, som er koordinatsystemet til
 * verkstaden; scena har Y opp. Omrekninga skjer her og ingen annan stad,
 * slik at ingen tal i motoren nokon gong er i «sceneeiningar».
 *
 * Skalaen er ikkje fast. Reiskapen snittar alt frå ein knapp på fjørti
 * millimeter til ein benk på tolv hundre, og eit fast tal millimeter per
 * eining ville gjort den eine til eit støvkorn og den andre til ein vegg.
 * Objektet vert difor alltid skalert til det same rommet, og storleiken
 * står i tavla der han høyrer heime.
 */
const FRAME = 2.2

/**
 * Materialet som materiale, ikkje som tekstur.
 *
 * Åringane ligg i det planet flata faktisk har: normalen vel kva to aksar
 * teikninga går i. To sinuslag gjev årring og fiber; ei celle-hash gjev
 * endeved-spetter på kutta. Alt er rekna av geometrien sin eigen posisjon i
 * millimeter — ingen tekstur, inga sauming, og mønsteret fylgjer kvar
 * einaste parameterendring utan at nokon har teikna det.
 *
 * Kvart hjørne veit om det er plateFLATE (0) eller KUTT (1). Motoren har
 * merkt det der han bygde trekanten. Skiljet er heile grunnen til at ein
 * vaffel ser ut som finér og ikkje som plast: flata er høvla, kanten er rå.
 */
function makeWood(color: string, rough: number, uKorn: { value: number }) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: rough,
    metalness: 0,
    // eit tynt oljestrøk: nesten matt, men med liv i refleksane
    clearcoat: 0.14,
    clearcoatRoughness: 0.55,
    envMapIntensity: 1,
    side: THREE.DoubleSide,
  })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uKorn = uKorn
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aKant;\nvarying vec3 vObj;\nvarying vec3 vNrmO;\nvarying float vKant;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvObj = position;\nvNrmO = normal;\nvKant = aKant;",
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vObj;\nvarying vec3 vNrmO;\nvarying float vKant;\nuniform float uKorn;\nfloat gKorn;",
      )
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "{",
          "  vec2 q = abs(vNrmO.z) > 0.7 ? vObj.xy : (abs(vNrmO.y) > 0.7 ? vObj.xz : vObj.yz);",
          // Frekvensane må døy før dei aliaserer: kvar sinus vert dempa av
          // sin eigen skjermromsderiverte, so mønsteret løyser seg opp i ro
          // — ikkje i moaré — når det vert mindre enn ein piksel.
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
          // rå kant er eit hakk lysare og gulare enn den høvla flata
          "  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.05, 1.03, 0.97), vKant * uKorn);",
          "}",
        ].join("\n"),
      )
      .replace(
        "#include <roughnessmap_fragment>",
        [
          "#include <roughnessmap_fragment>",
          // Kuttet er RUARE enn flata — endeved et lys — og åringane
          // vekslar mellom blank sommarved og matt vintved. Det er denne
          // vekslinga, meir enn fargen, som gjer at auget les tre.
          "roughnessFactor = clamp(roughnessFactor + (vKant * 0.08 + gKorn * 0.025) * uKorn, 0.05, 1.0);",
        ].join("\n"),
      )
  }
  return m
}

export function ObjectMesh({
  data,
  view,
  material,
  onFit,
}: {
  data: BuildRes | null
  view: View
  material: string
  onFit: (f: { r: number; w: number; h: number; cy: number }) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const uKorn = useRef({ value: 1 })
  const geom = useRef<THREE.BufferGeometry | null>(null)
  const thin = useRef<THREE.BufferGeometry | null>(null)
  const bold = useRef<THREE.BufferGeometry | null>(null)

  const built = useMemo(() => {
    if (!data) return null
    const g = new THREE.BufferGeometry()
    if (data.positions.length) {
      g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3))
      g.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3))
      // Flate/kant per hjørne. Motoren merkjer sjølv der han veit; der han
      // teier — som på det importerte nettet, som korkje har flate eller
      // kant — vert alt lese som flate.
      const nv = data.positions.length / 3
      const kant = data.kant.length === nv ? data.kant : new Float32Array(nv)
      g.setAttribute("aKant", new THREE.BufferAttribute(kant, 1))
      // Kula kjem frå min/maks motoren alt har rekna — å skanne kvart
      // hjørne ein gong til her ville kosta ein full gjennomgang av nettet
      // per bygg, på hovudtråden, for eit tal vi alt har.
      const c = new THREE.Vector3(
        (data.min[0] + data.max[0]) / 2,
        (data.min[1] + data.max[1]) / 2,
        (data.min[2] + data.max[2]) / 2,
      )
      const r =
        Math.hypot(
          data.max[0] - data.min[0],
          data.max[1] - data.min[1],
          data.max[2] - data.min[2],
        ) / 2
      g.boundingSphere = new THREE.Sphere(c, r)
    }
    const mk = (a: Float32Array) => {
      const b = new THREE.BufferGeometry()
      if (a.length) b.setAttribute("position", new THREE.BufferAttribute(a, 3))
      return b
    }
    return { g, thin: mk(data.lines), bold: mk(data.heavy) }
  }, [data])

  useEffect(() => {
    const prev = { g: geom.current, t: thin.current, b: bold.current }
    geom.current = built?.g ?? null
    thin.current = built?.thin ?? null
    bold.current = built?.bold ?? null
    prev.g?.dispose()
    prev.t?.dispose()
    prev.b?.dispose()
    invalidate()
  }, [built, invalidate])

  // Auto-innramminga treng radius og senterhøgd i sceneeiningar. Storleiken
  // vert lesen av det som faktisk er bygd.
  const box = useMemo(() => {
    if (!data) return null
    const min = data.min
    const max = data.max
    const cx = (min[0] + max[0]) / 2
    const cy = (min[1] + max[1]) / 2
    const h = Math.max(1e-6, max[2] - Math.min(0, min[2]))
    const w = Math.max(max[0] - min[0], max[1] - min[1])
    const mm = FRAME / Math.max(w, h, 1e-6)
    return {
      cx,
      cy,
      mm,
      // Radien er rotasjonsfast og gjeld eit objekt som kan snuast; breidd
      // og høgd gjeld ei teikning, som ikkje kan det.
      r: (Math.hypot(w, h) / 2) * mm,
      w: w * mm,
      h: h * mm,
      mid: (h / 2) * mm,
    }
  }, [data])

  useEffect(() => {
    if (box) onFit({ r: box.r, w: box.w, h: box.h, cy: box.mid })
  }, [box, onFit])

  const mat = (material in MATERIALS ? material : "finer") as Material
  const rough = view === "lag" ? 0.92 : 0.78
  const surf = useMemo(
    () => makeWood(MATERIALS[mat].hex, rough, uKorn.current),
    [mat, rough],
  )
  useEffect(() => () => surf.dispose(), [surf])
  useEffect(() => {
    // Akryl har ikkje ved. Å teikne åringar på ei plexiplate er å lyge om
    // materialet, og materialet er halve grunnen til at ein ser på biletet.
    uKorn.current.value = mat === "akryl" ? 0 : mat === "papp" ? 0.5 : 1
    invalidate()
  }, [mat, invalidate])

  if (!built || !box) return null

  return (
    <group
      rotation={[-Math.PI / 2, 0, 0]}
      scale={box.mm}
      position={[-box.cx * box.mm, 0, box.cy * box.mm]}
    >
      {view === "kontur" ? (
        <>
          <lineSegments geometry={built.thin}>
            <lineBasicMaterial color="#9a9a9a" transparent opacity={0.55} />
          </lineSegments>
          <lineSegments geometry={built.bold}>
            <lineBasicMaterial color="#000000" />
          </lineSegments>
        </>
      ) : (
        <mesh geometry={built.g} castShadow receiveShadow material={surf} />
      )}
    </group>
  )
}
