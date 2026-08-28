"use client"

import { useCallback, useRef, useState, type CSSProperties } from "react"
import {
  TJUKNER,
  nn,
  type ExportKind,
  type Metrics,
  type ParamBag,
  type Range,
  type Rule,
  type View,
} from "@/lib/core"
import { RADER } from "@/lib/vaffel/metrics"
import { VAFFEL } from "@/lib/vaffel/engine"

/**
 * DELANE.
 *
 * Dei same knappane, brikkene, ikona og skyvarane står i to heilt ulike
 * oppsett: arket nedst på ein telefon, og benken med to veggar på ein
 * skjerm. Oppsetta har ingenting med kvarandre å gjere, men delane har det,
 * og ein brikke som ser ulik ut på dei to flatene er to brikker.
 *
 * Her bur difor alt som IKKJE er eit oppsett.
 */

export const VIEWS: readonly { id: View; label: string; hint: string; tast: string }[] = [
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
export function stengd(x: ExportKind, m: Metrics | null): string {
  if (x === "prove" || !m) return ""
  if (m.parts === 0) return "ingen delar å skjere. sjå reglane"
  if ((x === "ark" || x === "dxf") && m.sheets === 0) {
    return "ingen del fekk plass på plata. større plate, eller mindre objekt"
  }
  return ""
}

export const EXPORTS: readonly { id: ExportKind; label: string; hint: string }[] = [
  { id: "stl", label: "stl", hint: "heile stabelen som trekantnett, til rendering og 3D-print" },
  { id: "dxf", label: "dxf", hint: "alle delane nesta på plate, med snittkompensasjon" },
  { id: "svg", label: "svg", hint: "alle profilane ved sida av kvarandre, i 1:1" },
  { id: "ark", label: "ark", hint: "platene slik dei er pakka, ei fil per plate" },
  {
    id: "prove",
    label: "passprøve",
    hint: "sju spor, kvart 0,05 mm breiare. skjer i di eiga plate og sett klaringa til det som går inn med tommelkraft",
  },
]

/** Kva tastane gjer. Dei står i kvar sin tooltip òg, men ei samla line er
 *  den einaste staden nokon kan finne dei UTAN å vite at dei finst. */
export const TASTAR =
  "f finn · ⇧f førre · 1 2 3 lesemåte · , . vend · z angre · ctrl+hjul storleik"
/** det som berre finst på den eine flata */
export const TAST_ARK = " · o panel"
export const TAST_BENK = " · mellomrom berre objektet"

/**
 * STORLEIKEN STÅR ALT FRAMME, SOM DEN SAME SKYVAREN.
 *
 * Same skyvar to gonger på same skjerm er ikkje to skyvarar: det er ein som
 * ser ut til å ikkje verke når du dreg den andre.
 *
 * Tjukna står framme som BRIKKER, og det er noko anna. Brikkene er dei fem
 * platene ein laser skjer; skyvaren er kvar plate som finst. Tek ein
 * skyvaren vekk, kan ingen setje sju millimeter finér lenger, og det er
 * ikkje ei forenkling, det er ein reiskap som gjer mindre.
 */
export const FRAMME = new Set(["storleik"])

export const DASH = "–"
/** Plata er 2, 2,5 eller 3 mm. Rundar ein av desimalen, står det to
 *  knappar med «3» på — og den eine av dei set ei halv millimeter tynnare
 *  plate enn ho seier. Klaringa i kvart einaste spor kjem av det talet. */
export const tjukn = (v: number) => nn(v, Number.isInteger(v) ? 0 : 1)
export const n0 = (v: number) => nn(v, 0)
export const n1 = (v: number) => nn(v, 1)

export const decimals = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3)
/**
 * Eit tal inn i eit band.
 *
 * Klemminga er ikkje pynt. Ein skyvar kan ikkje gå utanfor bandet sitt, men
 * talfeltet ved sida av kan: der kan nokon skrive 9999 i storleiken, og
 * ingenting anna i reiskapen stoggar det.
 */
export const snap = (v: number, r: Range) => {
  if (!Number.isFinite(v)) return r.min
  const c = Math.min(r.max, Math.max(r.min, v))
  return r.int ? Math.round(c) : +c.toFixed(4)
}
/** «1,5» er eit tal for eit menneske og NaN for Number() */
export const lesTal = (raw: string) => Number(String(raw).replace(",", ".").replace(/\s+/g, ""))
export const num = (p: ParamBag, k: string, fallback: number) =>
  typeof p[k] === "number" ? (p[k] as number) : fallback

export const HAIR: CSSProperties = { borderColor: "var(--rule)" }
/** `hit` gjev peikaren eit svar på ei flate som elles er heilt still */
export const ICON_BTN =
  "hit relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95"

export function chipStyle(active: boolean): CSSProperties {
  return active
    ? { background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }
    : { color: "var(--ink)", borderColor: "var(--rule)" }
}
export const CHIP =
  "hit min-h-[30px] rounded-full border px-3 text-[11px] leading-none tracking-[0.04em] transition active:scale-95 disabled:opacity-30"

/**
 * RÅDET, SOM EIN KNAPP.
 *
 * Ein regel som ryk peikar på eit tal han sjølv har rekna ut. Knappen set
 * det talet, gjennom den vanlege vegen inn i parametrane: han legg seg i
 * angrestabelen som alt anna, so eit råd du ikkje likar kostar eitt trykk
 * å gå ut av att.
 *
 * Knappen er raud som lina han står i. Han er ikkje ei åtvaring — han er
 * det einaste i den lina som gjer noko med henne.
 */
export function Fiksen({
  rule,
  params,
  onChange,
}: {
  rule: Rule
  params: ParamBag
  onChange: (p: ParamBag) => void
}) {
  if (rule.ok || !rule.fiks) return null
  const f = rule.fiks
  return (
    <button
      type="button"
      aria-label={`fiks ${rule.label}: ${f.ord}`}
      title="set dette og rekn om att"
      onClick={() => onChange({ ...params, ...f.set })}
      className="hit shrink-0 rounded-full border px-2 py-[2px] text-[10px] leading-[14px] tracking-[0.04em] transition active:scale-95"
      style={{ borderColor: "currentColor", opacity: 0.85 }}
    >
      {f.ord}
    </button>
  )
}

/** Ikona er strekar, teikna her i staden for henta frå eit bibliotek:
 *  seks ikon er ikkje verdt ein avhengnad. */
export const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}
/** to piler som byter plass: gjev meg eit anna svar */
export const IcoFinn = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...STROKE}>
    <path d="M2 18h2.9a4 4 0 0 0 3.4-1.9l5.4-8.2A4 4 0 0 1 17.1 6H22" />
    <path d="m18 2 4 4-4 4" />
    <path d="M2 6h2.9a4 4 0 0 1 3.4 1.9l.5.8" />
    <path d="m14.6 14.5.5.8a4 4 0 0 0 3.4 1.9H22" />
    <path d="m18 14 4 4-4 4" />
  </svg>
)
export const IcoSliders = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...STROKE}>
    <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
  </svg>
)
export const IcoDown = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...STROKE}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
export const IcoVenstre = (
  <svg viewBox="0 0 24 24" className="h-3 w-3" {...STROKE}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)
export const IcoHogre = (
  <svg viewBox="0 0 24 24" className="h-3 w-3" {...STROKE}>
    <path d="m9 18 6-6-6-6" />
  </svg>
)
export const IcoAngre = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...STROKE}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
)
export const IcoReset = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...STROKE}>
    <path d="M3 12a9 9 0 1 0 2.6-6.36" />
    <path d="M3 4v4.5h4.5" />
  </svg>
)
export const IcoShare = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...STROKE}>
    <path d="M12 3v12" />
    <path d="m8 7 4-4 4 4" />
    <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
  </svg>
)
export const IcoImport = (
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
export function Ring({ del }: { del: number }) {
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
export const R_DELAR = ["delar", "grip", "lause"]
export const R_GODS = ["gods", "spor"]
export const R_ARK = ["plate", "utnytting"]
export const R_NETT = ["nett", "lukka"]
export const R_OPNING = ["opning"]

export type TableRow = { label: string; value: string; unit: string; rules?: readonly string[] }

export function tableRows(m: Metrics | null): TableRow[] {
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
  // Tom tavle og full tavle er den SAME lista. Ho stod ein gong to stader,
  // og dei to dreiv frå kvarandre: tretten rader tom og femten full, og
  // eit ord som bytte seg i det fyrste svaret kom.
  const rader = m ? m.list : RADER.map((r) => ({ ...r, text: DASH }))
  return rader.map((q) => ({
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
export function SliderRow({
  k,
  r,
  value,
  bi,
  onChange,
}: {
  k: string
  r: Range
  value: number
  /** ei måling som høyrer til denne skyvaren, under etiketten */
  bi?: string
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
        className="w-20 shrink-0 text-left text-[10px] uppercase leading-[1.2] tracking-[0.12em]"
        style={{ color: "var(--ink)" }}
      >
        {r.label}
        {bi && (
          <span className="dim tab block pt-px text-[9px] normal-case tracking-[0.02em]">
            {bi}
          </span>
        )}
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
          {r.unit && <span className="dim shrink-0 pl-0.5">{r.unit}</span>}
        </span>
      )}
    </div>
  )
}

