import { bbox, inRing, type Pt } from "./core"
import { anchor, pack, apply, type Fest, type Slot } from "./pack"
import { fitSize, strokesAt } from "./stroke"
import type { Del as Part } from "./snitt"

export type Placed = {
  part: Part
  slot: Slot
  label: { p: Pt; room: number; wide: number }
}
export type Sheet = { placed: Placed[]; used: number }
export type Nesting = {
  sheets: Sheet[]
  sheetW: number
  sheetH: number
  util: number
  spilt: number
  kross: number
}

type Mat2 = [number, number, number, number, number, number]

const ID2: Mat2 = [1, 0, 0, 0, 1, 0]
const rotMat = (th: number): Mat2 => {
  const c = Math.cos(th)
  const s = Math.sin(th)
  return [c, -s, 0, s, c, 0]
}
const mulMat = (a: Mat2, b: Mat2): Mat2 => [
  a[0] * b[0] + a[1] * b[3],
  a[0] * b[1] + a[1] * b[4],
  a[0] * b[2] + a[1] * b[5] + a[2],
  a[3] * b[0] + a[4] * b[3],
  a[3] * b[1] + a[4] * b[4],
  a[3] * b[2] + a[4] * b[5] + a[5],
]

function hull2D(pts: readonly Pt[]): Pt[] {
  if (pts.length <= 3) return [...pts]
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = []
  for (const p of s) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop()
    lo.push(p)
  }
  const hi: Pt[] = []
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop()
    hi.push(p)
  }
  lo.pop()
  hi.pop()
  return [...lo, ...hi]
}

function autoAngle(outline: Pt[], sheetW: number, sheetH: number, gap: number): Mat2 {
  if (outline.length < 3) return ID2
  const b0 = bbox(outline)
  const w0 = b0.x1 - b0.x0
  const h0 = b0.y1 - b0.y0
  const area0 = w0 * h0
  if (area0 < 1e-3) return ID2
  const romW = Math.max(0, sheetW - 2 * gap)
  const romH = Math.max(0, sheetH - 2 * gap)
  const passerOrt0 = (w0 <= romW && h0 <= romH) || (h0 <= romW && w0 <= romH)
  const h = hull2D(outline)
  const vinklar: number[] = []
  for (let i = 0; i < h.length; i++) {
    const a = h[i]
    const b = h[(i + 1) % h.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    if (dx * dx + dy * dy > 1e-6) vinklar.push(-Math.atan2(dy, dx))
  }
  if (!passerOrt0 && romW > 0 && romH > 0) {
    const dAng = Math.atan2(romH, romW)
    vinklar.push(dAng, -dAng)
  }
  let bestTh = 0
  let bestArea = area0
  let bestPass = passerOrt0
  for (const rawTh of vinklar) {
    for (const th of [rawTh, rawTh + Math.PI / 2]) {
      const c = Math.cos(th)
      const s = Math.sin(th)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const p of h) {
        const x = p[0] * c - p[1] * s
        const y = p[0] * s + p[1] * c
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
      const w = x1 - x0
      const hh = y1 - y0
      const area = w * hh
      const pass = (w <= romW && hh <= romH) || (hh <= romW && w <= romH)
      if ((pass && !bestPass) || (pass === bestPass && area < bestArea - 1e-3)) {
        bestArea = area
        bestTh = th
        bestPass = pass
      }
    }
  }
  if (bestPass === passerOrt0 && bestArea > area0 * 0.9) return ID2
  return Math.abs(bestTh % (Math.PI / 2)) < 1e-4 ? ID2 : rotMat(bestTh)
}

export function nest(
  parts: Part[],
  sheetW: number,
  sheetH: number,
  gap: number,
  fest?: ReadonlyMap<string, Fest>,
  ekstra?: number,
): Nesting {
  if (!parts.length) {
    return { sheets: [], sheetW, sheetH, util: 0, spilt: 0, kross: 0 }
  }
  const mats = new Map<string, Mat2>()
  const alignedOut = new Map<string, Pt[]>()
  const alignedHoles = new Map<string, Pt[][]>()
  const pieces = parts.map((p) => {
    let m0 = mats.get(p.id)
    if (!m0) {
      m0 = autoAngle(p.outline, sheetW, sheetH, gap)
      mats.set(p.id, m0)
    }
    const rings = m0 === ID2 ? [p.outline, ...p.holes] : [p.outline.map((q) => apply(m0, q)), ...p.holes.map((h) => h.map((q) => apply(m0, q)))]
    alignedOut.set(p.adr, rings[0])
    alignedHoles.set(p.adr, rings.slice(1))
    return { key: p.id, rings }
  })
  let fast: Map<number, Fest> | undefined
  if (fest?.size) {
    fast = new Map()
    parts.forEach((q, i) => {
      const f = fest.get(q.adr)
      if (f) fast!.set(i, f)
    })
  }
  const out = pack(pieces, sheetW, sheetH, gap, fast, ekstra)

  const anchors = new Map<string, ReturnType<typeof anchor>>()
  const sheets: Sheet[] = Array.from({ length: out.sheets }, () => ({
    placed: [],
    used: 0,
  }))
  for (const baseSlot of out.slots) {
    const part = parts[baseSlot.piece]
    const m0 = mats.get(part.id) ?? ID2
    const ao = alignedOut.get(part.adr) ?? part.outline
    const ah = alignedHoles.get(part.adr) ?? part.holes
    const slot: Slot = m0 === ID2 ? baseSlot : { ...baseSlot, m: mulMat(baseSlot.m, m0) }
    let a = anchors.get(part.id)
    if (!a) {
      a = anchor([ao, ...ah])
      anchors.set(part.id, a)
    }
    const snudd = slot.rot === 1 || slot.rot === 3
    const eige = bbox(ao)
    const sheetRings = {
      outline: part.outline.map((q) => apply(slot.m, q)),
      holes: part.holes.map((h) => h.map((q) => apply(slot.m, q))),
    }
    let paa = apply(baseSlot.m, [a.p[0] + eige.x0, a.p[1] + eige.y0])
    let rom = prøvd(part.adr, sheetRings, paa, a.room, snudd ? a.tall : a.wide)
    if (!rom.room && m0 !== ID2) {
      const sa = anchor([sheetRings.outline, ...sheetRings.holes])
      const sb = bbox(sheetRings.outline)
      paa = [sa.p[0] + sb.x0, sa.p[1] + sb.y0]
      rom = prøvd(part.adr, sheetRings, paa, sa.room, sa.wide)
    }
    sheets[slot.sheet].placed.push({
      part,
      slot,
      label: { p: paa, room: rom.room, wide: rom.wide },
    })
  }
  out.used.forEach((u, i) => {
    sheets[i].used = u
  })

  const area = sheets.reduce(
    (s, q) => s + q.placed.reduce((t, r) => t + r.part.area, 0),
    0,
  )
  const usedArea = sheets.reduce((s, q) => s + q.used * sheetW, 0)
  return {
    sheets,
    sheetW,
    sheetH,
    util: usedArea > 0 ? area / usedArea : 0,
    spilt: out.spilt.length,
    kross: out.kross,
  }
}

const STEG_MM = 0.4

function tekstenLiggInne(tekst: string, r: Ringar, p: Pt, size: number): boolean {
  const inne = (q: Pt) => inRing(r.outline, q) && !r.holes.some((h) => inRing(h, q))
  for (const line of strokesAt(tekst, p[0], p[1], size)) {
    for (let i = 0; i < line.length; i++) {
      if (!inne(line[i])) return false
      if (i === 0) continue
      const a = line[i - 1]
      const b = line[i]
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEG_MM)
      for (let k = 1; k < n; k++) {
        const t = k / n
        if (!inne([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false
      }
    }
  }
  return true
}

type Ringar = { outline: Pt[]; holes: Pt[][] }

function prøvd(tekst: string, r: Ringar, p: Pt, room: number, wide: number) {
  for (let k = 0; k < 10; k++) {
    const size = fitSize(tekst, room, wide)
    if (!size) break
    if (tekstenLiggInne(tekst, r, p, size)) return { room, wide }
    room *= 0.8
    wide *= 0.8
  }
  return { room: 0, wide: 0 }
}

export function placedRings(q: Placed): { outline: Pt[]; holes: Pt[][]; rille: Pt[][] } {
  return {
    outline: q.part.outline.map((p) => apply(q.slot.m, p)),
    holes: q.part.holes.map((h) => h.map((p) => apply(q.slot.m, p))),
    rille: q.part.rille.map((l) => l.map((p) => apply(q.slot.m, p))),
  }
}
