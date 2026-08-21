/**
 * STL inn.
 *
 * To format med same namn. Det binære er 80 byte hovud, eit tal, og
 * femti byte per trekant; ASCII-varianten er ord. Ein god del binære filer
 * byrjar på ordet «solid» av di den som skreiv dei kopierte hovudet frå
 * ei ASCII-fil, so ordet er ikkje eit prov. LENGDA er: ei binær fila er
 * nøyaktig 84 + 50·n byte, og det er ein test som ikkje let seg lure.
 */
import { makeSoup, type Soup } from "../soup"

export function parseStl(buf: ArrayBuffer): Soup {
  const dv = new DataView(buf)
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true)
    if (84 + n * 50 === buf.byteLength && n > 0) return binary(dv, n)
  }
  return ascii(new TextDecoder().decode(buf))
}

function binary(dv: DataView, n: number): Soup {
  const pos = new Float32Array(n * 9)
  for (let t = 0; t < n; t++) {
    // dei tolv fyrste bytane er normalen i fila. Han vert ikkje lesen:
    // halvparten av alle STL-ar i verda har han på null eller feil veg,
    // og vindinga på hjørna er det einaste ein kan tru på.
    const o = 84 + t * 50 + 12
    for (let i = 0; i < 9; i++) pos[t * 9 + i] = dv.getFloat32(o + i * 4, true)
  }
  return makeSoup(pos)
}

function ascii(txt: string): Soup {
  const out: number[] = []
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(txt)) !== null) {
    out.push(+m[1], +m[2], +m[3])
  }
  // eit hjørne som ikkje er ein del av ein heil trekant er ikkje noko
  const n = Math.floor(out.length / 9) * 9
  return makeSoup(new Float32Array(out.slice(0, n)))
}
