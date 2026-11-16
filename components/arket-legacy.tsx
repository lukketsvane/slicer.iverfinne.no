"use client"

import { Fragment, useEffect, useRef, useState, type JSX, type RefObject } from "react"
import { FARGE_MIN, LAG_FARGAR, MATERIALS, TJUKNER, klokke, lagFarge, nn, type ExportKind, type Kutt, type Material, type Metrics, type ParamBag, type Rule, type Vec3, type View } from "@/lib/core"
import { useMaal, mt, omsetBolk, omsetGruppe, omsetMat, omsetRegel, UTTAK_EN, type Maal } from "@/lib/i18n"
import { GROUPS, PARAM_RANGES } from "@/lib/params"
import { MJUK_TAK, type Plan } from "@/lib/plan"
import type { Montasje, Veg } from "@/lib/montasje"
import {
  CHIP, HAIR, ICON_BTN, IcoDown, IcoReset, IcoSliders, IcoUttak, UTTAK,
  SliderRow, Tavla, chipStyle, n0, num, stengd, tjukn,
} from "./deler"
import { SnarUttak } from "./uttak"
import type { VerktyId } from "./verkty"

export type Steg = "line" | "midt" | "alt"
const STEG: readonly Steg[] = ["line", "midt", "alt"]
export const KOL = 340
const TUMME_FRI = 68
const FRAMME = new Set(["storleik", "arkB", "arkH", "rotX", "rotY", "rotZ"])

export type GizmoModus = "translate" | "rotate" | "scale"

export function kvaSlag(n: Vec3, maal: Maal = "nn"): string {
  const tilt = (Math.asin(Math.min(1, Math.abs(n[2]))) * 180) / Math.PI
  const kurs = (((Math.atan2(n[1], n[0]) * 180) / Math.PI + 360) % 180 + 360) % 180
  if (tilt > 85) return mt(maal, "horizontal", "vassrett")
  if (tilt < 5) return `${mt(maal, "vertical", "loddrett")} ${n0(kurs)}°`
  return `${mt(maal, "tilted", "skrå")} ${n0(tilt)}°/${n0(kurs)}°`
}

export type ArketProps = {
  benk: boolean
  steg: Steg
  onSteg: (s: Steg) => void
  params: ParamBag
  onChange: (p: ParamBag) => void
  onSkrubb: (aktiv: boolean) => void
  view: View
  topp: number
  metrics: Metrics | null
  rules: readonly Rule[]
  boks: { min: Vec3; max: Vec3 } | null
  liste: readonly Kutt[]
  plan: readonly Plan[]
  onFiksAlle: () => void
  mont: Montasje | null
  montSteg: number
  vald: number | null
  onVald: (id: number | null) => void
  valdGruppe: number | null
  onVelGruppe: (g: number) => void
  onSlettGruppe: (g: number) => void
  mjuk: number
  onMjuk: (v: number) => void
  virr: number
  onVirr: (mm: number) => void
  onFarge: (farge: number) => void
  bitFarge: number | null
  onBitFarge: (farge: number) => void
  onSlett: (id: number) => void
  onMeny: (id: number, x: number, y: number) => void
  onSkiftVel: (id: number) => void
  busy: boolean
  feil: string | null
  melding: string | null
  hentar: boolean

  onExport: (k: ExportKind) => void
  onReset: () => void
  verkty: VerktyId | null
  onVerkty: (id: VerktyId) => void
  onHogd: (px: number) => void
  gizmo?: GizmoModus | null
  onGizmo?: (m: GizmoModus | null) => void
  onDupliser?: (id: number) => void
  onForm?: () => void
  montSpel?: boolean
  onMontVeksl?: () => void
  onMontHopp?: (steg: number) => void
}

function Lina({ p }: { p: ArketProps }) {
  const maal = useMaal()
  const { metrics: m, rules, plan, feil, melding, hentar } = p
  if (feil) return <span style={{ color: "var(--warn)" }}>{feil}</span>
  if (melding) return <span className="opacity-70">{melding}</span>
  if (hentar) return <span className="dim">{mt(maal, "reading …", "les …")}</span>
  if (!m) return <span className="dim">{mt(maal, "slicing …", "snittar …")}</span>
  const raud = new Set(rules.filter((r) => !r.ok && r.hard && r.rad).map((r) => r.rad))
  const tal: { id: string; text: string; smal?: boolean }[] = [
    { id: "plan", text: `${plan.length} ${mt(maal, "planes", "plan")}` },
    { id: "delar", text: `${n0(m.parts)} ${mt(maal, "parts", "delar")}` },
    { id: "ark", text: `${n0(m.sheets)} ${mt(maal, "sheets", "ark")}` },
    { id: "tid", text: klokke(m.cutTime), smal: true },
  ]
  return (
    <>
      {tal.map((t, i) => (
        <span key={t.id} className={t.smal ? "hidden min-[430px]:inline" : undefined}>
          {i > 0 && <span className="px-0.5 opacity-30">·</span>}
          <span style={raud.has(t.id) ? { color: "var(--warn)" } : { opacity: 0.62 }}>{t.text}</span>
        </span>
      ))}
    </>
  )
}

function Stega({ p }: { p: ArketProps }) {
  const maal = useMaal()
  const VEGORD: Record<Veg, string> = {
    ned: mt(maal, "down", "ned"),
    opp: mt(maal, "up", "opp"),
    side: mt(maal, "from side", "frå sida"),
    ligg: mt(maal, "resting", "ligg"),
    boygd: mt(maal, "bent in", "bøygd inn"),
  }
  const mine = (p.mont?.delar ?? []).filter((d) => d.steg === p.montSteg - 1)
  if (!mine.length) {
    return <p className="dim px-1.5 py-2 text-[11px]">{mt(maal, "no parts", "ingen delar")}</p>
  }
  return (
    <ul className="py-1" aria-label={mt(maal, "step", "steget")}>
      {mine.map((d) => (
        <li key={d.adr} data-steg-del={d.adr} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[11px]">
          <span className="tab w-8 shrink-0" style={{ color: "var(--ink)" }}>{d.adr}</span>
          <span className="min-w-0 flex-1 truncate">{VEGORD[d.veg]}</span>
          <span className="tab dim shrink-0">{mt(maal, "sheet", "ark")} {d.ark}</span>
        </li>
      ))}
    </ul>
  )
}

function Plana({ p }: { p: ArketProps }) {
  const maal = useMaal()
  const [utbretta, setUtbretta] = useState<ReadonlySet<number>>(() => new Set())
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
  const sett = new Set<number>()
  return (
    <ul className="py-1" role="listbox" aria-label={mt(maal, "planes", "plan")}>
      {p.plan.map((pl) => {
        const mine = p.liste.filter((k) => k.plan === pl.id)
        const ledd = mine.reduce((a, k) => a + k.joints, 0)
        const paa = p.vald === pl.id
        const iGruppa = !!pl.gruppe && p.valdGruppe === pl.gruppe
        const hovud = pl.gruppe && !sett.has(pl.gruppe) ? pl.gruppe : 0
        if (hovud) sett.add(hovud)
        const tal = hovud ? p.plan.filter((q) => q.gruppe === hovud).length : 0
        const att = !!pl.gruppe && !utbretta.has(pl.gruppe) && !paa
        return (
          <Fragment key={pl.id}>
          {hovud > 0 && (
            <li
              role="option"
              aria-selected={p.valdGruppe === hovud}
              data-gruppe={hovud}
              className="flex items-center gap-2 rounded-lg px-1.5 text-[11px]"
              style={p.valdGruppe === hovud ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)" } : undefined}
            >
              <button type="button" aria-label={mt(maal, `group ${hovud}`, `gruppe ${hovud}`)} aria-expanded={utbretta.has(hovud)} title={mt(maal, "expand and select group", "brett gruppa ut og tak henne: handtaka, pilene, slett og dubler tek alle plana i henne. trykk att slepper henne og legg henne saman att")} className="hit flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={() => brett(hovud)}>
                <span className="tab w-6 shrink-0" style={{ color: "var(--ink)" }}>G{hovud}</span>
                <span className="min-w-0 flex-1 truncate">{mt(maal, "group", "gruppe")}</span>
                <span className="tab dim shrink-0">· {tal} {mt(maal, "planes", "plan")}</span>
              </button>
              <button type="button" aria-label={mt(maal, `delete group ${hovud}`, `slett gruppe ${hovud}`)} title={mt(maal, "delete group", "ta heile gruppa bort")} className="hit dim h-9 w-11 shrink-0" onClick={() => p.onSlettGruppe(hovud)}>
                ×
              </button>
            </li>
          )}
          {!att && (
            <li
              role="option"
              aria-selected={paa}
              data-plan={pl.id}
              onContextMenu={p.benk ? (e) => { e.preventDefault(); p.onMeny(pl.id, e.clientX, e.clientY) } : undefined}
              className={"flex items-center gap-2 rounded-lg text-[11px] " + (pl.gruppe ? "ml-3 pl-1.5 pr-1.5" : "px-1.5")}
              style={paa ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)" } : iGruppa ? { background: "color-mix(in srgb, var(--ink) 4%, transparent)" } : undefined}
            >
              <button type="button" className="hit flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={(e) => (e.shiftKey ? p.onSkiftVel(pl.id) : p.onVald(paa ? null : pl.id))}>
                <span className="tab w-6 shrink-0" style={{ color: "var(--ink)" }}>{pl.id}</span>
                {lagFarge(pl.farge) !== null && <span aria-hidden="true" className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LAG_FARGAR[pl.farge as number] }} />}
                <span className="min-w-0 flex-1 truncate">{kvaSlag(pl.n, maal)}</span>
                {p.benk && p.boks && (
                  <span className="tab dim shrink-0" title={mt(maal, "millimeters from body center along normal. arrow keys nudge 1 mm", "millimeter frå midten av kroppen, langs normalen. pilene flyttar planet éin om gongen")}>
                    {fraaMidten(pl, p.boks)}
                  </span>
                )}
                <span className="tab dim shrink-0" style={{ color: mine.length && !ledd ? "var(--warn)" : undefined }} title={`${mine.length} ${mt(maal, "pieces", "stykke")}, ${ledd} ${mt(maal, "joints", "ledd")}`}>
                  {mine.length ? `· ${mine.length > 1 ? `${mine.length} ${mt(maal, "pcs", "stk")} · ` : ""}${ledd} ${mt(maal, "joints", "ledd")}` : `· ${mt(maal, "outside", "utanfor")}`}
                </span>
                {pl.strek.length > 0 && (
                  <span className="tab dim shrink-0 rounded-full border px-1.5 text-[9px] leading-[14px]" style={HAIR} title={mt(maal, "cutout in profile", "handteikna strek i profilen")}>{pl.strek.length} {mt(maal, "cutout", "strek")}</span>
                )}
              </button>
              <button type="button" aria-label={mt(maal, `delete plane ${pl.id}`, `slett plan ${pl.id}`)} title={mt(maal, "delete plane", "ta planet bort")} className="hit dim h-9 w-11 shrink-0" onClick={() => p.onSlett(pl.id)}>
                ×
              </button>
            </li>
          )}
          </Fragment>
        )
      })}
      {p.valdGruppe !== null && <Virret p={p} />}
      {p.vald !== null && <Profilen p={p} />}
      {p.vald !== null && <Laga p={p} />}
    </ul>
  )
}

function Lagrad({ no, ord, tittel, onFarge }: {
  no: number
  ord: string
  tittel: string
  onFarge: (farge: number) => void
}) {
  const maal = useMaal()
  return (
    <li role="group" aria-label={mt(maal, "layer", "lag")} data-lag={ord} className="flex items-center gap-1 px-1.5 pb-1 pt-0.5">
      <span className="dim w-6 shrink-0 text-[9px] uppercase tracking-[0.12em]">{ord === "bit" ? mt(maal, "part", "bit") : mt(maal, "layer", "lag")}</span>
      <span className="rull-x flex min-w-0 flex-1 items-center gap-x-0.5 overflow-x-auto overscroll-contain">
        <button type="button" aria-pressed={no === 0} aria-label={mt(maal, "no layer", "ikkje noko lag")} title={mt(maal, "no layer: cut in default blue", "ikkje noko lag: kuttet er blått som dei andre")} onClick={() => onFarge(0)} className="hit flex h-7 w-7 shrink-0 items-center justify-center">
          <span aria-hidden="true" className="block h-4 w-4 rounded-full border-2" style={{ borderColor: no === 0 ? "var(--ink)" : "var(--rule)" }} />
        </button>
        {LAG_FARGAR.map((hex, i) =>
          i < FARGE_MIN ? null : (
            <button key={hex} type="button" aria-pressed={no === i} aria-label={`${mt(maal, "layer", "lag")} C${String(i).padStart(2, "0")}`} title={`LightBurn C${String(i).padStart(2, "0")} · ${hex}${tittel}`} onClick={() => onFarge(i)} className="hit flex h-7 w-7 shrink-0 items-center justify-center">
              <span aria-hidden="true" className="block h-4 w-4 rounded-full border-2" style={{ background: hex, borderColor: no === i ? "var(--ink)" : "transparent" }} />
            </button>
          ),
        )}
      </span>
    </li>
  )
}

function Virret({ p }: { p: ArketProps }) {
  const S = num(p.params, "storleik", 150)
  return (
    <li role="group" aria-label="virr" data-virr="" className="px-1.5 pt-1">
      <SliderRow
        k="virr"
        r={{ label: "virr", min: 0, max: Math.round(S * 0.12), step: 0.5, unit: "mm" }}
        value={Math.min(Math.round(S * 0.12), p.virr)}
        benk={p.benk}
        onChange={(_, v) => p.onVirr(v)}
        onSkrubb={p.onSkrubb}
      />
    </li>
  )
}

function Profilen({ p }: { p: ArketProps }) {
  const S = num(p.params, "storleik", 150)
  const tak = +(MJUK_TAK * S).toFixed(1)
  return (
    <li role="group" aria-label="profil" data-profil="" className="px-1.5 pb-0.5 pt-1">
      <SliderRow
        k="mjuk"
        r={{ label: "mjuk", min: 0, max: tak, step: 0.5, unit: "mm" }}
        value={Math.min(tak, +(p.mjuk * S).toFixed(1))}
        benk={p.benk}
        onChange={(_, v) => p.onMjuk(S > 0 ? v / S : 0)}
        onSkrubb={p.onSkrubb}
      />
    </li>
  )
}

function Laga({ p }: { p: ArketProps }) {
  const leiar = p.plan.find((q) => q.id === p.vald)
  return (
    <Lagrad
      no={lagFarge(leiar?.farge) ?? 0}
      ord="lag"
      tittel={p.valdGruppe !== null ? " · heile gruppa" : ""}
      onFarge={p.onFarge}
    />
  )
}

function fraaMidten(pl: Plan, b: { min: Vec3; max: Vec3 }): string {
  let d = 0
  for (let a = 0; a < 3; a++) d += (pl.o[a] - 0.5) * (b.max[a] - b.min[a]) * pl.n[a]
  return `${d < -0.05 ? "−" : "+"}${nn(Math.abs(d), 1)} mm`
}

function Uttaka({ p, onGjort, startOpen = false }: { p: ArketProps; onGjort?: () => void; startOpen?: boolean }) {
  const maal = useMaal()
  const { metrics } = p
  const [visAlle, setVisAlle] = useState(startOpen)
  const harde = p.rules.filter((r) => r.hard && !r.ok).map((r) => omsetRegel(maal, r))
  const varsel = harde.length
    ? `${harde.length === 1 ? mt(maal, "1 hard break", "eit hardt brot") : `${harde.length} ${mt(maal, "hard breaks", "harde brot")}`}: ${harde.map((r) => r.label).join(", ")}`
    : ""
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2 pb-1 border-b" style={HAIR}>
        <button
          type="button"
          aria-expanded={visAlle}
          onClick={() => setVisAlle((v) => !v)}
          className="hit dim flex h-7 items-center gap-1 text-[9px] uppercase tracking-[0.14em]"
        >
          <span>{mt(maal, "export", "uttak")}</span>
          <span aria-hidden="true">{visAlle ? "▴" : "▾"}</span>
        </button>
        <SnarUttak view={p.view} metrics={metrics} rules={p.rules} busy={p.busy} onExport={(id) => { p.onExport(id); onGjort?.() }} />
      </div>
      {visAlle && UTTAK.map((g) => (
        <div key={g.bolk} role="group" aria-label={omsetBolk(maal, g.bolk)} data-bolk={g.bolk}>
          <div className="flex items-start gap-1.5 py-0.5">
            <span aria-hidden="true" className="dim mt-[13px] w-9 shrink-0 text-[9px] uppercase leading-none tracking-[0.12em]">{omsetBolk(maal, g.bolk)}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              {g.filer.map((x) => {
                const stopp = stengd(x.id, metrics, maal)
                const lbl = maal === "nn" ? x.label : (UTTAK_EN[x.id]?.label ?? x.label)
                const hnt = maal === "nn" ? x.hint : (UTTAK_EN[x.id]?.hint ?? x.hint)
                return (
                  <button key={x.id} type="button" title={stopp || (varsel ? `${varsel}. ${hnt}` : hnt)} data-varsel={!stopp && varsel ? "" : undefined} disabled={p.busy || stopp !== ""} onClick={() => { p.onExport(x.id); onGjort?.() }} className={CHIP + " uppercase tracking-[0.1em]"} style={{ ...chipStyle(false), opacity: stopp ? 0.3 : undefined, textDecoration: stopp ? "line-through" : undefined, color: !stopp && varsel ? "var(--warn)" : undefined }}>
                    {lbl}
                  </button>
                )
              })}
            </span>
          </div>
          {varsel && g.bolk === UTTAK[0].bolk && (
            <p className="pb-0.5 pl-[42px] text-[10px]" style={{ color: "var(--warn)" }} data-uttakvarsel="">
              {harde.map((r) => r.label).join(", ")} — {mt(maal, "cannot assemble", "går ikkje i hop")}
            </p>
          )}
          {g.bolk === "plate" && (
            <span className="dim flex items-center gap-3 pb-0.5 pl-[42px] text-[10px] uppercase tracking-[0.14em]" title={mt(maal, "black engraves, blue cuts. color is order", "svart graverer, blått kutt. fargen er rekkjefylgja")}>
              {[["#000000", mt(maal, "engrave", "graver")], ["#0000ff", mt(maal, "cut", "kutt")]].map(([farge, ord]) => (
                <span key={ord} className="flex items-center gap-1.5"><span aria-hidden="true" className="block h-[7px] w-[7px] rounded-full border" style={{ background: farge, borderColor: "var(--rule)" }} />{ord}</span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

const ARK_MALER: readonly [string, number, number][] = [
  ["A4", 297, 210],
  ["400×300", 400, 300],
  ["600×400", 600, 400],
  ["1200×900", 1200, 900],
]

function Alt({ p, uttak }: { p: ArketProps; uttak: RefObject<HTMLDivElement | null> }) {
  const maal = useMaal()
  const { params, onChange, metrics } = p
  const setParam = (k: string, v: number) => onChange({ ...params, [k]: v })
  const naaTjukn = num(params, "tjukn", TJUKNER[0])
  const nesteTjukn = (dir: 1 | -1 = 1) => {
    const idx = TJUKNER.findIndex((t) => t >= naaTjukn)
    const cur = idx < 0 ? 0 : idx
    const nxt = TJUKNER[(cur + dir + TJUKNER.length) % TJUKNER.length]
    onChange({ ...params, tjukn: nxt })
  }
  const [bretta, setBretta] = useState<ReadonlySet<string>>(() => new Set())
  const brett = (id: string) =>
    setBretta((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-2">
        {(Object.keys(MATERIALS) as Material[]).map((mk) => {
          const lbl = omsetMat(maal, mk, MATERIALS[mk].label)
          return (
            <button
              key={mk}
              type="button"
              aria-pressed={params.material === mk}
              aria-label={`${mt(maal, "material", "materiale")}: ${lbl}`}
              title={lbl}
              onClick={() => onChange({ ...params, material: mk })}
              className="hit flex h-8 w-8 shrink-0 items-center justify-center"
            >
              <span aria-hidden="true" className="block h-5 w-5 rounded-full border-2" style={{ backgroundColor: MATERIALS[mk].hex, borderColor: params.material === mk ? "var(--ink)" : "var(--rule)" }} />
            </button>
          )
        })}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            data-tjukn-knapp=""
            aria-label={mt(maal, `thickness ${tjukn(naaTjukn)} mm — tap to cycle`, `tjukn ${tjukn(naaTjukn)} mm — trykk for neste`)}
            title={mt(maal, "tap: next standard thickness · shift+tap: previous", "trykk: neste standardtjukn · skift+trykk: førre")}
            onClick={(e) => nesteTjukn(e.shiftKey ? -1 : 1)}
            className={CHIP + " tab min-w-[64px] px-2.5"}
            style={chipStyle(true)}
          >
            {tjukn(naaTjukn)} mm
          </button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 pb-1">
        {ARK_MALER.map(([lbl, b, h]) => (
          <button key={lbl} type="button" onClick={() => onChange({ ...params, arkB: b, arkH: h })} className={CHIP + " tab min-h-[26px] px-2 text-[10px]"} style={chipStyle(params.arkB === b && params.arkH === h)}>{lbl}</button>
        ))}
      </div>
      {["arkB", "arkH"].map((k) => (
        <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(params, k, PARAM_RANGES[k].min)} benk={p.benk} onChange={setParam} onSkrubb={p.onSkrubb} />
      ))}
      {GROUPS.map((g) => {
        const keys = g.keys.filter((k) => !FRAMME.has(k))
        if (!keys.length) return null
        const att = bretta.has(g.id)
        const gLabel = omsetGruppe(maal, g.id, g.label)
        return (
          <div key={g.id} className="pt-3">
            <h3>
              <button type="button" aria-expanded={!att} title={att ? `${mt(maal, "show", "syn")} ${gLabel}` : `${mt(maal, "collapse", "brett")} ${gLabel}`} onClick={() => brett(g.id)} className="hit dim block w-full pb-0.5 text-left text-[10px] uppercase leading-none tracking-[0.24em]" data-bolk={g.id}>
                {gLabel}
              </button>
            </h3>
            {!att && keys.map((k) => (
              <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(params, k, PARAM_RANGES[k].min)} benk={p.benk} onChange={setParam} onSkrubb={p.onSkrubb} />
            ))}
          </div>
        )
      })}
      <div className="mt-3 border-t pt-3" style={HAIR}>
        <Tavla metrics={metrics} rules={p.rules} busy={p.busy} params={params} onChange={onChange} onFiksAlle={p.onFiksAlle} />
      </div>
      <div ref={uttak} className="border-t" style={HAIR}>
        <Uttaka p={p} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 py-1">
        {([
          ["kuttliste", mt(maal, "cut list", "kuttliste"), mt(maal, "every part with address, dimensions, and sheet", "kvar del, med adresse, mål og plate")],
          ["oppsett", mt(maal, "settings", "oppsett"), mt(maal, "all settings as text", "alle innstillingane som tekst")],
        ] as const).map(([id, ord, hint]) => (
          <button key={id} type="button" title={hint} aria-pressed={p.verkty === id} onClick={() => p.onVerkty(id)} className={CHIP + " uppercase tracking-[0.1em]"} style={chipStyle(p.verkty === id)}>
            {ord}
          </button>
        ))}
      </div>
    </>
  )
}

export function Arket(p: ArketProps): JSX.Element {
  const maal = useMaal()
  const { benk, steg, onSteg, onHogd } = p
  const open = benk || steg !== "line"
  const [visUttak, setVisUttak] = useState(false)
  const uttak = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!visUttak) return
    const ute = (e: PointerEvent) => { if (!(e.target as Element).closest("[data-uttak]")) setVisUttak(false) }
    const tast = (e: KeyboardEvent) => { if (e.key === "Escape") setVisUttak(false) }
    window.addEventListener("pointerdown", ute, true)
    window.addEventListener("keydown", tast, true)
    return () => { window.removeEventListener("pointerdown", ute, true); window.removeEventListener("keydown", tast, true) }
  }, [visUttak])
  const eksport = () => {
    if (steg === "alt") uttak.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    else setVisUttak((v) => !v)
  }
  const el = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const s = el.current
    if (!s || benk) return
    const meld = () => onHogd(Math.round((s.getBoundingClientRect().height + 24) / 40) * 40)
    const ro = new ResizeObserver(meld)
    ro.observe(s)
    meld()
    return () => ro.disconnect()
  }, [onHogd, benk])

  const drag = useRef<{ y0: number; id: number } | null>(null)
  const [pull, setPull] = useState(0)
  const svelg = useRef(false)
  const stegOm = (dir: 1 | -1) => onSteg(STEG[Math.min(2, Math.max(0, STEG.indexOf(steg) + dir))])
  const dragOpp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    setPull(0)
    const dy = e.clientY - d.y0
    svelg.current = Math.abs(dy) > 12
    if (dy < -34) stegOm(1)
    else if (dy > 34) stegOm(-1)
  }

  const linja = (
    <div className="flex items-center gap-1 px-2 py-2">
      <button type="button" onClick={() => !benk && onSteg(open ? "line" : "midt")} className="hit tab min-w-0 flex-1 truncate rounded-lg pl-2 text-left text-[10px] tracking-[0.04em]" aria-label={mt(maal, "planes, parts, sheets and time", "plan, delar, ark og tid")}>
        <Lina p={p} />
      </button>

      {!benk && (
        <button type="button" aria-label={mt(maal, "export", "eksport")} aria-expanded={visUttak} title={mt(maal, "exports", "uttaka: rom — stl, glb, flat, 3mf, usdz. plate — dxf, svg, ark, png, passprøve. alt og lagre")} onClick={eksport} className={ICON_BTN} aria-pressed={visUttak} data-uttak="">
          {IcoUttak}
        </button>
      )}
    </div>
  )

  const midt = (
    <>
      <SliderRow k="storleik" r={PARAM_RANGES.storleik} value={num(p.params, "storleik", 150)} benk={benk} onChange={(k, v) => p.onChange({ ...p.params, [k]: v })} onSkrubb={p.onSkrubb} bi={p.metrics ? `${n0(p.metrics.envX)}×${n0(p.metrics.envY)}×${n0(p.metrics.envZ)}` : undefined} />
      {p.onGizmo && (
        <div className="flex items-center justify-between gap-1 py-1">
          <span className="dim text-[9px] uppercase tracking-[0.12em]">{mt(maal, "3d gizmo", "3d-handtak")}</span>
          <div className="flex items-center gap-1">
            {([
              ["translate", mt(maal, "move (G)", "flytt (G)")],
              ["rotate", mt(maal, "rotate (R)", "vri (R)")],
              ["scale", mt(maal, "scale (S)", "skaler (S)")],
            ] as const).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                data-gizmo={m}
                aria-pressed={p.gizmo === m}
                onClick={() => p.onGizmo?.(p.gizmo === m ? null : m)}
                className={CHIP + " min-h-[28px] px-2 text-[10px]"}
                style={chipStyle(p.gizmo === m)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}
      {p.bitFarge !== null && (
        <ul className="pt-1">
          <Lagrad no={p.bitFarge} ord="bit" tittel=" · plan med same laget vert skore inne i denne biten" onFarge={p.onBitFarge} />
        </ul>
      )}
      {p.view === "montasje" ? <Stega p={p} /> : <Plana p={p} />}
    </>
  )

  const fot = (
    <div className="flex items-center gap-1.5 py-1">
      <span className="dim tab text-[10px]">{p.metrics ? `${nn(p.metrics.cutLen / 1000, 1)} m ${mt(maal, "cut", "kutt")}` : ""}</span>
      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={p.onReset} aria-label={mt(maal, "reset to defaults", "attende til standarden")} title={mt(maal, "reset parameters to defaults (keeps your mesh)", "attende til standarden. nettet ditt står")} className={CHIP} style={chipStyle(false)}>{IcoReset}</button>
        {!benk && (
          <button type="button" aria-expanded={steg === "alt"} aria-label={steg === "alt" ? mt(maal, "fewer controls", "færre kontrollar") : mt(maal, "all controls", "alle kontrollane")} onClick={() => onSteg(steg === "alt" ? "midt" : "alt")} className={CHIP} style={chipStyle(steg === "alt")}>
            {steg === "alt" ? IcoDown : IcoSliders}
          </button>
        )}
      </span>
    </div>
  )

  if (benk) {
    return (
      <aside aria-label="kontrollar" aria-busy={p.busy} className="benk fixed bottom-0 right-0 z-20 flex flex-col border-l" style={{ ...HAIR, top: p.topp, width: KOL, background: "var(--paper)", color: "var(--ink)" }}>
        {linja}
        <div className="rull min-h-0 flex-1 px-3 pb-2">
          {midt}
          <Alt p={p} uttak={uttak} />
        </div>
        <div className="border-t px-3" style={HAIR}>{fot}</div>
      </aside>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex flex-col items-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      {visUttak && steg !== "alt" && (
        <div
          data-uttak=""
          role="group"
          aria-label="uttak"
          className="uttak ark pointer-events-auto mb-2 min-w-0 max-w-md rounded-2xl border px-3 sm:max-w-xl"
          style={{ ...HAIR, width: "calc(100vw - 24px)", paddingRight: TUMME_FRI, background: "var(--paper)", color: "var(--ink)" }}
        >
          <Uttaka p={p} onGjort={() => setVisUttak(false)} startOpen />
        </div>
      )}
      <section
        ref={el}
        aria-label="kontrollar"
        aria-busy={p.busy}
        className="ark pointer-events-auto relative flex min-w-0 max-w-md flex-col overflow-x-hidden rounded-3xl border sm:max-w-xl"
        style={{
          ...HAIR,
          width: "calc(100vw - 24px)",
          background: "var(--paper)",
          color: "var(--ink)",
          maxHeight: steg === "alt" ? "calc(72dvh - env(safe-area-inset-bottom) - 12px)" : "calc(48dvh - env(safe-area-inset-bottom) - 12px)",
          transform: pull ? `translateY(${pull}px)` : undefined,
        }}
      >
        <div
          className="shrink-0"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => { if (e.pointerType !== "mouse") drag.current = { y0: e.clientY, id: e.pointerId } }}
          onPointerMove={(e) => { const d = drag.current; if (d && e.pointerId === d.id) setPull(Math.max(-26, Math.min(26, (e.clientY - d.y0) * 0.3))) }}
          onPointerUp={dragOpp}
          onPointerCancel={dragOpp}
          onClickCapture={(e) => { if (svelg.current) { svelg.current = false; e.preventDefault(); e.stopPropagation() } }}
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 22%, transparent)" }} />
          {linja}
        </div>
        {open && (
          <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-1">
            {midt}
            {steg === "alt" && <Alt p={p} uttak={uttak} />}
          </div>
        )}
        {open && <div className="shrink-0 px-3 pb-1">{fot}</div>}
      </section>
    </div>
  )
}
