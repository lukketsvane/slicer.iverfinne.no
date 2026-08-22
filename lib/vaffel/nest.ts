/**
 * VAFFEL — delane lagde ut på plate.
 *
 * Sjølve pakkinga står i `lib/pack.ts` og kjenner ikkje til ribber: ho tek
 * polygon med hòl og gjev deg plassar. Denne fila er berre broa — ho gjer
 * delane om til former pakkaren forstår, og gjev svaret attende i dei
 * koordinatane kuttfila skriv i.
 *
 * Ein ting er verd å seie om KVA som vert pakka: hòla i ein del er ledig
 * plass. Ei ribbe frå eit krumt objekt er ofte ei tunge eller ein boge med
 * eit stort tomrom under seg, og pakkaren legg gjerne tre små ribber inn i
 * det tomrommet. Det er skilnaden mellom å telje boksar og å telje form,
 * og på eit krumt objekt er han fort ei heil plate.
 */
import { bbox, type Pt } from "../core"
import { anchor, pack, apply, type Slot } from "../pack"
import type { Part } from "./parts"

export type Placed = {
  part: Part
  slot: Slot
  /** kvar adressa skal graverast, og kor mykje rom det er der: `room` er
   *  høgda som er å få, `wide` breidda */
  label: { p: Pt; room: number; wide: number }
}
export type Sheet = { placed: Placed[]; used: number }
export type Nesting = {
  sheets: Sheet[]
  sheetW: number
  sheetH: number
  util: number
  /** delar som ikkje fekk plass på ei tom plate heller */
  spilt: number
}

export function nest(
  parts: Part[],
  sheetW: number,
  sheetH: number,
  gap: number,
): Nesting {
  if (!parts.length) {
    return { sheets: [], sheetW, sheetH, util: 0, spilt: 0 }
  }
  const pieces = parts.map((p) => ({ key: p.id, rings: [p.outline, ...p.holes] }))
  const out = pack(pieces, sheetW, sheetH, gap)

  // Merket høyrer til FORMA og ikkje til den einskilde delen: to like
  // ribber har det på same staden I SEG SJØLVE, og då vert det rekna éin
  // gong. «I seg sjølve» er heile poenget: `anchor` svarar relativt til
  // hjørnet av delen sin eigen boks, og hjørnet vert lagt til her, for
  // KVAR del. Same form kan liggje fleire stader i objektet — tre bein
  // under ein kropp — og eit svar som var absolutt ville sende adressa
  // til alle tre til der det fyrste beinet låg.
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
    // Ei kvartsving byter om på breidd og høgd. `room` er sida i eit
    // KVADRAT og står seg gjennom kva sving som helst; `wide` er eit
    // vassrett stykke, og har delen lagt seg på tvers, er det stykket
    // loddrett no. Då fell vi tilbake på kvadratet — teksten står alltid
    // vassrett på plata, uansett kva veg delen ligg.
    const snudd = slot.rot === 1 || slot.rot === 3
    const eige = bbox(part.outline)
    sheets[slot.sheet].placed.push({
      part,
      slot,
      label: {
        p: apply(slot.m, [a.p[0] + eige.x0, a.p[1] + eige.y0]),
        room: a.room,
        wide: snudd ? a.room : a.wide,
      },
    })
  }
  out.used.forEach((u, i) => {
    sheets[i].used = u
  })

  // Berre delar som FAKTISK LIGG på ei plate tel. Ein del som ikkje fekk
  // plass er ikkje utnytta materiale — han er ikkje skoren i det heile —
  // og tel han med, kan utnyttinga gå over hundre prosent. Det gjorde ho:
  // eit objekt med åtte delar utanfor melde 377 %.
  const area = sheets.reduce(
    (s, q) => s + q.placed.reduce((t, r) => t + r.part.area, 0),
    0,
  )
  // «Utnytting» er kor mykje av det du faktisk SKAR I som vart del. Resten
  // av den siste plata er ikkje svinn — han ligg der og ventar på neste
  // jobb — so han tel ikkje med.
  const usedArea = sheets.reduce((s, q) => s + q.used * sheetW, 0)
  return {
    sheets,
    sheetW,
    sheetH,
    util: usedArea > 0 ? area / usedArea : 0,
    spilt: out.spilt.length,
  }
}

/** delen sine konturar der han faktisk ligg på plata */
export function placedRings(q: Placed): { outline: Pt[]; holes: Pt[][] } {
  return {
    outline: q.part.outline.map((p) => apply(q.slot.m, p)),
    holes: q.part.holes.map((h) => h.map((p) => apply(q.slot.m, p))),
  }
}
