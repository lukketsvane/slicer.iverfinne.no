"use client"

import { Canvas, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import type { View } from "@/lib/core"
import type { BuildRes } from "@/lib/worker"
import { ObjectMesh } from "./object-mesh"
import { GestureParams, type GestKva, type NudgeAxis } from "./gesture-params"
import { GROUND_Y, ramme, type Fit, type Rute } from "@/lib/ramme"

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
  rute,
  flat,
  reframe,
}: {
  fit: Fit | null
  /** ruta og kva som ligg over henne, i CSS-pikslar */
  rute: Rute
  /** konturvisinga: flat teikning, ikkje objekt i eit rom */
  flat: boolean
  /** teljar frå dobbelttrykket: kvart hopp rammar inn på nytt, uansett */
  reframe: number
}) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update?: () => void }
    | null
  const invalidate = useThree((s) => s.invalidate)
  const lastR = useRef(0)
  const lastRute = useRef("")
  const lastReframe = useRef(0)
  const lastFlat = useRef<boolean | null>(null)
  const nokkel = `${rute.W}|${rute.H}|${rute.venstre}|${rute.hogre}|${rute.topp}|${rute.botn}`
  useEffect(() => {
    if (!fit || !controls) return
    // Dobbelttrykk: nullstill vaktene so innramminga alltid vert gjord om,
    // og legg kameraet heim i standardvinkelen. Trykket TYDER «kom heim».
    // Eit byte mellom teikning og objekt tel som det same: dei to vil ha
    // kvar sin vinkel, og å halde på den førre er å syne ei teikning på
    // skrå.
    const homing = lastReframe.current !== reframe || lastFlat.current !== flat
    if (homing) {
      lastReframe.current = reframe
      lastFlat.current = flat
      lastR.current = 0
    }
    // Ei rute som har endra seg er ei like god grunn til å ramme inn på
    // nytt som eit objekt som har endra seg: begge to endrar kor mykje
    // plass objektet har.
    const flytta = lastRute.current !== nokkel
    if (!flytta && lastR.current && Math.abs(fit.r - lastR.current) / lastR.current < 0.1) return
    lastR.current = fit.r
    lastRute.current = nokkel
    const persp = camera as THREE.PerspectiveCamera
    // Sjølve rekninga står i lib/ramme.ts: ho er den einaste staden i
    // reiskapen der eit objekt kan verte usynleg utan at noko feilar, og
    // difor den einaste staden som må kunne prøvast utanfor ein nettlesar.
    const r = ramme(fit, { rute, fovDeg: persp.fov ?? 30, flat })
    /**
     * OBJEKTET STÅR MIDT I DET SOM ER FRITT.
     *
     * Ikkje midt i ruta: midt i det rektangelet ingen panel ligg over.
     * Frustumet vert difor rekna på det frie bandet, og so vert det
     * teikna eit stykke UTANFOR det på kvar kant, so scena fyller heile
     * lerretet og panela ligg over papir og ikkje over ein hard kant.
     *
     * Dette er ei forskyving av projeksjonen og ikkje av siktepunktet.
     * Flyttar ein siktepunktet i staden, flyttar ein dreiepunktet med, og
     * då snurrar objektet kring eit punkt som ikkje er i det.
     */
    persp.aspect = r.fri.w / r.fri.h
    persp.setViewOffset(r.fri.w, r.fri.h, -r.fri.L, -r.fri.T, size.width, size.height)
    controls.target.set(0, r.y, 0)
    const heim = flat ? HEIM.flat : HEIM.rom
    const dir = homing
      ? new THREE.Vector3(...heim)
      : camera.position.clone().sub(controls.target)
    if (dir.lengthSq() < 1e-6) dir.set(...heim)
    camera.position.copy(controls.target).add(dir.setLength(r.dist))
    controls.update?.()
    invalidate()
  }, [fit, nokkel, rute, reframe, controls, camera, invalidate, flat, size])
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
  hiDetail,
  rute,
  light,
  onNudge,
  onSkala,
  onVend,
  onLight,
  onGest,
  peikt,
  onPeik,
  onLangtrykk,
}: {
  data: BuildRes | null
  view: View
  material: string
  hiDetail: boolean
  /** ruta og kva som ligg over henne, i CSS-pikslar */
  rute: Rute
  light: LightDir
  onNudge: (axis: NudgeAxis, deltaPx: number) => void
  onSkala: (faktor: number) => void
  onVend: (grader: number) => void
  onLight: (dxPx: number, dyPx: number) => void
  onGest: (kva: GestKva) => void
  /** kva line i kuttlista som står fram i objektet, eller −1 */
  peikt: number
  onPeik: (i: number) => void
  onLangtrykk: (i: number, x: number, y: number) => void
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
            peikt={peikt}
            onPeik={onPeik}
            onLangtrykk={onLangtrykk}
            onFit={handleFit}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[60, 60]} />
            <shadowMaterial transparent opacity={0.24} />
          </mesh>
        </group>
      </Suspense>

      <FitCamera fit={fit} rute={rute} flat={view === "kontur"} reframe={reframe} />
      {/*
        KONTURVISINGA ER EI TEIKNING, OG EI TEIKNING SKAL EIN KUNNE FLYTTE
        PÅ.

        Dei to andre visingane er eit objekt i eit rom: ein finger snur
        synet, to fingrar stiller parametrane. Konturen er ikkje eit rom.
        Han er dei flate kuttprofilane sedde rett ovanfrå, og alt du vil
        gjere med ei teikning er å dra henne dit du vil sjå og zoome inn på
        ein detalj. Å SNU henne er å sjå eit ark på skrå; å dra to fingrar
        over henne for å skru ribbetalet er å endre teikninga medan du
        prøver å navigere i henne.

        So i konturen: ein finger dreg, klypet zoomar, og ingen ting snur.
        Parametergestane er av — dei står att i `flate` og `lag`, der det
        finst eit objekt å stille på.
      */}
      <GestureParams
        onNudge={onNudge}
        onSkala={onSkala}
        onVend={onVend}
        onLight={onLight}
        onDoubleTap={handleDoubleTap}
        onGest={onGest}
        flat={view === "kontur"}
      />
      <OrbitControls
        target={[0, 0.35, 0]}
        enablePan={view === "kontur"}
        enableRotate={view !== "kontur"}
        screenSpacePanning
        // Med rotasjonen av er venstre knapp og éin finger ledige, og då
        // må dei seiast: OrbitControls bind dei til ROTATE av seg sjølv,
        // og ein rotasjon som er slegen av er ein finger som ikkje gjer
        // noko i det heile.
        mouseButtons={
          view === "kontur"
            ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
            : undefined
        }
        touches={
          view === "kontur"
            ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
            : undefined
        }
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
