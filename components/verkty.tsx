"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from "react"
import { kuttCsv, nn, type Kutt, type ParamBag } from "@/lib/core"
import { ALLE_KEYS, PARAM_RANGES } from "@/lib/params"
import { alleProsjekt, dupliserProsjekt, nyttProsjekt, opneProsjekt, slettProsjekt, type Prosjekt } from "@/lib/lagring"
import { useMaal, mt, type Maal } from "@/lib/i18n"
import { CHIP, HAIR, ICON_BTN, ORD, IcoKopier, IcoLimInn, chipStyle } from "./deler"

export type VerktyId = "prosjekt" | "kuttliste" | "oppsett"
export const VERKTY: { id: VerktyId; ord: string }[] = [
  { id: "prosjekt", ord: "prosjekt" },
  { id: "kuttliste", ord: "kuttliste" },
  { id: "oppsett", ord: "oppsett" },
]

const MND_NN = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
const MND_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function naar(t: number, maal: Maal): string {
  const d = new Date(t)
  const dag = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const skil = Math.round((dag(new Date()) - dag(d)) / 864e5)
  const tid = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  if (skil === 0) return mt(maal, `today ${tid}`, `i dag ${tid}`)
  if (skil === 1) return mt(maal, "yesterday", "i går")
  return mt(maal, `${MND_EN[d.getMonth()]} ${d.getDate()}`, `${d.getDate()}. ${MND_NN[d.getMonth()]}`)
}

function Prosjekta({ gjeldande, onByt, onNamn }: {
  gjeldande: { id: string; namn: string }
  onByt: (til: () => Promise<Prosjekt | null>) => void
  onNamn: (namn: string) => void
}) {
  const maal = useMaal()
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
      <ul className="min-h-0 flex-1 overflow-auto overscroll-contain text-[12px]" aria-label={mt(maal, "projects", "prosjekta")}>
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
                  aria-label={mt(maal, "project name", "namnet på prosjektet")}
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
                  <span className="mono tab shrink-0 text-[10px]">{naar(p.endra, maal)}</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-1 border-t px-3 py-1 text-[10px]" style={HAIR}>
        <span className="dim tab mr-auto">{liste.length} {mt(maal, "projects", "prosjekt")}</span>
        <button type="button" className={ord} title={mt(maal, "a blank project", "eit tomt prosjekt")} onClick={() => onByt(() => nyttProsjekt())}>{mt(maal, "new", "nytt")}</button>
        <button type="button" className={ord} title={mt(maal, "open copy as a new project", "det opne ein gong til, som eit nytt prosjekt")} onClick={() => onByt(() => dupliserProsjekt(gjeldande.id))}>{mt(maal, "duplicate", "dupliser")}</button>
        <button
          type="button"
          className={ord}
          title={mt(maal, "delete project — tap twice", "dette prosjektet bort — to trykk")}
          style={sikker ? { color: "var(--warn)" } : undefined}
          onClick={() => {
            setSikker(!sikker)
            if (sikker) onByt(() => slettProsjekt(gjeldande.id))
          }}
        >
          {sikker ? mt(maal, "sure?", "sikker?") : mt(maal, "delete", "slett")}
        </button>
        <button type="button" className={ord} title={mt(maal, "rename current project", "gje det opne prosjektet eit namn")} disabled={redig} onClick={() => setRedig(true)}>{mt(maal, "rename", "namn")}</button>
      </div>
    </>
  )
}

type Kolonne = { id: string; ord: string; ordEn: string; tal?: boolean; les: (k: Kutt) => string; smal?: boolean }
const KOLONNAR: Kolonne[] = [
  { id: "adr", ord: "adresse", ordEn: "address", les: (k) => k.adr },
  { id: "id", ord: "form", ordEn: "shape", les: (k) => k.id, smal: true },
  { id: "mal", ord: "mål mm", ordEn: "size mm", tal: true, les: (k) => `${nn(k.w, 1)} × ${nn(k.h, 1)}` },
  { id: "flate", ord: "cm²", ordEn: "cm²", tal: true, les: (k) => nn(k.area / 100, 1), smal: true },
  { id: "kutt", ord: "kutt mm", ordEn: "cut mm", tal: true, les: (k) => nn(k.cutLen, 0), smal: true },
  { id: "ledd", ord: "ledd", ordEn: "joints", tal: true, les: (k) => nn(k.joints, 0) },
  { id: "ark", ord: "plate", ordEn: "sheet", tal: true, les: (k) => (k.ark ? nn(k.ark, 0) : "–") },
]

function Kuttliste({ liste, peikt, onPeik, onOrd }: {
  liste: readonly Kutt[]
  peikt: string | null
  onPeik: (adr: string | null) => void
  onOrd: (s: string) => void
}) {
  const maal = useMaal()
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
  if (!liste.length) return <p className="dim p-4 text-[11px]">{mt(maal, "no parts", "ingen delar")}</p>
  const celle = (q: Kolonne) => (q.tal ? "text-right " : "text-left ") + (q.smal ? "hidden sm:table-cell" : "")
  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <table className="mono w-full border-collapse text-[11px]">
          <thead className="sticky top-0" style={{ background: "var(--paper)" }}>
            <tr>
              {KOLONNAR.map((q) => (
                <th key={q.id} scope="col" className={"dim border-b px-2 py-1.5 text-[10px] font-normal uppercase tracking-[0.1em] " + celle(q)} style={HAIR}>{mt(maal, q.ordEn, q.ord)}</th>
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
                      <button type="button" aria-expanded={!att} title={att ? mt(maal, `show the ${rader.length} parts`, `syn dei ${rader.length} stykka`) : mt(maal, "collapse plane", "brett planet saman")} onClick={() => brett(plan)} className="hit dim block w-full px-2 pt-2 text-left text-[9px] uppercase tracking-[0.14em]" data-bolk={`plan-${plan}`}>{mt(maal, "plane", "plan")} {plan} · {rader.length} {mt(maal, "pieces", "stykke")}</button>
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
                        <td key={q.id} className={"px-2 py-[3px] " + celle(q)}>
                          {q.id === "id" ? (
                            <span title={mt(maal, `${former.get(k.id) ?? 1} parts share this shape`, `${former.get(k.id) ?? 1} delar har denne forma`)}>{k.id}<span className="dim">{(former.get(k.id) ?? 1) > 1 ? `·${former.get(k.id)}` : ""}</span></span>
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
        <span className="dim tab">{liste.length} {mt(maal, "parts", "delar")} · {former.size} {mt(maal, "shapes", "former")}</span>
        <button type="button" className={CHIP + " ml-auto uppercase tracking-[0.1em]"} style={chipStyle(false)} onClick={() => onOrd(kuttCsv(liste))} title={mt(maal, "copy cut list as semicolon-delimited csv", "kopier kuttlista som csv, med semikolon mellom felta")}>
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
  const maal = useMaal()
  const tekst = ALLE_KEYS.filter((k) => k !== "kjelde")
    .map((k) => {
      const v = params[k]
      const r = PARAM_RANGES[k]
      return `${k.padEnd(10)} ${typeof v === "number" ? +v.toFixed(4) : String(v ?? "")}${r?.unit ? `  ${r.unit}` : ""}`
    })
    .join("\n")
  const [ord, setOrd] = useState("")
  const [limFelt, setLimFelt] = useState(false)
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
    setOrd([
      `${Object.keys(sett).length} ${mt(maal, "set", "sett")}`,
      flytta.length ? `${mt(maal, "clamped", "klemt")} ${flytta.join(" ")}` : "",
      ukjend.length ? `${mt(maal, "unknown", "ukjend")} ${ukjend.join(" ")}` : "",
    ].filter(Boolean).join(" · "))
  }
  const kopier = () => void navigator.clipboard?.writeText(tekst).then(() => setOrd(mt(maal, "copied", "kopiert"))).catch(() => setOrd(mt(maal, "not copied", "ikkje kopiert")))
  const limInn = () => {
    const les = navigator.clipboard?.readText
    if (!les) return setLimFelt(true)
    void navigator.clipboard.readText().then(set).catch(() => setOrd(mt(maal, "could not read", "ikkje lese")))
  }
  return (
    <>
      <textarea className="mono min-h-0 flex-1 resize-none overscroll-contain bg-transparent p-3 text-[12px] leading-relaxed outline-none" readOnly tabIndex={-1} spellCheck={false} value={tekst} aria-label={mt(maal, "all settings as text", "alle innstillingane som tekst")} />
      {limFelt && (
        <textarea
          className="mono border-t p-3 text-[16px]"
          style={HAIR}
          rows={2}
          aria-label={mt(maal, "paste settings", "lim inn oppsettet")}
          placeholder={mt(maal, "paste", "lim inn")}
          autoFocus
          onPaste={(e) => { e.preventDefault(); setLimFelt(false); set(e.clipboardData.getData("text")) }}
          onBlur={() => setLimFelt(false)}
        />
      )}
      <div className="flex items-center gap-2 border-t px-3 py-2 text-[10px]" style={HAIR}>
        <span className="dim mono min-w-0 flex-1 truncate">{ord}</span>
        <button type="button" className={ICON_BTN} aria-label={mt(maal, "copy", "kopier")} title={mt(maal, "copy settings to clipboard", "kopier oppsettet til utklippstavla")} onClick={kopier}>{IcoKopier}</button>
        <button type="button" className={ICON_BTN} aria-label={mt(maal, "paste", "lim inn")} title={mt(maal, "paste settings from clipboard and apply", "lim inn eit oppsett frå utklippstavla, og set det")} onClick={limInn}>{IcoLimInn}</button>
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
  const maal = useMaal()
  const { open } = props
  if (!open) return null
  return (
    <section aria-label={mt(maal, "tools", "verkty")} className="benk fixed z-40 flex flex-col border" style={{ ...props.rute, background: "var(--paper)", borderColor: "var(--rule)" }}>
      <div className="flex items-baseline gap-3 border-b px-3 py-2 text-[10px] uppercase tracking-[0.14em]" style={HAIR}>
        <span className="mono min-w-0 flex-1 truncate">
          {VERKTY.map((v) => {
            const ordTekst = v.id === "prosjekt" ? mt(maal, "project", v.ord)
              : v.id === "kuttliste" ? mt(maal, "cut list", v.ord)
              : mt(maal, "settings", v.ord)
            return (
              <button key={v.id} type="button" className="hit px-1 first:pl-0" style={{ opacity: v.id === open ? 1 : 0.4 }} aria-current={v.id === open} onClick={() => props.onBytt(v.id)}>{ordTekst}</button>
            )
          })}
        </span>
        <button type="button" className="hit dim shrink-0 px-1.5" onClick={props.onClose} aria-label={mt(maal, "close tool", "lat att verktyet")} title={mt(maal, "close (esc)", "lat att (esc)")}>{mt(maal, "close", "lat att")}</button>
      </div>
      {open === "prosjekt" && <Prosjekta gjeldande={props.prosjekt} onByt={props.onByt} onNamn={props.onNamn} />}
      {open === "kuttliste" && <Kuttliste liste={props.liste} peikt={props.peikt} onPeik={props.onPeik} onOrd={props.onOrd} />}
      {open === "oppsett" && <Oppsett params={props.params} clamp={props.clamp} onChange={props.onChange} />}
    </section>
  )
}
