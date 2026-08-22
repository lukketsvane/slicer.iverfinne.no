"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DetailKey, ExportKind, Metrics, ParamBag, Rule, View } from "@/lib/core"
import { KUBE } from "@/lib/sources"
import { VAFFEL } from "@/lib/vaffel/engine"
import type { BuildRes, MaalRes, Req, Res, SynRes } from "@/lib/worker"
import { Viewer, type LightDir } from "./viewer"
import { ControlsPanel } from "./controls-panel"
import type { NudgeAxis } from "./gesture-params"

/** kor mange piksel to-fingers-rulling må dra for å sveipe eit heilt band */
const NUDGE_RANGE_PX = 420
/** ei fil på meir enn dette er ikkje ein modell, det er eit uhell */
const MAX_FIL = 220 * 1024 * 1024

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (min-width: 1024px)")
    const sync = () => setDesktop(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return desktop
}

export function Studio() {
  const [params, setParams] = useState<ParamBag>(() => ({ ...VAFFEL.defaults }))
  // «lag» fyrst: ribbene slik dei faktisk står. Det er dei som ER objektet,
  // og det er dei som skil reiskapen frå ein framsyningsmodell. Nettet du
  // kom med er eit klikk unna.
  const [view, setView] = useState<View>("lag")
  const [hiDetail, setHiDetail] = useState(false)
  const [light, setLight] = useState<LightDir>({ az: 0.62, el: 0.92 })
  const [data, setData] = useState<BuildRes | null>(null)
  // Måltala kjem i eiga melding etter nettet, og berre for det siste
  // punktet: under eit drag står den førre tavla dimma til fingeren
  // stoggar, i staden for at kvart einaste mellombilete vert rekna på.
  const [tal, setTal] = useState<MaalRes | null>(null)
  const [syn, setSyn] = useState<SynRes | null>(null)
  const [busy, setBusy] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  /** id → filnamn, for pilla. Nettet sjølv bur i arbeidaren. */
  const [namn, setNamn] = useState<Record<string, string>>({})
  const isDesktop = useIsDesktop()

  const worker = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const shown = useRef(0)
  // Siste-vinn-porten: aldri meir enn eitt bygg i lufta. Ein skyvar som
  // vert dregen lagar punkt fortare enn motoren byggjer dei, og utan port
  // stiller kvart einaste mellombilete seg i kø i arbeidaren — som so
  // byggjer nett ingen kjem til å sjå. Med porten vert eit uteståande punkt
  // berre BYTT UT til bygget i lufta er ferdig, og draget går i nøyaktig
  // den takta maskina faktisk klarar.
  const inFlight = useRef(false)
  const pending = useRef<Req | null>(null)
  const pump = useCallback(() => {
    if (inFlight.current || !pending.current) return
    inFlight.current = true
    worker.current?.postMessage(pending.current)
    pending.current = null
  }, [])

  // Hashen er ikkje til å stole på: kvart felt vert lese for seg og klemt
  // inn i sitt eige band av motoren sin eigen clamp, så inga laga lenkje kan
  // skyve NaN eller framande verdiar inn i geometrien.
  useEffect(() => {
    setMounted(true)
    try {
      const h = window.location.hash.slice(1)
      if (!h.startsWith("p=")) return
      const obj = JSON.parse(decodeURIComponent(h.slice(2))) as Record<string, unknown>
      // Kjelda kan ikkje reise med ei lenkje: nettet er megabyte og ligg
      // berre i den maskina som lasta det opp. Ei lenkje som peikar på ei
      // fil denne nettlesaren ikkje har, fell attende på kuben — og då står
      // alle dei andre innstillingane som dei skal.
      setParams((p) => VAFFEL.clamp({ ...obj, kjelde: KUBE }, p))
      const v = obj.view
      if (v === "lag" || v === "kontur" || v === "flate") setView(v)
    } catch {
      // øydelagd hash — lat standardobjektet stå
    }
  }, [])

  useEffect(() => {
    const w = new Worker(new URL("../lib/worker.ts", import.meta.url), { type: "module" })
    worker.current = w
    w.onmessage = (e: MessageEvent<Res>) => {
      const r = e.data
      if (r.kind === "build") {
        // porten opnar att, og eit venta punkt får gå
        inFlight.current = false
        pump()
        // Eit svar som er eldre enn det sist viste er alltid forelda:
        // meldingane kjem ikkje nødvendigvis i den rekkjefylgja dei vart
        // sende.
        if (r.id < shown.current) return
        shown.current = r.id
        setData(r)
        return
      }
      if (r.kind === "maal") {
        setTal(r)
        // fyrst når rekninga for det siste punktet er inne, er motoren ferdig
        if (r.id >= reqId.current) setBusy(false)
        return
      }
      if (r.kind === "syn") {
        setSyn((prev) => (prev && prev.id > r.id ? prev : r))
        return
      }
      if (r.kind === "kjelde") {
        setNamn((m) => ({ ...m, [r.src.id]: r.src.label }))
        setParams((p) => ({ ...p, kjelde: r.src.id }))
        setFeil(null)
        return
      }
      if (r.kind === "feil") {
        if (r.kva === "import") {
          setFeil(r.kvifor ?? "las ikkje fila")
          setBusy(false)
          return
        }
        // bygget kasta: slepp porten fri og lat det førre objektet stå
        inFlight.current = false
        pump()
        if (r.id >= reqId.current) setBusy(false)
        return
      }
      const blob = r.text
        ? new Blob([r.text], { type: r.mime })
        : new Blob([r.data as ArrayBuffer], { type: r.mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = r.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      setBusy(false)
    }
    return () => {
      w.terminate()
      worker.current = null
    }
    // pump er stabil (useCallback utan avhengnader)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const detail: DetailKey = hiDetail && isDesktop ? "hog" : isDesktop ? "mid" : "lav"

  // To steg: eit grovt nett med det same, det fine når fingeren stoggar.
  // Under eit drag er det grove alt ein rekk å sjå, og det fine ville berre
  // stå i kø og gjere alt tregare. Vert punktet endra før det fine steget
  // fyrer, vert det avlyst av oppryddinga — det er heile logikken.
  //
  // Det GROVE steget låg òg på ei klokke, på fire og tjue millisekund. Ei
  // klokke som vart avlyst av oppryddinga kvar gong punktet flytta seg —
  // og under eit drag flyttar det seg oftare enn det. Klokka fyrte difor
  // aldri: objektet stod bom stille heilt til fingeren slapp. Ho trongst
  // ikkje heller. `pump` held berre EIN førespurnad om gongen og byter
  // ut han som ventar, so arbeidaren kan ikkje druknast uansett kor fort
  // ein dreg.
  useEffect(() => {
    if (!mounted) return
    setBusy(true)
    // Ei feilmelding frå ein import står i hovudlina, PÅ PLASSEN til
    // delar, kutt og ark. Ho vart berre rydda vekk av ein ny import, so
    // ein som prøvde ei Draco-komprimert fil og gav opp mista dei tre
    // tala for resten av økta. Rører du ein skyvar, har du lese henne.
    setFeil(null)
    const enqueue = (d: DetailKey) => {
      const id = ++reqId.current
      pending.current = { kind: "build", id, params, detail: d, view }
      pump()
    }
    enqueue("lav")
    if (detail === "lav") return
    const t = window.setTimeout(() => enqueue(detail), 300)
    return () => window.clearTimeout(t)
  }, [params, detail, view, mounted, pump])

  // URL-en kodar alltid det objektet som står på skjermen — bortsett frå
  // nettet, som ingen URL kan bera.
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      const { kjelde, ...rest } = params
      void kjelde
      window.history.replaceState(
        null,
        "",
        "#p=" + encodeURIComponent(JSON.stringify({ ...rest, view })),
      )
    }, 500)
    return () => window.clearTimeout(t)
  }, [params, view, mounted])

  /**
   * Resten som ikkje vart eit heilt steg.
   *
   * Fingeren flyttar seg nokre få pikslar per hending, og eit ribbetal er
   * eit heiltal. Vert kvar hending runda av for seg, er kvar av dei null:
   * seks pikslar er fire tidels ribbe, det rundar til null, og gesten som
   * står i README-en gjorde ingenting. Berre eit rykk stort nok til å
   * krysse ein halv ribbe i EI hending kom gjennom, og då som eit hopp.
   *
   * Difor vert resten liggjande att her til neste hending.
   */
  const rest = useRef<Record<string, number>>({})

  const nudge = useCallback((axis: NudgeAxis, deltaPx: number) => {
    const key = VAFFEL.nudge[axis]
    const r = VAFFEL.ranges[key]
    if (!r) return
    const raa = (deltaPx / NUDGE_RANGE_PX) * (r.max - r.min) + (rest.current[key] ?? 0)
    const steg = r.int ? Math.trunc(raa) : raa
    rest.current[key] = r.int ? raa - steg : 0
    if (steg === 0) return
    setParams((cur) => {
      const at = typeof cur[key] === "number" ? (cur[key] as number) : r.min
      const v = Math.min(r.max, Math.max(r.min, at + steg))
      // Ligg han mot ei grense, skal ikkje resten hope seg opp: elles må
      // du dra like langt attende før noko skjer.
      if (v === at) rest.current[key] = 0
      return v === at ? cur : { ...cur, [key]: r.int ? Math.round(v) : +v.toFixed(4) }
    })
  }, [])

  const nudgeLight = useCallback((dx: number, dy: number) => {
    setLight((l) => ({
      az: l.az + dx * 0.012,
      el: Math.min(1.4, Math.max(0.12, l.el - dy * 0.008)),
    }))
  }, [])

  const doExport = useCallback(
    (what: ExportKind) => {
      setBusy(true)
      // utanom porten: eit klikk, ikkje ein straum — og svaret slepp porten fri
      const msg: Req = { kind: "export", id: ++reqId.current, params, what }
      worker.current?.postMessage(msg)
    },
    [params],
  )

  const share = useCallback(() => {
    const url = window.location.href
    if (navigator.share) void navigator.share({ url })
    else void navigator.clipboard?.writeText(url)
  }, [])

  /**
   * Fila inn. Ho vert lesen på hovudtråden — det er berre kopiering — og
   * SENDT til arbeidaren, som gjer alt det tunge: tolking, sveis,
   * forenkling. Bufferen vert overført og ikkje kopiert, so eit skann på
   * hundre megabyte kryssar trådgrensa utan at det finst to av det.
   */
  const takeFile = useCallback(async (f: File) => {
    if (f.size > MAX_FIL) {
      setFeil("fila er for stor")
      return
    }
    setFeil(null)
    setBusy(true)
    try {
      const buf = await f.arrayBuffer()
      const msg: Req = { kind: "import", id: ++reqId.current, name: f.name, buf }
      worker.current?.postMessage(msg, [buf])
    } catch {
      setFeil("fekk ikkje lese fila")
      setBusy(false)
    }
  }, [])

  // Slepp ei fil kvar som helst på sida. Ein reiskap som krev at du finn
  // ein bestemt firkant å sleppe i, er ein reiskap som ikkje har forstått
  // kva ein drar-og-slepp er.
  useEffect(() => {
    let depth = 0
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return
      e.preventDefault()
      depth++
      setDrag(true)
    }
    const move = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault()
    }
    const out = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDrag(false)
    }
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0]
      if (!f) return
      e.preventDefault()
      depth = 0
      setDrag(false)
      void takeFile(f)
    }
    window.addEventListener("dragenter", over)
    window.addEventListener("dragover", move)
    window.addEventListener("dragleave", out)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragenter", over)
      window.removeEventListener("dragover", move)
      window.removeEventListener("dragleave", out)
      window.removeEventListener("drop", drop)
    }
  }, [takeFile])

  const metrics: Metrics | null = tal?.metrics ?? null
  const rules: Rule[] = useMemo(() => tal?.rules ?? [], [tal])
  const kjelde = String(params.kjelde ?? KUBE)
  const kjeldeNamn = kjelde === KUBE ? "kube" : (namn[kjelde] ?? "nett")

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: "var(--paper)" }}>
      <div className="absolute inset-0">
        {mounted && (
          <Viewer
            data={data}
            view={view}
            material={String(params.material ?? "finer")}
            hiDetail={hiDetail && isDesktop}
            mobile={!isDesktop}
            light={light}
            onNudge={nudge}
            onLight={nudgeLight}
          />
        )}
      </div>

      {/* Eitt ord og ei lenkje. Alt anna sida har å seie, seier objektet. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="text-[11px] tracking-[0.22em]" style={{ color: "var(--ink)" }}>
          SLICERMAN
        </div>
        <a
          href="https://iverfinne.no"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto text-[11px] tracking-wide opacity-60 hover:opacity-100"
          style={{ color: "var(--ink)" }}
        >
          iverfinne.no
        </a>
      </header>

      {drag && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--paper) 82%, transparent)" }}
        >
          <div
            className="rounded-2xl border border-dashed px-6 py-4 text-[11px] uppercase tracking-[0.2em]"
            style={{ borderColor: "var(--ink)", color: "var(--ink)" }}
          >
            slepp nettet
          </div>
        </div>
      )}

      <ControlsPanel
        params={params}
        kjelde={kjeldeNamn}
        metrics={metrics}
        rules={rules}
        view={view}
        syn={syn?.svg ?? null}
        hiDetail={hiDetail}
        isDesktop={isDesktop}
        busy={busy}
        feil={feil}
        onChange={setParams}
        onView={setView}
        onReset={() => setParams((p) => ({ ...VAFFEL.defaults, kjelde: p.kjelde }))}
        onToggleDetail={() => setHiDetail((d) => !d)}
        onExport={doExport}
        onShare={share}
        onFile={(f) => void takeFile(f)}
      />
    </main>
  )
}
