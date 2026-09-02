"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { feltTal, lesTal, nn, type ExportKind, type Metrics, type ParamBag, type Range, type Rule, type View } from "@/lib/core"
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

export const TASTAR =
  "l lås · ⌫ slett valt · f forslag · 1 2 3 lesemåte · z angre · esc lat att · ⇧ dra flytt planet · ⌥ dra vri det"

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
export const ICON_BTN =
  "hit relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95"
export const CHIP =
  "hit min-h-[30px] rounded-full border px-3 text-[11px] leading-none tracking-[0.04em] transition active:scale-95 disabled:opacity-30"
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
      className="hit shrink-0 rounded-full border px-2 py-[2px] text-[10px] leading-[14px] tracking-[0.04em] transition active:scale-95"
      style={{ borderColor: "currentColor", opacity: 0.85 }}
    >
      {f.ord}
    </button>
  )
}

/** Dei brotne reglane, som liner: raude når dei er harde, med rådet i lina. */
export function Reglar({ rules, params, onChange }: { rules: readonly Rule[]; params: ParamBag; onChange: (p: ParamBag) => void }) {
  const brotne = rules.filter((r) => !r.ok)
  if (!brotne.length) return null
  return (
    <ul className="space-y-1 py-1">
      {brotne.map((r) => (
        <li
          key={r.id}
          title={r.why}
          className="flex items-center justify-between gap-3 text-[11px] leading-4"
          style={{ color: r.hard ? "var(--warn)" : undefined, opacity: r.hard ? 1 : 0.65 }}
        >
          <span className="truncate tracking-[0.04em]">
            {r.hard ? "bryt" : "merk"} · {r.label}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="tab">{r.value}</span>
            <Fiksen rule={r} params={params} onChange={onChange} />
          </span>
        </li>
      ))}
    </ul>
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
export const IcoReset = ikon("M3 12a9 9 0 1 0 2.6-6.36|M3 4v4.5h4.5", "h-3.5 w-3.5")
export const IcoShare = ikon("M12 3v12|m8 7 4-4 4 4|M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8", "h-3.5 w-3.5")
export const IcoImport = ikon("M12 15V3|m8 11 4 4 4-4|M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4", "h-3.5 w-3.5")
/** låsen: eit plan som vert ein del */
export const IcoLaas = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

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
        style={{ transition: "stroke-dashoffset 150ms linear" }}
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
      style={{ opacity: busy ? 0.5 : 1, transition: "opacity 200ms ease" }}
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
 * ÉIN SKYVAR. Talet til høgre er eit FELT: ein skyvar leitar, eit felt
 * treffer, og den som har målt plata si til 2,87 skal kunne skrive det.
 * Feltet syner talet slik det ER (`feltTal`), ikkje avrunda til steget.
 */
export function SliderRow({ k, r, value, bi, onChange }: {
  k: string
  r: Range
  value: number
  /** ei måling som høyrer til skyvaren, under etiketten */
  bi?: string
  onChange: (k: string, raw: string) => void
}) {
  const shown = r.names ? (r.names[Math.round(value)] ?? String(value)) : feltTal(value, r.step).replace(".", ",")
  const [utkast, setUtkast] = useState<string | null>(null)
  const send = () => {
    if (utkast === null) return
    const v = lesTal(utkast)
    setUtkast(null)
    // tull er ikkje ei endring, og å ta feltet og sleppe det er det heller ikkje
    if (!Number.isFinite(v) || v === value) return
    onChange(k, String(v))
  }
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-20 shrink-0 text-left text-[10px] uppercase leading-[1.2] tracking-[0.12em]" style={{ color: "var(--ink)" }}>
        {r.label}
        {bi && <span className="dim tab block pt-px text-[9px] normal-case tracking-[0.02em]">{bi}</span>}
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
        <span className="tab w-[68px] shrink-0 truncate text-right text-[11px]" style={{ color: "var(--ink)" }}>{shown}</span>
      ) : (
        <span className="flex w-[68px] shrink-0 items-baseline justify-end text-[11px]" style={{ color: "var(--ink)" }}>
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
