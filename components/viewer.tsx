"use client"

import { Canvas, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import type { View } from "@/lib/core"
import type { BuildRes } from "@/lib/worker"
import { ObjectMesh } from "./object-mesh"
import { GestureParams, type NudgeAxis } from "./gesture-params"
import { GROUND_Y, ramme, type Fit } from "@/lib/ramme"
import type { SkalaId } from "@/lib/skala"

export type LightDir = { az: number; el: number }
/** kor stort det bygde er, i sceneeiningar */
export type { Fit }

/**
 * Konturen er ei TEIKNING og ikkje eit objekt, og ei teikning skal sjåast
 * rett framanfrå. Dei to andre lesemåtane er ting i eit rom, og eit ting
 * i eit rom skal sjåast frå eit hjørne.
 */
const HEIM = {
  flat: [0, 0, 1] as [number, number, number],
  rom: [2.4, 1.7, 6.4] as [number, number, number],
}

function FitCamera({
  fit,
  dekke,
  flat,
  reframe,
}: {
  fit: Fit | null
  /** kor stor del av ruta kontrollarket dekkjer, 0 til 1 */
  dekke: number
  /** konturvisinga: flat teikning, ikkje objekt i eit rom */
  flat: boolean
  /** teljar frå dobbelttrykket: kvart hopp rammar inn på nytt, uansett */
  reframe: number
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update?: () => void }
    | null
  const invalidate = useThree((s) => s.invalidate)
  const lastR = useRef(0)
  const lastDekke = useRef(-1)
  const lastReframe = useRef(0)
  const lastFlat = useRef<boolean | null>(null)
  useEffect(() => {
    if (!fit || !controls) return
    // Dobbelttrykk: nullstill vaktene so innramminga alltid vert gjord om,
    // og legg kameraet heim i standardvinkelen — trykket TYDER «kom heim».
    // Eit byte mellom teikning og objekt tel som det same: dei to vil ha
    // kvar sin vinkel, og å halde på den førre er å syne ei teikning på
    // skrå.
    const homing = lastReframe.current !== reframe || lastFlat.current !== flat
    if (homing) {
      lastReframe.current = reframe
      lastFlat.current = flat
      lastR.current = 0
    }
    // Arket som veks er ei like god grunn til å ramme inn på nytt som eit
    // objekt som veks: begge to endrar kor mykje rute objektet har.
    const flytta = Math.abs(dekke - lastDekke.current) > 0.03
    if (!flytta && lastR.current && Math.abs(fit.r - lastR.current) / lastR.current < 0.1) return
    lastR.current = fit.r
    lastDekke.current = dekke
    const persp = camera as THREE.PerspectiveCamera
    // Sjølve rekninga står i lib/ramme.ts: ho er den einaste staden i
    // reiskapen der eit objekt kan verte usynleg utan at noko feilar, og
    // difor den einaste staden som må kunne prøvast utanfor ein nettlesar.
    const r = ramme(fit, {
      dekke,
      aspect: persp.aspect || 1,
      fovDeg: persp.fov ?? 30,
      flat,
    })
    const dist = r.dist
    controls.target.set(0, r.y, 0)
    const heim = flat ? HEIM.flat : HEIM.rom
    const dir = homing
      ? new THREE.Vector3(...heim)
      : camera.position.clone().sub(controls.target)
    if (dir.lengthSq() < 1e-6) dir.set(...heim)
    camera.position.copy(controls.target).add(dir.setLength(dist))
    controls.update?.()
    invalidate()
  }, [fit, dekke, reframe, controls, camera, invalidate])
  return null
}

/**
 * HUGSA MELLOM TEIKNINGANE.
 *
 * Alt som skjer i panelet — ein prikk som blinkar, ein ring som fyllest,
 * eit tal som tikkar — teiknar studioet på nytt. Utan denne innpakkinga
 * teiknar det scena på nytt òg, og det er ikkje ei billeg teikning: heile
 * scenegrafen vert forlikt gjennom R3F for kvar einaste tilstandsendring i
 * grensesnittet.
 *
 * Det kosta over eit halvt sekund av hovudtråden medan søket gjekk — nok
 * til at framdriftsmeldingane hopa seg opp i køen og kom i klumpar på fire.
 * Scena treng berre teiknast på nytt når noko som ER scena har endra seg,
 * og det er nett det denne lista seier.
 */
export const Viewer = memo(function Viewer({
  data,
  view,
  material,
  skala,
  hiDetail,
  dekke,
  light,
  onNudge,
  onLight,
}: {
  data: BuildRes | null
  view: View
  material: string
  skala: SkalaId
  hiDetail: boolean
  /** kor stor del av ruta kontrollarket dekkjer, 0 til 1 */
  dekke: number
  light: LightDir
  onNudge: (axis: NudgeAxis, deltaPx: number) => void
  onLight: (dxPx: number, dyPx: number) => void
}) {
  const bg = "#ffffff"
  const shadow = hiDetail ? 4096 : 2048
  // Éi styrbar hovudlyskjelde på ein fast kuppel, pluss fire svake fyll.
  // Ingen omgjevingskart og ingen mjuk kontaktflekk: eit uttak skal kaste
  // éin hard skugge, slik det gjer i eit verkstadlys.
  const lightPos = useMemo<[number, number, number]>(() => {
    const R = 8.6
    const h = R * Math.cos(light.el)
    return [h * Math.cos(light.az), R * Math.sin(light.el), h * Math.sin(light.az)]
  }, [light])
  const [fit, setFit] = useState<Fit | null>(null)
  // Stabil identitet heile vegen, elles går scena i sjølvsving: ein
  // onFit-lambda laga på nytt per teikning fyrer ObjectMesh sin effekt på
  // nytt, effekten lagar eit nytt fit-objekt, det nye objektet teiknar
  // Viewer på nytt — og løkkja et heile hovudtråden, for alltid.
  const handleFit = useCallback((f: Fit) => {
    setFit((prev) =>
      prev && prev.r === f.r && prev.w === f.w && prev.h === f.h && prev.cy === f.cy
        ? prev
        : f,
    )
  }, [])
  // dobbelttrykk på lerretet: ramm inn på nytt, heim i standardvinkelen
  const [reframe, setReframe] = useState(0)
  const handleDoubleTap = useCallback(() => setReframe((n) => n + 1), [])

  return (
    <Canvas
      shadows="soft"
      frameloop="demand"
      // aldri over 2: tre gonger skjermtettleik er ni gonger fragmentkost,
      // og på ein 4K-skjerm er skilnaden usynleg på armlengds avstand
      dpr={[1, 2]}
      // Neutral i staden for ACES: ACES dreg metta fargar mot raudbrunt og
      // mørknar heile materialet — Neutral er laga for å halde fargen sann
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.NeutralToneMapping,
      }}
      camera={{ position: [2.4, 2.1, 6.4], fov: 30 }}
      className="touch-none"
    >
      <color attach="background" args={[bg]} />
      {/* Tåka byrjar bakanfor der kameraet kan kome: eit ope kontrollark
          sender det attende til atten einingar, og eit objekt som bleiknar
          av di menyen er open er ikkje ei innstilling. */}
      <fog attach="fog" args={[bg, 22, 48]} />

      <directionalLight
        key={shadow}
        position={lightPos}
        intensity={2.3}
        castShadow
        shadow-mapSize={[shadow, shadow]}
        shadow-radius={5}
        shadow-bias={-0.0002}
        shadow-normalBias={0.05}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={0.5}
        shadow-camera-far={24}
      />
      {/* Ikkje noko omgjevnadslys og ikkje noko ambient: fyllet er KORT,
          som i eit ekte studio — kvite flater som kastar retningsbestemt
          lys attende. Golvspretten når opp under ribbene; utan han er kvar
          underside beksvart. */}
      <directionalLight position={[-6, 3, -2]} intensity={0.55} />
      <directionalLight position={[6, 2, 1]} intensity={0.4} />
      <directionalLight position={[2, 1.5, 7]} intensity={0.35} />
      <directionalLight position={[0.5, -3, 2]} intensity={0.3} />

      <Suspense fallback={null}>
        <group position={[0, GROUND_Y, 0]}>
          <ObjectMesh
            data={data}
            view={view}
            material={material}
            skala={skala}
            onFit={handleFit}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[60, 60]} />
            <shadowMaterial transparent opacity={0.24} />
          </mesh>
        </group>
      </Suspense>

      <FitCamera fit={fit} dekke={dekke} flat={view === "kontur"} reframe={reframe} />
      <GestureParams onNudge={onNudge} onLight={onLight} onDoubleTap={handleDoubleTap} />
      <OrbitControls
        target={[0, 0.35, 0]}
        enablePan={false}
        enableZoom
        minDistance={2.4}
        maxDistance={18}
        rotateSpeed={0.9}
        // demping: rotasjonen glid til ro i staden for å stogge daudt.
        // change-hendinga held demand-løkkja i live til dempinga
        // konvergerer, so det kostar berre bilete medan noko faktisk rører
        // seg.
        enableDamping
        dampingFactor={0.12}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI / 2 + 0.3}
        makeDefault
      />
    </Canvas>
  )
})
