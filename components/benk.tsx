"use client"

import { useEffect, useRef, useState, type JSX } from "react"
import {
  MATERIALS,
  TJUKNER,
  nn,
  type ExportKind,
  type Material,
  type Metrics,
  type ParamBag,
  type Rule,
  type View,
} from "@/lib/core"
import { FORMAT } from "@/lib/io"
import { VAFFEL } from "@/lib/vaffel/engine"
import type { Kandidat } from "@/lib/vaffel/tune"
import { VERKTY, type VerktyId } from "./verkty"
import {
  CHIP,
  EXPORTS,
  Fiksen,
  HAIR,
  IcoAngre,
  IcoFinn,
  IcoImport,
  IcoReset,
  IcoShare,
  R_ARK,
  R_DELAR,
  R_GODS,
  SliderRow,
  TASTAR,
  TAST_BENK,
  VIEWS,
  chipStyle,
  feltTal,
  lesTal,
  n0,
  n1,
  num,
  snap,
  stengd,
  tableRows,
  tjukn,
} from "./deler"

/**
 * BENKEN.
 *
 * Arket med tre høgder er eit svar på ein telefon. På ein skjerm er svaret
 * at det forsvinn: det er plass til alt samstundes, og då er kvart steg
 * mellom lukka og ope eit steg som ikkje treng finnast.
 *
 * Att står to faste veggar og eit objekt imellom. Venstre vegg er det du
 * PUTTAR INN, i den rekkjefylgda du gjer det: fila, storleiken, kva han
 * skal målast mot, knappen som finn rutenettet, plata, og til slutt kvar
 * einaste skyvar. Høgre vegg er det som KJEM UT: tala, profilane, reglane,
 * filene. Straumen går frå venstre mot høgre, og objektet står midt i han.
 *
 * Ingenting opnar seg og ingenting rullar bort. Femten skyvarar, tolv
 * måltal, tolv reglar og fem uttak står framme samstundes, og den einaste
 * tilstanden som er att er kva du ser på.
 *
 * Kameraet veit om veggane: sjå lib/ramme.ts. Objektet står midt i
 * rektangelet mellom dei, ikkje midt i ruta, og scena vert like fullt
 * teikna heilt ut under veggane, so dei ligg over papir og ikkje over ein
 * hard kant.
 */
export const VEGG = { venstre: 272, hogre: 312, topp: 44 }

const BLOKK = "border-t pt-2.5 mt-2.5"
/** Same knappen som på telefonen, men med hjørne som ein knapp på eit
 *  instrument har: nesten ingen. */
const CHIP_B = CHIP.replace("rounded-full", "rounded-[2px]")
/** plata står saman med materialet og tjukna, ikkje nedst i veggen */
const PLATE = ["arkB", "arkH"]
const OVERSKRIFT = "dim pb-1 text-[10px] uppercase leading-none tracking-[0.24em]"

/**
 * SVARET FRÅ FINN, SOM EI LISTE.
 *
 * «1 av 12» med to piler seier kor du står og ingenting om kva som finst.
 * Her står heile rangeringa: ribbetal, delar, ark og ledd for kvar
 * kandidat, sortert som motoren rangerte dei. Du ser med det same at nummer
 * fire har halvparten so mange delar, og du hoppar rett dit.
 *
 * PEIKAREN BYGGJER. Å stå over ei rad set den kandidaten på skjermen etter
 * ein nittidels sekund; fer du ut av lista att, kjem det du hadde attende,
 * og fyrst eit klikk bind. Tolv uttak på tre sekund i staden for tolv
 * blinde trykk. På eit nett med meir enn fire hundre tusen trekantar er
 * kvart bygg for dyrt til det, og då krevst det eit klikk.
 */
function Svarlista({
  liste,
  paa,
  gjeld,
  syn,
  onVel,
  onSyn,
}: {
  liste: readonly Kandidat[]
  /** kva rad som er sett, eller null om ribbetalet er handskrudd sidan */
  paa: number | null
  /** står lista framleis til det spørsmålet ho svarte på? */
  gjeld: boolean
  /** kan peikaren byggje, eller er nettet for tungt? */
  syn: boolean
  onVel: (i: number) => void
  onSyn: (i: number | null) => void
}) {
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  if (!liste.length) return null
  const over = (i: number | null) => {
    if (!syn) return
    window.clearTimeout(timer.current)
    if (i === null) onSyn(null)
    else timer.current = window.setTimeout(() => onSyn(i), 90)
  }
  return (
    <div
      className="rull min-h-0 flex-1"
      style={{ opacity: gjeld ? 1 : 0.35, transition: "opacity 160ms ease" }}
      onPointerLeave={() => over(null)}
    >
      <div className="dim flex text-[9px] uppercase tracking-[0.14em]">
        <span className="w-5" />
        <span className="flex-1">ribber</span>
        <span className="w-9 text-right">delar</span>
        <span className="w-7 text-right">ark</span>
        <span className="w-9 text-right">ledd</span>
      </div>
      {liste.map((k, i) => (
        <button
          key={`${k.ribbX}x${k.ribbY}x${k.ledd}`}
          type="button"
          onClick={() => onVel(i)}
          onPointerEnter={() => over(i)}
          className="hit mono flex w-full items-baseline rounded-[2px] py-[2px] text-[10px]"
          style={
            i === paa
              ? { background: "var(--ink)", color: "var(--paper)" }
              : { color: "var(--ink)" }
          }
        >
          <span className="dim w-5 pl-1 text-left">{i + 1}</span>
          <span className="flex-1 text-left">
            {k.ribbX}×{k.ribbY}
          </span>
          <span className="w-9 text-right">{k.parts}</span>
          <span className="w-7 text-right">{k.sheets}</span>
          <span className="w-9 pr-1 text-right">{k.joints}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * STORLEIKEN, SOM EIT TAL DU KAN TA I.
 *
 * Han er steg to for kvar einaste brukar, og på benken er han det fyrste
 * som står. Talet er stort av di det er det største valet: du DREG i det
 * for å leite, og skriv i det når du veit. Skyvaren under er grovsøket.
 */
function Storleik({
  params,
  metrics,
  onChange,
}: {
  params: ParamBag
  metrics: Metrics | null
  onChange: (p: ParamBag) => void
}) {
  const r = VAFFEL.ranges.storleik
  const verdi = num(params, "storleik", r.min)
  const [utkast, setUtkast] = useState<string | null>(null)
  const dra = useRef<{ x: number; fra: number; rort: boolean } | null>(null)

  const sett = (v: number) => onChange({ ...params, storleik: snap(v, r) })

  return (
    <div>
      <div className="flex items-baseline gap-1">
        <input
          className="mono talfelt w-[110px] rounded-[2px] bg-transparent text-[32px] leading-none tracking-[-0.01em]"
          // Peikaren seier kva talet er: noko du dreg i.
          style={{ color: "var(--ink)", cursor: "ew-resize" }}
          // Det som STÅR, ikkje ei avrunding av det. Storleiken kan bera
          // ein halv millimeter — ei lenkje, ei prosjektfil eller
          // talfeltet i panelet kan setje 247,5 — og `Math.round` gjorde
          // henne om til 248 så snart nokon såg på feltet.
          value={utkast ?? feltTal(verdi, r.step).replace(".", ",")}
          inputMode="decimal"
          aria-label="storleik, tal"
          onPointerDown={(e) => {
            if (e.pointerType === "touch") return
            dra.current = { x: e.clientX, fra: verdi, rort: false }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = dra.current
            if (!d) return
            const dx = e.clientX - d.x
            if (!d.rort && Math.abs(dx) < 3) return
            d.rort = true
            // UTKASTET SKAL VEKK NÅR DRAGET BYRJAR.
            //
            // `onFocus` fyrer på det same peikartrykket som draget og
            // legg talet slik det stod FØR draget i utkastet. Feltet syner
            // utkastet når det finst, so talet fraus medan objektet vaks —
            // og `onBlur` skreiv det gamle talet attende. Heile draget
            // vart rulla attende i det du klikka ein annan stad.
            setUtkast(null)
            // Fire pikslar per steg: fint nok til å treffe, grovt nok til
            // at heile bandet ligg i ei armlengd.
            sett(d.fra + Math.round(dx / 4) * r.step * (e.shiftKey ? 0.2 : 1))
          }}
          onPointerUp={(e) => {
            const d = dra.current
            dra.current = null
            // Eit drag er ikkje eit klikk: har talet rørt seg, skal feltet
            // ikkje òg opne seg for skriving.
            if (d?.rort) e.preventDefault()
            else e.currentTarget.select()
          }}
          onFocus={() => setUtkast(feltTal(verdi, r.step).replace(".", ","))}
          onChange={(e) => setUtkast(e.target.value)}
          onBlur={() => {
            const v = utkast === null ? NaN : lesTal(utkast)
            setUtkast(null)
            // Tull er ikkje ei endring, og å ta feltet og sleppe det er
            // det heller ikkje.
            if (Number.isFinite(v) && v !== verdi) sett(v)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            else if (e.key === "Escape") {
              setUtkast(null)
              e.currentTarget.blur()
            }
          }}
        />
        <span className="dim text-[11px]">mm</span>
        <span className="dim mono ml-auto text-[10px]">
          {metrics
            ? `${n0(metrics.envX)}×${n0(metrics.envY)}×${n0(metrics.envZ)}`
            : ""}
        </span>
      </div>
      <input
        type="range"
        className="pslider mt-2 w-full"
        min={r.min}
        max={r.max}
        step={r.step}
        value={verdi}
        aria-label="storleik"
        onChange={(e) => sett(Number(e.target.value))}
      />
    </div>
  )
}

export function Benk(props: {
  params: ParamBag
  kjelde: string
  metrics: Metrics | null
  rules: Rule[]
  view: View
  syn: string | null
  hiDetail: boolean
  busy: boolean
  feil: string | null
  hentar: boolean
  /** eit ord attende på noko som elles ikkje synest — sjå `share` i studio */
  melding: string | null
  tunar: { gjort: number; av: number } | null
  liste: readonly Kandidat[]
  /** kva rad i lista som står, eller null */
  paa: number | null
  /** svarar lista framleis på det spørsmålet som står? */
  gjeld: boolean
  kanAngre: boolean
  onChange: (p: ParamBag) => void
  onView: (v: View) => void
  onReset: () => void
  onAngre: () => void
  onToggleDetail: () => void
  onExport: (kind: ExportKind) => void
  onFinn: () => void
  onVelSvar: (i: number) => void
  onSynSvar: (i: number | null) => void
  onShare: () => void
  onFile: (f: File) => void
  /** kva verkty som står ope i skuffa over lerretet, om noko */
  verkty: VerktyId | null
  onVerkty: (id: VerktyId) => void
}): JSX.Element {
  const {
    params,
    kjelde,
    metrics,
    rules,
    view,
    syn,
    hiDetail,
    busy,
    feil,
    hentar,
    melding,
    tunar,
    liste,
    paa,
    gjeld,
    kanAngre,
    onChange,
    onView,
    onReset,
    onAngre,
    onToggleDetail,
    onExport,
    onFinn,
    onVelSvar,
    onSynSvar,
    onShare,
    onFile,
    verkty,
    onVerkty,
  } = props
  const pick = useRef<HTMLInputElement | null>(null)

  /**
   * MELLOMROM: BERRE OBJEKTET.
   *
   * Ein tast du HELD er ingen tilstand. Du er alltid der du var når du
   * slepper, og difor kan han ta heile flata utan å kunne gløymast på.
   */
  const [naken, setNaken] = useState(false)
  useEffect(() => {
    const inne = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && t !== document.body) return
      e.preventDefault()
      setNaken(true)
    }
    const ute = (e: KeyboardEvent) => {
      if (e.code === "Space") setNaken(false)
    }
    const slepp = () => setNaken(false)
    window.addEventListener("keydown", inne)
    window.addEventListener("keyup", ute)
    // Byter du vindauge medan tasten er nede, kjem det aldri eit keyup.
    window.addEventListener("blur", slepp)
    return () => {
      window.removeEventListener("keydown", inne)
      window.removeEventListener("keyup", ute)
      window.removeEventListener("blur", slepp)
    }
  }, [])

  const broken = { hard: new Set<string>(), soft: new Set<string>() }
  for (const r of rules) if (!r.ok) (r.hard ? broken.hard : broken.soft).add(r.id)
  const isHard = (ids: readonly string[]) => ids.some((id) => broken.hard.has(id))
  const isSoft = (ids: readonly string[]) => ids.some((id) => broken.soft.has(id))
  const rows = tableRows(metrics)

  const setParam = (k: string, raw: string) =>
    onChange({ ...params, [k]: snap(lesTal(raw), VAFFEL.ranges[k]) })

  const vegg = (side: "venstre" | "hogre") => ({
    background: "var(--paper)",
    borderColor: "var(--rule)",
    width: side === "venstre" ? VEGG.venstre : VEGG.hogre,
    opacity: naken ? 0 : 1,
    pointerEvents: naken ? ("none" as const) : ("auto" as const),
    transition: "opacity 160ms ease",
  })

  const tal: { key: string; text: string; ids: readonly string[] }[] = metrics
    ? [
        { key: "delar", text: `${n0(metrics.parts)} delar`, ids: R_DELAR },
        { key: "kutt", text: `${n1(metrics.cutLen / 1000)} m kutt`, ids: R_GODS },
        { key: "ark", text: `${n0(metrics.sheets)} ark`, ids: R_ARK },
      ]
    : []

  return (
    <>
      <input
        ref={pick}
        type="file"
        accept={FORMAT.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ""
        }}
      />

      {/* TOPPLINA. Namnet, fila, og lenkja. Streken under er framdrifta. */}
      <header
        className="benk pointer-events-auto fixed inset-x-0 top-0 z-20 flex items-center gap-4 border-b px-4"
        style={{
          ...HAIR,
          height: VEGG.topp,
          background: "var(--paper)",
          opacity: naken ? 0 : 1,
          transition: "opacity 160ms ease",
        }}
      >
        <span className="mono text-[11px] tracking-[0.06em]" style={{ color: "var(--ink)" }}>
          slicer.iverfinne
        </span>
        <span aria-hidden="true" className="h-4 w-px" style={{ background: "var(--rule)" }} />
        <button
          type="button"
          onClick={() => pick.current?.click()}
          title={`hent eit nett: ${FORMAT.join(" ")}`}
          aria-label="hent eit nett"
          className="hit flex h-7 min-w-0 max-w-[280px] items-center gap-1.5 rounded-[2px] border pl-2.5 pr-3 text-[11px] uppercase tracking-[0.14em] transition active:scale-95"
          style={{ ...HAIR, color: "var(--ink)" }}
        >
          <span className="shrink-0 opacity-70">{IcoImport}</span>
          <span className="min-w-0 flex-1 truncate text-left">{kjelde}</span>
        </button>
        {(feil || melding || hentar) && (
          <span
            className="mono truncate text-[11px]"
            style={{ color: feil ? "var(--warn)" : undefined, opacity: feil ? 1 : melding ? 0.7 : 0.4 }}
          >
            {feil ?? melding ?? "les fila …"}
          </span>
        )}
        {/* VERKTYA. Dei står i topplina av di dei ikkje høyrer til nokon av
            veggane: dei legg seg over lerretet mellom dei. */}
        <span className="ml-auto flex items-center gap-1.5">
          {VERKTY.map((v) => (
            <button
              key={v.id}
              type="button"
              title={v.hint}
              onClick={() => onVerkty(v.id)}
              className={CHIP_B + " min-h-[26px] px-2.5 uppercase tracking-[0.1em]"}
              style={chipStyle(verkty === v.id)}
            >
              {v.ord}
            </button>
          ))}
        </span>
        <a
          href="https://iverfinne.no"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] tracking-wide opacity-60 hover:opacity-100"
          style={{ color: "var(--ink)" }}
        >
          iverfinne.no
        </a>
        {/* Framdrifta ER skiljestreken, so ho tek null høgd av seg sjølv. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-[-1px] h-px overflow-hidden"
        >
          <span
            className="block h-px"
            style={{
              background: "var(--ink)",
              width: tunar && tunar.av ? `${(tunar.gjort / tunar.av) * 100}%` : busy ? "100%" : "0%",
              opacity: busy || tunar ? 0.5 : 0,
              transition: "width 150ms linear, opacity 200ms ease",
            }}
          />
        </span>
      </header>

      {/* LESEMÅTANE ligg oppå lerretet: dei er eit blikk og ikkje ein
          parameter, og dei er det einaste som ikkje høyrer heime i ein
          vegg. */}
      <div
        className="pointer-events-auto fixed z-10 flex items-center gap-1.5"
        style={{
          left: VEGG.venstre + 16,
          top: VEGG.topp + 14,
          opacity: naken ? 0 : 1,
          transition: "opacity 160ms ease",
        }}
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            title={`${v.hint} (${v.tast})`}
            aria-pressed={view === v.id}
            onClick={() => onView(v.id)}
            className={CHIP_B}
            style={chipStyle(view === v.id)}
          >
            {v.label}
          </button>
        ))}
        <button
          type="button"
          role="switch"
          aria-checked={hiDetail}
          onClick={onToggleDetail}
          title="finare rute i profilane; tyngre å rekne"
          className={CHIP_B + " ml-2"}
          style={chipStyle(hiDetail)}
        >
          fint nett
        </button>
      </div>

      {/* VENSTRE VEGG: det du puttar inn. */}
      <aside
        aria-label="innstillingar"
        aria-busy={busy}
        className="benk fixed bottom-0 left-0 z-20 flex flex-col border-r px-4 pb-3 pt-3"
        style={{ ...vegg("venstre"), top: VEGG.topp }}
      >
        <Storleik params={params} metrics={metrics} onChange={onChange} />

        <div className={BLOKK} style={HAIR}>
          <button
            type="button"
            onClick={onFinn}
            disabled={busy}
            aria-label="finn innstillingar"
            title="(F) reknar gjennom eit titals rutenett og set det beste"
            className="hit relative flex h-9 w-full items-center justify-center gap-2 rounded-[2px] text-[11px] uppercase tracking-[0.14em] transition active:scale-[0.99] disabled:opacity-100"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
          >
            {/* Framdrifta fyller knappen frå venstre. Ringen som står kring
                den runde knappen på telefonen ville strekt seg til ein
                ellipse her: knappen er tolv gonger så brei som han er høg. */}
            {tunar && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 rounded-[2px]"
                style={{
                  width: tunar.av ? `${(tunar.gjort / tunar.av) * 100}%` : "4%",
                  background: "var(--paper)",
                  opacity: 0.16,
                  transition: "width 150ms linear",
                }}
              />
            )}
            <span className="relative opacity-90">{IcoFinn}</span>
            <span className="relative">finn</span>
          </button>
        </div>

        <Svarlista
          liste={liste}
          paa={paa}
          gjeld={gjeld}
          syn={(metrics?.srcTris ?? 0) < 400000}
          onVel={onVelSvar}
          onSyn={onSynSvar}
        />

        {/* PLATA. Materialet er tettleiken massen vert rekna av; tjukna er
            plata du har liggjande. */}
        <div className={BLOKK} style={HAIR}>
          <div className="flex flex-wrap items-center gap-1.5">
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
            <span aria-hidden="true" className="mx-0.5 h-4 w-px" style={{ background: "var(--rule)" }} />
            {TJUKNER.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={params.tjukn === t}
                title={`${tjukn(t)} mm plate`}
                onClick={() => onChange({ ...params, tjukn: t })}
                className={CHIP_B + " px-2"}
                style={chipStyle(params.tjukn === t)}
              >
                {tjukn(t)}
              </button>
            ))}
          </div>
          {/* Platemålet står HER og ikkje nedst i veggen. «Finn» rangerer
              mot plata, og to av reglane dømer etter henne: ho høyrer til
              steg to og ikkje blant maskininnstillingane. */}
          {PLATE.map((k) => (
            <SliderRow
              key={k}
              k={k}
              r={VAFFEL.ranges[k]}
              value={num(params, k, VAFFEL.ranges[k].min)}
              onChange={setParam}
            />
          ))}
        </div>

        {/* SKYVEVEGGEN. Alle saman, alltid. */}
        <div className={BLOKK + " rull min-h-0 flex-1"} style={HAIR}>
          {VAFFEL.groups.map((g) => {
            // Storleiken og plata står alt framme. Ei gruppe som er tom
            // etter det, er ei overskrift over ingenting.
            const keys = g.keys.filter((k) => k !== "storleik" && !PLATE.includes(k))
            if (!keys.length) return null
            return (
              <div key={g.id} className="pb-1.5">
                <h3 className={OVERSKRIFT}>{g.label}</h3>
                {keys.map((k) => (
                  <SliderRow
                    key={k}
                    k={k}
                    r={VAFFEL.ranges[k]}
                    value={num(params, k, VAFFEL.ranges[k].min)}
                    onChange={setParam}
                  />
                ))}
              </div>
            )
          })}
          {/* Tastane står nedst i veggen, etter alt anna. Den som har rulla
              heilt ned er den som kjem att. */}
          <p className="dim pt-3 text-[9px] leading-relaxed tracking-[0.1em]">
            {TASTAR + TAST_BENK}
          </p>
        </div>
      </aside>

      {/* HØGRE VEGG: det som kjem ut. */}
      <aside
        aria-label="måltal"
        className="benk fixed bottom-0 right-0 z-20 flex flex-col border-l px-4 pb-3 pt-3"
        style={{ ...vegg("hogre"), top: VEGG.topp }}
      >
        <div
          aria-label="delar, kuttlengd og ark"
          className="mono flex flex-col gap-0.5 text-[13px]"
          style={{ opacity: busy ? 0.45 : 1 }}
        >
          {tal.length === 0 ? (
            <span className="dim">snittar …</span>
          ) : (
            tal.map((h) => (
              <span
                key={h.key}
                style={{
                  color: isHard(h.ids) ? "var(--warn)" : undefined,
                  textDecoration: isSoft(h.ids) ? "underline dotted" : undefined,
                  textUnderlineOffset: 3,
                }}
              >
                {h.text}
              </span>
            ))
          )}
        </div>

        {/* TAVLA. Tolv tal, alltid, i to spalter. */}
        <dl
          className={BLOKK + " grid grid-cols-2 gap-x-4"}
          style={{ ...HAIR, opacity: busy ? 0.5 : 1, transition: "opacity 200ms ease" }}
        >
          {rows.map((row) => {
            const hard = row.rules !== undefined && isHard(row.rules)
            const soft = row.rules !== undefined && isSoft(row.rules)
            return (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-2 py-[1px] text-[10px] leading-4"
              >
                <dt className="dim shrink-0 truncate">{row.label}</dt>
                <dd
                  className="mono truncate text-right"
                  style={{
                    color: hard ? "var(--warn)" : undefined,
                    textDecoration: soft ? "underline dotted" : undefined,
                    textUnderlineOffset: 3,
                  }}
                >
                  {row.value}
                  {row.unit && <span className="dim pl-0.5">{row.unit}</span>}
                </dd>
              </div>
            )
          })}
        </dl>

        {/* REGLANE. Alle tolv, ikkje berre dei som ryk: ein mjuk regel
            finst nettopp for at du skal sjå marginen FØR han ryk. Den som
            ryk og har eit råd, ber rådet med seg i same lina. */}
        <div className={BLOKK + " rull min-h-0 shrink"} style={HAIR}>
          {rules.map((r) => (
            <div
              key={r.id}
              title={r.why}
              className="flex items-center justify-between gap-2 py-[1px] text-[10px] leading-4"
              style={{
                color: !r.ok && r.hard ? "var(--warn)" : undefined,
                // Ein regel som held står attende, men han skal framleis
                // kunne lesast: heile grunnen til at alle tolv står her er
                // at du skal sjå marginen FØR han ryk. Sjå `.dim`.
                opacity: r.ok ? 0.6 : 1,
              }}
            >
              <span className="truncate tracking-[0.04em]">{r.label}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span
                  className="mono"
                  style={{
                    textDecoration: !r.ok && !r.hard ? "underline dotted" : undefined,
                    textUnderlineOffset: 3,
                  }}
                >
                  {r.value}
                </span>
                <Fiksen rule={r} params={params} onChange={onChange} />
              </span>
            </div>
          ))}
        </div>

        {/* PROFILANE, slik dei ligg på plata. Dei og uttaka held saman
            nedst: det er der du sluttar, og lufta over dei er lufta reglane
            ikkje trong. */}
        {syn && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(syn)}`}
            alt="alle profilane, slik dei ligg på plata"
            className={BLOKK + " mt-auto max-h-28 w-full object-contain"}
            style={{ ...HAIR, opacity: busy ? 0.5 : 1, transition: "opacity 200ms ease" }}
          />
        )}

        {/* UTTAKA. Nedst, av di det er der du sluttar. */}
        <div className={BLOKK} style={HAIR}>
          <div className="flex flex-wrap items-center gap-1.5">
            {EXPORTS.map((x) => {
              const stopp = stengd(x.id, metrics)
              return (
                <button
                  key={x.id}
                  type="button"
                  title={stopp || x.hint}
                  disabled={busy || stopp !== ""}
                  onClick={() => onExport(x.id)}
                  className={CHIP_B + " uppercase tracking-[0.1em]"}
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
          </div>
          <div className="flex items-center gap-3 pt-2 text-[10px] uppercase tracking-[0.14em]">
            <span
              className="flex items-center gap-3"
              style={{ color: "var(--ink)", opacity: 0.6 }}
              title="svart er C00 i LightBurn og køyrer fyrst, difor graverer det"
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
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={onAngre}
                disabled={!kanAngre}
                aria-label="angre siste endring"
                title="angre siste endring (Z)"
                className={CHIP_B}
                style={chipStyle(false)}
              >
                {IcoAngre}
              </button>
              <button
                type="button"
                onClick={onReset}
                aria-label="tilbake til standarden"
                title="tilbake til standarden. nettet ditt står"
                className={CHIP_B}
                style={chipStyle(false)}
              >
                {IcoReset}
              </button>
              <button
                type="button"
                onClick={onShare}
                aria-label="del"
                title="lenkja ber innstillingane, ikkje nettet"
                className={CHIP_B}
                style={chipStyle(false)}
              >
                {IcoShare}
              </button>
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
