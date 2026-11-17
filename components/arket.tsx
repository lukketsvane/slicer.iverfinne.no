"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react"
import {
  FARGE_MIN, LAG_FARGAR, MATERIALS, TJUKNER, klokke, lagFarge,
  type Material, type Metric, type Rule,
} from "@/lib/core"
import { useMaal, mt, omsetBolk, omsetGruppe, omsetMat, omsetRegel, omsetVerdi, UTTAK_EN, type Maal } from "@/lib/i18n"
import { GROUPS, KILAR, PARAM_RANGES } from "@/lib/params"
import { MJUK_TAK, bogRadius, type Plan } from "@/lib/plan"
import {
  CHIP, HAIR, ICON_BTN, IcoDupliser, IcoForm, IcoGizmo, IcoReset, IcoSlett, IcoUttak, UTTAK,
  SliderRow, Tavla, chipStyle, n0, num, stengd, tjukn,
} from "./deler"
import { SnarUttak } from "./uttak"
import {
  Arket as LegacyArket,
  KOL as LEGACY_KOL,
  kvaSlag,
  type ArketProps as LegacyArketProps,
  type GizmoModus,
  type Steg as LegacySteg,
} from "./arket-legacy"

import { useGjenta } from "./gjenta"

export const KOL = LEGACY_KOL
export { kvaSlag }
export type Steg = LegacySteg
export type ArketProps = LegacyArketProps
export type { GizmoModus }

type Fane = "grupper" | "materiale" | "kutt" | "status"

const FANER: readonly { id: Fane; nn: string; en: string }[] = [
  { id: "grupper", nn: "plan", en: "planes" },
  { id: "materiale", nn: "materiale", en: "material" },
  { id: "kutt", nn: "kutt", en: "cutting" },
  { id: "status", nn: "sjekk", en: "checks" },
]

function Summary({ p, maal }: { p: ArketProps; maal: Maal }) {
  const m = p.metrics
  if (p.feil) return <span style={{ color: "var(--warn)" }}>{p.feil}</span>
  if (p.melding) return <span className="opacity-70">{p.melding}</span>
  if (p.hentar) return <span className="dim">{mt(maal, "reading …", "les …")}</span>
  if (!m) return <span className="dim">{mt(maal, "slicing …", "snittar …")}</span>
  const raud = new Set(p.rules.filter((r) => !r.ok && r.hard && r.rad).map((r) => r.rad))
  const tal = [
    ["plan", `${p.plan.length} ${mt(maal, "planes", "plan")}`],
    ["delar", `${n0(m.parts)} ${mt(maal, "parts", "delar")}`],
    ["ark", `${n0(m.sheets)} ${mt(maal, "sheets", "ark")}`],
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

function Tabs({ fane, onFane, maal }: { fane: Fane; onFane: (f: Fane) => void; maal: Maal }) {
  return (
    <div role="tablist" aria-label={mt(maal, "control tabs", "kontrollfaner")} className="grid shrink-0 grid-cols-4 gap-0.5 border-y px-1 py-1" style={HAIR}>
      {FANER.map((f) => {
        const paa = fane === f.id
        const ord = mt(maal, f.en, f.nn)
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={paa}
            aria-label={ord}
            title={ord}
            onClick={() => onFane(f.id)}
            className="hit flex h-7 min-w-0 items-center justify-center rounded-lg px-1 text-[10px] uppercase tracking-[0.08em]"
            style={paa ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)", color: "var(--ink)" } : { opacity: 0.52 }}
          >
            {ord}
          </button>
        )
      })}
    </div>
  )
}

function FormTab({ p, maal }: { p: ArketProps; maal: Maal }) {
  return (
    <div className="px-3 pb-1 pt-1">
      <SliderRow
        k="storleik"
        r={PARAM_RANGES.storleik}
        value={num(p.params, "storleik", PARAM_RANGES.storleik.min)}
        benk={false}
        onChange={(key, v) => p.onChange({ ...p.params, [key]: v })}
        onSkrubb={p.onSkrubb}
        bi={p.metrics ? `${n0(p.metrics.envX)}×${n0(p.metrics.envY)}×${n0(p.metrics.envZ)}` : undefined}
      />
      <div className="flex h-8 items-center justify-between border-t pt-1" style={HAIR}>
        {p.onGizmo ? (
          <button
            type="button"
            data-gizmo="tool"
            aria-pressed={p.gizmo !== null}
            aria-label={mt(maal, "gizmo tool", "gizmoverkty")}
            title={mt(maal, "toggle gizmo tool", "slå gizmoverktyet av eller på")}
            onClick={() => p.onGizmo?.(p.gizmo === null ? "translate" : null)}
            className="hit flex h-9 w-9 items-center justify-center"
            style={{ color: p.gizmo !== null ? "var(--ink)" : "var(--rule)" }}
          >
            {IcoGizmo}
          </button>
        ) : <span />}
        <button type="button" onClick={p.onReset} aria-label={mt(maal, "reset to defaults", "attende til standarden")} title={mt(maal, "reset parameters to defaults (keeps your mesh)", "attende til standarden. nettet ditt står")} className="hit flex h-9 w-9 items-center justify-center">
          {IcoReset}
        </button>
      </div>
    </div>
  )
}

function LayerRow({ no, ord, onFarge, maal }: { no: number; ord: string; onFarge: (n: number) => void; maal: Maal }) {
  return (
    <div role="group" aria-label={`lag ${ord}`} data-lag={ord} className="flex h-9 items-center gap-1">
      <span className="dim w-8 shrink-0 text-[9px] uppercase tracking-[0.12em]">{ord === "bit" ? mt(maal, "part", "bit") : mt(maal, "layer", "lag")}</span>
      <span className="rull-x flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overscroll-contain">
        <button type="button" aria-label={mt(maal, "no layer", "ikkje noko lag")} aria-pressed={no === 0} onClick={() => onFarge(0)} className="hit flex h-7 w-7 shrink-0 items-center justify-center">
          <span aria-hidden="true" className="block h-4 w-4 rounded-full border-2" style={{ borderColor: no === 0 ? "var(--ink)" : "var(--rule)" }} />
        </button>
        {LAG_FARGAR.map((hex, i) => i < FARGE_MIN ? null : (
          <button key={`${hex}-${i}`} type="button" aria-label={`${mt(maal, "layer", "lag")} C${String(i).padStart(2, "0")}`} aria-pressed={no === i} onClick={() => onFarge(i)} className="hit flex h-7 w-7 shrink-0 items-center justify-center">
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

function AssemblyRows({ p, maal }: { p: ArketProps; maal: Maal }) {
  const rows = (p.mont?.delar ?? []).filter((d) => d.steg === p.montSteg - 1)
  const veg: Record<string, string> = {
    ned: mt(maal, "down", "ned"),
    opp: mt(maal, "up", "opp"),
    side: mt(maal, "from side", "frå sida"),
    ligg: mt(maal, "resting", "ligg"),
    boygd: mt(maal, "bent in", "bøygd inn"),
  }
  return (
    <div className="px-3 pb-1 pt-1" aria-label={mt(maal, "step", "steget")}>
      {rows.length ? rows.map((d) => (
        <div key={d.adr} data-steg-del={d.adr} className="flex h-9 items-center gap-2 rounded-lg px-1.5 text-[11px]">
          <span className="tab w-8 shrink-0">{d.adr}</span>
          <span className="min-w-0 flex-1 truncate">{veg[d.veg] ?? d.veg}</span>
          <span className="tab dim shrink-0">{mt(maal, "sheet", "ark")} {d.ark}</span>
        </div>
      )) : <p className="dim h-9 px-1.5 py-2 text-[11px]">{mt(maal, "no parts", "ingen delar")}</p>}
    </div>
  )
}

function GroupsTab({ p, maal }: { p: ArketProps; maal: Maal }) {
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

  if (p.view === "montasje") return <AssemblyRows p={p} maal={maal} />

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
    <div className="px-3 pb-1 pt-1" role="listbox" aria-label={mt(maal, "planes", "plan")}>
      {rader.length ? rader.map((rad) => {
        if (rad.kind === "gruppe") {
          const paa = p.valdGruppe === rad.id
          return (
            <div key={`g-${rad.id}`} role="option" aria-selected={paa} data-gruppe={rad.id} className="flex h-9 items-center gap-1 rounded-lg px-1.5 text-[11px]" style={paa ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)" } : undefined}>
              <button type="button" aria-expanded={utbretta.has(rad.id)} aria-label={mt(maal, `group ${rad.id}`, `gruppe ${rad.id}`)} onClick={() => brett(rad.id)} className="hit flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="tab w-7 shrink-0">G{rad.id}</span>
                <span className="min-w-0 flex-1 truncate">{mt(maal, "group", "gruppe")}</span>
                <span className="tab dim shrink-0">{rad.tal} {mt(maal, "planes", "plan")}</span>
              </button>
              <button type="button" aria-label={mt(maal, `delete group ${rad.id}`, `slett gruppe ${rad.id}`)} onClick={() => p.onSlettGruppe(rad.id)} className="hit dim h-8 w-9 shrink-0">×</button>
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
              <span className="min-w-0 flex-1 truncate">{kvaSlag(pl.n, maal)}</span>
              <span className="tab dim shrink-0">{mineKutt.length ? `${ledd} ${mt(maal, "joints", "ledd")}` : mt(maal, "outside", "utanfor")}</span>
            </button>
            <button type="button" aria-label={mt(maal, `delete plane ${pl.id}`, `slett plan ${pl.id}`)} onClick={() => p.onSlett(pl.id)} className="hit dim h-8 w-9 shrink-0">×</button>
          </div>
        )
      }) : <p className="dim h-9 px-1.5 py-2 text-[11px]">{mt(maal, "no planes", "ingen plan")}</p>}
    </div>
  )
}

function BogRad({ p, pl, maal }: { p: ArketProps; pl: Plan; maal: Maal }) {
  const rRaw = p.rules.find((q) => q.id === "bog")
  const r = rRaw ? omsetRegel(maal, rRaw) : undefined
  const brote = !!r && !r.ok
  return (
    <div className="flex h-5 items-baseline gap-3 text-[10px]">
      <span className="dim w-20 shrink-0 uppercase tracking-[0.12em]">{mt(maal, "bend radius", "bøyeradius")}</span>
      <span className="tab min-w-0 flex-1 truncate text-right" style={{ color: brote ? "var(--warn)" : "var(--ink)" }}>
        {brote && r ? r.value : `${n0(bogRadius(pl.bog, num(p.params, "storleik", 150)))} mm`}
      </span>
    </div>
  )
}

function ValdRader({ p, maal }: { p: ArketProps; maal: Maal }) {
  if (p.view === "montasje") return null
  const leiar = p.plan.find((q) => q.id === p.vald)
  const rader: { ord: string; node: ReactNode }[] = []
  if (p.valdGruppe !== null) rader.push({ ord: "virr", node: <VirrRow p={p} /> })
  if (p.vald !== null) {
    if (leiar?.bog) rader.push({ ord: "bog", node: <BogRad p={p} pl={leiar} maal={maal} /> })
    rader.push({ ord: "profil", node: <ProfileRow p={p} /> })
    rader.push({ ord: "lag", node: <LayerRow no={lagFarge(leiar?.farge) ?? 0} ord="lag" onFarge={p.onFarge} maal={maal} /> })
  } else if (p.bitFarge !== null) {
    rader.push({ ord: "bit", node: <LayerRow no={p.bitFarge} ord="bit" onFarge={p.onBitFarge} maal={maal} /> })
  }
  if (!rader.length) return null
  return (
    <div aria-label={mt(maal, "selection", "det valde")} className="shrink-0 border-t px-3 pb-0.5 pt-0.5" style={HAIR}>
      {rader.map((d) => <div key={d.ord}>{d.node}</div>)}
    </div>
  )
}

const ARK_MALER: readonly [string, number, number][] = [
  ["A4", 297, 210],
  ["400×300", 400, 300],
  ["600×400", 600, 400],
  ["1200×900", 1200, 900],
]

function MaterialTab({ p, maal }: { p: ArketProps; maal: Maal }) {
  const naaTjukn = num(p.params, "tjukn", TJUKNER[0])
  const naaKilar = Math.round(num(p.params, "kilar", 0))
  const nesteTjukn = (dir: 1 | -1 = 1) => {
    const idx = TJUKNER.findIndex((t) => t >= naaTjukn)
    const cur = idx < 0 ? 0 : idx
    const nxt = TJUKNER[(cur + dir + TJUKNER.length) % TJUKNER.length]
    p.onChange({ ...p.params, tjukn: nxt })
  }
  return (
    <div className="px-3 pb-1 pt-1">
      <div className="rull-x flex h-9 items-center gap-1 overflow-x-auto overscroll-contain">
        {(Object.keys(MATERIALS) as Material[]).map((mk) => {
          const lbl = omsetMat(maal, mk, MATERIALS[mk].label)
          return (
            <button key={mk} type="button" aria-pressed={p.params.material === mk} aria-label={`${mt(maal, "material", "materiale")}: ${lbl}`} title={lbl} onClick={() => p.onChange({ ...p.params, material: mk })} className="hit flex h-8 w-8 shrink-0 items-center justify-center">
              <span aria-hidden="true" className="block h-5 w-5 rounded-full border-2" style={{ backgroundColor: MATERIALS[mk].hex, borderColor: p.params.material === mk ? "var(--ink)" : "var(--rule)" }} />
            </button>
          )
        })}
        <span className="ml-auto flex items-center gap-1">
          <span className="dim mr-0.5 shrink-0 text-[9px] uppercase tracking-[0.12em]">{mt(maal, "preset", "standard")}</span>
          <button
            type="button"
            data-tjukn-knapp=""
            aria-label={mt(maal, `thickness ${tjukn(naaTjukn)} mm — tap to cycle`, `tjukn ${tjukn(naaTjukn)} mm — trykk for neste`)}
            title={mt(maal, "tap: next standard thickness · shift+tap: previous", "trykk: neste standardtjukn · skift+trykk: førre")}
            onClick={(e) => nesteTjukn(e.shiftKey ? -1 : 1)}
            className={CHIP + " tab min-w-[60px] shrink-0 px-2.5"}
            style={chipStyle(true)}
          >
            {tjukn(naaTjukn)} mm
          </button>
        </span>
      </div>
      <div className="flex h-9 items-center gap-1">
        <span className="dim mr-1 shrink-0 text-[9px] uppercase tracking-[0.12em]">{mt(maal, "wedges", "kilar")}</span>
        {KILAR.map((namn, i) => (
          <button key={namn} type="button" aria-pressed={naaKilar === i} aria-label={`${mt(maal, "wedges", "kilar")} ${omsetVerdi(maal, namn)}`} onClick={() => p.onChange({ ...p.params, kilar: i })} className={CHIP + " tab min-w-[42px] shrink-0 px-2"} style={chipStyle(naaKilar === i)}>
            {omsetVerdi(maal, namn)}
          </button>
        ))}
      </div>
      <div className="rull-x flex h-8 items-center gap-1 overflow-x-auto overscroll-contain">
        <span className="dim mr-1 shrink-0 text-[9px] uppercase tracking-[0.12em]">{mt(maal, "sheet", "ark")}</span>
        {ARK_MALER.map(([lbl, b, h]) => (
          <button key={lbl} type="button" onClick={() => p.onChange({ ...p.params, arkB: b, arkH: h })} className={CHIP + " tab min-h-[26px] shrink-0 px-2 text-[10px]"} style={chipStyle(p.params.arkB === b && p.params.arkH === h)}>{lbl}</button>
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

function CuttingTab({ p, maal }: { p: ArketProps; maal: Maal }) {
  return (
    <div className="px-3 pb-1 pt-1">
      {KUTT_GRUPPER.map((g) => (
        <section key={g.id} className="border-b pb-1 last:border-b-0" style={HAIR}>
          <div className="dim h-5 px-1.5 pt-1 text-[9px] uppercase leading-none tracking-[0.18em]">{omsetGruppe(maal, g.id, g.label)}</div>
          {g.keys.map((k) => (
            <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(p.params, k, PARAM_RANGES[k].min)} benk={false} onChange={(key, v) => p.onChange({ ...p.params, [key]: v })} onSkrubb={p.onSkrubb} />
          ))}
        </section>
      ))}
    </div>
  )
}

type CheckPage = { metrics: Metric[]; rules: Rule[] }

function ChecksTab({ p, maal }: { p: ArketProps; maal: Maal }) {
  const page = useMemo<CheckPage>(() => {
    if (!p.metrics) return { metrics: [], rules: [] }
    const m = p.metrics.list
    const ids = new Set(m.map((x) => x.id))
    return { metrics: m, rules: p.rules.filter((r) => !r.rad || ids.has(r.rad)) }
  }, [p.metrics, p.rules])

  if (!p.metrics) return <div className="dim px-4 py-4 text-[11px]">{mt(maal, "measuring …", "måler …")}</div>
  const metrics = { ...p.metrics, list: page.metrics }
  return (
    <div className="px-3 pb-1 pt-2">
      <Tavla metrics={metrics} rules={page.rules} busy={p.busy} params={p.params} onChange={p.onChange} onFiksAlle={p.onFiksAlle} />
    </div>
  )
}

const MOBIL_UTTAK = [...UTTAK.filter((g) => g.bolk === "plate"), ...UTTAK.filter((g) => g.bolk !== "plate")]

function ExportTab({ p, maal, startOpen = false }: { p: ArketProps; maal: Maal; startOpen?: boolean }) {
  const [visAlle, setVisAlle] = useState(startOpen)
  const harde = p.rules.filter((r) => r.hard && !r.ok).map((r) => omsetRegel(maal, r))
  return (
    <div className="px-3 pb-1 pt-2">
      <div className="mb-1 flex items-center justify-between border-b pb-1" style={HAIR}>
        <button
          type="button"
          aria-expanded={visAlle}
          onClick={() => setVisAlle((v) => !v)}
          className="hit dim flex h-7 items-center gap-1 text-[9px] uppercase tracking-[0.16em]"
        >
          <span>{mt(maal, "all formats", "alle format")}</span>
          <span aria-hidden="true">{visAlle ? "▴" : "▾"}</span>
        </button>
        <SnarUttak view={p.view} metrics={p.metrics} rules={p.rules} busy={p.busy} onExport={p.onExport} />
      </div>
      {visAlle && MOBIL_UTTAK.map((g) => (
        <section key={g.bolk} data-bolk={g.bolk} className="border-b pb-1 last:border-b-0" style={HAIR}>
          <div className="dim h-5 px-1 text-[9px] uppercase leading-none tracking-[0.18em]">{omsetBolk(maal, g.bolk)}</div>
          <div className="flex min-h-9 flex-wrap items-center gap-1.5">
            {g.filer.map((x) => {
              const stopp = stengd(x.id, p.metrics, maal)
              const lbl = maal === "nn" ? x.label : (UTTAK_EN[x.id]?.label ?? x.label)
              const hnt = maal === "nn" ? x.hint : (UTTAK_EN[x.id]?.hint ?? x.hint)
              return (
                <button
                  key={x.id}
                  type="button"
                  disabled={p.busy || !!stopp}
                  data-varsel={!stopp && harde.length ? "" : undefined}
                  title={stopp || hnt}
                  onClick={() => p.onExport(x.id)}
                  className={CHIP + " uppercase tracking-[0.1em]"}
                  style={{ ...chipStyle(false), opacity: stopp ? 0.3 : undefined, color: !stopp && harde.length ? "var(--warn)" : undefined }}
                >
                  {lbl}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {harde.length > 0 && <p data-uttakvarsel="" className="pt-1 text-[9px]" style={{ color: "var(--warn)" }}>{harde.map((r) => r.label).join(", ")} — {mt(maal, "cannot assemble", "går ikkje i hop")}</p>}
      <div className="flex min-h-14 items-center gap-1.5">
        {([
          ["prosjekt", mt(maal, "project", "prosjekt"), mt(maal, "current project: open, new, rename", "det du arbeider med: opne, nytt, namn")],
          ["kuttliste", mt(maal, "cut list", "kuttliste"), mt(maal, "every part with address, dimensions, and sheet", "kvar del, med adresse, mål og plate")],
          ["oppsett", mt(maal, "settings", "oppsett"), mt(maal, "all settings as text", "alle innstillingane som tekst")],
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
  const maal = useMaal()
  const gjenta = useGjenta(p)
  const open = p.steg !== "line"
  const [fane, setFane] = useState<Fane>("grupper")
  const el = useRef<HTMLElement | null>(null)
  const drag = useRef<{ y: number; id: number } | null>(null)
  const [pull, setPull] = useState(0)
  const uttak = useRef<HTMLElement | null>(null)
  const rull = useRef<HTMLDivElement | null>(null)
  const [tilUttak, setTilUttak] = useState(false)

  const [visAlleUttak, setVisAlleUttak] = useState(false)

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

  const naaTjukn = num(p.params, "tjukn", TJUKNER[0])
  const matKeys = Object.keys(MATERIALS) as Material[]
  const naaMat = (String(p.params.material) in MATERIALS ? String(p.params.material) : "graa") as Material
  const trygge = p.rules.filter((r) => !r.ok && r.fiks && !r.fiks.riv)
  const harValdPlan = p.vald !== null && p.view !== "montasje"

  const sykleTjukn = () => {
    const idx = TJUKNER.findIndex((t) => t >= naaTjukn)
    const cur = idx < 0 ? 0 : idx
    p.onChange({ ...p.params, tjukn: TJUKNER[(cur + 1) % TJUKNER.length] })
  }
  const sykleMat = () => {
    const cur = Math.max(0, matKeys.indexOf(naaMat))
    p.onChange({ ...p.params, material: matKeys[(cur + 1) % matKeys.length] })
  }

  const content =
    fane === "grupper" ? <><FormTab p={p} maal={maal} /><GroupsTab p={p} maal={maal} /></> :
    fane === "materiale" ? <MaterialTab p={p} maal={maal} /> :
    fane === "kutt" ? <CuttingTab p={p} maal={maal} /> :
    <div className="flex min-w-0 flex-col">
      <section aria-label={mt(maal, "checks", "sjekk")} className="min-w-0">
        <ChecksTab p={p} maal={maal} />
      </section>
      <section ref={uttak} aria-label="uttak" className="min-w-0 border-t" style={HAIR}>
        <ExportTab key={visAlleUttak ? "open" : "lukka"} p={p} maal={maal} startOpen={visAlleUttak} />
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
          aria-label={open ? mt(maal, "close controls", "lat att kontrollane") : mt(maal, "open controls", "opne kontrollane")}
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
          <div className="flex h-10 shrink-0 items-center gap-1 px-2">
            <button
              type="button"
              aria-label={mt(maal, "planes, parts, sheets and time", "plan, delar, ark og tid")}
              onClick={() => { setFane("grupper"); p.onSteg("midt") }}
              className={harValdPlan ? "hit tab hidden min-w-0 flex-1 truncate rounded-lg pl-2 text-left text-[10px] tracking-[0.04em] min-[460px]:block" : "hit tab min-w-0 flex-1 truncate rounded-lg pl-2 text-left text-[10px] tracking-[0.04em]"}
            >
              <span className="sr-only"><Summary p={p} maal={maal} /></span>
            </button>

            {harValdPlan ? (
              <div className="rull-x flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-contain min-[460px]:flex-initial" data-dokk-kontekst="plan">
                <button
                  type="button"
                  onClick={() => { setFane("grupper"); p.onSteg("midt") }}
                  title={mt(maal, "inspect selected plane", "sjå det valde planet")}
                  className="hit tab flex h-9 shrink-0 items-center px-1 text-[11px]"
                  style={{ color: "var(--ink)" }}
                >
                  P{p.vald}
                </button>
                {p.onGizmo && (
                  <button
                    type="button"
                    data-gizmo="tool"
                    aria-pressed={p.gizmo !== null}
                    aria-label={mt(maal, "gizmo tool", "gizmoverkty")}
                    title={mt(maal, "toggle gizmo tool", "slå gizmoverktyet av eller på")}
                    onClick={() => p.onGizmo?.(p.gizmo === null ? "translate" : null)}
                    className="hit flex h-9 w-9 shrink-0 items-center justify-center"
                    style={{ color: p.gizmo !== null ? "var(--ink)" : "var(--rule)" }}
                  >
                    {IcoGizmo}
                  </button>
                )}
                {p.onForm && (
                  <button
                    type="button"
                    aria-label={mt(maal, "edit shape outline", "form omriss")}
                    title={mt(maal, "freeze or toggle editable outline (O)", "frys eller slepp omrisset (O)")}
                    onClick={p.onForm}
                    className="hit flex h-9 w-9 shrink-0 items-center justify-center"
                  >
                    {IcoForm}
                  </button>
                )}
                {p.onDupliser && (
                  <button
                    type="button"
                    aria-label={mt(maal, "duplicate plane", "dubler planet")}
                    title={mt(maal, "duplicate selected plane (D)", "dubler det valde planet (D)")}
                    onClick={() => p.onDupliser?.(p.vald!)}
                    className="hit flex h-9 w-9 shrink-0 items-center justify-center"
                  >
                    {IcoDupliser}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={mt(maal, "delete plane", "slett planet")}
                  title={mt(maal, "delete selected plane (⌫)", "slett det valde planet (⌫)")}
                  onClick={() => p.onSlett(p.vald!)}
                  className="hit flex h-9 w-9 shrink-0 items-center justify-center"
                  style={{ ...HAIR, color: "var(--warn)" }}
                >
                  {IcoSlett}
                </button>
              </div>
            ) : p.view === "montasje" && p.mont ? (
              <div className="flex shrink-0 items-center gap-1" data-dokk-kontekst="montasje">
                {p.onMontHopp && (
                  <button
                    type="button"
                    aria-label={mt(maal, "previous assembly step", "førre steg")}
                    disabled={p.montSteg <= 1}
                    onClick={() => p.onMontHopp?.(Math.max(1, p.montSteg - 1))}
                    className="hit flex h-9 w-9 items-center justify-center text-[18px] disabled:opacity-30"
                  >
                    ‹
                  </button>
                )}
                {p.onMontVeksl && (
                  <button
                    type="button"
                    aria-pressed={!!p.montSpel}
                    aria-label={p.montSpel ? mt(maal, "pause assembly", "stans montasje") : mt(maal, "play assembly", "spel montasje")}
                    onClick={p.onMontVeksl}
                    className="hit flex h-9 items-center gap-1 px-1 text-[10px]"
                    style={{ color: p.montSpel ? "var(--ink)" : "var(--rule)" }}
                  >
                    <span>{p.montSpel ? "❚❚" : "▶"}</span>
                    <span>{p.montSteg}/{p.mont.steg}</span>
                  </button>
                )}
                {p.onMontHopp && (
                  <button
                    type="button"
                    aria-label={mt(maal, "next assembly step", "neste steg")}
                    disabled={p.montSteg >= p.mont.steg}
                    onClick={() => p.onMontHopp?.(Math.min(p.mont!.steg, p.montSteg + 1))}
                    className="hit flex h-9 w-9 items-center justify-center text-[18px] disabled:opacity-30"
                  >
                    ›
                  </button>
                )}
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-1" data-dokk-kontekst="standard">
                {trygge.length > 0 && (
                  <button
                    type="button"
                    disabled={p.busy}
                    onClick={p.onFiksAlle}
                    title={mt(maal, "apply all safe fixes", "trykk alle trygge råd")}
                    className="hit flex h-9 w-9 shrink-0 items-center justify-center text-[10px]"
                    style={{ color: "var(--warn)" }}
                  >
                    {mt(maal, "fix", "fiks")} · {trygge.length}
                  </button>
                )}
                {p.onGizmo && p.view !== "kontur" && (
                  <button
                    type="button"
                    data-gizmo="tool"
                    aria-pressed={p.gizmo !== null}
                    aria-label={mt(maal, "gizmo tool", "gizmoverkty")}
                    title={mt(maal, "toggle gizmo tool", "slå gizmoverktyet av eller på")}
                    onClick={() => p.onGizmo?.(p.gizmo === null ? "translate" : null)}
                    className="hit hidden h-9 w-9 shrink-0 items-center justify-center min-[380px]:flex"
                    style={{ color: p.gizmo !== null ? "var(--ink)" : "var(--rule)" }}
                  >
                    {IcoGizmo}
                  </button>
                )}
                <button
                  type="button"
                  data-material-knapp=""
                  onClick={sykleMat}
                  aria-label={`${mt(maal, "material", "materiale")}: ${omsetMat(maal, naaMat, MATERIALS[naaMat].label)}`}
                  title={mt(maal, `material: ${omsetMat(maal, naaMat, MATERIALS[naaMat].label)} (tap to cycle)`, `materiale: ${MATERIALS[naaMat].label} (trykk for neste)`)}
                  className="hit flex h-7 w-7 shrink-0 items-center justify-center"
                >
                  <span aria-hidden="true" className="block h-4 w-4 rounded-full border" style={{ backgroundColor: MATERIALS[naaMat].hex, borderColor: "var(--ink)" }} />
                </button>
                <button
                  type="button"
                  data-tjukn-knapp=""
                  onClick={sykleTjukn}
                  aria-label={mt(maal, `thickness ${tjukn(naaTjukn)} mm`, `tjukn ${tjukn(naaTjukn)} mm`)}
                  title={mt(maal, "tap to cycle sheet thickness", "trykk for neste platetjukn")}
                  className="hit flex h-9 w-9 shrink-0 items-center justify-center"
                >
                  <span className="tab text-[10px]" aria-hidden="true">{tjukn(naaTjukn)}</span>
                </button>
              </div>
            )}

            {gjenta && <button type="button" aria-label={mt(maal, "repeat move", "gjenta flyttinga")} title={gjenta.grunn ?? mt(maal, "new plate with same offset as last copy", "ny plate med same flytting som førre kopi")} disabled={!gjenta.gjer} onClick={gjenta.gjer} className="hit h-9 min-w-14 shrink-0 px-1 text-[10px] uppercase tracking-[0.08em]">{mt(maal, "repeat", "gjenta")}</button>}
            <SnarUttak view={p.view} metrics={p.metrics} rules={p.rules} busy={p.busy} onExport={p.onExport} kompakt />
            <button type="button" aria-label={mt(maal, "export", "eksport")} title={mt(maal, "exports", "uttak")} onClick={() => { setVisAlleUttak(true); setTilUttak(true); setOpenFane("status") }} className={ICON_BTN}>
              {IcoUttak}
            </button>
          </div>
        )}

        {open && (
          <>
            <Tabs fane={fane} onFane={setFane} maal={maal} />
            <div key={fane} ref={rull} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {content}
            </div>
            {fane === "grupper" && <ValdRader p={p} maal={maal} />}
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
