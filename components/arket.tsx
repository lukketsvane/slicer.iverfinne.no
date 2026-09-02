"use client"

import { useEffect, useRef, useState, type JSX, type RefObject } from "react"
import { MATERIALS, TJUKNER, klokke, lesTal, nn, snap, type ExportKind, type Kutt, type Material, type Metrics, type ParamBag, type Rule, type Vec3, type View } from "@/lib/core"
import { GROUPS, PARAM_RANGES } from "@/lib/params"
import type { Plan } from "@/lib/plan"
import type { Kandidat } from "@/lib/forslag"
import {
  CHIP, EXPORTS, HAIR, ICON_BTN, IcoDown, IcoFinn, IcoLaas, IcoReset, IcoSkisse, IcoSliders, IcoStopp, IcoUttak,
  Reglar, Ring, SliderRow, TASTAR, Tavla, chipStyle, n0, num, stengd, tjukn, useLangtrykk,
} from "./deler"
import type { VerktyId } from "./verkty"
import type { Modus } from "./scene"

/**
 * ARKET. Tre høgder på ein telefon: éi line, midten av jobben, alt. På
 * benken er det ei fast spalte til høgre med det same innhaldet.
 *
 * Lina er det som avgjer om uttaket er verdt å skjere: kor mange plan, kor
 * mange delar, kor mange plater, kor lang tid — og det du gjer med det:
 * lås, skissemodusen, forslag, og uttaket eitt trykk unna. Midten er plana
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
  if (tilt < 5) return `loddrett · ${n0(kurs)}°`
  return `skrå ${n0(tilt)}° · ${n0(kurs)}°`
}

export type ArketProps = {
  benk: boolean
  steg: Steg
  onSteg: (s: Steg) => void
  params: ParamBag
  onChange: (p: ParamBag) => void
  view: View
  /** gestmodusen: «form» eller «skisse», og brytaren */
  modus: Modus
  onModus: () => void
  /** råkar skissa kroppen? Låsen pulserer fyrste gongen ho gjer det. */
  raakar: boolean
  /** kor høg topplina er: kolonna på benken byrjar under henne */
  topp: number
  metrics: Metrics | null
  rules: readonly Rule[]
  liste: readonly Kutt[]
  plan: readonly Plan[]
  vald: number | null
  onVald: (id: number | null) => void
  onSlett: (id: number) => void
  onLaas: () => void
  busy: boolean
  feil: string | null
  melding: string | null
  hentar: boolean
  tunar: { gjort: number; av: number } | null
  forslag: readonly Kandidat[]
  visForslag: boolean
  onVisForslag: (b: boolean) => void
  synt: number | null
  onSyn: (i: number | null) => void
  onTaAlle: (i: number) => void
  onLeggTil: (i: number) => void
  onFinn: () => void
  onFinnDjup: () => void
  onAvbryt: () => void
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
  if (hentar) return <span className="dim">les fila …</span>
  if (!m) return <span className="dim">snittar …</span>
  const raud = new Set(rules.filter((r) => !r.ok && r.hard && r.rad).map((r) => r.rad))
  const tal = [
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

/** éi rad per låst plan: namn, kva det er, stykke og ledd, og vegen ut */
function Plana({ p }: { p: ArketProps }) {
  if (!p.plan.length) {
    return <p className="dim py-3 text-[11px]">ingen plan enno. sikt med to fingrar, og lås.</p>
  }
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
                {mine.length ? `${mine.length} stk · ${ledd} ledd` : "råkar ikkje"}
              </span>
            </button>
            <button type="button" aria-label={`slett plan ${pl.id}`} title="ta planet bort" className="hit dim h-9 w-11 shrink-0 rounded-full" onClick={() => p.onSlett(pl.id)}>
              ×
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** svara frå søket, rangerte. Eit trykk syner kandidaten som skuggeplan. */
function Forslaga({ p }: { p: ArketProps }) {
  const { forslag, synt } = p
  const form = forslag.some((k) => k.tro > 0)
  return (
    <div className="py-1">
      {/* handlingane ØVST: lista er lang, og det du skal trykkje på skal ikkje rulle bort */}
      <div className="flex items-center gap-1.5 pb-2">
        {synt !== null && forslag[synt] && (
          <>
            <button type="button" className={CHIP} style={chipStyle(true)} onClick={() => p.onTaAlle(synt)} title="byt ut plana du har med desse">ta alle</button>
            <button type="button" className={CHIP} style={chipStyle(false)} onClick={() => p.onLeggTil(synt)} title="legg desse til dei du har, med nye namn">legg til</button>
          </>
        )}
        <button type="button" className={CHIP + " ml-auto"} style={chipStyle(false)} onClick={() => p.onVisForslag(false)}>lat att</button>
      </div>
      <div className="dim flex items-center text-[9px] uppercase tracking-[0.14em]">
        <span className="flex-1">forslag</span>
        {form && <span className="w-10 text-right">form</span>}
        <span className="w-10 text-right">delar</span>
        <span className="w-8 text-right">ark</span>
      </div>
      {!forslag.length && <p className="dim py-2 text-[11px]">{p.tunar ? "søkjer …" : "ingen sett held. prøv ei anna plate eller tjukn."}</p>}
      {forslag.map((k, i) => (
        <button
          key={i}
          type="button"
          onClick={() => p.onSyn(synt === i ? null : i)}
          className="hit tab flex w-full items-baseline rounded py-1 text-[11px]"
          style={synt === i ? { background: "var(--ink)", color: "var(--paper)" } : { color: "var(--ink)", opacity: k.held ? 1 : 0.45 }}
          aria-pressed={synt === i}
        >
          <span className="flex-1 truncate text-left">{k.namn}</span>
          {form && <span className="w-10 text-right">{n0(k.tro * 100)}%</span>}
          <span className="w-10 text-right">{k.delar}</span>
          <span className="w-8 text-right">{k.ark}</span>
        </button>
      ))}
    </div>
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
          <span key={ord} className="flex items-center gap-1.5"><span aria-hidden="true" className="block h-[7px] w-[7px] rounded-full" style={{ background: farge }} />{ord}</span>
        ))}
      </span>
    </div>
  )
}

/** alt: material og plate, skyvarane, tavla, uttaka, verktya */
function Alt({ p, uttak }: { p: ArketProps; uttak: RefObject<HTMLDivElement | null> }) {
  const { params, onChange, metrics } = p
  const setParam = (k: string, raw: string) => onChange({ ...params, [k]: snap(lesTal(raw), PARAM_RANGES[k]) })
  const naaTjukn = num(params, "tjukn", TJUKNER[0])
  return (
    <>
      <div className="flex items-center gap-1.5 py-2">
        {(Object.keys(MATERIALS) as Material[]).map((mk) => (
          <button
            key={mk}
            type="button"
            aria-pressed={params.material === mk}
            aria-label={`materiale: ${MATERIALS[mk].label}`}
            title={MATERIALS[mk].label}
            onClick={() => onChange({ ...params, material: mk })}
            className="hit flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90"
          >
            <span aria-hidden="true" className="block h-6 w-6 rounded-full border" style={{ backgroundColor: MATERIALS[mk].hex, borderColor: params.material === mk ? "var(--ink)" : "var(--rule)", boxShadow: params.material === mk ? "0 0 0 1px var(--ink)" : undefined }} />
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
        <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(params, k, PARAM_RANGES[k].min)} onChange={setParam} />
      ))}
      {GROUPS.map((g) => {
        const keys = g.keys.filter((k) => !FRAMME.has(k))
        if (!keys.length) return null
        return (
          <div key={g.id} className="pt-3">
            <h3 className="dim pb-0.5 text-[10px] uppercase leading-none tracking-[0.24em]">{g.label}</h3>
            {keys.map((k) => (
              <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(params, k, PARAM_RANGES[k].min)} onChange={setParam} />
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
      {p.benk && <p className="dim pt-3 text-[10px] leading-relaxed tracking-[0.1em]">{TASTAR}</p>}
    </>
  )
}

export function Arket(p: ArketProps): JSX.Element {
  const { benk, steg, onSteg, onHogd, tunar } = p
  const langtrykk = useLangtrykk(tunar ? p.onAvbryt : p.onFinn, tunar ? p.onAvbryt : p.onFinnDjup)
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
  // låsen pulserer ÉIN gong: fyrste gongen skissa råkar kroppen
  const [puls, setPuls] = useState(false)
  const pulsa = useRef(false)
  useEffect(() => {
    if (!p.raakar || pulsa.current) return
    pulsa.current = true
    setPuls(true)
    const t = window.setTimeout(() => setPuls(false), 1200)
    return () => window.clearTimeout(t)
  }, [p.raakar])

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
      {/* LÅSEN er handlinga: skissa vert ein del. Med eit plan valt er
          skissa gøymd, og knappen slepp valet i staden. Prikken i hjørnet
          er motoren som reknar. */}
      <button
        type="button"
        onClick={p.vald === null ? p.onLaas : () => p.onVald(null)}
        disabled={p.view === "kontur"}
        title={p.vald === null ? "lås skisseplanet: det vert ein del (L)" : "ferdig med planet (esc)"}
        className={"hit flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] uppercase tracking-[0.14em] transition active:scale-95 disabled:opacity-30" + (puls ? " puls" : "")}
        style={{ background: "var(--ink)", color: "var(--paper)" }}
      >
        {IcoLaas}{p.vald === null ? "lås" : "ferdig"}
        <span aria-hidden="true" className="absolute -right-px -top-px h-2 w-2 rounded-full" style={{ background: "var(--paper)", boxShadow: "0 0 0 1.5px var(--ink)", opacity: p.busy && !tunar ? 1 : 0, transition: "opacity 200ms ease" }} />
      </button>
      {/* SKISSEMODUSEN: to fingrar arbeider på planet — dra flyttar, vri
          vinklar, klyp zoomar. Av er «form»: klyp storleiken, vri vendinga. */}
      <button
        type="button"
        aria-pressed={p.modus === "skisse"}
        aria-label="skisse"
        title={p.modus === "skisse" ? "skissemodus (S): to fingrar dreg, vrir og zoomar snittet. trykk for form" : "form (S): to fingrar klyp storleiken, vrir vendinga, dreg snittet. trykk for skisse"}
        onClick={p.onModus}
        className={ICON_BTN}
        style={chipStyle(p.modus === "skisse")}
      >
        {IcoSkisse}
      </button>
      <button type="button" onClick={() => !benk && onSteg(open ? "line" : "midt")} className={"tab min-w-0 flex-1 truncate pl-1 text-left tracking-[0.04em] " + (benk ? "text-[11px]" : "text-[10px]")} aria-label="plan, delar, ark og tid">
        <Lina p={p} />
      </button>
      <button
        type="button"
        {...langtrykk}
        disabled={p.busy && !tunar}
        aria-label="forslag"
        title={tunar ? "søket går. trykk for å stogge og halde det beste so langt" : "(F) forslag til sett av plan. hald for djupsøket: kroppen målt, hundrevis snitta"}
        className={ICON_BTN + " disabled:opacity-100"}
        style={{ ...HAIR, color: "var(--ink)" }}
      >
        {tunar ? IcoStopp : IcoFinn}
        {tunar && <Ring del={tunar.av ? tunar.gjort / tunar.av : 0} />}
      </button>
      {!benk && (
        <button type="button" aria-label="eksport" aria-expanded={visUttak} title="uttaka: stl, dxf, svg, ark, png, passprøve, alt, lagre" onClick={eksport} className={ICON_BTN} style={chipStyle(visUttak)} data-uttak="">
          {IcoUttak}
        </button>
      )}
    </div>
  )

  const midt = (
    <>
      <SliderRow k="storleik" r={PARAM_RANGES.storleik} value={num(p.params, "storleik", 150)} onChange={(k, raw) => p.onChange({ ...p.params, [k]: snap(lesTal(raw), PARAM_RANGES[k]) })} bi={p.metrics ? `${n0(p.metrics.envX)}×${n0(p.metrics.envY)}×${n0(p.metrics.envZ)}` : undefined} />
      {p.visForslag ? <Forslaga p={p} /> : <Plana p={p} />}
      <Reglar rules={p.rules} params={p.params} onChange={p.onChange} />
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
        className="pointer-events-auto relative flex w-full max-w-md flex-col rounded-3xl border sm:max-w-xl"
        style={{
          ...HAIR,
          background: "var(--paper)",
          color: "var(--ink)",
          // taket ligg på ARKET, og trygdesona tel med: summen er taket
          maxHeight: steg === "alt" ? "calc(72dvh - env(safe-area-inset-bottom) - 12px)" : "calc(48dvh - env(safe-area-inset-bottom) - 12px)",
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: drag.current ? undefined : "transform 180ms ease",
        }}
      >
        {visUttak && steg !== "alt" && (
          <div data-uttak="" role="group" aria-label="uttak" className="fade-inn absolute inset-x-2 bottom-[calc(100%+8px)] rounded-2xl border px-3" style={{ ...HAIR, background: "var(--paper)", boxShadow: "0 8px 28px color-mix(in srgb, var(--ink) 16%, transparent)" }}>
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
