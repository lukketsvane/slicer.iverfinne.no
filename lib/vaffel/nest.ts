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
import { bbox, inRing, type Pt } from "../core"
import { anchor, pack, apply, type Fest, type Slot } from "../pack"
import { fitSize, strokesAt } from "../stroke"
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
  /** festa delar handa har sett i kvarandre — sjå `Packing.kross` */
  kross: number
}

export function nest(
  parts: Part[],
  sheetW: number,
  sheetH: number,
  gap: number,
  /** delar handa har sett fast, etter ADRESSA si — «X3a» */
  fest?: ReadonlyMap<string, Fest>,
): Nesting {
  if (!parts.length) {
    return { sheets: [], sheetW, sheetH, util: 0, spilt: 0, kross: 0 }
  }
  const pieces = parts.map((p) => ({ key: p.id, rings: [p.outline, ...p.holes] }))
  // Frå adresse til plass i lista. Pakkinga kjenner delane som tal, og
  // handa kjenner dei som «X3a»; her møtest dei to. Ei adresse som ikkje
  // finst lenger — ribba er sletta — fell ut av seg sjølv.
  let fast: Map<number, Fest> | undefined
  if (fest?.size) {
    fast = new Map()
    parts.forEach((q, i) => {
      const f = fest.get(q.from)
      if (f) fast!.set(i, f)
    })
  }
  const out = pack(pieces, sheetW, sheetH, gap, fast)

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
    // Prøva står i delen sitt EIGE rom: der er teksten vassrett, og der
    // ligg omrisset som skal halde han. Ei kvartsving flyttar begge to
    // like mykje.
    const paa = apply(slot.m, [a.p[0] + eige.x0, a.p[1] + eige.y0])
    const rom = prøvd(
      part.from,
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
    kross: out.kross,
  }
}

/**
 * ANKERET ER EIT FORSLAG, IKKJE EIT LØFTE.
 *
 * `anchor` leitar i eit raster på to millimeter. Ei ribbe er ein kam: han
 * er full av SPOR, og eit spor er tre millimeter breitt — smalare der
 * konturen skjer det på skrå. Eit raster som prøver kvar andre millimeter
 * treffer eit slikt spor som oftast, og av og til ikkje: då fyller det
 * tvers over sporet, finn eit «heilt» kvadrat på fire og åtti millimeter
 * som spenner over tre spor, og legg adressa midt på ein sporvegg.
 *
 * Ho stod ein millimeter utanfor kuttlina. På skjermen ser arket likt ut;
 * i maskina brenner du talet ned i bordet eller på nabodelen, og det er
 * fyrst når plata ligg framfor deg at du ser det.
 *
 * Difor vert forslaget PRØVD, med den teksten som faktisk skal stå der og
 * i den storleiken han faktisk får. Held det ikkje, krympar rommet til det
 * held — eller til det ikkje er noko att, og då er delen for liten til å
 * merkjast. Å la vera er alltid betre enn å brenne utanfor.
 *
 * Prøva er eksakt: han spør polygonet, ikkje rasteret.
 */
const STEG_MM = 0.4

/** ligg heile teksten i godset — utanfor kvart hòl og innanfor omrisset? */
function tekstenLiggInne(tekst: string, r: Ringar, p: Pt, size: number): boolean {
  const inne = (q: Pt) => inRing(r.outline, q) && !r.holes.some((h) => inRing(h, q))
  for (const line of strokesAt(tekst, p[0], p[1], size)) {
    for (let i = 0; i < line.length; i++) {
      if (!inne(line[i])) return false
      if (i === 0) continue
      // Eit strek mellom to punkt som begge er inne, kan framleis krysse
      // eit spor. Spora er tre millimeter; prøvepunkt kvar 0,4 er tett
      // nok til at ingen av dei kan hoppe over eitt.
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

/**
 * Rommet ankeret lova, krympa til det som faktisk er der.
 *
 * Prøva står PÅ PLATA og ikkje i delen sitt eige rom. Teksten er alltid
 * vassrett på plata, so på ein del som ligg på tvers går han den andre
 * vegen gjennom delen enn han ville gjort før svingen — og eit svar rekna
 * i delen sitt rom ville vore eit svar på eit anna spørsmål.
 */
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

/** delen sine konturar der han faktisk ligg på plata */
export function placedRings(q: Placed): { outline: Pt[]; holes: Pt[][] } {
  return {
    outline: q.part.outline.map((p) => apply(q.slot.m, p)),
    holes: q.part.holes.map((h) => h.map((p) => apply(q.slot.m, p))),
  }
}
