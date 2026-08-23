"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from "react"
import {
  MATERIALS,
  TJUKNER,
  nn,
  type ExportKind,
  type Material,
  type Metrics,
  type ParamBag,
  type Range,
  type Rule,
  type View,
} from "@/lib/core"
import { FORMAT } from "@/lib/io"
import { VAFFEL } from "@/lib/vaffel/engine"
import { SKALAR, type SkalaId } from "@/lib/skala"

/**
 * SLICERMAN — kontrollflata.
 *
 * Eit flytande ark nedst med tre tilstandar. Lukka er det éi line — kjelda,
 * tre tal og to knappar — og objektet eig heile skjermen. Halvope kjem
 * lesemåtane, materialet, delane og eksporten. Heilt ope kjem skyveveggen.
 *
 * Det som står i sjølve lina er dei tre tala som avgjer om uttaket er verdt
 * å skjere: kor mange delar det er, kor mange meter kutt det er, og kor
 * mange plater du må ha. Ein leikegrind gøymer rekninga; ein reiskap har
 * henne i panna.
 *
 * Ingen tal vert rekna ut her. Alt kjem frå `metrics` og `rules`, som har
 * målt det objektet som faktisk står på skjermen.
 */

export type PanelMode = "lukka" | "halv" | "full"
export const PANEL_MODES: readonly PanelMode[] = ["lukka", "halv", "full"]

const VIEWS: readonly { id: View; label: string; hint: string; tast: string }[] = [
  { id: "flate", label: "flate", hint: "nettet slik det kom inn, etter forenkling og glatting", tast: "1" },
  { id: "lag", label: "lag", hint: "ribbene slik dei faktisk står, med spor", tast: "2" },
  { id: "kontur", label: "kontur", hint: "dei flate kuttprofilane", tast: "3" },
]

/**
 * NÅR EIN KNAPP IKKJE SKAL VERA TRYKKBAR.
 *
 * Ein knapp som leverer ei tom fil er ein knapp som lyg, og han lyg på det
 * verste tidspunktet: du lastar ned, opnar i LightBurn, ser eit tomt ark og
 * trur programmet er øydelagt.
 *
 * Det skjer i to tilfelle. Objektet gjev ingen delar — då er alt tomt. Eller
 * ingen del fekk plass på plata du har sett — då er profilarket og STL-en
 * framleis heile, men platene finst ikkje, so DXF-en og arka er tomme
 * dokument. Passprøva står alltid open: ho er ei plate med sju spor, og ho
 * treng ikkje eit objekt i det heile.
 */
function stengd(x: ExportKind, m: Metrics | null): string {
  if (x === "prove" || !m) return ""
  if (m.parts === 0) return "ingen delar å skjere — sjå reglane"
  if ((x === "ark" || x === "dxf") && m.sheets === 0) {
    return "ingen del fekk plass på plata — større plate, eller mindre objekt"
  }
  return ""
}

const EXPORTS: readonly { id: ExportKind; label: string; hint: string }[] = [
  { id: "stl", label: "stl", hint: "heile stabelen som trekantnett, til rendering og 3D-print" },
  { id: "dxf", label: "dxf", hint: "alle delane nesta på plate, med snittkompensasjon — til fresen" },
  { id: "svg", label: "svg", hint: "alle profilane ved sida av kvarandre, i 1:1" },
  { id: "ark", label: "ark", hint: "platene slik dei er pakka — ei fil per plate" },
  {
    id: "prove",
    label: "passprøve",
    hint: "ei lita plate med sju spor, kvart ein tjuedels millimeter breiare enn det førre. Skjer henne i plata du skal bruke, skyv eit avkapp ned i kvart spor, og sett klaringa til det som går inn med tommelkraft",
  },
]

/** Kva tastane gjer. Dei står i kvar sin tooltip òg, men ei samla line er
 *  den einaste staden nokon kan finne dei UTAN å vite at dei finst. */
const TASTAR = "f finn · ⇧f førre · 1 2 3 lesemåte · z angre · o panel"

const DASH = "–"
/** Plata er 2, 2,5 eller 3 mm. Rundar ein av desimalen, står det to
 *  knappar med «3» på — og den eine av dei set ei halv millimeter tynnare
 *  plate enn ho seier. Klaringa i kvart einaste spor kjem av det talet. */
const tjukn = (v: number) => nn(v, Number.isInteger(v) ? 0 : 1)
const n0 = (v: number) => nn(v, 0)
const n1 = (v: number) => nn(v, 1)

const decimals = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3)
/**
 * Eit tal inn i eit band.
 *
 * Klemminga er ikkje pynt. Ein skyvar kan ikkje gå utanfor bandet sitt, men
 * talfeltet ved sida av kan: der kan nokon skrive 9999 i storleiken, og
 * ingenting anna i reiskapen stoggar det.
 */
const snap = (v: number, r: Range) => {
  if (!Number.isFinite(v)) return r.min
  const c = Math.min(r.max, Math.max(r.min, v))
  return r.int ? Math.round(c) : +c.toFixed(4)
}
/** «1,5» er eit tal for eit menneske og NaN for Number() */
const lesTal = (raw: string) => Number(String(raw).replace(",", ".").replace(/\s+/g, ""))
const num = (p: ParamBag, k: string, fallback: number) =>
  typeof p[k] === "number" ? (p[k] as number) : fallback

const HAIR: CSSProperties = { borderColor: "var(--rule)" }
/** `hit` gjev peikaren eit svar på ei flate som elles er heilt still */
const ICON_BTN =
  "hit relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95"

function chipStyle(active: boolean): CSSProperties {
  return active
    ? { background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }
    : { color: "var(--ink)", borderColor: "var(--rule)" }
}
const CHIP =
  "hit min-h-[30px] rounded-full border px-3 text-[11px] leading-none tracking-[0.04em] transition active:scale-95 disabled:opacity-30"

/** Ikona er strekar, teikna her i staden for henta frå eit bibliotek:
 *  seks ikon er ikkje verdt ein avhengnad. */
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}
/** to piler som byter plass: gjev meg eit anna svar */
const IcoFinn = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...STROKE}>
    <path d="M2 18h2.9a4 4 0 0 0 3.4-1.9l5.4-8.2A4 4 0 0 1 17.1 6H22" />
    <path d="m18 2 4 4-4 4" />
    <path d="M2 6h2.9a4 4 0 0 1 3.4 1.9l.5.8" />
    <path d="m14.6 14.5.5.8a4 4 0 0 0 3.4 1.9H22" />
    <path d="m18 14 4 4-4 4" />
  </svg>
)
const IcoSliders = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...STROKE}>
    <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
  </svg>
)
const IcoDown = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...STROKE}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
const IcoUp = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...STROKE}>
    <path d="m18 15-6-6-6 6" />
  </svg>
)
const IcoVenstre = (
  <svg viewBox="0 0 24 24" className="h-3 w-3" {...STROKE}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)
const IcoHogre = (
  <svg viewBox="0 0 24 24" className="h-3 w-3" {...STROKE}>
    <path d="m9 18 6-6-6-6" />
  </svg>
)
const IcoAngre = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...STROKE}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
)
const IcoReset = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...STROKE}>
    <path d="M3 12a9 9 0 1 0 2.6-6.36" />
    <path d="M3 4v4.5h4.5" />
  </svg>
)
const IcoShare = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...STROKE}>
    <path d="M12 3v12" />
    <path d="m8 7 4-4 4 4" />
    <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
  </svg>
)
const IcoImport = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...STROKE}>
    <path d="M12 15V3" />
    <path d="m8 11 4 4 4-4" />
    <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </svg>
)

/**
 * Ringen kring finn-knappen.
 *
 * Søket tek eit par sekund, og eit par sekund utan svar er ikkje til å
 * skilje frå ein reiskap som har hengt seg. Ringen er ikkje pynt: han seier
 * at det går, og omtrent kor langt det er att.
 */
function Ring({ del }: { del: number }) {
  const R = 15.5
  const O = 2 * Math.PI * R
  return (
    <svg
      viewBox="0 0 36 36"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
    >
      <circle cx="18" cy="18" r={R} fill="none" stroke="var(--paper)" strokeOpacity="0.25" strokeWidth="2" />
      <circle
        cx="18"
        cy="18"
        r={R}
        fill="none"
        stroke="var(--paper)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={O}
        strokeDashoffset={O * (1 - Math.max(0.04, Math.min(1, del)))}
        style={{ transition: "stroke-dashoffset 150ms linear" }}
      />
    </svg>
  )
}

/** Reglane som eig kvart tal. Ei rad som ikkje veit kva regel som gjeld
 *  henne, står svart medan uttaket ikkje let seg skjere. */
const R_DELAR = ["delar", "grip", "lause"]
const R_GODS = ["gods", "spor"]
const R_ARK = ["plate", "utnytting"]
const R_NETT = ["nett", "lukka"]
const R_OPNING = ["opning"]

type TableRow = { label: string; value: string; unit: string; rules?: readonly string[] }

function tableRows(m: Metrics | null): TableRow[] {
  if (!m) {
    const tom = (label: string, unit: string): TableRow => ({ label, value: DASH, unit })
    return [
      tom("ytre mål", "mm"),
      tom("delar · unike", "stk"),
      tom("ledd", "stk"),
      tom("lause delar", "stk"),
      tom("kuttlengd", "m"),
      tom("masse", "kg"),
      tom("ark", "stk"),
      tom("utnytting", "%"),
      tom("minste gods", "mm"),
      tom("opning", "mm"),
      tom("sporbreidd", "mm"),
      tom("trekantar", "stk"),
      tom("opne kantar", "stk"),
    ]
  }
  const by: Record<string, readonly string[]> = {
    delar: R_DELAR,
    ledd: R_DELAR,
    lause: R_DELAR,
    ark: R_ARK,
    utnytting: R_ARK,
    gods: R_GODS,
    spor: R_GODS,
    opning: R_OPNING,
    nett: R_NETT,
    kantar: R_NETT,
  }
  return m.list.map((q) => ({
    label: q.label,
    value: q.text,
    unit: q.unit,
    rules: by[q.id],
  }))
}

/**
 * Éin skyvar: etiketten er låsen, prikken seier om han er teken.
 *
 * Talet til høgre er eit FELT og ikkje ei avskrift. Ein skyvar er god til å
 * leite og elendig til å treffe: den som vil ha nøyaktig 240 millimeter,
 * eller nøyaktig 0,15 i klaring frå passprøva, skal skrive det. Han står
 * som tekst til nokon tek han, so lina er like still som før.
 */
function SliderRow({
  k,
  r,
  value,
  onChange,
}: {
  k: string
  r: Range
  value: number
  onChange: (k: string, raw: string) => void
}) {
  // Eit val er ikkje ei mengd. Står det namn i bandet, er det namnet som
  // skal stå til høgre — «hundebein» seier kva det er; «1» seier ingenting.
  const shown = r.names
    ? (r.names[Math.round(value)] ?? String(value))
    : value.toFixed(decimals(r.step)).replace(".", ",")
  /** det som står i feltet medan det er teke; null når det ikkje er teke */
  const [utkast, setUtkast] = useState<string | null>(null)

  const send = () => {
    if (utkast === null) return
    const v = lesTal(utkast)
    setUtkast(null)
    // Tull i feltet er ikkje ei endring. Talet som stod, står.
    if (Number.isFinite(v)) onChange(k, String(v))
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="w-24 shrink-0 text-left text-[10px] uppercase leading-[1.2] tracking-[0.14em]"
        style={{ color: "var(--ink)" }}
      >
        {r.label}
      </span>
      <input
        type="range"
        className="pslider flex-1"
        min={r.min}
        max={r.max}
        step={r.step}
        value={value}
        aria-label={r.label}
        onChange={(e) => onChange(k, e.target.value)}
      />
      {r.names ? (
        <span
          className="tab w-[68px] shrink-0 truncate text-right text-[11px]"
          style={{ color: "var(--ink)" }}
        >
          {shown}
        </span>
      ) : (
        <span
          className="flex w-[68px] shrink-0 items-baseline justify-end text-[11px]"
          style={{ color: "var(--ink)" }}
        >
          <input
            className="tab talfelt min-w-0 flex-1 rounded bg-transparent text-right"
            value={utkast ?? shown}
            inputMode="decimal"
            aria-label={`${r.label}, tal`}
            title={`${r.label}: ${r.min}–${r.max}${r.unit ? " " + r.unit : ""}`}
            onFocus={(e) => {
              setUtkast(shown)
              e.currentTarget.select()
            }}
            onChange={(e) => setUtkast(e.target.value)}
            onBlur={send}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
              else if (e.key === "Escape") {
                setUtkast(null)
                e.currentTarget.blur()
              }
            }}
          />
          {r.unit && <span className="shrink-0 pl-0.5 opacity-45">{r.unit}</span>}
        </span>
      )}
    </div>
  )
}

export function ControlsPanel(props: {
  params: ParamBag
  kjelde: string
  metrics: Metrics | null
  rules: Rule[]
  view: View
  /** kva kjent ting som står ved sida av objektet, eller «av» */
  skala: SkalaId
  /** profilane som bilete (SVG-tekst), generert automatisk av arbeidaren */
  syn: string | null
  hiDetail: boolean
  isDesktop: boolean
  busy: boolean
  feil: string | null
  /** ei fil er undervegs inn: tala som står er frå det førre objektet */
  hentar: boolean
  /** eit ord attende på noko som elles ikkje synest, eit lite bel */
  melding: string | null
  mode: PanelMode
  /** kor langt søket er kome, eller null når det ikkje går noko søk */
  tunar: { gjort: number; av: number } | null
  /** kvar i svarlista vi står, eller null når lista ikkje gjeld lenger */
  finnStad: { nth: number; tal: number; ribbX: number; ribbY: number } | null
  kanAngre: boolean
  /** kor stor del av ruta arket dekkjer — kameraet stiller objektet inn i
   *  det som er att */
  onDekke: (d: number) => void
  onMode: (m: PanelMode) => void
  onChange: (p: ParamBag) => void
  onView: (v: View) => void
  onSkala: (s: SkalaId) => void
  onReset: () => void
  onAngre: () => void
  onToggleDetail: () => void
  onExport: (kind: ExportKind) => void
  onFinn: () => void
  onFinnAtt: () => void
  onShare: () => void
  onFile: (f: File) => void
}): JSX.Element {
  const {
    params,
    kjelde,
    metrics,
    rules,
    view,
    skala,
    syn,
    hiDetail,
    isDesktop,
    busy,
    feil,
    hentar,
    melding,
    mode,
    tunar,
    finnStad,
    kanAngre,
    onDekke,
    onMode,
    onChange,
    onView,
    onSkala,
    onReset,
    onAngre,
    onToggleDetail,
    onExport,
    onFinn,
    onFinnAtt,
    onShare,
    onFile,
  } = props

  // lukka → halv (lesemåtar, materiale, delane, eksport) → full (skyveveggen)
  const open = mode !== "lukka"
  const pick = useRef<HTMLInputElement | null>(null)

  /**
   * Kor mykje av ruta arket tek.
   *
   * Det er MÅLT og ikkje gjetta: arket er tre høgder, og kvar av dei er
   * ulik på ein telefon og på ein skjerm. Kameraet får talet og stiller
   * objektet inn i bandet som er att.
   */
  const arket = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = arket.current
    if (!el) return
    const meld = () => {
      // pluss botnmargen: han er like mykje dekt som arket sjølv
      const h = el.getBoundingClientRect().height + 24
      const del = Math.min(1, h / Math.max(1, window.innerHeight))
      // GROVKORNA MED VILJE.
      //
      // Kvart tal som kjem herifrå rammar scena inn på nytt, og ei
      // innramming er ei full forliking av scenegrafen. Arket veks med
      // nokre og tjue pikslar berre av at det kjem ei line i det —
      // framdriftslina under søket, til dømes. Utan trinn ville kvar slik
      // line rykt kameraet og ete hovudtråden midt medan søket gjekk;
      // framdrifta hoppa frå tolv steg til to.
      onDekke(Math.round(del / 0.06) * 0.06)
    }
    const ro = new ResizeObserver(meld)
    ro.observe(el)
    window.addEventListener("resize", meld)
    meld()
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", meld)
    }
  }, [onDekke])

  // Arket er eit iOS-ark: dra i grepet eller hovudlina, opp for meir og ned
  // for mindre. Fingeren får eit lite gummiband som svar medan han dreg, og
  // slepp han forbi terskelen, byter arket steg.
  const stepMode = useCallback(
    (dir: 1 | -1) => {
      const i = PANEL_MODES.indexOf(mode)
      onMode(PANEL_MODES[Math.min(2, Math.max(0, i + dir))])
    },
    [mode, onMode],
  )
  const dragging = useRef<{ y0: number; id: number } | null>(null)
  const [pull, setPull] = useState(0)
  const onSheetDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return
    dragging.current = { y0: e.clientY, id: e.pointerId }
  }
  const onSheetMove = (e: React.PointerEvent) => {
    const d = dragging.current
    if (!d || e.pointerId !== d.id) return
    setPull(Math.max(-26, Math.min(26, (e.clientY - d.y0) * 0.3)))
  }
  // eit drag skal ikkje OGSÅ vera eit trykk: kryssa fingeren terskelen,
  // vert klikket som elles ville fylgt svelgt
  const swallowClick = useRef(false)
  const onSheetUp = (e: React.PointerEvent) => {
    const d = dragging.current
    if (!d || e.pointerId !== d.id) return
    dragging.current = null
    setPull(0)
    const dy = e.clientY - d.y0
    swallowClick.current = Math.abs(dy) > 12
    if (dy < -34) stepMode(1)
    else if (dy > 34) stepMode(-1)
  }

  const broken = useMemo(() => {
    const hard = new Set<string>()
    const soft = new Set<string>()
    for (const r of rules) if (!r.ok) (r.hard ? hard : soft).add(r.id)
    return { hard, soft }
  }, [rules])
  const failed = useMemo(() => rules.filter((r) => !r.ok), [rules])
  const isHard = (ids: readonly string[]) => ids.some((id) => broken.hard.has(id))
  const isSoft = (ids: readonly string[]) => ids.some((id) => broken.soft.has(id))

  const rows = useMemo(() => tableRows(metrics), [metrics])

  const setParam = useCallback(
    (k: string, raw: string) => onChange({ ...params, [k]: snap(lesTal(raw), VAFFEL.ranges[k]) }),
    [params, onChange],
  )

  /** Dei tre tala som avgjer om uttaket er verdt å skjere, i sjølve lina.
   *  Panelet kan lukkast; rekninga kan ikkje. */
  const headline: { key: string; text: string; ids: readonly string[] }[] = metrics
    ? [
        { key: "delar", text: `${n0(metrics.parts)} delar`, ids: R_DELAR },
        { key: "kutt", text: `${n1(metrics.cutLen / 1000)} m`, ids: R_GODS },
        { key: "ark", text: `${n0(metrics.sheets)} ark`, ids: R_ARK },
      ]
    : []

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <section
        ref={arket}
        aria-label="kontrollar"
        aria-busy={busy}
        // Breiare enn ein telefon der det er plass: dei same knappane på
        // færre liner er eit lågare ark, og eit lågare ark er meir objekt.
        className="pointer-events-auto w-full max-w-md rounded-3xl border sm:max-w-xl"
        style={{
          ...HAIR,
          background: "var(--paper)",
          color: "var(--ink)",
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: dragging.current ? undefined : "transform 180ms ease",
        }}
      >
        <input
          ref={pick}
          type="file"
          accept={FORMAT.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            // same fil to gonger på rad skal fyre to gonger
            e.target.value = ""
          }}
        />

        {/* dragsona: grepet og hovudlina. Fingeren dreg arket mellom dei tre
            stega; knappane verkar som før av di eit trykk utan drag ikkje
            kryssar terskelen. */}
        <div
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
          onClickCapture={(e) => {
            if (swallowClick.current) {
              swallowClick.current = false
              e.preventDefault()
              e.stopPropagation()
            }
          }}
          style={{ touchAction: "none" }}
        >
          {open && (
            <div className="flex justify-center pt-1.5" aria-hidden="true">
              <div
                className="h-1 w-9 rounded-full"
                style={{ background: "color-mix(in srgb, var(--ink) 22%, transparent)" }}
              />
            </div>
          )}

          {/*
            TALA KAPPAST IKKJE.
            På ein smal telefon er det ikkje plass til kjelda, tre tal og
            tre knappar på ei line, og det som gav etter var tala: «12 delar
            · 17,…». Dei er heile grunnen til at lina finst. So på smale
            skjermar fell dei ned på si eiga line i staden, og får henne
            heil. Over fire hundre pikslar står alt som før.
          */}
          <div className="flex flex-wrap items-center gap-1.5 p-2.5">
            {/* Kjelda. Han er ikkje ein nedtrekk med tre demofigurar — han er
                DIN fil, og trykket opnar filveljaren. Kuben står der til
                nokon gjev han noko betre. */}
            <button
              type="button"
              onClick={() => pick.current?.click()}
              title={`${kjelde} — trykk for å hente eit nett (${FORMAT.join(" ")})`}
              aria-label="hent eit nett"
              className="hit flex h-9 min-w-0 max-w-[42%] shrink items-center gap-1.5 rounded-full border pl-2.5 pr-3 text-[11px] uppercase tracking-[0.14em] transition active:scale-95"
              style={{ ...HAIR, color: "var(--ink)" }}
            >
              <span className="shrink-0 opacity-70">{IcoImport}</span>
              <span className="min-w-0 flex-1 truncate text-left">{kjelde}</span>
            </button>

            {/* Tala er ikkje berre til å lese: eit trykk på dei opnar arket
                der grunngjevinga står. Det er den kortaste vegen frå «det
                står raudt» til «kvifor står det raudt». */}
            <button
              type="button"
              onClick={() => onMode(open ? "lukka" : "halv")}
              title={
                failed.length
                  ? "trykk for å sjå kva som ryk"
                  : "delar, kuttlengd og ark — trykk for kontrollane"
              }
              aria-label="delar, kuttlengd og ark"
              className={
                "tab min-w-0 flex-1 truncate pl-1 text-left text-[11px] tracking-[0.06em] " +
                "max-[399px]:order-last max-[399px]:w-full max-[399px]:flex-none max-[399px]:pt-2"
              }
            >
              {feil ? (
                <span style={{ color: "var(--warn)" }}>{feil}</span>
              ) : melding ? (
                <span className="opacity-70">{melding}</span>
              ) : hentar ? (
                // Tala som står er frå det objektet du hadde FØR. Å la dei
                // stå medan ei ny fil vert tolka er å seie noko om eit
                // objekt som ikkje er der.
                <span className="opacity-40">les fila …</span>
              ) : headline.length === 0 ? (
                <span className="opacity-40">snittar …</span>
              ) : (
                headline.map((h, i) => (
                  <span key={h.key}>
                    {i > 0 && <span className="px-1 opacity-30">·</span>}
                    <span
                      style={{
                        color: isHard(h.ids) ? "var(--warn)" : undefined,
                        opacity: isHard(h.ids) ? 1 : 0.62,
                        textDecoration: isSoft(h.ids) ? "underline dotted" : undefined,
                        textUnderlineOffset: 3,
                      }}
                    >
                      {h.text}
                    </span>
                  </span>
                ))
              )}
            </button>

            {/* prikken har fast plass, så lina står i ro medan motoren reknar */}
            <span
              aria-hidden="true"
              className="ml-auto block h-[5px] w-[5px] shrink-0 rounded-full"
              style={{
                background: "var(--ink)",
                opacity: busy && !tunar ? 0.8 : 0.12,
                transition: "opacity 200ms ease",
              }}
            />

            <button
              type="button"
              onClick={onFinn}
              disabled={busy}
              aria-label="finn innstillingar"
              title="finn innstillingar (F) — reknar gjennom eit titals rutenett og set det beste. Trykk igjen for det nest beste. Nettet, storleiken, tjukna og plata står."
              className={ICON_BTN + " disabled:opacity-100"}
              style={{ background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }}
            >
              {IcoFinn}
              {tunar && <Ring del={tunar.av ? tunar.gjort / tunar.av : 0} />}
            </button>
            <button
              type="button"
              onClick={() => onMode(open ? "lukka" : "halv")}
              aria-label={open ? "gøym kontrollane" : "vis kontrollane"}
              aria-expanded={open}
              title={open ? "gøym kontrollane (O)" : "vis kontrollane (O)"}
              className={ICON_BTN}
              style={{ ...HAIR, color: "var(--ink)" }}
            >
              {open ? IcoDown : IcoSliders}
            </button>
          </div>
        </div>

        {/*
          KVAR I SVARLISTA VI STÅR.
          Knappen reknar ei rangert liste og set det beste. Utan denne lina
          er andre trykk eit hopp utan retning: du veit ikkje at det finst
          tolv til, du veit ikkje kva du står på, og du kjem deg ikkje
          attende til det du nettopp hadde. Lina finst berre so lenge lista
          svarar på det spørsmålet som står — rører du storleiken eller
          plata, er ho borte.
        */}
        {(tunar || finnStad) && (
          <div
            className="flex items-center gap-1.5 px-2.5 pb-2 text-[10px] uppercase tracking-[0.14em]"
            aria-live="polite"
          >
            {tunar ? (
              <span className="tab" style={{ opacity: 0.55 }}>
                søkjer … {tunar.gjort} av {tunar.av}
              </span>
            ) : finnStad ? (
              <>
                <button
                  type="button"
                  onClick={onFinnAtt}
                  disabled={busy}
                  aria-label="førre svar"
                  title="førre svar (⇧F)"
                  className="hit flex h-6 w-6 items-center justify-center rounded-full border transition active:scale-90 disabled:opacity-30"
                  style={{ ...HAIR, color: "var(--ink)" }}
                >
                  {IcoVenstre}
                </button>
                <button
                  type="button"
                  onClick={onFinn}
                  disabled={busy}
                  aria-label="neste svar"
                  title="neste svar (F)"
                  className="hit flex h-6 w-6 items-center justify-center rounded-full border transition active:scale-90 disabled:opacity-30"
                  style={{ ...HAIR, color: "var(--ink)" }}
                >
                  {IcoHogre}
                </button>
                <span className="tab truncate pl-1" style={{ opacity: 0.55 }}>
                  {finnStad.nth + 1} av {finnStad.tal} · {finnStad.ribbX}×{finnStad.ribbY} ribber
                </span>
              </>
            ) : null}
          </div>
        )}

        {/* det utvidbare arket */}
        {open && (
          <div className="max-h-[56vh] overflow-y-auto overscroll-contain px-3 pb-3">
            {/* lesemåtane — tre ord held; kva dei tyder ligg i title */}
            <div className="flex flex-wrap items-center gap-1.5 py-1">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  title={`${v.hint} (${v.tast})`}
                  aria-pressed={view === v.id}
                  onClick={() => onView(v.id)}
                  className={CHIP}
                  style={chipStyle(view === v.id)}
                >
                  {v.label}
                </button>
              ))}
              {isDesktop && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={hiDetail}
                  onClick={onToggleDetail}
                  title="finare rute i profilane; tyngre å rekne"
                  className={CHIP + " ml-auto"}
                  style={chipStyle(hiDetail)}
                >
                  fint nett
                </button>
              )}
            </div>

            {/* materialet og plata i EI rad. Materialet er ikkje ein farge —
                han er tettleiken massen vert rekna av, og han er det som
                avgjer om åringane skal teiknast i det heile. */}
            <div className="flex flex-wrap items-center gap-1.5 py-1.5">
              {(Object.keys(MATERIALS) as Material[]).map((mk) => (
                <button
                  key={mk}
                  type="button"
                  aria-pressed={params.material === mk}
                  aria-label={`materiale: ${MATERIALS[mk].label}`}
                  title={MATERIALS[mk].label}
                  onClick={() => onChange({ ...params, material: mk })}
                  className="h-6 w-6 rounded-full border transition active:scale-90"
                  style={{
                    backgroundColor: MATERIALS[mk].hex,
                    borderColor: params.material === mk ? "var(--ink)" : "var(--rule)",
                    boxShadow: params.material === mk ? "0 0 0 1px var(--ink)" : undefined,
                  }}
                />
              ))}
              <span
                aria-hidden="true"
                className="mx-1 h-4 w-px"
                style={{ background: "var(--rule)" }}
              />
              {/* Tjukna er den eine inngangen som ikkje er ein smak: ho er
                  plata du har liggjande. Skyvaren er fri, men desse er dei
                  ein faktisk får kjøpt. */}
              {TJUKNER.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={params.tjukn === t}
                  title={`${tjukn(t)} mm plate`}
                  onClick={() => onChange({ ...params, tjukn: t })}
                  className={CHIP + " px-2"}
                  style={chipStyle(params.tjukn === t)}
                >
                  {tjukn(t)}
                </button>
              ))}
            </div>

            {/* STORLEIKEN STÅR FRAMME.
                Han er steg to for kvar einaste brukar: du slepper ei fil
                inn, og so bestemmer du kor stort det skal vera. Å måtte
                opne skyveveggen for det eine talet er eit steg for mykje —
                og «finn innstillingar» reknar ut frå nett det talet. */}
            <SliderRow
              k="storleik"
              r={VAFFEL.ranges.storleik}
              value={num(params, "storleik", VAFFEL.ranges.storleik.min)}
              onChange={setParam}
            />
            {/* Storleiken er EIN skyvar, men objektet har tre mål. Kameraet
                rammar inn same kva, so utan denne lina finst det ikkje eit
                einaste haldepunkt for kor stort tinget faktisk vert. */}
            {metrics && (
              <div
                className="tab -mt-1 pb-1 text-right text-[10px] tracking-[0.08em]"
                style={{ opacity: busy ? 0.25 : 0.42 }}
              >
                {n0(metrics.envX)} × {n0(metrics.envY)} × {n0(metrics.envZ)} mm
              </div>
            )}

            {/* …og eit tal er noko ein må rekne om. Difor kan ein setje noko
                ein kjenner ned attmed. Trykk på det som står på for å ta det
                bort att. */}
            <div className="flex items-center gap-1.5 py-1">
              <span
                className="w-24 shrink-0 text-left text-[10px] uppercase leading-[1.2] tracking-[0.14em]"
                style={{ color: "var(--ink)" }}
              >
                skala
              </span>
              {SKALAR.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  aria-pressed={skala === q.id}
                  aria-label={`skala: ${q.label}`}
                  title={q.hint}
                  onClick={() => onSkala(skala === q.id ? "av" : q.id)}
                  className={CHIP + " px-2.5"}
                  style={chipStyle(skala === q.id)}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* reglane som ryk: éi line kvar, grunngjevinga i title. Panelet
                seier KVA som er gale; KVIFOR ligg eit fingertrykk unna. */}
            {failed.length > 0 && (
              <ul className="space-y-1 py-1">
                {failed.map((r) => (
                  <li
                    key={r.id}
                    title={r.why}
                    className="flex items-baseline justify-between gap-3 text-[11px] leading-4"
                    style={{
                      color: r.hard ? "var(--warn)" : undefined,
                      opacity: r.hard ? 1 : 0.65,
                    }}
                  >
                    <span className="tracking-[0.06em]">
                      {r.hard ? "bryt" : "merk"} · {r.label}
                    </span>
                    <span className="tab shrink-0">{r.value}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* profilane, automatisk: kvar del slik han ligg på plata. Det
                ein før måtte laste ned ei fil for å sjå, står i menyen og
                fylgjer kvar einaste parameterendring. */}
            {syn && (
              <div
                className="my-1.5 overflow-hidden rounded-2xl border p-2"
                style={{ ...HAIR, background: "#ffffff" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(syn)}`}
                  alt="alle profilane, slik dei ligg på plata"
                  className="max-h-32 w-full object-contain"
                  style={{ opacity: busy ? 0.5 : 1, transition: "opacity 200ms ease" }}
                />
              </div>
            )}

            {/*
              KVA FARGANE TYDER, der uttaka står.
              Han er to ord, og han sparar den einaste feilen som kostar
              ei heil plate: å setje kutteffekt på graveringslaget. Svart
              er fyrste laget i LightBurn, og fyrste laget køyrer fyrst,
              so graveringa MÅ liggje der.
            */}
            <div
              className="flex items-center gap-3 pt-1 text-[10px] uppercase tracking-[0.14em]"
              style={{ color: "var(--ink)", opacity: 0.55 }}
              title="LightBurn tek laga i palettorden: svart er C00 og køyrer fyrst, blå er C01. Difor graverer det svarte og kuttar det blå."
            >
              {[
                { farge: "#000000", ord: "graver" },
                { farge: "#0000ff", ord: "kutt" },
              ].map((q) => (
                <span key={q.ord} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="block h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: q.farge }}
                  />
                  {q.ord}
                </span>
              ))}
            </div>

            {/* eksporten og verktøya i EI rad */}
            <div className="flex flex-wrap items-center gap-1.5 py-1">
              {EXPORTS.map((x) => {
                const stopp = stengd(x.id, metrics)
                return (
                  <button
                    key={x.id}
                    type="button"
                    title={stopp || x.hint}
                    disabled={busy || stopp !== ""}
                    onClick={() => onExport(x.id)}
                    className={CHIP + " uppercase tracking-[0.1em]"}
                    style={{
                      ...chipStyle(false),
                      opacity: stopp ? 0.3 : undefined,
                      textDecoration: stopp ? "line-through" : undefined,
                    }}
                  >
                    {x.label}
                  </button>
                )
              })}
              {/* Dei tre står i ei eiga eining. Kvar for seg ville dei brote
                  linja kvar for seg, og den siste hamna åleine på ei line
                  under — tre knappar som høyrer i hop, spreidde over to
                  liner, ser ut som tre ulike ting. */}
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={onAngre}
                  disabled={!kanAngre}
                  aria-label="angre siste endring"
                  title="angre siste endring (Z)"
                  className={CHIP}
                  style={chipStyle(false)}
                >
                  {IcoAngre}
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  aria-label="tilbake til standarden"
                  title="tilbake til standarden — nettet ditt står"
                  className={CHIP}
                  style={chipStyle(false)}
                >
                  {IcoReset}
                </button>
                <button
                  type="button"
                  onClick={onShare}
                  aria-label="del — lenkja ber alle innstillingane"
                  title="del — lenkja ber alle innstillingane, men ikkje nettet"
                  className={CHIP}
                  style={chipStyle(false)}
                >
                  {IcoShare}
                </button>
              </div>
            </div>

            {/* utvidaren mellom halvt og heilt ope — skyveveggen bak han.
                Berre pila: kva ho gjer, viser ho. */}
            <button
              type="button"
              aria-expanded={mode === "full"}
              aria-label={mode === "full" ? "færre kontrollar" : "alle parametrar"}
              onClick={() => onMode(mode === "full" ? "halv" : "full")}
              className="hit mt-1.5 flex w-full items-center justify-center rounded-2xl border py-1.5 opacity-60 transition active:scale-[0.99]"
              style={HAIR}
            >
              {mode === "full" ? IcoUp : IcoDown}
            </button>

            {mode === "full" && (
              <>
                <dl
                  className="mt-3"
                  style={{ opacity: busy ? 0.5 : 1, transition: "opacity 200ms ease" }}
                >
                  {rows.map((row) => {
                    const hard = row.rules !== undefined && isHard(row.rules)
                    const soft = row.rules !== undefined && isSoft(row.rules)
                    return (
                      <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-3 py-[2px] text-[11px] leading-4"
                      >
                        <dt className="shrink-0 opacity-50">{row.label}</dt>
                        <dd
                          className="tab truncate text-right"
                          style={{
                            color: hard ? "var(--warn)" : undefined,
                            // eit mjukt brot er eit val og ikkje ein feil:
                            // det skal merkast, men ikkje rope
                            textDecoration: soft ? "underline dotted" : undefined,
                            textDecorationColor: soft
                              ? "color-mix(in srgb, var(--ink) 45%, transparent)"
                              : undefined,
                            textUnderlineOffset: 3,
                          }}
                        >
                          {row.value}
                          {row.unit && <span className="pl-1 opacity-45">{row.unit}</span>}
                        </dd>
                      </div>
                    )
                  })}
                </dl>

                {/* Storleiken står alt framme, over reglane. Same skyvar to
                    gonger på same skjerm er ikkje to skyvarar — det er ein
                    som ser ut til å ikkje verke når du dreg den andre. */}
                {VAFFEL.groups.map((g) => (
                  <div key={g.id} className="pt-3">
                    <h3 className="pb-0.5 text-[10px] uppercase leading-none tracking-[0.24em] opacity-35">
                      {g.label}
                    </h3>
                    {g.keys.filter((k) => k !== "storleik").map((k) => (
                      <SliderRow
                        key={k}
                        k={k}
                        r={VAFFEL.ranges[k]}
                        value={num(params, k, VAFFEL.ranges[k].min)}
                        onChange={setParam}
                      />
                    ))}
                  </div>
                ))}

                {/* Tastane. Dei står nedst i det som alt er ope: den som har
                    opna heile veggen er den som kjem att, og det er han som
                    har bruk for dei. */}
                {isDesktop && (
                  <p className="pt-4 text-[10px] leading-relaxed tracking-[0.1em] opacity-30">
                    {TASTAR}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
