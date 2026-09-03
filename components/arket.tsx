"use client"

import { useEffect, useRef, useState, type JSX, type RefObject } from "react"
import { MATERIALS, TJUKNER, klokke, nn, type ExportKind, type Kutt, type Material, type Metrics, type ParamBag, type Rule, type Vec3, type View } from "@/lib/core"
import { GROUPS, PARAM_RANGES } from "@/lib/params"
import type { Plan } from "@/lib/plan"
import {
  CHIP, EXPORTS, HAIR, ICON_BTN, IcoDown, IcoReset, IcoRute, IcoSliders, IcoUttak,
  SliderRow, Tavla, chipStyle, n0, num, stengd, tjukn,
} from "./deler"
import type { VerktyId } from "./verkty"

/**
 * ARKET. Tre høgder på ein telefon: éi line, midten av jobben, alt. På
 * benken er det ei fast spalte til høgre med det same innhaldet.
 *
 * Lina er det som avgjer om uttaket er verdt å skjere: kor mange plan, kor
 * mange delar, kor mange plater, kor lang tid — og rutenettet og uttaket
 * eitt trykk unna. Sjølve handlinga, skjer, står ikkje her: ho står under høgre
 * tommel, i spalta over arket (sjå studio.tsx). Midten er plana
 * du har låst — berre dei låste; eit skissa plan finst ikkje nokon annan
 * stad enn på lerretet. Alt er resten: materialet, skyvarane, tavla,
 * uttaka, verktya. Fila, lesemåtane, angre og lenkja står i topplina.
 */
export type Steg = "line" | "midt" | "alt"
const STEG: readonly Steg[] = ["line", "midt", "alt"]
export const KOL = 340
/** storleiken står framme; plata står saman med materialet */
const FRAMME = new Set(["storleik", "arkB", "arkH"])

/** kva planet er, lese av normalen: loddrett, vassrett eller skrått, med kursen */
export function kvaSlag(n: Vec3): string {
  const tilt = (Math.asin(Math.min(1, Math.abs(n[2]))) * 180) / Math.PI
  const kurs = (((Math.atan2(n[1], n[0]) * 180) / Math.PI + 360) % 180 + 360) % 180
  if (tilt > 85) return "vassrett"
  if (tilt < 5) return `loddrett ${n0(kurs)}°`
  return `skrå ${n0(tilt)}°/${n0(kurs)}°`
}

export type ArketProps = {
  benk: boolean
  steg: Steg
  onSteg: (s: Steg) => void
  params: ParamBag
  onChange: (p: ParamBag) => void
  /** ein verdi vert dregen: angre ventar til fingeren slepper */
  onSkrubb: (aktiv: boolean) => void
  view: View
  /** kor høg topplina er: kolonna på benken byrjar under henne */
  topp: number
  metrics: Metrics | null
  rules: readonly Rule[]
  liste: readonly Kutt[]
  plan: readonly Plan[]
  vald: number | null
  onVald: (id: number | null) => void
  onSlett: (id: number) => void
  busy: boolean
  feil: string | null
  melding: string | null
  hentar: boolean
  /** verktyet for rutenettet står på: to fingrar set kolonner og rader */
  rute: boolean
  onRute: () => void
  syn: string | null
  onExport: (k: ExportKind) => void
  onReset: () => void
  verkty: VerktyId | null
  onVerkty: (id: VerktyId) => void
  onHogd: (px: number) => void
}

/** dei fire tala i lina, farga av den harde regelen som dømer kvart av dei */
function Lina({ p }: { p: ArketProps }) {
  const { metrics: m, rules, plan, feil, melding, hentar } = p
  if (feil) return <span style={{ color: "var(--warn)" }}>{feil}</span>
  if (melding) return <span className="opacity-70">{melding}</span>
  if (hentar) return <span className="dim">les …</span>
  if (!m) return <span className="dim">snittar …</span>
  const raud = new Set(rules.filter((r) => !r.ok && r.hard && r.rad).map((r) => r.rad))
  const tal: { id: string; text: string; smal?: boolean }[] = [
    { id: "plan", text: `${plan.length} plan` },
    { id: "delar", text: `${n0(m.parts)} delar` },
    { id: "ark", text: `${n0(m.sheets)} ark` },
    // tida er det fyrste som må vike på ein smal telefon: ho står òg i tavla
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

/** éi rad per låst plan: namn, kva det er, streka handa la i det, ledd (og stykke når det er fleire), og vegen ut.
 *  Tom liste er tom: rettleiinga og snittet seier alt kva som skal til. */
/** Lista står der jamvel når ho er tom: ho er staden plana bur, og ei tom
 *  liste teiknar ingenting likevel. */
function Plana({ p }: { p: ArketProps }) {
  return (
    <ul className="py-1" role="listbox" aria-label="plan">
      {p.plan.map((pl) => {
        const mine = p.liste.filter((k) => k.plan === pl.id)
        const ledd = mine.reduce((a, k) => a + k.joints, 0)
        const paa = p.vald === pl.id
        return (
          <li
            key={pl.id}
            role="option"
            aria-selected={paa}
            className="flex items-center gap-2 rounded-lg px-1.5 text-[11px]"
            style={paa ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)" } : undefined}
          >
            <button type="button" className="hit flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={() => p.onVald(paa ? null : pl.id)}>
              <span className="tab w-6 shrink-0" style={{ color: "var(--ink)" }}>{pl.id}</span>
              <span className="min-w-0 flex-1 truncate">{kvaSlag(pl.n)}</span>
              <span className="tab dim shrink-0" style={{ color: mine.length && !ledd ? "var(--warn)" : undefined }} title={`${mine.length} stykke, ${ledd} ledd`}>
                {mine.length ? `· ${mine.length > 1 ? `${mine.length} stk · ` : ""}${ledd} ledd` : "· utanfor"}
              </span>
              {pl.strek.length > 0 && (
                <span className="tab dim shrink-0 rounded-full border px-1.5 text-[9px] leading-[14px]" style={HAIR} title="handteikna strek i profilen">{pl.strek.length} strek</span>
              )}
            </button>
            <button type="button" aria-label={`slett plan ${pl.id}`} title="ta planet bort" className="hit dim h-9 w-11 shrink-0" onClick={() => p.onSlett(pl.id)}>
              ×
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** uttaka: éi brikke per fil, og kva dei to fargane tyder */
function Uttaka({ p, onGjort }: { p: ArketProps; onGjort?: () => void }) {
  const { metrics } = p
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-2">
      {EXPORTS.map((x) => {
        const stopp = stengd(x.id, metrics)
        return (
          <button key={x.id} type="button" title={stopp || x.hint} disabled={p.busy || stopp !== ""} onClick={() => { p.onExport(x.id); onGjort?.() }} className={CHIP + " uppercase tracking-[0.1em]"} style={{ ...chipStyle(false), opacity: stopp ? 0.3 : undefined, textDecoration: stopp ? "line-through" : undefined }}>
            {x.label}
          </button>
        )
      })}
      {/* svart er C00 i LightBurn og køyrer fyrst: difor graverer det */}
      <span className="dim ml-auto flex items-center gap-3 text-[10px] uppercase tracking-[0.14em]" title="svart graverer, blått kutt. fargen er rekkjefylgja">
        {[["#000000", "graver"], ["#0000ff", "kutt"]].map(([farge, ord]) => (
          // ringen kring prikken: den svarte er ein svart prikk på svart papir når systemet står mørkt
          <span key={ord} className="flex items-center gap-1.5"><span aria-hidden="true" className="block h-[7px] w-[7px] rounded-full border" style={{ background: farge, borderColor: "var(--rule)" }} />{ord}</span>
        ))}
      </span>
    </div>
  )
}

/** alt: material og plate, verdiane, tavla med reglane i, uttaka, verktya. Reglane står HER og i dei raude tala i lina, ikkje i midten. */
function Alt({ p, uttak }: { p: ArketProps; uttak: RefObject<HTMLDivElement | null> }) {
  const { params, onChange, metrics } = p
  const setParam = (k: string, v: number) => onChange({ ...params, [k]: v })
  const naaTjukn = num(params, "tjukn", TJUKNER[0])
  return (
    <>
      {/* materialet og tjukna på éi rad der det er plass, og på to der det ikkje er */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-2">
        {(Object.keys(MATERIALS) as Material[]).map((mk) => (
          <button
            key={mk}
            type="button"
            aria-pressed={params.material === mk}
            aria-label={`materiale: ${MATERIALS[mk].label}`}
            title={MATERIALS[mk].label}
            onClick={() => onChange({ ...params, material: mk })}
            className="hit flex h-9 w-9 shrink-0 items-center justify-center"
          >
            <span aria-hidden="true" className="block h-6 w-6 rounded-full border-2" style={{ backgroundColor: MATERIALS[mk].hex, borderColor: params.material === mk ? "var(--ink)" : "var(--rule)" }} />
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          {TJUKNER.map((t) => (
            <button key={t} type="button" aria-pressed={naaTjukn === t} title={`${tjukn(t)} mm plate`} onClick={() => onChange({ ...params, tjukn: t })} className={CHIP + " tab min-w-[44px] px-2"} style={chipStyle(naaTjukn === t)}>
              {tjukn(t)}
            </button>
          ))}
        </span>
      </div>
      {["arkB", "arkH"].map((k) => (
        <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(params, k, PARAM_RANGES[k].min)} benk={p.benk} onChange={setParam} onSkrubb={p.onSkrubb} />
      ))}
      {GROUPS.map((g) => {
        const keys = g.keys.filter((k) => !FRAMME.has(k))
        if (!keys.length) return null
        return (
          <div key={g.id} className="pt-3">
            <h3 className="dim pb-0.5 text-[10px] uppercase leading-none tracking-[0.24em]">{g.label}</h3>
            {keys.map((k) => (
              <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(params, k, PARAM_RANGES[k].min)} benk={p.benk} onChange={setParam} onSkrubb={p.onSkrubb} />
            ))}
          </div>
        )
      })}
      <div className="mt-3 border-t pt-3" style={HAIR}>
        <Tavla metrics={metrics} rules={p.rules} busy={p.busy} params={params} onChange={onChange} />
      </div>
      {p.syn && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(p.syn)}`} alt="alle profilane, slik dei ligg på plata" className="my-2 max-h-40 w-full object-contain" style={{ opacity: p.busy ? 0.5 : 1 }} />
      )}
      <div ref={uttak} className="border-t" style={HAIR}>
        <Uttaka p={p} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 py-1">
        {([["kuttliste", "kuttliste", "kvar del, med adresse, mål og plate"], ["ark", "plater", "kvar plate slik ho ligg — dra og fest delane"], ["oppsett", "oppsett", "alle innstillingane som tekst"]] as const).map(([id, ord, hint]) => (
          <button key={id} type="button" title={hint} aria-pressed={p.verkty === id} onClick={() => p.onVerkty(id)} className={CHIP + " uppercase tracking-[0.1em]"} style={chipStyle(p.verkty === id)}>
            {ord}
          </button>
        ))}
      </div>
    </>
  )
}

export function Arket(p: ArketProps): JSX.Element {
  const { benk, steg, onSteg, onHogd } = p
  const open = benk || steg !== "line"
  /** uttaka eitt trykk unna: ein liten boks over lina. I «alt» står dei alt i arket, og knappen rullar dit. */
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
  // Kor mykje av ruta arket tek, MÅLT: kameraet stiller objektet inn i det
  // som er att. Grovkorna, so ei line til i arket ikkje rykkjer kameraet.
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

  // iOS-ark: dra i hovudlina, opp for meir og ned for mindre
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
      {/* tala fyrst: dei er det lina er til. Skjer og skissebrytaren står i tommelspalta. */}
      <button type="button" onClick={() => !benk && onSteg(open ? "line" : "midt")} className="hit tab min-w-0 flex-1 truncate rounded-lg pl-2 text-left text-[10px] tracking-[0.04em]" aria-label="plan, delar, ark og tid">
        <Lina p={p} />
      </button>
      {/* RUTENETTET: verktyet som let to fingrar setje kolonner og rader.
          Knappen står ved talet han endrar. */}
      <button
        type="button"
        aria-pressed={p.rute}
        aria-label="rutenett"
        title={p.rute ? "rutenettet (R): to fingrar — vassrett er kolonner, loddrett er rader. trykk for å gå ut" : "rutenettet (R): to fingrar set kolonner og rader"}
        onClick={p.onRute}
        className={ICON_BTN}
        data-ruteverkty=""
      >
        {IcoRute}
      </button>
      {!benk && (
        <button type="button" aria-label="eksport" aria-expanded={visUttak} title="uttaka: stl, dxf, svg, ark, png, passprøve, alt, lagre" onClick={eksport} className={ICON_BTN} aria-pressed={visUttak} data-uttak="">
          {IcoUttak}
        </button>
      )}
    </div>
  )

  const midt = (
    <>
      <SliderRow k="storleik" r={PARAM_RANGES.storleik} value={num(p.params, "storleik", 150)} benk={benk} onChange={(k, v) => p.onChange({ ...p.params, [k]: v })} onSkrubb={p.onSkrubb} bi={p.metrics ? `${n0(p.metrics.envX)}×${n0(p.metrics.envY)}×${n0(p.metrics.envZ)}` : undefined} />
      <Plana p={p} />
    </>
  )

  const fot = (
    <div className="flex items-center gap-1.5 py-1">
      <span className="dim tab text-[10px]">{p.metrics ? `${nn(p.metrics.cutLen / 1000, 1)} m kutt` : ""}</span>
      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={p.onReset} aria-label="attende til standarden" title="attende til standarden. nettet ditt står" className={CHIP} style={chipStyle(false)}>{IcoReset}</button>
        {!benk && (
          <button type="button" aria-expanded={steg === "alt"} aria-label={steg === "alt" ? "færre kontrollar" : "alle kontrollane"} onClick={() => onSteg(steg === "alt" ? "midt" : "alt")} className={CHIP} style={chipStyle(steg === "alt")}>
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <section
        ref={el}
        aria-label="kontrollar"
        aria-busy={p.busy}
        className="ark pointer-events-auto relative flex min-w-0 max-w-md flex-col overflow-x-hidden rounded-3xl border sm:max-w-xl"
        style={{
          ...HAIR,
          // aldri breiare enn skjermen: ei rad med for lang tekst skal ikkje skuve arket ut av kanten
          width: "calc(100vw - 24px)",
          background: "var(--paper)",
          color: "var(--ink)",
          // taket ligg på ARKET, og trygdesona tel med: summen er taket
          maxHeight: steg === "alt" ? "calc(72dvh - env(safe-area-inset-bottom) - 12px)" : "calc(48dvh - env(safe-area-inset-bottom) - 12px)",
          transform: pull ? `translateY(${pull}px)` : undefined,
        }}
      >
        {visUttak && steg !== "alt" && (
          <div data-uttak="" role="group" aria-label="uttak" className="absolute inset-x-2 bottom-[calc(100%+8px)] rounded-2xl border px-3" style={{ ...HAIR, background: "var(--paper)" }}>
            <Uttaka p={p} onGjort={() => setVisUttak(false)} />
          </div>
        )}
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
