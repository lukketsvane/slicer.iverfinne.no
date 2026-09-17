"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { feltTal, lesTal, nn, snap, type ExportKind, type Metrics, type ParamBag, type Range, type Rule, type View } from "@/lib/core"
import { RADER } from "@/lib/metrics"

export const VIEWS: readonly { id: View; label: string; hint: string }[] = [
  { id: "flate", label: "flate", hint: "nettet slik det kom inn (1)" },
  { id: "lag", label: "lag", hint: "kroppen som skugge, delane som står (2)" },
  { id: "kontur", label: "kontur", hint: "dei flate kuttprofilane (3)" },
  { id: "montasje", label: "montasje", hint: "kroppen reiser seg av platene sine, ein gjeng ribber om gongen (4)" },
]

export const UTTAK: readonly { bolk: string; filer: readonly { id: ExportKind; label: string; hint: string }[] }[] = [
  {
    bolk: "rom",
    filer: [
      { id: "stl", label: "stl", hint: "delane som trekantnett, til rendering og 3D-print" },
      { id: "glb", label: "glb", hint: "det same nettet i meter, y opp — ein node per del, med adressa som namn: blender, sketchfab, nettlesaren" },
      { id: "flat", label: "flat", hint: "dei same delane lagde flatt der nestinga la dei, ei gruppe per plate: kuttjobben i tre dimensjonar" },
      { id: "3mf", label: "3mf", hint: "dei same flate delane til 3D-trykk: eitt objekt per del, med adressa som namn. bambu studio, prusaslicer, cura" },
      { id: "usdz", label: "usdz", hint: "montasjen i rommet: del fila på ein iphone og set han på bordet" },
    ],
  },
  {
    bolk: "plate",
    filer: [
      { id: "dxf", label: "dxf", hint: "dei same platene som r12-teikning, ei fil per plate" },
      { id: "svg", label: "svg", hint: "alle profilane ved sida av kvarandre, i 1:1" },
      { id: "ark", label: "ark", hint: "platene slik dei er pakka, ei fil per plate" },
      { id: "png", label: "png", hint: "dei same platene som bilete — til meldingar, ikkje til maskina" },
      { id: "prove", label: "passprøve", hint: "sju spor, kvart 0,05 mm breiare. skjer i di eiga plate og set klaringa" },
      { id: "bogprove", label: "bøyeprøve", hint: "fem rilla felt, kvart med sitt steg. bøy dei, og tak det grovaste som held" },
    ],
  },
  {
    bolk: "alt",
    filer: [
      { id: "alt", label: "alt", hint: "heile jobben i éi nedlasting: stl, dxf, profilar, plater, prøvene, kuttliste, oppsett" },
      { id: "prosjekt", label: "lagre", hint: "oppsettet og nettet i lag. slepp fila inn att, og du står der du gjekk frå" },
    ],
  },
]

export function stengd(x: ExportKind, m: Metrics | null): string {
  if (x === "prove" || x === "bogprove" || x === "prosjekt" || !m) return ""
  if (m.parts === 0) return "ville vorte ei tom fil: ingen delar"
  if ((x === "ark" || x === "png" || x === "dxf" || x === "alt" || x === "flat" || x === "3mf") && m.sheets === 0) {
    return "ville vorte ei tom fil: ingen del fekk plass på plata"
  }
  return ""
}

export const DASH = "–"
export const tjukn = (v: number) => nn(v, Number.isInteger(v) ? 0 : 1)
export const n0 = (v: number) => nn(v, 0)
export const num = (p: ParamBag, k: string, fallback: number) =>
  typeof p[k] === "number" ? (p[k] as number) : fallback

export const HAIR: CSSProperties = { borderColor: "var(--rule)" }
export const DOBBELT_MS = 320
export const ICON_BTN =
  "hit ikon relative flex h-9 w-9 shrink-0 items-center justify-center"
export const CHIP =
  "hit min-h-[36px] rounded-full border px-3 text-[11px] leading-none tracking-[0.04em] disabled:opacity-30"
export const ORD =
  "hit ord min-h-[36px] text-[11px] leading-none tracking-[0.04em]"
export function chipStyle(active: boolean): CSSProperties {
  return active
    ? { background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }
    : { color: "var(--ink)", borderColor: "var(--rule)" }
}

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

const ikon = (d: string, k = "h-4 w-4") => (
  <svg viewBox="0 0 24 24" className={k} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {d.split("|").map((q, i) => <path key={i} d={q} />)}
  </svg>
)
export const IcoRute = ikon("M3 3h18v18H3z|M9 3v18|M15 3v18|M3 9h18|M3 15h18")
export const IcoMontasje = ikon("M3 20h18|M6 15.5h12|M8.5 11h7|M11 6.5h2")

export const IcoSliders = ikon("M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4")
export const IcoDown = ikon("m6 9 6 6 6-6")
export const IcoAngre = ikon("M9 14 4 9l5-5|M4 9h10a6 6 0 0 1 0 12h-3", "h-3.5 w-3.5")
export const IcoGjerOm = ikon("m15 14 5-5-5-5|M20 9H10a6 6 0 0 0 0 12h3", "h-3.5 w-3.5")
export const IcoFirkant = ikon("M4 5h16v14H4z|M7.5 16c1.2-4.5 3.2-2.4 4.3-5.4")
export const IcoMjuk = ikon("M4 20V11a7 7 0 0 1 7-7h9")
export const IcoReset = ikon("M3 12a9 9 0 1 0 2.6-6.36|M3 4v4.5h4.5", "h-3.5 w-3.5")
export const IcoShare = ikon("M12 3v12|m8 7 4-4 4 4|M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8", "h-3.5 w-3.5")
export const IcoUttak = ikon("M12 15V3|m8 11 4 4 4-4|M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4")
export const IcoForm = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.5 9 12 4l6.5 5-2.5 9.5h-8z" />
    {[[5.5, 9], [12, 4], [18.5, 9], [16, 18.5], [8, 18.5]].map(([x, y]) => (
      <circle key={`${x},${y}`} cx={x} cy={y} r={2.1} fill="var(--paper)" />
    ))}
  </svg>
)
export const IcoTeikn = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 19 4 7l9-3 7 6" />
    <path d="M20 10l-2 5" strokeDasharray="2 2.6" />
    <circle cx={5} cy={19} r={2.2} fill="var(--paper)" />
  </svg>
)
export const IcoSkjer = ikon("M3 21l6-6|M9 15 20.5 3.5c1.3 3.3.4 6.3-2.4 8.4L9 15z", "h-7 w-7")
export const IcoSlett = ikon("M4 7h16|M9 7V4h6v3|M6 7l1 13h10l1-13|M10 11v6|M14 11v6", "h-5 w-5")
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
export const IcoSkal = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4.5" width="18" height="15" rx="1.5" strokeWidth={1.5} strokeDasharray="3 2.6" />
    <path d="M8 8.5v7M12 8.5v7M16 8.5v7" strokeWidth={2.2} />
  </svg>
)
export const IcoBoy = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round">
    <path d="M3 7h18" strokeWidth={1.2} opacity={0.45} />
    <path d="M3 17c4.5-7 13.5-7 18 0" strokeWidth={2.4} />
  </svg>
)
export const IcoBit = ikon("M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z|M3 7.5 12 12l9-4.5|M12 12v9", "h-5 w-5")
export const IcoDupliser = ikon("M9 9h10v10H9z|M5 15V5h10", "h-5 w-5")
export const IcoKopier = ikon("M9 9h10v10H9z|M5 15V5h10", "h-4 w-4")
export const IcoLimInn = ikon("M9 4h6v3H9z|M15 5h3v15H6V5h3|M12 10v7|m9 14 3 3 3-3", "h-4 w-4")

export function Tavla({ metrics, rules, busy, params, onChange, onFiksAlle }: {
  metrics: Metrics | null
  rules: readonly Rule[]
  busy: boolean
  params: ParamBag
  onChange: (p: ParamBag) => void
  onFiksAlle: () => void
}) {
  const trygge = rules.filter((r) => !r.ok && r.fiks && !r.fiks.riv)
  const eig = new Map<string, Rule>()
  for (const r of rules) if (r.rad) eig.set(r.rad, r)
  const fiksKnapp = trygge.length ? (
    <button
      type="button"
      aria-label={`fiks alt: ${trygge.length} råd`}
      title="trykk alle råda som ikkje riv arbeid, eitt etter eitt, til det ikkje er fleire. eitt steg i angre"
      disabled={busy}
      onClick={onFiksAlle}
      className="hit shrink-0 rounded-full border px-2 py-[2px] text-[10px] leading-[14px] tracking-[0.04em]"
      style={{ borderColor: "currentColor", opacity: busy ? 0.3 : 0.85 }}
      data-fiksalle=""
    >
      fiks alt · {trygge.length}
    </button>
  ) : null
  const rader = metrics ? metrics.list : RADER.map((r) => ({ ...r, text: DASH }))
  const utanRad = rules.filter((r) => !r.rad && !r.ok)
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
      {utanRad.map((r) => (
        <div key={r.id} title={r.why} className="col-span-2 flex items-baseline justify-between gap-2 py-[2px] leading-4">
          <dt className="dim shrink-0 truncate">{r.label}</dt>
          <dd className="tab flex min-w-0 items-baseline justify-end gap-1.5 text-right" style={{ color: r.hard ? "var(--warn)" : undefined }}>
            <span className="truncate" style={{ textDecoration: r.hard ? undefined : "underline dotted", textUnderlineOffset: 3 }}>{r.value}</span>
            <Fiksen rule={r} params={params} onChange={onChange} />
          </dd>
        </div>
      ))}
      {fiksKnapp && (
        <div className="col-span-2 flex items-baseline justify-end py-[2px] leading-4">{fiksKnapp}</div>
      )}
    </dl>
  )
}

const hjul: { el: Element | null; tid: number } = { el: null, tid: 0 }

export function SliderRow({ k, r, value, bi, benk, onChange, onSkrubb }: {
  k: string
  r: Range
  value: number
  bi?: string
  benk?: boolean
  onChange: (k: string, v: number) => void
  onSkrubb?: (aktiv: boolean) => void
}) {
  const shown = r.names ? (r.names[Math.round(value)] ?? String(value)) : feltTal(value, r.step).replace(".", ",")
  const [skriv, setSkriv] = useState<string | null>(null)
  const kanSkrive = !r.names
  const opneFelt = () => setSkriv(feltTal(value, r.step).replace(".", ","))
  const sendt = useRef(false)
  const send = (s: string) => {
    if (sendt.current) return
    sendt.current = true
    setSkriv(null)
    const v = lesTal(s)
    if (s.trim() !== "" && Number.isFinite(v)) onChange(k, snap(v, r))
  }
  const rad = useRef<HTMLDivElement | null>(null)
  const naa = useRef({ value, r, k, skriv })
  naa.current = { value, r, k, skriv }
  useEffect(() => {
    const el = rad.current
    if (!el) return
    let sum = 0
    const paa = (e: WheelEvent) => {
      const { value: v, r: rr, k: kk, skriv: sk } = naa.current
      if (sk !== null) return
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : -e.deltaY
      if (!d) return
      const no = e.timeStamp
      if (hjul.el && hjul.el !== el && no - hjul.tid < 160) {
        hjul.tid = no
        return
      }
      hjul.el = el
      hjul.tid = no
      e.preventDefault()
      if (Math.sign(d) !== Math.sign(sum)) sum = 0
      sum += d
      const HAKK = 100
      const n = Math.trunc(sum / HAKK)
      if (!n) return
      sum -= n * HAKK
      onChange(kk, snap(v + n * (e.shiftKey ? 10 : 1) * rr.step, rr))
    }
    el.addEventListener("wheel", paa, { passive: false })
    return () => el.removeEventListener("wheel", paa)
  }, [onChange])
  return (
    <div
      ref={rad}
      className="flex min-h-[44px] items-center gap-3"
      onDoubleClick={() => { if (benk && kanSkrive && skriv === null) { sendt.current = false; opneFelt() } }}
    >
      <span className="w-20 shrink-0 text-left text-[10px] uppercase leading-[1.2] tracking-[0.12em]" style={{ color: "var(--ink)" }}>
        {r.label}
        {bi && <span className="dim tab block pt-px text-[9px] normal-case tracking-[0.02em]">{bi}</span>}
      </span>
      <input
        type="range"
        min={r.min}
        max={r.max}
        step={r.step}
        value={value}
        aria-label={`${r.label}, tal`}
        aria-valuetext={`${shown}${r.unit ? " " + r.unit : ""}`}
        title={`${r.label}: ${r.min}–${r.max}${r.unit ? " " + r.unit : ""} · dra i sporet${kanSkrive ? " · trykk på talet: skriv" : ""}`}
        className="slider min-w-0 flex-1"
        onChange={(e) => onChange(k, Number(e.currentTarget.value))}
        onPointerDown={() => onSkrubb?.(true)}
        onPointerUp={() => onSkrubb?.(false)}
        onPointerCancel={() => onSkrubb?.(false)}
        onKeyDown={(e) => {
          if (skriv !== null) return
          if (kanSkrive && e.key === "Enter") {
            e.preventDefault()
            sendt.current = false
            return opneFelt()
          }
          const steg = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "PageUp" ? 10 : e.key === "PageDown" ? -10 : 0
          if (!steg) return
          e.preventDefault()
          onChange(k, snap(value + steg * (e.shiftKey ? 10 : 1) * r.step, r))
        }}
      />
      <span className="tab flex w-[68px] shrink-0 items-baseline justify-end text-[11px]" style={{ color: "var(--ink)" }}>
        {skriv !== null ? (
          <input
            aria-label={`${r.label}, skriv`}
            className="tab w-full min-w-0 border-0 border-b bg-transparent p-0 text-right text-[11px] outline-none"
            style={{ color: "var(--ink)", borderColor: "var(--ink)", fontSize: benk ? 11 : 16 }}
            inputMode="decimal"
            enterKeyHint="done"
            autoFocus
            value={skriv}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setSkriv(e.target.value)}
            onBlur={(e) => send(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === "Enter") send(e.currentTarget.value)
              else if (e.key === "Escape") {
                sendt.current = true
                setSkriv(null)
              }
            }}
          />
        ) : kanSkrive ? (
          <button
            type="button"
            aria-label={`${r.label}, skriv tal`}
            title={`skriv ${r.label}${r.unit ? " i " + r.unit : ""}`}
            className="hit min-h-[44px] min-w-0 flex-1 truncate text-right"
            onClick={() => { sendt.current = false; opneFelt() }}
          >
            {shown}
          </button>
        ) : (
          <span className="truncate">{shown}</span>
        )}
        {r.unit && <span className="dim shrink-0 pl-0.5">{r.unit}</span>}
      </span>
    </div>
  )
}
