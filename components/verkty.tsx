"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from "react"
import { kuttCsv, nn, type Kutt, type ParamBag } from "@/lib/core"
import { ALLE_KEYS, PARAM_RANGES } from "@/lib/params"
import { alleProsjekt, dupliserProsjekt, nyttProsjekt, opneProsjekt, slettProsjekt, type Prosjekt } from "@/lib/lagring"
import { CHIP, HAIR, ICON_BTN, ORD, IcoKopier, IcoLimInn, chipStyle } from "./deler"

export type VerktyId = "prosjekt" | "kuttliste" | "oppsett"
export const VERKTY: { id: VerktyId; ord: string }[] = [
  { id: "prosjekt", ord: "prosjekt" },
  { id: "kuttliste", ord: "kuttliste" },
  { id: "oppsett", ord: "oppsett" },
]

const MND = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
function naar(t: number): string {
  const d = new Date(t)
  const dag = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const skil = Math.round((dag(new Date()) - dag(d)) / 864e5)
  if (skil === 0) return `i dag ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  return skil === 1 ? "i går" : `${d.getDate()}. ${MND[d.getMonth()]}`
}

function Prosjekta({ gjeldande, onByt, onNamn }: {
  gjeldande: { id: string; namn: string }
  onByt: (til: () => Promise<Prosjekt | null>) => void
  onNamn: (namn: string) => void
}) {
  const [liste, setListe] = useState<Prosjekt[]>([])
  useEffect(() => { void alleProsjekt().then(setListe) }, [gjeldande.id, gjeldande.namn])
  const [redig, setRedig] = useState(false)
  const avbrot = useRef(false)
  const [sikker, setSikker] = useState(false)
  useEffect(() => {
    if (!sikker) return
    const t = window.setTimeout(() => setSikker(false), 3000)
    return () => window.clearTimeout(t)
  }, [sikker])
  const ord = ORD + " px-1.5 uppercase tracking-[0.1em]"
  return (
    <>
      <ul className="min-h-0 flex-1 overflow-auto overscroll-contain text-[12px]" aria-label="prosjekta">
        {liste.map((p) => {
          const her = p.id === gjeldande.id
          return (
            <li key={p.id} className="border-b" style={HAIR}>
              {her && redig ? (
                <input
                  type="text"
                  autoFocus
                  defaultValue={gjeldande.namn}
                  maxLength={60}
                  aria-label="namnet på prosjektet"
                  className="w-full bg-transparent px-3 py-2 text-[16px] outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") avbrot.current = true
                    if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur()
                  }}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim()
                    if (!avbrot.current && v && v !== gjeldande.namn) onNamn(v)
                    avbrot.current = false
                    setRedig(false)
                  }}
                />
              ) : (
                <button type="button" aria-current={her} data-prosjekt={p.id} className={"hit flex w-full items-baseline gap-3 px-3 py-2.5 text-left" + (her ? "" : " dim")} onClick={() => { if (!her) onByt(() => opneProsjekt(p.id)) }}>
                  <span className="min-w-0 flex-1 truncate">{her ? gjeldande.namn : p.namn}</span>
                  <span className="mono tab shrink-0 text-[10px]">{naar(p.endra)}</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-1 border-t px-3 py-1 text-[10px]" style={HAIR}>
        <span className="dim tab mr-auto">{liste.length} prosjekt</span>
        <button type="button" className={ord} title="eit tomt prosjekt" onClick={() => onByt(() => nyttProsjekt())}>nytt</button>
        <button type="button" className={ord} title="det opne ein gong til, som eit nytt prosjekt" onClick={() => onByt(() => dupliserProsjekt(gjeldande.id))}>dupliser</button>
        <button
          type="button"
          className={ord}
          title="dette prosjektet bort — to trykk"
          style={sikker ? { color: "var(--warn)" } : undefined}
          onClick={() => {
            setSikker(!sikker)
            if (sikker) onByt(() => slettProsjekt(gjeldande.id))
          }}
        >
          {sikker ? "sikker?" : "slett"}
        </button>
        <button type="button" className={ord} title="gje det opne prosjektet eit namn" disabled={redig} onClick={() => setRedig(true)}>namn</button>
      </div>
    </>
  )
}

type Kolonne = { id: string; ord: string; tal?: boolean; les: (k: Kutt) => string; smal?: boolean }
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
  const former = useMemo(() => {
    const m = new Map<string, number>()
    for (const k of liste) m.set(k.id, (m.get(k.id) ?? 0) + 1)
    return m
  }, [liste])
  const [bretta, setBretta] = useState<ReadonlySet<number>>(() => new Set())
  const brett = (plan: number) =>
    setBretta((s) => {
      const n = new Set(s)
      if (!n.delete(plan)) n.add(plan)
      return n
    })
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
            {grupper.map(([plan, rader]) => {
              const att = rader.length > 1 && bretta.has(plan)
              return (
                <Fragmentet key={plan}>
                  {rader.length > 1 && (
                    <tr><td colSpan={KOLONNAR.length} className="p-0">
                      <button type="button" aria-expanded={!att} title={att ? `syn dei ${rader.length} stykka` : "brett planet saman"} onClick={() => brett(plan)} className="hit dim block w-full px-2 pt-2 text-left text-[9px] uppercase tracking-[0.14em]" data-bolk={`plan-${plan}`}>plan {plan} · {rader.length} stykke</button>
                    </td></tr>
                  )}
                  {!att && rader.map((k) => (
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
              )
            })}
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

export function Skuff(props: {
  open: VerktyId | null
  rute: CSSProperties
  liste: readonly Kutt[]
  params: ParamBag
  clamp: (o: unknown, prev: ParamBag) => ParamBag
  peikt: string | null
  onPeik: (adr: string | null) => void
  onChange: (p: ParamBag) => void
  onBytt: (id: VerktyId) => void
  prosjekt: { id: string; namn: string }
  onByt: (til: () => Promise<Prosjekt | null>) => void
  onNamn: (namn: string) => void
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
      {open === "prosjekt" && <Prosjekta gjeldande={props.prosjekt} onByt={props.onByt} onNamn={props.onNamn} />}
      {open === "kuttliste" && <Kuttliste liste={props.liste} peikt={props.peikt} onPeik={props.onPeik} onOrd={props.onOrd} />}
      {open === "oppsett" && <Oppsett params={props.params} clamp={props.clamp} onChange={props.onChange} />}
    </section>
  )
}
