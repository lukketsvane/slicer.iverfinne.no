"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { ArkSyn, ExportKind, DetailKey, ParamBag, Vec3, View } from "@/lib/core"
import { KUBE } from "@/lib/sources"
import { hent, lagre } from "@/lib/lagring"
import { zip } from "@/lib/zip"
import { MOTOR } from "@/lib/motor"
import { PLAN_TAK, broek, lesPlan, nyId, skrivPlan, type Plan } from "@/lib/plan"
import { lesFest, skrivFest } from "@/lib/params"
import type { Kandidat } from "@/lib/forslag"
import type { Rute } from "@/lib/ramme"
import type { SkisseSyn } from "@/lib/snitt"
import type { ArkRes, BuildRes, MaalRes, Req, Res, SkisseReq } from "@/lib/worker"
import { Scene, type GestKva, type Modus, type Skisse } from "./scene"
import { Arket, KOL, type Steg } from "./arket"
import { HAIR, IcoFerdig, IcoSikt, IcoSkisse, IcoSkjer, IcoSlett, IcoSnu, chipStyle } from "./deler"
import { Skuff, type VerktyId } from "./verkty"
import { Toppline } from "./toppline"
import { PARAM_RANGES } from "@/lib/params"

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
/** nøkkelen i nettlesaren som seier at rettleiinga er sett */
const COACH = "slicerman.coach"
/** knappane over skjer i tommelspalta: 48 pikslar, runde */
const TUMME_BTN = "hit relative flex h-12 w-12 items-center justify-center rounded-full border transition active:scale-95"
/** det «forslag» IKKJE rører: endrar noko av dette seg, er lista eit svar på eit anna spørsmål */
const tuneBase = (p: ParamBag) =>
  [p.kjelde, p.storleik, p.rotX, p.rotY, p.rotZ, p.glatt, p.trekant, p.tjukn, p.klaring, p.snitt, p.arkB, p.arkH, p.lause].join("|")
/** det som er KROPPEN: berre desse ber om eit nytt «flate»-bygg */
const kroppKey = (p: ParamBag) => [p.kjelde, p.storleik, p.rotX, p.rotY, p.rotZ, p.glatt, p.trekant].join("|")
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
  /** dei tre bygga: kroppen (flate), delane (lag) og teikninga (kontur) */
  const [kropp, setKropp] = useState<BuildRes | null>(null)
  const [lag, setLag] = useState<BuildRes | null>(null)
  const [kontur, setKontur] = useState<BuildRes | null>(null)
  const [tal, setTal] = useState<MaalRes | null>(null)
  const [syn, setSyn] = useState<string | null>(null)
  const [ark, setArk] = useState<ArkSyn | null>(null)
  /** det valde planet, og den valde delen på plata */
  const [vald, setVald] = useState<number | null>(null)
  const [peikt, setPeikt] = useState<string | null>(null)
  const [steg, setSteg] = useState<Steg>("line")
  const [verkty, setVerkty] = useState<VerktyId | null>(null)
  const [forslag, setForslag] = useState<Kandidat[]>([])
  const [visForslag, setVisForslag] = useState(false)
  const [synt, setSynt] = useState<number | null>(null)
  const [tunar, setTunar] = useState<{ gjort: number; av: number } | null>(null)
  const [busy, setBusy] = useState(true)
  const [feil, setFeil] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [hentar, setHentar] = useState(false)
  /** éi line om gestane: ved starten, etter ein import, og når modusen byter. Ho går på fyrste gesten. */
  const [hint, setHint] = useState<"gest" | null>("gest")
  const hintTimer = useRef(0)
  const [drag, setDrag] = useState(false)
  const [arkH, setArkH] = useState(0)
  const [toppH, setToppH] = useState(44)
  /** gestmodusen: «form» er dei gamle gestane på objektet, «skisse» er gestane på planet */
  const [modus, setModus] = useState<Modus>("form")
  /** kva ein finger held på med akkurat no, til lesing over objektet */
  const [gest, setGest] = useState<GestKva>(null)
  const [raakar, setRaakar] = useState(false)
  /** snittet skissa (eller det valde planet) ville gje, slik motoren las det */
  const [snitt, setSnitt] = useState<SkisseSyn | null>(null)
  /** planet som nett vart skore: delen hans blinkar éin gong når han kjem */
  const [blink, setBlink] = useState<number | null>(null)
  const [coach, setCoach] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [namn, setNamn] = useState<Record<string, string>>({})
  const benk = useMedia("(pointer: fine) and (min-width: 1180px)")
  const fin = useMedia("(pointer: fine)")
  const vindu = useVindu()

  const worker = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const sisteBygg = useRef(0)
  const naa = useRef(params)
  naa.current = params
  const tunarRef = useRef(false)
  const finn = useRef<{ base: string; djup: boolean } | null>(null)
  /** importar som høyrer til oppsettet som alt står (den hugsa økta) */
  const attende = useRef(new Set<number>())
  const arkVent = useRef(new Map<number, (r: ArkRes) => void>())
  /** skisseplanet slik det står no, skrive av scena kvar teikning */
  const skisse = useRef<Skisse | null>(null)
  const kroppRef = useRef<BuildRes | null>(null)
  kroppRef.current = kropp
  const kjelde = String(params.kjelde ?? KUBE)
  const kjeldeNamn = kjelde === KUBE ? "kube" : (namn[kjelde] ?? "nett")
  const plan = useMemo(() => lesPlan(params.plan), [params.plan])
  const liste = useMemo(() => tal?.liste ?? [], [tal])

  /**
   * SISTE-VINN-PORTEN, éin per lesemåte. Ein skyvar lagar punkt fortare
   * enn motoren byggjer dei; med porten vert eit uteståande punkt berre
   * BYTT UT til bygget i lufta er ferdig, og draget går i motoren si takt.
   */
  const portar = useRef<Record<View, Port>>({
    flate: { inFlight: false, pending: null, shown: 0 },
    lag: { inFlight: false, pending: null, shown: 0 },
    kontur: { inFlight: false, pending: null, shown: 0 },
  })
  const pump = useCallback((v: View) => {
    const p = portar.current[v]
    if (p.inFlight || !p.pending) return
    p.inFlight = true
    worker.current?.postMessage(p.pending)
    p.pending = null
  }, [])
  const bygg = useCallback((v: View, detail: DetailKey) => {
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
   * so det gamle ikkje står i den nye fargen.
   */
  const skissePort = useRef<{ inFlight: boolean; pending: SkisseReq | null; shown: number; plan: Plan | null }>({ inFlight: false, pending: null, shown: 0, plan: null })
  const pumpSkisse = useCallback(() => {
    const p = skissePort.current
    if (p.inFlight || !p.pending) return
    p.inFlight = true
    worker.current?.postMessage(p.pending)
    p.pending = null
  }, [])
  const spørSkisse = useCallback((pl: Plan | null) => {
    const p = skissePort.current
    if ((pl?.id ?? null) !== (p.plan?.id ?? null)) setSnitt(null)
    p.plan = pl
    if (!pl) {
      p.pending = null
      return
    }
    p.pending = { kind: "skisse", id: ++reqId.current, params: naa.current, plan: pl }
    pumpSkisse()
  }, [pumpSkisse])
  /** skissa flytta seg i scena: punktet som brøk av boksen, og normalen som han er */
  const skisseEndra = useCallback((s: Skisse) => {
    const k = kroppRef.current
    if (k) spørSkisse({ id: 0, o: broek(s.o, k.min, k.max), n: s.n, strek: [] })
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
      setParams((p) => MOTOR.clamp({ ...obj, kjelde: KUBE }, p))
      if (obj.view === "lag" || obj.view === "kontur" || obj.view === "flate") setView(obj.view)
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
      setFeil("motoren stogga. last sida på nytt")
    }
    w.onmessage = (e: MessageEvent<Res>) => {
      const r = e.data
      if (r.kind === "build") {
        const p = portar.current[r.view]
        p.inFlight = false
        pump(r.view)
        if (r.id < p.shown) return
        p.shown = r.id
        ;(r.view === "flate" ? setKropp : r.view === "lag" ? setLag : setKontur)(r)
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
        // det same snittet om att — etter eit skjer ligg det nye planet i skissa — er inga endring, og skal ikkje teiknast om att
        const ny = JSON.stringify(syn)
        setSnitt((prev) => (prev && JSON.stringify(prev) === ny ? prev : syn))
        return
      }
      if (r.kind === "maal") {
        setTal(r)
        // fyrst når rekninga for det SISTE bygget er inne, er motoren ferdig
        if (r.id >= sisteBygg.current) setBusy(false)
        return
      }
      if (r.kind === "syn") {
        setSyn(r.svg)
        return
      }
      if (r.kind === "prosjekt") {
        // nettet OG innstillingane i eitt steg
        setHentar(false)
        setFeil(null)
        if (r.src) setNamn((m) => ({ ...m, [r.src!.id]: r.src!.label }))
        const kj = r.src ? r.src.id : KUBE
        setParams((p) => MOTOR.clamp({ ...r.params, kjelde: kj }, { ...p, kjelde: kj }))
        setVald(null)
        setMelding(r.src ? "prosjektet er ope" : "innstillingane er sette")
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
        // EIT NYTT NETT TEK PLANA OG FESTA MED SEG UT: båe er svar om den
        // kroppen du hadde. Den hugsa økta går fri — ho er skriven for dette nettet.
        const eiga = attende.current.delete(r.id)
        setParams((p) => (eiga ? { ...p, kjelde: r.src.id } : { ...p, kjelde: r.src.id, plan: "", fest: "" }))
        setVald(null)
        setFeil(null)
        setHentar(false)
        setHint("gest")
        window.clearTimeout(hintTimer.current)
        hintTimer.current = window.setTimeout(() => setHint(null), 7000)
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
        if (r.kva === "tune") {
          tunarRef.current = false
          setTunar(null)
        }
        setFeil(r.kva === "import" ? (r.kvifor ?? "las ikkje fila") : r.kva === "tune" ? "søket slo feil" : "uttaket slo feil")
        setHentar(false)
        setBusy(false)
        return
      }
      if (r.kind === "tunep") {
        setTunar({ gjort: r.gjort, av: r.av })
        return
      }
      if (r.kind === "tune") {
        tunarRef.current = false
        setTunar(null)
        setBusy(false)
        setForslag(r.alle)
        setSynt(r.alle.length ? 0 : null)
        if (!r.alle.length) setMelding("ingen sett held")
        return
      }
      void lastNed(r.text ? new Blob([r.text], { type: r.mime }) : new Blob([r.data as ArrayBuffer], { type: r.mime }), r.name)
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
    if (vald !== null) return spørSkisse(plan.find((q) => q.id === vald) ?? null)
    const s = skisse.current
    spørSkisse(s ? { id: 0, o: broek(s.o, kropp.min, kropp.max), n: s.n, strek: [] } : null)
  }, [mounted, kropp, vald, plan, params, spørSkisse])
  const harSnitt = !!snitt?.ringar.length

  const detail: DetailKey = fin ? "mid" : "lav"
  // Kroppen berre når kroppen endrar seg; delane kvar gong noko gjer det —
  // grovt med det same, fint når fingeren stoggar.
  const kk = kroppKey(params)
  useEffect(() => {
    if (mounted) bygg("flate", "lav")
  }, [kk, mounted, bygg])
  useEffect(() => {
    if (!mounted) return
    setBusy(true)
    setFeil(null)
    bygg("lag", "lav")
    if (view === "kontur") bygg("kontur", "lav")
    if (detail === "lav") return
    const t = window.setTimeout(() => {
      bygg("lag", detail)
      if (view === "kontur") bygg("kontur", detail)
    }, 300)
    return () => window.clearTimeout(t)
  }, [params, detail, view, mounted, bygg])

  // lenkja kodar alltid det som står på skjermen — bortsett frå nettet
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      const { kjelde: _k, ...rest } = params
      void _k
      window.history.replaceState(null, "", "#p=" + encodeURIComponent(JSON.stringify({ ...rest, view })))
    }, 500)
    return () => window.clearTimeout(t)
  }, [params, view, mounted])
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
    if (gest) return
    const t = window.setTimeout(() => {
      if (stodd.current === null || stodd.current === params) return
      fortid.current.push(stodd.current)
      if (fortid.current.length > ANGRE_DJUPN) fortid.current.shift()
      stodd.current = params
    }, 450)
    return () => window.clearTimeout(t)
  }, [params, mounted, gest])
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
    setHint(null)
    setParams(p)
  }, [])

  // --- GESTANE --------------------------------------------------------------
  /**
   * KLYPET OG VRIDINGA MÅLER FRÅ DER GESTEN BYRJA: fingrane som står tre
   * gonger so langt frå kvarandre skal gje eit objekt tre gonger so stort,
   * same kor mange hendingar som kom fram undervegs. Grunnstoda vert sett
   * når gesten melder seg og rydda når han sluttar.
   */
  const grunn = useRef<{ storleik: number; rotZ: number } | null>(null)
  const taGest = useCallback((kva: GestKva) => {
    const p = naa.current
    grunn.current = kva === null ? null : { storleik: typeof p.storleik === "number" ? p.storleik : 150, rotZ: typeof p.rotZ === "number" ? p.rotZ : 0 }
    setGest(kva)
    if (kva) setHint(null)
  }, [])
  const skalerObjektet = useCallback((total: number) => {
    if (!Number.isFinite(total) || total <= 0) return
    const g = grunn.current
    if (!g) return
    const r = PARAM_RANGES.storleik
    const v = Math.min(r.max, Math.max(r.min, Math.round((g.storleik * total) / r.step) * r.step))
    setParams((cur) => (cur.storleik === v ? cur : { ...cur, storleik: v }))
  }, [])
  /** vendinga: objektet snur seg på bordet, og plana fylgjer ikkje med. Ho går rundt: 181° er −179°. */
  const vendObjektet = useCallback((grader: number) => {
    if (!Number.isFinite(grader)) return
    const g = grunn.current
    if (!g) return
    setParams((cur) => {
      const v = ((((Math.round(g.rotZ + grader) + 180) % 360) + 360) % 360) - 180
      return cur.rotZ === v ? cur : { ...cur, rotZ: v }
    })
  }, [])
  /** brytaren mellom form og skisse, med lina som seier kva som gjeld no */
  const vekslModus = useCallback(() => {
    setModus((m) => (m === "form" ? "skisse" : "form"))
    setHint("gest")
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 4500)
  }, [])
  useEffect(() => () => window.clearTimeout(hintTimer.current), [])

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
      setMelding("planet råkar ikkje kroppen")
      return
    }
    setHint(null)
    const id = nyId(lesPlan(naa.current.plan))
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      if (l.length >= PLAN_TAK) return cur
      return { ...cur, plan: skrivPlan([...l, { id: nyId(l), o, n: s.n, strek: [] }]) }
    })
    setBlink(id)
  }, [])
  // skjer pulserer ÉIN gong: fyrste gongen skissa råkar kroppen er det noko å skjere
  const [puls, setPuls] = useState(false)
  const pulsa = useRef(false)
  useEffect(() => {
    if (!raakar || pulsa.current) return
    pulsa.current = true
    setPuls(true)
    const t = window.setTimeout(() => setPuls(false), 1200)
    return () => window.clearTimeout(t)
  }, [raakar])
  /**
   * RETTLEIINGA, ÉIN GONG: tre steg til det fyrste snittet, midt i det frie
   * bandet. Fyrste trykk kvar som helst tek henne bort — og trykket går
   * vidare til det det var meint for — og nettlesaren hugsar at ho er sett.
   */
  useEffect(() => {
    if (!mounted) return
    try {
      if (localStorage.getItem(COACH)) return
    } catch {
      // utan lager: syn henne, ho kostar eitt trykk
    }
    setCoach(true)
  }, [mounted])
  useEffect(() => {
    if (!coach) return
    const bort = () => {
      setCoach(false)
      try {
        localStorage.setItem(COACH, "1")
      } catch {
        // utan lager kjem ho att neste gong
      }
    }
    window.addEventListener("pointerdown", bort, { capture: true, once: true })
    return () => window.removeEventListener("pointerdown", bort, { capture: true })
  }, [coach])
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
  /** eit plan valt i scena eller lista; ein del valt på plata eller i kuttlista */
  const velPlan = useCallback((id: number | null) => {
    setVald(id)
    setPeikt(id === null ? null : (liste.find((k) => k.plan === id)?.adr ?? null))
  }, [liste])
  const askArk = useCallback((i: number) => send({ kind: "ark", id: ++reqId.current, params: naa.current, sheet: Math.max(0, i) }), [send])
  const velDel = useCallback((adr: string | null) => {
    setPeikt(adr)
    const k = adr ? liste.find((q) => q.adr === adr) : undefined
    setVald(k ? k.plan : null)
    // plata fylgjer den du vel
    if (k?.ark && verkty === "ark" && ark && ark.i !== k.ark - 1) askArk(k.ark - 1)
  }, [liste, verkty, ark, askArk])

  // --- FORSLAG -----------------------------------------------------------------
  /** eit søk: eit titals sett snitta for alvor og rangerte. Djupt på det lange trykket. */
  const finnForslag = useCallback((djup = false) => {
    if (tunarRef.current) return
    setHint(null)
    setVisForslag(true)
    setSteg((s) => (s === "line" ? "midt" : s))
    const base = tuneBase(naa.current)
    const cur = finn.current
    if (cur && cur.base === base && (cur.djup || !djup)) return
    finn.current = { base, djup }
    setForslag([])
    setSynt(null)
    setBusy(true)
    tunarRef.current = true
    setTunar({ gjort: 0, av: 0 })
    send({ kind: "tune", id: ++reqId.current, params: naa.current, djup })
  }, [send])
  const avbryt = useCallback(() => {
    if (tunarRef.current) send({ kind: "avbryt", id: ++reqId.current })
  }, [send])
  const taForslag = useCallback((i: number, legg: boolean) => {
    const k = forslag[i]
    if (!k) return
    setParams((cur) => {
      const ny = lesPlan(k.plan)
      if (!legg) return { ...cur, plan: skrivPlan(ny), fest: "" }
      const l = lesPlan(cur.plan)
      let id = nyId(l)
      return { ...cur, plan: skrivPlan([...l, ...ny.map((p) => ({ ...p, id: id++ }))].slice(0, PLAN_TAK)) }
    })
    setVisForslag(false)
    setSynt(null)
  }, [forslag])
  const spok = useMemo(() => (visForslag && synt !== null && forslag[synt] ? lesPlan(forslag[synt].plan) : null), [visForslag, synt, forslag])
  // ei liste for eit anna spørsmål er ikkje eit svar
  useEffect(() => {
    if (finn.current && finn.current.base !== tuneBase(params)) {
      finn.current = null
      setForslag([])
      setSynt(null)
    }
  }, [params])

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
      setFeil("fekk ikkje teikne platene")
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
    void navigator.clipboard?.writeText(url).then(() => setMelding("lenkja er kopiert")).catch(() => setMelding("fekk ikkje kopiere lenkja"))
  }, [])
  /** fila inn: lesen her, tolka i arbeidaren, bufferen overført og ikkje kopiert */
  const takeFile = useCallback(async (f: File) => {
    setHint(null)
    if (f.size > MAX_FIL) return setFeil("fila er for stor")
    setFeil(null)
    setBusy(true)
    setHentar(true)
    try {
      const buf = await f.arrayBuffer()
      // ned i basen FØR bufferen vert overført. Ei prosjektfil er eit oppsett, ikkje eit nett.
      if (!/\.zip$/i.test(f.name)) await lagre({ filnamn: f.name, nett: buf.slice(0) })
      send({ kind: "import", id: ++reqId.current, name: f.name, buf }, [buf])
    } catch {
      setFeil("fekk ikkje lese fila")
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
    if (id === "ark") askArk(0)
  }, [askArk, benk])
  // står plata open og noko flyttar seg, skal teikninga fylgje med
  useEffect(() => {
    if (verkty === "ark") askArk(ark?.i ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verkty, tal, askArk])
  useEffect(() => {
    if (!melding) return
    const t = window.setTimeout(() => setMelding(null), 4000)
    return () => window.clearTimeout(t)
  }, [melding])

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
        if (vald !== null) slett(vald)
      } else if (k === "z") (e.shiftKey ? gjerOm : angre)()
      else if (k === "s") vekslModus()
      else if (k === "f") finnForslag(false)
      else if (k === "d") finnForslag(true)
      else if (k === "1") setView("flate")
      else if (k === "2") setView("lag")
      else if (k === "3") setView("kontur")
      else if (k === "escape") {
        if (verkty) setVerkty(null)
        else if (visForslag) setVisForslag(false)
        else if (vald !== null) velPlan(null)
        else setSteg("line")
      } else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [angre, gjerOm, laas, slett, vald, finnForslag, verkty, visForslag, velPlan, vekslModus])

  /** ruta og kva som ligg over henne: kameraet rammar inn i det som er att */
  const skuffH = benk ? Math.round(vindu.h * 0.46) : 0
  const rute: Rute = useMemo(
    () => ({ W: vindu.w, H: vindu.h, venstre: 0, hogre: benk ? KOL : 0, topp: toppH, botn: benk ? (verkty ? skuffH : 0) : arkH }),
    [vindu, benk, verkty, skuffH, arkH, toppH],
  )
  const skuffRute: CSSProperties = benk
    ? { left: 0, right: KOL, bottom: 0, height: skuffH }
    : { left: 8, right: 8, top: toppH + 8, bottom: `calc(${LUKKA_ARK}px + env(safe-area-inset-bottom))` }
  /** kva gesten held på med, i tal: ein gest utan tal er ein gest du ikkje kan sikte med */
  const les = (k: string) => String(typeof params[k] === "number" ? Math.round(params[k] as number) : 0)
  const gestTekst = gest === "storleik" ? `${les("storleik")} mm` : gest === "vend" ? `${les("rotZ")}°` : gest
  const hintTekst = fin
    ? modus === "form"
      ? "form · dra snur · ⇧ dra flyttar snittet · ⌥ dra vrir det · ⌃ hjul = storleik · skjer"
      : "skisse · dra snur · ⇧ dra flyttar snittet · ⌥ dra vrir det · skjer"
    : modus === "form"
      ? "form · éin finger snur · to fingrar: knip = storleik, vri = vend, dra = flytt snittet · skjer"
      : "skisse · éin finger snur · to fingrar: dra = flytt, vri = tilt, knip = zoom · skjer"

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: "var(--paper)" }}>
      {/* fyrste gesten på objektet tek lina om gestane bort */}
      <div className="absolute inset-0" onPointerDownCapture={() => setHint(null)}>
        {mounted && (
          <Scene
            kropp={kropp}
            lag={lag}
            kontur={kontur}
            view={view}
            modus={modus}
            material={String(params.material ?? "finer")}
            rute={rute}
            liste={liste}
            plan={plan}
            vald={vald}
            spok={spok}
            snitt={snitt}
            blink={blink}
            skisse={skisse}
            onVald={velPlan}
            onPlan={flyttPlan}
            onSkala={skalerObjektet}
            onVend={vendObjektet}
            onGest={taGest}
            onRaakar={setRaakar}
            onSkisse={skisseEndra}
          />
        )}
      </div>

      <Toppline benk={benk} kjelde={kjeldeNamn} view={view} onView={setView} onFile={(f) => void takeFile(f)} onAngre={angre} kanAngre={kanAngre} onGjerOm={gjerOm} kanGjerOm={kanGjerOm} onShare={share} onHogd={setToppH} />

      {/* kva fingrane gjer, i tal, so lenge dei er nede: øvst til høgre i det frie bandet */}
      {gestTekst && (
        <div className="pointer-events-none absolute flex justify-end" style={{ top: toppH + 10, right: (benk ? KOL : 0) + 14 }} aria-hidden="true">
          <span className="tab text-[26px] leading-none tracking-[0.02em]" style={{ opacity: 0.5 }}>{gestTekst}</span>
        </div>
      )}

      {/*
        TOMMELSPALTA. Skjer står der høgre tommelen alt er: nedst til høgre,
        over arket, 64 pikslar. Med eit plan valt er skissa gøymd, og knappen
        er «ferdig» og slepp valet. Over han: skissebrytaren, og slett når
        eit plan er valt. Ikon, aldri ord. Prikken i hjørnet er motoren som
        reknar. På benken står spalta nedst i lerretet, ved kolonna.
      */}
      {mounted && (
        <div className="tumme" style={{ right: (benk ? KOL : 0) + 16, bottom: benk ? rute.botn + 16 : `calc(${arkH}px + env(safe-area-inset-bottom) + 4px)` }}>
          {vald !== null && (
            <button type="button" aria-label="slett" title="ta det valde planet bort (⌫)" onClick={() => slett(vald)} className={TUMME_BTN} style={{ ...HAIR, background: "var(--paper)", color: "var(--warn)" }}>
              {IcoSlett}
            </button>
          )}
          {/* SKISSEMODUSEN: to fingrar arbeider på planet — dra flyttar, vri
              vinklar, klyp zoomar. Av er «form»: klyp storleiken, vri vendinga. */}
          <button
            type="button"
            aria-pressed={modus === "skisse"}
            aria-label="skisse"
            title={modus === "skisse" ? "skissemodus (S): to fingrar dreg, vrir og zoomar snittet. trykk for form" : "form (S): to fingrar klyp storleiken, vrir vendinga, dreg snittet. trykk for skisse"}
            onClick={vekslModus}
            className={TUMME_BTN}
            style={{ ...chipStyle(modus === "skisse"), background: modus === "skisse" ? "var(--ink)" : "var(--paper)" }}
          >
            {IcoSkisse}
          </button>
          <button
            type="button"
            onClick={vald === null ? laas : () => velPlan(null)}
            disabled={view === "kontur" || (vald === null && !harSnitt)}
            aria-label={vald === null ? "skjer" : "ferdig"}
            title={vald === null ? "skjer: skissa vert ein del (L)" : "ferdig med planet (esc)"}
            className={"skjer" + (puls ? " puls" : "")}
            style={{ background: "var(--ink)", color: "var(--paper)" }}
          >
            {vald === null ? IcoSkjer : IcoFerdig}
            <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "var(--paper)", boxShadow: "0 0 0 1.5px var(--ink)", opacity: busy && !tunar ? 1 : 0, transition: "opacity 200ms ease" }} />
          </button>
        </div>
      )}

      {/* rettleiinga: tre steg, éin gong */}
      {coach && !drag && (
        <div role="note" aria-label="slik skjer du" className="coach fade-inn pointer-events-none absolute" style={{ left: 0, right: benk ? KOL : 0, top: toppH, bottom: benk ? 0 : arkH }}>
          <div className="coach-kort">
            {([["1", IcoSnu, "snu"], ["2", IcoSikt, "sikt"], ["3", IcoSkjer, "skjer"]] as const).map(([n, g, ord]) => (
              <span key={ord} className="coach-steg"><b>{n}</b>{g}<span>{ord}</span></span>
            ))}
          </div>
        </div>
      )}

      {/* Éi line om gestane, med modusen fremst. Ho går på fyrste gesten. Til venstre for tommelspalta. */}
      {hint && !drag && (
        <div className="pointer-events-none absolute flex justify-center px-4" style={{ left: 0, bottom: (benk ? 0 : arkH) + 24, right: benk ? KOL : 92 }} aria-hidden="true">
          <span className="fade-inn rounded-full px-3 py-1.5 text-center text-[10px] uppercase tracking-[0.16em]" style={{ background: "color-mix(in srgb, var(--paper) 85%, transparent)", opacity: 0.85 }}>
            {hintTekst}
          </span>
        </div>
      )}
      {drag && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--paper) 82%, transparent)" }}>
          <div className="rounded-2xl border border-dashed px-6 py-4 text-[11px] uppercase tracking-[0.2em]" style={{ borderColor: "var(--ink)" }}>slepp nettet</div>
        </div>
      )}

      <Skuff
        open={verkty}
        rute={skuffRute}
        liste={liste}
        ark={ark}
        params={params}
        clamp={(o, prev) => MOTOR.clamp(o, prev)}
        peikt={peikt}
        onPeik={velDel}
        onArk={askArk}
        onChange={endre}
        onBytt={opneVerkty}
        onClose={() => setVerkty(null)}
        onOrd={(t) => void navigator.clipboard?.writeText(t).then(() => setMelding("kuttlista er kopiert")).catch(() => setMelding("fekk ikkje kopiere"))}
      />

      <Arket
        benk={benk}
        steg={steg}
        onSteg={setSteg}
        params={params}
        onChange={endre}
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
        tunar={tunar}
        forslag={forslag}
        visForslag={visForslag}
        onVisForslag={setVisForslag}
        synt={synt}
        onSyn={setSynt}
        onTaAlle={(i) => taForslag(i, false)}
        onLeggTil={(i) => taForslag(i, true)}
        onFinn={() => finnForslag(false)}
        onFinnDjup={() => finnForslag(true)}
        onAvbryt={avbryt}
        syn={syn}
        onExport={doExport}
        onReset={() => endre({ ...MOTOR.defaults, kjelde: params.kjelde })}
        verkty={verkty}
        onVerkty={opneVerkty}
        onHogd={setArkH}
      />
    </main>
  )
}
