"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react"
import {
  FARGE_MIN, LAG_FARGAR, MATERIALS, TJUKNER, klokke, lagFarge,
  type Material, type Metric, type Rule,
} from "@/lib/core"
import { GROUPS, PARAM_RANGES } from "@/lib/params"
import { MJUK_TAK, type Plan } from "@/lib/plan"
import {
  CHIP, HAIR, ICON_BTN, IcoReset, IcoUttak, UTTAK,
  SliderRow, Tavla, chipStyle, n0, num, stengd, tjukn,
} from "./deler"
import {
  Arket as LegacyArket,
  KOL as LEGACY_KOL,
  kvaSlag,
  type ArketProps as LegacyArketProps,
  type Steg as LegacySteg,
} from "./arket-legacy"

export const KOL = LEGACY_KOL
export { kvaSlag }
export type Steg = LegacySteg
export type ArketProps = LegacyArketProps

type Fane = "form" | "grupper" | "materiale" | "kutt" | "sjekk" | "uttak"

const ikon = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {d.split("|").map((x, i) => <path key={i} d={x} />)}
  </svg>
)

const FANER: readonly { id: Fane; ord: string; icon: ReactNode }[] = [
  { id: "form", ord: "form", icon: ikon("M4 17 12 3l8 14z|M7 17h10") },
  { id: "grupper", ord: "grupper", icon: ikon("M4 6h16|M4 12h16|M4 18h16|M7 4v4|M13 10v4|M17 16v4") },
  { id: "materiale", ord: "materiale", icon: ikon("M12 3 4 7v10l8 4 8-4V7z|M4 7l8 4 8-4|M12 11v10") },
  { id: "kutt", ord: "kutt", icon: ikon("M4 5h16|M7 10h10|M5 15h14|M9 20h6") },
  { id: "sjekk", ord: "sjekk", icon: ikon("M5 12l4 4L19 6|M4 20h16") },
  { id: "uttak", ord: "uttak", icon: IcoUttak },
]

const IcoVenstre = ikon("M15 5l-7 7 7 7")
const IcoHogre = ikon("M9 5l7 7-7 7")

function Pager({ side, tal, onSide, ord, ekstra }: {
  side: number
  tal: number
  onSide: (n: number) => void
  ord: string
  ekstra?: ReactNode
}) {
  if (tal <= 1 && !ekstra) return null
  return (
    <div className="flex h-8 items-center gap-1 border-t pt-1" style={HAIR}>
      {tal > 1 ? (
        <>
          <button type="button" aria-label={`førre ${ord}`} disabled={side <= 0} onClick={() => onSide(side - 1)} className={CHIP + " flex h-7 w-9 items-center justify-center px-0"} style={{ ...chipStyle(false), opacity: side <= 0 ? 0.25 : 1 }}>
            {IcoVenstre}
          </button>
          <span className="dim tab min-w-0 flex-1 text-center text-[10px] uppercase tracking-[0.12em]">
            {ord} · {side + 1}/{tal}
          </span>
          <button type="button" aria-label={`neste ${ord}`} disabled={side >= tal - 1} onClick={() => onSide(side + 1)} className={CHIP + " flex h-7 w-9 items-center justify-center px-0"} style={{ ...chipStyle(false), opacity: side >= tal - 1 ? 0.25 : 1 }}>
            {IcoHogre}
          </button>
        </>
      ) : <span className="min-w-0 flex-1" />}
      {ekstra}
    </div>
  )
}

function Summary({ p }: { p: ArketProps }) {
  const m = p.metrics
  if (p.feil) return <span style={{ color: "var(--warn)" }}>{p.feil}</span>
  if (p.melding) return <span className="opacity-70">{p.melding}</span>
  if (p.hentar) return <span className="dim">les …</span>
  if (!m) return <span className="dim">snittar …</span>
  const raud = new Set(p.rules.filter((r) => !r.ok && r.hard && r.rad).map((r) => r.rad))
  const tal = [
    ["plan", `${p.plan.length} plan`],
    ["delar", `${n0(m.parts)} delar`],
    ["ark", `${n0(m.sheets)} ark`],
    ["tid", klokke(m.cutTime)],
  ] as const
  return (
    <>
      {tal.map(([id, text], i) => (
        <span key={id} className={id === "tid" ? "hidden min-[430px]:inline" : undefined}>
          {i > 0 && <span className="px-0.5 opacity-30">·</span>}
          <span style={raud.has(id) ? { color: "var(--warn)" } : { opacity: 0.62 }}>{text}</span>
        </span>
      ))}
    </>
  )
}

function Tabs({ fane, onFane }: { fane: Fane; onFane: (f: Fane) => void }) {
  return (
    <div role="tablist" aria-label="kontrollfaner" className="flex shrink-0 items-center gap-0.5 border-y px-1 py-1" style={HAIR}>
      {FANER.map((f) => {
        const paa = fane === f.id
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={paa}
            aria-label={f.ord}
            title={f.ord}
            onClick={() => onFane(f.id)}
            className="hit flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg"
            style={paa ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)", color: "var(--ink)" } : { opacity: 0.52 }}
          >
            {f.icon}
          </button>
        )
      })}
    </div>
  )
}

function FormTab({ p }: { p: ArketProps }) {
  const keys = ["storleik", "rotX", "rotY", "rotZ"] as const
  const [side, setSide] = useState(0)
  const sider = 2
  const mine = keys.slice(side * 2, side * 2 + 2)
  return (
    <div className="px-3 pb-1 pt-1">
      {mine.map((k) => (
        <SliderRow
          key={k}
          k={k}
          r={PARAM_RANGES[k]}
          value={num(p.params, k, PARAM_RANGES[k].min)}
          benk={false}
          onChange={(key, v) => p.onChange({ ...p.params, [key]: v })}
          onSkrubb={p.onSkrubb}
          bi={k === "storleik" && p.metrics ? `${n0(p.metrics.envX)}×${n0(p.metrics.envY)}×${n0(p.metrics.envZ)}` : undefined}
        />
      ))}
      <Pager
        side={side}
        tal={sider}
        onSide={setSide}
        ord="form"
        ekstra={(
          <button type="button" onClick={p.onReset} aria-label="attende til standarden" title="attende til standarden. nettet ditt står" className={CHIP + " flex h-7 w-9 items-center justify-center px-0"} style={chipStyle(false)}>
            {IcoReset}
          </button>
        )}
      />
    </div>
  )
}

function LayerRow({ no, ord, onFarge }: { no: number; ord: string; onFarge: (n: number) => void }) {
  return (
    <div role="group" aria-label={`lag ${ord}`} className="flex h-9 items-center gap-1">
      <span className="dim w-8 shrink-0 text-[9px] uppercase tracking-[0.12em]">{ord}</span>
      <span className="rull-x flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overscroll-contain">
        <button type="button" aria-label="ikkje noko lag" aria-pressed={no === 0} onClick={() => onFarge(0)} className="hit flex h-7 w-7 shrink-0 items-center justify-center">
          <span aria-hidden="true" className="block h-4 w-4 rounded-full border-2" style={{ borderColor: no === 0 ? "var(--ink)" : "var(--rule)" }} />
        </button>
        {LAG_FARGAR.map((hex, i) => i < FARGE_MIN ? null : (
          <button key={`${hex}-${i}`} type="button" aria-label={`lag C${String(i).padStart(2, "0")}`} aria-pressed={no === i} onClick={() => onFarge(i)} className="hit flex h-7 w-7 shrink-0 items-center justify-center">
            <span aria-hidden="true" className="block h-4 w-4 rounded-full border-2" style={{ background: hex, borderColor: no === i ? "var(--ink)" : "transparent" }} />
          </button>
        ))}
      </span>
    </div>
  )
}

function ProfileRow({ p }: { p: ArketProps }) {
  const S = num(p.params, "storleik", 150)
  const tak = +(MJUK_TAK * S).toFixed(1)
  return (
    <SliderRow
      k="mjuk"
      r={{ label: "mjuk", min: 0, max: tak, step: 0.5, unit: "mm" }}
      value={Math.min(tak, +(p.mjuk * S).toFixed(1))}
      benk={false}
      onChange={(_, v) => p.onMjuk(S > 0 ? v / S : 0)}
      onSkrubb={p.onSkrubb}
    />
  )
}

function VirrRow({ p }: { p: ArketProps }) {
  const S = num(p.params, "storleik", 150)
  return (
    <SliderRow
      k="virr"
      r={{ label: "virr", min: 0, max: Math.round(S * 0.12), step: 0.5, unit: "mm" }}
      value={Math.min(Math.round(S * 0.12), p.virr)}
      benk={false}
      onChange={(_, v) => p.onVirr(v)}
      onSkrubb={p.onSkrubb}
    />
  )
}

type GruppeRad =
  | { kind: "gruppe"; id: number; tal: number }
  | { kind: "plan"; plan: Plan }

function AssemblyRows({ p }: { p: ArketProps }) {
  const rows = (p.mont?.delar ?? []).filter((d) => d.steg === p.montSteg - 1)
  const [side, setSide] = useState(0)
  const tal = Math.max(1, Math.ceil(rows.length / 2))
  useEffect(() => setSide((s) => Math.min(s, tal - 1)), [tal])
  const mine = rows.slice(side * 2, side * 2 + 2)
  const veg: Record<string, string> = { ned: "ned", opp: "opp", side: "frå sida", ligg: "ligg", boygd: "bøygd inn" }
  return (
    <div className="px-3 pb-1 pt-1">
      {mine.length ? mine.map((d) => (
        <div key={d.adr} className="flex h-9 items-center gap-2 rounded-lg px-1.5 text-[11px]">
          <span className="tab w-8 shrink-0">{d.adr}</span>
          <span className="min-w-0 flex-1 truncate">{veg[d.veg] ?? d.veg}</span>
          <span className="tab dim shrink-0">ark {d.ark}</span>
        </div>
      )) : <p className="dim h-9 px-1.5 py-2 text-[11px]">ingen delar</p>}
      <Pager side={side} tal={tal} onSide={setSide} ord={`steg ${p.montSteg}`} />
    </div>
  )
}

function GroupsTab({ p }: { p: ArketProps }) {
  const [utbretta, setUtbretta] = useState<ReadonlySet<number>>(() => new Set())
  const [side, setSide] = useState(0)
  const [detalj, setDetalj] = useState(0)

  const rader = useMemo(() => {
    const out: GruppeRad[] = []
    const sett = new Set<number>()
    for (const pl of p.plan) {
      if (pl.gruppe && !sett.has(pl.gruppe)) {
        sett.add(pl.gruppe)
        out.push({ kind: "gruppe", id: pl.gruppe, tal: p.plan.filter((q) => q.gruppe === pl.gruppe).length })
      }
      const syne = !pl.gruppe || utbretta.has(pl.gruppe) || p.vald === pl.id
      if (syne) out.push({ kind: "plan", plan: pl })
    }
    return out
  }, [p.plan, p.vald, utbretta])

  const leiar = p.plan.find((q) => q.id === p.vald)
  const detaljar: { ord: string; node: ReactNode }[] = []
  if (p.valdGruppe !== null) detaljar.push({ ord: "virr", node: <VirrRow p={p} /> })
  if (p.vald !== null) {
    detaljar.push({ ord: "profil", node: <ProfileRow p={p} /> })
    detaljar.push({ ord: "lag", node: <LayerRow no={lagFarge(leiar?.farge) ?? 0} ord="lag" onFarge={p.onFarge} /> })
  } else if (p.bitFarge !== null) {
    detaljar.push({ ord: "bit", node: <LayerRow no={p.bitFarge} ord="bit" onFarge={p.onBitFarge} /> })
  }

  const perSide = detaljar.length ? 1 : 2
  const sider = Math.max(1, Math.ceil(rader.length / perSide))
  useEffect(() => setSide((s) => Math.min(s, sider - 1)), [sider])
  useEffect(() => setDetalj((s) => Math.min(s, Math.max(0, detaljar.length - 1))), [detaljar.length])

  if (p.view === "montasje") return <AssemblyRows p={p} />

  const mine = rader.slice(side * perSide, side * perSide + perSide)
  const brett = (g: number) => {
    const paa = p.valdGruppe === g
    setUtbretta((s) => {
      const n = new Set(s)
      if (paa) n.delete(g)
      else n.add(g)
      return n
    })
    if (paa) p.onVald(null)
    else p.onVelGruppe(g)
  }

  return (
    <div className="px-3 pb-1 pt-1">
      {mine.length ? mine.map((rad) => {
        if (rad.kind === "gruppe") {
          const paa = p.valdGruppe === rad.id
          return (
            <div key={`g-${rad.id}`} role="option" aria-selected={paa} data-gruppe={rad.id} className="flex h-9 items-center gap-1 rounded-lg px-1.5 text-[11px]" style={paa ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)" } : undefined}>
              <button type="button" aria-expanded={utbretta.has(rad.id)} aria-label={`gruppe ${rad.id}`} onClick={() => brett(rad.id)} className="hit flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="tab w-7 shrink-0">G{rad.id}</span>
                <span className="min-w-0 flex-1 truncate">gruppe</span>
                <span className="tab dim shrink-0">{rad.tal} plan</span>
              </button>
              <button type="button" aria-label={`slett gruppe ${rad.id}`} onClick={() => p.onSlettGruppe(rad.id)} className="hit dim h-8 w-9 shrink-0">×</button>
            </div>
          )
        }
        const pl = rad.plan
        const mineKutt = p.liste.filter((k) => k.plan === pl.id)
        const ledd = mineKutt.reduce((a, k) => a + k.joints, 0)
        const paa = p.vald === pl.id
        return (
          <div key={`p-${pl.id}`} role="option" aria-selected={paa} data-plan={pl.id} className="flex h-9 items-center gap-1 rounded-lg px-1.5 text-[11px]" style={paa ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)" } : undefined}>
            <button type="button" onClick={() => p.onVald(paa ? null : pl.id)} className="hit flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className="tab w-7 shrink-0">{pl.id}</span>
              <span className="min-w-0 flex-1 truncate">{kvaSlag(pl.n)}</span>
              <span className="tab dim shrink-0">{mineKutt.length ? `${ledd} ledd` : "utanfor"}</span>
            </button>
            <button type="button" aria-label={`slett plan ${pl.id}`} onClick={() => p.onSlett(pl.id)} className="hit dim h-8 w-9 shrink-0">×</button>
          </div>
        )
      }) : <p className="dim h-9 px-1.5 py-2 text-[11px]">ingen plan</p>}

      {detaljar.length > 0 && (
        <div className="border-t pt-0.5" style={HAIR}>
          {detaljar[detalj]?.node}
          <Pager side={detalj} tal={detaljar.length} onSide={setDetalj} ord={detaljar[detalj]?.ord ?? "val"} />
        </div>
      )}
      <Pager side={side} tal={sider} onSide={setSide} ord="grupper" />
    </div>
  )
}

function MaterialTab({ p }: { p: ArketProps }) {
  const [side, setSide] = useState(0)
  const naaTjukn = num(p.params, "tjukn", TJUKNER[0])
  return (
    <div className="px-3 pb-1 pt-1">
      {side === 0 ? (
        <>
          <div className="rull-x flex h-9 items-center gap-1 overflow-x-auto overscroll-contain">
            {(Object.keys(MATERIALS) as Material[]).map((mk) => (
              <button key={mk} type="button" aria-pressed={p.params.material === mk} aria-label={`materiale: ${MATERIALS[mk].label}`} title={MATERIALS[mk].label} onClick={() => p.onChange({ ...p.params, material: mk })} className="hit flex h-8 w-8 shrink-0 items-center justify-center">
                <span aria-hidden="true" className="block h-5 w-5 rounded-full border-2" style={{ backgroundColor: MATERIALS[mk].hex, borderColor: p.params.material === mk ? "var(--ink)" : "var(--rule)" }} />
              </button>
            ))}
          </div>
          <div className="rull-x flex h-9 items-center gap-1 overflow-x-auto overscroll-contain">
            <span className="dim mr-1 shrink-0 text-[9px] uppercase tracking-[0.12em]">tjukn</span>
            {TJUKNER.map((t) => (
              <button key={t} type="button" aria-pressed={naaTjukn === t} title={`${tjukn(t)} mm plate`} onClick={() => p.onChange({ ...p.params, tjukn: t })} className={CHIP + " tab min-w-[42px] shrink-0 px-2"} style={chipStyle(naaTjukn === t)}>
                {tjukn(t)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {(["arkB", "arkH"] as const).map((k) => (
            <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(p.params, k, PARAM_RANGES[k].min)} benk={false} onChange={(key, v) => p.onChange({ ...p.params, [key]: v })} onSkrubb={p.onSkrubb} />
          ))}
        </>
      )}
      <Pager side={side} tal={2} onSide={setSide} ord={side === 0 ? "materiale" : "plate"} />
    </div>
  )
}

const KUTT_GRUPPER = GROUPS
  .filter((g) => g.id !== "form" && g.id !== "plate")
  .map((g) => ({ ...g, keys: g.keys.filter((k) => k !== "tjukn") }))
  .filter((g) => g.keys.length)

function CuttingTab({ p }: { p: ArketProps }) {
  const [side, setSide] = useState(0)
  const g = KUTT_GRUPPER[side] ?? KUTT_GRUPPER[0]
  useEffect(() => setSide((s) => Math.min(s, KUTT_GRUPPER.length - 1)), [])
  return (
    <div className="px-3 pb-1 pt-1">
      <div className="dim h-5 px-1.5 pt-1 text-[9px] uppercase leading-none tracking-[0.18em]">{g?.label}</div>
      {g?.keys.map((k) => (
        <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(p.params, k, PARAM_RANGES[k].min)} benk={false} onChange={(key, v) => p.onChange({ ...p.params, [key]: v })} onSkrubb={p.onSkrubb} />
      ))}
      <Pager side={side} tal={KUTT_GRUPPER.length} onSide={setSide} ord="kutt" />
    </div>
  )
}

type CheckPage = { metrics: Metric[]; rules: Rule[] }

function ChecksTab({ p }: { p: ArketProps }) {
  const pages = useMemo<CheckPage[]>(() => {
    if (!p.metrics) return []
    const out: CheckPage[] = []
    const m = p.metrics.list
    for (let i = 0; i < m.length; i += 2) {
      const mine = m.slice(i, i + 2)
      const ids = new Set(mine.map((x) => x.id))
      out.push({ metrics: mine, rules: p.rules.filter((r) => !!r.rad && ids.has(r.rad)) })
    }
    const frie = p.rules.filter((r) => !r.rad && !r.ok)
    for (let i = 0; i < frie.length; i += 2) out.push({ metrics: [], rules: frie.slice(i, i + 2) })
    return out.length ? out : [{ metrics: [], rules: [] }]
  }, [p.metrics, p.rules])
  const [side, setSide] = useState(0)
  useEffect(() => setSide((s) => Math.min(s, Math.max(0, pages.length - 1))), [pages.length])

  if (!p.metrics) return <div className="dim px-4 py-4 text-[11px]">måler …</div>
  const page = pages[side] ?? pages[0]
  const metrics = { ...p.metrics, list: page.metrics }
  return (
    <div className="px-3 pb-1 pt-2">
      <Tavla metrics={metrics} rules={page.rules} busy={p.busy} params={p.params} onChange={p.onChange} onFiksAlle={p.onFiksAlle} />
      <Pager side={side} tal={pages.length} onSide={setSide} ord="sjekk" />
    </div>
  )
}

function ExportTab({ p }: { p: ArketProps }) {
  const sider = UTTAK.length + 1
  const [side, setSide] = useState(0)
  const harde = p.rules.filter((r) => r.hard && !r.ok)
  const g = side < UTTAK.length ? UTTAK[side] : null
  return (
    <div className="px-3 pb-1 pt-2">
      {g ? (
        <>
          <div className="dim h-5 px-1 text-[9px] uppercase leading-none tracking-[0.18em]">{g.bolk}</div>
          <div className="flex min-h-9 flex-wrap items-center gap-1.5">
            {g.filer.map((x) => {
              const stopp = stengd(x.id, p.metrics)
              return (
                <button
                  key={x.id}
                  type="button"
                  disabled={p.busy || !!stopp}
                  data-varsel={!stopp && harde.length ? "" : undefined}
                  title={stopp || x.hint}
                  onClick={() => p.onExport(x.id)}
                  className={CHIP + " uppercase tracking-[0.1em]"}
                  style={{ ...chipStyle(false), opacity: stopp ? 0.3 : undefined, color: !stopp && harde.length ? "var(--warn)" : undefined }}
                >
                  {x.label}
                </button>
              )
            })}
          </div>
          {harde.length > 0 && <p className="pt-1 text-[9px]" style={{ color: "var(--warn)" }}>{harde.map((r) => r.label).join(", ")} — går ikkje i hop</p>}
        </>
      ) : (
        <div className="flex min-h-14 items-center gap-1.5">
          {([
            ["kuttliste", "kuttliste", "kvar del, med adresse, mål og plate"],
            ["oppsett", "oppsett", "alle innstillingane som tekst"],
          ] as const).map(([id, ord, hint]) => (
            <button key={id} type="button" title={hint} aria-pressed={p.verkty === id} onClick={() => p.onVerkty(id)} className={CHIP + " uppercase tracking-[0.1em]"} style={chipStyle(p.verkty === id)}>
              {ord}
            </button>
          ))}
        </div>
      )}
      <Pager side={side} tal={sider} onSide={setSide} ord="uttak" />
    </div>
  )
}

function MobileArket(p: ArketProps) {
  const open = p.steg !== "line"
  const [fane, setFane] = useState<Fane>("grupper")
  const el = useRef<HTMLElement | null>(null)
  const drag = useRef<{ y: number; id: number } | null>(null)
  const [pull, setPull] = useState(0)

  useEffect(() => {
    const s = el.current
    if (!s) return
    const meld = () => p.onHogd(Math.round((s.getBoundingClientRect().height + 24) / 40) * 40)
    const ro = new ResizeObserver(meld)
    ro.observe(s)
    meld()
    return () => ro.disconnect()
  }, [p.onHogd, open, fane])

  const setOpenFane = (f: Fane) => {
    setFane(f)
    if (!open) p.onSteg("midt")
  }
  const dragOpp = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setPull(0)
    const dy = e.clientY - d.y
    if (dy < -24 && !open) p.onSteg("midt")
    if (dy > 24 && open) p.onSteg("line")
  }

  const content =
    fane === "form" ? <FormTab p={p} /> :
    fane === "grupper" ? <GroupsTab p={p} /> :
    fane === "materiale" ? <MaterialTab p={p} /> :
    fane === "kutt" ? <CuttingTab p={p} /> :
    fane === "sjekk" ? <ChecksTab p={p} /> :
    <ExportTab p={p} />

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex flex-col items-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <section
        ref={el}
        aria-label="kontrollar"
        aria-busy={p.busy}
        className="ark pointer-events-auto relative flex min-w-0 max-w-md flex-col overflow-hidden rounded-3xl border sm:max-w-xl"
        style={{
          ...HAIR,
          width: "calc(100vw - 24px)",
          maxHeight: "40dvh",
          background: "var(--paper)",
          color: "var(--ink)",
          transform: pull ? `translateY(${pull}px)` : undefined,
        }}
      >
        <div
          className="shrink-0"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => { if (e.pointerType !== "mouse") drag.current = { y: e.clientY, id: e.pointerId } }}
          onPointerMove={(e) => {
            const d = drag.current
            if (d && d.id === e.pointerId) setPull(Math.max(-18, Math.min(18, (e.clientY - d.y) * 0.25)))
          }}
          onPointerUp={dragOpp}
          onPointerCancel={dragOpp}
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 22%, transparent)" }} />
        </div>

        <div className="flex h-9 shrink-0 items-center gap-1 px-2">
          <button
            type="button"
            aria-label="plan, delar, ark og tid"
            onClick={() => {
              if (open) p.onSteg("line")
              else {
                setFane("grupper")
                p.onSteg("midt")
              }
            }}
            className="hit tab min-w-0 flex-1 truncate rounded-lg pl-2 text-left text-[10px] tracking-[0.04em]"
          >
            <Summary p={p} />
          </button>
          <button type="button" aria-label="eksport" title="uttak" onClick={() => setOpenFane("uttak")} className={ICON_BTN} aria-pressed={open && fane === "uttak"}>
            {IcoUttak}
          </button>
        </div>

        {open && (
          <>
            <Tabs fane={fane} onFane={setFane} />
            <div className="min-h-0 shrink overflow-hidden">
              {content}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export function Arket(p: ArketProps) {
  if (p.benk) return <LegacyArket {...p} />
  return <MobileArket {...p} />
}
