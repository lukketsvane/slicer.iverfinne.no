"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import type { ExportKind, Metrics, Rule, View } from "@/lib/core"
import { useMaal, mt, UTTAK_EN, omsetBolk } from "@/lib/i18n"
import { HAIR, UTTAK, stengd } from "./deler"

export type VeljarVal = {
  id: string
  bolk?: string
  label: string
  hint?: string
  hex?: string
  disabled?: boolean
}

export function HoldVeljar({
  items,
  activeId,
  disabled = false,
  ariaLabel,
  title,
  menuLabel,
  wrapAttr,
  knappAttr,
  valAttr = "data-veljar-val",
  className = "hit tab flex h-7 shrink-0 items-center gap-1 px-1.5 text-[10px]",
  onTap,
  onSelect,
  children,
}: {
  items: readonly VeljarVal[]
  activeId: string
  disabled?: boolean
  ariaLabel: string
  title?: string
  menuLabel: string
  wrapAttr?: string
  knappAttr?: string
  valAttr?: string
  className?: string
  onTap: () => void
  onSelect: (id: string) => void
  children: (open: boolean) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [peikt, setPeikt] = useState<string | null>(null)
  const [pos, setPos] = useState<{ right: number; bottom?: number; top?: number }>({ right: 12, bottom: 64 })
  const timer = useRef<number>(0)
  const lang = useRef(false)
  const varOpen = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const boks = useRef<HTMLDivElement | null>(null)
  const knappRef = useRef<HTMLButtonElement | null>(null)

  const målPos = () => {
    const r = knappRef.current?.getBoundingClientRect()
    if (!r) return
    const right = Math.max(12, Math.min(window.innerWidth - 188, Math.round(window.innerWidth - r.right)))
    if (r.top < window.innerHeight * 0.45 && window.innerHeight - r.bottom > 220) {
      setPos({ right, top: Math.round(r.bottom + 6) })
    } else {
      setPos({ right, bottom: Math.max(52, Math.round(window.innerHeight - r.top + 6)) })
    }
  }

  useEffect(() => {
    if (!open) return
    målPos()
    const ute = (e: PointerEvent) => { if (!boks.current?.contains(e.target as Node)) setOpen(false) }
    const tast = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("pointerdown", ute, true)
    window.addEventListener("keydown", tast, true)
    window.addEventListener("resize", målPos)
    return () => {
      window.removeEventListener("pointerdown", ute, true)
      window.removeEventListener("keydown", tast, true)
      window.removeEventListener("resize", målPos)
    }
  }, [open])

  const finnUnder = (cx: number, cy: number): string | null => {
    const el = document.elementFromPoint(cx, cy)?.closest<HTMLElement>(`[${valAttr}]`)
    return el?.getAttribute(valAttr) ?? null
  }

  const bolkar = items.reduce<{ bolk: string; list: VeljarVal[] }[]>((acc, item) => {
    const k = item.bolk ?? ""
    const prev = acc[acc.length - 1]
    if (prev && prev.bolk === k) prev.list.push(item)
    else acc.push({ bolk: k, list: [item] })
    return acc
  }, [])

  const wrapProps = wrapAttr ? { [wrapAttr]: "" } : {}
  const knappProps = knappAttr ? { [knappAttr]: "" } : {}

  return (
    <div ref={boks} className="relative inline-flex items-center" {...wrapProps}>
      <button
        ref={knappRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        className={className}
        style={{ color: "var(--ink)", touchAction: "none" }}
        {...knappProps}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          målPos()
          setPeikt(activeId)
          setOpen((v) => !v)
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          varOpen.current = open
          lang.current = false
          start.current = { x: e.clientX, y: e.clientY }
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            lang.current = true
            målPos()
            setPeikt(activeId)
            setOpen(true)
          }, 220)
        }}
        onPointerMove={(e) => {
          if (!lang.current && !open) {
            if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) {
              window.clearTimeout(timer.current)
              start.current = null
            }
            return
          }
          const under = finnUnder(e.clientX, e.clientY)
          if (under) setPeikt(under)
        }}
        onPointerUp={(e) => {
          window.clearTimeout(timer.current)
          const st = start.current
          start.current = null
          if (lang.current) {
            const val = finnUnder(e.clientX, e.clientY) ?? peikt
            setOpen(false)
            setPeikt(null)
            lang.current = false
            const hit = val ? items.find((x) => x.id === val) : undefined
            if (hit && !hit.disabled) onSelect(hit.id)
            return
          }
          if (varOpen.current) {
            setOpen(false)
            setPeikt(null)
            return
          }
          if (!st) return
          const cur = items.find((x) => x.id === activeId)
          if (cur?.disabled) {
            målPos()
            setPeikt(activeId)
            setOpen(true)
          } else {
            onTap()
          }
        }}
        onPointerCancel={() => {
          window.clearTimeout(timer.current)
          lang.current = false
          start.current = null
        }}
      >
        {children(open)}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={menuLabel}
          className="rull fixed z-50 flex max-h-[68dvh] w-44 flex-col rounded-2xl border py-1.5"
          style={{ ...HAIR, right: pos.right, top: pos.top, bottom: pos.bottom, background: "var(--paper)", color: "var(--ink)" }}
        >
          {bolkar.map((g) => (
            <div key={g.bolk} className="border-b py-1 last:border-b-0" style={HAIR}>
              {g.bolk && <div className="dim px-3 pb-0.5 text-[9px] uppercase tracking-[0.16em]">{g.bolk}</div>}
              {g.list.map((x) => {
                const erPeikt = peikt === x.id
                const valProps = { [valAttr]: x.id }
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="menuitem"
                    disabled={disabled || !!x.disabled}
                    title={x.hint}
                    onPointerEnter={() => setPeikt(x.id)}
                    onClick={() => {
                      setOpen(false)
                      if (!x.disabled) onSelect(x.id)
                    }}
                    className="hit flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px] tracking-[0.04em]"
                    style={{
                      background: erPeikt ? "var(--ink)" : undefined,
                      color: erPeikt ? "var(--paper)" : "var(--ink)",
                      opacity: x.disabled ? 0.3 : 1,
                    }}
                    {...valProps}
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      {x.hex && <span aria-hidden="true" className="block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: x.hex }} />}
                      <span className="truncate">{x.label}</span>
                    </span>
                    {x.id === activeId && <span className="text-[9px] opacity-60">●</span>}
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

export function SnarUttak({
  view,
  metrics,
  rules: _rules,
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
  const items: VeljarVal[] = UTTAK.flatMap((g) =>
    g.filer.map((x) => {
      const stopp = stengd(x.id, metrics, maal)
      const lbl = (maal === "nn" ? x.label : (UTTAK_EN[x.id]?.label ?? x.label)).toUpperCase()
      const hnt = maal === "nn" ? x.hint : (UTTAK_EN[x.id]?.hint ?? x.hint)
      return { id: x.id, bolk: omsetBolk(maal, g.bolk), label: lbl, hint: stopp || hnt, disabled: !!stopp }
    }),
  )
  const defLabel = (items.find((x) => x.id === def)?.label ?? def).toUpperCase()
  return (
    <HoldVeljar
      items={items}
      activeId={def}
      disabled={busy}
      wrapAttr="data-snaruttak"
      valAttr="data-uttak-val"
      ariaLabel={mt(maal, `quick export (${defLabel}) — hold for formats`, `snaruttak (${defLabel}) — hald inne for format`)}
      title={mt(maal, `tap: download ${defLabel} · hold & slide: choose format`, `trykk: last ned ${defLabel} · hald og dra: vel format`)}
      menuLabel={mt(maal, "export formats", "uttaksformat")}
      className={kompakt ? "hit tab flex h-12 shrink-0 items-center gap-1 px-1.5 text-[10px] uppercase tracking-[0.08em]" : "hit tab flex h-8 shrink-0 items-center gap-1 px-1.5 text-[11px] uppercase tracking-[0.08em]"}
      onTap={() => onExport(def)}
      onSelect={(id) => onExport(id as ExportKind)}
    >
      {(open) => (
        <span className="flex items-center gap-1" style={{ opacity: open ? 1 : 0.85 }}>
          <span>{defLabel}</span>
          <span aria-hidden="true" className="text-[8px] opacity-55">▾</span>
        </span>
      )}
    </HoldVeljar>
  )
}
