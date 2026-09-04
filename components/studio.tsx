"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { ArkSyn, ExportKind, DetailKey, ParamBag, Rom, Vec3, View } from "@/lib/core"
import { KUBE } from "@/lib/sources"
import { hent, lagre } from "@/lib/lagring"
import { zip } from "@/lib/zip"
import { MOTOR } from "@/lib/motor"
import { BOG_TAK, PLAN_TAK, broek, dot, lesPlan, nyId, ramme as planRamme, rutenett, sameSnitt, spegla, speglingar, skrivPlan, virvel, type Plan, type Strek } from "@/lib/plan"
import { lesFest, skrivFest } from "@/lib/params"
import { BIT_MAX, BIT_MIN, eiKjelde, erFilform, lesScene, skrivScene, SCENE_TAK, type Bit } from "@/lib/scene"
import type { Rute } from "@/lib/ramme"
import type { SkisseSyn } from "@/lib/snitt"
import type { ArkRes, BuildRes, MaalRes, Req, Res, SkisseReq } from "@/lib/worker"
import { Scene, snittMidt, type GestKva, type Modus, type Skisse } from "./scene"
import { Arket, KOL, type Steg } from "./arket"
import { CHIP, chipStyle, HAIR, ORD, IcoBit, IcoBoy, IcoDupliser, IcoFerdig, IcoHol, IcoSkisse, IcoSkjer, IcoSlett } from "./deler"
import { Plater } from "./plater"
import { Skuff, type VerktyId } from "./verkty"
import { Toppline } from "./toppline"

/**
 * STUDIOET. Ein parameterpose, ein arbeidar, og det som skal til for at
 * posen overlever: angre, lenkja, økta i nettlesaren, prosjektfila. Alt
 * som rører geometri går til arbeidaren; her vert det berre teikna.
 */

/** ei fil på meir enn dette er ikkje ein modell, det er eit uhell */
const MAX_FIL = 220 * 1024 * 1024
const ANGRE_DJUPN = 50
/** kor høgt det lukka arket er med botnmargen; skuffa står over det på telefonen */
const LUKKA_ARK = 84
/** knappane over skjer i tommelspalta: 48 pikslar, runde, flate */
/** knappane over skjer: ikon, og ikkje anna. Tilstanden er blekk mot dempa. */
const TUMME_BTN = "hit ikon relative flex h-12 w-12 items-center justify-center"
/** eit steg i rutenettet: so langt fingrane må gå for éin kolonne eller éi rad */
const RUTE_STEG = 44
/** storleiken på ein bit, klemt til det lista tek imot */
const klemBit = (v: number) => Math.min(BIT_MAX, Math.max(BIT_MIN, v))
/** kor mykje bøy éin piksel drag er verd: hundre pikslar er ein halv bøy */
const BOY_STEG = 0.005
/** kor lenge grensesnittet står framme etter siste rørsle, i millisekund */
const SOV_MS = 2000
/** eit steg i virvelen: so langt fingrane går for éi ribbe til, og for eit hakk ut frå aksen */
const VIRVEL_STEG = 40
const VIRVEL_R_STEG = 0.02
/** kor nær aksen ribbene får koma. Null er det utarta: alle gjennom same
 *  lina, og tjue plan vart to delar og seks og tretti lause stykke då det
 *  vart målt. Ein halv er tangent til den innskrivne sirkelen. */
const VIRVEL_R = { min: 0.06, max: 0.5 }
/** kor mange ribber virvelen opnar med, og kor langt ute */
const VIRVEL_START: [number, number] = [12, 0.26]
/** rutenettet lista alt er, talt: plan langs x er kolonner, plan langs y er
 *  rader. Eit skrått plan er ikkje eit rutenett og tel ikkje — verktyet
 *  skriv lista om, og angre er vegen attende. */
/** vidda til kroppen i x og y, millimeter: det virvelen treng for å stå rundt */
const vidd = (k: { min: Vec3; max: Vec3 }): [number, number] => [k.max[0] - k.min[0], k.max[1] - k.min[1]]

function ruteTalde(l: readonly Plan[]): [number, number] {
  let nx = 0
  let ny = 0
  for (const q of l) {
    if (Math.abs(q.n[0]) > 0.999) nx++
    else if (Math.abs(q.n[1]) > 0.999) ny++
  }
  return [nx, ny]
}
/** det som er KROPPEN: berre desse ber om eit nytt «flate»-bygg */
const kroppKey = (p: ParamBag) => [p.kjelde, p.scene, p.storleik, p.rotX, p.rotY, p.rotZ, p.glatt, p.trekant].join("|")
/** filnamn utan mellomrom og aksentar; desimalkomma er bråk */
const stamme = (label: string) =>
  ("slicer-" + label).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase().slice(0, 48)

/**
 * Ei fil ut, same kvar ho vart laga. På ein telefon er nedlastingsmappa
 * ein dårleg stad for ei kuttfil: delingsarket kan AirDroppe henne til
 * maskina ved laseren. Ein skjerm med peikar lastar ned som før.
 */
async function lastNed(blob: Blob, namn: string) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (matchMedia("(pointer: coarse)").matches && typeof nav.share === "function" && typeof nav.canShare === "function") {
    const fil = new File([blob], namn, { type: blob.type })
    if (nav.canShare({ files: [fil] })) {
      try {
        await nav.share({ files: [fil] })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = namn
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** SVG → PNG gjennom lerretet, på kvitt: ein PNG utan botn er svart i dei fleste meldingsappar */
async function tilPng(svg: string, w: number, h: number): Promise<Uint8Array> {
  const im = new Image()
  im.width = w
  im.height = h
  im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
  await im.decode()
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const x = c.getContext("2d")
  if (!x) throw new Error("ikkje noko lerret")
  x.fillStyle = "#ffffff"
  x.fillRect(0, 0, w, h)
  x.drawImage(im, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"))
  if (!blob) throw new Error("tom png")
  return new Uint8Array(await blob.arrayBuffer())
}

function useMedia(q: string) {
  const [v, setV] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const sync = () => setV(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [q])
  return v
}
function useVindu() {
  const [v, setV] = useState({ w: 1280, h: 800 })
  useEffect(() => {
    const sync = () => setV({ w: window.innerWidth, h: window.innerHeight })
    sync()
    window.addEventListener("resize", sync)
    return () => window.removeEventListener("resize", sync)
  }, [])
  return v
}

type Port = { inFlight: boolean; pending: Req | null; shown: number }

export function Studio() {
  const [params, setParams] = useState<ParamBag>(() => ({ ...MOTOR.defaults }))
  const [view, setView] = useState<View>("lag")
  /**
   * SKALET: kroppen slik han var, teikna gjennomsiktig kring delane i «lag».
   * Han er der for å seie kor mykje av forma ribbene fangar — og han er i
   * vegen når du vil sjå ribbene sjølve. Difor ein brytar, og ikkje ein
   * parameter: han endrar ingen geometri og skal ikkje stå i angrelista.
   * Lenkja ber han like fullt, ved sida av lesemåten, so eit syn du deler
   * er det synet du sende.
   */
  const [skal, setSkal] = useState(true)
  /**
   * DEI INNEBYGDE FORMENE ER FILER, og filer må hentast.
   *
   * Kuben er laga i koden og står på skjermen med det same; dei fem andre
   * ligg under `public/form` og kjem når noko tek i dei — anten du vel ei
   * frå menyen, eller ei lenkje du opna ber henne. `formLasta` er dei vi
   * har bede om, `formSvar` er dei som er i lufta, og `formTal` er det
   * bygget lyttar på: eit nett som kjem inn ETTER at scena peika på det,
   * må byggjast på nytt, elles står biten som ein kube som ingen bad om.
   */
  const formLasta = useRef(new Set<string>())
  const formSvar = useRef(new Set<number>())
  const [formTal, setFormTal] = useState(0)
  /** dei to bygga: kroppen (flate) og delane (lag). Konturen byggjer ingenting — han er plateflata. */
  const [kropp, setKropp] = useState<BuildRes | null>(null)
  const [lag, setLag] = useState<BuildRes | null>(null)
  const [tal, setTal] = useState<MaalRes | null>(null)
  const [ark, setArk] = useState<ArkSyn | null>(null)
  /** det valde planet, og den valde delen på plata */
  const [vald, setVald] = useState<number | null>(null)
  /** det valde streket i det valde planet, som plass i lista hans */
  const [valdStrek, setValdStrek] = useState<number | null>(null)
  /** biten som er vald i verktyet for kroppen, som plass i scenelista */
  const [valdBit, setValdBit] = useState<number | null>(null)
  /** ein verdi vert dregen i arket: angre ventar til fingeren slepper */
  const [skrubbar, setSkrubbar] = useState(false)
  const [peikt, setPeikt] = useState<string | null>(null)
  const [steg, setSteg] = useState<Steg>("line")
  const [verkty, setVerkty] = useState<VerktyId | null>(null)
  /** kolonner og rader, medan fingrane set dei: lesinga over kroppen */
  const [ruteTal, setRuteTal] = useState<[number, number] | null>(null)
  /** ribber og avstand, medan fingrane set dei: lesinga over kroppen */
  const [virvelTal, setVirvelTal] = useState<[number, number] | null>(null)
  const [busy, setBusy] = useState(true)
  const [feil, setFeil] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [hentar, setHentar] = useState(false)
  const [drag, setDrag] = useState(false)
  const [arkH, setArkH] = useState(0)
  const [toppH, setToppH] = useState(44)
  /** gestmodusen: «form» er dei gamle gestane på objektet, «skisse» er gestane på planet */
  const [modus, setModus] = useState<Modus>("form")
  /**
   * SYMMETRIEN PÅ SNITTET: tre brytarar i eitt tal (1 er x, 2 er y, 4 er z).
   *
   * Han høyrer til SKJER og ikkje til noko plan: eitt trykk låser snittet du
   * siktar og spegelbileta hans om midtplana i kroppen. Det som kjem ut er
   * heilt vanlege plan med kvart sitt namn — dei kan flyttast, vinklast,
   * teiknast i og slettast kvar for seg etterpå. Ein symmetri som var ein
   * eigenskap ved planet måtte ha delt namn mellom to delar, og namnet er
   * det som står gravert på plata.
   *
   * Difor er han heller ikkje ein parameter: han seier kva NESTE kutt vert,
   * ikkje kva kroppen er, og ei lenkje ber kroppen.
   */
  const [speil, setSpeil] = useState(0)
  /** kva ein finger held på med akkurat no, til lesing over objektet */
  const [gest, setGest] = useState<GestKva>(null)
  /** snittet skissa (eller det valde planet) ville gje, slik motoren las det */
  const [snitt, setSnitt] = useState<SkisseSyn | null>(null)
  /** planet som nett vart skore: delen hans blinkar éin gong når han kjem */
  const [blink, setBlink] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [namn, setNamn] = useState<Record<string, string>>({})
  const benk = useMedia("(pointer: fine) and (min-width: 1180px)")
  const vindu = useVindu()

  const worker = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const sisteBygg = useRef(0)
  const naa = useRef(params)
  naa.current = params
  /** importar som høyrer til oppsettet som alt står (den hugsa økta) */
  const attende = useRef(new Set<number>())
  const arkVent = useRef(new Map<number, (r: ArkRes) => void>())
  /** skisseplanet slik det står no, skrive av scena kvar teikning */
  const skisse = useRef<Skisse | null>(null)
  const kroppRef = useRef<BuildRes | null>(null)
  kroppRef.current = kropp
  const kjelde = String(params.kjelde ?? KUBE)
  const kjeldeNamn = kjelde === KUBE ? "kube" : (namn[kjelde] ?? "nett")
  /** bitane kroppen er sett saman av: kjelda åleine når lista er tom */
  const bitar = useMemo(() => lesScene(String(params.scene || "") || eiKjelde(kjelde)), [params.scene, kjelde])
  const plan = useMemo(() => lesPlan(params.plan), [params.plan])
  const liste = useMemo(() => tal?.liste ?? [], [tal])

  /**
   * SISTE-VINN-PORTEN, éin per lesemåte. Ein skyvar lagar punkt fortare
   * enn motoren byggjer dei; med porten vert eit uteståande punkt berre
   * BYTT UT til bygget i lufta er ferdig, og draget går i motoren si takt.
   */
  const portar = useRef<Record<Rom, Port>>({
    flate: { inFlight: false, pending: null, shown: 0 },
    lag: { inFlight: false, pending: null, shown: 0 },
  })
  const pump = useCallback((v: Rom) => {
    const p = portar.current[v]
    if (p.inFlight || !p.pending) return
    p.inFlight = true
    worker.current?.postMessage(p.pending)
    p.pending = null
  }, [])
  const bygg = useCallback((v: Rom, detail: DetailKey) => {
    const id = ++reqId.current
    sisteBygg.current = id
    portar.current[v].pending = { kind: "build", id, params: naa.current, detail, view: v }
    pump(v)
  }, [pump])
  const send = useCallback((msg: Req, transfer?: Transferable[]) => {
    worker.current?.postMessage(msg, transfer ?? [])
  }, [])
  /**
   * SKISSEPORTEN. Skissa er ein straum av punkt og motoren svarar på eitt
   * om gongen: éin i lufta, det siste ventar, og eit svar som er eldre enn
   * det som alt er synt vert kasta. `plan` er det som vert snitta no —
   * skissa med namn 0, eller det valde planet — og eit byte tømer snittet,
   * so det gamle ikkje står i den nye fargen. `p` er posen motoren snittar
   * frå: den som står, eller — medan eit strek vert drege — ein kopi med
   * streken der fingeren har han, so snittet syner det du får utan at
   * parametrane rører seg før du slepper.
   */
  const skissePort = useRef<{ inFlight: boolean; pending: SkisseReq | null; shown: number; plan: Plan | null }>({ inFlight: false, pending: null, shown: 0, plan: null })
  const pumpSkisse = useCallback(() => {
    const p = skissePort.current
    if (p.inFlight || !p.pending) return
    p.inFlight = true
    worker.current?.postMessage(p.pending)
    p.pending = null
  }, [])
  const spørSkisse = useCallback((pl: Plan | null, p: ParamBag = naa.current) => {
    const port = skissePort.current
    if ((pl?.id ?? null) !== (port.plan?.id ?? null)) setSnitt(null)
    port.plan = pl
    if (!pl) {
      port.pending = null
      return
    }
    port.pending = { kind: "skisse", id: ++reqId.current, params: p, plan: pl }
    pumpSkisse()
  }, [pumpSkisse])
  /** skissa flytta seg i scena: punktet som brøk av boksen, og normalen som han er */
  const skisseEndra = useCallback((s: Skisse) => {
    const k = kroppRef.current
    if (k) spørSkisse({ id: 0, o: broek(s.o, k.min, k.max), n: s.n, bog: 0, strek: [] })
  }, [spørSkisse])

  // Hashen er ikkje til å stole på: kvart felt vert klemt av motoren sin eigen clamp.
  useEffect(() => {
    setMounted(true)
    try {
      const h = window.location.hash.slice(1)
      if (!h.startsWith("p=")) {
        // inga lenkje: tak det du hadde. Nettet kjem inn den vanlege vegen,
        // men det høyrer til oppsettet, so importen skal ikkje tøme plana.
        void hent().then((v) => {
          if (!v) return
          setParams((q) => MOTOR.clamp({ ...v.params, kjelde: KUBE }, q))
          if (!v.nett) return
          setHentar(true)
          const id = ++reqId.current
          attende.current.add(id)
          send({ kind: "import", id, name: v.filnamn ?? "nett.stl", buf: v.nett }, [v.nett])
        })
        return
      }
      const obj = JSON.parse(decodeURIComponent(h.slice(2))) as Record<string, unknown>
      // EI LENKJE BER IKKJE EIT NETT — men ho ber godt eit NAMN som tyder
      // det same overalt. Ei importert fil har eit namn av bytane sine og
      // er borte for den som opnar lenkja; ei innebygd form ligg på tenaren
      // og kjem når nokon spør. Difor: forma står, alt anna fell til kuben.
      const kj = typeof obj.kjelde === "string" && erFilform(obj.kjelde) ? obj.kjelde : KUBE
      setParams((p) => MOTOR.clamp({ ...obj, kjelde: kj }, p))
      if (obj.view === "lag" || obj.view === "kontur" || obj.view === "flate") setView(obj.view)
      if (typeof obj.skal === "boolean") setSkal(obj.skal)
    } catch {
      // øydelagd hash — lat standardobjektet stå
    }
  }, [send])

  useEffect(() => {
    const w = new Worker(new URL("../lib/worker.ts", import.meta.url), { type: "module" })
    worker.current = w
    // ein ny arbeidar er ein tom port — React monterer to gonger i utvikling
    for (const p of Object.values(portar.current)) {
      p.inFlight = false
      p.pending = null
    }
    skissePort.current.inFlight = false
    skissePort.current.pending = null
    // og ein arbeidar som døyr skal seie det: same stille døden som Turbopack gjev
    w.onerror = () => {
      setBusy(false)
      setHentar(false)
      setFeil("motoren stogga")
    }
    w.onmessage = (e: MessageEvent<Res>) => {
      const r = e.data
      if (r.kind === "build") {
        const p = portar.current[r.view]
        p.inFlight = false
        pump(r.view)
        if (r.id < p.shown) return
        p.shown = r.id
        ;(r.view === "flate" ? setKropp : setLag)(r)
        return
      }
      if (r.kind === "skisse") {
        const p = skissePort.current
        p.inFlight = false
        pumpSkisse()
        if (r.id < p.shown || !p.plan) return
        p.shown = r.id
        const { kind, id, ...syn } = r
        void kind
        void id
        // det same snittet om att — etter eit skjer ligg det nye planet i skissa, etter eit slepp står streken der han alt var synt — er inga endring, og skal ikkje teiknast om att. Nøkkelen seier det.
        setSnitt((prev) => (prev && prev.nokkel === syn.nokkel ? prev : syn))
        return
      }
      if (r.kind === "maal") {
        setTal(r)
        // fyrst når rekninga for det SISTE bygget er inne, er motoren ferdig
        if (r.id >= sisteBygg.current) setBusy(false)
        return
      }
      if (r.kind === "prosjekt") {
        setRammInn((n) => n + 1)
        // nettet OG innstillingane i eitt steg
        setHentar(false)
        setFeil(null)
        if (r.src) setNamn((m) => ({ ...m, [r.src!.id]: r.src!.label }))
        const kj = r.src ? r.src.id : KUBE
        setParams((p) => MOTOR.clamp({ ...r.params, kjelde: kj }, { ...p, kjelde: kj }))
        setVald(null)
        setMelding(r.src ? "prosjekt ope" : "oppsett sett")
        return
      }
      if (r.kind === "ark") {
        const vent = arkVent.current.get(r.id)
        if (vent) {
          arkVent.current.delete(r.id)
          vent(r)
          return
        }
        const { kind, id, ...plata } = r
        void kind
        void id
        setArk(plata)
        return
      }
      if (r.kind === "kjelde") {
        setNamn((m) => ({ ...m, [r.src.id]: r.src.label }))
        setRammInn((n) => n + 1)
        // EI FORM ER IKKJE EIN IMPORT. Ho vart beden om av di noko på
        // skjermen alt PEIKAR på henne — ein bit i scena, eller ei lenkje
        // som ber henne — so ho skal ikkje byte kjelde og ikkje tømme plana.
        // Ho skal berre byggjast, no som nettet er framme.
        if (formSvar.current.delete(r.id)) {
          setFormTal((n) => n + 1)
          setHentar(false)
          return
        }
        // EIT NYTT NETT TEK PLANA OG FESTA MED SEG UT: båe er svar om den
        // kroppen du hadde. Den hugsa økta går fri — ho er skriven for dette nettet.
        const eiga = attende.current.delete(r.id)
        setParams((p) => (eiga ? { ...p, kjelde: r.src.id } : { ...p, kjelde: r.src.id, scene: "", plan: "", fest: "" }))
        setVald(null)
        setFeil(null)
        setHentar(false)
        return
      }
      if (r.kind === "feil") {
        if (r.kva === "build" && r.view) {
          portar.current[r.view].inFlight = false
          pump(r.view)
          if (r.id >= sisteBygg.current) setBusy(false)
          return
        }
        if (r.kva === "skisse") {
          // ei skisse som kasta er ikkje ein feil å syne; porten skal berre opnast att
          skissePort.current.inFlight = false
          pumpSkisse()
          return
        }
        setFeil(r.kva === "import" ? (r.kvifor ?? "ulesbar fil") : "uttak feila")
        setHentar(false)
        setBusy(false)
        return
      }
      void lastNed(r.text ? new Blob([r.text], { type: r.mime }) : new Blob([r.data as ArrayBuffer], { type: r.mime }), r.name)
      // Ei fil som ikkje bar alt ho lova, skal seie det MEDAN du står der.
      // Finn du det ut når du opnar henne att, er arbeidet borte.
      if (r.merknad) setMelding(r.merknad)
      setBusy(false)
    }
    return () => {
      w.terminate()
      worker.current = null
    }
  }, [pump, pumpSkisse])

  /**
   * KVA MOTOREN SNITTAR MEDAN DU SIKTAR: skissa, eller det valde planet.
   * Om att kvar gong posen endrar seg — eit nytt låst plan gjev nye kryss —
   * og kvar gong kroppen kjem, so brøkane er rekna mot den rette boksen.
   */
  useEffect(() => {
    if (!mounted || !kropp) return
    // verktyet for kroppen snittar ingenting: der byggjer du emnet, ikkje delane
    if (modus === "bit") return spørSkisse(null)
    // og konturen snittar ingenting: der ligg delane alt på plata
    if (view === "kontur") return spørSkisse(null)
    if (vald !== null) return spørSkisse(plan.find((q) => q.id === vald) ?? null)
    const s = skisse.current
    spørSkisse(s ? { id: 0, o: broek(s.o, kropp.min, kropp.max), n: s.n, bog: 0, strek: [] } : null)
  }, [mounted, kropp, vald, plan, params, modus, view, spørSkisse])
  const harSnitt = !!snitt?.ringar.length

  /**
   * SKJERMEN SYNER DET FILA VERT SKOREN PÅ.
   *
   * Nivået låg på peikaren: ei grov flate fekk det låge nivået og vart
   * ståande der, av di det fine bygget berre vart bede om når det var ei mus
   * i rommet. Det gjorde telefonen — den eine maskina dette er laga for —
   * til den einaste flata som synte ei grovare utgåve av delane enn den
   * laseren får: trappetrinn i omrisset som ikkje finst i kuttfila.
   *
   * No er nivået det same på begge flatene, og det same som uttaket og
   * måltala: grovt medan fingeren dreg, det verkelege når han stoggar.
   */
  const detail: DetailKey = "mid"
  // Kroppen berre når kroppen endrar seg; delane kvar gong noko gjer det —
  // grovt med det same, fint når fingeren stoggar.
  const kk = kroppKey(params)
  useEffect(() => {
    if (mounted) bygg("flate", "lav")
  }, [kk, mounted, formTal, bygg])
  useEffect(() => {
    if (!mounted) return
    setBusy(true)
    setFeil(null)
    bygg("lag", "lav")
    const t = window.setTimeout(() => {
      bygg("lag", detail)
    }, 300)
    return () => window.clearTimeout(t)
  }, [params, detail, view, mounted, formTal, bygg])

  /** hent dei formene som står på skjermen og ikkje er bedne om før */
  useEffect(() => {
    if (!mounted) return
    const vil = new Set<string>([String(params.kjelde ?? ""), ...bitar.map((b) => b.id)].filter(erFilform))
    for (const id of vil) {
      if (formLasta.current.has(id)) continue
      formLasta.current.add(id)
      setHentar(true)
      void fetch(`/form/${id}.glb`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((buf) => {
          const q = ++reqId.current
          formSvar.current.add(q)
          send({ kind: "import", id: q, name: `${id}.glb`, buf, som: id }, [buf])
        })
        .catch(() => {
          // ei form som ikkje kom er ei form du kan be om att
          formLasta.current.delete(id)
          setHentar(false)
          setFeil("fekk ikkje forma")
        })
    }
  }, [params.kjelde, bitar, mounted, send])

  // lenkja kodar alltid det som står på skjermen — bortsett frå nettet
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      const { kjelde: _k, ...rest } = params
      const kj = typeof _k === "string" && erFilform(_k) ? { kjelde: _k } : {}
      window.history.replaceState(null, "", "#p=" + encodeURIComponent(JSON.stringify({ ...rest, ...kj, view, skal })))
    }, 500)
    return () => window.clearTimeout(t)
  }, [params, view, skal, mounted])
  // og økta hugsar seg sjølv, straks. iOS drep ein PWA i bakgrunnen utan å
  // spørje, so det som står skal alt vera skrive — og skrivast ein gong til
  // i det appen går i bakgrunnen, for det som stod under ein halv sekund.
  const skrivOkta = useCallback(() => {
    const { kjelde: _k, ...rest } = naa.current
    void _k
    void lagre({ params: rest as Record<string, number | string> })
  }, [])
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(skrivOkta, 150)
    return () => window.clearTimeout(t)
  }, [params, mounted, skrivOkta])
  useEffect(() => {
    if (!mounted) return
    const gøymd = () => { if (document.visibilityState === "hidden") skrivOkta() }
    document.addEventListener("visibilitychange", gøymd)
    window.addEventListener("pagehide", skrivOkta)
    return () => {
      document.removeEventListener("visibilitychange", gøymd)
      window.removeEventListener("pagehide", skrivOkta)
    }
  }, [mounted, skrivOkta])

  /**
   * ANGRE OG GJER OM. Eit drag er hundre punkt og éi endring: eit punkt
   * vert fyrst bokført når det har fått stå i ein knapp sekund — og aldri
   * medan ein gest er i gang. Eit bygg som stoggar hovudtråden midt i ei
   * vriding gav elles to bokføringar av éin gest, og Z tok berre halve.
   * Framtida er det du angra: eit angre legg det som stod der, ei ny
   * endring kastar henne.
   */
  const fortid = useRef<ParamBag[]>([])
  const framtid = useRef<ParamBag[]>([])
  const stodd = useRef<ParamBag | null>(null)
  const [kanAngre, setKanAngre] = useState(false)
  const [kanGjerOm, setKanGjerOm] = useState(false)
  /** eit hopp i historikka er ikkje ei ny endring, og skal ikkje tøme framtida */
  const hopp = useRef(false)
  useEffect(() => {
    if (!mounted) return
    if (stodd.current === null) {
      stodd.current = params
      return
    }
    if (stodd.current === params) {
      setKanAngre(fortid.current.length > 0)
      return
    }
    if (hopp.current) hopp.current = false
    else if (framtid.current.length) {
      framtid.current = []
      setKanGjerOm(false)
    }
    setKanAngre(true)
    if (gest || skrubbar) return
    const t = window.setTimeout(() => {
      if (stodd.current === null || stodd.current === params) return
      fortid.current.push(stodd.current)
      if (fortid.current.length > ANGRE_DJUPN) fortid.current.shift()
      stodd.current = params
    }, 450)
    return () => window.clearTimeout(t)
  }, [params, mounted, gest, skrubbar])
  const angre = useCallback(() => {
    const no = naa.current
    const mal = stodd.current !== null && stodd.current !== no ? stodd.current : fortid.current.pop()
    if (!mal) return
    framtid.current.push(no)
    setKanGjerOm(true)
    stodd.current = mal
    hopp.current = true
    setKanAngre(fortid.current.length > 0)
    setParams(mal)
  }, [])
  const gjerOm = useCallback(() => {
    const mal = framtid.current.pop()
    if (!mal) return
    const no = naa.current
    if (stodd.current !== null && stodd.current !== no) fortid.current.push(stodd.current)
    fortid.current.push(no)
    if (fortid.current.length > ANGRE_DJUPN) fortid.current.shift()
    stodd.current = mal
    hopp.current = true
    setKanAngre(true)
    setKanGjerOm(framtid.current.length > 0)
    setParams(mal)
  }, [])

  const endre = useCallback((p: ParamBag) => {
    setParams(p)
  }, [])

  // --- KROPPEN ---------------------------------------------------------------
  /**
   * EIN BIT TIL. Primitiva er hundre millimeter på det lengste, og ein ny
   * står ved sida av dei som alt er der med femten millimeters overlapp:
   * strålane tel skal, so to bitar som går i kvarandre er ÉIN kropp der
   * dei overlappar, og ei rad av lause klossar ville vore lause delar.
   *
   * Rada vert lagd om att kvar gong og står midt i rommet. Det er ikkje ei
   * plassering nokon har valt — det finst ikkje eit handtak å flytte ein
   * bit med enno — men ho er den same kvar gong, og ho held seg innanfor
   * det scenestrengen tek imot. Steget krympar når bitane vert mange.
   */
  const leggBit = useCallback((id: string) => {
    // og det same for bitane: seksten er taket, og det skal seiast — utanfor
    // oppdateringa, som skal vera ei rein rekning og kan kallast to gonger
    if (lesScene(String(naa.current.scene || "") || eiKjelde(String(naa.current.kjelde ?? KUBE))).length >= SCENE_TAK) {
      setMelding(`taket er ${SCENE_TAK} bitar`)
      return
    }
    setParams((cur) => {
      const l = lesScene(String(cur.scene || "") || eiKjelde(String(cur.kjelde ?? KUBE)))
      if (l.length >= SCENE_TAK) return cur
      const ny = [...l, { id, t: [0, 0, 0] as Vec3, s: [1, 1, 1] as Vec3, rz: 0 }]
      const steg = Math.min(85, 760 / Math.max(1, ny.length - 1))
      const midt = (steg * (ny.length - 1)) / 2
      return { ...cur, scene: skrivScene(ny.map((b, i) => ({ ...b, t: [+(i * steg - midt).toFixed(2), b.t[1], b.t[2]] as Vec3 }))) }
    })
  }, [])
  // --- VERKTYET FOR KROPPEN --------------------------------------------------
  /**
   * FRÅ DET PLASSERTE ROMMET ATTENDE TIL BITANE SITT EIGE.
   *
   * `place` vender kroppen (X, so Y, so Z) og skalerer han. Fingeren gjev
   * millimeter i det ferdig plasserte rommet; ein bit står i det felles
   * rommet FØR vendinga. Difor vendinga snudd, i motsett rekkjefylgje, og
   * so delt på skalaen motoren rapporterte. Dette er ikkje geometri som
   * vert målt — det er ein finger som vert lesen, som skisseplanet.
   */
  const motVend = (d: Vec3, p: ParamBag): Vec3 => {
    const rad = (k: string) => ((typeof p[k] === "number" ? (p[k] as number) : 0) * Math.PI) / 180
    let [x, y, z] = d
    let c = Math.cos(-rad("rotZ"))
    let sn = Math.sin(-rad("rotZ"))
    let t = x * c - y * sn
    y = x * sn + y * c
    x = t
    c = Math.cos(-rad("rotY"))
    sn = Math.sin(-rad("rotY"))
    t = x * c + z * sn
    z = -x * sn + z * c
    x = t
    c = Math.cos(-rad("rotX"))
    sn = Math.sin(-rad("rotX"))
    t = y * c - z * sn
    z = y * sn + z * c
    y = t
    return [x, y, z]
  }
  /** ein bit skriven om: gjennom parametrane, so angre og lenkja gjeld */
  const skrivBit = useCallback((i: number, endra: Partial<Bit>) => {
    setParams((cur) => {
      const l = lesScene(String(cur.scene || "") || eiKjelde(String(cur.kjelde ?? KUBE)))
      if (!l[i]) return cur
      l[i] = { ...l[i], ...endra }
      return { ...cur, scene: skrivScene(l) }
    })
  }, [])
  const flyttBit = useCallback((dmm: Vec3) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    const k = kroppRef.current?.skala ?? 1
    if (!g || i === null || !(k > 0)) return
    const d = motVend(dmm, naa.current)
    skrivBit(i, { t: [g.t[0] + d[0] / k, g.t[1] + d[1] / k, g.t[2] + d[2] / k] as Vec3 })
  }, [skrivBit])
  /** klypet: alle tre aksane like mykje, so forholdet i biten står */
  const skalerBit = useCallback((faktor: number) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    if (!g || i === null || !Number.isFinite(faktor) || faktor <= 0) return
    skrivBit(i, { s: g.s.map((c) => klemBit(c * faktor)) as Vec3 })
  }, [skrivBit])
  /**
   * OG EI SIDE ÅLEINE: prikkane på boksen.
   *
   * Klypet gjer heile biten større og let forholdet stå. Prikken på ei side
   * dreg den EINE aksen, so ein kube vert ei plate og ein sylinder ein
   * oval. `akse` er 0, 1 eller 2 i biten sitt eige rom — det same rommet
   * `s` bur i — og faktoren er kor mykje sida har flytt seg, delt på kor
   * brei ho var.
   */
  const sideBit = useCallback((akse: 0 | 1 | 2, faktor: number) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    if (!g || i === null || !Number.isFinite(faktor) || faktor <= 0) return
    const s2 = [...g.s] as Vec3
    s2[akse] = klemBit(g.s[akse] * faktor)
    skrivBit(i, { s: s2 })
  }, [skrivBit])
  const vriBit = useCallback((grader: number) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    if (!g || i === null || !Number.isFinite(grader)) return
    skrivBit(i, { rz: (((g.rz + grader) % 360) + 360) % 360 })
  }, [skrivBit])
  /** ein bit til, lik den valde og skoven litt til sides, og han er den valde */
  const dupliserBit = useCallback(() => {
    const i = bitRef.current
    if (i === null) return
    setParams((cur) => {
      const l = lesScene(String(cur.scene || "") || eiKjelde(String(cur.kjelde ?? KUBE)))
      const b = l[i]
      if (!b || l.length >= SCENE_TAK) return cur
      const ny: Bit = { ...b, t: [b.t[0] + 30 * b.s[0], b.t[1], b.t[2]] as Vec3 }
      return { ...cur, scene: skrivScene([...l.slice(0, i + 1), ny, ...l.slice(i + 1)]) }
    })
    setValdBit(i + 1)
  }, [])
  /** den valde biten bort. Er han den siste, er kroppen kjelda si eiga att. */
  const slettBit = useCallback(() => {
    const i = bitRef.current
    if (i === null) return
    setParams((cur) => {
      const l = lesScene(String(cur.scene || "") || eiKjelde(String(cur.kjelde ?? KUBE)))
      if (l.length <= 1 || !l[i]) return cur
      return { ...cur, scene: skrivScene(l.filter((_, j) => j !== i)) }
    })
    setValdBit(null)
  }, [])

  /**
   * ATTENDE TIL KJELDA ÅLEINE. Bitane bort, og plana står. Eit plan er ein
   * brøk av boksen kring kroppen, so det fylgjer kroppen når han vert mindre
   * — akkurat som når storleiken vert dregen. Ei ny FIL er noko anna: der
   * er kroppen ein annan, og plana var eit svar om den du hadde.
   */
  const tomScene = useCallback(() => {
    setParams((cur) => ({ ...cur, scene: "" }))
    // attende til kjelda åleine er ein annan kropp, ikkje ei redigering
    setRammInn((n) => n + 1)
  }, [])

  // --- GESTANE --------------------------------------------------------------
  /**
   * GRUNNSTODA er biten gesten tok i, slik han stod då fingrane landa: alt
   * det to fingrar gjer med han vert målt frå det punktet. Klypet er
   * kameraet sitt og vridinga er snittet sitt — begge held sitt eige, og
   * ingen av dei er parametrar.
   */
  const grunn = useRef<{ bit: Bit | null } | null>(null)
  const bitRef = useRef<number | null>(null)
  bitRef.current = valdBit
  const taGest = useCallback((kva: GestKva) => {
    const p = naa.current
    const i = bitRef.current
    const l = i === null ? [] : lesScene(String(p.scene || "") || eiKjelde(String(p.kjelde ?? KUBE)))
    grunn.current = kva === null ? null : { bit: i === null ? null : (l[i] ?? null) }
    if (kva === "rute") rutGrunn.current = ruteTalde(lesPlan(p.plan))
    if (kva === "virvel") virvGrunn.current = virvNo()
    else if (kva === null) {
      setRuteTal(null)
      setVirvelTal(null)
    }
    setGest(kva)
  }, [])
  /** brytaren mellom form og skisse, med lina som seier kva som gjeld no */
  const vekslModus = useCallback(() => {
    setModus((m) => (m === "skisse" ? "form" : "skisse"))
    setValdBit(null)
  }, [])
  /** rutenettet: to fingrar set kolonner og rader. Eit valt plan er ikkje eit rutenett, so valet går. */
  const vekslRute = useCallback(() => {
    setModus((m) => (m === "rute" ? "form" : "rute"))
    setValdBit(null)
    setVald(null)
  }, [])
  /** virvelen: to fingrar set kor mange ribber, og kor langt ut frå aksen */
  const vekslVirvel = useCallback(() => {
    setModus((m) => (m === "virvel" ? "form" : "virvel"))
    setValdBit(null)
    setVald(null)
  }, [])
  /** verktyet for kroppen: bitane står som boksar, og gestane gjeld den valde */
  const vekslBit = useCallback(() => {
    setModus((m) => (m === "bit" ? "form" : "bit"))
    setValdBit(null)
  }, [])

  // --- PLANA -----------------------------------------------------------------
  /**
   * SKJER: skissa vert ein del. Punktet vert brøk av boksen kring kroppen, so
   * planet står på kroppen når storleiken endrar seg. Skissa står der ho
   * står, so du kan snu synet og skjere att — og den nye delen blinkar éin
   * gong når han kjem, so du ser kva du gjorde.
   */
  const laas = useCallback(() => {
    const s = skisse.current
    const k = kroppRef.current
    if (!s || !k) return
    const o = broek(s.o, k.min, k.max)
    if (o.some((c) => c < -0.5 || c > 1.5)) {
      setMelding("utanfor kroppen")
      return
    }
    // TAKET SEIER FRÅ. Lista stogga på seksti og fire og gav att posen han
    // fekk — men blinken fyrte likevel, so eit trykk på skjer lyste opp ein
    // del som aldri vart laga. Ein reiskap som gjer ingenting skal seie kva
    // han ikkje gjorde.
    const naaPlan = lesPlan(naa.current.plan)
    if (naaPlan.length >= PLAN_TAK) {
      setMelding(`taket er ${PLAN_TAK} plan`)
      return
    }
    /**
     * SYMMETRIEN LAGAR SNITTA, og so er ho ferdig med dei. Éin brytar gjev
     * to snitt, to gjev fire, tre gjev åtte — spegla om midtplana i kroppen,
     * kvart med sitt eige namn. Eit snitt som speglar seg til seg sjølv
     * (gjennom midten, på tvers av aksen du speglar om) er éin del og ikkje
     * to, so det vert lagt til éin gong.
     */
    const nye: { o: Vec3; n: Vec3 }[] = []
    for (const akser of speglingar(speil)) {
      let q = { o, n: s.n }
      for (const a of akser) q = spegla(q.o, q.n, a)
      if (!nye.some((r) => sameSnitt(r, q))) nye.push(q)
    }
    // Taket kappar, og seier frå om det kappa noko.
    const tek = nye.slice(0, PLAN_TAK - naaPlan.length)
    if (tek.length < nye.length) setMelding(`taket er ${PLAN_TAK} plan`)
    const id = nyId(naaPlan)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      if (l.length >= PLAN_TAK) return cur
      let i = nyId(l)
      return { ...cur, plan: skrivPlan([...l, ...tek.map((q) => ({ id: i++, o: q.o, n: q.n, bog: 0, strek: [] }))].slice(0, PLAN_TAK)) }
    })
    setBlink(id)
  }, [speil])
  /**
   * DUPLISER DET VALDE PLANET.
   *
   * Same normal, same strek, skuva eitt hakk langs normalen sin so det ikkje
   * vert liggjande oppi det du kopierte. Hakket er to platetjukner, i BRØK
   * av kroppen — plana bur i brøk, og eit tal i millimeter ville flytta seg
   * når du skalerte kroppen. Det nye planet vert valt: du dupliserer for å
   * flytte kopien, ikkje for å sjå på henne.
   */
  const dupliserPlan = useCallback((id: number) => {
    const k = kroppRef.current
    if (!k) return
    const l = lesPlan(naa.current.plan)
    const j = l.findIndex((q) => q.id === id)
    if (j < 0) return
    if (l.length >= PLAN_TAK) return setMelding(`taket er ${PLAN_TAK} plan`)
    const t = typeof naa.current.tjukn === "number" ? naa.current.tjukn : 6
    const q = l[j]
    const o = q.o.map((c, a) => {
      const vidd = Math.max(1e-6, k.max[a] - k.min[a])
      return Math.min(1, Math.max(0, +(c + (q.n[a] * 2 * t) / vidd).toFixed(4)))
    }) as Vec3
    const ny = nyId(l)
    setParams((cur) => {
      const m = lesPlan(cur.plan)
      if (m.length >= PLAN_TAK) return cur
      return { ...cur, plan: skrivPlan([...m, { id: nyId(m), o, n: q.n, bog: q.bog, strek: q.strek }]) }
    })
    setVald(ny)
    setBlink(ny)
  }, [])
  /**
   * BØYEN PÅ EIT PLAN, sett med ein finger.
   *
   * Talet er krumming gonge storleik (sjå `Plan.bog`), so det du bøygde
   * fylgjer kroppen når han vert skalert. Draget går oppover for meir bøy
   * mot normalen og nedover for meir mot den andre vegen, med null i
   * midten — og null er flatt, ikkje ein grense du må treffe.
   *
   * Kva materialet TOLER er ikkje klemt her: regelen `bog` reknar radien i
   * millimeter mot tjukna og seier frå, med eit råd som rettar ut til det
   * som går. Ein skyvar som stogga deg ville ikkje kunna seie kvifor.
   */
  const boyPlan = useCallback((id: number, d: number) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const i = l.findIndex((q) => q.id === id)
      if (i < 0) return cur
      const b = Math.max(-BOG_TAK, Math.min(BOG_TAK, l[i].bog + d))
      if (Math.abs(b - l[i].bog) < 1e-6) return cur
      l[i] = { ...l[i], bog: Math.abs(b) < 0.01 ? 0 : +b.toFixed(4) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /** eit plan flytt eller vinkla om av fingrane — gjennom parametrane, so angre og lenkja gjeld */
  const flyttPlan = useCallback((id: number, o: Vec3, n: Vec3) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const i = l.findIndex((p) => p.id === id)
      if (i < 0) return cur
      l[i] = { ...l[i], o: o.map((c) => Math.min(1.5, Math.max(-0.5, c))) as Vec3, n }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /** planet bort — og festa til delane hans, som ikkje peikar på noko lenger */
  const slett = useCallback((id: number) => {
    setVald((v) => (v === id ? null : v))
    setParams((cur) => {
      const m = lesFest(cur.fest)
      for (const adr of [...m.keys()]) if (Number(/^\d+/.exec(adr)?.[0]) === id) m.delete(adr)
      return { ...cur, plan: skrivPlan(lesPlan(cur.plan).filter((p) => p.id !== id)), fest: skrivFest(m) }
    })
  }, [])
  /** eit plan valt i scena eller lista; ein del valt på plata eller i kuttlista. Eit anna plan er eit anna strek, og ingen er valt. */
  const velPlan = useCallback((id: number | null) => {
    setVald(id)
    setValdStrek(null)
    setPeikt(id === null ? null : (liste.find((k) => k.plan === id)?.adr ?? null))
  }, [liste])
  // eit strek som ikkje finst lenger — planet bytt, streken sletta, eit angre — er ikkje valt
  useEffect(() => {
    if (valdStrek === null) return
    const pl = vald === null ? undefined : plan.find((q) => q.id === vald)
    if (!pl || valdStrek >= pl.strek.length) setValdStrek(null)
  }, [vald, plan, valdStrek])
  /**
   * STREKA: gods eller hòl i det valde planet, midt i snittet, og valt med det
   * same so handtaka står på det. Midten er tyngdepunktet i det største
   * stykket, lese av snittet motoren alt har svara med. Streken står relativt
   * til planet sitt punkt, som brøk av storleiken, so det du teikna fylgjer
   * kroppen når han vert skalert — sjå `lib/plan.ts`. Alt går gjennom
   * parametrane: angre, lenkja og økta får det utan ei line til.
   */
  const leggStrek = useCallback((slag: Strek["slag"]) => {
    const id = vald
    if (id === null) return
    const l = lesPlan(naa.current.plan)
    const j = l.findIndex((q) => q.id === id)
    if (j < 0) return
    const k = kroppRef.current
    const S = typeof naa.current.storleik === "number" ? naa.current.storleik : 150
    let x = 0
    let y = 0
    if (k && snitt?.ringar.length) {
      const r = planRamme(l[j], k.min, k.max)
      const m = snittMidt(snitt)
      x = (m[0] - dot(r.o, r.u)) / S
      y = (m[1] - dot(r.o, r.v)) / S
    }
    const s: Strek = slag === "gods" ? { slag, form: "rekt", x, y, w: 0.25, h: 0.12, a: 0 } : { slag, form: "rund", x, y, w: 0.08, h: 0.08, a: 0 }
    const i = l[j].strek.length
    setParams((cur) => {
      const ll = lesPlan(cur.plan)
      const jj = ll.findIndex((q) => q.id === id)
      if (jj < 0) return cur
      ll[jj] = { ...ll[jj], strek: [...ll[jj].strek, s] }
      return { ...cur, plan: skrivPlan(ll) }
    })
    setValdStrek(i)
  }, [vald, snitt])
  /** streken slik fingrane la han frå seg: eitt steg i angre */
  const endraStrek = useCallback((id: number, i: number, s: Strek) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0 || !l[j].strek[i]) return cur
      const strek = l[j].strek.slice()
      strek[i] = s
      l[j] = { ...l[j], strek }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /** medan fingeren dreg: motoren snittar planet med streken der han står no, utan å røre parametrane */
  const synStrek = useCallback((id: number, i: number, s: Strek) => {
    const l = lesPlan(naa.current.plan)
    const j = l.findIndex((q) => q.id === id)
    if (j < 0 || !l[j].strek[i]) return
    const strek = l[j].strek.slice()
    strek[i] = s
    l[j] = { ...l[j], strek }
    spørSkisse(l[j], { ...naa.current, plan: skrivPlan(l) })
  }, [spørSkisse])
  const slettStrek = useCallback(() => {
    const id = vald
    const i = valdStrek
    if (id === null || i === null) return
    setValdStrek(null)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0) return cur
      l[j] = { ...l[j], strek: l[j].strek.filter((_, k) => k !== i) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [vald, valdStrek])
  const askArk = useCallback((i: number) => send({ kind: "ark", id: ++reqId.current, params: naa.current, sheet: Math.max(0, i) }), [send])
  const velDel = useCallback((adr: string | null) => {
    setPeikt(adr)
    const k = adr ? liste.find((q) => q.adr === adr) : undefined
    setVald(k ? k.plan : null)
    // plata fylgjer den du vel
    if (k?.ark && view === "kontur" && ark && ark.i !== k.ark - 1) askArk(k.ark - 1)
  }, [liste, view, ark, askArk])

  // --- VIRVELEN ------------------------------------------------------------------
  /**
   * DET ANDRE RIBBESPRÅKET. Rutenettet gjev ribber på tvers av kvarandre;
   * virvelen gjev dei kring loddaksen — n ribber, kvar vridd `2π·i/n`, og
   * kvar skoven ut so ho tek på ein sirkel i staden for å gå gjennom midten.
   * Vassrett set kor mange, loddrett kor langt ut.
   *
   * SKUVET ER HEILE SAKA. Går alle gjennom aksen, kryssar dei kvarandre
   * langs den same lina: tjue plan vart to delar og seks og tretti lause
   * stykke då det vart målt. Difor er `r` klemt over null. Og dei to tala
   * heng saman — tre ribber på 0,30 kryssar ikkje kvarandre i det heile —
   * so lina over kroppen syner begge medan du dreg, og lina i arket syner
   * kva som kom ut.
   *
   * VIDDA TIL KROPPEN GÅR MED INN, av di eit punkt i eit plan er brøkar av
   * boksen og boksen ikkje er kvadratisk (sjå `virvel` i plan.ts).
   */
  const virvGrunn = useRef<[number, number]>(VIRVEL_START)
  /** kva virvelen står på no: tala som skreiv lista, om lista er hans. Er ho
   *  ikkje det, byrjar han der han sist stod — ein virvel lèt seg ikkje lesa
   *  attende ut av ei vilkårleg liste slik to aksetal gjer. */
  const virvSist = useRef<[number, number]>(VIRVEL_START)
  const virvNo = useCallback((): [number, number] => {
    const k = kroppRef.current
    const [n, r] = virvSist.current
    if (k && skrivPlan(virvel(n, r, vidd(k))) === String(naa.current.plan)) return [n, r]
    return virvSist.current
  }, [])
  const dragVirvel = useCallback((dx: number, dy: number) => {
    const k = kroppRef.current
    if (!k) return
    const [n0, r0] = virvGrunn.current
    const n = Math.max(2, Math.min(PLAN_TAK, n0 + Math.round(dx / VIRVEL_STEG)))
    const r = Math.max(VIRVEL_R.min, Math.min(VIRVEL_R.max, +(r0 + Math.round(-dy / VIRVEL_STEG) * VIRVEL_R_STEG).toFixed(3)))
    virvSist.current = [n, r]
    setVirvelTal([n, r])
    setParams((cur) => {
      const plan = skrivPlan(virvel(n, r, vidd(k)))
      return cur.plan === plan ? cur : { ...cur, plan, fest: "" }
    })
  }, [])

  // --- RUTENETTET ----------------------------------------------------------------
  /**
   * TO TAL, OG ALT FYLGJER. Rutenettet var reiskapen denne saka byrja med,
   * og det som mangla var ikkje eit søk som gjetta på dei to tala for deg —
   * det var ein måte å setje dei på med fingrane. Vassrett er kolonner,
   * loddrett er rader, og fyrtifire pikslar er eitt plan. Grunnstoda er det
   * som ALT står: plan langs x og plan langs y, talde, so verktyet held fram
   * der nettet ditt slutta.
   *
   * Han SKRIV LISTA OM, som «ta alle» gjorde: eit rutenett er ei liste, ikkje
   * eit tillegg. Festa fylgjer med, av di dei peikar på namn som er borte.
   * Éin skrift per steg — tala er heiltal — og eitt steg i angre for heile
   * gesten, av di gesten melder seg til `taGest` medan han varer.
   */
  const rutGrunn = useRef<[number, number]>([0, 0])
  const dragRute = useCallback((dx: number, dy: number) => {
    const [nx0, ny0] = rutGrunn.current
    const tak = Math.floor(PLAN_TAK / 2)
    const nx = Math.max(0, Math.min(tak, nx0 + Math.round(dx / RUTE_STEG)))
    const ny = Math.max(0, Math.min(tak, ny0 + Math.round(-dy / RUTE_STEG)))
    setRuteTal([nx, ny])
    setParams((cur) => {
      const plan = skrivPlan(rutenett(nx, ny))
      return cur.plan === plan ? cur : { ...cur, plan, fest: "" }
    })
  }, [])

  // --- FILER ---------------------------------------------------------------------
  const hentArk = useCallback((i: number) => {
    const id = ++reqId.current
    const svar = new Promise<ArkRes>((ok, nei) => {
      arkVent.current.set(id, ok)
      window.setTimeout(() => {
        if (arkVent.current.delete(id)) nei(new Error("plata kom ikkje"))
      }, 20000)
    })
    send({ kind: "ark", id, params: naa.current, sheet: i })
    return svar
  }, [send])
  /** platene som bilete, rasteriserte HER: ein arbeidar har ingen Image, og
   *  geometrien er framleis hans — same SVG som uttaket skriv */
  const pngAvArk = useCallback(async () => {
    const n = Math.max(0, tal?.metrics.sheets ?? 0)
    if (!n) return
    setBusy(true)
    try {
      const filer: { name: string; data: Uint8Array }[] = []
      const st = stamme(kjeldeNamn)
      for (let i = 0; i < n; i++) {
        const a = await hentArk(i)
        // fire pikslar per millimeter, med tak på lengste kanten: fire plater i minnet på ein telefon
        const pxmm = Math.min(4, 2400 / Math.max(a.arkB, a.arkH, 1))
        const w = Math.max(1, Math.round(a.arkB * pxmm))
        const h = Math.max(1, Math.round(a.arkH * pxmm))
        const kilde = a.svg.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 width="${w}" height="${h}"`)
        filer.push({ name: n <= 1 ? `${st}-ark.png` : `${st}-ark-${i + 1}av${n}.png`, data: await tilPng(kilde, w, h) })
      }
      if (filer.length === 1) void lastNed(new Blob([filer[0].data as BlobPart], { type: "image/png" }), filer[0].name)
      else void lastNed(new Blob([zip(filer) as BlobPart], { type: "application/zip" }), `${st}-ark-png.zip`)
    } catch {
      setFeil("png feila")
    } finally {
      setBusy(false)
    }
  }, [tal, hentArk, kjeldeNamn])
  const doExport = useCallback((what: ExportKind) => {
    if (what === "png") return void pngAvArk()
    setBusy(true)
    send({ kind: "export", id: ++reqId.current, params: naa.current, what })
  }, [pngAvArk, send])
  const share = useCallback(() => {
    const url = window.location.href
    if (navigator.share) return void navigator.share({ url })
    void navigator.clipboard?.writeText(url).then(() => setMelding("lenkje kopiert")).catch(() => setMelding("ikkje kopiert"))
  }, [])
  /** fila inn: lesen her, tolka i arbeidaren, bufferen overført og ikkje kopiert */
  const takeFile = useCallback(async (f: File) => {
    if (f.size > MAX_FIL) return setFeil("for stor")
    setFeil(null)
    setBusy(true)
    setHentar(true)
    try {
      const buf = await f.arrayBuffer()
      // ned i basen FØR bufferen vert overført. Ei prosjektfil er eit oppsett, ikkje eit nett.
      if (!/\.zip$/i.test(f.name)) await lagre({ filnamn: f.name, nett: buf.slice(0) })
      send({ kind: "import", id: ++reqId.current, name: f.name, buf }, [buf])
    } catch {
      setFeil("ulesbar fil")
      setHentar(false)
      setBusy(false)
    }
  }, [send])
  // slepp ei fil kvar som helst på sida: ein reiskap som krev ein bestemt firkant har ikkje forstått drag-og-slepp
  useEffect(() => {
    let djup = 0
    const filer = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files")
    const inn = (e: DragEvent) => { if (filer(e)) { e.preventDefault(); djup++; setDrag(true) } }
    const over = (e: DragEvent) => { if (filer(e)) e.preventDefault() }
    const ut = () => { djup = Math.max(0, djup - 1); if (!djup) setDrag(false) }
    const slepp = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0]
      if (!f) return
      e.preventDefault()
      djup = 0
      setDrag(false)
      void takeFile(f)
    }
    const par: [string, (e: DragEvent) => void][] = [["dragenter", inn], ["dragover", over], ["dragleave", ut], ["drop", slepp]]
    for (const [n, h] of par) window.addEventListener(n, h as EventListener)
    return () => { for (const [n, h] of par) window.removeEventListener(n, h as EventListener) }
  }, [takeFile])

  const opneVerkty = useCallback((id: VerktyId) => {
    setVerkty((v) => (v === id ? null : id))
    // på telefonen deler arket og skuffa den same kanten: arket går til lina
    if (!benk) setSteg("line")
  }, [benk])
  // står plateflata framme og noko flyttar seg, skal ho fylgje med
  useEffect(() => {
    if (view === "kontur") askArk(ark?.i ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tal, askArk])
  /**
   * SØVNEN.
   *
   * Verktyet er til for å SJÅ på det du lagar. Etter to sekund utan ein
   * finger er alt anna i vegen, so det fell bort — og ei rørsle hentar det
   * att med det same. Overgangen står i `globals.css`.
   *
   * BERRE I KVILE. Står eit plan eller eit strek valt, ei skuff open, arket
   * oppe, eit verkty i gang eller plateflata framme, er du MIDT I noko: det
   * som står framme er det du arbeider i, og det skal ikkje forsvinne under
   * handa. Det same medan motoren reknar, og medan ei line har noko å seie.
   *
   * Og medan det søv tek grensesnittet ikkje imot fingrar. Eit trykk du
   * ikkje ser er eit trykk du ikkje bad om — og av di han berre søv i kvile,
   * har det fyrste trykket ingenting å ta på objektet heller: det vekkjer,
   * og det er alt det gjer.
   */
  const [sov, setSov] = useState(false)
  /** knappen den andre fingeren tok, medan han er nede — sjå tommelspalta */
  const andreFinger = useRef<Element | null>(null)
  /** kvar fingeren stod sist medan han bøygde eit plan */
  const boy = useRef<number | null>(null)
  /**
   * EIN NY KROPP RAMMAR INN, EI REDIGERING GJER DET IKKJE.
   *
   * Synet i scena står der du sette det (sjå `Scene`), so ein bit som vert
   * dregen ikkje flyttar heile biletet under fingeren. Men ei NY fil, eit
   * nytt prosjekt eller ei tømd scene er ikkje ei redigering — det er eit
   * anna objekt, og det skal du sjå. Talet stig, og scena rammar inn.
   */
  const [rammInn, setRammInn] = useState(0)
  const kvile =
    mounted && !verkty && steg === "line" && view !== "kontur" &&
    vald === null && valdStrek === null && valdBit === null &&
    modus !== "bit" && modus !== "rute" && modus !== "virvel" &&
    !busy && !drag && !melding && !feil && !hentar
  useEffect(() => {
    if (!kvile) return setSov(false)
    let t = 0
    const vak = () => {
      setSov(false)
      window.clearTimeout(t)
      t = window.setTimeout(() => setSov(true), SOV_MS)
    }
    const kva = ["pointerdown", "pointermove", "wheel", "keydown"] as const
    for (const n of kva) window.addEventListener(n, vak, { capture: true, passive: true })
    vak()
    return () => {
      window.clearTimeout(t)
      for (const n of kva) window.removeEventListener(n, vak, true)
    }
  }, [kvile])

  useEffect(() => {
    if (!melding) return
    const t = window.setTimeout(() => setMelding(null), 4000)
    return () => window.clearTimeout(t)
  }, [melding])
  /**
   * INGENTING PÅ SIDA VERT MERKT, FORSTØRRA ELLER RULLA. Skalaen er låst i
   * viewporten og merkinga i CSS; her går det som CSS ikkje når: iOS sine
   * eigne klypehendingar, eit fleirfingerdrag utanfor lerretet (lerretet
   * tek sine eigne), og menyen som kjem på eit langt trykk.
   */
  useEffect(() => {
    const stogg = (e: Event) => e.preventDefault()
    const fleire = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    document.addEventListener("gesturestart", stogg, { passive: false })
    document.addEventListener("gesturechange", stogg, { passive: false })
    document.addEventListener("touchmove", fleire, { passive: false })
    document.addEventListener("contextmenu", stogg)
    return () => {
      document.removeEventListener("gesturestart", stogg)
      document.removeEventListener("gesturechange", stogg)
      document.removeEventListener("touchmove", fleire)
      document.removeEventListener("contextmenu", stogg)
    }
  }, [])

  // TASTANE. Eit felt som er teke eig sine eigne.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return
      if (e.altKey) return
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault()
        return e.shiftKey ? gjerOm() : angre()
      }
      if (e.metaKey || e.ctrlKey) return
      // same som knappen: med eit plan valt er skissa gøymd, og L slepp valet
      if (k === "l") {
        if (vald === null) laas()
        else velPlan(null)
      } else if (k === "delete" || k === "backspace") {
        if (valdStrek !== null) slettStrek()
        else if (vald !== null) slett(vald)
      } else if (k === "z") (e.shiftKey ? gjerOm : angre)()
      else if (k === "s") vekslModus()
      else if (k === "r") vekslRute()
      else if (k === "v") vekslVirvel()
      else if (k === "1") setView("flate")
      else if (k === "2") setView("lag")
      else if (k === "3") setView("kontur")
      else if (k === "escape") {
        if (verkty) setVerkty(null)
        else if (valdStrek !== null) setValdStrek(null)
        else if (vald !== null) velPlan(null)
        else setSteg("line")
      } else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [angre, gjerOm, laas, slett, slettStrek, vald, valdStrek, vekslRute, vekslVirvel, verkty, velPlan, vekslModus])

  /** ruta og kva som ligg over henne: kameraet rammar inn i det som er att */
  const skuffH = benk ? Math.round(vindu.h * 0.46) : 0
  /**
   * SYNET ROMMET STÅR I. Konturen er ikkje eit romsyn lenger — han er
   * plateflata — so rommet held på det synet det hadde medan ho står
   * framme. Å sende «lag» inn i staden ville bytt nettet under eit lerret
   * ingen ser, og bytt det attende, for ingenting.
   */
  const romsyn = useRef<Rom>("lag")
  if (view !== "kontur") romsyn.current = view
  const rute: Rute = useMemo(
    () => ({ W: vindu.w, H: vindu.h, venstre: 0, hogre: benk ? KOL : 0, topp: toppH, botn: benk ? (verkty ? skuffH : 0) : arkH }),
    [vindu, benk, verkty, skuffH, arkH, toppH],
  )
  const skuffRute: CSSProperties = benk
    ? { left: 0, right: KOL, bottom: 0, height: skuffH }
    : { left: 8, right: 8, top: toppH + 8, bottom: `calc(${LUKKA_ARK}px + env(safe-area-inset-bottom))` }
  /** kva fingrane held på med, med eitt ord — rutenettet med dei to tala sine */
  const gestTekst =
    gest === "rute" ? (ruteTal ? `${ruteTal[0]}×${ruteTal[1]}` : "rutenett")
    : gest === "virvel" ? (virvelTal ? `${virvelTal[0]} · ${Math.round(virvelTal[1] * 100)}%` : "virvel")
    : gest
  /** ord, ikkje setningar: gestane i den rekkjefylgja du tek dei */

  return (
    <main className="fixed inset-0 overflow-hidden" data-sov={sov ? "" : undefined} style={{ background: "var(--paper)" }}>
      {/* fyrste gesten på objektet tek lina om gestane bort. Rommet vert
          GØYMT og ikkje teke ned når plateflata står framme: lerretet held
          på WebGL-samanhengen og synet sitt, og synskuben — som høyrer til
          rommet — fylgjer med i gøymsla. */}
      <div className="absolute inset-0" style={{ visibility: view === "kontur" ? "hidden" : undefined }}>
        {mounted && (
          <Scene
            kropp={kropp}
            lag={lag}
            view={romsyn.current}
            skal={skal}
            onSkal={() => setSkal((q) => !q)}
            sov={sov}
            modus={modus}
            material={String(params.material ?? "finer")}
            rute={rute}
            liste={liste}
            plan={plan}
            vald={vald}
            snitt={snitt}
            blink={blink}
            skisse={skisse}
            storleik={typeof params.storleik === "number" ? params.storleik : 150}
            valdStrek={valdStrek}
            onVald={velPlan}
            onValdStrek={setValdStrek}
            onPlan={flyttPlan}
            onStrek={endraStrek}
            onSynStrek={synStrek}
            onGest={taGest}
            onSkisse={skisseEndra}
            valdBit={valdBit}
            onValdBit={setValdBit}
            onBitFlytt={flyttBit}
            onBitSkala={skalerBit}
            onBitVri={vriBit}
            onBitSide={sideBit}
            rammInn={rammInn}
            onRute={modus === "virvel" ? dragVirvel : dragRute}
          />
        )}
      </div>

      {/*
        PLATEFLATA. «Kontur» var ei stripe med profilane ved sida av kvarandre
        i lerretet — den same teikninga som platene alt syner, berre utan å
        kunne røre ved henne. No ER konturen platene: same delane, i den
        rekkjefylgja og på dei arka fila vert skoren på, der ein finger flyttar
        dei. Rommet står att under henne med synet det hadde, so eit steg ut og
        inn att ikkje nullstiller kameraet.
      */}
      {mounted && view === "kontur" && (
        <section
          aria-label="plateflata"
          // UTAN z: flata skal stable seg som DOM-en seier — over rommet, som
          // står før henne, og under tommelspalta og toppen, som står etter.
          // Eit z-tal her ville laga ein stabel av henne, og menyen over ein
          // del — som skal liggje over ALT medan han står — vart fanga i han.
          className="absolute flex flex-col"
          style={{ left: 0, right: rute.hogre, top: rute.topp, bottom: benk ? rute.botn : `calc(${arkH}px + env(safe-area-inset-bottom))`, background: "var(--paper)" }}
        >
          <Plater ark={ark} params={params} onChange={endre} onArk={askArk} peikt={peikt} onPeik={velDel} />
        </section>
      )}

      <Toppline benk={benk} kjelde={kjeldeNamn} bitar={bitar.length} onLegg={leggBit} onTom={tomScene} view={view} onView={setView} onFile={(f) => void takeFile(f)} onAngre={angre} kanAngre={kanAngre} onGjerOm={gjerOm} kanGjerOm={kanGjerOm} onShare={share} onHogd={setToppH} />

      {/* kva fingrane gjer, i tal, so lenge dei er nede: øvst til VENSTRE i
          det frie bandet — synskuben har det høgre hjørnet */}
      {gestTekst && (
        <div className="pointer-events-none absolute flex justify-start" style={{ top: toppH + 10, left: 14 }} aria-hidden="true">
          <span className="tab text-[26px] leading-none tracking-[0.02em]" style={{ opacity: 0.5 }}>{gestTekst}</span>
        </div>
      )}

      {/*
        TOMMELSPALTA. Skjer står der høgre tommelen alt er: nedst til høgre,
        over arket, 64 pikslar. Med eit plan valt er skissa gøymd, og knappen
        er «ferdig» og slepp valet. Over han: skissebrytaren, og med eit plan
        valt òg slett — og dei to streka, gods og hòl, som teiknar i profilen
        hans. Er eit strek valt, er det streken slett tek. Ikon, aldri ord.
        Prikken i hjørnet er motoren som reknar. På benken står spalta nedst
        i lerretet, ved kolonna.
      */}
      {mounted && (
        <div
          className="tumme"
          style={{ right: (benk ? KOL : 0) + 16, bottom: benk ? rute.botn + 16 : `calc(${arkH}px + env(safe-area-inset-bottom) + 4px)` }}
          /**
           * DEN ANDRE FINGEREN.
           *
           * Nettlesaren lagar berre `click` av den FYRSTE fingeren på
           * skjermen. Held du snitthandtaket med tommelen og trykkjer skjer
           * med peikefingeren, er det andre trykket ikkje primært — og
           * knappen høyrer det aldri. Det er nett den gripinga verktyet er
           * laga for: hald snittet der du vil ha det, og skjer utan å sleppe.
           *
           * So spalta les peikaren sjølv når han ikkje er primær. Ingen
           * fanging: slepper du utanfor knappen du tok, skjer ingenting —
           * det er slik eit trykk vert avlyst. Den primære fingeren går den
           * vanlege vegen gjennom `click`, so ingenting fyrer to gonger.
           */
          onPointerDown={(e) => { if (!e.isPrimary) andreFinger.current = (e.target as Element).closest("button") }}
          onPointerCancel={() => { andreFinger.current = null }}
          onPointerUp={(e) => {
            if (e.isPrimary) return
            const b = (e.target as Element).closest<HTMLButtonElement>("button")
            const same = !!b && b === andreFinger.current
            andreFinger.current = null
            if (same && !b.disabled) b.click()
          }}
        >
          {vald !== null && (
            <>
              {/* TO REISKAPAR MED TO LESEMÅTAR. I rommet legg dei ein
                  firkant eller ein ring midt i snittet. I teikninga er dei
                  ein PENN og eit VISKELÊR som låser seg: éin finger inne i
                  ramma teiknar merket i full breidd, den andre knappen byter
                  forteikn utan at du går ut, den tende slokner. Ordet og
                  ikonet fylgjer handlinga, ikkje knappen. Dei var teikna i
                  konturen òg før, og skreiv eit strek ingen kunne sjå —
                  `Streka` står berre i rommet. */}
              <button
                type="button"
                aria-label="dubler planet"
                title="eitt plan til, likt dette, skuva eit hakk langs normalen"
                onClick={() => dupliserPlan(vald)}
                className={TUMME_BTN}
              >
                {IcoDupliser}
              </button>
              <button
                type="button"
                aria-label="skjer hòl"
                title="skjer eit hòl: ein ring midt i snittet. flytt, vri og dra han større"
                onClick={() => leggStrek("hol")}
                className={TUMME_BTN}
              >
                {IcoHol}
              </button>
              {/* BØYEN: TRYKK OG DRA, som lupa. Ein skyvar ville teke ei
                  rad i arket for noko som gjeld eitt plan, og handtaka på
                  snittet er alt tre. Draget er buelengd og ikkje pikslar:
                  hundre pikslar er ein halv bøy same kva skjerm du held. */}
              {valdStrek === null && (
                <button
                  type="button"
                  data-boy=""
                  aria-label="bøy planet"
                  title="dra opp og ned: bøy planet. materialet set grensa, og regelen seier kvar ho går"
                  className={TUMME_BTN}
                  style={{ touchAction: "none", cursor: "ns-resize" }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId)
                    boy.current = e.clientY
                    setSkrubbar(true)
                  }}
                  onPointerMove={(e) => {
                    if (boy.current === null || vald === null) return
                    const dy = e.clientY - boy.current
                    boy.current = e.clientY
                    boyPlan(vald, -dy * BOY_STEG)
                  }}
                  onPointerUp={() => { boy.current = null; setSkrubbar(false) }}
                  onPointerCancel={() => { boy.current = null; setSkrubbar(false) }}
                >
                  {IcoBoy}
                </button>
              )}
              <button
                type="button"
                aria-label={valdStrek !== null ? "slett strek" : "slett"}
                title={valdStrek !== null ? "ta streken bort (⌫)" : "ta det valde planet bort (⌫)"}
                onClick={valdStrek !== null ? slettStrek : () => slett(vald)}
                className={TUMME_BTN}
                style={{ color: "var(--warn)" }}
              >
                {IcoSlett}
              </button>
            </>
          )}
          {/* VERKTYET FOR KROPPEN: bitane står som boksar, trykk vel ein, og
              to fingrar flyttar, vrir og gjer han større. Med ein bit valt
              står han til å dublere eller ta bort. */}
          {modus === "bit" && valdBit !== null && (
            <>
              <button type="button" aria-label="dubler biten" title="ein bit til, lik denne" onClick={dupliserBit} className={TUMME_BTN}>
                {IcoDupliser}
              </button>
              <button type="button" aria-label="ta biten bort" title="ta den valde biten ut av kroppen" onClick={slettBit} className={TUMME_BTN} style={{ color: "var(--warn)" }}>
                {IcoSlett}
              </button>
            </>
          )}
          <button
            type="button"
            aria-pressed={modus === "bit"}
            aria-label="kroppen"
            title={modus === "bit" ? "verktyet for kroppen: trykk ein bit, to fingrar flyttar, vrir og skalerer han. trykk for å gå ut" : "verktyet for kroppen: flytt, vri og skaler bitane han er sett saman av"}
            onClick={vekslBit}
            className={TUMME_BTN}
            data-bitverkty=""
          >
            {IcoBit}
          </button>
          {/* SKISSEMODUSEN: to fingrar arbeider på planet — dra flyttar, vri
              vinklar, klyp zoomar. Av er «form»: klyp zoomar, vri vendinga. */}
          <button
            type="button"
            aria-pressed={modus === "skisse"}
            aria-label="skisse"
            title={modus === "skisse" ? "skissemodus (S): to fingrar dreg, vrir og zoomar snittet. trykk for form" : "form (S): to fingrar klyp storleiken, vrir vendinga, dreg snittet. trykk for skisse"}
            onClick={vekslModus}
            className={TUMME_BTN}
          >
            {IcoSkisse}
          </button>
          {/* SYMMETRIEN PÅ SNITTET: tre brytarar, ei line, RETT OVER SKJER —
              av di det er skjer dei endrar. Kvar akse speglar snittet om
              midtplanet i kroppen, og dei tel saman: x og y er fire ribber av
              ei. Ord og ikkje ikon: ein akse har eit namn, og x er kortare enn
              kvart bilete av x. Og berre ordet: tre piller midt over objektet
              var tre flater du såg i staden for det du lagar.

              Lina er BREIARE enn spalta og skal ikkje skuve henne: spalta
              midtstiller borna sine, so ei brei line ville flytt skjer og alt
              anna innover frå tommelen. Difor står ho utanfor flyten, med
              høgrekanten sin på linje med ikona. */}
          {vald === null && view !== "kontur" && modus !== "bit" && (
            <span className="relative block h-9 w-9">
              <span className="absolute right-0 top-0 flex items-center" role="group" aria-label="symmetri">
                {(["x", "y", "z"] as const).map((ord, a) => (
                  <button
                    key={ord}
                    type="button"
                    aria-label={`speil ${ord}`}
                    aria-pressed={(speil & (1 << a)) !== 0}
                    title={`speil snittet om ${ord}-planet gjennom midten: skjer låser båe`}
                    onClick={() => setSpeil((q) => q ^ (1 << a))}
                    // FIRE OG FØRTI PIKSLAR KVAR. `hit` blæs treffesona ut til
                    // 44 px kring midten av knappen, og tre ord på tjue
                    // pikslar fekk difor tre soner som låg oppå kvarandre:
                    // «x» tok ikkje trykket sitt, «y» tok det. Ordet er
                    // smalt, sona er ikkje — so knappen ber henne sjølv.
                    className={ORD + " w-11 shrink-0"}
                    data-speil={ord}
                  >
                    {ord}
                  </button>
                ))}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={vald === null ? laas : () => velPlan(null)}
            disabled={view === "kontur" || (vald === null && !harSnitt)}
            aria-label={vald === null ? "skjer" : "ferdig"}
            title={vald === null ? "skjer: skissa vert ein del (L)" : "ferdig med planet (esc)"}
            className="skjer ikon"
          >
            {vald === null ? IcoSkjer : IcoFerdig}
            <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "var(--ink)", opacity: busy ? 1 : 0, transition: "opacity 200ms ease" }} />
          </button>
        </div>
      )}

      {drag && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--paper) 82%, transparent)" }}>
          <div className="rounded-2xl border border-dashed px-6 py-4 text-[11px] uppercase tracking-[0.2em]" style={{ borderColor: "var(--ink)" }}>slepp fila</div>
        </div>
      )}

      <Skuff
        open={verkty}
        rute={skuffRute}
        liste={liste}
        params={params}
        clamp={(o, prev) => MOTOR.clamp(o, prev)}
        peikt={peikt}
        onPeik={velDel}
        onChange={endre}
        onBytt={opneVerkty}
        onClose={() => setVerkty(null)}
        onOrd={(t) => void navigator.clipboard?.writeText(t).then(() => setMelding("kopiert")).catch(() => setMelding("ikkje kopiert"))}
      />

      <Arket
        benk={benk}
        steg={steg}
        onSteg={setSteg}
        params={params}
        onChange={endre}
        onSkrubb={setSkrubbar}
        view={view}
        topp={toppH}
        metrics={tal?.metrics ?? null}
        rules={tal?.rules ?? []}
        liste={liste}
        plan={plan}
        vald={vald}
        onVald={velPlan}
        onSlett={slett}
        busy={busy}
        feil={feil}
        melding={melding}
        hentar={hentar}
        rute={modus === "rute"}
        onRute={vekslRute}
        virvel={modus === "virvel"}
        onVirvel={vekslVirvel}
        onExport={doExport}
        onReset={() => endre({ ...MOTOR.defaults, kjelde: params.kjelde })}
        verkty={verkty}
        onVerkty={opneVerkty}
        onHogd={setArkH}
      />
    </main>
  )
}
