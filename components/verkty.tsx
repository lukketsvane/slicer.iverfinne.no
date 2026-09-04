"use client"

/**
 * VERKTYA: det du slår opp i. Kuttlista og oppsettet treng brei plass og
 * skal ikkje stå framme heile tida, so dei bur i ei skuff over lerretet,
 * eitt om gongen. Ingen av dei reknar noko: kuttlista er bygget lese line
 * for line, oppsettet er parametrane du alt står i. Platene er ikkje her —
 * dei er konturvisinga, som er heile flata og ikkje ei skuff.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from "react"
import { kuttCsv, nn, type Kutt, type ParamBag } from "@/lib/core"
import { ALLE_KEYS, PARAM_RANGES } from "@/lib/params"
import { CHIP, HAIR, ICON_BTN, IcoKopier, IcoLimInn, chipStyle } from "./deler"

export type VerktyId = "kuttliste" | "oppsett"
export const VERKTY: { id: VerktyId; ord: string }[] = [
  { id: "kuttliste", ord: "kuttliste" },
  { id: "oppsett", ord: "oppsett" },
]

// =============================================================================
// KUTTLISTA — éi line per del, samla under planet sitt
// =============================================================================
type Kolonne = { id: string; ord: string; tal?: boolean; les: (k: Kutt) => string; smal?: boolean }
/** sju kolonnar er ein tabell for ein skjerm; på 390 px står fire */
const KOLONNAR: Kolonne[] = [
  { id: "adr", ord: "adresse", les: (k) => k.adr },
  { id: "id", ord: "form", les: (k) => k.id, smal: true },
  { id: "mal", ord: "mål mm", tal: true, les: (k) => `${nn(k.w, 1)} × ${nn(k.h, 1)}` },
  { id: "flate", ord: "cm²", tal: true, les: (k) => nn(k.area / 100, 1), smal: true },
  { id: "kutt", ord: "kutt mm", tal: true, les: (k) => nn(k.cutLen, 0), smal: true },
  { id: "ledd", ord: "ledd", tal: true, les: (k) => nn(k.joints, 0) },
  { id: "ark", ord: "plate", tal: true, les: (k) => (k.ark ? nn(k.ark, 0) : "–") },
]

function Kuttliste({ liste, peikt, onPeik, onOrd }: {
  liste: readonly Kutt[]
  peikt: string | null
  onPeik: (adr: string | null) => void
  onOrd: (s: string) => void
}) {
  const peiktRad = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => { peiktRad.current?.scrollIntoView({ block: "nearest" }) }, [peikt])
  /** kor mange gonger kvar form går att — det er oppspenningane */
  const former = useMemo(() => {
    const m = new Map<string, number>()
    for (const k of liste) m.set(k.id, (m.get(k.id) ?? 0) + 1)
    return m
  }, [liste])
  const grupper = useMemo(() => {
    const m = new Map<number, Kutt[]>()
    for (const k of [...liste].sort((a, b) => a.plan - b.plan || a.adr.localeCompare(b.adr, "nn", { numeric: true }))) {
      m.set(k.plan, [...(m.get(k.plan) ?? []), k])
    }
    return [...m.entries()]
  }, [liste])
  if (!liste.length) return <p className="dim p-4 text-[11px]">ingen delar</p>
  const celle = (q: Kolonne) => (q.tal ? "text-right " : "text-left ") + (q.smal ? "hidden sm:table-cell" : "")
  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <table className="mono w-full border-collapse text-[11px]">
          <thead className="sticky top-0" style={{ background: "var(--paper)" }}>
            <tr>
              {KOLONNAR.map((q) => (
                <th key={q.id} scope="col" className={"dim border-b px-2 py-1.5 text-[10px] font-normal uppercase tracking-[0.1em] " + celle(q)} style={HAIR}>{q.ord}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupper.map(([plan, rader]) => (
              <Fragmentet key={plan}>
                {rader.length > 1 && (
                  <tr><td colSpan={KOLONNAR.length} className="dim px-2 pt-2 text-[9px] uppercase tracking-[0.14em]">plan {plan} · {rader.length} stykke</td></tr>
                )}
                {rader.map((k) => (
                  <tr
                    key={k.adr}
                    ref={peikt === k.adr ? peiktRad : undefined}
                    onClick={() => onPeik(peikt === k.adr ? null : k.adr)}
                    className="hit cursor-pointer"
                    style={{ background: peikt === k.adr ? "color-mix(in srgb, var(--ink) 8%, transparent)" : undefined }}
                  >
                    {KOLONNAR.map((q) => (
                      <td key={q.id} className={"px-2 py-[3px] " + celle(q)} style={{ color: q.id === "ledd" && k.joints === 0 ? "var(--warn)" : undefined }}>
                        {q.id === "id" ? (
                          <span title={`${former.get(k.id) ?? 1} delar har denne forma`}>{k.id}<span className="dim">{(former.get(k.id) ?? 1) > 1 ? `·${former.get(k.id)}` : ""}</span></span>
                        ) : q.les(k)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragmentet>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 border-t px-3 py-2 text-[10px]" style={HAIR}>
        <span className="dim tab">{liste.length} delar · {former.size} former</span>
        <button type="button" className={CHIP + " ml-auto uppercase tracking-[0.1em]"} style={chipStyle(false)} onClick={() => onOrd(kuttCsv(liste))} title="kopier kuttlista som csv, med semikolon mellom felta">
          csv
        </button>
      </div>
    </>
  )
}
const Fragmentet = ({ children }: { children: React.ReactNode }) => <>{children}</>

// =============================================================================
// OPPSETTET — alle innstillingane som tekst: kopier ut, lim inn att
// =============================================================================
/**
 * Teksten er LESING, ikkje eit felt. Eit felt som kan skrivast i tek fokus,
 * og på ein iPhone er fokus eit tastatur over objektet og ei side som zoomar.
 * Vegen inn er utklippstavla: «kopier» tek teksten med seg, «lim inn» les
 * henne attende og set det som står der. Klemminga er motoren si eiga, og
 * ingenting vert sett før du trykkjer.
 */
function Oppsett({ params, clamp, onChange }: {
  params: ParamBag
  clamp: (o: unknown, prev: ParamBag) => ParamBag
  onChange: (p: ParamBag) => void
}) {
  const tekst = ALLE_KEYS.filter((k) => k !== "kjelde")
    .map((k) => {
      const v = params[k]
      const r = PARAM_RANGES[k]
      return `${k.padEnd(10)} ${typeof v === "number" ? +v.toFixed(4) : String(v ?? "")}${r?.unit ? `  ${r.unit}` : ""}`
    })
    .join("\n")
  const [ord, setOrd] = useState("")
  /** utan utklippstavle-API: eit mål å lime i, éin gong */
  const [maal, setMaal] = useState(false)
  const set = (inn: string) => {
    const sett: Record<string, number | string> = {}
    const ukjend: string[] = []
    for (const line of inn.split("\n")) {
      const m = line.trim().match(/^([a-zA-Z]+)\s*[=:]?\s*(\S.*?)\s*$/)
      if (!m) continue
      if (!ALLE_KEYS.includes(m[1]) || m[1] === "kjelde") { ukjend.push(m[1]); continue }
      const v = m[2].replace(/\s+[a-z°/]+$/i, "")
      sett[m[1]] = PARAM_RANGES[m[1]] ? Number(v.replace(",", ".")) : v
    }
    const ut = clamp(sett, params)
    const flytta = Object.keys(sett).filter((k) => typeof sett[k] === "number" && Math.abs((ut[k] as number) - (sett[k] as number)) > 1e-9)
    onChange(ut)
    setOrd([`${Object.keys(sett).length} sett`, flytta.length ? `klemt ${flytta.join(" ")}` : "", ukjend.length ? `ukjend ${ukjend.join(" ")}` : ""].filter(Boolean).join(" · "))
  }
  const kopier = () => void navigator.clipboard?.writeText(tekst).then(() => setOrd("kopiert")).catch(() => setOrd("ikkje kopiert"))
  const limInn = () => {
    const les = navigator.clipboard?.readText
    if (!les) return setMaal(true)
    void navigator.clipboard.readText().then(set).catch(() => setOrd("ikkje lese"))
  }
  return (
    <>
      <textarea className="mono min-h-0 flex-1 resize-none overscroll-contain bg-transparent p-3 text-[12px] leading-relaxed outline-none" readOnly tabIndex={-1} spellCheck={false} value={tekst} aria-label="alle innstillingane som tekst" />
      {maal && (
        <textarea
          className="mono border-t p-3 text-[16px]"
          style={HAIR}
          rows={2}
          aria-label="lim inn oppsettet"
          placeholder="lim inn"
          autoFocus
          onPaste={(e) => { e.preventDefault(); setMaal(false); set(e.clipboardData.getData("text")) }}
          onBlur={() => setMaal(false)}
        />
      )}
      <div className="flex items-center gap-2 border-t px-3 py-2 text-[10px]" style={HAIR}>
        <span className="dim mono min-w-0 flex-1 truncate">{ord}</span>
        <button type="button" className={ICON_BTN} aria-label="kopier" title="kopier oppsettet til utklippstavla" onClick={kopier}>{IcoKopier}</button>
        <button type="button" className={ICON_BTN} aria-label="lim inn" title="lim inn eit oppsett frå utklippstavla, og set det" onClick={limInn}>{IcoLimInn}</button>
      </div>
    </>
  )
}

// =============================================================================
// SKUFFA
// =============================================================================
export function Skuff(props: {
  open: VerktyId | null
  /** kvar skuffa står, i CSS-pikslar */
  rute: CSSProperties
  liste: readonly Kutt[]
  params: ParamBag
  clamp: (o: unknown, prev: ParamBag) => ParamBag
  peikt: string | null
  onPeik: (adr: string | null) => void
  onChange: (p: ParamBag) => void
  onBytt: (id: VerktyId) => void
  onClose: () => void
  onOrd: (s: string) => void
}): JSX.Element | null {
  const { open } = props
  if (!open) return null
  return (
    <section aria-label="verkty" className="benk fixed z-40 flex flex-col border" style={{ ...props.rute, background: "var(--paper)", borderColor: "var(--rule)" }}>
      <div className="flex items-baseline gap-3 border-b px-3 py-2 text-[10px] uppercase tracking-[0.14em]" style={HAIR}>
        <span className="mono min-w-0 flex-1 truncate">
          {VERKTY.map((v) => (
            <button key={v.id} type="button" className="hit px-1 first:pl-0" style={{ opacity: v.id === open ? 1 : 0.4 }} aria-current={v.id === open} onClick={() => props.onBytt(v.id)}>{v.ord}</button>
          ))}
        </span>
        <button type="button" className="hit dim shrink-0 px-1.5" onClick={props.onClose} aria-label="lat att verktyet" title="lat att (esc)">lat att</button>
      </div>
      {open === "kuttliste" && <Kuttliste liste={props.liste} peikt={props.peikt} onPeik={props.onPeik} onOrd={props.onOrd} />}
      {open === "oppsett" && <Oppsett params={props.params} clamp={props.clamp} onChange={props.onChange} />}
    </section>
  )
}
