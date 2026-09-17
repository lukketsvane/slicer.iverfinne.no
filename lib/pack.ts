import { bbox, type Pt } from "./core"

export type Ring = Pt[]
export type Piece = { key: string; rings: Ring[] }

export type Fest = { sheet: number; rot: 0 | 1 | 2 | 3; x: number; y: number }

export type Slot = {
  piece: number
  sheet: number
  rot: 0 | 1 | 2 | 3
  m: [number, number, number, number, number, number]
  sx: number
  sy: number
  kross?: boolean
}

export type Packing = {
  slots: Slot[]
  sheets: number
  used: number[]
  spilt: number[]
  kross: number
}

export const apply = (m: Slot["m"], p: Pt): Pt => [
  m[0] * p[0] + m[1] * p[1] + m[2],
  m[3] * p[0] + m[4] * p[1] + m[5],
]

export const placeRings = (rings: Ring[], s: Slot): Ring[] =>
  rings.map((r) => r.map((p) => apply(s.m, p)))

type Mask = {
  w: number
  h: number
  span: Int32Array
  start: Int32Array
  bot: Int32Array
  cells: number
}

type Raw = { w: number; h: number; a: Uint8Array }

function rasterise(
  rings: Ring[],
  ox: number,
  oy: number,
  res: number,
  w: number,
  h: number,
  heil = false,
): Raw {
  const a = new Uint8Array(w * h)
  const xs: number[] = []
  for (let j = 0; j < h; j++) {
    const y = oy + (j + 0.5) * res
    xs.length = 0
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]
        const q = ring[(i + 1) % ring.length]
        if (p[1] === q[1]) continue
        if (y >= Math.min(p[1], q[1]) && y < Math.max(p[1], q[1])) {
          xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]))
        }
      }
    }
    if (xs.length < 2) continue
    xs.sort((u, v) => u - v)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = heil
        ? Math.max(0, Math.ceil((xs[k] - ox) / res))
        : Math.max(0, Math.ceil((xs[k] - ox) / res - 0.5))
      const i1 = heil
        ? Math.min(w - 1, Math.floor((xs[k + 1] - ox) / res) - 1)
        : Math.min(w - 1, Math.floor((xs[k + 1] - ox) / res - 0.5))
      for (let i = i0; i <= i1; i++) a[j * w + i] = 1
    }
  }
  return { w, h, a }
}

function dilate(r: Raw, k: number): Raw {
  if (k <= 0) return r
  const w = r.w + 2 * k
  const h = r.h + 2 * k
  const out = new Uint8Array(w * h)
  for (let j = 0; j < r.h; j++) {
    const rad = j * r.w
    let i = 0
    while (i < r.w) {
      if (!r.a[rad + i]) {
        i++
        continue
      }
      const a = i
      while (i < r.w && r.a[rad + i]) i++
      for (let jj = j; jj <= j + 2 * k; jj++) out.fill(1, jj * w + a, jj * w + i + 2 * k)
    }
  }
  return { w, h, a: out }
}

function turn(r: Raw, rot: 0 | 1 | 2 | 3): Raw {
  if (rot === 0) return r
  const swap = rot === 1 || rot === 3
  const w = swap ? r.h : r.w
  const h = swap ? r.w : r.h
  const a = new Uint8Array(w * h)
  for (let j = 0; j < r.h; j++) {
    for (let i = 0; i < r.w; i++) {
      if (!r.a[j * r.w + i]) continue
      let ii: number
      let jj: number
      if (rot === 1) {
        ii = r.h - 1 - j
        jj = i
      } else if (rot === 2) {
        ii = r.w - 1 - i
        jj = r.h - 1 - j
      } else {
        ii = j
        jj = r.w - 1 - i
      }
      a[jj * w + ii] = 1
    }
  }
  return { w, h, a }
}

function toMask(r: Raw): Mask {
  const span: number[] = []
  const start = new Int32Array(r.h + 1)
  const bot = new Int32Array(r.w).fill(-1)
  let cells = 0
  for (let j = 0; j < r.h; j++) {
    start[j] = span.length
    let i = 0
    while (i < r.w) {
      if (!r.a[j * r.w + i]) {
        i++
        continue
      }
      const a0 = i
      while (i < r.w && r.a[j * r.w + i]) {
        if (bot[i] < 0) bot[i] = j
        i++
      }
      span.push(a0, i)
      cells += i - a0
    }
  }
  start[r.h] = span.length
  return { w: r.w, h: r.h, span: new Int32Array(span), start, bot, cells }
}

type Board = {
  w: number
  h: number
  words: number
  bits: Uint32Array
  top: Int32Array
  used: number
  nei: Set<string>
}

const board = (w: number, h: number): Board => {
  const words = (w + 31) >> 5
  return {
    w,
    h,
    words,
    bits: new Uint32Array(words * h),
    top: new Int32Array(w),
    used: 0,
    nei: new Set(),
  }
}

function anySet(bits: Uint32Array, base: number, a: number, b: number): boolean {
  if (b <= a) return false
  const wa = a >> 5
  const wb = (b - 1) >> 5
  const lo = -1 << (a & 31)
  const hiBit = (b - 1) & 31
  const hi = hiBit === 31 ? -1 : (1 << (hiBit + 1)) - 1
  if (wa === wb) return (bits[base + wa] & lo & hi) !== 0
  if (bits[base + wa] & lo) return true
  for (let w = wa + 1; w < wb; w++) if (bits[base + w]) return true
  return (bits[base + wb] & hi) !== 0
}

function setBits(bits: Uint32Array, base: number, a: number, b: number) {
  if (b <= a) return
  const wa = a >> 5
  const wb = (b - 1) >> 5
  const lo = -1 << (a & 31)
  const hiBit = (b - 1) & 31
  const hi = hiBit === 31 ? -1 : (1 << (hiBit + 1)) - 1
  if (wa === wb) {
    bits[base + wa] |= lo & hi
    return
  }
  bits[base + wa] |= lo
  for (let w = wa + 1; w < wb; w++) bits[base + w] = 0xffffffff
  bits[base + wb] |= hi
}

function fits(b: Board, m: Mask, px: number, py: number): boolean {
  for (let r = 0; r < m.h; r++) {
    const base = (py + r) * b.words
    arbeid += (m.start[r + 1] - m.start[r]) >> 1
    for (let s = m.start[r]; s < m.start[r + 1]; s += 2) {
      if (anySet(b.bits, base, px + m.span[s], px + m.span[s + 1])) return false
    }
  }
  return true
}

function stamp(b: Board, m: Mask, px: number, py: number) {
  for (let r = 0; r < m.h; r++) {
    const base = (py + r) * b.words
    for (let s = m.start[r]; s < m.start[r + 1]; s += 2) {
      const a = px + m.span[s]
      const c = px + m.span[s + 1]
      setBits(b.bits, base, a, c)
      for (let i = a; i < c; i++) if (py + r + 1 > b.top[i]) b.top[i] = py + r + 1
    }
  }
  if (py + m.h > b.used) b.used = py + m.h
}

function lowest(b: Board, m: Mask, px: number, step: number): number {
  const hopp = Math.max(1, m.w >> 3)
  for (let c = 0; c < m.w; c += hopp) {
    if (m.bot[c] >= 0 && b.top[px + c] - m.bot[c] + m.h > b.h) return -1
  }
  let ySky = 0
  arbeid += m.w
  for (let c = 0; c < m.w; c++) {
    if (m.bot[c] < 0) continue
    const t = b.top[px + c] - m.bot[c]
    if (t > ySky) ySky = t
  }
  if (ySky + m.h > b.h) return -1
  for (let py = 0; py < ySky; py += step) {
    if (fits(b, m, px, py)) return py
  }
  return ySky
}

function rutenettet(sheetW: number, sheetH: number, gap: number) {
  let res = Math.min(6, Math.max(gap / 3, Math.max(sheetW, sheetH) / 620, 1))
  if (res > gap / 3 && res < gap) res = gap
  return { res, k: Math.max(1, Math.ceil((gap / res + 1) / 2)) }
}

export function fitRoom(
  sheetW: number,
  sheetH: number,
  gap: number,
): { w: number; h: number } {
  const { res, k } = rutenettet(sheetW, sheetH, gap)
  return {
    w: Math.max(0, (Math.floor(sheetW / res) - 1 - 2 * k) * res),
    h: Math.max(0, (Math.floor(sheetH / res) - 1 - 2 * k) * res),
  }
}

type Poeng = "botn" | "topp"
type Strategi = {
  fro: number
  poeng: Poeng
  bryt?: boolean
}

const STRATEGIAR: readonly Strategi[] = [
  { fro: 0, poeng: "botn", bryt: true },
  { fro: 0, poeng: "topp" },
  { fro: 1, poeng: "topp" },
  { fro: 2, poeng: "topp" },
]

const BUDSJETT = 12_000_000
let arbeid = 0

function stoy(fro: number): () => number {
  let x = (fro * 747796405 + 2891336453) | 0
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) | 0
    return (x >>> 8) / 16777216
  }
}

export function pack(
  pieces: readonly Piece[],
  sheetW: number,
  sheetH: number,
  gap: number,
  fest?: ReadonlyMap<number, Fest>,
  ekstra?: number,
): Packing {
  if (!pieces.length) return { slots: [], sheets: 0, used: [], spilt: [], kross: 0 }

  const { res, k } = rutenettet(sheetW, sheetH, gap)
  const step = Math.max(1, Math.round(3 / res))
  const SW = Math.floor(sheetW / res)
  const SH = Math.floor(sheetH / res)

  type Form = { masks: Mask[]; ox: number; oy: number; Wm: number; Hm: number; cells: number }
  const forms = new Map<string, Form>()
  const formOf = (p: Piece): Form => {
    const hit = forms.get(p.key)
    if (hit) return hit
    const bb = bbox(p.rings[0])
    const nw = Math.ceil((bb.x1 - bb.x0) / res) + 1
    const nh = Math.ceil((bb.y1 - bb.y0) / res) + 1
    const raw = dilate(rasterise(p.rings, bb.x0, bb.y0, res, nw, nh), k)
    const masks = ([0, 1, 2, 3] as const).map((r) => toMask(turn(raw, r)))
    const f: Form = {
      masks,
      ox: bb.x0 - k * res,
      oy: bb.y0 - k * res,
      Wm: raw.w * res,
      Hm: raw.h * res,
      cells: masks[0].cells,
    }
    forms.set(p.key, f)
    return f
  }
  const alle = pieces.map((p, i) => ({ i, key: p.key, f: formOf(p) }))

  const ordna = (fro: number) => {
    if (!fro) return [...alle].sort((a, b) => b.f.cells - a.f.cells || a.i - b.i)
    const rnd = stoy(fro)
    const vekt = alle.map((q) => ({ q, v: q.f.cells * (1 + 0.35 * rnd()) }))
    return vekt.sort((a, b) => b.v - a.v || a.q.i - b.q.i).map((z) => z.q)
  }

  const seek = (b: Board, f: Form, s: Strategi) => {
    let best: { rot: 0 | 1 | 2 | 3; px: number; py: number; sc: number } | null = null
    for (let r = 0; r < 4; r++) {
      const m = f.masks[r]
      if (m.w > b.w || m.h > b.h) continue
      for (let px = 0; px + m.w <= b.w; px += step) {
        const py = lowest(b, m, px, step)
        if (py < 0) continue
        const sc = (s.poeng === "topp" ? py + m.h : py) * b.w + px
        if (!best || sc < best.sc) best = { rot: r as 0 | 1 | 2 | 3, px, py, sc }
        if (py === 0) break
      }
      if (s.bryt && best && best.py === 0) break
    }
    return best
  }

  type Passasje = { slots: Slot[]; boards: Board[]; spilt: number[]; kross: number }

  const legg = (s: Strategi): Passasje => {
    const order = ordna(s.fro)
    const slots: Slot[] = []
    const spilt: number[] = []
    const boards: Board[] = []
    const platerTil = (n: number) => {
      while (boards.length <= n) boards.push(board(SW, SH))
    }

    const staar = new Set<number>()
    let kross = 0
    if (fest?.size) {
      for (const { i, f } of order) {
        const ft = fest.get(i)
        if (!ft) continue
        if (!Number.isInteger(ft.sheet) || ft.sheet < 0 || ft.sheet > 255) continue
        platerTil(ft.sheet)
        const b = boards[ft.sheet]
        const m = f.masks[ft.rot]
        if (m.w > b.w || m.h > b.h) continue
        const px = Math.max(0, Math.min(b.w - m.w, Math.round(ft.x / res)))
        const py = Math.max(0, Math.min(b.h - m.h, Math.round(ft.y / res)))
        const iNokon = !fits(b, m, px, py)
        if (iNokon) kross++
        stamp(b, m, px, py)
        const bb = bbox(pieces[i].rings[0])
        slots.push({
          piece: i,
          sheet: ft.sheet,
          rot: ft.rot,
          m: affine(
            { ...f, ox: bb.x0 - k * res, oy: bb.y0 - k * res },
            ft.rot,
            px * res,
            py * res,
          ),
          sx: px * res,
          sy: py * res,
          ...(iNokon ? { kross: true } : {}),
        })
        staar.add(i)
      }
    }

    for (const { i, key, f } of order) {
      if (staar.has(i)) continue
      let put: { s: number; rot: 0 | 1 | 2 | 3; px: number; py: number } | null = null
      for (let n = 0; n < boards.length && !put; n++) {
        if (boards[n].nei.has(key)) continue
        const best = seek(boards[n], f, s)
        if (best) put = { s: n, rot: best.rot, px: best.px, py: best.py }
        else boards[n].nei.add(key)
      }
      if (!put) {
        if (f.masks.every((m) => m.w > SW || m.h > SH)) {
          spilt.push(i)
          continue
        }
        const b = board(SW, SH)
        const best = seek(b, f, s)
        if (!best) {
          spilt.push(i)
          continue
        }
        boards.push(b)
        put = { s: boards.length - 1, rot: best.rot, px: best.px, py: best.py }
      }
      const m = f.masks[put.rot]
      stamp(boards[put.s], m, put.px, put.py)
      const bb = bbox(pieces[i].rings[0])
      slots.push({
        piece: i,
        sheet: put.s,
        rot: put.rot,
        m: affine(
          { ...f, ox: bb.x0 - k * res, oy: bb.y0 - k * res },
          put.rot,
          put.px * res,
          put.py * res,
        ),
        sx: put.px * res,
        sy: put.py * res,
      })
    }
    const att: number[] = []
    boards.forEach((b, n) => {
      if (b.used > 0) att.push(n)
    })
    if (att.length < boards.length) {
      const ny = new Map(att.map((n, i) => [n, i]))
      for (const sl of slots) sl.sheet = ny.get(sl.sheet) ?? sl.sheet
      return { slots, boards: att.map((n) => boards[n]), spilt, kross }
    }
    return { slots, boards, spilt, kross }
  }

  const betre = (a: Passasje, b: Passasje) => {
    if (a.boards.length !== b.boards.length) return a.boards.length < b.boards.length
    const sist = (q: Passasje) => (q.boards.length ? q.boards[q.boards.length - 1].used : 0)
    return sist(a) < sist(b)
  }

  arbeid = 0
  let best = legg(STRATEGIAR[0])
  const fleire = Math.min(
    ekstra ?? STRATEGIAR.length - 1,
    STRATEGIAR.length - 1,
    Math.floor(BUDSJETT / Math.max(1, arbeid)),
  )
  for (let n = 1; n <= fleire; n++) {
    const p = legg(STRATEGIAR[n])
    if (betre(p, best)) best = p
  }

  return {
    slots: best.slots,
    sheets: best.boards.length,
    used: best.boards.map((b) => b.used * res),
    spilt: best.spilt,
    kross: best.kross,
  }
}

function affine(
  f: { ox: number; oy: number; Wm: number; Hm: number },
  rot: 0 | 1 | 2 | 3,
  sx: number,
  sy: number,
): Slot["m"] {
  const { ox, oy, Wm, Hm } = f
  switch (rot) {
    case 0:
      return [1, 0, sx - ox, 0, 1, sy - oy]
    case 1:
      return [0, -1, sx + Hm + oy, 1, 0, sy - ox]
    case 2:
      return [-1, 0, Wm + ox + sx, 0, -1, Hm + oy + sy]
    default:
      return [0, 1, sx - oy, -1, 0, Wm + ox + sy]
  }
}

export function anchor(rings: Ring[], res = 2): { p: Pt; room: number; wide: number } {
  const bb = bbox(rings[0])
  const w = Math.max(1, Math.ceil((bb.x1 - bb.x0) / res) + 1)
  const h = Math.max(1, Math.ceil((bb.y1 - bb.y0) / res) + 1)
  const mid: Pt = [(bb.x1 - bb.x0) / 2, (bb.y1 - bb.y0) / 2]
  if (w * h > 4e6) return { p: mid, room: 0, wide: 0 }
  const arr = rasterise(rings, bb.x0, bb.y0, res, w, h, true).a
  const dp = new Int32Array(w * h)
  let best = 0
  let bi = 0
  let bj = 0
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!arr[j * w + i]) continue
      const v =
        i === 0 || j === 0
          ? 1
          : Math.min(dp[(j - 1) * w + i], dp[j * w + i - 1], dp[(j - 1) * w + i - 1]) + 1
      dp[j * w + i] = v
      if (v > best) {
        best = v
        bi = i
        bj = j
      }
    }
  }
  if (best === 0) return { p: mid, room: 0, wide: 0 }
  const ci = Math.round(bi - best / 2 + 0.5)
  const cj = Math.round(bj - best / 2 + 0.5)

  const rom = Math.max(0, best - 1) * res

  const halvBest = Math.floor(Math.max(0, best - 1) / 2)
  let halv = Infinity
  for (let j = Math.max(0, cj - halvBest); j <= Math.min(h - 1, cj + halvBest); j++) {
    if (!arr[j * w + ci]) {
      halv = 0
      break
    }
    let a = ci
    let b = ci
    while (a > 0 && arr[j * w + a - 1]) a--
    while (b < w - 1 && arr[j * w + b + 1]) b++
    halv = Math.min(halv, ci - a, b - ci)
  }

  return {
    p: [(ci + 0.5) * res, (cj + 0.5) * res],
    room: rom,
    wide: 2 * (Number.isFinite(halv) ? halv : 0) * res,
  }
}
