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
  const n = Math.floor(out.length / 9) * 9
  return makeSoup(new Float32Array(out.slice(0, n)))
}
