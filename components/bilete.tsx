"use client"

import { useMemo, useRef, useState } from "react"
import { bileteForm, type BileteForm, type BileteVal, type Maske } from "@/lib/bilete"
import { omrissLine } from "@/lib/plan"
import { ORD } from "./deler"

const SIDE = 220

export async function lesBilete(fil: Blob): Promise<{ maske: Maske; url: string }> {
  const bm = await createImageBitmap(fil)
  const k = Math.min(1, SIDE / Math.max(bm.width, bm.height))
  const w = Math.max(2, Math.round(bm.width * k)), h = Math.max(2, Math.round(bm.height * k))
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const x = c.getContext("2d")!
  x.fillStyle = "#fff"
  x.fillRect(0, 0, w, h)
  x.drawImage(bm, 0, 0, w, h)
  bm.close()
  const d = x.getImageData(0, 0, w, h).data
  const lys = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) lys[i] = (0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2]) / 255
  return { maske: { lys, w, h }, url: c.toDataURL("image/png") }
}

const bane = (p: readonly [number, number][]) => `M${p.map(([x, y]) => `${x.toFixed(4)},${(-y).toFixed(4)}`).join("L")}Z`

export function BileteInn({ maske, url, onLegg, onAvbryt }: { maske: Maske; url: string; onLegg: (f: BileteForm) => void; onAvbryt: () => void }) {
  const [val, setVal] = useState<BileteVal>({ terskel: 0.5, mjuk: 1, snu: false })
  const drag = useRef<{ id: number; x: number; y: number; v: BileteVal } | null>(null)
  const form = useMemo(() => bileteForm(maske, val), [maske, val])
  const s = 1 / Math.max(maske.w, maske.h)
  const bw = maske.w * s, bh = maske.h * s
  return (
    <section
      aria-label="bilete"
      className="absolute inset-0 z-30 flex flex-col"
      style={{ background: "var(--paper)", touchAction: "none" }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest("button")) return
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, v: val }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        setVal({ ...d.v, terskel: Math.max(0.02, Math.min(0.98, d.v.terskel + (e.clientX - d.x) / 400)), mjuk: Math.max(0, Math.min(12, d.v.mjuk - (e.clientY - d.y) / 30)) })
      }}
      onPointerUp={() => { drag.current = null }}
      onPointerCancel={() => { drag.current = null }}
    >
      <div className="tab flex justify-center gap-6 pt-16 text-[11px] tracking-[0.04em]" data-lesing="">
        <span>terskel {Math.round(val.terskel * 100)}</span>
        <span>mjuk {Math.round(val.mjuk)}</span>
        <span>{form ? `${form.omriss.length} punkt · ${form.hol.length} hòl` : "inga form"}</span>
      </div>
      <svg className="min-h-0 flex-1" viewBox={`${-bw / 2 - 0.03} ${-bh / 2 - 0.03} ${bw + 0.06} ${bh + 0.06}`} aria-hidden="true">
        <image href={url} x={-bw / 2} y={-bh / 2} width={bw} height={bh} opacity={0.25} style={{ imageRendering: "pixelated" }} />
        {form && (
          <path
            d={[bane(omrissLine(form.omriss, form.runde)), ...form.hol.map((st) => bane((st.punkt ?? []).map(([x, y]) => [st.x + x * st.w, st.y + y * st.h])))].join(" ")}
            fill="var(--ink)"
            fillOpacity={0.12}
            fillRule="evenodd"
            stroke="var(--ink)"
            strokeWidth={0.004}
          />
        )}
      </svg>
      <div className="flex items-center justify-between gap-4 px-4 pb-10">
        <button type="button" className={ORD} onClick={onAvbryt}>avbryt</button>
        <button type="button" className={ORD} aria-pressed={val.snu} onClick={() => setVal((v) => ({ ...v, snu: !v.snu }))}>snu</button>
        <button type="button" className={ORD + " min-w-16"} disabled={!form} onClick={() => form && onLegg(form)}>legg inn</button>
      </div>
    </section>
  )
}
