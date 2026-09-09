/**
 * SLICERMAN — 3MF ut, til trykkjaren.
 *
 * Bambu Studio, PrusaSlicer og Cura les 3MF og ikkje GLB. Det er heile
 * grunnen til at fila finst: «flat» er den rette geometrien for ein
 * trykkjar — delane ligg flatt, kvar for seg, med plata på golvet — og
 * so er ho i eit format ingen slicer opnar.
 *
 * Og eitt til: 3MF er MILLIMETER og Z OPP. Det er verkstaden sine eigne
 * einingar, so her vert ingenting vendt og ingenting delt på tusen. GLB-en
 * måtte gjennom (x, y, z) → (x, z, −y) og ein tusendel; dette er tala slik
 * dei står i snittet. Ein del som er 3 mm tjukk står som 3 i fila.
 *
 * KVAR DEL ER EIT EIGE OBJEKT, ikkje ein del av eitt. Slicaren listar dei
 * med adressa si, du kan sløkkje ein av dei, gje ein annan fleire skal, og
 * «arranger» legg dei på platen for seg sjølv. Eitt nett med tolv ribber i
 * er tolv ribber du ikkje kan velje mellom.
 *
 * HJØRNA VERT SVEISTE. Snittet byggjer lause trekantar — ni tal om gongen,
 * som STL vil ha dei — og eit slikt nett har ingen naboar: kvar kant er ei
 * kant mot ingenting. 3MF vil ha hjørne og indeksar, og ein slicer som får
 * eit usveisa nett melder «ikkje-manifold» og reparerer det sjølv. Betre å
 * levere det heilt: `weld` gjer nett dette steget, det same importen gjer
 * med ei fil som kjem inn.
 */
import { makeSoup, weld } from "./soup"
import { zip } from "./zip"

/** ein del i fila: namnet objektet får — adressa — og trekantane hans */
export type MfDel = { namn: string; positions: Float32Array; tris: number }

const NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"

/** OPC vil ha ei innhaldstypeliste og ei rot-relasjon. Begge er faste. */
const TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rel0" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`

/** Adressa er tal og bokstavar, men kjelda kan heite kva som helst, og
 *  eit filnamn med & i vert eit XML-dokument som ikkje let seg opne. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string)

/** mikrometeren er meir enn nok, og halverer fila mot full flyttalsutskrift */
const tal = (v: number) => String(+v.toFixed(3))

export function delarTo3mf(delar: readonly MfDel[], namn = "slicerman"): Uint8Array {
  const objekt: string[] = []
  const bygg: string[] = []
  let id = 0
  for (const d of delar) {
    if (d.tris <= 0) continue
    const { verts, idx } = weld(makeSoup(d.positions))
    const v: string[] = []
    for (let i = 0; i < verts.length; i += 3) {
      v.push(`   <vertex x="${tal(verts[i])}" y="${tal(verts[i + 1])}" z="${tal(verts[i + 2])}"/>`)
    }
    // Sveisen kan slå to hjørne i ein trekant saman til eitt. Då har
    // trekanten ikkje lenger areal, og 3MF krev at dei tre indeksane er
    // ulike — so han fell bort, slik han alt hadde falle bort i handa.
    const t: string[] = []
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i]
      const b = idx[i + 1]
      const c = idx[i + 2]
      if (a === b || b === c || c === a) continue
      t.push(`   <triangle v1="${a}" v2="${b}" v3="${c}"/>`)
    }
    if (!t.length) continue
    id++
    objekt.push(
      `  <object id="${id}" type="model" name="${esc(d.namn)}">`,
      "   <mesh>",
      "    <vertices>",
      ...v,
      "    </vertices>",
      "    <triangles>",
      ...t,
      "    </triangles>",
      "   </mesh>",
      "  </object>",
    )
    // Delane ligg alt der nestinga la dei, so vendinga er den same for alle.
    // Matrisa er rad for rad, med flyttinga sist — her berre einingsmatrisa.
    bygg.push(`  <item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`)
  }
  const model = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model unit="millimeter" xml:lang="en-US" xmlns="${NS}">`,
    ' <metadata name="Application">slicerman</metadata>',
    ` <metadata name="Title">${esc(namn)}</metadata>`,
    " <resources>",
    ...objekt,
    " </resources>",
    " <build>",
    ...bygg,
    " </build>",
    "</model>",
    "",
  ].join("\n")
  return new Uint8Array(
    zip([
      { name: "[Content_Types].xml", text: TYPES },
      { name: "_rels/.rels", text: RELS },
      { name: "3D/3dmodel.model", text: model },
    ]),
  )
}
