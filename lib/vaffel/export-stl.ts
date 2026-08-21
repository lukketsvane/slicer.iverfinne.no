/**
 * SLICERMAN — STL ut.
 *
 * Binær STL, millimeter, éin sekvens av lause trekantar utan indeksar.
 * Formatet er dumt med vilje: det er det einaste alle slicerar og alle
 * 3D-trykkjarar les likt.
 *
 * To fallgruver er handterte her. Den eine er hovudet: byrjar dei 80 fyrste
 * teikna på «solid», les mange program fila som ASCII og får berre søppel.
 * Den andre er vindinga: kvar trekant har både ein normal i fila og ei
 * rekkjefylgje på hjørna, og dei to skal seie det same. Nettet vårt ber
 * mjuke hjørnenormalar; her vert flatenormalen rekna på nytt av
 * geometrien, og hjørna bytte om når dei to peikar kvar sin veg.
 */
export function meshToStl(
  mesh: { positions: Float32Array; normals: Float32Array; tris: number },
  name = "slicerman",
): Uint8Array {
  const n = mesh.tris
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)

  const head = ascii(`SLICERMAN ${name} - mm - ${n} trekantar`)
  for (let i = 0; i < 80; i++) u8[i] = i < head.length ? head.charCodeAt(i) : 32
  dv.setUint32(80, n, true)

  const P = mesh.positions
  const N = mesh.normals
  for (let t = 0; t < n; t++) {
    const o = t * 9
    const ax = P[o]
    const ay = P[o + 1]
    const az = P[o + 2]
    let bx = P[o + 3]
    let by = P[o + 4]
    let bz = P[o + 5]
    let cx = P[o + 6]
    let cy = P[o + 7]
    let cz = P[o + 8]

    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

    // snittet av dei tre hjørnenormalane seier kva veg flata skal vende
    const wx = N[o] + N[o + 3] + N[o + 6]
    const wy = N[o + 1] + N[o + 4] + N[o + 7]
    const wz = N[o + 2] + N[o + 5] + N[o + 8]
    if (nx * wx + ny * wy + nz * wz < 0) {
      const tx = bx
      const ty = by
      const tz = bz
      bx = cx
      by = cy
      bz = cz
      cx = tx
      cy = ty
      cz = tz
      nx = -nx
      ny = -ny
      nz = -nz
    }

    // Degenererte trekantar får normalen frå skyggjinga i staden. Å skrive
    // (0,0,0) er lovleg, men nokre slicerar tolkar det som ei feilflate.
    const L = Math.hypot(nx, ny, nz)
    if (L > 1e-12) {
      nx /= L
      ny /= L
      nz /= L
    } else {
      const M = Math.hypot(wx, wy, wz) || 1
      nx = wx / M
      ny = wy / M
      nz = wz / M
    }

    const q = 84 + t * 50
    dv.setFloat32(q, nx, true)
    dv.setFloat32(q + 4, ny, true)
    dv.setFloat32(q + 8, nz, true)
    dv.setFloat32(q + 12, ax, true)
    dv.setFloat32(q + 16, ay, true)
    dv.setFloat32(q + 20, az, true)
    dv.setFloat32(q + 24, bx, true)
    dv.setFloat32(q + 28, by, true)
    dv.setFloat32(q + 32, bz, true)
    dv.setFloat32(q + 36, cx, true)
    dv.setFloat32(q + 40, cy, true)
    dv.setFloat32(q + 44, cz, true)
    dv.setUint16(q + 48, 0, true)
  }
  return u8
}

/** Hovudet er byte, ikkje tekst. Ein «é» skrive med charCodeAt vert
 *  avkorta til éin byte og kjem ut som søppel, so alt utanom ASCII går. */
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "-")
