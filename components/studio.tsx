"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { ArkSyn, ExportKind, DetailKey, ParamBag, Vec3, View } from "@/lib/core"
import { KUBE } from "@/lib/sources"
import { hent, lagre } from "@/lib/lagring"
import { zip } from "@/lib/zip"
import { MOTOR } from "@/lib/motor"
import { PLAN_TAK, broek, lesPlan, nyId, skrivPlan } from "@/lib/plan"
import { lesFest, skrivFest } from "@/lib/params"
import type { Kandidat } from "@/lib/forslag"
import type { Rute } from "@/lib/ramme"
import type { ArkRes, BuildRes, MaalRes, Req, Res } from "@/lib/worker"
import { Scene, type Skisse } from "./scene"
import { Arket, KOL, type Steg } from "./arket"
import { Skuff, type VerktyId } from "./verkty"

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
  const [hint, setHint] = useState<"fil" | "gest" | null>("fil")
  const [drag, setDrag] = useState(false)
  const [arkH, setArkH] = useState(0)
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
        if (!matchMedia("(pointer: coarse)").matches) return
        setHint("gest")
        window.setTimeout(() => setHint(null), 7000)
        return
      }
      if (r.kind === "feil") {
        if (r.kva === "build" && r.view) {
          portar.current[r.view].inFlight = false
          pump(r.view)
          if (r.id >= sisteBygg.current) setBusy(false)
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
  }, [pump])

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
  // og økta hugsar seg sjølv, når tala har fått stå
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      const { kjelde: _k, ...rest } = params
      void _k
      void lagre({ params: rest as Record<string, number | string> })
    }, 900)
    return () => window.clearTimeout(t)
  }, [params, mounted])

  /**
   * ANGRE. Eit drag er hundre punkt og éi endring: eit punkt vert fyrst
   * bokført når det har fått stå i ein knapp sekund.
   */
  const fortid = useRef<ParamBag[]>([])
  const stodd = useRef<ParamBag | null>(null)
  const [kanAngre, setKanAngre] = useState(false)
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
    setKanAngre(true)
    const t = window.setTimeout(() => {
      if (stodd.current === null || stodd.current === params) return
      fortid.current.push(stodd.current)
      if (fortid.current.length > ANGRE_DJUPN) fortid.current.shift()
      stodd.current = params
    }, 450)
    return () => window.clearTimeout(t)
  }, [params, mounted])
  const angre = useCallback(() => {
    const no = naa.current
    const mal = stodd.current !== null && stodd.current !== no ? stodd.current : fortid.current.pop()
    if (!mal) return
    stodd.current = mal
    setKanAngre(fortid.current.length > 0)
    setParams(mal)
  }, [])

  const endre = useCallback((p: ParamBag) => {
    setHint(null)
    setParams(p)
  }, [])

  // --- PLANA -----------------------------------------------------------------
  /**
   * LÅS: skissa vert ein del. Punktet vert brøk av boksen kring kroppen, so
   * planet står på kroppen når storleiken endrar seg. Skissa står der ho
   * står, so du kan snu synet og låse att.
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
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      if (l.length >= PLAN_TAK) return cur
      return { ...cur, plan: skrivPlan([...l, { id: nyId(l), o, n: s.n, strek: [] }]) }
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
        return angre()
      }
      if (e.metaKey || e.ctrlKey) return
      // same som knappen: med eit plan valt er skissa gøymd, og L slepp valet
      if (k === "l") {
        if (vald === null) laas()
        else velPlan(null)
      } else if (k === "delete" || k === "backspace") {
        if (vald !== null) slett(vald)
      } else if (k === "z") angre()
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
      setHint(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [angre, laas, slett, vald, finnForslag, verkty, visForslag, velPlan])

  /** ruta og kva som ligg over henne: kameraet rammar inn i det som er att */
  const skuffH = benk ? Math.round(vindu.h * 0.46) : 0
  const rute: Rute = useMemo(
    () => ({ W: vindu.w, H: vindu.h, venstre: 0, hogre: benk ? KOL : 0, topp: 0, botn: benk ? (verkty ? skuffH : 0) : arkH }),
    [vindu, benk, verkty, skuffH, arkH],
  )
  const skuffRute: CSSProperties = benk
    ? { left: 0, right: KOL, bottom: 0, height: skuffH }
    : { left: 8, right: 8, top: 52, bottom: `calc(${LUKKA_ARK}px + env(safe-area-inset-bottom))` }

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: "var(--paper)" }}>
      <div className="absolute inset-0">
        {mounted && (
          <Scene
            kropp={kropp}
            lag={lag}
            kontur={kontur}
            view={view}
            material={String(params.material ?? "finer")}
            rute={rute}
            liste={liste}
            plan={plan}
            vald={vald}
            spok={spok}
            skisse={skisse}
            onVald={velPlan}
            onPlan={flyttPlan}
          />
        )}
      </div>

      {!benk && (
        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 pt-[calc(env(safe-area-inset-top)+16px)]">
          <span className="tab text-[11px] tracking-[0.14em]">slicerman</span>
          <a href="https://iverfinne.no" target="_blank" rel="noopener noreferrer" className="pointer-events-auto text-[11px] tracking-wide opacity-60 hover:opacity-100">
            iverfinne.no
          </a>
        </header>
      )}

      {/* Éi line, to gonger i ei økt: at fila kan sleppast, og so kva to fingrar gjer. */}
      {hint && !drag && (hint === "gest" || kjelde === KUBE) && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-6" style={{ bottom: (benk ? 0 : arkH) + 24 }} aria-hidden="true">
          <span className="fade-inn text-center text-[10px] uppercase tracking-[0.2em]" style={{ opacity: 0.6 }}>
            {hint === "gest" ? "to fingrar: dra lina, vri henne, klyp" : "slepp ei fil kvar som helst"}
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
        onSteg={(s) => {
          setHint(null)
          setSteg(s)
        }}
        params={params}
        onChange={endre}
        kjelde={kjeldeNamn}
        view={view}
        onView={setView}
        metrics={tal?.metrics ?? null}
        rules={tal?.rules ?? []}
        liste={liste}
        plan={plan}
        vald={vald}
        onVald={velPlan}
        onSlett={slett}
        onLaas={laas}
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
        onShare={share}
        onFile={(f) => void takeFile(f)}
        onReset={() => endre({ ...MOTOR.defaults, kjelde: params.kjelde })}
        onAngre={angre}
        kanAngre={kanAngre}
        verkty={verkty}
        onVerkty={opneVerkty}
        onHogd={setArkH}
      />
    </main>
  )
}
