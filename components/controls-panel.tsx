"use client"

import { useCallback, useMemo, useRef, useState, type CSSProperties, type JSX } from "react"
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

const VIEWS: readonly { id: View; label: string; hint: string }[] = [
  { id: "flate", label: "flate", hint: "nettet slik det kom inn, etter forenkling og glatting" },
  { id: "lag", label: "lag", hint: "ribbene slik dei faktisk står, med spor" },
  { id: "kontur", label: "kontur", hint: "dei flate kuttprofilane" },
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

const DASH = "–"
const n0 = (v: number) => nn(v, 0)
const n1 = (v: number) => nn(v, 1)

const decimals = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3)
const snap = (v: number, r: Range) =>
  !Number.isFinite(v) ? r.min : r.int ? Math.round(v) : +v.toFixed(4)
const num = (p: ParamBag, k: string, fallback: number) =>
  typeof p[k] === "number" ? (p[k] as number) : fallback

const HAIR: CSSProperties = { borderColor: "var(--rule)" }
const ICON_BTN =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95"

function chipStyle(active: boolean): CSSProperties {
  return active
    ? { background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }
    : { color: "var(--ink)", borderColor: "var(--rule)" }
}
const CHIP =
  "min-h-[30px] rounded-full border px-3 text-[11px] leading-none tracking-[0.04em] transition active:scale-95 disabled:opacity-30"

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

/** Éin skyvar: etiketten er låsen, prikken seier om han er teken. */
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
      <span
        className="tab w-[68px] shrink-0 truncate text-right text-[11px]"
        style={{ color: "var(--ink)" }}
      >
        {shown}
        {r.unit && !r.names && <span className="pl-0.5 opacity-45">{r.unit}</span>}
      </span>
    </div>
  )
}

export function ControlsPanel(props: {
  params: ParamBag
  kjelde: string
  metrics: Metrics | null
  rules: Rule[]
  view: View
  /** profilane som bilete (SVG-tekst), generert automatisk av arbeidaren */
  syn: string | null
  hiDetail: boolean
  isDesktop: boolean
  busy: boolean
  feil: string | null
  onChange: (p: ParamBag) => void
  onView: (v: View) => void
  onReset: () => void
  onToggleDetail: () => void
  onExport: (kind: ExportKind) => void
  onFinn: () => void
  onShare: () => void
  onFile: (f: File) => void
}): JSX.Element {
  const {
    params,
    kjelde,
    metrics,
    rules,
    view,
    syn,
    hiDetail,
    isDesktop,
    busy,
    feil,
    onChange,
    onView,
    onReset,
    onToggleDetail,
    onExport,
    onFinn,
    onShare,
    onFile,
  } = props

  // lukka → halv (lesemåtar, materiale, delane, eksport) → full (skyveveggen)
  const [mode, setMode] = useState<"lukka" | "halv" | "full">("lukka")
  const open = mode !== "lukka"
  const pick = useRef<HTMLInputElement | null>(null)

  // Arket er eit iOS-ark: dra i grepet eller hovudlina, opp for meir og ned
  // for mindre. Fingeren får eit lite gummiband som svar medan han dreg, og
  // slepp han forbi terskelen, byter arket steg.
  const MODES = ["lukka", "halv", "full"] as const
  const stepMode = useCallback((dir: 1 | -1) => {
    setMode((m) => MODES[Math.min(2, Math.max(0, MODES.indexOf(m) + dir))])
    // MODES er ein konstant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
    (k: string, raw: string) =>
      onChange({ ...params, [k]: snap(Number(raw), VAFFEL.ranges[k]) }),
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
        aria-label="kontrollar"
        aria-busy={busy}
        className="pointer-events-auto w-full max-w-md rounded-3xl border"
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

          <div className="flex items-center gap-1.5 p-2.5">
            {/* Kjelda. Han er ikkje ein nedtrekk med tre demofigurar — han er
                DIN fil, og trykket opnar filveljaren. Kuben står der til
                nokon gjev han noko betre. */}
            <button
              type="button"
              onClick={() => pick.current?.click()}
              title={`${kjelde} — trykk for å hente eit nett (${FORMAT.join(" ")})`}
              aria-label="hent eit nett"
              className="flex h-9 min-w-0 max-w-[42%] shrink items-center gap-1.5 rounded-full border pl-2.5 pr-3 text-[11px] uppercase tracking-[0.14em] transition active:scale-95"
              style={{ ...HAIR, color: "var(--ink)" }}
            >
              <span className="shrink-0 opacity-70">{IcoImport}</span>
              <span className="min-w-0 flex-1 truncate text-left">{kjelde}</span>
            </button>

            <span className="tab min-w-0 flex-1 truncate pl-1 text-[11px] tracking-[0.06em]">
              {feil ? (
                <span style={{ color: "var(--warn)" }}>{feil}</span>
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
            </span>

            {/* prikken har fast plass, så lina står i ro medan motoren reknar */}
            <span
              aria-hidden="true"
              className="block h-[5px] w-[5px] shrink-0 rounded-full"
              style={{
                background: "var(--ink)",
                opacity: busy ? 0.8 : 0.12,
                transition: "opacity 200ms ease",
              }}
            />

            <button
              type="button"
              onClick={onFinn}
              disabled={busy}
              aria-label="finn innstillingar"
              title="finn innstillingar — reknar gjennom eit titals rutenett og set det beste. Trykk igjen for det nest beste. Nettet, storleiken, tjukna og plata står."
              className={ICON_BTN}
              style={{ background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }}
            >
              {IcoFinn}
            </button>
            <button
              type="button"
              onClick={() => setMode(open ? "lukka" : "halv")}
              aria-label={open ? "gøym kontrollane" : "vis kontrollane"}
              aria-expanded={open}
              className={ICON_BTN}
              style={{ ...HAIR, color: "var(--ink)" }}
            >
              {open ? IcoDown : IcoSliders}
            </button>
          </div>
        </div>

        {/* det utvidbare arket */}
        {open && (
          <div className="max-h-[56vh] overflow-y-auto overscroll-contain px-3 pb-3">
            {/* lesemåtane — tre ord held; kva dei tyder ligg i title */}
            <div className="flex flex-wrap items-center gap-1.5 py-1">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  title={v.hint}
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
                  title={`${nn(t)} mm plate`}
                  onClick={() => onChange({ ...params, tjukn: t })}
                  className={CHIP + " px-2"}
                  style={chipStyle(params.tjukn === t)}
                >
                  {nn(t)}
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
                  className="max-h-40 w-full object-contain"
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
              <button
                type="button"
                onClick={onReset}
                aria-label="tilbake til standarden"
                title="tilbake til standarden — nettet ditt står"
                className={CHIP + " ml-auto"}
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

            {/* utvidaren mellom halvt og heilt ope — skyveveggen bak han.
                Berre pila: kva ho gjer, viser ho. */}
            <button
              type="button"
              aria-expanded={mode === "full"}
              aria-label={mode === "full" ? "færre kontrollar" : "alle parametrar"}
              onClick={() => setMode(mode === "full" ? "halv" : "full")}
              className="mt-1.5 flex w-full items-center justify-center rounded-2xl border py-1.5 opacity-60 transition active:scale-[0.99]"
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

                {VAFFEL.groups.map((g) => (
                  <div key={g.id} className="pt-3">
                    <h3 className="pb-0.5 text-[10px] uppercase leading-none tracking-[0.24em] opacity-35">
                      {g.label}
                    </h3>
                    {g.keys.map((k) => (
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
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
