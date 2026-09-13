"use client"

import { Children, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { HAIR } from "./deler"

/** Same ink and hairline as the view tabs. The entire cell is a touch target. */
export function Faner({ label, tabs, value, onChange }: {
  label: string
  tabs: readonly { id: string; label: string; icon?: ReactNode; warn?: boolean }[]
  value: string
  onChange: (id: string) => void
}) {
  const id = useId()
  return <div role="tablist" aria-label={label} className="telefon-faner" style={HAIR}>
    {tabs.map((tab, i) => <button key={tab.id} id={`${id}-${tab.id}`} type="button" role="tab"
      aria-label={tab.label} title={tab.label} aria-selected={value === tab.id}
      tabIndex={value === tab.id ? 0 : -1} data-fane={tab.id}
      style={{ color: tab.warn ? "var(--warn)" : undefined }}
      onClick={() => onChange(tab.id)} onKeyDown={(e) => {
        const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1
        if (next < 0) return
        e.preventDefault()
        onChange(tabs[next].id)
        document.getElementById(`${id}-${tabs[next].id}`)?.focus()
      }}>{tab.icon ?? tab.label}</button>)}
  </div>
}

/** Page through rows, using the space Safari actually leaves us. Never hide a
 * control below a clipped or scrolling sheet; resizing recalculates each page. */
export function Sidevis({ children, label, rowHeight = 44, selected }: {
  children: ReactNode; label: string; rowHeight?: number; selected?: number
}) {
  const rows = Children.toArray(children)
  const el = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(88)
  const [page, setPage] = useState(0)
  const sidekant = height < rowHeight + 44
  const capacity = Math.max(1, Math.floor((height - (!sidekant && rows.length * rowHeight > height ? 44 : 0)) / rowHeight))
  const pages = Math.max(1, Math.ceil(rows.length / capacity))
  const current = Math.min(page, pages - 1)
  useEffect(() => {
    const box = el.current
    if (!box) return
    const observer = new ResizeObserver(() => setHeight(box.clientHeight))
    observer.observe(box)
    setHeight(box.clientHeight)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { if (selected !== undefined && selected >= 0) setPage(Math.floor(selected / capacity)) }, [selected, capacity])
  return <div ref={el} className="telefon-sider" data-sidekant={sidekant ? "" : undefined} role="group" aria-label={label}>
    <div className="telefon-rader">{rows.slice(current * capacity, (current + 1) * capacity)}</div>
    {pages > 1 && <div className="telefon-sideval" style={HAIR}>
      <button type="button" aria-label={`førre side: ${label}`} disabled={current === 0} onClick={() => setPage(current - 1)}><Pil bak /></button>
      <span className="tab dim" aria-live="polite">{current * capacity + 1}–{Math.min(rows.length, (current + 1) * capacity)} / {rows.length}</span>
      <button type="button" aria-label={`neste side: ${label}`} disabled={current === pages - 1} onClick={() => setPage(current + 1)}><Pil /></button>
    </div>}
  </div>
}

function Pil({ bak }: { bak?: boolean }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={bak ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} /></svg>
}
