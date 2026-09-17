import { makeSoup, weld } from "./soup"
import { zip } from "./zip"

export type MfDel = { namn: string; positions: Float32Array; tris: number }

const NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"

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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string)

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
