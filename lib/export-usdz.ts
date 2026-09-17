import { zip } from "./zip"

const PRIM = "slicerman"

const tal = (v: number) => String(+v.toFixed(2))

export function meshToUsdz(
  mesh: { positions: Float32Array; tris: number },
  farge: readonly [number, number, number] = [0.72, 0.6, 0.42],
): Uint8Array {
  const n = mesh.tris * 3
  const P = mesh.positions
  const punkt: string[] = []
  const min: [number, number, number] = [0, 0, 0]
  const max: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const v: [number, number, number] = [P[i * 3], P[i * 3 + 2], -P[i * 3 + 1]]
    for (let a = 0; a < 3; a++) {
      if (i === 0 || v[a] < min[a]) min[a] = v[a]
      if (i === 0 || v[a] > max[a]) max[a] = v[a]
    }
    punkt.push(`(${tal(v[0])}, ${tal(v[1])}, ${tal(v[2])})`)
  }
  const idx: number[] = []
  for (let i = 0; i < n; i++) idx.push(i)
  const usda = [
    "#usda 1.0",
    "(",
    `    defaultPrim = "${PRIM}"`,
    "    metersPerUnit = 0.001",
    '    upAxis = "Y"',
    ")",
    "",
    `def Xform "${PRIM}"`,
    "{",
    '    def Mesh "delar"',
    "    {",
    "        uniform bool doubleSided = 1",
    `        float3[] extent = [(${min.map(tal).join(", ")}), (${max.map(tal).join(", ")})]`,
    `        int[] faceVertexCounts = [${Array.from({ length: mesh.tris }, () => 3).join(", ")}]`,
    `        int[] faceVertexIndices = [${idx.join(", ")}]`,
    `        point3f[] points = [${punkt.join(", ")}]`,
    '        uniform token subdivisionScheme = "none"',
    `        rel material:binding = </${PRIM}/material>`,
    "    }",
    '    def Material "material"',
    "    {",
    `        token outputs:surface.connect = </${PRIM}/material/pbr.outputs:surface>`,
    '        def Shader "pbr"',
    "        {",
    '            uniform token info:id = "UsdPreviewSurface"',
    `            color3f inputs:diffuseColor = (${farge.map((c) => +c.toFixed(3)).join(", ")})`,
    "            float inputs:metallic = 0",
    "            float inputs:roughness = 0.85",
    "            token outputs:surface",
    "        }",
    "    }",
    "}",
    "",
  ].join("\n")
  return new Uint8Array(zip([{ name: `${PRIM}.usda`, text: usda }], 64))
}
