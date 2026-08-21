/**
 * VAFFEL — delane lagde ut på plate.
 *
 * Frie rektangel. Plata byrjar som eitt ledig rektangel; kvar del vert lagd
 * i det ledige rektangelet der ho ligg tettast mot ein kant, og det som er
 * att vert delt i to nye. Det er ikkje den beste pakkinga som finst — ein
 * pakkar som fylgjer konturane i staden for omrisset ville løfta talet
 * monaleg, av di ei ribbe med ei stor opning i er eit stort, tomt og fullt
 * brukbart felt — men det er ei pakking ein kan tru på, og det er talet
 * som avgjer kor mange plater ein må kjøpa.
 *
 * Delane vert sorterte etter areal og ikkje etter høgd. Med hyller vert
 * radhøgda sett av den høgste delen i rada, og éi ribbe på 400 mm gjer då
 * heile rada 400 mm høg — same kor låge dei andre i rada er.
 */
import { bbox, type Pt } from "../core"
import type { Part } from "./parts"

export type Placed = { part: Part; x: number; y: number; rot: boolean }
export type Sheet = { w: number; h: number; placed: Placed[]; used: number }
export type Nesting = {
  sheets: Sheet[]
  sheetW: number
  sheetH: number
  util: number
  /** delar som ikkje fekk plass på ei einaste plate */
  spilt: number
}

type Rect = { x: number; y: number; w: number; h: number }

const dims = (p: Part) => {
  const b = bbox(p.outline)
  return { w: b.x1 - b.x0, h: b.y1 - b.y0, x0: b.x0, y0: b.y0 }
}

export function nest(parts: Part[], sheetW: number, sheetH: number, gap: number): Nesting {
  const items = parts
    .map((p) => ({ p, d: dims(p) }))
    .sort((a, b) => b.d.w * b.d.h - a.d.w * a.d.h)

  const sheets: Sheet[] = []
  let free: Rect[] = []
  let sheet: Sheet = { w: sheetW, h: sheetH, placed: [], used: 0 }
  let spilt = 0

  const open = () => {
    sheet = { w: sheetW, h: sheetH, placed: [], used: 0 }
    sheets.push(sheet)
    free = [{ x: gap, y: gap, w: sheetW - 2 * gap, h: sheetH - 2 * gap }]
  }
  open()

  for (const it of items) {
    const w = it.d.w + gap
    const h = it.d.h + gap
    let best = -1
    let bestRot = false
    let bestScore = Infinity
    const look = () => {
      best = -1
      bestScore = Infinity
      for (let i = 0; i < free.length; i++) {
        const r = free[i]
        for (const rot of [false, true]) {
          const iw = rot ? h : w
          const ih = rot ? w : h
          if (iw > r.w || ih > r.h) continue
          // tettast mot ein kant: den minste av dei to restane avgjer
          const score = Math.min(r.w - iw, r.h - ih)
          if (score < bestScore) {
            bestScore = score
            best = i
            bestRot = rot
          }
        }
      }
    }
    look()
    if (best < 0) {
      // Ei tom plate som ikkje tek delen heller, tek han aldri: han er
      // rett og slett større enn plata, og då er det plata som er feil.
      if (sheet.placed.length === 0) {
        spilt++
        continue
      }
      open()
      look()
      if (best < 0) {
        spilt++
        continue
      }
    }
    const r = free[best]
    const iw = bestRot ? h : w
    const ih = bestRot ? w : h
    sheet.placed.push({ part: it.p, x: r.x, y: r.y, rot: bestRot })
    sheet.used = Math.max(sheet.used, r.y + ih)
    // giljotin: del resten langs den korte leia, så bitane held seg store
    free.splice(best, 1)
    if (r.w - iw > r.h - ih) {
      free.push({ x: r.x + iw, y: r.y, w: r.w - iw, h: r.h })
      free.push({ x: r.x, y: r.y + ih, w: iw, h: r.h - ih })
    } else {
      free.push({ x: r.x, y: r.y + ih, w: r.w, h: r.h - ih })
      free.push({ x: r.x + iw, y: r.y, w: r.w - iw, h: ih })
    }
    free = free.filter((q) => q.w > 20 && q.h > 20)
  }

  const area = parts.reduce((s, p) => s + p.area, 0)
  const usedArea = sheets.reduce((s, q) => s + q.used * sheetW, 0)
  return {
    sheets,
    sheetW,
    sheetH,
    util: usedArea > 0 ? area / usedArea : 0,
    spilt,
  }
}

/** delen sine konturar der han faktisk ligg på plata */
export function placedRings(q: Placed): { outline: Pt[]; holes: Pt[][] } {
  const d = dims(q.part)
  const map = (p: Pt): Pt => {
    const x = p[0] - d.x0
    const y = p[1] - d.y0
    return q.rot ? [q.x + (d.h - y), q.y + x] : [q.x + x, q.y + y]
  }
  return { outline: q.part.outline.map(map), holes: q.part.holes.map((h) => h.map(map)) }
}
