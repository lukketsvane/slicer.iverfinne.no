"use client"

import { useEffect, useRef, type JSX } from "react"
import type { View } from "@/lib/core"
import { FORMAT } from "@/lib/io"
import { CHIP, HAIR, ICON_BTN, IcoAngre, IcoImport, IcoShare, VIEWS, chipStyle } from "./deler"

/**
 * TOPPLINA. Det som ikkje skal ligge to steg ned i eit ark: fila du står
 * på (og vegen til ei ny), dei tre lesemåtane, angre og lenkja. Éi smal
 * line på begge flatene, over lerretet; kameraet rammar inn under henne.
 * På ein telefon som er lagd på heimeskjermen ligg statuslina over sida,
 * so lina tek den tryggje sona som luft over seg.
 */
export function Toppline({ benk, kjelde, view, onView, onFile, onAngre, kanAngre, onShare, onHogd }: {
  benk: boolean
  kjelde: string
  view: View
  onView: (v: View) => void
  onFile: (f: File) => void
  onAngre: () => void
  kanAngre: boolean
  onShare: () => void
  /** kor høg lina er, i pikslar: kameraet stiller objektet inn under henne */
  onHogd: (px: number) => void
}): JSX.Element {
  const pick = useRef<HTMLInputElement | null>(null)
  const el = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const h = el.current
    if (!h) return
    const meld = () => onHogd(Math.round(h.getBoundingClientRect().height))
    const ro = new ResizeObserver(meld)
    ro.observe(h)
    meld()
    return () => ro.disconnect()
  }, [onHogd])
  return (
    <header
      ref={el}
      className="fixed inset-x-0 top-0 z-30 border-b"
      style={{ ...HAIR, background: "var(--paper)", color: "var(--ink)", paddingTop: "env(safe-area-inset-top)" }}
    >
      <input ref={pick} type="file" accept={FORMAT.join(",")} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = "" }} />
      <div className="flex h-11 items-center gap-1.5 px-3">
        {benk && <span className="mono pr-2 text-[11px] tracking-[0.06em]">slicerman</span>}
        {/* Kjelda. Ho er ikkje ein nedtrekk med tre demofigurar — ho er DI fil,
            og trykket opnar filveljaren. Kuben står der til nokon gjev han noko betre. */}
        <button
          type="button"
          onClick={() => pick.current?.click()}
          title={`hent eit nett: ${FORMAT.join(" ")}`}
          aria-label="hent eit nett"
          className={CHIP + " flex max-w-[116px] items-center gap-1.5 px-2.5"}
          style={chipStyle(false)}
        >
          {IcoImport}<span className="min-w-0 truncate">{kjelde}</span>
        </button>
        <span className="mx-auto flex items-center gap-1">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" title={v.hint} aria-pressed={view === v.id} onClick={() => onView(v.id)} className={CHIP + " px-2.5"} style={chipStyle(view === v.id)}>{v.label}</button>
          ))}
        </span>
        <button type="button" onClick={onAngre} disabled={!kanAngre} aria-label="angre" title="angre siste endring (Z)" className={ICON_BTN} style={{ ...HAIR, color: "var(--ink)" }}>{IcoAngre}</button>
        <button type="button" onClick={onShare} aria-label="del" title="lenkja ber innstillingane, ikkje nettet" className={ICON_BTN} style={{ ...HAIR, color: "var(--ink)" }}>{IcoShare}</button>
        {benk && <a href="https://iverfinne.no" target="_blank" rel="noopener noreferrer" className="pl-2 text-[11px] tracking-wide opacity-60 hover:opacity-100">iverfinne.no</a>}
      </div>
    </header>
  )
}
