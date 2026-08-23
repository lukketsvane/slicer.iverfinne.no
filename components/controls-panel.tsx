"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from "react"
import {
  MATERIALS,
  TJUKNER,
  nn,
  type ExportKind,
  type Material,
  type Metrics,
  type ParamBag,
  type Range,
  type Rule,
  type View,
} from "@/lib/core"
import { FORMAT } from "@/lib/io"
import { VAFFEL } from "@/lib/vaffel/engine"
import {
  CHIP,
  EXPORTS,
  Fiksen,
  HAIR,
  ICON_BTN,
  IcoAngre,
  IcoDown,
  IcoFinn,
  IcoHogre,
  IcoImport,
  IcoReset,
  IcoShare,
  IcoSliders,
  IcoVenstre,
  Ring,
  R_ARK,
  R_DELAR,
  R_GODS,
  SliderRow,
  TASTAR,
  TAST_ARK,
  VIEWS,
  chipStyle,
  lesTal,
  n0,
  n1,
  FRAMME,
  num,
  snap,
  stengd,
  tableRows,
  tjukn,
} from "./deler"

/**
 * SLICERMAN — kontrollflata.
 *
 * Eit flytande ark nedst med tre tilstandar. Lukka er det éi line — kjelda,
 * tre tal og to knappar — og objektet eig heile skjermen. Halvope kjem
 * lesemåtane, materialet, delane og eksporten. Heilt ope kjem skyveveggen.
 *
 * Det som står i sjølve lina er dei tre tala som avgjer om uttaket er verdt
 * å skjere: kor mange delar det er, kor mange meter kutt det er, og kor
 * mange plater du må ha. Ein leikegrind gøymer rekninga; ein reiskap har
 * henne i panna.
 *
 * Ingen tal vert rekna ut her. Alt kjem frå `metrics` og `rules`, som har
 * målt det objektet som faktisk står på skjermen.
 */

export type PanelMode = "lukka" | "halv" | "full"
export const PANEL_MODES: readonly PanelMode[] = ["lukka", "halv", "full"]

export function ControlsPanel(props: {
  params: ParamBag
  kjelde: string
  metrics: Metrics | null
  rules: Rule[]
  view: View
  /** kva kjent ting som står ved sida av objektet, eller «av» */
  /** profilane som bilete (SVG-tekst), generert automatisk av arbeidaren */
  syn: string | null
  hiDetail: boolean
  isDesktop: boolean
  busy: boolean
  feil: string | null
  /** ei fil er undervegs inn: tala som står er frå det førre objektet */
  hentar: boolean
  /** eit ord attende på noko som elles ikkje synest, eit lite bel */
  melding: string | null
  mode: PanelMode
  /** kor langt søket er kome, eller null når det ikkje går noko søk */
  tunar: { gjort: number; av: number } | null
  /** kvar i svarlista vi står, eller null når lista ikkje gjeld lenger */
  finnStad: { nth: number; tal: number; ribbX: number; ribbY: number } | null
  kanAngre: boolean
  /** kor høgt arket er, i pikslar. Kameraet stiller objektet inn i det som
   *  er att. */
  onHogd: (px: number) => void
  onMode: (m: PanelMode) => void
  onChange: (p: ParamBag) => void
  onView: (v: View) => void
  onReset: () => void
  onAngre: () => void
  onToggleDetail: () => void
  onExport: (kind: ExportKind) => void
  onFinn: () => void
  onFinnAtt: () => void
  onShare: () => void
  onFile: (f: File) => void
}): JSX.Element {
  const {
    params,
    kjelde,
    metrics,
    rules,
    view,
    syn,
    hiDetail,
    isDesktop,
    busy,
    feil,
    hentar,
    melding,
    mode,
    tunar,
    finnStad,
    kanAngre,
    onHogd,
    onMode,
    onChange,
    onView,
    onReset,
    onAngre,
    onToggleDetail,
    onExport,
    onFinn,
    onFinnAtt,
    onShare,
    onFile,
  } = props

  // lukka → halv (lesemåtar, materiale, delane, eksport) → full (skyveveggen)
  const open = mode !== "lukka"
  const pick = useRef<HTMLInputElement | null>(null)

  /**
   * Kor mykje av ruta arket tek.
   *
   * Det er MÅLT og ikkje gjetta: arket er tre høgder, og kvar av dei er
   * ulik på ein telefon og på ein skjerm. Kameraet får talet og stiller
   * objektet inn i bandet som er att.
   */
  const arket = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = arket.current
    if (!el) return
    const meld = () => {
      // pluss botnmargen: han er like mykje dekt som arket sjølv
      const h = el.getBoundingClientRect().height + 24
      // GROVKORNA MED VILJE.
      //
      // Kvart tal som kjem herifrå rammar scena inn på nytt, og ei
      // innramming er ei full forliking av scenegrafen. Arket veks med
      // nokre og tjue pikslar berre av at det kjem ei line i det. Utan
      // trinn ville kvar slik line rykt kameraet og ete hovudtråden midt
      // medan søket gjekk; framdrifta hoppa frå tolv steg til to.
      onHogd(Math.round(h / 40) * 40)
    }
    const ro = new ResizeObserver(meld)
    ro.observe(el)
    window.addEventListener("resize", meld)
    meld()
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", meld)
    }
  }, [onHogd])

  // Arket er eit iOS-ark: dra i grepet eller hovudlina, opp for meir og ned
  // for mindre. Fingeren får eit lite gummiband som svar medan han dreg, og
  // slepp han forbi terskelen, byter arket steg.
  const stepMode = useCallback(
    (dir: 1 | -1) => {
      const i = PANEL_MODES.indexOf(mode)
      onMode(PANEL_MODES[Math.min(2, Math.max(0, i + dir))])
    },
    [mode, onMode],
  )
  const dragging = useRef<{ y0: number; id: number } | null>(null)
  const [pull, setPull] = useState(0)
  const onSheetDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return
    dragging.current = { y0: e.clientY, id: e.pointerId }
  }
  const onSheetMove = (e: React.PointerEvent) => {
    const d = dragging.current
    if (!d || e.pointerId !== d.id) return
    setPull(Math.max(-26, Math.min(26, (e.clientY - d.y0) * 0.3)))
  }
  // eit drag skal ikkje OGSÅ vera eit trykk: kryssa fingeren terskelen,
  // vert klikket som elles ville fylgt svelgt
  const swallowClick = useRef(false)
  const onSheetUp = (e: React.PointerEvent) => {
    const d = dragging.current
    if (!d || e.pointerId !== d.id) return
    dragging.current = null
    setPull(0)
    const dy = e.clientY - d.y0
    swallowClick.current = Math.abs(dy) > 12
    if (dy < -34) stepMode(1)
    else if (dy > 34) stepMode(-1)
  }

  const broken = useMemo(() => {
    const hard = new Set<string>()
    const soft = new Set<string>()
    for (const r of rules) if (!r.ok) (r.hard ? hard : soft).add(r.id)
    return { hard, soft }
  }, [rules])
  const failed = useMemo(() => rules.filter((r) => !r.ok), [rules])
  const isHard = (ids: readonly string[]) => ids.some((id) => broken.hard.has(id))
  const isSoft = (ids: readonly string[]) => ids.some((id) => broken.soft.has(id))

  const rows = useMemo(() => tableRows(metrics), [metrics])

  const setParam = useCallback(
    (k: string, raw: string) => onChange({ ...params, [k]: snap(lesTal(raw), VAFFEL.ranges[k]) }),
    [params, onChange],
  )

  /** Dei tre tala som avgjer om uttaket er verdt å skjere, i sjølve lina.
   *  Panelet kan lukkast; rekninga kan ikkje. */
  const headline: { key: string; text: string; ids: readonly string[] }[] = metrics
    ? [
        { key: "delar", text: `${n0(metrics.parts)} delar`, ids: R_DELAR },
        { key: "kutt", text: `${n1(metrics.cutLen / 1000)} m`, ids: R_GODS },
        { key: "ark", text: `${n0(metrics.sheets)} ark`, ids: R_ARK },
      ]
    : []

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <section
        ref={arket}
        aria-label="kontrollar"
        aria-busy={busy}
        // Breiare enn ein telefon der det er plass: dei same knappane på
        // færre liner er eit lågare ark, og eit lågare ark er meir objekt.
        className="pointer-events-auto w-full max-w-md rounded-3xl border sm:max-w-xl"
        style={{
          ...HAIR,
          background: "var(--paper)",
          color: "var(--ink)",
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: dragging.current ? undefined : "transform 180ms ease",
        }}
      >
        <input
          ref={pick}
          type="file"
          accept={FORMAT.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            // same fil to gonger på rad skal fyre to gonger
            e.target.value = ""
          }}
        />

        {/* dragsona: grepet og hovudlina. Fingeren dreg arket mellom dei tre
            stega; knappane verkar som før av di eit trykk utan drag ikkje
            kryssar terskelen. */}
        <div
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
          onClickCapture={(e) => {
            if (swallowClick.current) {
              swallowClick.current = false
              e.preventDefault()
              e.stopPropagation()
            }
          }}
          style={{ touchAction: "none" }}
        >
          {open && (
            <div className="flex justify-center pt-1.5" aria-hidden="true">
              <div
                className="h-1 w-9 rounded-full"
                style={{ background: "color-mix(in srgb, var(--ink) 22%, transparent)" }}
              />
            </div>
          )}

          {/*
            TALA KAPPAST IKKJE.
            På ein smal telefon er det ikkje plass til kjelda, tre tal og
            tre knappar på ei line, og det som gav etter var tala: «12 delar
            · 17,…». Dei er heile grunnen til at lina finst. So på smale
            skjermar fell dei ned på si eiga line i staden, og får henne
            heil. Over fire hundre pikslar står alt som før.
          */}
          <div className="flex flex-wrap items-center gap-1.5 p-2.5">
            {/* Kjelda. Han er ikkje ein nedtrekk med tre demofigurar — han er
                DIN fil, og trykket opnar filveljaren. Kuben står der til
                nokon gjev han noko betre. */}
            <button
              type="button"
              onClick={() => pick.current?.click()}
              title={`hent eit nett: ${FORMAT.join(" ")}`}
              aria-label="hent eit nett"
              className="hit flex h-9 min-w-0 max-w-[34%] shrink items-center gap-1.5 rounded-full border pl-2.5 pr-3 text-[11px] uppercase tracking-[0.14em] transition active:scale-95 sm:max-w-[42%]"
              style={{ ...HAIR, color: "var(--ink)" }}
            >
              <span className="shrink-0 opacity-70">{IcoImport}</span>
              <span className="min-w-0 flex-1 truncate text-left">{kjelde}</span>
            </button>

            {/* Tala er ikkje berre til å lese: eit trykk på dei opnar arket
                der grunngjevinga står. Det er den kortaste vegen frå «det
                står raudt» til «kvifor står det raudt». */}
            <button
              type="button"
              onClick={() => onMode(open ? "lukka" : "halv")}
              title={
                failed.length
                  ? "trykk for å sjå kva som ryk"
                  : "trykk for kontrollane"
              }
              aria-label="delar, kuttlengd og ark"
              className={
                // Tala krympar ikkje. Kjeldepilla gjer det, og ho har eit
                // ikon som seier kva ho er sjølv om namnet vert kappa;
                // tala har ingenting å gje. Vert det for trongt likevel,
                // bryt rada (flex-wrap over) og tala får ei line for seg.
                "tab min-w-0 shrink-0 truncate pl-1 text-left text-[11px] tracking-[0.06em] " +
                "max-[379px]:order-last max-[379px]:w-full max-[379px]:flex-none max-[379px]:pt-2"
              }
            >
              {feil ? (
                <span style={{ color: "var(--warn)" }}>{feil}</span>
              ) : melding ? (
                <span className="opacity-70">{melding}</span>
              ) : hentar ? (
                // Tala som står er frå det objektet du hadde FØR. Å la dei
                // stå medan ei ny fil vert tolka er å seie noko om eit
                // objekt som ikkje er der.
                <span className="opacity-40">les fila …</span>
              ) : headline.length === 0 ? (
                <span className="opacity-40">snittar …</span>
              ) : (
                headline.map((h, i) => (
                  <span key={h.key}>
                    {i > 0 && <span className="px-1 opacity-30">·</span>}
                    <span
                      style={{
                        color: isHard(h.ids) ? "var(--warn)" : undefined,
                        opacity: isHard(h.ids) ? 1 : 0.62,
                        textDecoration: isSoft(h.ids) ? "underline dotted" : undefined,
                        textUnderlineOffset: 3,
                      }}
                    >
                      {h.text}
                    </span>
                  </span>
                ))
              )}
            </button>

            {/* prikken har fast plass, så lina står i ro medan motoren reknar */}
            <span
              aria-hidden="true"
              className="ml-auto block h-[5px] w-[5px] shrink-0 rounded-full"
              style={{
                background: "var(--ink)",
                opacity: busy && !tunar ? 0.8 : 0.12,
                transition: "opacity 200ms ease",
              }}
            />

            <button
              type="button"
              onClick={onFinn}
              disabled={busy}
              aria-label="finn innstillingar"
              title="(F) reknar gjennom eit titals rutenett og set det beste. trykk igjen for det neste."
              className={ICON_BTN + " disabled:opacity-100"}
              style={{ background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }}
            >
              {IcoFinn}
              {tunar && <Ring del={tunar.av ? tunar.gjort / tunar.av : 0} />}
            </button>
            <button
              type="button"
              onClick={() => onMode(open ? "lukka" : "halv")}
              aria-label={open ? "gøym kontrollane" : "vis kontrollane"}
              aria-expanded={open}
              title={open ? "gøym kontrollane (O)" : "vis kontrollane (O)"}
              className={ICON_BTN}
              style={{ ...HAIR, color: "var(--ink)" }}
            >
              {open ? IcoDown : IcoSliders}
            </button>
          </div>
        </div>

        {/*
          KVAR I SVARLISTA VI STÅR.
          Knappen reknar ei rangert liste og set det beste. Utan denne lina
          er andre trykk eit hopp utan retning: du veit ikkje at det finst
          tolv til, du veit ikkje kva du står på, og du kjem deg ikkje
          attende til det du nettopp hadde. Lina finst berre so lenge lista
          svarar på det spørsmålet som står — rører du storleiken eller
          plata, er ho borte.
        */}
        {/*
          KVAR I SVARLISTA VI STÅR.
          Knappen reknar ei rangert liste og set det beste. Utan denne lina
          er andre trykk eit hopp utan retning: du veit ikkje at det finst
          tolv til, ikkje kvar du står, og du kjem deg ikkje attende til det
          du nettopp hadde. Lina finst berre so lenge lista svarar på det
          spørsmålet som står; rører du storleiken eller plata, er ho borte.

          Medan søket går står det ingenting her. Ringen kring knappen ER
          framdrifta, og eit tal som seier det same ein gong til er ei line
          som spring opp og gjer arket høgare midt i det du ventar.
        */}
        {finnStad && (
          <div
            className="flex items-center gap-1.5 px-2.5 pb-2 text-[10px] uppercase tracking-[0.14em]"
            aria-live="polite"
          >
            <button
              type="button"
              onClick={onFinnAtt}
              disabled={busy}
              aria-label="førre svar"
              title="førre svar (⇧F)"
              className="hit flex h-6 w-6 items-center justify-center rounded-full border transition active:scale-90 disabled:opacity-30"
              style={{ ...HAIR, color: "var(--ink)" }}
            >
              {IcoVenstre}
            </button>
            <button
              type="button"
              onClick={onFinn}
              disabled={busy}
              aria-label="neste svar"
              title="neste svar (F)"
              className="hit flex h-6 w-6 items-center justify-center rounded-full border transition active:scale-90 disabled:opacity-30"
              style={{ ...HAIR, color: "var(--ink)" }}
            >
              {IcoHogre}
            </button>
            <span className="tab truncate pl-1" style={{ opacity: 0.55 }}>
              {finnStad.nth + 1} av {finnStad.tal}
              {/* Ribbetalet står som to skyvarar i skyveveggen. Der er
                  halen ei avskrift av det du står og dreg i. */}
              {mode !== "full" && ` · ${finnStad.ribbX}×${finnStad.ribbY} ribber`}
            </span>
          </div>
        )}

        {/*
          DET UTVIDBARE ARKET, OG HALVOPE ER HALVOPE.

          Arket hadde éi høgd for begge dei opne stega, og ho var sett etter
          det fulle. Halvope tok difor to tredelar av ein telefon, og eit
          ark som tek to tredelar er ikkje eit halvope ark: det er eit ark
          som ligg over objektet. Det halve steget er kortare enn det fulle
          no, og det er innhaldet i det som avgjer kva som får plass der.
        */}
        {open && (
          <div
            className={
              "overflow-y-auto overscroll-contain px-3 pb-1 " +
              (mode === "full" ? "max-h-[46vh]" : "max-h-[26vh]")
            }
          >
            {/* STORLEIKEN STÅR FRAMME.
                Han er steg to for kvar einaste brukar: du slepper ei fil
                inn, og so bestemmer du kor stort det skal vera. Å måtte
                opne skyveveggen for det eine talet er eit steg for mykje —
                og «finn innstillingar» reknar ut frå nett det talet. */}
            <SliderRow
              k="storleik"
              r={VAFFEL.ranges.storleik}
              value={num(params, "storleik", VAFFEL.ranges.storleik.min)}
              onChange={setParam}
              // Storleiken er EIN skyvar, men objektet har tre mål, og
              // skyvaren set berre den lengste sida. Målet står under
              // etiketten og ikkje på ei eiga line: det er den same
              // opplysninga, og ho treng ikkje ei rad for seg sjølv.
              bi={
                metrics
                  ? `${n0(metrics.envX)}×${n0(metrics.envY)}×${n0(metrics.envZ)}`
                  : undefined
              }
            />

            {/* materialet og plata i EI rad. Materialet er ikkje ein farge —
                han er tettleiken massen vert rekna av, og han er det som
                avgjer om åringane skal teiknast i det heile. */}
            <div className="flex flex-wrap items-center gap-1.5 py-1">
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
              <span
                aria-hidden="true"
                className="mx-1 h-4 w-px"
                style={{ background: "var(--rule)" }}
              />
              {/* Tjukna er den eine inngangen som ikkje er ein smak: ho er
                  plata du har liggjande. Skyvaren er fri, men desse er dei
                  ein faktisk får kjøpt. */}
              {TJUKNER.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={params.tjukn === t}
                  title={`${tjukn(t)} mm plate`}
                  onClick={() => onChange({ ...params, tjukn: t })}
                  className={CHIP + " px-2"}
                  style={chipStyle(params.tjukn === t)}
                >
                  {tjukn(t)}
                </button>
              ))}
            </div>

            {/* Lesemåtane står SIST. Dei er eit blikk på lerretet og ikkje
                eit steg i arbeidet: du slepper ei fil, set storleiken,
                trykkjer finn. Rekkjefylgda i arket skal vera rekkjefylgda i
                jobben, og det som berre er ein måte å sjå på, kan stå
                nedst. Tre ord held; kva dei tyder ligg i title. */}
            <div className="flex flex-wrap items-center gap-1.5 py-1">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  title={`${v.hint} (${v.tast})`}
                  aria-pressed={view === v.id}
                  onClick={() => onView(v.id)}
                  className={CHIP}
                  style={chipStyle(view === v.id)}
                >
                  {v.label}
                </button>
              ))}
              {isDesktop && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={hiDetail}
                  onClick={onToggleDetail}
                  title="finare rute i profilane; tyngre å rekne"
                  className={CHIP + " ml-auto"}
                  style={chipStyle(hiDetail)}
                >
                  fint nett
                </button>
              )}
            </div>

            {/* reglane som ryk: éi line kvar, grunngjevinga i title. Panelet
                seier KVA som er gale; KVIFOR ligg eit fingertrykk unna, og
                rettinga står i lina som eit tal du kan trykkje på. */}
            {failed.length > 0 && (
              <ul className="space-y-1 py-1">
                {failed.map((r) => (
                  <li
                    key={r.id}
                    title={r.why}
                    className="flex items-center justify-between gap-3 text-[11px] leading-4"
                    style={{
                      color: r.hard ? "var(--warn)" : undefined,
                      opacity: r.hard ? 1 : 0.65,
                    }}
                  >
                    <span className="tracking-[0.06em]">
                      {r.hard ? "bryt" : "merk"} · {r.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {/* Talet står i tavla under når heile veggen er open,
                          og er alt farga raudt der. Her oppe er lina eit
                          flagg. Knappen står uansett: han er vegen ut. */}
                      {mode !== "full" && <span className="tab">{r.value}</span>}
                      <Fiksen rule={r} params={params} onChange={onChange} />
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* profilane, automatisk: kvar del slik han ligg på plata. Det
                ein før måtte laste ned ei fil for å sjå, står i menyen og
                fylgjer kvar einaste parameterendring. */}
            {/*
              PROFILANE STÅR I DET FULLE STEGET.

              Teikninga er det einaste i arket som ikkje er ein kontroll: ho
              er eit svar, og svaret står alt på skjermen som eit objekt rett
              over. Ho tok ein tredel av høgda i det halve steget og skuva
              det objektet ho skulle forklare ut av ruta. Her nede har ho
              plass, og ramma kring henne er borte: sida er kvit og
              teikninga er kvit, so ramma skilde ingenting frå noko.
            */}
            {syn && mode === "full" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(syn)}`}
                alt="alle profilane, slik dei ligg på plata"
                className="my-1.5 max-h-40 w-full object-contain"
                style={{ opacity: busy ? 0.5 : 1, transition: "opacity 200ms ease" }}
              />
            )}

            {mode === "full" && (
              <>
                {/* To spalter. Kvar rad brukte under ein tredel av breidda
                    og betalte for resten i høgd: tretten rader vart tolv
                    tomme midtfelt og to hundre og seksti piksel. */}
                <dl
                  className="mt-3 grid grid-cols-2 gap-x-6"
                  style={{ opacity: busy ? 0.5 : 1, transition: "opacity 200ms ease" }}
                >
                  {rows.map((row) => {
                    const hard = row.rules !== undefined && isHard(row.rules)
                    const soft = row.rules !== undefined && isSoft(row.rules)
                    return (
                      <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-2 py-[2px] text-[11px] leading-4"
                      >
                        <dt className="shrink-0 truncate opacity-50">{row.label}</dt>
                        <dd
                          className="tab truncate text-right"
                          style={{
                            color: hard ? "var(--warn)" : undefined,
                            // eit mjukt brot er eit val og ikkje ein feil:
                            // det skal merkast, men ikkje rope
                            textDecoration: soft ? "underline dotted" : undefined,
                            textDecorationColor: soft
                              ? "color-mix(in srgb, var(--ink) 45%, transparent)"
                              : undefined,
                            textUnderlineOffset: 3,
                          }}
                        >
                          {row.value}
                          {row.unit && <span className="pl-1 opacity-45">{row.unit}</span>}
                        </dd>
                      </div>
                    )
                  })}
                </dl>

                {/* Same skyvar to gonger på same skjerm er ikkje to
                    skyvarar: det er ein som ser ut til å ikkje verke når du
                    dreg den andre. Storleiken og tjukna står alt framme. */}
                {VAFFEL.groups.map((g) => (
                  <div key={g.id} className="pt-3">
                    <h3 className="pb-0.5 text-[10px] uppercase leading-none tracking-[0.24em] opacity-35">
                      {g.label}
                    </h3>
                    {g.keys.filter((k) => !FRAMME.has(k)).map((k) => (
                      <SliderRow
                        key={k}
                        k={k}
                        r={VAFFEL.ranges[k]}
                        value={num(params, k, VAFFEL.ranges[k].min)}
                        onChange={setParam}
                      />
                    ))}
                  </div>
                ))}

                {/* Tastane. Dei står nedst i det som alt er ope: den som har
                    opna heile veggen er den som kjem att, og det er han som
                    har bruk for dei. */}
                {isDesktop && (
                  <p className="pt-4 text-[10px] leading-relaxed tracking-[0.1em] opacity-30">
                    {TASTAR + TAST_ARK}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/*
          FOTEN STÅR STILLE.
          Uttaka og dei fire verktøya låg inni rullekassa, og i det fulle
          steget rulla dei ut av syne: den einaste vegen attende til det
          halve steget låg under folden i eit ark som var femten skyvarar
          langt. Det ein TRYKKJER på skal ikkje rulle.
        */}
        {open && (
          <div className="px-3 pb-2">
            {/*
              KVA FARGANE TYDER, der uttaka står.
              Han er to ord, og han sparar den einaste feilen som kostar
              ei heil plate: å setje kutteffekt på graveringslaget. Svart
              er fyrste laget i LightBurn, og fyrste laget køyrer fyrst,
              so graveringa MÅ liggje der.
            */}
            {/* uttaka */}
            <div className="flex flex-wrap items-center gap-1.5 py-1">
              {EXPORTS.map((x) => {
                const stopp = stengd(x.id, metrics)
                return (
                  <button
                    key={x.id}
                    type="button"
                    title={stopp || x.hint}
                    disabled={busy || stopp !== ""}
                    onClick={() => onExport(x.id)}
                    className={CHIP + " uppercase tracking-[0.1em]"}
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

            {/*
              KVA FARGANE TYDER, og dei tre verktøya, på SAME line.
              Forklaringa er to ord, og ho sparar den einaste feilen som
              kostar ei heil plate: å setje kutteffekt på graveringslaget.
              Svart er fyrste laget i LightBurn, og fyrste laget køyrer
              fyrst, so graveringa MÅ liggje der. To ord treng ikkje ei rad
              åleine, og på ein telefon braut verktøya til ei tredje rad.
            */}
            <div className="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.14em]">
              <span
                className="flex items-center gap-3"
                style={{ color: "var(--ink)", opacity: 0.55 }}
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
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={onAngre}
                  disabled={!kanAngre}
                  aria-label="angre siste endring"
                  title="angre siste endring (Z)"
                  className={CHIP}
                  style={chipStyle(false)}
                >
                  {IcoAngre}
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  aria-label="tilbake til standarden"
                  title="tilbake til standarden. nettet ditt står"
                  className={CHIP}
                  style={chipStyle(false)}
                >
                  {IcoReset}
                </button>
                <button
                  type="button"
                  onClick={onShare}
                  aria-label="del"
                  title="lenkja ber innstillingane, ikkje nettet"
                  className={CHIP}
                  style={chipStyle(false)}
                >
                  {IcoShare}
                </button>
                {/*
                  VEGEN INN I SKYVEVEGGEN.
                  Han var ein knapp på tvers av heile arket, med NØYAKTIG
                  same pil som sjeveronen i hovudlina, samstundes, med
                  motsett tyding: den eine lukka, den andre opna meir. No
                  er han eit ikon i verktøyrekkja, og ikonet er skyvarane
                  sjølve.
                */}
                <button
                  type="button"
                  aria-expanded={mode === "full"}
                  aria-label={mode === "full" ? "færre kontrollar" : "alle parametrar"}
                  title={mode === "full" ? "færre kontrollar" : "alle parametrar"}
                  onClick={() => onMode(mode === "full" ? "halv" : "full")}
                  className={CHIP}
                  style={chipStyle(mode === "full")}
                >
                  {IcoSliders}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
