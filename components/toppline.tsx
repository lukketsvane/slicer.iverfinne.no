"use client"

import { useEffect, useRef, useState, type JSX } from "react"
import type { View } from "@/lib/core"
import { FORMAT } from "@/lib/io"
export const BILETE = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"] as const
import { FORMER } from "@/lib/scene"
import { HAIR, ICON_BTN, ORD, IcoAngre, IcoGjerOm, IcoShare, VIEWS } from "./deler"

export function Toppline({ benk, kjelde, bitar, byt, view, onView, montasjeOk, hopHint, onFile, bibliotek, onLeggLagra, onLegg, onTom, onTomArbeidsflate, onAngre, kanAngre, onGjerOm, kanGjerOm, onShare, onHogd }: {
  benk: boolean
  kjelde: string
  bitar: number
  byt: string
  view: View
  onView: (v: View) => void
  montasjeOk: boolean
  hopHint: string
  onFile: (f: File[]) => void
  bibliotek: readonly { id: string; label: string }[]
  onLeggLagra: (id: string) => void
  onLegg: (id: string) => void
  onTom: () => void
  onTomArbeidsflate: () => void
  onAngre: () => void
  kanAngre: boolean
  onGjerOm: () => void
  kanGjerOm: boolean
  onShare: () => void
  onHogd: (px: number) => void
}): JSX.Element {
  const pick = useRef<HTMLInputElement | null>(null)
  const el = useRef<HTMLElement | null>(null)
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
      style={{ ...HAIR, background: "var(--paper)", color: "var(--ink)", paddingTop: "env(safe-area-inset-top)", zIndex: meny ? 50 : undefined }}
    >
      <input ref={pick} type="file" multiple accept={[...FORMAT, ...BILETE].join(",")} className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) onFile(f); e.target.value = "" }} />
      <div className="flex h-11 items-center gap-1 px-2">
        <button type="button" onClick={onAngre} disabled={!kanAngre} aria-label="angre" title="angre siste endring (Z)" className={ICON_BTN}>{IcoAngre}</button>
        <button type="button" onClick={onGjerOm} disabled={!kanGjerOm} aria-label="gjer om" title="gjer om det du angra (⇧Z)" className={ICON_BTN}>{IcoGjerOm}</button>
        <span ref={boks} className="relative ml-1 min-w-0">
          <button
            type="button"
            onClick={() => setMeny((m) => !m)}
            aria-expanded={meny}
            aria-label="kroppen"
            title={byt ? "kroppen: byt forma i den valde biten, eller hent ei fil i han" : "kroppen: legg til ei form, eller hent ei fil"}
            className={ORD + " block w-full max-w-[108px] truncate text-left"}
            data-kjelde=""
          >
            {bitar > 1 ? `${kjelde} +${bitar - 1}` : kjelde}
          </button>
          {meny && (
            <span
              className="rull absolute left-0 top-[calc(100%+6px)] z-40 flex w-36 flex-col border"
              style={{ ...HAIR, background: "var(--paper)", maxHeight: "calc(100dvh - 100% - 6px - env(safe-area-inset-top) - 8px)" }}
              data-meny=""
            >
              <button type="button" onClick={() => { onTomArbeidsflate(); setMeny(false) }} className="hit border-b px-3 py-3 text-left text-[11px] leading-none" style={HAIR}>tom arbeidsflate</button>
              {FORMER.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { onLegg(id); setMeny(false) }}
                  title={byt === id ? `neste ${id}` : byt ? `byt den valde biten til ${id}` : `legg ${id} til kroppen`}
                  className="hit border-b px-3 py-2.5 text-left text-[11px] leading-none"
                  style={HAIR}
                >
                  {id}
                </button>
              ))}
              {bibliotek.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  data-lagra={v.id}
                  onClick={() => { onLeggLagra(v.id); setMeny(false) }}
                  title={byt ? `byt den valde biten til ${v.label}` : `legg ${v.label} til kroppen`}
                  className="hit border-b px-3 py-2.5 text-left text-[11px] leading-none"
                  style={{ ...HAIR, borderTopWidth: v === bibliotek[0] ? 1 : undefined }}
                >
                  <span className="block truncate">{v.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { pick.current?.click(); setMeny(false) }}
                title={byt ? `hent eit nett i den valde biten: ${FORMAT.join(" ")}` : `hent eit nett eller eit bilete: ${[...FORMAT, ...BILETE].join(" ")}`}
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
        <span role="tablist" aria-label="lesemåte" className="mx-auto flex items-center">
          {VIEWS.map((v) => {
            const av = v.id === "montasje" && !montasjeOk
            return (
              <button key={v.id} type="button" role="tab" title={av ? hopHint : v.hint} aria-selected={view === v.id} disabled={av} data-fane={v.id} onClick={() => onView(v.id)} className={ORD} style={av ? { opacity: 0.25 } : undefined}>{v.label}</button>
            )
          })}
        </span>
        <button type="button" onClick={onShare} aria-label="del" title="lenkja ber innstillingane, ikkje nettet" className={ICON_BTN}>{IcoShare}</button>
        {benk && <a href="https://iverfinne.no" target="_blank" rel="noopener noreferrer" className="pl-2 text-[11px] tracking-wide opacity-60 hover:opacity-100">iverfinne.no</a>}
      </div>
    </header>
  )
}
