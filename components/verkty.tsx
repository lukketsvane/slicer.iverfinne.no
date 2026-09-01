"use client"

/**
 * VERKTYA.
 *
 * Veggane er det du stiller på og det du les av. Dette er det tredje: det
 * du slår opp i. Ei kuttliste er atten liner med seks tal, ei plate er ei
 * teikning som skal vera stor nok til å lese adressene på, og eit oppsett
 * er ein tekst du vil merke og lime. Ingen av dei får plass i ein vegg på
 * tre hundre piksler, og ingen av dei skal stå framme heile tida.
 *
 * Difor ei skuff over lerretet, mellom veggane, med eitt verkty av gongen.
 * Ho stengjer på Escape og på det same trykket som opna henne, av di ein
 * knapp som berre opnar er ein knapp du må leite etter ein annan for å
 * angre.
 *
 * Ingen av dei tre reknar noko. Kuttlista er planen lesen linje for linje,
 * plata er den same SVG-en uttaket skriv, og oppsettet er parametrane du
 * alt står i. Eit verkty som reknar sitt eige svar er eit verkty som kan
 * seie noko anna enn kuttfila.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from "react"
import type { ArkSyn, Delplass, Kutt, ParamBag, Range } from "@/lib/core"
import { nn } from "@/lib/core"
import { CHIP, TalDrag, chipStyle } from "./deler"

export type VerktyId = "liste" | "ark" | "stabel" | "oppsett"

export const VERKTY: { id: VerktyId; ord: string; hint: string }[] = [
  { id: "liste", ord: "kuttliste", hint: "kvar del, med adresse, mål og plate" },
  { id: "ark", ord: "plater", hint: "kvar plate slik ho ligg" },
  {
    id: "stabel",
    ord: "stabelen",
    hint: "kvar ribbe for seg: kvar ho står, om ho står fast, og om ho skal vera med",
  },
  { id: "oppsett", ord: "oppsett", hint: "alle innstillingane som tekst" },
]

/**
 * EI RIBBE SLIK STABELEN SER HENNE.
 *
 * Ho er ikkje ein del. Ei ribbe kan vera delt i fleire stykke — eit dyr med
 * fire bein gjev ei tverribbe i fire — og alle fire står i det SAME planet.
 * Stabelen redigerer planet, og det er kuttlista som tel stykka.
 */
export type Ribba = {
  /** «X3» — planet, utan bokstaven stykket har */
  adr: string
  akse: "x" | "y"
  /** kvar ho står, mm langs sin eigen akse */
  mm: number
  /** kva ho kan flyttast mellom utan å stå i naboen, mm */
  lo: number
  hi: number
  laast: boolean
  /** kor mange stykke ho vart, og kor mange ledd dei har til saman */
  stykke: number
  ledd: number
}

const HAIR = { borderColor: "var(--rule)" }
const CHIP_B = CHIP.replace("rounded-full", "rounded-[2px]")

/**
 * KOR LENGE EIT TRYKK MÅ VARE FOR Å VERA LANGT. Same terskel som på
 * ribbene i objektet.
 *
 * Klokka som seier det er ein `setTimeout`, og han ser ikkje fingeren. Står
 * hovudtråden stille — objektet teiknar ei ramme med skuggar etter at delen
 * lyste opp, og på ein telefon med eit tungt nett er det ei ramme på fleire
 * hundre millisekund — ligg rørslene fingeren har gjort i kø bak henne. Når
 * tråden slepp, kjem klokka fyrst, og so rørslene: verktyet opnar seg over
 * ein del som er halvvegs dregen. Målt i ein nettlesar utan skjermkort: den
 * fyrste rørsla vart lesen 556 ms etter trykket, og ho var gjord etter 35.
 *
 * Hendingane ber si eiga klokke, og ho stod ikkje stille. Ei rørsle eller
 * eit slepp som HENDE før terskelen, og likevel kom fram etter at det lange
 * trykket hadde fyrt, seier at det lange trykket var ei feillesing: då vert
 * det teke attende, og trykket er eit drag eller eit trykk att.
 */
const LANGT_MS = 450
const feillese = (t: { tid: number; brukt: boolean; lang: boolean }, no: number) => {
  if (!t.lang || no - t.tid >= LANGT_MS) return false
  t.lang = false
  t.brukt = false
  return true
}

// =============================================================================
// KUTTLISTA
// =============================================================================
type Kolonne = {
  id: string
  ord: string
  /** tal står høgre, ord står venstre */
  tal?: boolean
  les: (k: Kutt) => string
  /** kva han vert sortert på */
  sorter: (k: Kutt) => number | string
  /**
   * FELL BORT PÅ EIN TELEFON.
   *
   * Sju kolonnar er ein tabell for ein skjerm. På 390 px braut «74,5 ×
   * 129,8» over to liner i kvar einaste rad, og tjue rader vart tjue
   * doble.
   *
   * Fire står att, og det er dei fire du treng med lista i handa ved
   * maskina: kva delen heiter, kor stor han er, om han heng i noko, og kva
   * plate han ligg på. Forma, arealet og kuttlengda er analyse — dei
   * svarar på kor mange oppspenningar og kor lang tid, og det er
   * spørsmål du stiller på ein benk.
   */
  smal?: boolean
}

const KOLONNAR: Kolonne[] = [
  { id: "adr", ord: "adresse", les: (k) => k.adr, sorter: (k) => k.adr },
  { id: "id", ord: "form", les: (k) => k.id, sorter: (k) => k.id, smal: true },
  {
    id: "mal",
    ord: "mål mm",
    tal: true,
    les: (k) => `${nn(k.w, 1)} × ${nn(k.h, 1)}`,
    sorter: (k) => Math.max(k.w, k.h),
  },
  {
    id: "flate",
    ord: "cm²",
    tal: true,
    les: (k) => nn(k.area / 100, 1),
    sorter: (k) => k.area,
    smal: true,
  },
  {
    id: "kutt",
    ord: "kutt mm",
    tal: true,
    les: (k) => nn(k.cutLen, 0),
    sorter: (k) => k.cutLen,
    smal: true,
  },
  { id: "ledd", ord: "ledd", tal: true, les: (k) => nn(k.joints, 0), sorter: (k) => k.joints },
  {
    id: "ark",
    ord: "plate",
    tal: true,
    les: (k) => (k.ark ? nn(k.ark, 0) : "–"),
    sorter: (k) => k.ark,
  },
]

/** Semikolon og ikkje komma: tala er norske og har komma i seg. */
const csv = (liste: readonly Kutt[]) =>
  [
    "adresse;form;breidd;hogd;flate_cm2;kutt_mm;ledd;plate",
    ...liste.map((k) =>
      [
        k.adr,
        k.id,
        nn(k.w, 2),
        nn(k.h, 2),
        nn(k.area / 100, 2),
        nn(k.cutLen, 1),
        String(k.joints),
        k.ark ? String(k.ark) : "",
      ].join(";"),
    ),
  ].join("\n")

function Kuttliste(props: {
  liste: readonly Kutt[]
  /** adressene til ribbene som står fast — «X1», «Y3». Sjå `mine`. */
  laaste: ReadonlySet<string>
  peikt: string | null
  onPeik: (adr: string | null) => void
  onOrd: (s: string) => void
}) {
  const { liste, laaste, peikt, onPeik, onOrd } = props
  const [sortert, setSortert] = useState<{ id: string; ned: boolean }>({ id: "adr", ned: false })
  /**
   * DINE, ELLER ALLE.
   *
   * Ei kuttliste er heile jobben, og heile jobben er tjue rader. Medan du
   * BYGGJER er det ikkje tjue du held på med — det er dei seks du har låst,
   * kopiert eller flytt, og dei ligg spreidde mellom fjorten du ikkje har
   * teke i.
   *
   * So har du låst noko, står dine fyrst. Ikkje som ei gøymsle: brikka
   * seier «6 av 20», og talet i hovudlina er framleis heile jobben. Har du
   * ikkje låst noko, er det ingen ting å skilje ut, og då står alle — eit
   * filter som gjev ei tom liste er eit filter som har teke frå deg lista.
   *
   * `null` er den regelen; eit trykk er ditt eige val, og det står.
   */
  const [valt, setValt] = useState<boolean | null>(null)
  const mine = valt ?? laaste.size > 0
  /** kva rad høyrer til ei låst ribbe? «X1a» høyrer til «X1». */
  const ribba = (adr: string) => /^[XY]\d+/.exec(adr)?.[0] ?? adr
  const synt = useMemo(
    () => (mine ? liste.filter((k) => laaste.has(ribba(k.adr))) : liste),
    [liste, laaste, mine],
  )
  /** Ein del du trykte på i objektet kan stå kvar som helst i lista — og
   *  ei line du ikkje ser er ikkje eit svar. */
  const peiktRad = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    peiktRad.current?.scrollIntoView({ block: "nearest" })
  }, [peikt])

  const rader = useMemo(() => {
    const k = KOLONNAR.find((q) => q.id === sortert.id) ?? KOLONNAR[0]
    const ut = [...synt].sort((a, b) => {
      const x = k.sorter(a)
      const y = k.sorter(b)
      // Adresser er «X10» og «X9», og då er det talet i dei som gjeld.
      const d =
        typeof x === "string" && typeof y === "string"
          ? x.localeCompare(y, "nn", { numeric: true })
          : Number(x) - Number(y)
      return sortert.ned ? -d : d
    })
    return ut
  }, [synt, sortert])

  /** kor mange gonger kvar form går att — det er oppspenningane */
  const former = useMemo(() => {
    const m = new Map<string, number>()
    for (const k of liste) m.set(k.id, (m.get(k.id) ?? 0) + 1)
    return m
  }, [liste])

  if (!liste.length) {
    return <p className="dim p-4 text-[11px]">ingen delar å skjere.</p>
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="mono w-full border-collapse text-[11px]">
          <thead className="sticky top-0" style={{ background: "var(--paper)" }}>
            <tr>
              {KOLONNAR.map((k) => (
                <th
                  key={k.id}
                  scope="col"
                  className={
                    "border-b px-2 py-1.5 text-[10px] font-normal uppercase tracking-[0.1em] " +
                    (k.tal ? "text-right " : "text-left ") +
                    (k.smal ? "hidden sm:table-cell" : "")
                  }
                  style={HAIR}
                >
                  <button
                    type="button"
                    className="hit dim px-1 py-0.5"
                    style={{ opacity: sortert.id === k.id ? 1 : undefined }}
                    onClick={() =>
                      setSortert((s) => ({ id: k.id, ned: s.id === k.id ? !s.ned : false }))
                    }
                    title={`sorter på ${k.ord}`}
                  >
                    {k.ord}
                    {sortert.id === k.id ? (sortert.ned ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rader.map((k, i) => (
              <tr
                key={k.adr + i}
                ref={peikt === k.adr ? peiktRad : undefined}
                onMouseEnter={() => onPeik(k.adr)}
                onMouseLeave={() => onPeik(null)}
                style={{
                  background:
                    peikt === k.adr
                      ? "color-mix(in srgb, var(--ink) 8%, transparent)"
                      : undefined,
                }}
              >
                {KOLONNAR.map((q) => (
                  <td
                    key={q.id}
                    className={
                      "px-2 py-[3px] " +
                      (q.tal ? "text-right " : "text-left ") +
                      (q.smal ? "hidden sm:table-cell" : "")
                    }
                    style={{
                      // Ein del utan ledd heng ikkje i noko. Det er den eine
                      // opplysninga i denne tabellen som er ei åtvaring.
                      color: q.id === "ledd" && k.joints === 0 ? "var(--warn)" : undefined,
                    }}
                  >
                    {q.id === "id" ? (
                      <span title={`${former.get(k.id) ?? 1} delar har denne forma`}>
                        {k.id}
                        <span className="dim">
                          {(former.get(k.id) ?? 1) > 1 ? `·${former.get(k.id)}` : ""}
                        </span>
                      </span>
                    ) : (
                      q.les(k)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* SUMMEN STOD ALT I VEGGEN.
          Foten las «12 delar · 2 former · 17,9 m kutt». «12 delar» og
          «17,9 m kutt» står ordrett i høgre vegg, som ikkje kan lukkast og
          som er open på den same skjermen; «2 former» er det andre talet i
          tavla si rad «delar · unike». Tre tal, alle tre ein gong til, ein
          halv skjerm frå originalen. Att står vegen ut av lista. */}
      <div className="flex items-center gap-3 border-t px-3 py-2 text-[10px]" style={HAIR}>
        {/* Brikka står berre når det finst noko å skilje ut, og ho seier
            forholdet. Eit filter som ikkje seier kor mykje det tok bort er
            ei liste som lyg om kor stor jobben er. */}
        {laaste.size > 0 && (
          <button
            type="button"
            className={CHIP_B + " uppercase tracking-[0.1em]"}
            style={chipStyle(mine)}
            aria-pressed={mine}
            onClick={() => setValt(!mine)}
            title={
              mine
                ? "syn alle delane, òg dei du ikkje har teke i"
                : "syn berre dei ribbene du har låst, kopiert eller flytt"
            }
          >
            mine {rader.length} av {liste.length}
          </button>
        )}
        <button
          type="button"
          className={CHIP_B + " ml-auto uppercase tracking-[0.1em]"}
          style={chipStyle(false)}
          onClick={() => onOrd(csv(rader))}
          title="det du ser på utklippstavla, med semikolon mellom felta"
        >
          kopier csv
        </button>
      </div>
    </>
  )
}

// =============================================================================
// PLATENE
// =============================================================================
/**
 * PLATA ER IKKJE EIT BILETE LENGER.
 *
 * Ho var ein `<img>` med heile arket bakt inn i seg som ein SVG-streng. Eit
 * bilete er nøyaktig like mykje verdt som fila det er teikna av: du ser at
 * ein del ligg feil, og du kan ikkje ta i han. Ingen av dei tinga nokon vil
 * gjere med ein einskild del — peike på han, fylgje han til objektet, låse
 * han, dra han — kan gjerast inni ein `<img>`.
 *
 * No er kvar del sitt eige element med adressa si på seg. Banene er DEI
 * SAME som fila skriv, med den same snittkompensasjonen, i dei same
 * koordinatane; `translate(0,H) scale(1,-1)` er den same snuinga
 * `sheetSvg` gjer, av di geometrien står med y opp og SVG med y ned.
 *
 * ADRESSA BIND DEI TRE SAMAN. Objektet, kuttlista og plata kjenner alle
 * den same delen som «X3a», so peikaren over ei rad lyser opp ribba i
 * modellen OG delen på plata, kvar veg du kjem frå.
 */
function Plater(props: {
  ark: ArkSyn | null
  onArk: (i: number) => void
  peikt: string | null
  /** adressene til delane som står fast — dei er teikna med fyll, so du
   *  ser kva du eig og kva pakkinga eig */
  festa: ReadonlySet<string>
  onPeik: (adr: string | null) => void
  onLangtrykk: (adr: string, x: number, y: number) => void
  /** det lange trykket var ei feillesing — sjå `LANGT_MS` — og verktyet
   *  det opna skal att */
  onAvbryt: () => void
  /** eit drag er over: delen skal stå fast HER, i millimeter på plata */
  onFlytt: (adr: string, plass: Delplass["plass"]) => void
}) {
  const { ark, onArk, peikt, festa, onPeik, onLangtrykk, onAvbryt, onFlytt } = props
  /**
   * TRE TING EIN FINGER KAN GJERE MED EIN DEL, OG DEI SKIL SEG PÅ TID OG
   * VEG.
   *
   *   eit trykk        peikar på han — lyser han opp her og i objektet
   *   eit trykk som    opnar verktyet over han: fest, slepp, snu. Same
   *   VARER            handa som på ribbene i objektet, same terskelen.
   *   eit drag         FLYTTAR han. Han fylgjer fingeren i millimeter på
   *                    plata, og der du slepper han, står han fast: eit
   *                    feste er nøyaktig det pakkinga gjev frå seg som
   *                    plassering, so det som vert skrive er hjørnet han
   *                    stod i pluss det fingeren gjekk.
   *
   * Seks pikslar skil trykket frå draget, som elles i reiskapen; det lange
   * trykket ryk i det fingeren går. Peikaren vert TEKEN av delen i det han
   * går ned (`setPointerCapture`), so draget held fram om fingeren glid
   * utanfor han — ein finger dekkjer ein del på 40 mm på ein telefon, og
   * han er sjeldan der du trur.
   */
  const trykk = useRef<{
    adr: string
    x: number
    y: number
    /** når fingeren gjekk ned, på hendinga si eiga klokke */
    tid: number
    plass: Delplass["plass"]
    boks: Delplass["boks"]
    /** trykket er brukt opp — av det lange, eller av eit drag */
    brukt: boolean
    /** og det var det lange som brukte det */
    lang: boolean
  } | null>(null)
  const langt = useRef(0)
  /**
   * SPØKELSET.
   *
   * Under draget vert delen teikna der fingeren har han, og ikkje der
   * pakkinga har han. Slepper du, står han att der du sleppte han — òg dei
   * par hundre millisekunda det tek før motoren har pakka om og plata kjem
   * attende med han på den nye staden. Utan det spratt han attende til den
   * gamle staden og so fram til den nye, og eit sprett er det same som
   * «det tok ikkje».
   *
   * Han vert rydda når ei ny plate kjem, ikkje på ei klokke: det er plata
   * som veit når ho har teke han att.
   */
  const [dra, setDra] = useState<{ adr: string; dx: number; dy: number } | null>(null)
  const draRef = useRef(dra)
  const flata = useRef<SVGGElement | null>(null)
  useEffect(() => {
    draRef.current = null
    setDra(null)
  }, [ark])

  /** frå skjermpikslar til millimeter på plata, y opp — gjennom den same
   *  spegelen teikninga sjølv ligg i, so tala er dei plata reknar i */
  const mm = (cx: number, cy: number): [number, number] | null => {
    const ctm = flata.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }

  if (!ark || !ark.tal) {
    return <p className="dim p-4 text-[11px]">ingenting er lagt ut på ei plate enno.</p>
  }
  const faste = ark.plasser.filter((d) => festa.has(d.adr)).length
  const kryss = ark.plasser.filter((d) => d.kross).length
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2" style={HAIR}>
        {Array.from({ length: ark.tal }, (_, i) => (
          <button
            key={i}
            type="button"
            className={CHIP_B + " mono min-h-[26px] px-2.5"}
            style={chipStyle(i === ark.i)}
            onClick={() => onArk(i)}
            title={`plate ${i + 1} av ${ark.tal}`}
          >
            {i + 1}
          </button>
        ))}
        <span className="dim mono ml-auto text-[10px]">
          {ark.delar} delar · {nn(ark.util * 100, 0)} % utnytting
          {faste > 0 && ` · ${faste} faste`}
        </span>
        {/* Det eine plata kan seie som regelen òg seier: to festa delar
            handa har sett i kvarandre. Her står det ved sida av delane
            det gjeld, som er raude. */}
        {kryss > 0 && (
          <span className="mono text-[10px]" style={{ color: "var(--warn)" }}>
            {kryss} i kvarandre
          </span>
        )}
        {/* Gestane syner seg ikkje sjølve. Lina står til du har festa
            noko — då har du funne dei. */}
        {festa.size === 0 && (
          <span className="dim basis-full text-[10px] tracking-[0.04em]">
            dra ein del for å flytte han · hald for å feste og snu
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 p-3">
        <svg
          viewBox={`0 0 ${ark.arkB} ${ark.arkH}`}
          className="h-full w-full"
          role="img"
          aria-label={`plate ${ark.i + 1} av ${ark.tal}, ${ark.delar} delar`}
          onPointerLeave={() => onPeik(null)}
          // Fingeren på ein del skal dra DELEN og ikkje sida. Utan denne
          // tek iOS draget som ei rulling og sender `pointercancel` etter
          // nokre pikslar.
          style={{ touchAction: "none" }}
        >
          {/* plata sjølv: ei ramme, so du ser kor kanten går */}
          <rect
            x={0}
            y={0}
            width={ark.arkB}
            height={ark.arkH}
            vectorEffect="non-scaling-stroke"
            style={{ fill: "none", stroke: "var(--rule)" }}
          />
          <g ref={flata} transform={`translate(0,${ark.arkH}) scale(1,-1)`}>
            {ark.plasser.map((d) => {
              const paa = peikt === d.adr
              const fast = festa.has(d.adr)
              const q = dra?.adr === d.adr ? dra : null
              return (
                <g
                  key={d.adr}
                  transform={q ? `translate(${q.dx} ${q.dy})` : undefined}
                  onPointerEnter={() => onPeik(d.adr)}
                  onPointerDown={(e) => {
                    // ein andre finger er ikkje eit trykk på ein del
                    if (!e.isPrimary) return
                    const x = e.clientX
                    const y = e.clientY
                    trykk.current = {
                      adr: d.adr, x, y, tid: e.timeStamp,
                      plass: d.plass, boks: d.boks, brukt: false, lang: false,
                    }
                    e.currentTarget.setPointerCapture(e.pointerId)
                    window.clearTimeout(langt.current)
                    langt.current = window.setTimeout(() => {
                      const t = trykk.current
                      if (!t || t.brukt || t.adr !== d.adr) return
                      // Trykket er brukt opp: korkje `onClick` eller
                      // draget skal òg fyre.
                      t.brukt = true
                      t.lang = true
                      onLangtrykk(d.adr, x, y)
                    }, LANGT_MS)
                  }}
                  onPointerMove={(e) => {
                    const t = trykk.current
                    if (!t) return
                    if (feillese(t, e.timeStamp)) onAvbryt()
                    if (t.brukt) return
                    if (!draRef.current && Math.hypot(e.clientX - t.x, e.clientY - t.y) <= 6) return
                    window.clearTimeout(langt.current)
                    const a = mm(t.x, t.y)
                    const b = mm(e.clientX, e.clientY)
                    if (!a || !b) return
                    const ny = { adr: t.adr, dx: b[0] - a[0], dy: b[1] - a[1] }
                    draRef.current = ny
                    setDra(ny)
                  }}
                  onPointerUp={(e) => {
                    window.clearTimeout(langt.current)
                    const t = trykk.current
                    const q2 = draRef.current
                    if (t && feillese(t, e.timeStamp)) onAvbryt()
                    if (!t || t.brukt || !q2) return
                    t.brukt = true
                    /**
                     * INNANFOR PLATA. Pakkinga klemmer eit feste inn på
                     * plata sjølv, men ho gjer det i celler, og eit feste
                     * som står skrive langt utanfor er eit tal som lyg om
                     * kvar delen er. Masken er boksen pluss margen kring
                     * han — margen er avstanden frå hjørnet pakkinga gav
                     * til boksen ho teikna — so kanten er der masken
                     * stoggar, ikkje der omrisset gjer det.
                     */
                    const marg = Math.max(0, t.boks.x - t.plass.x)
                    const W = t.boks.w + 2 * marg
                    const H = t.boks.h + 2 * marg
                    const klem = (v: number, tak: number) => Math.min(Math.max(0, v), Math.max(0, tak))
                    onFlytt(t.adr, {
                      sheet: ark.i,
                      rot: t.plass.rot,
                      x: klem(t.plass.x + q2.dx, ark.arkB - W),
                      y: klem(t.plass.y + q2.dy, ark.arkH - H),
                    })
                  }}
                  onPointerCancel={() => {
                    window.clearTimeout(langt.current)
                    trykk.current = null
                    draRef.current = null
                    setDra(null)
                  }}
                  onClick={() => {
                    const t = trykk.current
                    trykk.current = null
                    if (!t || t.brukt) return
                    onPeik(paa ? null : d.adr)
                  }}
                  style={{ cursor: q ? "grabbing" : "grab" }}
                >
                  {/* Fyllet er treffeflata. Ein del er eit omriss med hòl i,
                      og eit omriss er nokre få pikslar strek: peikaren måtte
                      treffe sjølve streken for at noko skulle skje. Med
                      `evenodd` er hòla hòl i treffeflata òg — du kan peike
                      gjennom eit spor på delen under.

                      Og fyllet er MERKET: ein festa del er skuggelagd, so
                      du ser kva som er ditt og kva som er pakkinga sitt. */}
                  <path
                    d={[d.ut, ...d.inn].join(" ")}
                    fillRule="evenodd"
                    style={{
                      fill: paa
                        ? "color-mix(in srgb, var(--ink) 14%, transparent)"
                        : fast
                          ? "color-mix(in srgb, var(--ink) 9%, transparent)"
                          : "transparent",
                    }}
                  />
                  <path
                    d={d.ut}
                    strokeWidth={paa || q ? 2 : 1}
                    vectorEffect="non-scaling-stroke"
                    style={{ fill: "none", stroke: d.kross ? "var(--warn)" : "var(--ink)" }}
                  />
                  {d.inn.map((h, j) => (
                    <path
                      key={j}
                      d={h}
                      strokeWidth={paa || q ? 2 : 1}
                      vectorEffect="non-scaling-stroke"
                      style={{ fill: "none", stroke: d.kross ? "var(--warn)" : "var(--ink)" }}
                    />
                  ))}
                  <title>
                    {d.adr}
                    {fast ? " · fast" : ""}
                    {d.kross ? " · ligg i ein annan" : ""}
                  </title>
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </>
  )
}

// =============================================================================
// STABELEN
// =============================================================================
/**
 * KVAR RIBBE FOR SEG.
 *
 * Ribbene var eit TAL. Skyvaren sa seks, og seks jamt fordelte plan kom ut
 * — det er eit godt utgangspunkt og det er ikkje eit verkty. Du kunne ikkje
 * flytte ei ribbe til der leddet skulle sitje, ikkje ta bort den eine som
 * skar gjennom auget, ikkje setje to tett i hop der godset var tynt.
 *
 * Så vart dei ei LISTE, og eit langt trykk på ei ribbe i objektet gav deg
 * fire ting å gjere med henne. Det var eitt steg og halvparten av eit
 * verkty: du såg éi ribbe om gongen, og du måtte finne henne i modellen
 * fyrst. Ein stabel er ikkje noko du ser éi ribbe om gongen.
 *
 * Her står han heil. Kvar rad er eitt plan, med talet som seier kvar det
 * står — eit tal du kan dra i og skrive i — og handlingane ved sida av.
 *
 * LÅSEN ER PREMISSET FOR HEILE TABELLEN. Ein fri ribbe har ingen eigen
 * plass: han er «den fjerde av seks jamne», og den plassen er ei rekning på
 * talet. Difor låser kvar einaste redigering heile stabelen fyrst, og
 * difor er «lås alle» steget frå eit rutenett reiskapen fann til ein stabel
 * du eig. Etterpå legg skyvaren til nye ribber i staden for å skuve dei du
 * har.
 */
function Stabelen(props: {
  ribber: readonly Ribba[]
  peikt: string | null
  onPeik: (adr: string | null) => void
  onFlytt: (adr: string, mm: number) => void
  onLaas: (adr: string) => void
  onKopier: (adr: string) => void
  onSpegl: (adr: string) => void
  onSlett: (adr: string) => void
  onAkse: (akse: "x" | "y", paa: boolean) => void
}) {
  const { ribber, peikt, onPeik, onFlytt, onLaas, onKopier, onSpegl, onSlett, onAkse } = props
  if (!ribber.length) {
    return <p className="dim p-4 text-[11px]">ingen ribber råka kroppen.</p>
  }
  return (
    <div
      /* To kolonnar er to aksar ved sida av kvarandre, og det krev ei
         breidd. Ei rad her er ei adresse, eit talfelt, ei eining, to tal
         og fire knappar; delt i to på ein telefon er kvar av dei under to
         hundre pikslar, og då er rada broten før nokon har sett henne.
         Under 640 px står aksane difor over kvarandre. */
      className="grid min-h-0 flex-1 grid-cols-1 gap-px sm:grid-cols-2"
      style={{ background: "var(--rule)" }}
    >
      {(["x", "y"] as const).map((akse) => {
        const mine = ribber.filter((r) => r.akse === akse)
        const alleLaaste = mine.length > 0 && mine.every((r) => r.laast)
        return (
          <div key={akse} className="flex min-h-0 flex-col" style={{ background: "var(--paper)" }}>
            <div
              className="flex items-center gap-1.5 border-b px-3 py-2 text-[10px] uppercase tracking-[0.14em]"
              style={HAIR}
            >
              <span className="mono">langs {akse}</span>
              <span className="dim mono">{mine.length}</span>
              {/* Éin knapp og ikkje to. «Lås alle» og «slepp alle» er den
                  same brytaren sedd frå kvar si side, og ein stabel utan
                  låsar ER den jamne fordelinga — «fordel jamt» ville vore
                  eit tredje namn på det same. */}
              <button
                type="button"
                className={CHIP_B + " ml-auto uppercase tracking-[0.1em]"}
                style={chipStyle(alleLaaste)}
                onClick={() => onAkse(akse, !alleLaaste)}
                title={
                  alleLaaste
                    ? "slepp alle: ribbene fordeler seg jamt att, og skyvaren rår over dei"
                    : "lås alle der dei står: skyvaren legg til nye i staden for å skuve desse"
                }
              >
                {alleLaaste ? "slepp alle" : "lås alle"}
              </button>
            </div>
            {/* «1·6» utan overskrift er to tal ingen kan lese. Dei står her
                av di dei er den eine åtvaringa ein stabel kan gje: eit plan
                som vart fire øyer utan eit einaste ledd er fire lause
                plater i eska, og det ser du ikkje på modellen. */}
            <div className="dim flex items-center gap-1 px-2 pt-1 text-[9px] uppercase tracking-[0.14em]">
              <span className="w-8 shrink-0" />
              <span className="w-[62px] shrink-0 text-right">stad mm</span>
              <span className="ml-auto shrink-0 pr-1">stykke·ledd</span>
            </div>
            <div className="rull min-h-0 flex-1">
              {mine.map((r) => {
                const paa = peikt !== null && peikt.startsWith(r.adr)
                return (
                  <div
                    key={r.adr}
                    className="mono flex items-center gap-1 px-2 py-[3px] text-[11px]"
                    onPointerEnter={() => onPeik(r.adr)}
                    style={{
                      background: paa
                        ? "color-mix(in srgb, var(--ink) 8%, transparent)"
                        : undefined,
                    }}
                  >
                    <span className="dim w-8 shrink-0">{r.adr}</span>
                    {/* Bandet er NABOANE. Feltet stoggar der ribba stoggar,
                        so eit drag mot naboen fortel kvar han står i staden
                        for å la deg køyre forbi han og få talet klemt
                        attende av motoren etterpå. */}
                    <TalDrag
                      verdi={r.mm}
                      r={{ min: r.lo, max: r.hi, step: 0.5, label: "stad", unit: "mm" }}
                      etikett={`${r.adr}, stad`}
                      className="talfelt w-[62px] shrink-0 rounded-[2px] bg-transparent text-right"
                      style={{ color: "var(--ink)" }}
                      onSet={(v) => onFlytt(r.adr, v)}
                    />
                    <span className="dim shrink-0 text-[9px]">mm</span>
                    {/* Stykke og ledd er dei to tala som seier om planet
                        gjer noko: eit plan som vart fire øyer utan eit
                        einaste ledd er fire lause plater i eska. */}
                    <span
                      className="dim ml-auto shrink-0 pr-1 text-[9px]"
                      title={`${r.stykke} stykke, ${r.ledd} ledd`}
                      style={{ color: r.ledd === 0 ? "var(--warn)" : undefined }}
                    >
                      {r.stykke}·{r.ledd}
                    </span>
                    {[
                      {
                        ord: "lås",
                        paa: r.laast,
                        gjer: () => onLaas(r.adr),
                        kva: r.laast
                          ? "slepp ribba fri: ho fordeler seg med dei andre att"
                          : "lås ribba her: ho står stille når du dreg ribbeskyvaren",
                      },
                      {
                        ord: "+",
                        paa: false,
                        gjer: () => onKopier(r.adr),
                        kva: "ei ribbe til, midt imellom denne og naboen. Begge vert låste.",
                      },
                      {
                        ord: "⇄",
                        paa: false,
                        gjer: () => onSpegl(r.adr),
                        kva: "den same ribba på hi sida av midten",
                      },
                      {
                        ord: "×",
                        paa: false,
                        gjer: () => onSlett(r.adr),
                        kva: "denne ribba vekk. Dei andre vert låste der dei står.",
                      },
                    ].map((v) => (
                      <button
                        key={v.ord}
                        type="button"
                        className="hit shrink-0 rounded-[2px] border px-1.5 text-[10px] leading-[18px] transition active:scale-95"
                        style={chipStyle(v.paa)}
                        title={v.kva}
                        aria-label={`${r.adr}: ${v.ord}`}
                        onClick={v.gjer}
                      >
                        {v.ord}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// =============================================================================
// OPPSETTET
// =============================================================================
/**
 * ALLE INNSTILLINGANE, SOM TEKST.
 *
 * Ein skyvar er god til å leite og dårleg til å treffe, og eit talfelt tek
 * eitt tal om gongen. Dette tek dei alle: merk, kopier, lim inn i ei
 * melding, få dei attende, lim dei inn her. Det er den same lenkja
 * URL-en ber, berre lesbar.
 *
 * Ingenting vert sett før du trykkjer. Klemminga er motoren si eiga, so
 * eit tal utanfor bandet vert dregen inn i det i staden for å avvisast —
 * og lina under seier kva som vart flytta.
 */
function Oppsett(props: {
  params: ParamBag
  ranges: Record<string, Range>
  keys: readonly string[]
  clamp: (o: unknown, prev: ParamBag) => ParamBag
  onChange: (p: ParamBag) => void
}) {
  const { params, ranges, keys, clamp, onChange } = props
  const skriv = (p: ParamBag) =>
    keys
      .map((k) => {
        const r = ranges[k]
        const v = p[k]
        const tal = typeof v === "number" ? String(+v.toFixed(4)) : String(v ?? "")
        return `${k.padEnd(10)} ${tal}${r?.unit ? `  ${r.unit}` : ""}`
      })
      .join("\n")

  const [tekst, setTekst] = useState(() => skriv(params))
  const [ord, setOrd] = useState("")
  /** teksten fylgjer parametrane so lenge du ikkje har rørt han */
  const rørt = useRef(false)
  useEffect(() => {
    if (!rørt.current) setTekst(skriv(params))
    // skriv er rein av parametrane inn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const set = () => {
    const inn: Record<string, number> = {}
    const ukjend: string[] = []
    for (const line of tekst.split("\n")) {
      const m = line.trim().match(/^([a-zA-ZæøåÆØÅ]+)\s*[=:]?\s*(-?[\d.,]+)/)
      if (!m) continue
      if (!keys.includes(m[1])) {
        ukjend.push(m[1])
        continue
      }
      inn[m[1]] = Number(m[2].replace(",", "."))
    }
    const ut = clamp(inn, params)
    const flytta = Object.keys(inn).filter(
      (k) => Math.abs((ut[k] as number) - inn[k]) > 1e-9,
    )
    onChange(ut)
    rørt.current = false
    setOrd(
      [
        `${Object.keys(inn).length} sett`,
        flytta.length ? `${flytta.length} klemt inn i bandet: ${flytta.join(", ")}` : "",
        ukjend.length ? `ukjend: ${ukjend.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    )
  }

  return (
    <>
      <textarea
        className="mono min-h-0 flex-1 resize-none bg-transparent p-3 text-[12px] leading-relaxed outline-none"
        spellCheck={false}
        value={tekst}
        aria-label="alle innstillingane som tekst"
        onChange={(e) => {
          rørt.current = true
          setTekst(e.target.value)
        }}
      />
      <div className="flex items-center gap-3 border-t px-3 py-2 text-[10px]" style={HAIR}>
        {/* Berre meldinga om kva som vart sett. Det stod «eitt namn og eitt
            tal per line» her til nokon trykte — ei skildring av forma på
            kvar einaste line i feltet rett over, som alt står skriven ut. */}
        <span className="dim mono min-w-0 flex-1 truncate">{ord}</span>
        <button
          type="button"
          className={CHIP_B + " uppercase tracking-[0.1em]"}
          style={chipStyle(false)}
          onClick={() => {
            rørt.current = false
            setTekst(skriv(params))
            setOrd("")
          }}
        >
          attende
        </button>
        <button
          type="button"
          className={CHIP_B + " uppercase tracking-[0.1em]"}
          style={chipStyle(true)}
          onClick={set}
        >
          set
        </button>
      </div>
    </>
  )
}

// =============================================================================
// SKUFFA
// =============================================================================
export function Verkty(props: {
  open: VerktyId | null
  liste: readonly Kutt[]
  ark: ArkSyn | null
  params: ParamBag
  ranges: Record<string, Range>
  keys: readonly string[]
  clamp: (o: unknown, prev: ParamBag) => ParamBag
  peikt: string | null
  ribber: readonly Ribba[]
  rute: { venstre: number; hogre: number; høgd: number; botn?: number; fast?: boolean }
  /** kor høg skuffa faktisk vart, i pikslar. Kameraet rammar objektet inn i
   *  det som er att — same mekanismen kontrollarket alt bruker. */
  onHogd?: (px: number) => void
  onArk: (i: number) => void
  onPeik: (adr: string | null) => void
  /** delane som står fast på plata, etter adresse */
  festa: ReadonlySet<string>
  onLangtrykk: (adr: string, x: number, y: number) => void
  /** eit langt trykk på plata som viste seg å vera eit drag: lat verktyet att */
  onAvbryt: () => void
  /** ein del er dregen til ein ny stad på plata, og skal stå fast der */
  onFlyttDel: (adr: string, plass: Delplass["plass"]) => void
  /** byt kva verkty som står ope — topplina i skuffa, på ein telefon */
  onBytt: (id: VerktyId) => void
  onChange: (p: ParamBag) => void
  onFlytt: (adr: string, mm: number) => void
  onLaas: (adr: string) => void
  onKopier: (adr: string) => void
  onSpegl: (adr: string) => void
  onSlett: (adr: string) => void
  onAkse: (akse: "x" | "y", paa: boolean) => void
  onClose: () => void
  onOrd: (s: string) => void
}): JSX.Element | null {
  const { open, rute } = props
  /**
   * SKUFFA ER SÅ HØG SOM INNHALDET, IKKJE SÅ HØG SOM HO FÅR LOV TIL.
   *
   * Ho hadde ei fast høgd, og på ein telefon var den høgda heile sida. Ei
   * kuttliste med tre rader i stod difor med tre rader og tusen pikslar
   * kvitt papir under seg, over eit objekt som var pressa opp i eit band
   * det ikkje trong.
   *
   * No måler ho seg sjølv og seier frå, og kameraet rammar inn i det som
   * er att — nøyaktig det kontrollarket har gjort heile tida. Grovkorna av
   * den same grunnen som der: kvart tal herifrå er ei full innramming, og
   * ei liste som veks med ei rad skal ikkje rykke kameraet.
   *
   * PLATA ER UNNATEKEN. Ho er ei TEIKNING som fyller det ho får, so ei
   * høgd som fylgjer innhaldet og eit innhald som fylgjer høgda er ei
   * likning utan svar. Ho får den faste høgda si.
   */
  const boks = useRef<HTMLElement | null>(null)
  const { onHogd } = props
  useEffect(() => {
    const el = boks.current
    if (!el || !onHogd) return
    const meld = () => onHogd(Math.round(el.getBoundingClientRect().height / 40) * 40)
    const ro = new ResizeObserver(meld)
    ro.observe(el)
    meld()
    return () => ro.disconnect()
  }, [onHogd, open])
  /** kva ribber som står fast — utleidd av stabelen, so kuttlista og
   *  stabelen kan aldri vera usamde om kva som er låst */
  const laaste = useMemo(
    () => new Set(props.ribber.filter((r) => r.laast).map((r) => r.adr)),
    [props.ribber],
  )
  if (!open) return null
  return (
    <section
      ref={boks}
      aria-label="verkty"
      className="benk fixed z-20 flex flex-col border-l border-r border-t"
      /**
       * NEDST, OG IKKJE OVER HEILE LERRETET.
       *
       * Ei liste som peikar på eit stykke i objektet er verdlaus om ho
       * ligg oppå objektet. Skuffa tek nedre halvdel, og kameraet rammar
       * inn i det som er att — den same mekanismen arket på telefonen
       * bruker, og han står alt i `rute`.
       */
      style={{
        left: rute.venstre,
        right: rute.hogre,
        /* På benken står ho på nedre kant. På ein telefon står ho OVER den
           lukka kontrollina, so dei tre tala er synlege medan du redigerer:
           du flyttar ei ribbe og ser delane og platene svare. Ei skuff som
           dekkjer svaret er ei skuff du må lukke for å sjå kva du gjorde. */
        bottom: rute.botn ?? 0,
        // Ei teikning fyller det ho får; ei liste er så høg som ho er.
        height: rute.fast ? rute.høgd : undefined,
        minHeight: rute.fast ? undefined : Math.min(rute.høgd, 180),
        maxHeight: rute.høgd,
        background: "var(--paper)",
        borderColor: "var(--rule)",
      }}
    >
      {/* Ei line, ikkje ei fanerad: knappane som byter verkty står alt i
          topplina, og den same rada to stader er to stader å leite.

          HINTEN STOD HER OG SA DET SKUFFA VISTE.
          «Kvar del, med adresse, mål og plate» stod over ein tabell med
          «adresse», «mål mm» og «plate» som kolonneoverskrifter; «kvar
          plate slik ho ligg» stod over ei teikning av ei plate; «alle
          innstillingane som tekst» stod over ein tekst med alle
          innstillingane i. Ei bilettekst som les opp biletet under seg er
          ikkje ei opplysning. Ho står framleis i tooltipen på knappen som
          opnar skuffa — der ho svarar på noko du ENNO ikkje ser. */}
      <div
        className="flex items-baseline gap-3 border-b px-3 py-2 text-[10px] uppercase tracking-[0.14em]"
        style={HAIR}
      >
        {/*
          NAMNET PÅ BENKEN, HEILE RADA PÅ EIN TELEFON.

          Benken har dei fire orda i topplina si over lerretet, og den same
          rada to stader er to stader å leite. Ein telefon har inga toppline
          — so der stod skuffa med eitt ord og ein «lat att», og du kom
          berre dit knappen du trykte tok deg. Ut att og inn ein annan veg
          var einaste vegen mellom to verkty.
        */}
        <span className="mono min-w-0 flex-1 truncate sm:hidden">
          {VERKTY.map((v) => (
            <button
              key={v.id}
              type="button"
              className="hit px-1 first:pl-0"
              style={{ opacity: v.id === open ? 1 : 0.4 }}
              aria-current={v.id === open}
              onClick={() => props.onBytt(v.id)}
              title={v.hint}
            >
              {v.ord}
            </button>
          ))}
        </span>
        <span className="mono hidden min-w-0 flex-1 truncate sm:block">
          {VERKTY.find((v) => v.id === open)?.ord}
        </span>
        <button
          type="button"
          className="hit dim shrink-0 px-1.5"
          onClick={props.onClose}
          aria-label="lat att verktyet"
          title="lat att (escape)"
        >
          lat att
        </button>
      </div>
      {open === "liste" && (
        <Kuttliste
          liste={props.liste}
          laaste={laaste}
          peikt={props.peikt}
          onPeik={props.onPeik}
          onOrd={props.onOrd}
        />
      )}
      {open === "ark" && (
        <Plater
          ark={props.ark}
          onArk={props.onArk}
          peikt={props.peikt}
          festa={props.festa}
          onPeik={props.onPeik}
          onLangtrykk={props.onLangtrykk}
          onAvbryt={props.onAvbryt}
          onFlytt={props.onFlyttDel}
        />
      )}
      {open === "stabel" && (
        <Stabelen
          ribber={props.ribber}
          peikt={props.peikt}
          onPeik={props.onPeik}
          onFlytt={props.onFlytt}
          onLaas={props.onLaas}
          onKopier={props.onKopier}
          onSpegl={props.onSpegl}
          onSlett={props.onSlett}
          onAkse={props.onAkse}
        />
      )}
      {open === "oppsett" && (
        <Oppsett
          params={props.params}
          ranges={props.ranges}
          keys={props.keys}
          clamp={props.clamp}
          onChange={props.onChange}
        />
      )}
    </section>
  )
}
