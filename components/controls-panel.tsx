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
  IcoImport,
  IcoReset,
  IcoShare,
  IcoSliders,
  Ring,
  R_ARK,
  R_DELAR,
  R_GODS,
  SliderRow,
  TASTAR,
  TAST_ARK,
  Tavla,
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
  utanRad,
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
  /** profilane som bilete (SVG-tekst), generert automatisk av arbeidaren */
  syn: string | null
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
  kanAngre: boolean
  /** kor høgt arket er, i pikslar. Kameraet stiller objektet inn i det som
   *  er att. */
  onHogd: (px: number) => void
  onMode: (m: PanelMode) => void
  onChange: (p: ParamBag) => void
  onReset: () => void
  onAngre: () => void
  onExport: (kind: ExportKind) => void
  onFinn: () => void
  onShare: () => void
  onFile: (f: File) => void
}): JSX.Element {
  const {
    params,
    kjelde,
    metrics,
    rules,
    syn,
    isDesktop,
    busy,
    feil,
    hentar,
    melding,
    mode,
    tunar,
    kanAngre,
    onHogd,
    onMode,
    onChange,
    onReset,
    onAngre,
    onExport,
    onFinn,
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
  /**
   * Kva av dei brotne som skal flaggast over tavla.
   *
   * I det fulle steget står tavla rett under, og der ber kvar rad regelen
   * sin sjølv: ei line til over henne er det same talet ein gong til, med
   * eit anna ord framfor. Att står dei to utan ei rad å farge.
   *
   * I DET HALVE STEGET INGEN.
   *
   * Fyrst gjekk dei mjuke ned — «306 opne kantar» er eit val og ikkje ein
   * stopp. Att stod dei harde, som «bryt · gods i leddet», og dei kosta ei
   * line kvar av eit ark med tak på 45 %.
   *
   * Dei er ikkje borte, dei har flytt dit dei høyrer heime. HOVUDLINA
   * SEIER DET ALT: eit hardt brot fargar det talet regelen gjeld raudt, og
   * dei tre tala står øvst i arket i alle tre stega. Eit raudt tal er heile
   * meldinga «noko ryk her»; kva og kvifor er ei setning, og ei setning
   * høyrer til der det er plass til henne.
   *
   * Og RÅDET fylgjer med ned: tavla i det fulle steget ber kvar rad sin
   * eigen regel med knappen i seg, og uttaka — som er det ein broten regel
   * kan stengje — står i det same steget. Vegen ut av ei blindgate og det
   * ho stengjer, på same skjerm.
   */
  const flagg = useMemo(
    () => (mode === "full" ? utanRad(rules) : []),
    [mode, rules],
  )
  const isHard = (ids: readonly string[]) => ids.some((id) => broken.hard.has(id))
  const isSoft = (ids: readonly string[]) => ids.some((id) => broken.soft.has(id))

  const rows = useMemo(() => tableRows(metrics, rules), [metrics, rules])

  /**
   * Tjukna som står, og den neste i ringen.
   *
   * Skyvaren i det fulle steget er fri, so tjukna treng ikkje vera ei av
   * dei fem. Står ho utanfor — sju millimeter finér, sett med skyvaren
   * eller med ei lenkje — finn `indexOf` ingen ting, og ringen byrjar på
   * den fyrste standardplata i staden for å stå fast. Knappen seier alltid
   * kva som ER sett; det er berre kva som kjem NESTE som rundar av.
   */
  const naaTjukn = num(params, "tjukn", TJUKNER[0])
  const staarPaa = (TJUKNER as readonly number[]).indexOf(naaTjukn)
  const nesteTjukn = TJUKNER[(staarPaa + 1) % TJUKNER.length]

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
        className="pointer-events-auto flex w-full max-w-md flex-col rounded-3xl border sm:max-w-xl"
        style={{
          ...HAIR,
          background: "var(--paper)",
          color: "var(--ink)",
          /**
           * TAKET. INGEN TILSTAND FÅR GÅ OVER DET.
           *
           * Taket låg på rullekassa og ikkje på arket: `max-h-46vh` på
           * kassa pluss grep, hovudline, svarline og fot er sytti prosent
           * av ein telefon, og det fulle steget las 621 px av 844. Eit tak
           * på ein av fire delar er ikkje eit tak.
           *
           * Her ligg det på ARKET, og kassa er den einaste som kan gje
           * etter (`min-h-0` under). Då spelar det inga rolle kor høg
           * foten vert eller kor mange liner hovudet får: summen står.
           *
           * `dvh` og ikkje `vh`: på ein telefon er `vh` ruta slik ho er
           * UTAN adresselina, so eit ark som er målt i `vh` legg seg under
           * henne så snart ho er framme. Kameraet fylgjer med — arket
           * melder høgda si sjølv — og ResizeObserveren rundar til
           * førti-piksels trinn, so ei adresseline som glir opp og ned
           * rammar ikkje scena på nytt for kvar piksel.
           */
          /**
           * Trygdesona tel med. Arket ligg i ein boks med
           * `pb-[calc(env(safe-area-inset-bottom)+12px)]`, og den
           * botnmargen dekkjer ruta like mykje som arket sjølv gjer. På
           * ein iPhone 16e er heimestreken 34 px: eit tak på reine 43dvh
           * ville lese 43 % i nettlesaren og 48 % i handa.
           *
           * Trekk difor frå det same som ligg under, so SUMMEN er taket.
           */
          maxHeight: "calc(43dvh - env(safe-area-inset-bottom) - 12px)",
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
          // Under taket er det RULLEKASSA som gjev etter, aldri hovudet:
          // det er her fingeren tek i arket for å byte steg.
          className="shrink-0"
          style={{ touchAction: "none" }}
        >
          {/*
            GREPET, OG FILNAMNET.

            Namnet stod i hovudlina som ei pille på ein tredel av breidda,
            og på ein telefon vart det «DRAGON_…»: eit namn kappa so kort at
            ikonet ved sida av sa meir enn bokstavane. Her er det plass til
            heile. Lina finst berre når arket er ope, og ho var tom før —
            eit grep på ni pikslar midt i tolv pikslar luft.

            Namnet fyrst, grepet nesten midt på: eit grep som står NØYAKTIG
            i midten kostar like mykje breidd på den tomme sida som namnet
            får på si, og då er vi attende til «DRAGON_…».
          */}
          {open && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-2 px-3 pt-2">
              <button
                type="button"
                onClick={() => pick.current?.click()}
                title={`hent eit nett: ${FORMAT.join(" ")}`}
                className="hit dim -mx-1 min-w-0 truncate rounded px-1 text-left text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--ink)" }}
              >
                {kjelde}
              </button>
              <div
                aria-hidden="true"
                className="h-1 w-9 rounded-full"
                style={{ background: "color-mix(in srgb, var(--ink) 22%, transparent)" }}
              />
              <span />
            </div>
          )}

          {/*
            HOVUDLINA HAR EIN ENKE.

            Kjelda, tre tal, ein prikk og to knappar fekk ikkje plass på ei
            line på ein telefon, og det som datt ned var det SISTE elementet
            — knappen som opnar arket — heilt åleine på ei rad med tre
            hundre pikslar tomrom etter seg. Ei rad for éin knapp.

            No er kjelda eit ikon på storleik med dei andre to knappane
            (namnet står i grepslina over når arket er ope, og objektet
            sjølv seier resten), og dei tre tinga til høgre er EIN blokk.
            Bryt lina på ein smal telefon, bryt heile blokka og legg seg til
            høgre under tala — aldri ein knapp for seg sjølv.
          */}
          <div className="flex flex-wrap items-center gap-1.5 p-2.5">
            {/* Kjelda. Han er ikkje ein nedtrekk med tre demofigurar — han er
                DIN fil, og trykket opnar filveljaren. Kuben står der til
                nokon gjev han noko betre. */}
            <button
              type="button"
              onClick={() => pick.current?.click()}
              title={`${kjelde} — hent eit nett: ${FORMAT.join(" ")}`}
              aria-label={`hent eit nett. no: ${kjelde}`}
              className={ICON_BTN}
              style={{ ...HAIR, color: "var(--ink)" }}
            >
              {IcoImport}
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
              // Tala krympar ikkje og dei kappast ikkje: dei er heile
              // grunnen til at lina finst.
              className="tab shrink-0 pl-1 text-left text-[11px] tracking-[0.06em]"
            >
              {feil ? (
                <span style={{ color: "var(--warn)" }}>{feil}</span>
              ) : melding ? (
                <span className="opacity-70">{melding}</span>
              ) : hentar ? (
                // Tala som står er frå det objektet du hadde FØR. Å la dei
                // stå medan ei ny fil vert tolka er å seie noko om eit
                // objekt som ikkje er der.
                <span className="dim">les fila …</span>
              ) : headline.length === 0 ? (
                <span className="dim">snittar …</span>
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

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {/* prikken har fast plass, så lina står i ro medan motoren reknar */}
              <span
                aria-hidden="true"
                className="block h-[5px] w-[5px] shrink-0 rounded-full"
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
        </div>

        {/*
          KVAR I SVARLISTA VI STOD.

          Her låg ei rad med to piler og «1 av 12 · 10×22 ribber». Ho
          fortalde kor i den rangerte lista du stod, og let deg gå eitt
          steg attende.

          Ho er borte frå telefonen. Rada kosta 32 px av eit ark med eit
          tak på 43 %, og det ho sa er det knappen sjølv gjer: trykk finn
          igjen, og du får det neste svaret. Talet var ei bokføring av
          noko du ikkje kan sjå uansett — kva dei elleve andre er, står
          ikkje der.

          Vegen attende er det som faktisk går tapt her, og ho står att
          på ⇧F og i heile svarlista på benken, som syner ribbetal, delar,
          ark og ledd for kvar kandidat. Ein telefon får det neste; ein
          benk får valet.
        */}

        {/*
          DET UTVIDBARE ARKET, OG HALVOPE ER HALVOPE.

          Arket hadde éi høgd for begge dei opne stega, og ho var sett etter
          det fulle. Halvope tok difor to tredelar av ein telefon, og eit
          ark som tek to tredelar er ikkje eit halvope ark: det er eit ark
          som ligg over objektet. Det halve steget er kortare enn det fulle
          no, og det er innhaldet i det som avgjer kva som får plass der.
        */}
        {open && (
          // `min-h-0`: utan han nektar ei rullekasse å verte lågare enn
          // det ho har i seg, og då er taket på arket eit tak ingen held.
          // Ho veks ikkje av seg sjølv (`flex-grow` er null), so det halve
          // steget er framleis so høgt som innhaldet og ikkje meir.
          <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-1">
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

            {/*
              PLATA, PÅ EI RAD.

              Materialet er ikkje ein farge — han er tettleiken massen vert
              rekna av, og han er det som avgjer om åringane skal teiknast i
              det heile. Han står i det fulle steget: tjukna er eit MÅL som
              set kvart einaste spor, materialet er tettleik og utsjånad, og
              massen han reknar står i tavla, som òg berre finst der.

              TJUKNA ER EIN KNAPP SOM GÅR RUNDT.
              Ho stod som fem brikker — 2 · 2,5 · 3 · 4 · 6 — over heile
              breidda. Fem knappar der fire alltid er feil, og du treffer
              den eine du vil ha på fyrste forsøk uansett kva som står. No
              er det éin knapp som seier kva plate du har og går til den
              neste kvar gong du trykkjer. Fem trykk tek deg heilt rundt;
              skyvaren i det fulle steget står att for dei som har sju
              millimeter finér liggjande.
            */}
            <div className="flex items-center gap-1.5 py-1">
              {mode === "full" &&
                (Object.keys(MATERIALS) as Material[]).map((mk) => (
                  <button
                    key={mk}
                    type="button"
                    aria-pressed={params.material === mk}
                    aria-label={`materiale: ${MATERIALS[mk].label}`}
                    title={MATERIALS[mk].label}
                    onClick={() => onChange({ ...params, material: mk })}
                    className="h-6 w-6 shrink-0 rounded-full border transition active:scale-90"
                    style={{
                      backgroundColor: MATERIALS[mk].hex,
                      borderColor: params.material === mk ? "var(--ink)" : "var(--rule)",
                      boxShadow: params.material === mk ? "0 0 0 1px var(--ink)" : undefined,
                    }}
                  />
                ))}
              <button
                type="button"
                aria-label={`plate: ${tjukn(naaTjukn)} mm. trykk for den neste`}
                title="plata du har liggjande. trykk for den neste"
                onClick={() => onChange({ ...params, tjukn: nesteTjukn })}
                className={CHIP + " tab"}
                style={chipStyle(false)}
              >
                {tjukn(naaTjukn)} mm
              </button>
            </div>

            {/* LESEMÅTANE LIGG PÅ LERRETET NO, ikkje i arket. Dei er eit
                blikk på det ein ser og ikkje eit steg i arbeidet, og på
                benken har dei alltid lege der. Sjå studio.tsx. */}

            {/* Reglane som ryk: éi line kvar, grunngjevinga i title. Panelet
                seier KVA som er gale; KVIFOR ligg eit fingertrykk unna, og
                rettinga står i lina som eit tal du kan trykkje på.

                I det fulle steget står tavla rett under, og der ber kvar
                rad regelen sin sjølv — raud, med rådet i lina. Då er det
                berre dei to reglane utan ei rad å farge som treng stå her:
                klaringa og snittbreidda er skyvarar og ikkje målingar. */}
            {flagg.length > 0 && (
              <ul className="space-y-1 py-1">
                {flagg.map((r) => (
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
                      <span className="tab">{r.value}</span>
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
                    tomme midtfelt og to hundre og seksti piksel.

                    Same tavla som på benken, og kvar rad ber regelen sin:
                    lista over «bryt · delane får plass» stod over henne og
                    sa det same talet ein gong til. */}
                <Tavla
                  rows={rows}
                  busy={busy}
                  params={params}
                  onChange={onChange}
                  className="mt-3"
                />

                {/* Same skyvar to gonger på same skjerm er ikkje to
                    skyvarar: det er ein som ser ut til å ikkje verke når du
                    dreg den andre. Storleiken og tjukna står alt framme. */}
                {VAFFEL.groups.map((g) => (
                  <div key={g.id} className="pt-3">
                    <h3 className="dim pb-0.5 text-[10px] uppercase leading-none tracking-[0.24em]">
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
                  <p className="dim pt-4 text-[10px] leading-relaxed tracking-[0.1em]">
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

          OG UTTAKA STÅR I DET FULLE STEGET.
          Sju uttaksknappar og fargeforklaringa tok hundre og tjue pikslar
          av eit ark som skulle vera ein tredel av ein telefon og var
          halvparten. Uttaket er SLUTTEN av jobben — du slepper ei fil,
          set storleiken, trykkjer finn, ser på det — og det halve steget
          er midten. Fire ikon står att: angre, attende, del, og vegen inn
          i det fulle, som er den einaste knappen her som må stå.
        */}
        {open && (
          <div className="shrink-0 px-3 pb-2">
            {/* uttaka */}
            {mode === "full" && (
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
            )}

            {/*
              KVA FARGANE TYDER, og dei fire ikona, på SAME line.
              Forklaringa er to ord, og ho sparar den einaste feilen som
              kostar ei heil plate: å setje kutteffekt på graveringslaget.
              Svart er fyrste laget i LightBurn, og fyrste laget køyrer
              fyrst, so graveringa MÅ liggje der.

              Ho fylgjer uttaka ned i det fulle steget: ei forklaring på ei
              fil ingen har lasta ned enno er to ord om ingenting, og dei
              to orda stod på ei rad i eit ark som alt var for høgt.
            */}
            <div className="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.14em]">
              {mode === "full" && (
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
              )}
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
