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
import type { ArkSyn, Kutt, ParamBag, Range } from "@/lib/core"
import { nn } from "@/lib/core"
import { CHIP, chipStyle } from "./deler"

export type VerktyId = "liste" | "ark" | "oppsett"

export const VERKTY: { id: VerktyId; ord: string; hint: string }[] = [
  { id: "liste", ord: "kuttliste", hint: "kvar del, med adresse, mål og plate" },
  { id: "ark", ord: "plater", hint: "kvar plate slik ho ligg" },
  { id: "oppsett", ord: "oppsett", hint: "alle innstillingane som tekst" },
]

const HAIR = { borderColor: "var(--rule)" }
const CHIP_B = CHIP.replace("rounded-full", "rounded-[2px]")

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
}

const KOLONNAR: Kolonne[] = [
  { id: "adr", ord: "adresse", les: (k) => k.adr, sorter: (k) => k.adr },
  { id: "id", ord: "form", les: (k) => k.id, sorter: (k) => k.id },
  {
    id: "mal",
    ord: "mål mm",
    tal: true,
    les: (k) => `${nn(k.w, 1)} × ${nn(k.h, 1)}`,
    sorter: (k) => Math.max(k.w, k.h),
  },
  { id: "flate", ord: "cm²", tal: true, les: (k) => nn(k.area / 100, 1), sorter: (k) => k.area },
  { id: "kutt", ord: "kutt mm", tal: true, les: (k) => nn(k.cutLen, 0), sorter: (k) => k.cutLen },
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
  peikt: string | null
  onPeik: (adr: string | null) => void
  onOrd: (s: string) => void
}) {
  const { liste, peikt, onPeik, onOrd } = props
  const [sortert, setSortert] = useState<{ id: string; ned: boolean }>({ id: "adr", ned: false })
  /** Ein del du trykte på i objektet kan stå kvar som helst i lista — og
   *  ei line du ikkje ser er ikkje eit svar. */
  const peiktRad = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    peiktRad.current?.scrollIntoView({ block: "nearest" })
  }, [peikt])

  const rader = useMemo(() => {
    const k = KOLONNAR.find((q) => q.id === sortert.id) ?? KOLONNAR[0]
    const ut = [...liste].sort((a, b) => {
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
  }, [liste, sortert])

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
                    (k.tal ? "text-right" : "text-left")
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
                    className={"px-2 py-[3px] " + (q.tal ? "text-right" : "text-left")}
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
      <div className="flex items-center gap-3 border-t px-3 py-2 text-[10px]" style={HAIR}>
        <span className="mono">
          {liste.length} delar · {former.size} former ·{" "}
          {nn(liste.reduce((a, k) => a + k.cutLen, 0) / 1000, 1)} m kutt
        </span>
        <button
          type="button"
          className={CHIP_B + " ml-auto uppercase tracking-[0.1em]"}
          style={chipStyle(false)}
          onClick={() => onOrd(csv(liste))}
          title="heile lista på utklippstavla, med semikolon mellom felta"
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
  onPeik: (adr: string | null) => void
}) {
  const { ark, onArk, peikt, onPeik } = props
  if (!ark || !ark.tal) {
    return <p className="dim p-4 text-[11px]">ingenting er lagt ut på ei plate enno.</p>
  }
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
        </span>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <svg
          viewBox={`0 0 ${ark.arkB} ${ark.arkH}`}
          className="h-full w-full"
          role="img"
          aria-label={`plate ${ark.i + 1} av ${ark.tal}, ${ark.delar} delar`}
          onPointerLeave={() => onPeik(null)}
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
          <g transform={`translate(0,${ark.arkH}) scale(1,-1)`}>
            {ark.plasser.map((d) => {
              const paa = peikt === d.adr
              return (
                <g
                  key={d.adr}
                  onPointerEnter={() => onPeik(d.adr)}
                  onClick={() => onPeik(paa ? null : d.adr)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Fyllet er treffeflata. Ein del er eit omriss med hòl i,
                      og eit omriss er nokre få pikslar strek: peikaren måtte
                      treffe sjølve streken for at noko skulle skje. Med
                      `evenodd` er hòla hòl i treffeflata òg — du kan peike
                      gjennom eit spor på delen under. */}
                  <path
                    d={[d.ut, ...d.inn].join(" ")}
                    fillRule="evenodd"
                    style={{
                      fill: paa
                        ? "color-mix(in srgb, var(--ink) 12%, transparent)"
                        : "transparent",
                    }}
                  />
                  <path
                    d={d.ut}
                    strokeWidth={paa ? 2 : 1}
                    vectorEffect="non-scaling-stroke"
                    style={{ fill: "none", stroke: "var(--ink)" }}
                  />
                  {d.inn.map((h, j) => (
                    <path
                      key={j}
                      d={h}
                      strokeWidth={paa ? 2 : 1}
                      vectorEffect="non-scaling-stroke"
                      style={{ fill: "none", stroke: "var(--ink)" }}
                    />
                  ))}
                  <title>{d.adr}</title>
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
        <span className="dim mono min-w-0 flex-1 truncate">{ord || "eitt namn og eitt tal per line"}</span>
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
  rute: { venstre: number; hogre: number; høgd: number }
  onArk: (i: number) => void
  onPeik: (adr: string | null) => void
  onChange: (p: ParamBag) => void
  onClose: () => void
  onOrd: (s: string) => void
}): JSX.Element | null {
  const { open, rute } = props
  if (!open) return null
  return (
    <section
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
        bottom: 0,
        height: rute.høgd,
        background: "var(--paper)",
        borderColor: "var(--rule)",
      }}
    >
      {/* Ei line, ikkje ei fanerad: knappane som byter verkty står alt i
          topplina, og den same rada to stader er to stader å leite. */}
      <div
        className="flex items-baseline gap-3 border-b px-3 py-2 text-[10px] uppercase tracking-[0.14em]"
        style={HAIR}
      >
        <span className="mono">{VERKTY.find((v) => v.id === open)?.ord}</span>
        <span className="dim min-w-0 flex-1 truncate normal-case tracking-normal">
          {VERKTY.find((v) => v.id === open)?.hint}
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
          onPeik={props.onPeik}
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
