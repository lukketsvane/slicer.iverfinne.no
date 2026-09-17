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
  const pieces = parts.map((p) => ({ key: p.id, rings: [p.outline, ...p.holes] }))
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
  for (const slot of out.slots) {
    const part = parts[slot.piece]
    let a = anchors.get(part.id)
    if (!a) {
      a = anchor([part.outline, ...part.holes])
      anchors.set(part.id, a)
    }
    const snudd = slot.rot === 1 || slot.rot === 3
    const eige = bbox(part.outline)
    const paa = apply(slot.m, [a.p[0] + eige.x0, a.p[1] + eige.y0])
    const rom = prøvd(
      part.adr,
      {
        outline: part.outline.map((q) => apply(slot.m, q)),
        holes: part.holes.map((h) => h.map((q) => apply(slot.m, q))),
      },
      paa,
      a.room,
      snudd ? a.room : a.wide,
    )
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
