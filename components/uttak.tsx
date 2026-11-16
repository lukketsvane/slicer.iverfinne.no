"use client"

import { useEffect, useRef, useState } from "react"
import type { ExportKind, Metrics, Rule, View } from "@/lib/core"
import { useMaal, mt, UTTAK_EN, omsetBolk } from "@/lib/i18n"
import { CHIP, HAIR, UTTAK, chipStyle, stengd } from "./deler"

export function SnarUttak({
  view,
  metrics,
  rules,
  busy,
  onExport,
  standard,
  kompakt = false,
}: {
  view: View
  metrics: Metrics | null
  rules: readonly Rule[]
  busy: boolean
  onExport: (k: ExportKind) => void
  standard?: ExportKind
  kompakt?: boolean
}) {
  const maal = useMaal()
  const def: ExportKind = standard ?? (view === "kontur" ? "dxf" : "stl")
  const [open, setOpen] = useState(false)
  const [peikt, setPeikt] = useState<ExportKind | null>(null)
  const [pos, setPos] = useState<{ right: number; bottom: number }>({ right: 12, bottom: 64 })
  const timer = useRef<number>(0)
  const lang = useRef(false)
  const varOpen = useRef(false)
  const boks = useRef<HTMLDivElement | null>(null)
  const knappRef = useRef<HTMLButtonElement | null>(null)

  const alle = UTTAK.flatMap((g) =>
    g.filer.map((f) => ({
      ...f,
      bolk: g.bolk,
      label: maal === "nn" ? f.label : (UTTAK_EN[f.id]?.label ?? f.label),
      hint: maal === "nn" ? f.hint : (UTTAK_EN[f.id]?.hint ?? f.hint),
    })),
  )

  const målPos = () => {
    const r = knappRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({
      right: Math.max(12, Math.round(window.innerWidth - r.right)),
      bottom: Math.max(56, Math.round(window.innerHeight - r.top + 6)),
    })
  }

  useEffect(() => {
    if (!open) return
    målPos()
    const ute = (e: PointerEvent) => {
      if (!boks.current?.contains(e.target as Node)) setOpen(false)
    }
    const tast = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("pointerdown", ute, true)
    window.addEventListener("keydown", tast, true)
    window.addEventListener("resize", målPos)
    return () => {
      window.removeEventListener("pointerdown", ute, true)
      window.removeEventListener("keydown", tast, true)
      window.removeEventListener("resize", målPos)
    }
  }, [open])

  const harde = rules.filter((r) => r.hard && !r.ok)
  const stoppDef = stengd(def, metrics, maal)
  const defLabel = maal === "nn" ? (alle.find((x) => x.id === def)?.label ?? def) : (UTTAK_EN[def]?.label ?? def)

  const finnUnder = (cx: number, cy: number): ExportKind | null => {
    const el = document.elementFromPoint(cx, cy)?.closest<HTMLElement>("[data-uttak-val]")
    return (el?.dataset.uttakVal as ExportKind | undefined) ?? null
  }

  return (
    <div ref={boks} className="relative inline-flex items-center" data-snaruttak="">
      <button
        ref={knappRef}
        type="button"
        disabled={busy}
        aria-expanded={open}
        aria-label={mt(maal, `quick export (${defLabel}) — hold for formats`, `snaruttak (${defLabel}) — hald inne for format`)}
        title={mt(maal, `tap: download ${defLabel.toUpperCase()} · hold & slide: choose format`, `trykk: last ned ${defLabel.toUpperCase()} · hald og dra: vel format`)}
        className={
          kompakt
            ? "hit tab flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] uppercase tracking-[0.08em]"
            : CHIP + " flex items-center gap-1.5 uppercase tracking-[0.1em]"
        }
        style={{
          ...chipStyle(open),
          ...(!open && !stoppDef && harde.length ? { color: "var(--warn)" } : {}),
          touchAction: "none",
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          målPos()
          setPeikt(def)
          setOpen((v) => !v)
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          varOpen.current = open
          lang.current = false
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {}
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            lang.current = true
            målPos()
            setPeikt(def)
            setOpen(true)
          }, 220)
        }}
        onPointerMove={(e) => {
          if (!lang.current && !open) return
          const under = finnUnder(e.clientX, e.clientY)
          if (under) setPeikt(under)
        }}
        onPointerUp={(e) => {
          window.clearTimeout(timer.current)
          if (lang.current) {
            const val = finnUnder(e.clientX, e.clientY) ?? peikt
            setOpen(false)
            setPeikt(null)
            lang.current = false
            if (val && !stengd(val, metrics, maal)) onExport(val)
            return
          }
          if (varOpen.current) {
            setOpen(false)
            setPeikt(null)
            return
          }
          if (!stoppDef) onExport(def)
          else {
            målPos()
            setOpen(true)
          }
        }}
        onPointerCancel={() => {
          window.clearTimeout(timer.current)
          lang.current = false
        }}
      >
        <span>{defLabel}</span>
        <span aria-hidden="true" className="text-[8px] opacity-55">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={mt(maal, "export formats", "uttaksformat")}
          className="rull fixed z-50 flex max-h-[68dvh] w-44 flex-col rounded-2xl border py-1.5"
          style={{ ...HAIR, right: pos.right, bottom: pos.bottom, background: "var(--paper)", color: "var(--ink)" }}
        >
          {UTTAK.map((g) => (
            <div key={g.bolk} className="border-b py-1 last:border-b-0" style={HAIR}>
              <div className="dim px-3 pb-0.5 text-[9px] uppercase tracking-[0.16em]">{omsetBolk(maal, g.bolk)}</div>
              {g.filer.map((x) => {
                const stopp = stengd(x.id, metrics, maal)
                const erPeikt = peikt === x.id
                const lbl = maal === "nn" ? x.label : (UTTAK_EN[x.id]?.label ?? x.label)
                const hnt = maal === "nn" ? x.hint : (UTTAK_EN[x.id]?.hint ?? x.hint)
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="menuitem"
                    disabled={busy || !!stopp}
                    data-uttak-val={x.id}
                    title={stopp || hnt}
                    onPointerEnter={() => setPeikt(x.id)}
                    onClick={() => {
                      setOpen(false)
                      if (!stopp) onExport(x.id)
                    }}
                    className="hit flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] uppercase tracking-[0.08em]"
                    style={{
                      background: erPeikt ? "var(--ink)" : undefined,
                      color: erPeikt ? "var(--paper)" : !stopp && harde.length ? "var(--warn)" : "var(--ink)",
                      opacity: stopp ? 0.3 : 1,
                    }}
                  >
                    <span>{lbl}</span>
                    {x.id === def && <span className="text-[9px] opacity-60">●</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
