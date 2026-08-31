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
  /**
   * Kor langt fingrane må ha kome før gesten får namn, i pikslar, og kor
   * mykje den som leier må leie med.
   *
   * Åtte pikslar, og det er ei STREKNING fingrane skal ha gått — ikkje eit
   * rykk dei skal ha gjort i éi hending. Målt med skjelvande fingrar (±6
   * px dirr på avstanden medan dei vrir seg fyrti grader) held åtte like
   * godt som tolv, og eit lågare tak gjev meir av gesten attende: det som
   * går med i daudsona er gest du har gjort og ikkje fått.
   */
  const DAUD = 8
  const NOK = 1.25
  /**
   * KOR MYKJE VRI SOM SKAL TIL FØR EIN VRI ER EIN VRI. Radianar.
   *
   * Vridinga vert vegen mot dei andre som ein BOGE — vinkelen gonga med
   * radien fingrane hadde då dei landa. Det er rett eining, men det gjer
   * vridinga til den einaste kandidaten som veks med kor langt frå
   * kvarandre fingrane står. To fingrar 180 px frå kvarandre har radius
   * 90, og då er seks grader utilsikta rull ein boge på ti pikslar —
   * over daudsona, og større enn dei fyrste pikslane av eit drag.
   *
   * Målt: eit drag oppover på 40 px med 6° rull medan handa sette seg
   * vart lese som ein vri. Og gesten vert namngjeven ÉIN gong, so heile
   * draget etterpå gjorde ingen ting. Det var ikkje mogleg å skru
   * ribbetalet med to fingrar utan å halde handa heilt roleg.
   *
   * Femten grader skil: utilsikta rull ligg under ti, ein vri du MEINER
   * er tjue og oppover. Under terskelen er vridinga ikkje ein dårleg
   * kandidat — ho er ingen kandidat, so ho står heller ikkje i vegen for
   * dei tre andre.
   *
   * Terskelen kostar ingen ting i utslag: når vridinga fyrst vinn, tek ho
   * med seg det ho alt har samla (sjå `vridd` nedanfor). Han avgjer NÅR
   * objektet byrjar å snu, ikkje KOR MYKJE det snur.
   */
  const VRI_MIN = 0.26
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
    /**
     * DER DEN ANDRE FINGEREN LANDA, OG ALT SIDAN.
     *
     * Klassifiseringa las FIRE DELTA MELLOM TO HENDINGAR. Ei hending er
     * ein hundredels sekund, og på ein hundredels sekund flyttar ein
     * finger som vrir seg roleg éin eller to pikslar — aldri dei seks som
     * skulle til. Ein roleg, tydeleg vri kom difor aldri gjennom
     * daudsona; det som kom gjennom var eit rykk, og eit rykk er like
     * gjerne støy som meining. Difor «av og til».
     *
     * No vert alle fire målte SIDAN ANKERET. Støy sprikjer og går i null
     * over tjue hendingar; meining hopar seg opp. Og vinkelen vert lagd
     * saman heile vegen — ikkje berre etter at gesten har fått namn — so
     * han overlever at fingrane kryssar ±180°.
     */
    let anker = { cx: 0, cy: 0, d: 0, a: 0 }
    /** vinkelen lagd saman sidan ankeret, radianar */
    let sumVri = 0
    /** kven som leier, og kor mange hendingar han har leidd */
    let leiar: "klyp" | "vri" | "v" | "h" | null = null
    let iRad = 0
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
        anker = last
        sumVri = 0
        leiar = null
        iRad = 0
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
      const dv = vinkel(c.a, last.a)
      // Vinkelen vert lagd saman heile vegen, òg medan gesten er namnlaus:
      // det er han klassifiseringa les.
      sumVri += dv
      if (mode === "none") {
        /**
         * GESTEN FÅR NAMN ÉIN GONG, PÅ TOTALANE.
         *
         * Alle fire står i same eininga — pikslar. Vridinga vert rekna om
         * til bogen kvar finger har gått, og radien er den fingrane hadde
         * DÅ DEI LANDA: vert han lesen av avstanden akkurat no, endrar
         * målestokken seg under gesten, og eit klyp som opnar seg gjer
         * vridinga større av seg sjølv.
         */
        // Under VRI_MIN er vridinga ingen kandidat i det heile. Ho er
        // sett til null og ikkje berre diskvalifisert: står ho att som
        // det største talet, vinn ingen, og eit drag med litt rull i seg
        // vert liggjande og vente på ein gest som aldri får namn.
        const A = Math.abs(sumVri) > VRI_MIN ? Math.abs(sumVri) * (anker.d / 2) : 0
        const D = Math.abs(c.d - anker.d)
        const X = Math.abs(c.cx - anker.cx)
        const Y = Math.abs(c.cy - anker.cy)
        const M = Math.max(A, D, X, Y)
        if (M < DAUD) {
          /**
           * `last` ER FØRRE HENDING, OGSÅ MEDAN GESTEN ER NAMNLAUS.
           *
           * Denne greina gjekk ut att utan å flytte han. Neste hending
           * målte då vinkelen sin frå ei hending som låg fleire steg
           * attende, og `sumVri` la den same vridinga saman om att og om
           * att: ein sum av delsummar i staden for ein sum av steg.
           *
           * Målt: seks grader utilsikta rull las 17,9 grader — tre gonger
           * for mykje, og det veks med kor mange hendingar som går før
           * gesten får namn. Bogen voks med det, og vridinga vann over
           * eit drag som knapt hadde byrja. Det er difor det vart «altfor
           * lett å vri» og uråd å skru ribbetalet.
           *
           * `dx` og `dy` er alt lesne ovanfor, so dei tek ikkje skade av
           * at han vert flytt her.
           */
          last = c
          return
        }
        // Den som leier må leie KLÅRT. Gjer ingen det, held vi fram med å
        // samle: to kandidatar som står likt no, står sjeldan likt om ti
        // hendingar til. Men ikkje i det uendelege — er fingrane komne
        // tre daudsoner utan at nokon har vunne, gjer dei fleire ting på
        // ein gong, og då er den største det næraste eit svar som finst.
        /**
         * DEN SOM LEIER MÅ LEIE MED EI HEIL DAUDSONE, OG I FLEIRE BILETE.
         *
         * Eit forhold åleine held ikkje. Støyen er BUNDEN — fingrane dirrar
         * eit par pikslar same kor langt du dreg — medan draget VEKS, og
         * tidleg i draget er dei to like store. Vinkelen er verst: han vert
         * rekna om til bogelengd med halve fingeravstanden som radius, so
         * to grader vippe mellom fingrar hundre og ti pikslar frå kvarandre
         * er to pikslar før draget har flytta seg i det heile.
         *
         * Målt: eit drag på to hundre og tjue pikslar med dirrande fingrar
         * vart kalla ei VRIDING omtrent annakvar gong, og ribbetalet rørte
         * seg ikkje. Ikkje alltid — annakvar gong. Difor «av og til».
         *
         * So leiaren må slå nummer to både med eit forhold OG med ei heil
         * daudsone i pikslar. Eit dirr på to pikslar kan ikkje låne seg
         * åtte; eit drag har dei etter tre bilete. Og han må halde leiinga
         * i tre bilete på rad, so eit einsleg uheldig bilete ikkje avgjer
         * noko.
         *
         * Ti bilete på rad tek han uansett. Ein gest som gjer to ting
         * jamstort skal ikkje verte verande namnlaus for alltid.
         */
        const storst: "klyp" | "vri" | "v" | "h" =
          A === M ? "vri" : D === M ? "klyp" : Y === M ? "v" : "h"
        if (storst !== leiar) {
          leiar = storst
          iRad = 0
        }
        iRad++
        const nest = Math.max(...[A, D, X, Y].filter((v) => v !== M), 0)
        const klaart = M > NOK * nest && M - nest >= DAUD
        if (!(klaart && iRad >= 3) && iRad < 10) return
        mode = leiar
        // Nullpunktet er der gesten VART til, ikkje der fingrane landa:
        // daudsona skal ikkje telje med i totalen.
        start = { d: c.d, a: c.a }
        /**
         * VRIDINGA TEK MED SEG DET HO ALT HAR SAMLA.
         *
         * Daudsona skal ikkje telje for klypet — der er nullpunktet der
         * gesten vart til. For vridinga er det motsett: terskelen hennar
         * er femten grader, og å kaste dei ville gjere ein vri på fyrti
         * til ein på tjuefem. Du gjorde gesten; du skal få han.
         *
         * `- dv` av di dette hendinga sitt bidrag alt ligg i `sumVri`, og
         * linja som følgjer legg det til ein gong til.
         */
        vridd = mode === "vri" ? sumVri - dv : 0
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

    /**
     * iOS GJEV FRÅ SEG VASSRETTE SVEIP TIL SEG SJØLV.
     *
     * Eit vassrett drag med to fingrar er ein NAVIGASJONSGEST i Safari —
     * fram og attende i historikka — og systemet tek han før sida ser
     * han. Difor verka draget oppover og ikkje draget til sida: loddrett
     * er rulling, og rulling er alt stogga av `touch-action: none` og
     * `overscroll-behavior`. Vassrett er navigasjon, og han stoggar
     * korkje den eine eller den andre. Du såg det på skjermen: den grå
     * pila som kom fram i kanten var systemet som tok gesten.
     *
     * Det einaste som tek han attende er `preventDefault` på ei
     * touchmove som IKKJE er passiv. Vår `pointermove` er passiv — ho
     * er det for at rullinga skal vera jamn — og ei passiv lyttar kan
     * per definisjon ikkje avlyse noko.
     *
     * Berre med to fingrar eller fleire. Éin finger er orbiten, og han
     * skal framleis oppføre seg som ein vanleg finger på eit lerret.
     */
    const taTouchen = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault()
    }
    el.addEventListener("touchstart", taTouchen, { passive: false })
    el.addEventListener("touchmove", taTouchen, { passive: false })

    el.addEventListener("pointerdown", down)
    el.addEventListener("wheel", hjul, { passive: false, capture: true })
    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      el.removeEventListener("touchstart", taTouchen)
      el.removeEventListener("touchmove", taTouchen)
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
