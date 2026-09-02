"use client"

import { useEffect, useRef, useState, type JSX } from "react"
import type { View } from "@/lib/core"
import { FORMAT } from "@/lib/io"
import { PRIMITIV } from "@/lib/scene"
import { CHIP, HAIR, ICON_BTN, IcoAngre, IcoGjerOm, IcoShare, VIEWS, chipStyle } from "./deler"

/**
 * TOPPLINA. Det som ikkje skal ligge to steg ned i eit ark: angre og gjer
 * om, kroppen du står på (og vegen til ein annan), dei tre lesemåtane,
 * lenkja. Éi smal line på begge flatene, over lerretet; kameraet rammar inn
 * under henne. På ein telefon som er lagd på heimeskjermen ligg statuslina
 * over sida, so lina tek den tryggje sona som luft over seg. Ein knapp er
 * eit ikon eller eit ord, aldri begge; filnamnet er innhald og står som det er.
 */
export function Toppline({ benk, kjelde, bitar, view, onView, onFile, onLegg, onTom, onAngre, kanAngre, onGjerOm, kanGjerOm, onShare, onHogd }: {
  benk: boolean
  kjelde: string
  /** kor mange bitar kroppen er sett saman av: eitt er ei kjelde åleine */
  bitar: number
  view: View
  onView: (v: View) => void
  onFile: (f: File) => void
  /** eit primitiv til i kroppen */
  onLegg: (id: string) => void
  /** attende til kjelda åleine */
  onTom: () => void
  onAngre: () => void
  kanAngre: boolean
  onGjerOm: () => void
  kanGjerOm: boolean
  onShare: () => void
  /** kor høg lina er, i pikslar: kameraet stiller objektet inn under henne */
  onHogd: (px: number) => void
}): JSX.Element {
  const pick = useRef<HTMLInputElement | null>(null)
  const el = useRef<HTMLElement | null>(null)
  /**
   * KJELDEMENYEN. Kroppen er ei liste av bitar, ikkje éi fil, so brikka er
   * ikkje ein filveljar: ho er dei fem primitiva som finst utan ei fil, og
   * vegen til di eiga. Han lukkar seg av eit trykk utanfor og av escape —
   * ein meny som står att er ein meny som dekkjer objektet.
   */
  const [meny, setMeny] = useState(false)
  const boks = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!meny) return
    const ute = (e: PointerEvent) => { if (!boks.current?.contains(e.target as Node)) setMeny(false) }
    const tast = (e: KeyboardEvent) => { if (e.key === "Escape") setMeny(false) }
    window.addEventListener("pointerdown", ute)
    window.addEventListener("keydown", tast)
    return () => {
      window.removeEventListener("pointerdown", ute)
      window.removeEventListener("keydown", tast)
    }
  }, [meny])
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
      <div className="flex h-11 items-center gap-1 px-2">
        <button type="button" onClick={onAngre} disabled={!kanAngre} aria-label="angre" title="angre siste endring (Z)" className={ICON_BTN} style={{ ...HAIR, color: "var(--ink)" }}>{IcoAngre}</button>
        <button type="button" onClick={onGjerOm} disabled={!kanGjerOm} aria-label="gjer om" title="gjer om det du angra (⇧Z)" className={ICON_BTN} style={{ ...HAIR, color: "var(--ink)" }}>{IcoGjerOm}</button>
        {/* KROPPEN. Brikka seier kva han er laga av og opnar lista: fem
            primitiv som vert lagde til det som alt står, og di eiga fil,
            som byrjar på nytt. Bitane står i ei rad og går i kvarandre. */}
        <span ref={boks} className="relative ml-1">
          <button
            type="button"
            onClick={() => setMeny((m) => !m)}
            aria-expanded={meny}
            aria-label="kroppen"
            title="kroppen: legg til eit primitiv, eller hent ei fil"
            className={CHIP + " block max-w-[108px] truncate px-2.5 text-left"}
            style={chipStyle(meny)}
            data-kjelde=""
          >
            {bitar > 1 ? `${kjelde} +${bitar - 1}` : kjelde}
          </button>
          {meny && (
            <span className="absolute left-0 top-[calc(100%+6px)] z-40 flex w-36 flex-col border" style={{ ...HAIR, background: "var(--paper)" }} data-meny="">
              {PRIMITIV.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { onLegg(id); setMeny(false) }}
                  title={`legg ${id} til kroppen`}
                  className="hit border-b px-3 py-2.5 text-left text-[11px] leading-none"
                  style={HAIR}
                >
                  {id}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { pick.current?.click(); setMeny(false) }}
                title={`hent eit nett: ${FORMAT.join(" ")}`}
                className="hit px-3 py-2.5 text-left text-[11px] leading-none"
              >
                fil
              </button>
              {bitar > 1 && (
                <button
                  type="button"
                  onClick={() => { onTom(); setMeny(false) }}
                  title="attende til kjelda åleine"
                  className="hit border-t px-3 py-2.5 text-left text-[11px] leading-none"
                  style={{ ...HAIR, color: "var(--warn)" }}
                >
                  tøm
                </button>
              )}
            </span>
          )}
        </span>
        <span className="mx-auto flex items-center gap-1">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" title={v.hint} aria-pressed={view === v.id} onClick={() => onView(v.id)} className={CHIP + " px-2"} style={chipStyle(view === v.id)}>{v.label}</button>
          ))}
        </span>
        <button type="button" onClick={onShare} aria-label="del" title="lenkja ber innstillingane, ikkje nettet" className={ICON_BTN} style={{ ...HAIR, color: "var(--ink)" }}>{IcoShare}</button>
        {benk && <a href="https://iverfinne.no" target="_blank" rel="noopener noreferrer" className="pl-2 text-[11px] tracking-wide opacity-60 hover:opacity-100">iverfinne.no</a>}
      </div>
    </header>
  )
}
