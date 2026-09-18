"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react"
import {
  FARGE_MIN, LAG_FARGAR, MATERIALS, TJUKNER, klokke, lagFarge,
  type Material, type Metric, type Rule,
} from "@/lib/core"
import { GROUPS, KILAR, PARAM_RANGES } from "@/lib/params"
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

import { useGjenta } from "./gjenta"

export const KOL = LEGACY_KOL
export { kvaSlag }
export type Steg = LegacySteg
export type ArketProps = LegacyArketProps

type Fane = "grupper" | "materiale" | "kutt" | "status"

const ikon = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {d.split("|").map((x, i) => <path key={i} d={x} />)}
  </svg>
)

const FANER: readonly { id: Fane; ord: string }[] = [
  { id: "grupper", ord: "plan" },
  { id: "materiale", ord: "materiale" },
  { id: "kutt", ord: "kutt" },
  { id: "status", ord: "sjekk" },
]

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
    <div role="tablist" aria-label="kontrollfaner" className="grid shrink-0 grid-cols-4 gap-0.5 border-y px-1 py-1" style={HAIR}>
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
            className="hit flex h-7 min-w-0 items-center justify-center rounded-lg px-1 text-[10px] uppercase tracking-[0.08em]"
            style={paa ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)", color: "var(--ink)" } : { opacity: 0.52 }}
          >
            {f.ord}
          </button>
        )
      })}
    </div>
  )
}

function FormTab({ p }: { p: ArketProps }) {
  const keys = ["storleik", "rotX", "rotY", "rotZ"] as const
  return (
    <div className="px-3 pb-1 pt-1">
      {keys.map((k) => (
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
      <div className="flex h-8 items-center justify-end border-t pt-1" style={HAIR}>
        <button type="button" onClick={p.onReset} aria-label="attende til standarden" title="attende til standarden. nettet ditt står" className={CHIP + " flex h-7 w-9 items-center justify-center px-0"} style={chipStyle(false)}>
          {IcoReset}
        </button>
      </div>
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
  const veg: Record<string, string> = { ned: "ned", opp: "opp", side: "frå sida", ligg: "ligg", boygd: "bøygd inn" }
  return (
    <div className="px-3 pb-1 pt-1">
      {rows.length ? rows.map((d) => (
        <div key={d.adr} className="flex h-9 items-center gap-2 rounded-lg px-1.5 text-[11px]">
          <span className="tab w-8 shrink-0">{d.adr}</span>
          <span className="min-w-0 flex-1 truncate">{veg[d.veg] ?? d.veg}</span>
          <span className="tab dim shrink-0">ark {d.ark}</span>
        </div>
      )) : <p className="dim h-9 px-1.5 py-2 text-[11px]">ingen delar</p>}
    </div>
  )
}

function GroupsTab({ p }: { p: ArketProps }) {
  const [utbretta, setUtbretta] = useState<ReadonlySet<number>>(() => new Set())

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

  if (p.view === "montasje") return <AssemblyRows p={p} />

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
    <div className="px-3 pb-1 pt-1" role="listbox" aria-label="plan">
      {rader.length ? rader.map((rad) => {
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
          {detaljar.map((d) => <div key={d.ord}>{d.node}</div>)}
        </div>
      )}
    </div>
  )
}

function MaterialTab({ p }: { p: ArketProps }) {
  const naaTjukn = num(p.params, "tjukn", TJUKNER[0])
  const naaKilar = Math.round(num(p.params, "kilar", 0))
  return (
    <div className="px-3 pb-1 pt-1">
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
      <div className="flex h-9 items-center gap-1">
        <span className="dim mr-1 shrink-0 text-[9px] uppercase tracking-[0.12em]">kilar</span>
        {KILAR.map((namn, i) => (
          <button key={namn} type="button" aria-pressed={naaKilar === i} aria-label={`kilar ${namn}`} onClick={() => p.onChange({ ...p.params, kilar: i })} className={CHIP + " tab min-w-[42px] shrink-0 px-2"} style={chipStyle(naaKilar === i)}>
            {namn}
          </button>
        ))}
      </div>
      {(["tjukn", "klaring", "arkB", "arkH"] as const).map((k) => (
        <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(p.params, k, PARAM_RANGES[k].min)} benk={false} onChange={(key, v) => p.onChange({ ...p.params, [key]: v })} onSkrubb={p.onSkrubb} />
      ))}
    </div>
  )
}

const KUTT_PRIORITET = ["delar", "ledd", "kutt", "plate", "snapp", "nett", "forenkling"] as const
const KUTT_GRUPPER = KUTT_PRIORITET.map((id) => GROUPS.find((g) => g.id === id))
  .filter((g): g is (typeof GROUPS)[number] => !!g)
  .map((g) => ({ ...g, keys: g.keys.filter((k) => k !== "tjukn") }))
  .filter((g) => g.keys.length)

function CuttingTab({ p }: { p: ArketProps }) {
  return (
    <div className="px-3 pb-1 pt-1">
      {KUTT_GRUPPER.map((g) => (
        <section key={g.id} className="border-b pb-1 last:border-b-0" style={HAIR}>
          <div className="dim h-5 px-1.5 pt-1 text-[9px] uppercase leading-none tracking-[0.18em]">{g.label}</div>
          {g.keys.map((k) => (
            <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(p.params, k, PARAM_RANGES[k].min)} benk={false} onChange={(key, v) => p.onChange({ ...p.params, [key]: v })} onSkrubb={p.onSkrubb} />
          ))}
        </section>
      ))}
    </div>
  )
}

type CheckPage = { metrics: Metric[]; rules: Rule[] }

function ChecksTab({ p }: { p: ArketProps }) {
  const page = useMemo<CheckPage>(() => {
    if (!p.metrics) return { metrics: [], rules: [] }
    const m = p.metrics.list
    const ids = new Set(m.map((x) => x.id))
    return { metrics: m, rules: p.rules.filter((r) => !r.rad || ids.has(r.rad)) }
  }, [p.metrics, p.rules])

  if (!p.metrics) return <div className="dim px-4 py-4 text-[11px]">måler …</div>
  const metrics = { ...p.metrics, list: page.metrics }
  return (
    <div className="px-3 pb-1 pt-2">
      <Tavla metrics={metrics} rules={page.rules} busy={p.busy} params={p.params} onChange={p.onChange} onFiksAlle={p.onFiksAlle} />
    </div>
  )
}

const MOBIL_UTTAK = [...UTTAK.filter((g) => g.bolk === "plate"), ...UTTAK.filter((g) => g.bolk !== "plate")]

function ExportTab({ p }: { p: ArketProps }) {
  const harde = p.rules.filter((r) => r.hard && !r.ok)
  return (
    <div className="px-3 pb-1 pt-2">
      {MOBIL_UTTAK.map((g) => (
        <section key={g.bolk} className="border-b pb-1 last:border-b-0" style={HAIR}>
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
        </section>
      ))}
      {harde.length > 0 && <p className="pt-1 text-[9px]" style={{ color: "var(--warn)" }}>{harde.map((r) => r.label).join(", ")} — går ikkje i hop</p>}
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
    </div>
  )
}

const SKUFF_H = "26dvh"

function MobileArket(p: ArketProps) {
  const gjenta = useGjenta(p)
  const open = p.steg !== "line"
  const [fane, setFane] = useState<Fane>("grupper")
  const el = useRef<HTMLElement | null>(null)
  const drag = useRef<{ y: number; id: number } | null>(null)
  const [pull, setPull] = useState(0)
  const uttak = useRef<HTMLElement | null>(null)
  const rull = useRef<HTMLDivElement | null>(null)
  const [tilUttak, setTilUttak] = useState(false)

  useLayoutEffect(() => {
    if (!open || fane !== "status" || !tilUttak || !rull.current || !uttak.current) return
    rull.current.scrollTop += uttak.current.getBoundingClientRect().top - rull.current.getBoundingClientRect().top
    setTilUttak(false)
  }, [open, fane, tilUttak])

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
  const dro = useRef(false)
  const dragOpp = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setPull(0)
    const dy = e.clientY - d.y
    if (dy < -24 && !open) { dro.current = true; p.onSteg("midt") }
    if (dy > 24 && open) { dro.current = true; p.onSteg("line") }
  }

  const content =
    fane === "grupper" ? <><FormTab p={p} /><GroupsTab p={p} /></> :
    fane === "materiale" ? <MaterialTab p={p} /> :
    fane === "kutt" ? <CuttingTab p={p} /> :
    <div className="flex min-w-0 flex-col">
      <section aria-label="sjekk" className="min-w-0">
        <ChecksTab p={p} />
      </section>
      <section ref={uttak} aria-label="uttak" className="min-w-0 border-t" style={HAIR}>
        <ExportTab p={p} />
      </section>
    </div>

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
          height: open ? SKUFF_H : undefined,
          maxHeight: SKUFF_H,
          background: "var(--paper)",
          color: "var(--ink)",
          transform: pull ? `translateY(${pull}px)` : undefined,
        }}
      >
        <button
          type="button"
          aria-label={open ? "lat att kontrollane" : "opne kontrollane"}
          aria-expanded={open}
          className="hit w-full shrink-0 pb-1"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => { if (e.pointerType !== "mouse") drag.current = { y: e.clientY, id: e.pointerId } }}
          onPointerMove={(e) => {
            const d = drag.current
            if (d && d.id === e.pointerId) setPull(Math.max(-18, Math.min(18, (e.clientY - d.y) * 0.25)))
          }}
          onPointerUp={dragOpp}
          onPointerCancel={dragOpp}
          onClick={() => {
            if (dro.current) { dro.current = false; return }
            if (open) p.onSteg("line")
            else { setFane("grupper"); p.onSteg("midt") }
          }}
        >
          <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-9 rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 22%, transparent)" }} />
        </button>

        {!open && (
          <div className="flex h-9 shrink-0 items-center gap-1 px-2">
            <button
              type="button"
              aria-label="plan, delar, ark og tid"
              onClick={() => { setFane("grupper"); p.onSteg("midt") }}
              className="hit tab min-w-0 flex-1 truncate rounded-lg pl-2 text-left text-[10px] tracking-[0.04em]"
            >
              <Summary p={p} />
            </button>
            {gjenta && <button type="button" aria-label="gjenta flyttinga" title={gjenta.grunn ?? "ny plate med same flytting som førre kopi"} disabled={!gjenta.gjer} onClick={gjenta.gjer} className="hit h-9 min-w-14 shrink-0 px-1 text-[10px] uppercase tracking-[0.08em]">gjenta</button>}
            <button type="button" aria-label="eksport" title="uttak" onClick={() => { setTilUttak(true); setOpenFane("status") }} className={ICON_BTN}>
              {IcoUttak}
            </button>
          </div>
        )}

        {open && (
          <>
            <Tabs fane={fane} onFane={setFane} />
            <div key={fane} ref={rull} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
