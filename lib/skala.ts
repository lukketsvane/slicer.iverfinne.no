/**
 * NOKO EIN KJENNER, VED SIDA AV.
 *
 * Kameraet rammar inn objektet same kor stort det er. Det er rett — ein
 * knapp på fjørti millimeter og ein benk på tolv hundre skal begge fylle
 * ruta — men det tyder at BILETET ikkje seier noko som helst om storleik.
 * Talet i panelet gjer det, og eit tal er noko ein må rekne om. Ingen ser
 * for seg to hundre og førti millimeter; alle ser for seg eit A4-ark.
 *
 * Difor kan ein setje noko kjent ned ved sida av. Det er ikkje pynt: det er
 * steg to i heile arbeidet — du slepper inn ei fil, og so skal du bestemme
 * kor stort tinget skal vera. Med eit A4 attmed er det eit blikk; utan er
 * det ei rekning.
 *
 * Alt her står i MILLIMETER i motoren sitt koordinatsystem, med Z opp og
 * golvet på null, av di det er der det vert teikna.
 */
export type SkalaId = "av" | "a4" | "brus" | "eple"

export type Bit =
  | { form: "boks"; w: number; d: number; h: number; x: number; y: number; z: number }
  | { form: "sylinder"; r: number; h: number; x: number; y: number; z: number }
  | { form: "kule"; r: number; x: number; y: number; z: number }

type Referanse = { namn: string; bitar: Bit[] }

/**
 * Dei tre. Alle er ting nokon har halde i handa denne veka.
 *
 * Måla er dei verkelege: eit A4 er 297 × 210, ei brusboks på tre og eit
 * kvart desiliter er 66 i tverrmål og 115 høg, og eit eple er kring 78.
 *
 * Ein kjøkkenstol stod her ei stund. Han var 920 millimeter høg, og det er
 * fem gonger eit vanleg uttak: heile scena vart skalert etter stolen, og
 * det du skulle sjå på vart ein knøtt ved sida av eit møbel. Ein referanse
 * som er mykje større enn tingen han skal måle, måler ingenting.
 */
const REF: Record<Exclude<SkalaId, "av">, Referanse> = {
  a4: { namn: "A4", bitar: [{ form: "boks", w: 297, d: 210, h: 0.6, x: 0, y: 0, z: 0.3 }] },
  brus: { namn: "brus", bitar: [{ form: "sylinder", r: 33, h: 115, x: 0, y: 0, z: 57.5 }] },
  eple: { namn: "eple", bitar: [{ form: "kule", r: 39, x: 0, y: 0, z: 39 }] },
}

export const SKALAR: readonly { id: SkalaId; label: string; hint: string }[] = [
  { id: "a4", label: "A4", hint: "eit A4-ark på golvet, 297 × 210 mm" },
  { id: "brus", label: "brus", hint: "ei brusboks, 66 mm i tverrmål og 115 høg" },
  { id: "eple", label: "eple", hint: "eit eple, 78 mm" },
]

/** ytremåla i millimeter: breidd langs X, djupn langs Y, høgd over golvet */
export function skalaBoks(id: SkalaId): { w: number; d: number; h: number } | null {
  const r = REF[id as Exclude<SkalaId, "av">]
  if (!r) return null
  let w = 0
  let d = 0
  let h = 0
  for (const b of r.bitar) {
    const bw = b.form === "boks" ? b.w : b.form === "sylinder" ? b.r * 2 : b.r * 2
    const bd = b.form === "boks" ? b.d : b.form === "sylinder" ? b.r * 2 : b.r * 2
    const bh = b.form === "boks" ? b.h : b.form === "sylinder" ? b.h : b.r * 2
    w = Math.max(w, Math.abs(b.x) * 2 + bw)
    d = Math.max(d, Math.abs(b.y) * 2 + bd)
    h = Math.max(h, b.z + bh / 2)
  }
  return { w, d, h }
}

/** dei bitane ein referanse er sett saman av, til den som skal teikne han */
export const bitarI = (id: SkalaId): readonly Bit[] => REF[id as Exclude<SkalaId, "av">]?.bitar ?? []
