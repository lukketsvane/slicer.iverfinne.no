"use client"

import { useCallback, useEffect, useRef, type CSSProperties } from "react"
import { feltTal, nn, snap, type ExportKind, type Metrics, type ParamBag, type Range, type Rule, type View } from "@/lib/core"
import { RADER } from "@/lib/metrics"

/**
 * DELANE. Det som ikkje er eit oppsett: brikker, ikon, skyvarar, tavla.
 * Dei står i arket på telefonen og i spalta på benken, og ei brikke som
 * ser ulik ut på dei to flatene er to brikker.
 */

export const VIEWS: readonly { id: View; label: string; hint: string }[] = [
  { id: "flate", label: "flate", hint: "nettet slik det kom inn (1)" },
  { id: "lag", label: "lag", hint: "kroppen som skugge, delane som står (2)" },
  { id: "kontur", label: "kontur", hint: "dei flate kuttprofilane (3)" },
]

export const EXPORTS: readonly { id: ExportKind; label: string; hint: string }[] = [
  { id: "stl", label: "stl", hint: "delane som trekantnett, til rendering og 3D-print" },
  { id: "dxf", label: "dxf", hint: "alle delane nesta på plate, med snittkompensasjon" },
  { id: "svg", label: "svg", hint: "alle profilane ved sida av kvarandre, i 1:1" },
  { id: "ark", label: "ark", hint: "platene slik dei er pakka, ei fil per plate" },
  { id: "png", label: "png", hint: "dei same platene som bilete — til meldingar, ikkje til maskina" },
  { id: "prove", label: "passprøve", hint: "sju spor, kvart 0,05 mm breiare. skjer i di eiga plate og set klaringa" },
  { id: "alt", label: "alt", hint: "heile jobben i éi nedlasting: stl, dxf, profilar, plater, passprøve, kuttliste, oppsett" },
  { id: "prosjekt", label: "lagre", hint: "oppsettet og nettet i lag. slepp fila inn att, og du står der du gjekk frå" },
]

/** Ein knapp som leverer ei tom fil lyg, og han lyg i LightBurn. Passprøva
 *  og prosjektfila treng ingen delar. */
export function stengd(x: ExportKind, m: Metrics | null): string {
  if (x === "prove" || x === "prosjekt" || !m) return ""
  if (m.parts === 0) return "ville vorte ei tom fil: ingen delar"
  if ((x === "ark" || x === "png" || x === "dxf" || x === "alt") && m.sheets === 0) {
    return "ville vorte ei tom fil: ingen del fekk plass på plata"
  }
  return ""
}

/**
 * EIT LANGT TRYKK. Fingeren står stille (seks pikslar), det korte fyrer
 * ikkje når det lange har fyrt, og eit klikk frå tastaturet — utan
 * pointerdown — er alltid det korte.
 */
export function useLangtrykk(kort: () => void, langt: () => void, ms = 450) {
  const ned = useRef<{ x: number; y: number } | null>(null)
  const timer = useRef(0)
  const brukt = useRef(false)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const stopp = useCallback(() => window.clearTimeout(timer.current), [])
  return {
    onPointerDown: (e: { clientX: number; clientY: number }) => {
      ned.current = { x: e.clientX, y: e.clientY }
      brukt.current = false
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        brukt.current = true
        langt()
      }, ms)
    },
    onPointerMove: (e: { clientX: number; clientY: number }) => {
      const d = ned.current
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) stopp()
    },
    onPointerUp: stopp,
    onPointerLeave: stopp,
    onPointerCancel: stopp,
    onClick: () => {
      if (brukt.current) {
        brukt.current = false
        return
      }
      kort()
    },
  }
}

export const DASH = "–"
/** 2,5 mm er ikkje 3 mm: desimalen står når han finst */
export const tjukn = (v: number) => nn(v, Number.isInteger(v) ? 0 : 1)
export const n0 = (v: number) => nn(v, 0)
export const num = (p: ParamBag, k: string, fallback: number) =>
  typeof p[k] === "number" ? (p[k] as number) : fallback

export const HAIR: CSSProperties = { borderColor: "var(--rule)" }
/* Flate knappar: fyllet byter, og ikkje noko anna — ingen skugge, ingen overgang, inga krymping under fingeren. */
export const ICON_BTN =
  "hit relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
export const CHIP =
  "hit min-h-[36px] rounded-full border px-3 text-[11px] leading-none tracking-[0.04em] disabled:opacity-30"
export function chipStyle(active: boolean): CSSProperties {
  return active
    ? { background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }
    : { color: "var(--ink)", borderColor: "var(--rule)" }
}

/** RÅDET SOM KNAPP. Regelen har rekna talet; knappen set det gjennom den
 *  vanlege vegen, so det ligg i angrelista som alt anna. */
export function Fiksen({ rule, params, onChange }: { rule: Rule; params: ParamBag; onChange: (p: ParamBag) => void }) {
  if (rule.ok || !rule.fiks) return null
  const f = rule.fiks
  return (
    <button
      type="button"
      aria-label={`fiks ${rule.label}: ${f.ord}`}
      title="set dette og rekn om att"
      onClick={() => onChange({ ...params, ...f.set })}
      className="hit shrink-0 rounded-full border px-2 py-[2px] text-[10px] leading-[14px] tracking-[0.04em]"
      style={{ borderColor: "currentColor", opacity: 0.85 }}
    >
      {f.ord}
    </button>
  )
}

/** ikona er strekar, teikna her: ti ikon er ikkje verdt ein avhengnad */
const ikon = (d: string, k = "h-4 w-4") => (
  <svg viewBox="0 0 24 24" className={k} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {d.split("|").map((q, i) => <path key={i} d={q} />)}
  </svg>
)
export const IcoStopp = <svg viewBox="0 0 24 24" className="h-4 w-4"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" /></svg>
export const IcoFinn = ikon("M2 18h2.9a4 4 0 0 0 3.4-1.9l5.4-8.2A4 4 0 0 1 17.1 6H22|m18 2 4 4-4 4|M2 6h2.9a4 4 0 0 1 3.4 1.9l.5.8|m14.6 14.5.5.8a4 4 0 0 0 3.4 1.9H22|m18 14 4 4-4 4")
export const IcoSliders = ikon("M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4")
export const IcoDown = ikon("m6 9 6 6 6-6")
export const IcoAngre = ikon("M9 14 4 9l5-5|M4 9h10a6 6 0 0 1 0 12h-3", "h-3.5 w-3.5")
export const IcoGjerOm = ikon("m15 14 5-5-5-5|M20 9H10a6 6 0 0 0 0 12h3", "h-3.5 w-3.5")
export const IcoReset = ikon("M3 12a9 9 0 1 0 2.6-6.36|M3 4v4.5h4.5", "h-3.5 w-3.5")
export const IcoShare = ikon("M12 3v12|m8 7 4-4 4 4|M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8", "h-3.5 w-3.5")
export const IcoUttak = ikon("M12 15V3|m8 11 4 4 4-4|M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4")
/** skissemodusen: lina med handtaket på */
export const IcoSkisse = ikon("M4 20 20 4|M9 15a2 2 0 1 0 4 0 2 2 0 1 0-4 0", "h-5 w-5")
/** ferdig med det valde planet: eit merke. Stort: han står i den store knappen under tommelen. */
export const IcoFerdig = ikon("m5 12 5 5L20 7", "h-7 w-7")
/** SKJER: kniven. Handlinga som gjer skissa til ein del — eit ikon og aldri eit ord. */
export const IcoSkjer = ikon("M3 21l6-6|M9 15 20.5 3.5c1.3 3.3.4 6.3-2.4 8.4L9 15z", "h-7 w-7")
/** slett det valde planet */
export const IcoSlett = ikon("M4 7h16|M9 7V4h6v3|M6 7l1 13h10l1-13|M10 11v6|M14 11v6", "h-5 w-5")
/** streka i profilen: gods er ein fylt firkant med pluss, eit hòl er ein ring med minus */
export const IcoGods = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
    <path d="M12 8.5v7M8.5 12h7" fill="none" stroke="var(--paper)" strokeWidth={2} strokeLinecap="round" />
  </svg>
)
export const IcoHol = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <circle cx="12" cy="12" r="8" />
    <path d="M8.5 12h7" />
  </svg>
)
/** oppsettet: kopier det ut, lim det inn */
export const IcoKopier = ikon("M9 9h10v10H9z|M5 15V5h10", "h-4 w-4")
export const IcoLimInn = ikon("M9 4h6v3H9z|M15 5h3v15H6V5h3|M12 10v7|m9 14 3 3 3-3", "h-4 w-4")
/** dei to fyrste stega i rettleiinga: snu, og sikt */

/** Ringen kring knappen: søket går, og omtrent kor langt det er att. */
export function Ring({ del }: { del: number }) {
  const R = 15.5
  const O = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full -rotate-90">
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
      />
    </svg>
  )
}

/**
 * TAVLA OG REGLANE ER DEN SAME LISTA. Éi line per avlesing: verdien frå
 * målinga, farga av regelen som dømer henne (`Rule.rad`), med rådet i lina.
 * Tom tavle og full tavle er same lista, so dei kan ikkje drive frå kvarandre.
 */
export function Tavla({ metrics, rules, busy, params, onChange }: {
  metrics: Metrics | null
  rules: readonly Rule[]
  busy: boolean
  params: ParamBag
  onChange: (p: ParamBag) => void
}) {
  const eig = new Map<string, Rule>()
  for (const r of rules) if (r.rad) eig.set(r.rad, r)
  const rader = metrics ? metrics.list : RADER.map((r) => ({ ...r, text: DASH }))
  return (
    <dl
      className="grid grid-cols-2 gap-x-6 text-[11px]"
      style={{ opacity: busy ? 0.5 : 1 }}
    >
      {rader.map((q) => {
        const r = eig.get(q.id)
        const brote = !!r && !r.ok
        return (
          <div
            key={q.id}
            title={r?.why}
            // ei rad som ryk får heile lina: regelen sitt tal og knappen
            className={"flex items-baseline justify-between gap-2 py-[2px] leading-4" + (brote ? " col-span-2" : "")}
          >
            <dt className="dim shrink-0 truncate">{q.label}</dt>
            <dd className="tab flex min-w-0 items-baseline justify-end gap-1.5 text-right" style={{ color: brote && r.hard ? "var(--warn)" : undefined }}>
              <span className="truncate" style={{ textDecoration: brote && !r.hard ? "underline dotted" : undefined, textUnderlineOffset: 3 }}>
                {brote ? r.value : q.text}
                {!brote && q.unit && <span className="dim pl-1">{q.unit}</span>}
              </span>
              {r && <Fiksen rule={r} params={params} onChange={onChange} />}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/**
 * ÉIN VERDI, SETT MED EIT DRAG PÅ SEG SJØLV.
 *
 * Ikkje eit tekstfelt og ikkje ein skyvar: eit felt tek fokus, iOS zoomar
 * sida inn og tastaturet står over objektet. Heile rada er skrubbaren —
 * peikar ned og vassrett drag, eitt steg per seks pikslar, ti steg per steg
 * forbi hundre og tjue, so du treffer fint nær og kjem langt ute. Eit trykk
 * utan drag gjer ingenting, og tastaturet kjem aldri; på benken stegar
 * pilene. Verdien går live medan du dreg, og sleppet er eitt steg i angre.
 * Lina og prikken er lesing, ikkje handtak: ho seier kvar i bandet du står.
 */
export function SliderRow({ k, r, value, bi, benk, onChange, onSkrubb }: {
  k: string
  r: Range
  value: number
  /** ei måling som høyrer til verdien, under etiketten */
  bi?: string
  /** pilene stegar berre der det finst eit tastatur */
  benk?: boolean
  onChange: (k: string, v: number) => void
  /** draget er i gang: angre ventar til det er sleppt */
  onSkrubb?: (aktiv: boolean) => void
}) {
  const shown = r.names ? (r.names[Math.round(value)] ?? String(value)) : feltTal(value, r.step).replace(".", ",")
  const tak = useRef<{ id: number; x0: number; v0: number; sist: number } | null>(null)
  const del = Math.max(0, Math.min(1, (value - r.min) / (r.max - r.min || 1)))
  const slepp = (e: React.PointerEvent) => {
    const t = tak.current
    if (!t || e.pointerId !== t.id) return
    tak.current = null
    onSkrubb?.(false)
  }
  return (
    <div
      role="slider"
      tabIndex={benk ? 0 : -1}
      aria-label={`${r.label}, tal`}
      aria-valuenow={value}
      aria-valuemin={r.min}
      aria-valuemax={r.max}
      aria-valuetext={`${shown}${r.unit ? " " + r.unit : ""}`}
      title={`${r.label}: ${r.min}–${r.max}${r.unit ? " " + r.unit : ""} · dra sidelengs`}
      className="skrubb flex min-h-[44px] items-center gap-3"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return
        tak.current = { id: e.pointerId, x0: e.clientX, v0: value, sist: value }
        e.currentTarget.setPointerCapture(e.pointerId)
        onSkrubb?.(true)
      }}
      onPointerMove={(e) => {
        const t = tak.current
        if (!t || e.pointerId !== t.id) return
        const dx = e.clientX - t.x0
        const a = Math.abs(dx)
        const steg = Math.sign(dx) * (Math.min(a, 120) / 6 + (Math.max(0, a - 120) / 6) * 10)
        const v = snap(t.v0 + Math.round(steg) * r.step, r)
        if (v === t.sist) return
        t.sist = v
        onChange(k, v)
      }}
      onPointerUp={slepp}
      onPointerCancel={slepp}
      onKeyDown={(e) => {
        const steg = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "PageUp" ? 10 : e.key === "PageDown" ? -10 : 0
        if (!steg) return
        e.preventDefault()
        onChange(k, snap(value + steg * r.step, r))
      }}
    >
      <span className="w-20 shrink-0 text-left text-[10px] uppercase leading-[1.2] tracking-[0.12em]" style={{ color: "var(--ink)" }}>
        {r.label}
        {bi && <span className="dim tab block pt-px text-[9px] normal-case tracking-[0.02em]">{bi}</span>}
      </span>
      <span className="relative h-px flex-1" style={{ background: "color-mix(in srgb, var(--ink) 34%, transparent)" }} aria-hidden="true">
        <span className="absolute top-1/2 block h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]" style={{ left: `${del * 100}%`, background: "var(--ink)", borderColor: "var(--paper)" }} />
      </span>
      <span className="tab flex w-[68px] shrink-0 items-baseline justify-end text-[11px]" style={{ color: "var(--ink)" }}>
        <span className="truncate">{shown}</span>
        {r.unit && <span className="dim shrink-0 pl-0.5">{r.unit}</span>}
      </span>
    </div>
  )
}
