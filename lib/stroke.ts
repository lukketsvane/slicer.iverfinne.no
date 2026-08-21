/**
 * Éin-strøks skrift.
 *
 * Ein DXF kan bera ein TEXT-entitet og ein SVG eit <text>-element, og
 * begge er i praksis eit spørsmål til maskina om ho tilfeldigvis har den
 * skrifta. Svaret er ofte nei: laserpanelet hoppar over teksten, eller det
 * teiknar noko heilt anna enn det du såg på skjermen, eller det fyller
 * bokstavane og brenn eit svart felt der det skulle stått eit tal. Det er
 * ikkje ein feil i maskina — det er at ein bokstav er ein AVTALE, og ei
 * kuttfil skal ikkje innehalde avtalar.
 *
 * Difor er kvar bokstav her polyliner. Ein strek, ikkje ein form: fresen
 * eller stråla køyrer LANGS han og fyller ingenting, so eit nummer kostar
 * eit par centimeter køyring i staden for eit fylt felt. Det er den same
 * skrifta plottarar har brukt sidan sekstitalet, og han finst her av den
 * same grunnen dei brukte han: eit verktøy med ein spiss kan berre teikne
 * linjer.
 *
 * Rutenettet er fire breitt og sju høgt. Kvart punkt er to teikn — x i
 * 0–4 og y i 0–7, med y opp — punkta skilde med mellomrom, og polylinene
 * skilde med «|».
 */
import type { Pt } from "./core"

const GLYF: Record<string, string> = {
  // tal. Nullen har skråstrek: ein null og ein O på same kuttark er den
  // eine forvekslinga som faktisk kostar deg ein del.
  "0": "01 06 17 37 46 41 30 10 01|01 46",
  "1": "05 27 20|00 40",
  "2": "06 17 37 46 44 00 40",
  "3": "06 17 37 46 45 34 24|34 43 41 30 10 01",
  "4": "30 37 02 42",
  "5": "47 07 04 34 43 41 30 10 01",
  "6": "46 37 17 06 01 10 30 41 43 34 14 03",
  "7": "07 47 10",
  "8": "14 05 06 17 37 46 45 34 14|14 03 01 10 30 41 43 34",
  "9": "01 10 30 41 46 37 17 06 04 13 33 44",

  // bokstavar
  A: "00 05 27 45 40|02 42",
  B: "00 07 37 46 45 34 04|34 43 41 30 00",
  C: "46 37 17 06 01 10 30 41",
  D: "00 07 27 46 41 30 00",
  E: "47 07 00 40|04 34",
  F: "00 07 47|04 34",
  G: "46 37 17 06 01 10 30 41 43 23",
  H: "00 07|40 47|04 44",
  I: "07 47|27 20|00 40",
  J: "47 41 30 10 01",
  K: "00 07|47 02|13 40",
  L: "07 00 40",
  M: "00 07 24 47 40",
  N: "00 07 40 47",
  O: "01 06 17 37 46 41 30 10 01",
  P: "00 07 37 46 45 34 04",
  Q: "01 06 17 37 46 41 30 10 01|22 40",
  R: "00 07 37 46 45 34 04|24 40",
  S: "01 10 30 41 43 34 14 05 06 17 37 46",
  T: "07 47|27 20",
  U: "07 01 10 30 41 47",
  V: "07 20 47",
  W: "07 00 23 40 47",
  X: "00 47|07 40",
  Y: "07 24 47|24 20",
  Z: "07 47 00 40",

  // teikn kuttarket faktisk brukar
  "-": "03 43",
  ".": "00 10",
  ",": "01 10",
  "/": "00 47",
  "×": "12 35|15 32",
  "%": "07 17 16 06 07|31 41 40 30 31|00 47",
  "·": "23 33",
  ":": "01 11|05 15",
  " ": "",
}

/** rutehøgda: sju einingar er kapitélhøgda */
const CAP = 7
/** kor breitt eitt teikn tek, med luft: fire brei pluss to */
const ADV = 6

/**
 * Teksten som polyliner i millimeter, med `size` som kapitélhøgd og (x, y)
 * i nedre venstre hjørne. Ukjende teikn fell stilt bort — eit kuttark skal
 * ikkje ha ein tofu-firkant i seg.
 */
export function strokes(text: string, x: number, y: number, size: number): Pt[][] {
  const s = size / CAP
  const out: Pt[][] = []
  let at = 0
  for (const ch of text.toUpperCase()) {
    const g = GLYF[ch]
    if (g === undefined) {
      at += ADV
      continue
    }
    for (const line of g.split("|")) {
      if (!line) continue
      const pts: Pt[] = []
      for (const p of line.split(" ")) {
        if (p.length !== 2) continue
        pts.push([x + (at + +p[0]) * s, y + +p[1] * s])
      }
      if (pts.length >= 2) out.push(pts)
    }
    at += ADV
  }
  return out
}

/** kor breid teksten vert, i millimeter */
export const strokeWidth = (text: string, size: number) =>
  text.length > 0 ? ((text.length * ADV - 2) * size) / CAP : 0

/** same tekst, midtstilt om (cx, cy) */
export function strokesAt(text: string, cx: number, cy: number, size: number): Pt[][] {
  return strokes(text, cx - strokeWidth(text, size) / 2, cy - size / 2, size)
}

/**
 * Største kapitélhøgd som får plass i eit kvadrat på `room` millimeter.
 * Null tyder at delen er for liten til å merkjast — og då er det betre å
 * la vera enn å brenne eit uleseleg krot på han.
 */
export function fitSize(text: string, room: number, wide: number, max = 12): number {
  if (!text.length || room <= 0) return 0
  const v = Math.min(max, room * 0.55, (Math.max(room, wide) * 0.82) / strokeWidth(text, 1))
  return v >= 2 ? v : 0
}
