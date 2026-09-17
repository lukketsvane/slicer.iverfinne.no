"use client"
import { useEffect, useRef, type ReactElement } from "react"
import { HAIR } from "./deler"

export type MenyLine = {
  ord: string
  tast?: string
  gjer?: () => void
}

export type MenyStad = { x: number; y: number; liner: MenyLine[] }

export function Meny({ stad, onLukk }: { stad: MenyStad | null; onLukk: () => void }): ReactElement | null {
  const boks = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!stad) return
    const av = (e: Event) => {
      const t = e.target
      if (t instanceof Element && t.closest("[data-meny]")) return
      onLukk()
    }
    const tast = (e: KeyboardEvent) => { if (e.key === "Escape") onLukk() }
    window.addEventListener("pointerdown", av, { capture: true })
    window.addEventListener("wheel", av, { passive: true })
    window.addEventListener("resize", av)
    window.addEventListener("keydown", tast)
    return () => {
      window.removeEventListener("pointerdown", av, { capture: true })
      window.removeEventListener("wheel", av)
      window.removeEventListener("resize", av)
      window.removeEventListener("keydown", tast)
    }
  }, [stad, onLukk])

  useEffect(() => {
    const el = boks.current
    if (!el || !stad) return
    const r = el.getBoundingClientRect()
    const x = Math.max(4, Math.min(stad.x, innerWidth - r.width - 4))
    const y = Math.max(4, Math.min(stad.y, innerHeight - r.height - 4))
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [stad])

  if (!stad) return null
  return (
    <div
      ref={boks}
      data-meny=""
      role="menu"
      className="fixed z-50 min-w-[136px] rounded-lg border py-1"
      style={{ ...HAIR, left: stad.x, top: stad.y, background: "var(--paper)" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stad.liner.map((l) => (
        <button
          key={l.ord}
          type="button"
          role="menuitem"
          disabled={!l.gjer}
          data-meny-line={l.ord}
          className="hit flex w-full items-center gap-4 px-3 py-1.5 text-left text-[11px]"
          style={l.gjer ? undefined : { opacity: 0.3 }}
          onClick={() => {
            l.gjer?.()
            onLukk()
          }}
        >
          <span className="min-w-0 flex-1 truncate">{l.ord}</span>
          {l.tast && <span className="tab dim shrink-0 text-[10px]">{l.tast}</span>}
        </button>
      ))}
    </div>
  )
}
