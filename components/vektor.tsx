"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { inRing, nn, shoelace, type Pt, type Vec3 } from "@/lib/core"
import { omrissLine, omrissMidt, type Plan } from "@/lib/plan"
import { teiknaKontur, tettMjukt } from "@/lib/teikning"
import { konturStrek } from "@/lib/bilete"
import { delIto, spileAkse, spiler, flyttPunkt, flyttStrek, leggPunkt, leggStrek, blyantPunkt, rundPunkt, strekRing, takPunkt, takStrek } from "@/lib/vektor"
import { ORD } from "./deler"

type Verkty = "punkt" | "blyant" | "hol" | "firkant" | "sirkel"
type Syn = { cx: number; cy: number; ppe: number }
type Val = { slag: "punkt"; i: number } | { slag: "strek"; k: number } | null
type Drag =
  | { slag: "punkt"; id: number; i: number }
  | { slag: "strek"; id: number; k: number; fra: Pt; x0: number; y0: number }
  | { slag: "teikn"; id: number; pkt: Pt[] }
  | { slag: "boks"; id: number; a: Pt; b: Pt }
  | { slag: "syn"; id: number; px: number; py: number; syn: Syn }
  | null

const bane = (p: readonly Pt[]) => (p.length ? `M${p.map(([x, y]) => `${x.toFixed(5)},${(-y).toFixed(5)}`).join("L")}Z` : "")
const RUTE_MM = 1

export function Vektor({ plan, S, t, nyId, alle, boks, topp, onEndre, onDel, onLukk }: { plan: Plan; S: number; t: number; nyId: number; /** høgda på topplina: verktya står under henne, ikkje bak henne */ topp: number; /** dei andre plana og kroppen: spilene går den vegen plata når dei — sjå `spileAkse` */ alle: readonly Plan[]; boks: { min: Vec3; max: Vec3 } | null; onEndre: (q: Plan) => void; onDel: (fleire: Plan[]) => void; onLukk: () => void }) {
  const [utkast, setUtkast] = useState<Plan | null>(null)
  const q = utkast ?? plan
  const [verkty, setVerkty] = useState<Verkty>("punkt")
  const [spegl, setSpegl] = useState(() => !!plan.omriss && plan.omriss.every(([x, y]) => plan.omriss!.some(([a, b]) => Math.abs(a + x) < 2e-3 && Math.abs(b - y) < 2e-3)))
  const [val, setVal] = useState<Val>(null)
  const [drag, setDrag] = useState<Drag>(null)
  const svg = useRef<SVGSVGElement | null>(null)
  const [px, setPx] = useState({ w: 390, h: 600 })
  const fingrar = useRef(new Map<number, { x: number; y: number }>())
  const klyp = useRef<{ d: number; syn: Syn; mx: number; my: number } | null>(null)
  const o = useMemo(() => q.omriss ?? [], [q.omriss])
  const linje = useMemo(() => omrissLine(o, q.runde), [o, q.runde])
  const heile = (w: number, h: number): Syn => {
    const alle = [...linje, ...q.strek.flatMap((s) => strekRing(s, 8))]
    if (!alle.length) return { cx: 0, cy: 0, ppe: w }
    const xs = alle.map((p) => p[0]), ys = alle.map((p) => p[1])
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys)
    return { cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, ppe: Math.min((w - 48) / Math.max(bw, 1e-3), (h - 48) / Math.max(bh, 1e-3)) }
  }
  const [syn, setSyn] = useState<Syn | null>(null)
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const les = () => { const r = el.getBoundingClientRect(); setPx({ w: r.width, h: r.height }) }
    const ro = new ResizeObserver(les)
    ro.observe(el)
    les()
    return () => ro.disconnect()
  }, [])
  const v = syn ?? heile(px.w, px.h)
  const vb = `${v.cx - px.w / 2 / v.ppe} ${-v.cy - px.h / 2 / v.ppe} ${px.w / v.ppe} ${px.h / v.ppe}`
  const r = 1 / v.ppe
  const inn = (e: { clientX: number; clientY: number }): Pt => {
    const b = svg.current!.getBoundingClientRect()
    return [v.cx + (e.clientX - b.left - px.w / 2) / v.ppe, v.cy - (e.clientY - b.top - px.h / 2) / v.ppe]
  }
  const hakk = (p: Pt, i?: number): Pt => {
    const mm = RUTE_MM / S
    let [x, y] = [Math.round(p[0] / mm) * mm, Math.round(p[1] / mm) * mm]
    if (i !== undefined && o.length > 2) {
      for (const k of [(i + o.length - 1) % o.length, (i + 1) % o.length]) {
        if (Math.abs(o[k][0] - p[0]) * v.ppe < 6) x = o[k][0]
        if (Math.abs(o[k][1] - p[1]) * v.ppe < 6) y = o[k][1]
      }
    }
    return [x, y]
  }
  const ferdig = (ny: Plan | null) => {
    setUtkast(null)
    if (ny && ny !== plan) onEndre(ny)
  }

  const ned = (e: React.PointerEvent) => {
    const t = e.target as Element
    fingrar.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (fingrar.current.size === 2) {
      setUtkast(null)
      const [a, b] = [...fingrar.current.values()]
      klyp.current = { d: Math.hypot(a.x - b.x, a.y - b.y), syn: v, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
      setDrag(null)
      return
    }
    const p = inn(e)
    if (!syn) setSyn(v)
    const pi = t.closest("[data-vpunkt]")?.getAttribute("data-vpunkt")
    const mi = t.closest("[data-vmidt]")?.getAttribute("data-vmidt")
    const si = t.closest("[data-vstrek]")?.getAttribute("data-vstrek")
    if (pi != null) {
      setVal({ slag: "punkt", i: +pi })
      setDrag({ slag: "punkt", id: e.pointerId, i: +pi })
    } else if (mi != null) {
      const ny = leggPunkt(q, +mi, spegl)
      onEndre(ny)
      setVal({ slag: "punkt", i: +mi + 1 })
    } else if (verkty === "punkt" && si != null) {
      const s = q.strek[+si]
      setVal({ slag: "strek", k: +si })
      setDrag({ slag: "strek", id: e.pointerId, k: +si, fra: p, x0: s.x, y0: s.y })
    } else if (verkty === "hol" || verkty === "blyant") setDrag({ slag: "teikn", id: e.pointerId, pkt: [p] })
    else if (verkty !== "punkt") setDrag({ slag: "boks", id: e.pointerId, a: p, b: p })
    else {
      setVal(null)
      setDrag({ slag: "syn", id: e.pointerId, px: e.clientX, py: e.clientY, syn: v })
    }
  }
  const rorsle = (e: React.PointerEvent) => {
    if (fingrar.current.has(e.pointerId)) fingrar.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const k = klyp.current
    if (k && fingrar.current.size === 2) {
      const [a, b] = [...fingrar.current.values()]
      const ppe = Math.max(k.syn.ppe / 8, Math.min(k.syn.ppe * 20, (k.syn.ppe * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, k.d)))
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      setSyn({ ppe, cx: k.syn.cx - (mx - k.mx) / ppe, cy: k.syn.cy + (my - k.my) / ppe })
      return
    }
    const d = drag
    if (!d || d.id !== e.pointerId) return
    const p = inn(e)
    if (d.slag === "punkt") setUtkast(flyttPunkt(plan, d.i, hakk(p, d.i), spegl))
    else if (d.slag === "strek") setUtkast(flyttStrek(plan, d.k, d.x0 + p[0] - d.fra[0], d.y0 + p[1] - d.fra[1]))
    else if (d.slag === "teikn") setDrag({ ...d, pkt: [...d.pkt, p] })
    else if (d.slag === "boks") setDrag({ ...d, b: p })
    else setSyn({ ...d.syn, cx: d.syn.cx - (e.clientX - d.px) / d.syn.ppe, cy: d.syn.cy + (e.clientY - d.py) / d.syn.ppe })
  }
  const opp = (e: React.PointerEvent) => {
    fingrar.current.delete(e.pointerId)
    if (fingrar.current.size < 2) klyp.current = null
    const d = drag
    if (!d || d.id !== e.pointerId) return
    setDrag(null)
    if (d.slag === "punkt" || d.slag === "strek") return ferdig(utkast)
    const inni = (ring: readonly Pt[]) => ring.every((p) => inRing(linje, p))
    if (d.slag === "teikn" && verkty === "blyant") {
      const ny = blyantPunkt(q, d.pkt, 1.25 / v.ppe, 16 / v.ppe)
      if (ny !== q) {
        onEndre(ny)
        setVal(null)
      }
    } else if (d.slag === "teikn") {
      const k = teiknaKontur(d.pkt, 1.25 / v.ppe)
      if (k && inni(k)) {
        onEndre(leggStrek(q, konturStrek(tettMjukt(k))))
        setVal({ slag: "strek", k: q.strek.length })
      }
    } else if (d.slag === "boks") {
      const w = Math.abs(d.b[0] - d.a[0]), h = Math.abs(d.b[1] - d.a[1])
      if (w * v.ppe < 8 || h * v.ppe < 8) return
      const [cx, cy] = hakk([(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2])
      const s = { slag: "hol" as const, form: verkty === "sirkel" ? ("rund" as const) : ("rekt" as const), x: cx, y: cy, w: +w.toFixed(4), h: +h.toFixed(4), a: 0 }
      if (inni(strekRing(s, 16))) {
        onEndre(leggStrek(q, s))
        setVal({ slag: "strek", k: q.strek.length })
      }
    }
  }
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const hjul = (e: WheelEvent) => {
      e.preventDefault()
      setSyn((s0) => {
        const s = s0 ?? v
        return { ...s, ppe: Math.max(1, s.ppe * Math.exp(-e.deltaY / 400)) }
      })
    }
    el.addEventListener("wheel", hjul, { passive: false })
    return () => el.removeEventListener("wheel", hjul)
  })

  const xs = linje.map((p) => p[0]), ys = linje.map((p) => p[1])
  const mal = linje.length ? `${nn((Math.max(...xs) - Math.min(...xs)) * S, 0)} × ${nn((Math.max(...ys) - Math.min(...ys)) * S, 0)} mm` : "inga form"
  const vp = val?.slag === "punkt" && o[val.i] ? o[val.i] : null
  const rund = new Set(q.runde ?? [])
  return (
    <section aria-label="2d-flata" className="absolute inset-0 z-30 flex flex-col" style={{ background: "var(--paper)", touchAction: "none" }}>
      <div className="flex items-center justify-between gap-1 px-3" style={{ paddingTop: topp + 6 }} role="group" aria-label="vektorverkty">
        {(["punkt", "blyant", "hol", "firkant", "sirkel"] as const).map((k) => (
          <button key={k} type="button" className={ORD} aria-pressed={verkty === k} title={k === "blyant" ? "teikn over ein bit av omrisset: streken byter ut den biten du dreg langs" : undefined} onClick={() => setVerkty(k)}>{k === "hol" ? "hòl" : k}</button>
        ))}
        <button type="button" className={ORD} aria-pressed={spegl} onClick={() => setSpegl((s) => !s)}>spegl</button>
        <button type="button" className={ORD} onClick={onLukk}>ferdig</button>
      </div>
      <div className="tab flex justify-center gap-4 text-[11px] tracking-[0.04em]" data-lesing="">
        <span>{mal}</span>
        {vp && <span>{nn(vp[0] * S, 1)}, {nn(vp[1] * S, 1)}</span>}
        <span>{o.length} punkt · {q.strek.length} hòl</span>
      </div>
      <svg ref={svg} className="min-h-0 flex-1" viewBox={vb} onPointerDown={ned} onPointerMove={rorsle} onPointerUp={opp} onPointerCancel={opp} onDoubleClick={() => setSyn(null)}>
        <path d={[bane(linje), ...q.strek.filter((s) => s.slag === "hol").map((s) => bane(strekRing(s)))].join(" ")} fillRule="evenodd" fill="var(--ink)" fillOpacity={0.08} stroke="var(--ink)" strokeWidth={1.5 * r} />
        {q.strek.map((s, k) => (
          <path key={k} data-vstrek={k} d={bane(strekRing(s))} fill="transparent" stroke="var(--ink)" strokeWidth={(val?.slag === "strek" && val.k === k ? 3 : 1) * r} strokeDasharray={s.slag === "gods" ? `${4 * r} ${3 * r}` : undefined} />
        ))}
        {verkty === "punkt" && o.map((_, i) => {
          if (o.length >= 48) return null
          const [mx, my] = omrissMidt(o, rund, i)
          return <circle key={`m${i}`} data-vmidt={i} cx={mx} cy={-my} r={4 * r} fill="var(--paper)" stroke="var(--ink)" strokeWidth={r} opacity={0.5} />
        })}
        {verkty === "punkt" && o.map(([x, y], i) => (
          <g key={`p${i}`} data-vpunkt={i}>
            <circle cx={x} cy={-y} r={16 * r} fill="transparent" />
            {rund.has(i)
              ? <circle cx={x} cy={-y} r={6 * r} fill={val?.slag === "punkt" && val.i === i ? "var(--ink)" : "var(--paper)"} stroke="var(--ink)" strokeWidth={2 * r} />
              : <rect x={x - 5.5 * r} y={-y - 5.5 * r} width={11 * r} height={11 * r} fill={val?.slag === "punkt" && val.i === i ? "var(--ink)" : "var(--paper)"} stroke="var(--ink)" strokeWidth={2 * r} />}
          </g>
        ))}
        {spegl && <line x1={0} x2={0} y1={-10} y2={10} stroke="var(--ink)" strokeWidth={r} strokeDasharray={`${6 * r} ${6 * r}`} opacity={0.3} pointerEvents="none" />}
        {drag?.slag === "teikn" && <polyline points={drag.pkt.map(([x, y]) => `${x},${-y}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth={1.5 * r} />}
        {drag?.slag === "boks" && (verkty === "sirkel"
          ? <ellipse cx={(drag.a[0] + drag.b[0]) / 2} cy={-(drag.a[1] + drag.b[1]) / 2} rx={Math.abs(drag.b[0] - drag.a[0]) / 2} ry={Math.abs(drag.b[1] - drag.a[1]) / 2} fill="none" stroke="var(--ink)" strokeWidth={1.5 * r} />
          : <rect x={Math.min(drag.a[0], drag.b[0])} y={-Math.max(drag.a[1], drag.b[1])} width={Math.abs(drag.b[0] - drag.a[0])} height={Math.abs(drag.b[1] - drag.a[1])} fill="none" stroke="var(--ink)" strokeWidth={1.5 * r} />)}
      </svg>
      <div className="flex min-h-[64px] items-center justify-end gap-4 px-4 pb-8">
        {val?.slag === "punkt" && (
          <>
            <button type="button" className={ORD} aria-pressed={rund.has(val.i)} onClick={() => onEndre(rundPunkt(q, val.i, spegl))}>rund</button>
            <button type="button" className={ORD} disabled={o.length <= 3} onClick={() => { onEndre(takPunkt(q, val.i, spegl)); setVal(null) }}>slett punkt</button>
          </>
        )}
        {val?.slag === "strek" && (
          <button type="button" className={ORD} onClick={() => { onEndre(takStrek(q, val.k)); setVal(null) }}>slett hòl</button>
        )}
        {!val && (
          <>
            <button type="button" className={ORD} title="del plata i to, kant i kant — dei får fingrar" onClick={() => { const d = delIto(q, nyId); if (d) { onDel(d); setSyn(null) } }}>del i to</button>
            <span className="text-[11px] opacity-50">spiler</span>
            {[3, 4, 5, 6].map((n) => (
              <button key={n} type="button" className={ORD + " w-8"} aria-label={`${n} spiler`} title={`${n} like breie spiler med ei tjukn luft imellom`} onClick={() => { const d = spiler(q, n, t / S, nyId, boks ? spileAkse(q, alle, boks.min, boks.max, S, t) : null); if (d) { onDel(d); setSyn(null) } }}>{n}</button>
            ))}
          </>
        )}
        {!val && <span className="text-[11px] opacity-50">{Math.abs(shoelace(linje)) > 0 ? `${nn((Math.abs(shoelace(linje)) * S * S) / 100, 0)} cm²` : ""}</span>}
      </div>
    </section>
  )
}
