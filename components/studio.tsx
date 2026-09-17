"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { bbox, shoelace, type ArkSyn, type ExportKind, type DetailKey, type ParamBag, type Pt, type Rom, type Vec3, type View } from "@/lib/core"
import { erPrimitiv, KUBE } from "@/lib/sources"
import { alleNett, gløymGamaltNett, hent, hentNett, lagre, lagreNett, ryddNett } from "@/lib/lagring"
import { unzip, zip } from "@/lib/zip"
import { MOTOR } from "@/lib/motor"
import { BOG_TAK, MJUK_TAK, OMRISS_TAK, PLAN_ROM, PLAN_TAK, broek, dot, iGruppa, lesPlan, nyGruppe, nyId, omrissLine, ramme as planRamme, formPunkt, FORM_SLAG, rutenett, sameSnitt, skilRute, skuvKopi, slaaSaman, spegla, speglingar, skrivPlan, sub3, type FormSlag, type Plan, type Strek } from "@/lib/plan"
import { lukkTeikning, mjukePunkt } from "@/lib/teikning"
import { medGruppa, nesteSteg, rundt } from "@/lib/gruppe"
import { simplify, type Pt2 } from "@/lib/contour"
import { speglPar, speglPlan } from "@/lib/spegl"
import { byggKey, lesDeling, lesFest, skrivDeling, skrivFest, SNAPPSTEG, SNAPP_NAMN } from "@/lib/params"
import { BIT_MAX, BIT_MIN, eiKjelde, erFilform, familien, fyrsteForm, lesScene, nesteForm, skrivScene, SCENE_TAK, type Bit } from "@/lib/scene"
import type { Rute } from "@/lib/ramme"
import type { SkisseSyn } from "@/lib/snitt"
import type { ArkRes, BuildRes, MaalRes, Req, Res, SkisseReq } from "@/lib/worker"
import type { Montasje } from "@/lib/montasje"
import { Scene, snittMidt, type GestKva, type Modus, type Skisse } from "./scene"
import { Arket, KOL, type Steg } from "./arket"
import { Meny, type MenyStad } from "./meny"
import { CHIP, chipStyle, DOBBELT_MS, HAIR, ORD, VIEWS, IcoBit, IcoBoy, IcoDupliser, IcoForm, IcoHol, IcoMontasje, IcoRute, IcoSkjer, IcoSlett, IcoTeikn } from "./deler"
import { Plater } from "./plater"
import { BileteInn, lesBilete } from "./bilete"
import { Vektor } from "./vektor"
import { skalerForm, type BileteForm, type Maske } from "@/lib/bilete"
import { Skuff, type VerktyId } from "./verkty"
import { Toppline } from "./toppline"

const storleikAv = (p: ParamBag) => (typeof p.storleik === "number" && p.storleik > 0 ? p.storleik : 150)
const OMRISS_ROM = 4
const klemPunkt = (q: Pt): Pt => [+Math.min(OMRISS_ROM, Math.max(-OMRISS_ROM, q[0])).toFixed(4), +Math.min(OMRISS_ROM, Math.max(-OMRISS_ROM, q[1])).toFixed(4)]
const skiftRunde = (r: readonly number[] | undefined, f: (i: number) => number | null) =>
  r?.length ? { runde: r.map(f).filter((i): i is number => i !== null) } : {}
function stoersteRing(sn: SkisseSyn | null): Pt[] | null {
  const ringar = sn?.raa?.length ? sn.raa : sn?.ringar
  if (!ringar?.length) return null
  let stor = ringar[0]
  for (const q of ringar) if (Math.abs(shoelace(q)) > Math.abs(shoelace(stor))) stor = q
  return stor.length >= 3 ? stor : null
}

const MAX_FIL = 220 * 1024 * 1024
const ANGRE_DJUPN = 50
const LUKKA_ARK = 84
const TUMME_BTN = "hit ikon relative flex h-12 w-12 items-center justify-center"
const stoy = (id: number): number => {
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return (((h ^ (h >>> 16)) >>> 0) / 0xffffffff) * 2 - 1
}
const RUTE_STEG = 44
const klemBit = (v: number) => Math.min(BIT_MAX, Math.max(BIT_MIN, v))
const BOY_STEG = 0.005
const MONT_STEG_PX = 160
const SOV_MS = 2000
const kroppKey = (p: ParamBag) => [p.kjelde, p.scene, p.storleik, p.rotX, p.rotY, p.rotZ, p.glatt, p.trekant].join("|")
const stamme = (label: string) =>
  ("slicer-" + label).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase().slice(0, 48)

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

const INGEN: readonly number[] = []
const [MOBEL_STORLEIK, MOBEL_TJUKN, MOBEL_ARK] = [450, 12, [1200, 600] as const]
export function Studio() {
  const [params, setParams] = useState<ParamBag>(() => ({ ...MOTOR.defaults }))
  const [view, setView] = useState<View>("lag")
  const viewRef = useRef<View>("lag")
  viewRef.current = view
  const rom = view === "flate" || view === "lag"
  const romsyn = useRef<Rom>("lag")
  if (rom) romsyn.current = view
  const foer = useRef<View>("lag")
  if (view !== "montasje") foer.current = view
  const [skal, setSkal] = useState(true)
  const formLasta = useRef(new Set<string>())
  const formSvar = useRef(new Set<number>())
  const [formTal, setFormTal] = useState(0)
  const [kropp, setKropp] = useState<BuildRes | null>(null)
  const [lag, setLag] = useState<BuildRes | null>(null)
  const [tal, setTal] = useState<MaalRes | null>(null)
  const [ark, setArk] = useState<ArkSyn | null>(null)
  const [vald, setVald] = useState<number | null>(null)
  const [valdStrek, setValdStrek] = useState<number | null>(null)
  const [valdGruppe, setValdGruppe] = useState<number | null>(null)
  const [fordel, setFordel] = useState(false)
  const gruppeNo = useRef<{ g: number | null; fordel: boolean }>({ g: null, fordel: false })
  gruppeNo.current = { g: valdGruppe, fordel }
  const valdRef = useRef<number | null>(null)
  valdRef.current = vald
  const [valdPunkt, setValdPunkt] = useState<number | null>(null)
  useEffect(() => setValdPunkt(null), [vald])
  const [valdBit, setValdBit] = useState<number | null>(null)
  const bitRef = useRef<number | null>(null)
  bitRef.current = valdBit
  const [skrubbar, setSkrubbar] = useState(false)
  const [peikt, setPeikt] = useState<string | null>(null)
  const [steg, setSteg] = useState<Steg>("line")
  const [verkty, setVerkty] = useState<VerktyId | null>(null)
  const [ruteTal, setRuteTal] = useState<[number, number] | null>(null)
  const [mont, setMont] = useState<Montasje | null>(null)
  const [montVald, setMontVald] = useState<string | null>(null)
  useEffect(() => setMontVald(null), [mont])
  const montT = useRef(0)
  const montSpel = useRef(false)
  const [montSteg, setMontSteg] = useState(1)
  const montDra = useRef<number | null>(null)
  const montNed = useRef<{ id: number; y: number } | null>(null)
  const montVakn = useRef<(() => void) | null>(null)
  const [busy, setBusy] = useState(true)
  const [feil, setFeil] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [hentar, setHentar] = useState(false)
  const [drag, setDrag] = useState(false)
  const [arkH, setArkH] = useState(0)
  const [toppH, setToppH] = useState(44)
  const [kubeBotn, setKubeBotn] = useState(0)
  const [modus, setModus] = useState<Modus>("form")
  const [virr, setVirr] = useState(0)
  const [speil, setSpeil] = useState(0)
  const [gest, setGest] = useState<GestKva>(null)
  const [snitt, setSnitt] = useState<SkisseSyn | null>(null)
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
  const bytar = useRef(new Map<number, { namn: string; buf: ArrayBuffer }>())
  const gamaltNett = useRef(false)
  const bytSvar = useRef(new Map<number, number>())
  const arkVent = useRef(new Map<number, (r: ArkRes) => void>())
  const skisse = useRef<Skisse | null>(null)
  const kroppRef = useRef<BuildRes | null>(null)
  kroppRef.current = kropp
  const snittRef = useRef<SkisseSyn | null>(null)
  snittRef.current = snitt
  const kjelde = String(params.kjelde ?? KUBE)
  const kjeldeNamn = kjelde === KUBE ? "kube" : (namn[kjelde] ?? "nett")
  const bitar = useMemo(() => lesScene(String(params.scene || "") || eiKjelde(kjelde)), [params.scene, kjelde])
  const plan = useMemo(() => lesPlan(params.plan), [params.plan])
  const liste = useMemo(() => tal?.liste ?? [], [tal])

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
  const skisseEndra = useCallback((s: Skisse) => {
    const k = kroppRef.current
    if (k) spørSkisse({ id: 0, o: broek(s.o, k.min, k.max), n: s.n, bog: 0, strek: [] })
  }, [spørSkisse])

  useEffect(() => {
    let her = true
    const hentInn = (obj: Record<string, unknown>) => {
      const kj = typeof obj.kjelde === "string" ? obj.kjelde : KUBE
      const idar = [...new Set([kj, ...lesScene(obj.scene).map((b) => b.id)])].filter((id) => !erPrimitiv(id) && !erFilform(id))
      if (!idar.length) return
      setHentar(true)
      void hentNett(idar).then((funne) => {
        for (const v of funne) {
          const id = ++reqId.current
          formSvar.current.add(id)
          setNamn((m) => ({ ...m, [v.id]: v.label }))
          send({ kind: "import", id, name: v.label, buf: v.bytes, som: v.id, etikett: v.label }, [v.bytes])
        }
        if (funne.length === idar.length) return setHentar(false)
        void hent().then((g) => {
          if (!g?.nett) {
            setHentar(false)
            setMelding(funne.length ? "eitt nett mangla" : "fann ikkje nettet")
            return
          }
          const id = ++reqId.current
          formSvar.current.add(id)
          gamaltNett.current = true
          bytar.current.set(id, { namn: g.filnamn ?? "nett.stl", buf: g.nett.slice(0) })
          send({ kind: "import", id, name: g.filnamn ?? "nett.stl", buf: g.nett, som: idar.find((q) => !funne.some((f) => f.id === q)), etikett: g.filnamn ?? "nett" }, [g.nett])
        })
      })
    }
    const les = async () => {
      try {
        const h = window.location.hash.slice(1)
        if (!h.startsWith("p=")) {
          const v = await hent()
          if (!her || !v) return
          setParams((q) => MOTOR.clamp(v.params, q))
          if (VIEWS.some((q) => q.id === v.view)) setView(v.view!)
          if (typeof v.skal === "boolean") setSkal(v.skal)
          hentInn(v.params)
          return
        }
        const obj = JSON.parse(decodeURIComponent(h.slice(2))) as Record<string, unknown>
        setParams((p) => MOTOR.clamp(obj, p))
        if (VIEWS.some((v) => v.id === obj.view)) setView(obj.view as View)
        if (typeof obj.skal === "boolean") setSkal(obj.skal)
        hentInn(obj)
      } catch {
      } finally {
        if (her) setMounted(true)
      }
    }
    void les()
    return () => { her = false }
  }, [send])

  useEffect(() => {
    const w = new Worker(new URL("../lib/worker.ts", import.meta.url), { type: "module" })
    worker.current = w
    for (const p of Object.values(portar.current)) {
      p.inFlight = false
      p.pending = null
    }
    skissePort.current.inFlight = false
    skissePort.current.pending = null
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
        setSnitt((prev) => (prev && prev.nokkel === syn.nokkel ? prev : syn))
        return
      }
      if (r.kind === "maal") {
        setTal(r)
        if (r.id >= sisteBygg.current) setBusy(false)
        return
      }
      if (r.kind === "prosjekt") {
        setRammInn((n) => n + 1)
        setHentar(false)
        setFeil(null)
        if (r.src) setNamn((m) => ({ ...m, [r.src!.id]: r.src!.label }))
        const kj = r.src ? r.src.id : KUBE
        setParams((p) => MOTOR.clamp({ ...r.params, kjelde: kj }, { ...p, kjelde: kj }))
        setVald(null)
        setMelding(r.src ? "prosjekt ope" : "oppsett sett")
        const bs = bytar.current.get(r.id)
        bytar.current.delete(r.id)
        if (bs) {
          try {
            for (const f of unzip(bs.buf)) {
              const m = /^nett\/([a-z0-9_-]{1,40})__(.*)$/i.exec(f.name)
              if (!m || !f.data.byteLength) continue
              void lagreNett(m[1], m[2], f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer)
            }
          } catch {
          }
        }
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
      if (r.kind === "fiksalt") {
        setBusy(false)
        if (!r.fiksa.length) {
          setMelding(r.att.length ? `ingen råd å trykkje — ${r.att.join(", ")} står att` : "ingenting å rette")
          return
        }
        endre(r.params)
        setMelding(r.att.length ? `${r.fiksa.length} retta — ${r.att.join(", ")} står att` : `${r.fiksa.length} retta`)
        return
      }

      if (r.kind === "montasje") {
        if (viewRef.current !== "montasje") return
        const { kind, id, ...m } = r
        void kind
        void id
        montT.current = 0
        montSpel.current = true
        setMontSteg(1)
        setMont(m)
        return
      }
      if (r.kind === "kjelde") {
        setNamn((m) => ({ ...m, [r.src.id]: r.src.label }))
        if (!erFilform(r.src.id)) setRammInn((n) => n + 1)
        const bs = bytar.current.get(r.id)
        bytar.current.delete(r.id)
        if (bs) {
          void lagreNett(r.src.id, r.src.label, bs.buf).then((ok) => {
            if (!ok) setMelding("for stort å hugse — lagre prosjektfila")
            else lesBibliotek()
          })
        }
        if (gamaltNett.current) {
          gamaltNett.current = false
          void gløymGamaltNett()
        }
        if (formSvar.current.delete(r.id)) {
          setFormTal((n) => n + 1)
          setHentar(false)
          const vent = leggEtter.current
          if (vent && r.src.id === vent) {
            leggEtter.current = null
            leggBit(vent)
          }
          return
        }
        const byt = bytSvar.current.get(r.id)
        bytSvar.current.delete(r.id)
        if (byt !== undefined) {
          setParams((p) => {
            const l = lesScene(String(p.scene || "") || eiKjelde(String(p.kjelde ?? KUBE)))
            if (!l[byt]) return p
            l[byt] = { ...l[byt], id: r.src.id }
            return { ...p, scene: skrivScene(l) }
          })
          setFeil(null)
          setHentar(false)
          return
        }
        setParams((p) => ({ ...p, kjelde: r.src.id, scene: "", plan: "", fest: "" }))
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
          skissePort.current.inFlight = false
          pumpSkisse()
          return
        }
        bytar.current.delete(r.id)
        setFeil(r.kva === "import" ? (r.kvifor ?? "ulesbar fil") : "uttak feila")
        setHentar(false)
        setBusy(false)
        return
      }
      void lastNed(r.text ? new Blob([r.text], { type: r.mime }) : new Blob([r.data as ArrayBuffer], { type: r.mime }), r.name)
      if (r.merknad) setMelding(r.merknad)
      setBusy(false)
    }
    return () => {
      w.terminate()
      worker.current = null
    }
  }, [pump, pumpSkisse])

  useEffect(() => {
    if (!mounted || !kropp) return
    if (modus === "bit") return spørSkisse(null)
    if (!rom) return spørSkisse(null)
    if (vald !== null) return spørSkisse(plan.find((q) => q.id === vald) ?? null)
    const s = skisse.current
    spørSkisse(s ? { id: 0, o: broek(s.o, kropp.min, kropp.max), n: s.n, bog: 0, strek: [] } : null)
  }, [mounted, kropp, vald, plan, params, modus, rom, spørSkisse])
  const harSnitt = !!snitt?.ringar.length

  const detail: DetailKey = "mid"
  const kk = kroppKey(params)
  useEffect(() => {
    if (mounted) bygg("flate", "lav")
  }, [kk, mounted, formTal, bygg])
  useEffect(() => {
    if (!mounted) return
    setBusy(true)
    setFeil(null)
    bygg("lag", detail)
  }, [params, detail, view, mounted, formTal, bygg])

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
          formLasta.current.delete(id)
          setHentar(false)
          setFeil("fekk ikkje forma")
        })
    }
  }, [params.kjelde, bitar, mounted, send])

  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      window.history.replaceState(null, "", "#p=" + encodeURIComponent(JSON.stringify({ ...params, view, skal })))
    }, 500)
    return () => window.clearTimeout(t)
  }, [params, view, skal, mounted])
  const skrivOkta = useCallback(() => {
    void lagre(naa.current as Record<string, number | string>, { view, skal })
  }, [view, skal])
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      const idar = [String(params.kjelde ?? ""), ...bitar.map((b) => b.id)].filter((id) => id && !erPrimitiv(id) && !erFilform(id))
      void ryddNett(idar)
    }, 1500)
    return () => window.clearTimeout(t)
  }, [params.kjelde, bitar, mounted])
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

  const fortid = useRef<ParamBag[]>([])
  const framtid = useRef<ParamBag[]>([])
  const stodd = useRef<ParamBag | null>(null)
  const [kanAngre, setKanAngre] = useState(false)
  const [kanGjerOm, setKanGjerOm] = useState(false)
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

  const leggBit = useCallback((val: string) => {
    const byt = bitRef.current
    if (byt === null && lesScene(String(naa.current.scene || "") || eiKjelde(String(naa.current.kjelde ?? KUBE))).length >= SCENE_TAK) {
      setMelding(`taket er ${SCENE_TAK} bitar`)
      return
    }
    setParams((cur) => {
      const l = lesScene(String(cur.scene || "") || eiKjelde(String(cur.kjelde ?? KUBE)))
      if (byt !== null) {
        const no = l[byt]
        if (!no) return cur
        const id = familien(no.id) === val ? nesteForm(no.id) : fyrsteForm(val)
        if (id === no.id) return cur
        l[byt] = { ...no, id }
        return { ...cur, scene: skrivScene(l) }
      }
      if (l.length >= SCENE_TAK) return cur
      const ny = [...l, { id: fyrsteForm(val), t: [0, 0, 0] as Vec3, s: [1, 1, 1] as Vec3, rz: 0 }]
      const steg = Math.min(85, 760 / Math.max(1, ny.length - 1))
      const midt = (steg * (ny.length - 1)) / 2
      return { ...cur, scene: skrivScene(ny.map((b, i) => ({ ...b, t: [+(i * steg - midt).toFixed(2), b.t[1], b.t[2]] as Vec3 }))) }
    })
  }, [])
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
  const skalerBit = useCallback((faktor: number) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    if (!g || i === null || !Number.isFinite(faktor) || faktor <= 0) return
    skrivBit(i, { s: g.s.map((c) => klemBit(c * faktor)) as Vec3 })
  }, [skrivBit])
  const sideBit = useCallback((akse: 0 | 1 | 2, faktor: number) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    if (!g || i === null || !Number.isFinite(faktor) || faktor <= 0) return
    const s2 = [...g.s] as Vec3
    s2[akse] = klemBit(g.s[akse] * faktor)
    skrivBit(i, { s: s2 })
  }, [skrivBit])
  const fargBit = useCallback((farge: number) => {
    const i = bitRef.current
    if (i === null) return
    skrivBit(i, { farge: farge || undefined })
  }, [skrivBit])
  const vriBit = useCallback((grader: number) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    if (!g || i === null || !Number.isFinite(grader)) return
    skrivBit(i, { rz: (((g.rz + grader) % 360) + 360) % 360 })
  }, [skrivBit])
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

  const tomScene = useCallback(() => {
    setParams((cur) => ({ ...cur, scene: "" }))
    setRammInn((n) => n + 1)
  }, [])

  const grunn = useRef<{ bit: Bit | null } | null>(null)
  const taGest = useCallback((kva: GestKva) => {
    const p = naa.current
    const i = bitRef.current
    const l = i === null ? [] : lesScene(String(p.scene || "") || eiKjelde(String(p.kjelde ?? KUBE)))
    grunn.current = kva === null ? null : { bit: i === null ? null : (l[i] ?? null) }
    if (kva === "rute") {
      const r = skilRute(lesPlan(p.plan))
      rutGrunn.current = [r.nx, r.ny]
    }
    if (kva === null) setRuteTal(null)
    setGest(kva)
  }, [])
  const vekslRute = useCallback(() => {
    setModus((m) => (m === "rute" ? "form" : "rute"))
    setValdBit(null)
    setVald(null)
  }, [])
  const hopBrot = (tal?.rules ?? []).filter((r) => (r.id === "orden" || r.id === "klem") && !r.ok)
  const gaarIHop = useRef(true)
  gaarIHop.current = hopBrot.length === 0
  useEffect(() => {
    if (!gaarIHop.current && view === "montasje") setView(foer.current)
  }, [view, hopBrot.length])

  const vekslMontasje = useCallback(() => {
    if (!gaarIHop.current) return
    setView((v) => (v === "montasje" ? foer.current : "montasje"))
  }, [])
  const vekslBit = useCallback(() => {
    setModus((m) => (m === "bit" ? "form" : "bit"))
    setValdBit(null)
    setVald(null)
  }, [])

  const laas = useCallback(() => {
    const s = skisse.current
    const k = kroppRef.current
    if (!s || !k) return
    const o = broek(s.o, k.min, k.max)
    if (o.some((c) => c < -PLAN_ROM || c > 1 + PLAN_ROM)) {
      setMelding("for langt ute")
      return
    }
    const naaPlan = lesPlan(naa.current.plan)
    if (naaPlan.length >= PLAN_TAK) {
      setMelding(`taket er ${PLAN_TAK} plan`)
      return
    }
    const nye: { o: Vec3; n: Vec3 }[] = []
    for (const akser of speglingar(speil)) {
      let q = { o, n: s.n }
      for (const a of akser) q = spegla(q.o, q.n, a)
      if (!nye.some((r) => sameSnitt(r, q))) nye.push(q)
    }
    const tek = nye.slice(0, PLAN_TAK - naaPlan.length)
    if (tek.length < nye.length) setMelding(`taket er ${PLAN_TAK} plan`)
    const id = nyId(naaPlan)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      if (l.length >= PLAN_TAK) return cur
      let i = nyId(l)
      const gruppe = tek.length > 1 ? nyGruppe(l) : 0
      return { ...cur, plan: skrivPlan([...l, ...tek.map((q) => ({ id: i++, o: q.o, n: q.n, bog: 0, strek: [], ...(gruppe ? { gruppe } : {}) }))].slice(0, PLAN_TAK)) }
    })
    setBlink(id)
  }, [speil])
  const [teikn, setTeikn] = useState(false)
  const [teiknSlag, setTeiknSlag] = useState<"firkant" | "kontur">("firkant")
  const vekslTeikn = useCallback(() => {
    if (!teikn) {
      setValdBit(null)
      setValdStrek(null)
      setValdPunkt(null)
      setModus("form")
      setMelding(teiknSlag === "kontur" ? "teikn konturen · slepp for å lukke" : "teikn: dra ein firkant")
    }
    setTeikn((t) => !t)
  }, [teikn, teiknSlag])
  useEffect(() => { if (modus !== "form") setTeikn(false) }, [modus])
  const tomArbeidsflate = useCallback(() => {
    setParams((cur) => ({
      ...cur,
      kjelde: "kube",
      scene: "",
      plan: "",
      fest: "",
      deling: "",
      ...(cur.storleik === MOTOR.defaults.storleik ? { storleik: MOBEL_STORLEIK } : {}),
      ...(cur.tjukn === MOTOR.defaults.tjukn ? { tjukn: MOBEL_TJUKN } : {}),
      ...(cur.arkB === MOTOR.defaults.arkB && cur.arkH === MOTOR.defaults.arkH ? { arkB: MOBEL_ARK[0], arkH: MOBEL_ARK[1] } : {}),
    }))
    setTeiknSlag("kontur")
    synEtterBygg.current = [0, 0, 1]
    setVald(null)
    setValdBit(null)
    setValdGruppe(null)
    setValdStrek(null)
    setValdPunkt(null)
    setVerkty(null)
    setView("lag")
    setSkal(false)
    setModus("form")
    setSteg("line")
    setTeikn(true)
  }, [])
  const teiknLukk = useCallback((po: Vec3, pn: Vec3, punkt: Pt[]) => {
    setTeikn(false)
    const k = kroppRef.current
    if (!k) return
    const omriss = punkt.map(klemPunkt)
    if (omriss.length < 3 || omriss.length > OMRISS_TAK || Math.abs(shoelace(omriss)) < 1e-6) return
    const naaPlan = lesPlan(naa.current.plan)
    const S = typeof naa.current.storleik === "number" ? naa.current.storleik : 150
    const t = typeof naa.current.tjukn === "number" ? naa.current.tjukn : 3
    const svar = lukkTeikning(naaPlan, valdRef.current, po, pn, punkt, omriss, k.min, k.max, S, t)
    if (svar.slag === "nei") return setMelding(svar.kvifor)
    if (svar.slag === "hol") {
      setParams((cur) => ({ ...cur, plan: skrivPlan(svar.plan) }))
      setValdStrek(svar.strek)
      return
    }
    const { o, omriss: form = omriss } = svar
    if (o.some((c) => c < -PLAN_ROM || c > 1 + PLAN_ROM)) return setMelding("for langt ute")
    if (naaPlan.length >= PLAN_TAK) return setMelding(`taket er ${PLAN_TAK} plan`)
    const id = nyId(naaPlan)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      if (l.length >= PLAN_TAK) return cur
      const runde = mjukePunkt(form)
      return { ...cur, plan: skrivPlan([...l, { id: nyId(l), o, n: pn, bog: 0, strek: [], omriss: form, ...(runde.length ? { runde } : {}) }]) }
    })
    setVald(id)
    setValdGruppe(null)
    setBlink(id)
  }, [])

  const sisteKopi = useRef<{ kjelde: number; kopi: number } | null>(null)
  const dupliserPlan = useCallback((id: number) => {
    const k = kroppRef.current
    if (!k) return
    const l = lesPlan(naa.current.plan)
    const j = l.findIndex((q) => q.id === id)
    if (j < 0) return
    if (l.length >= PLAN_TAK) return setMelding(`taket er ${PLAN_TAK} plan`)
    const t = typeof naa.current.tjukn === "number" ? naa.current.tjukn : 6
    const q = l[j]
    const g = gruppeNo.current.g
    const kjelde = g !== null && q.gruppe === g ? iGruppa(l, g) : [q]
    if (l.length + kjelde.length > PLAN_TAK) return setMelding(`taket er ${PLAN_TAK} plan`)
    const kopiar: Plan[] = []
    const steg = kjelde.length === 1 && sisteKopi.current?.kopi === id ? nesteSteg(l, id, sisteKopi.current.kjelde) : null
    for (const p of kjelde) {
      const o = steg ?? skuvKopi(p, k.min, k.max, t)
      if (!o) return setMelding("ikkje rom for kopi · flytt plata innover")
      kopiar.push({ ...p, o })
    }
    const nyG = kjelde.length > 1 ? nyGruppe(l) : 0
    let ny = nyId(l)
    const leiar = ny + kjelde.findIndex((p) => p.id === id)
    setParams((cur) => {
      const m = lesPlan(cur.plan)
      if (m.length + kjelde.length > PLAN_TAK) return cur
      let i = nyId(m)
      ny = i
      return { ...cur, plan: skrivPlan([...m, ...kopiar.map((p) => ({ ...p, id: i++, gruppe: nyG || undefined }))]) }
    })
    sisteKopi.current = kjelde.length === 1 ? { kjelde: id, kopi: leiar } : null
    setVald(leiar)
    setValdGruppe(nyG || null)
    setValdStrek(null)
    setValdPunkt(null)
    setBlink(leiar)
  }, [])
  const rundtValt = useCallback((N: number) => {
    const k = kroppRef.current, l = lesPlan(naa.current.plan), q = l.find((p) => p.id === valdRef.current)
    if (!k || !q) return
    if (l.length + N - 1 > PLAN_TAK) return setMelding(`taket er ${PLAN_TAK} plan`)
    const g = nyGruppe(l), rad = rundt(q, N, k.min, k.max, nyId(l), g, typeof naa.current.tjukn === "number" ? naa.current.tjukn : 3)
    setParams((cur) => ({ ...cur, plan: skrivPlan([...lesPlan(cur.plan).map((p) => (p.id === q.id ? rad[0] : p)), ...rad.slice(1)]) }))
    setValdGruppe(g)
    setBlink(rad[N - 1].id)
  }, [])
  const speglValt = useCallback((akse: number) => {
    const k = kroppRef.current
    const id = valdRef.current
    const l = lesPlan(naa.current.plan)
    const q = l.find((p) => p.id === id)
    if (!k || !q) return
    const S = typeof naa.current.storleik === "number" ? naa.current.storleik : 150
    const par = speglPar(q, akse, k.min, k.max, S, l, typeof naa.current.tjukn === "number" ? naa.current.tjukn : 3)
    if (par) {
      if (l.length >= PLAN_TAK) return setMelding(`taket er ${PLAN_TAK} plan`)
      const { flytt, kopi } = par
      setParams((cur) => ({ ...cur, plan: skrivPlan([...lesPlan(cur.plan).map((p) => (p.id === q.id ? flytt : p)), kopi]) }))
      const g = flytt.gruppe ?? null
      setVald(q.id)
      setValdGruppe(g)
      setValdStrek(null)
      setValdPunkt(null)
      setBlink(kopi.id)
      return
    }
    const speglaPlan = speglPlan(q, akse, k.min, k.max)
    const a = planRamme(q, k.min, k.max), b = planRamme(speglaPlan, k.min, k.max)
    const samePlan = !q.bog && Math.abs(dot(a.n, b.n)) > 0.99999 && Math.abs(dot(sub3(b.o, a.o), a.n)) < 0.001
    if (!samePlan && l.length >= PLAN_TAK) return setMelding(`taket er ${PLAN_TAK} plan`)
    const ny = { ...speglaPlan, id: samePlan ? q.id : nyId(l), gruppe: undefined }
    setParams((cur) => ({ ...cur, plan: skrivPlan(samePlan ? l.map((p) => p.id === q.id ? ny : p) : [...l, ny]) }))
    setVald(ny.id)
    setValdGruppe(null)
    setValdStrek(null)
    setValdPunkt(null)
    setBlink(ny.id)
  }, [])
  const iScope = (l: readonly Plan[], id: number): Set<number> => {
    const g = gruppeNo.current.g
    const q = l.find((p) => p.id === id)
    return new Set(g !== null && q?.gruppe === g ? iGruppa(l, g).map((p) => p.id) : [id])
  }
  const frysOmriss = useCallback((id: number) => {
    const k = kroppRef.current
    const stor = stoersteRing(snittRef.current)
    if (!k || !stor) return
    let pts = stor as Pt[]
    for (let tol = 0.25; pts.length > OMRISS_TAK && tol < 4096; tol *= 2) pts = simplify(stor as Pt2[], tol) as Pt[]
    if (pts.length < 3) return
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0) return cur
      const r = planRamme(l[j], k.min, k.max)
      const S = storleikAv(cur)
      const ou = dot(r.o, r.u)
      const ov = dot(r.o, r.v)
      l[j] = { ...l[j], omriss: pts.slice(0, OMRISS_TAK).map((q) => klemPunkt([(q[0] - ou) / S, (q[1] - ov) / S])), runde: undefined }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  const formOmriss = useCallback((id: number, slag: FormSlag) => {
    const k = kroppRef.current
    if (!k) return
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0) return cur
      const S = storleikAv(cur)
      let b: { x0: number; y0: number; x1: number; y1: number }
      if (l[j].omriss?.length) b = bbox(omrissLine(l[j].omriss as Pt[], l[j].runde))
      else {
        const stor = stoersteRing(snittRef.current)
        if (!stor) return cur
        const r = planRamme(l[j], k.min, k.max)
        const ou = dot(r.o, r.u)
        const ov = dot(r.o, r.v)
        b = bbox(stor.map((q): Pt => [(q[0] - ou) / S, (q[1] - ov) / S]))
      }
      const { x0, y0, x1, y1 } = b
      if (!(x1 > x0 && y1 > y0)) return cur
      const f = formPunkt(slag, { x0, y0, x1, y1 })
      l[j] = { ...l[j], omriss: f.omriss.map(klemPunkt), runde: f.runde }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  const losOmriss = useCallback((id: number) => {
    setValdPunkt(null)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0 || !l[j].omriss) return cur
      const { omriss: _, runde: _r, ...utan } = l[j]
      l[j] = utan
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  const leggPunkt = useCallback((id: number, i: number, q: Pt) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i] || om.length >= OMRISS_TAK) return cur
      const ny = om.slice()
      ny.splice(i + 1, 0, klemPunkt(q))
      l[j] = { ...l[j], omriss: ny, ...skiftRunde(l[j].runde, (k) => (k > i ? k + 1 : k)) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  const taPunkt = useCallback((id: number, i: number) => {
    setValdPunkt(null)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i] || om.length <= 3) return cur
      l[j] = { ...l[j], omriss: om.filter((_, k) => k !== i), ...skiftRunde(l[j].runde, (k) => (k === i ? null : k > i ? k - 1 : k)) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  const vriPunkt = useCallback((id: number, i: number) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i]) return cur
      const har = l[j].runde ?? []
      const ny = har.includes(i) ? har.filter((k) => k !== i) : [...har, i].sort((a, b) => a - b)
      l[j] = { ...l[j], ...(ny.length ? { runde: ny } : { runde: undefined }) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  const stegPunkt = useCallback((id: number, i: number, du: number, dv: number) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i]) return cur
      const S = storleikAv(cur)
      const ny = om.slice()
      ny[i] = klemPunkt([om[i][0] + du / S, om[i][1] + dv / S])
      l[j] = { ...l[j], omriss: ny }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  const slaaSamanPunkt = useCallback((id: number, i: number, mot: number) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om) return cur
      const ny = slaaSaman(om, i, mot)
      if (!ny) return cur
      l[j] = { ...l[j], omriss: ny.omriss, ...skiftRunde(l[j].runde, (k) => (k === i ? null : k > i ? k - 1 : k)) }
      setValdPunkt(null)
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  const flyttPunkt = useCallback((id: number, i: number, q: Pt) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i]) return cur
      const ny = om.slice()
      ny[i] = klemPunkt(q)
      l[j] = { ...l[j], omriss: ny }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  const snappNo = Math.min(SNAPPSTEG.length - 1, Math.max(0, Math.round(Number(params.snapp ?? 3))))
  const vekslSnapp = useCallback(() => {
    setParams((cur) => {
      const i = Math.min(SNAPPSTEG.length - 1, Math.max(0, Math.round(Number(cur.snapp ?? 3))))
      const ny = (i + 1) % SNAPPSTEG.length
      setMelding(`snapp ${SNAPP_NAMN[ny]}`)
      return { ...cur, snapp: ny }
    })
  }, [])

  const sisteForm = useRef(0)
  const formSteg = useRef(0)
  useEffect(() => {
    formSteg.current = 0
  }, [vald])
  const formTrykk = useCallback(() => {
    const id = valdRef.current
    if (id === null) return
    const no = performance.now()
    const dobbelt = no - sisteForm.current < DOBBELT_MS
    sisteForm.current = no
    if (dobbelt) {
      const slag = FORM_SLAG[formSteg.current % FORM_SLAG.length]
      formSteg.current++
      setMelding(slag)
      return formOmriss(id, slag)
    }
    if (lesPlan(naa.current.plan).find((q) => q.id === id)?.omriss?.length) losOmriss(id)
    else frysOmriss(id)
  }, [formOmriss, frysOmriss, losOmriss])
  const virrPlan = useCallback((dmm: number) => {
    const k = kroppRef.current
    if (!k || !dmm) return
    setParams((cur) => {
      const g = gruppeNo.current.g
      if (g === null) return cur
      const l = lesPlan(cur.plan)
      const treff = new Set(iGruppa(l, g).map((p) => p.id))
      if (!treff.size) return cur
      const midt = [...treff].reduce((sum, id) => sum + stoy(id), 0) / treff.size
      return {
        ...cur,
        plan: skrivPlan(
          l.map((p) => {
            if (!treff.has(p.id)) return p
            const f = (stoy(p.id) - midt) * dmm
            return {
              ...p,
              o: p.o.map((c, a) => Math.min(1, Math.max(0, +(c + (p.n[a] * f) / Math.max(1e-6, k.max[a] - k.min[a])).toFixed(4)))) as Vec3,
            }
          }),
        ),
      }
    })
  }, [])
  const mjukPlan = useCallback((id: number, d: number) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const treff = iScope(l, id)
      const mine = l.filter((p) => treff.has(p.id))
      if (!mine.length) return cur
      const naa = Math.max(...mine.map((p) => p.mjuk ?? 0))
      const v = Math.max(0, Math.min(MJUK_TAK, naa + d))
      if (Math.abs(v - naa) < 1e-6) return cur
      const mjuk = v < 0.0005 ? 0 : +v.toFixed(4)
      return {
        ...cur,
        plan: skrivPlan(
          l.map((p) => {
            if (!treff.has(p.id)) return p
            const { mjuk: _, ...utan } = p
            return mjuk ? { ...utan, mjuk } : utan
          }),
        ),
      }
    })
  }, [])
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
  const setjDeling = useCallback((nokkel: string, t: number) => {
    setParams((cur) => {
      const m = new Map(lesDeling(cur.deling))
      if (m.get(nokkel) === t) return cur
      m.set(nokkel, t)
      return { ...cur, deling: skrivDeling(m) }
    })
  }, [])
  const flyttPlan = useCallback((id: number, o: Vec3, n: Vec3) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const i = l.findIndex((p) => p.id === id)
      if (i < 0) return cur
      const { g, fordel } = gruppeNo.current
      return { ...cur, plan: skrivPlan(medGruppa(l, i, o, n, g, fordel)) }
    })
  }, [])
  const slett = useCallback((id: number) => {
    const l = lesPlan(naa.current.plan)
    const q = l.find((p) => p.id === id)
    const g = gruppeNo.current.g
    const bort = new Set(g !== null && q?.gruppe === g ? iGruppa(l, g).map((p) => p.id) : [id])
    setVald((v) => (v !== null && bort.has(v) ? null : v))
    setParams((cur) => {
      const m = lesFest(cur.fest)
      for (const adr of [...m.keys()]) if (bort.has(Number(/^\d+/.exec(adr)?.[0]))) m.delete(adr)
      return { ...cur, plan: skrivPlan(lesPlan(cur.plan).filter((p) => !bort.has(p.id))), fest: skrivFest(m) }
    })
  }, [])
  const setFarge = useCallback((farge: number) => {
    const { g } = gruppeNo.current
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const v = valdRef.current
      if (v === null) return cur
      const q = l.find((p) => p.id === v)
      if (!q) return cur
      const treff = new Set(g !== null && q.gruppe === g ? iGruppa(l, g).map((p) => p.id) : [v])
      const ny = l.map((p) => {
        if (!treff.has(p.id)) return p
        const { farge: _, ...utan } = p
        return farge ? { ...utan, farge } : utan
      })
      return { ...cur, plan: skrivPlan(ny) }
    })
  }, [])
  const slettGruppe = useCallback((g: number) => {
    const bort = new Set(iGruppa(lesPlan(naa.current.plan), g).map((p) => p.id))
    setVald((v) => (v !== null && bort.has(v) ? null : v))
    setParams((cur) => {
      const m = lesFest(cur.fest)
      for (const adr of [...m.keys()]) if (bort.has(Number(/^\d+/.exec(adr)?.[0]))) m.delete(adr)
      return { ...cur, plan: skrivPlan(lesPlan(cur.plan).filter((p) => !bort.has(p.id))), fest: skrivFest(m) }
    })
  }, [])
  const velPlan = useCallback((id: number | null) => {
    setVald(id)
    setValdGruppe(null)
    setValdStrek(null)
    setPeikt(id === null ? null : (liste.find((k) => k.plan === id)?.adr ?? null))
  }, [liste])
  const skiftVel = useCallback((id: number) => {
    const l = lesPlan(naa.current.plan)
    const frå = valdRef.current
    const a = l.findIndex((q) => q.id === (frå ?? id))
    const b = l.findIndex((q) => q.id === id)
    if (a < 0 || b < 0) return
    if (a === b) return velPlan(id)
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const g = nyGruppe(l)
    const ny = l.map((q, i) => (i >= lo && i <= hi ? { ...q, gruppe: g } : q))
    setParams((cur) => {
      const m = lesPlan(cur.plan)
      const sett = new Set(ny.filter((q) => q.gruppe === g).map((q) => q.id))
      return { ...cur, plan: skrivPlan(m.map((q) => (sett.has(q.id) ? { ...q, gruppe: g } : q))) }
    })
    setVald(id)
    setValdGruppe(g)
    setValdStrek(null)
  }, [velPlan])

  const velGruppe = useCallback((g: number) => {
    const rad = iGruppa(lesPlan(naa.current.plan), g)
    if (!rad.length) return
    const id = rad[rad.length - 1].id
    setVald(id)
    setValdGruppe(g)
    setValdStrek(null)
    setPeikt(liste.find((k) => k.plan === id)?.adr ?? null)
  }, [liste])
  useEffect(() => {
    if (rom) return
    setTeikn(false)
    setModus("form")
    setValdBit(null)
    if (view !== "montasje") return
    setValdPunkt(null)
    velPlan(null)
  }, [rom, view, velPlan])
  useEffect(() => { setVirr(0) }, [valdGruppe])
  useEffect(() => {
    if (valdGruppe === null) return
    if (vald === null || !plan.some((p) => p.id === vald && p.gruppe === valdGruppe)) setValdGruppe(null)
  }, [vald, plan, valdGruppe])
  useEffect(() => {
    if (valdStrek === null) return
    const pl = vald === null ? undefined : plan.find((q) => q.id === vald)
    if (!pl || valdStrek >= pl.strek.length) setValdStrek(null)
  }, [vald, plan, valdStrek])
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
  const fiksAlle = useCallback(() => {
    setBusy(true)
    send({ kind: "fiksalt", id: ++reqId.current, params: naa.current })
  }, [send])
  const montNokkel = view === "montasje" ? byggKey(params, 0) : ""
  useEffect(() => {
    if (!montNokkel) return setMont(null)
    send({ kind: "montasje", id: ++reqId.current, params: naa.current })
  }, [montNokkel, send])
  const velDel = useCallback((adr: string | null) => {
    setPeikt(adr)
    const k = adr ? liste.find((q) => q.adr === adr) : undefined
    setVald(k ? k.plan : null)
    if (k?.ark && view === "kontur" && ark && ark.i !== k.ark - 1) askArk(k.ark - 1)
  }, [liste, view, ark, askArk])

  const rutGrunn = useRef<[number, number]>([0, 0])
  const ruteSteg = useCallback((cur: ParamBag, dx: number, dy: number) => {
    const [nx0, ny0] = rutGrunn.current
    const { andre } = skilRute(lesPlan(cur.plan))
    const rom = Math.max(0, PLAN_TAK - andre.length)
    const tak = Math.min(Math.floor(PLAN_TAK / 2), rom)
    let nx = Math.max(0, Math.min(tak, nx0 + Math.round(dx / RUTE_STEG)))
    let ny = Math.max(0, Math.min(tak, ny0 + Math.round(-dy / RUTE_STEG)))
    if (nx + ny > rom) {
      if (Math.abs(dy) > Math.abs(dx)) ny = Math.max(0, rom - nx)
      else nx = Math.max(0, rom - ny)
    }
    return { nx, ny, liste: [...andre, ...rutenett(nx, ny, nyId(andre), nyGruppe(andre))] }
  }, [])
  const dragRute = useCallback((dx: number, dy: number) => {
    const { nx, ny } = ruteSteg(naa.current, dx, dy)
    setRuteTal([nx, ny])
    setParams((cur) => {
      const { liste } = ruteSteg(cur, dx, dy)
      const plan = skrivPlan(liste)
      if (cur.plan === plan) return cur
      const att = new Set(liste.map((q) => q.id))
      const m = lesFest(cur.fest)
      for (const adr of [...m.keys()]) if (!att.has(Number(/^\d+/.exec(adr)?.[0]))) m.delete(adr)
      return { ...cur, plan, fest: skrivFest(m) }
    })
  }, [ruteSteg])

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
  const pngAvArk = useCallback(async () => {
    const n = Math.max(0, tal?.metrics.sheets ?? 0)
    if (!n) return
    setBusy(true)
    try {
      const filer: { name: string; data: Uint8Array }[] = []
      const st = stamme(kjeldeNamn)
      for (let i = 0; i < n; i++) {
        const a = await hentArk(i)
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
  const leggEtter = useRef<string | null>(null)
  const [bilete, setBilete] = useState<{ maske: Maske; url: string } | null>(null)
  const teikneplan = useRef<(() => { o: Vec3; n: Vec3 }) | null>(null)
  const leggBilete = useCallback((f: BileteForm) => {
    const pl = teikneplan.current?.()
    const l = lesPlan(naa.current.plan)
    if (!pl || l.length >= PLAN_TAK) return setMelding(pl ? `taket er ${PLAN_TAK} plan` : "ingen flate")
    const { omriss, runde, hol } = skalerForm(f, 0.8)
    const id = nyId(l)
    setParams((cur) => ({ ...cur, plan: skrivPlan([...lesPlan(cur.plan), { id, o: pl.o, n: pl.n, bog: 0, strek: hol, omriss, ...(runde.length ? { runde } : {}) }]) }))
    setBilete(null)
    setVald(id)
    setBlink(id)
  }, [])
  const takeFile = useCallback(async (alle: File[]) => {
    const bilda = alle.filter((f) => f.type.startsWith("image/"))
    if (bilda.length) void lesBilete(bilda[0]).then(setBilete, () => setFeil("ulesbart bilete"))
    const filer = alle.filter((f) => !f.type.startsWith("image/"))
    if (!filer.length) return
    const gode = filer.filter((f) => f.size <= MAX_FIL)
    if (!gode.length) return setFeil("for stor")
    setFeil(gode.length < filer.length ? `${filer.length - gode.length} for stor` : null)
    setBusy(true)
    setHentar(true)
    for (let k = 0; k < gode.length; k++) {
      const f = gode[k]
      try {
        const buf = await f.arrayBuffer()
        const id = ++reqId.current
        bytar.current.set(id, { namn: f.name, buf: buf.slice(0) })
        if (k === 0 && bitRef.current !== null && !/\.zip$/i.test(f.name)) bytSvar.current.set(id, bitRef.current)
        if (k > 0) formSvar.current.add(id)
        send({ kind: "import", id, name: f.name, buf }, [buf])
      } catch {
        setFeil("ulesbar fil")
        setHentar(false)
        setBusy(false)
      }
    }
  }, [send])

  const [bibliotek, setBibliotek] = useState<{ id: string; label: string }[]>([])
  const lesBibliotek = useCallback(() => {
    void alleNett().then((l) => setBibliotek(l.map((v) => ({ id: v.id, label: v.label }))))
  }, [])
  useEffect(lesBibliotek, [lesBibliotek])

  const leggLagra = useCallback((id: string) => {
    setHentar(true)
    void hentNett([id]).then((funne) => {
      const v = funne[0]
      if (!v) {
        setHentar(false)
        return setMelding("fann ikkje nettet")
      }
      const rid = ++reqId.current
      formSvar.current.add(rid)
      leggEtter.current = id
      setNamn((m) => ({ ...m, [v.id]: v.label }))
      send({ kind: "import", id: rid, name: v.label, buf: v.bytes, som: v.id, etikett: v.label }, [v.bytes])
    })
  }, [send])
  useEffect(() => {
    let djup = 0
    const filer = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files")
    const inn = (e: DragEvent) => { if (filer(e)) { e.preventDefault(); djup++; setDrag(true) } }
    const over = (e: DragEvent) => { if (filer(e)) e.preventDefault() }
    const ut = () => { djup = Math.max(0, djup - 1); if (!djup) setDrag(false) }
    const slepp = (e: DragEvent) => {
      const f = [...(e.dataTransfer?.files ?? [])]
      if (!f.length) return
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
    if (!benk) setSteg("line")
  }, [benk])
  useEffect(() => {
    if (view === "kontur") askArk(ark?.i ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tal, askArk])
  const [sov, setSov] = useState(false)
  const andreFinger = useRef<Element | null>(null)
  const boy = useRef<number | null>(null)
  const boyNed = useRef<number | null>(null)
  const sisteBoy = useRef(0)
  const [rammInn, setRammInn] = useState(0)
  const [synTil, setSynTil] = useState<{ n: number; dir: Vec3 } | null>(null)
  const synEtterBygg = useRef<Vec3 | null>(null)
  useEffect(() => {
    const dir = synEtterBygg.current
    const b = kropp ?? lag
    if (!dir || !b || typeof params.storleik !== "number") return
    const lengst = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])
    if (Math.abs(lengst - params.storleik) > 0.01 * params.storleik) return
    synEtterBygg.current = null
    setSynTil((s) => ({ n: (s?.n ?? 0) + 1, dir }))
  }, [lag, kropp, params.storleik])
  const kvile =
    mounted && !verkty && steg === "line" && view !== "kontur" && view !== "montasje" &&
    vald === null && valdStrek === null && valdBit === null &&
    modus !== "bit" && modus !== "rute" &&
    !teikn && !busy && !drag && !melding && !feil && !hentar
  const soven = useRef(false)
  soven.current = sov
  useEffect(() => {
    if (!kvile) return setSov(false)
    let t = 0
    const vak = (e?: Event) => {
      if (soven.current && e?.type === "pointerdown") {
        const svelg = (k: Event) => {
          k.stopImmediatePropagation()
          k.preventDefault()
        }
        window.addEventListener("click", svelg, { capture: true, once: true })
        window.setTimeout(() => window.removeEventListener("click", svelg, true), 700)
      }
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
  useEffect(() => {
    if (!mounted) return
    const el = document.querySelector<HTMLElement>(".synskube")
    if (!el) return
    const maal = () => setKubeBotn(Math.round(el.getBoundingClientRect().bottom))
    maal()
    const ro = new ResizeObserver(maal)
    ro.observe(el)
    window.addEventListener("resize", maal)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", maal)
    }
  }, [mounted, toppH])
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

  const stegPlan = useCallback((id: number, mm: number) => {
    const k = kroppRef.current
    if (!k) return
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const i = l.findIndex((p) => p.id === id)
      if (i < 0) return cur
      const q = l[i]
      const vidd = [0, 1, 2].map((a) => Math.max(1e-6, k.max[a] - k.min[a]))
      const les = (o: Vec3) => o.reduce((s, c, a) => s + (c - 0.5) * vidd[a] * q.n[a], 0)
      const maal = les(q.o) + mm
      const rund = (c: number) => Math.min(1 + PLAN_ROM, Math.max(-PLAN_ROM, +c.toFixed(4)))
      const g = q.o.map((c, a) => rund(c + (q.n[a] * mm) / vidd[a])) as Vec3
      let best = g
      let feil = Math.abs(les(g) - maal)
      for (let j = 0; j < 27; j++) {
        const c: Vec3 = [rund(g[0] + ((j % 3) - 1) * 1e-4), rund(g[1] + ((Math.floor(j / 3) % 3) - 1) * 1e-4), rund(g[2] + (Math.floor(j / 9) - 1) * 1e-4)]
        const e = Math.abs(les(c) - maal)
        if (e < feil - 1e-9) {
          best = c
          feil = e
        }
      }
      const { g: gruppe, fordel } = gruppeNo.current
      return { ...cur, plan: skrivPlan(medGruppa(l, i, best, q.n, gruppe, fordel)) }
    })
  }, [])

  const bla = valdBit !== null && bitar[valdBit] && nesteForm(bitar[valdBit].id) !== bitar[valdBit].id ? familien(bitar[valdBit].id) : ""
  const [meny, setMeny] = useState<MenyStad | null>(null)
  const planMeny = useCallback((id: number, x: number, y: number) => {
    velPlan(id)
    const pl = lesPlan(naa.current.plan).find((q) => q.id === id)
    setMeny({
      x, y,
      liner: [
        { ord: "dubler", tast: "D", gjer: () => dupliserPlan(id) },
        { ord: pl?.omriss?.length ? "slepp forma" : "omriss", tast: "O", gjer: () => formTrykk() },
        { ord: "hol", tast: "H", gjer: () => leggStrek("hol") },
        { ord: "gods", gjer: () => leggStrek("gods") },
        { ord: "slett", tast: "⌫", gjer: () => slett(id) },
      ],
    })
  }, [velPlan, dupliserPlan, formTrykk, leggStrek, slett])

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
      if (k === " ") {
        if (t?.closest("button,[role=slider],[role=tab],[role=option],[role=checkbox]")) return
        e.preventDefault()
        if (rom) laas()
        return
      }
      if (k === "l") {
        if (vald !== null) velPlan(null)
        else if (rom) laas()
      } else if (k === "delete" || k === "backspace") {
        if (valdPunkt !== null && vald !== null) taPunkt(vald, valdPunkt)
        else if (valdStrek !== null) slettStrek()
        else if (vald !== null) slett(vald)
      } else if (k === "z") (e.shiftKey ? gjerOm : angre)()
      else if (k === "r" && rom) vekslRute()
      else if (k === "k" && rom) vekslBit()
      else if (k === "m") vekslMontasje()
      else if (k === "b" && valdPunkt !== null && vald !== null) vriPunkt(vald, valdPunkt)
      else if (k === "b" && bla) leggBit(bla)
      else if (k === "1") setView("flate")
      else if (k === "2") setView("lag")
      else if (k === "3") setView("kontur")
      else if (k === "4") { if (gaarIHop.current) setView("montasje") }
      else if (k === "f") document.querySelector<HTMLButtonElement>("[data-heim]")?.click()
      else if (k === "s" && rom) vekslSnapp()
      else if (k === "t" && rom) vekslTeikn()
      else if (k === "d" && vald !== null && rom) dupliserPlan(vald)
      else if (k === "h" && vald !== null && rom) leggStrek("hol")
      else if (k === "o" && vald !== null && valdGruppe === null && rom) formTrykk()
      else if (k.startsWith("arrow") && vald !== null && valdPunkt !== null && rom && t?.getAttribute("role") !== "slider") {
        const mm = e.shiftKey ? 10 : 1
        stegPunkt(vald, valdPunkt, k === "arrowright" ? mm : k === "arrowleft" ? -mm : 0, k === "arrowup" ? mm : k === "arrowdown" ? -mm : 0)
      }
      else if (k.startsWith("arrow") && vald !== null && valdStrek === null && rom && t?.getAttribute("role") !== "slider") {
        const retn = k === "arrowup" || k === "arrowright" ? 1 : -1
        stegPlan(vald, retn * (e.shiftKey ? 10 : 1))
      }
      else if (k === "tab" && vald !== null && plan.length > 1 && t?.getAttribute("role") !== "slider") {
        const i = plan.findIndex((p) => p.id === vald)
        velPlan(plan[(i + (e.shiftKey ? plan.length - 1 : 1)) % plan.length].id)
      } else if (k === "escape") {
        if (teikn) setTeikn(false)
        else if (verkty) setVerkty(null)
        else if (valdPunkt !== null) setValdPunkt(null)
        else if (valdStrek !== null) setValdStrek(null)
        else if (vald !== null) velPlan(null)
        else if (view === "montasje") vekslMontasje()
        else setSteg("line")
      } else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [angre, gjerOm, laas, slett, slettStrek, vald, valdGruppe, valdPunkt, valdStrek, vekslRute, vekslMontasje, rom, verkty, velPlan, vekslBit, bla, leggBit, dupliserPlan, leggStrek, formTrykk, stegPlan, stegPunkt, taPunkt, vriPunkt, plan, view, vekslSnapp, vekslTeikn, teikn])

  const skuffH = benk ? Math.round(vindu.h * 0.46) : 0
  const rute: Rute = useMemo(
    () => ({ W: vindu.w, H: vindu.h, venstre: 0, hogre: benk ? KOL : 0, topp: toppH, botn: benk ? (verkty ? skuffH : 0) : arkH }),
    [vindu, benk, verkty, skuffH, arkH, toppH],
  )
  const skuffRute: CSSProperties = benk
    ? { left: 0, right: KOL, bottom: 0, height: skuffH }
    : { left: 8, right: 8, top: toppH + 8, bottom: `calc(${LUKKA_ARK}px + env(safe-area-inset-bottom))` }
  const iValt = vald === null ? [] : plan.filter((q) => (valdGruppe !== null && q.gruppe === valdGruppe ? true : q.id === vald))
  const mjukNo = iValt.reduce((m, q) => Math.max(m, q.mjuk ?? 0), 0)
  const harOmriss = vald !== null && !!plan.find((q) => q.id === vald)?.omriss?.length
  const bunde = vald !== null && (!harOmriss || !!plan.find((q) => q.id === vald)?.nett)
  const [flatt, setFlatt] = useState(false)
  const flattPlan = flatt && harOmriss ? plan.find((q) => q.id === vald) : undefined
  const vekslNett = () => (harOmriss ? setParams((cur) => ({ ...cur, plan: skrivPlan(lesPlan(cur.plan).map((q) => (q.id === vald ? { ...q, nett: q.nett ? undefined : true } : q))) })) : formTrykk())
  const montLes =
    !mont?.delar.length ? "ingen delar"
    : montVald ? `${montVald} · steg ${(mont.delar.find((d) => d.adr === montVald)?.steg ?? 0) + 1}`
    : `steg ${montSteg}/${mont.steg} · ${mont.delar.filter((d) => d.steg === montSteg - 1).length}`
  const gestTekst =
    view === "montasje" && mont ? montLes
    : gest === "rute" ? (ruteTal ? `${ruteTal[0]}×${ruteTal[1]}` : "rutenett")
    : gest

  return (
    <main className="fixed inset-0 overflow-hidden" data-sov={sov ? "" : undefined} style={{ background: "var(--paper)" }}>
      {/* fyrste gesten på objektet tek lina om gestane bort. Rommet vert
          GØYMT og ikkje teke ned når plateflata står framme: lerretet held
          på WebGL-samanhengen og synet sitt, og synskuben — som høyrer til
          rommet — fylgjer med i gøymsla. */}
      <div className="absolute inset-0" style={{ visibility: view === "kontur" ? "hidden" : undefined }}>
        {mounted && (
          <Scene
            teikneplan={teikneplan}
            kropp={kropp}
            lag={lag}
            view={romsyn.current}
            skal={skal}
            onSkal={() => setSkal((q) => !q)}
            sov={sov}
            modus={modus}
            montasje={view === "montasje"}
            material={String(params.material ?? "finer")}
            rute={rute}
            liste={liste}
            plan={plan}
            vald={vald}
            gruppe={valdGruppe === null ? INGEN : plan.filter((p) => p.gruppe === valdGruppe).map((p) => p.id)}
            snitt={snitt}
            blink={blink}
            skisse={skisse}
            storleik={typeof params.storleik === "number" ? params.storleik : 150}
            valdStrek={valdStrek}
            onVald={velPlan}
            onDeling={setjDeling}
            onValdStrek={setValdStrek}
            snappSteg={SNAPPSTEG[Math.round(Number(params.snapp ?? 3)) as 0 | 1 | 2 | 3] ?? 90}
            teikn={teikn}
            teiknSlag={teiknSlag}
            onTeiknLukk={teiknLukk}
            onPunkt={flyttPunkt}
            onSlaaSaman={slaaSamanPunkt}
            onLeggPunkt={leggPunkt}
            onTaPunkt={taPunkt}
            onVriPunkt={vriPunkt}
            mont={mont}
            montT={montT}
            montSpel={montSpel}
            montVakn={montVakn}
            onMontSteg={setMontSteg}
            montVald={montVald}
            onMontVald={(adr) => setMontVald((v) => (v === adr ? null : adr))}
            valdPunkt={valdPunkt}
            onValdPunkt={setValdPunkt}
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
            synTil={synTil}
            onRute={dragRute}
            benk={benk}
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
          className="absolute flex flex-col"
          style={{ left: 0, right: rute.hogre, top: rute.topp, bottom: benk ? rute.botn : `calc(${arkH}px + env(safe-area-inset-bottom))`, background: "var(--paper)" }}
        >
          <Plater ark={ark} params={params} onChange={endre} onArk={askArk} peikt={peikt} onPeik={velDel} />
        </section>
      )}

      {flattPlan && <Vektor plan={flattPlan} S={typeof params.storleik === "number" ? params.storleik : 150} t={typeof params.tjukn === "number" ? params.tjukn : 3} nyId={nyId(plan)} alle={plan} boks={kropp ? { min: kropp.min, max: kropp.max } : null} topp={toppH} onEndre={(q) => setParams((cur) => ({ ...cur, plan: skrivPlan(lesPlan(cur.plan).map((p) => (p.id === q.id ? q : p))) }))} onDel={([a, ...fleire]) => setParams((cur) => ({ ...cur, plan: skrivPlan([...lesPlan(cur.plan).map((p) => (p.id === a.id ? a : p)), ...fleire]) }))} onLukk={() => setFlatt(false)} />}
      {bilete && <BileteInn maske={bilete.maske} url={bilete.url} onLegg={leggBilete} onAvbryt={() => setBilete(null)} />}
      <Toppline benk={benk} kjelde={kjeldeNamn} bitar={bitar.length} byt={valdBit !== null ? familien(bitar[valdBit]?.id ?? "") : ""} onLegg={leggBit} onTom={tomScene} onTomArbeidsflate={tomArbeidsflate} view={view} onView={setView} montasjeOk={hopBrot.length === 0} hopHint={hopBrot.map((r) => r.label).join(" · ") + " — går ikkje i hop"} onFile={(f) => void takeFile(f)} bibliotek={bibliotek} onLeggLagra={leggLagra} onAngre={angre} kanAngre={kanAngre} onGjerOm={gjerOm} kanGjerOm={kanGjerOm} onShare={share} onHogd={setToppH} />
      {mounted && teikn && rom && (
        <div className="speil" style={{ top: toppH + 6, left: 0, right: benk ? KOL : 0 }} role="group" aria-label="teiknemåte">
          {(["firkant", "kontur"] as const).map((slag) => (
            <button key={slag} type="button" className={ORD + " min-w-16"} aria-pressed={teiknSlag === slag} onClick={() => setTeiknSlag(slag)}>{slag}</button>
          ))}
        </div>
      )}
      {mounted && !teikn && vald !== null && valdGruppe === null && rom && modus !== "bit" && (
        <div className="speil" style={{ top: toppH + 6, left: 0, right: benk ? KOL : 84 }} role="group" aria-label="spegl planet">
          {(["x", "y", "z"] as const).map((akse, i) => (
            <button key={akse} type="button" className={ORD + " min-w-12"} aria-label={`spegl planet om ${akse}`} title={`spegelkopi om ${akse}; i same plan vert forma snudd`} onClick={() => speglValt(i)}>spegl {akse}</button>
          ))}
          {[2, 3, 4].map((N) => <button key={N} type="button" className={ORD + " min-w-12"} aria-label={`${N} rundt`} title={`${N} plan kring midtaksen, som ei gruppe`} onClick={() => rundtValt(N)}>×{N}</button>)}
        </div>
      )}

      {/* kva fingrane gjer, i tal, so lenge dei er nede: øvst til VENSTRE i
          det frie bandet — synskuben har det høgre hjørnet */}
      {gestTekst && (
        <div data-lesing="" className="pointer-events-none absolute flex justify-start" style={{ top: toppH + 10, left: 14 }} aria-hidden="true">
          <span className="tab text-[26px] leading-none tracking-[0.02em]" style={{ opacity: 0.5 }}>{gestTekst}</span>
        </div>
      )}

      {/* Symmetri for neste snitt. På ei vald plate er dei same aksane
          handlingar som speglar teikninga. Bandet tek berre fingrar på
          orda og ligg under handtaka, klårt av synskuben. */}
      {mounted && !teikn && vald === null && rom && modus !== "bit" && (
        <div className="speil" style={{ top: toppH + 6, left: 0, right: benk ? KOL : 0 }} role="group" aria-label="symmetri">
          {(["x", "y", "z"] as const).map((ord, a) => (
            <button
              key={ord}
              type="button"
              aria-label={`speil ${ord}`}
              aria-pressed={(speil & (1 << a)) !== 0}
              title={`speil snittet om ${ord}-planet gjennom midten: skjer låser båe`}
              onClick={() => setSpeil((q) => q ^ (1 << a))}
              className={ORD + " w-11 shrink-0"}
              data-speil={ord}
            >
              {ord}
            </button>
          ))}
        </div>
      )}

      {/*
        TOMMELSPALTA. Skjer står der høgre tommelen alt er: nedst til høgre,
        over arket, 64 pikslar. Med eit plan valt er skissa gøymd — det er
        ingenting å skjere — og då står den store plassen tom, so
        reiskapane fell ned i han. Over han: skissebrytaren, og med eit plan
        valt òg slett — og dei to streka, gods og hòl, som teiknar i profilen
        hans. Er eit strek valt, er det streken slett tek. Ikon, aldri ord.
        Prikken i hjørnet er motoren som reknar. På benken står spalta nedst
        i lerretet, ved kolonna.

        OG HO BER BERRE DET FANA KAN SYNE.

        Ein reiskap er eit spørsmål og eit svar: du trykkjer, og noko
        endrar seg framfor deg. Står svaret i eit bilete som ikkje er oppe,
        er knappen berre eit spørsmål — og eit spørsmål utan svar er verre
        enn ingen knapp. Difor: i rommet («flate» og «lag») står alle,
        av di det er DER kroppen, plana og skissa er teikna. På plateflata
        står dei to som ein knapp kan gjere åleine og arket syner med ein
        gong — dubler og slett. I montasjen står steget, og ikkje anna: han
        endrar ingenting i det heile.
      */}
      {mounted && (
        <div
          className="tumme"
          style={{ right: (benk ? KOL : 0) + 16, top: Math.max(toppH + 8, kubeBotn + 8), bottom: benk ? rute.botn + 16 : `calc(${arkH}px + env(safe-area-inset-bottom) + 4px)` }}
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
          {/*
            MONTASJEN HAR ÉIN KONTROLL, OG DET ER STEGET.

            Fana er reiskapen no: du står i montasjen av di du valde han
            øvst, og spalta ber det einaste som er att å gjere her.

            TO GESTAR, OG BEGGE ER LÆRDE FRÅ FØR. Eit drag opp og ned tek
            deg dit du vil sjå og let deg STÅ der, som bøyen og lupa: ein
            animasjon du ikkje kan stoppe midt i er ein animasjon du må sjå
            fire gonger. Og eit trykk spelar han om att frå golvet — «sjå det
            ein gong til», utan at nokon må lære eit dobbelttrykk til.
          */}
          {view === "montasje" && (
            <button
              type="button"
              data-montasje=""
              aria-label="steget"
              title={`montasjen: steg ${montSteg} av ${mont?.steg ?? 1}. dra opp og ned for å stå midt i han; trykk for å sjå han om att`}
              className={TUMME_BTN}
              style={{ touchAction: "none", cursor: "ns-resize" }}
              onPointerDown={(e) => {
                if (montNed.current) return
                montNed.current = { id: e.pointerId, y: e.clientY }
                e.currentTarget.setPointerCapture(e.pointerId)
                montDra.current = e.clientY
                montSpel.current = false
                setSkrubbar(true)
              }}
              onPointerMove={(e) => {
                if (montDra.current === null || !mont) return
                const dy = e.clientY - montDra.current
                montDra.current = e.clientY
                montT.current = Math.min(mont.steg, Math.max(0, montT.current - dy / MONT_STEG_PX))
                montVakn.current?.()
              }}
              onPointerUp={(e) => {
                const ned = montNed.current
                if (!ned || ned.id !== e.pointerId) return
                montDra.current = null
                montNed.current = null
                setSkrubbar(false)
                if (Math.abs(e.clientY - ned.y) > 6) return
                montT.current = 0
                montSpel.current = true
                setMontSteg(1)
                montVakn.current?.()
              }}
              onPointerCancel={(e) => {
                if (montNed.current && montNed.current.id !== e.pointerId) return
                montDra.current = null
                montNed.current = null
                setSkrubbar(false)
              }}
            >
              {IcoMontasje}
            </button>
          )}
          {/* RUTENETTET HØYRER ROMMET TIL. Han vert sett med TO FINGRAR PÅ
              OBJEKTET, og på plateflata ligg objektet gøymt under arka — ein
              brytar du kan slå på og ikkje bruke. */}
          {rom && (<>
              {/* TEIKNE EI FLATE: dra ein firkant. Han står FØRST i
                  reiskapane, av di han er den eine som lagar noko frå
                  ingenting — resten endrar det som står. */}
              {rom && (
                <button
                  type="button"
                  aria-pressed={!!teikn}
                  aria-label="teikn ei flate"
                  title={teikn ? "teikn (T): vel firkant eller kontur; slepp for å lukke, escape avbryt" : "teikn ei flate (T): firkant eller fri kontur. Punkta er handtak etterpå"}
                  onClick={vekslTeikn}
                  className={TUMME_BTN}
                  data-teiknknapp={teikn ? "klar" : ""}
                >
                  {IcoTeikn}
                </button>
              )}
          {/* RUTENETTET. Han stod i lina på arket, ved talet han endrar. Men
              han er ein REISKAP og ikkje eit tal: to fingrar set kolonner og
              rader, som skissa og kroppen gjer det, og reiskapane bur i denne
              spalta. Difor øvst her, over dei andre. */}
          <button
            type="button"
            aria-pressed={modus === "rute"}
            aria-label="rutenett"
            title={modus === "rute" ? "rutenettet (R): to fingrar — vassrett er kolonner, loddrett er rader. trykk for å gå ut" : "rutenettet (R): to fingrar set kolonner og rader"}
            onClick={vekslRute}
            className={TUMME_BTN}
            data-ruteverkty=""
          >
            {IcoRute}
          </button>
          </>)}
          {/* Og reiskapane for PLANET står ikkje medan kroppsverktyet er ope.
              Der er det bitane du held på med, og eit trykk på objektet vel
              ein bit — men det vel planet under han òg, og då stod begge
              setta i spalta samstundes: elleve knappar, klemte ned til 40
              px kvar. Verktyet seier kva du arbeider med. */}
          {/*
            OG PÅ PLATA STÅR BERRE DEI SOM EIN KNAPP KAN GJERE ÅLEINE.

            Ein del på plata ER eit plan, so eit trykk på han vel planet —
            og då skal det gå an å ta planet bort, eller ta eitt til likt
            det. Dei to er knappar og ikkje anna, og svaret på dei er
            teikna rett framfor deg: ei rute mindre, eller ei rute meir.

            Resten treng ROMMET. Hòlet legg ein ring du flyttar og dreg med
            handtaka på snittet, forma frys profilen til punkt du dreg i,
            bøyen er ein skrubbar med snittet som avlesing, fordel gjeld
            eit drag på ei gruppe — og alle fire teiknar seg på lerretet,
            som ligg gøymt under arka her. Ein reiskap du kan trykkje på og
            ikkje sjå er ein reiskap som lyg.

            OG I MONTASJEN STÅR INGEN AV DEI. Han ER ei lesing: han endrar
            ingenting, og ei rad du trykte på i arket skal ikkje gje deg to
            knappar som gjer det.
          */}
          {vald !== null && modus !== "bit" && view !== "montasje" && (
            <>
              <button
                type="button"
                aria-label={valdGruppe !== null ? "dubler gruppa" : "dubler planet"}
                title={valdGruppe !== null ? "ei gruppe til, lik denne, kvart plan skuva eit hakk langs normalen sin (D)" : "eitt plan til, likt dette, skuva eit hakk langs normalen (D)"}
                onClick={() => dupliserPlan(vald)}
                className={TUMME_BTN}
              >
                {IcoDupliser}
              </button>
              {rom && valdGruppe === null && (
                <button
                  type="button"
                  aria-label="skjer hòl"
                  title="skjer eit hòl: ein ring midt i snittet. flytt, vri og dra han større (H)"
                  onClick={() => leggStrek("hol")}
                  className={TUMME_BTN}
                >
                  {IcoHol}
                </button>
              )}
              {/* SNAPPET, SOM EIT ORD.
                  Knappen er ikkje eit ikon: det han seier er eit TAL, og eit
                  ikon for «45 grader» er ei teikning av eit tal. Eitt trykk
                  tek deg eitt steg vidare i ringen — av, 15, 45, 90 — og
                  ordet på knappen er alltid det som gjeld NO. Ein brytar som
                  syner kva han vil gjere i staden for kva han gjer er ein
                  brytar du må trykkje på for å lesa. */}
              {/* og han høyrer ROMMET til, som dei andre reiskapane: på plata
                  snappar delane til rutenettet på arket, og det er ein annan
                  snapp med eit anna tal. To brytarar som såg like ut og
                  styrte kvar sitt ville vore verre enn ein knapp for lite. */}
              {rom && (
              <button
                type="button"
                aria-label={`snapp ${SNAPP_NAMN[snappNo]}`}
                title="kva vinklar snappet kjenner: av, 15°, 45°, 90°. gjeld både punkta i eit omriss og vridinga av eit plan (S)"
                onClick={vekslSnapp}
                className={TUMME_BTN + " tab text-[11px] leading-none"}
                data-snapp={SNAPPSTEG[snappNo]}
                style={snappNo === 0 ? { opacity: 0.35 } : undefined}
              >
                {SNAPP_NAMN[snappNo]}
              </button>
              )}
              {/* FORMA: eitt trykk frys profilen til punkt du kan dra i, eit
                  dobbelttrykk gjer dei fire til boksen kring forma, og eit
                  trykk til slepper det heile. Merket seier om planet ber ei
                  form no; kva det NESTE trykket gjer, seier tittelen. */}
              {rom && valdGruppe === null && (
                <button
                  type="button"
                  aria-pressed={harOmriss}
                  aria-label="form"
                  title={harOmriss ? "forma (O): dra punkta i profilen. dobbelttrykk for boksen kring dei, eitt trykk slepper forma" : "forma (O): frys profilen til punkt du kan dra i. dobbelttrykk for boksen kring han"}
                  disabled={!harOmriss && !snitt}
                  onClick={formTrykk}
                  className={TUMME_BTN}
                  data-form=""
                >
                  {IcoForm}
                </button>
              )}
              {rom && valdGruppe === null && harOmriss && (
                <button type="button" aria-label="2d-flata" title="planet flatt: dra punkt, legg til, rund, teikn hòl" onClick={() => setFlatt(true)} className={ORD} data-flatt="">2d</button>
              )}
              {rom && valdGruppe === null && (
                <button type="button" aria-pressed={bunde} aria-label="bunde av nettet" title={bunde ? "profilen er bunden av nettet. trykk for å sleppe han" : "profilen er fri av nettet. trykk for å binde omrisset til kroppen"} onClick={vekslNett} disabled={!harOmriss && !snitt} className={ORD} data-nett="">
                  nett
                </button>
              )}
              {/* FORDEL: kva rada gjer med det leiaren får. Saman, eller
                  frå den eine enden til leiaren — ei dreiing vert ei vifte,
                  eit skuv eit nytt mellomrom. Eit ord, av di det er eit ord. */}
              {rom && valdGruppe !== null && (
                <button
                  type="button"
                  aria-pressed={fordel}
                  aria-label="fordel"
                  title={fordel ? "fordelt: den eine enden står, leiaren tek alt, rada tek sin del. trykk for saman" : "saman: heile gruppa fylgjer leiaren. trykk for fordelt — vifte og mellomrom"}
                  onClick={() => setFordel((f) => !f)}
                  className={ORD}
                  data-fordel=""
                >
                  fordel
                </button>
              )}
              {/* BØYEN: TRYKK OG DRA, som lupa. Ein skyvar ville teke ei
                  rad i arket for noko som gjeld eitt plan, og handtaka på
                  snittet er alt tre. Draget er buelengd og ikkje pikslar:
                  hundre pikslar er ein halv bøy same kva skjerm du held.

                  OG EIT DOBBELTTRYKK RETTAR PLANET UT ATT. Ein skrubbar har
                  ingen veg attende til null utan at du dreg deg dit og
                  bommar på siste hundredelen; knappen er sin eigen veg ut,
                  som forma er det. Eit trykk er eit trykk berre når det
                  ikkje flytte seg — elles er det byrjinga på eit drag. */}
              {rom && valdStrek === null && valdGruppe === null && (
                <button
                  type="button"
                  data-boy=""
                  aria-label="bøy planet"
                  title="dra opp og ned: bøy planet. materialet set grensa, og regelen seier kvar ho går. dobbelttrykk rettar han ut att"
                  className={TUMME_BTN}
                  style={{ touchAction: "none", cursor: "ns-resize" }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId)
                    boy.current = e.clientY
                    boyNed.current = e.clientY
                    setSkrubbar(true)
                  }}
                  onPointerMove={(e) => {
                    if (boy.current === null || vald === null) return
                    const dy = e.clientY - boy.current
                    boy.current = e.clientY
                    boyPlan(vald, -dy * BOY_STEG)
                  }}
                  onPointerUp={(e) => {
                    const ned = boyNed.current
                    boy.current = null
                    boyNed.current = null
                    setSkrubbar(false)
                    if (ned === null || vald === null || Math.abs(e.clientY - ned) > 6) return
                    const no = performance.now()
                    const dobbelt = no - sisteBoy.current < DOBBELT_MS
                    sisteBoy.current = no
                    if (dobbelt) boyPlan(vald, -(plan.find((q) => q.id === vald)?.bog ?? 0))
                  }}
                  onPointerCancel={() => { boy.current = null; boyNed.current = null; setSkrubbar(false) }}
                >
                  {IcoBoy}
                </button>
              )}
              <button
                type="button"
                aria-label={valdStrek !== null ? "slett strek" : valdGruppe !== null ? "slett gruppa" : "slett"}
                title={valdStrek !== null ? "ta streken bort (⌫)" : valdGruppe !== null ? "ta heile gruppa bort (⌫)" : "ta det valde planet bort (⌫)"}
                onClick={valdStrek !== null ? slettStrek : () => slett(vald)}
                className={TUMME_BTN}
                style={{ color: "var(--warn)" }}
              >
                {IcoSlett}
              </button>
            </>
          )}
          {rom && (<>
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
            title={modus === "bit" ? "verktyet for kroppen (K): trykk ein bit, to fingrar flyttar, vrir og skalerer han. trykk for å gå ut" : "verktyet for kroppen (K): flytt, vri og skaler bitane han er sett saman av"}
            onClick={vekslBit}
            className={TUMME_BTN}
            data-bitverkty=""
          >
            {IcoBit}
          </button>

          {/* SKJER, og ikkje anna. Med eit plan valt stod her eit merke som
              sa «ferdig», og det var ein knapp for å slutte å gjere noko:
              eit trykk utanfor planet, eit trykk på rada hans, escape —
              alle tre slepper han frå før. So med eit plan valt står den
              store knappen tom, og reiskapane hans fell ned i staden. */}
          {vald === null && (
            <button
              type="button"
              onClick={laas}
              disabled={!harSnitt}
              aria-label="skjer"
              title="skjer: skissa vert ein del (L)"
              className="skjer ikon"
            >
              {IcoSkjer}
              <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "var(--ink)", opacity: busy ? 1 : 0, transition: "opacity 200ms ease" }} />
            </button>
          )}
          </>)}
        </div>
      )}

      {/*
        BLADREN, NEDST TIL VENSTRE — motsett veg av reiskapane.

        Ti stolformer er éi line i menyen, og vegen til den neste gjekk
        gjennom han: opne menyen, finn familien, trykk. To trykk med
        kroppen dekt, kvar gong, for det som er EITT val — er denne
        stolen den rette? Her er det eitt trykk, og menyen står ikkje i
        vegen for å svare.

        Han står berre når svaret finst: ein bit vald, og fleire utgåver i
        familien hans. Og han går den same vegen som menyen — `leggBit`
        med familien — so angre, lenkja og økta ser det same bytet dei
        alltid har sett.
      */}
      {mounted && rom && modus === "bit" && bla && (
        <div
          className="bla"
          style={{ left: 16, bottom: benk ? rute.botn + 16 : `calc(${arkH}px + env(safe-area-inset-bottom) + 4px)` }}
        >
          <button
            type="button"
            aria-label="bla"
            title={`bla til den neste utgåva av ${bla} (B): same plassen, same storleiken, ei anna form`}
            onClick={() => leggBit(bla)}
            className={ORD}
            data-bla=""
          >
            bla
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
        mont={mont}
        montSteg={montSteg}
        onFiksAlle={fiksAlle}
        boks={kropp ? { min: kropp.min, max: kropp.max } : null}
        vald={vald}
        onVald={velPlan}
        valdGruppe={valdGruppe}
        onVelGruppe={velGruppe}
        onSlettGruppe={slettGruppe}
        mjuk={mjukNo}
        onMjuk={(v) => vald !== null && mjukPlan(vald, v - mjukNo)}
        virr={virr}
        onVirr={(v) => { virrPlan(v - virr); setVirr(v) }}
        onFarge={setFarge}
        bitFarge={valdBit !== null ? (bitar[valdBit]?.farge ?? 0) : null}
        onBitFarge={fargBit}
        onSlett={slett}
        onMeny={planMeny}
        onSkiftVel={skiftVel}
        busy={busy}
        feil={feil}
        melding={melding}
        hentar={hentar}

        onExport={doExport}
        onReset={() => endre({ ...MOTOR.defaults, kjelde: params.kjelde })}
        verkty={verkty}
        onVerkty={opneVerkty}
        onHogd={setArkH}
      />
      <Meny stad={meny} onLukk={() => setMeny(null)} />
    </main>
  )
}
