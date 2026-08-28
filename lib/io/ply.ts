/**
 * PLY inn.
 *
 * Formatet ein 3D-skannar spyttar ut. Hovudet er alltid tekst og seier kva
 * som fylgjer: kva element fila har, kor mange av kvart, og kva
 * eigenskapar kvart element ber. Kroppen er anten tekst eller binær.
 *
 * Grunnen til at lesaren er lengre enn STL-lesaren er at ein PLY-fil frå
 * ein skannar sjeldan har berre x, y og z. Ho har normalar, fargar,
 * konfidensverdiar og alt anna kameraet meinte noko om — i vilkårleg
 * rekkjefylgje, med vilkårlege typar. Difor vert steget mellom to hjørne
 * rekna av hovudet i staden for å gjettast, og x, y og z vert henta der
 * hovudet seier dei ligg.
 */
import { makeSoup, type Soup } from "../soup"

type Prop = { name: string; type: string; list?: { count: string; item: string } }

/**
 * KVA FOR EI LISTE PÅ EI FLATE SOM ER TREKANTANE.
 *
 * Ei PLY-flate kan ha fleire lister. `vertex_indices` er hjørna; ved sida
 * av han ligg det ofte ei `texcoord`-liste med seks flyttal, og på fila
 * frå ein fotogrammetri-pakke er ho der nesten alltid. Blir HO òg lesen
 * som hjørne, kjem det fire ekstra trekantar per flate, laga av
 * teksturkoordinatar tolka som indeksar — eit tetraeder på fire trekantar
 * kom inn med tjue.
 *
 * Ingen av dei ekstra trekantane er der objektet er, og strålane tel
 * vindinga: eit nett med slikt i seg har ikkje ei innside lenger.
 *
 * Er ingen av listene namngjeven som ein indeks, held vi på den fyrste.
 * Ho står fyrst i kvar PLY nokon har skrive.
 */
function indeksLista(props: Prop[]): number {
  let fyrste = -1
  for (let i = 0; i < props.length; i++) {
    if (props[i].type !== "list") continue
    if (fyrste < 0) fyrste = i
    if (props[i].name.toLowerCase().includes("ind")) return i
  }
  return fyrste
}
type Elem = { name: string; count: number; props: Prop[] }

const SIZE: Record<string, number> = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4,
  double: 8, float64: 8,
}

export function parsePly(buf: ArrayBuffer): Soup {
  const bytes = new Uint8Array(buf)
  // Hovudet er ASCII same kva kroppen er, so det let seg lesa byte for byte
  // utan å røre resten. Å avkode heile fila som tekst fyrst ville øydelagt
  // ein binær kropp på hundre megabyte.
  let end = -1
  const head: string[] = []
  let line = ""
  for (let i = 0; i < Math.min(bytes.length, 1 << 20); i++) {
    const c = bytes[i]
    if (c === 10) {
      const t = line.replace(/\r$/, "")
      head.push(t)
      line = ""
      if (t.trim() === "end_header") {
        end = i + 1
        break
      }
    } else {
      line += String.fromCharCode(c)
    }
  }
  if (end < 0) return makeSoup(new Float32Array(0))

  let format = "ascii"
  const elems: Elem[] = []
  for (const h of head) {
    const t = h.trim().split(/\s+/)
    if (t[0] === "format") format = t[1]
    else if (t[0] === "element") elems.push({ name: t[1], count: +t[2], props: [] })
    else if (t[0] === "property" && elems.length) {
      const e = elems[elems.length - 1]
      if (t[1] === "list") {
        e.props.push({ name: t[4], type: "list", list: { count: t[2], item: t[3] } })
      } else {
        e.props.push({ name: t[2], type: t[1] })
      }
    }
  }

  /**
   * TALET I HOVUDET ER EIT TAL NOKON HAR SKRIVE, IKKJE EIT TAL NOKON HAR TALT.
   *
   * `element vertex 1000000000` vart lese rett inn som lykkjegrense. Ei fil
   * på to hundre byte med `element foo 1e18` i hovudet sette difor arbeidaren
   * til å telje til ein trillion — han kom aldri attende, sida stod på «les
   * fila …» for alltid, og einaste vegen ut var å laste henne på nytt. Det
   * skal ikkje ei fil kunne gjere.
   *
   * Ei rad kan ikkje vera mindre enn dei faste felta sine: i ei binær fil er
   * det byta til kvar eigenskap, og i ei tekstfil minst eitt teikn per
   * verdi. Er talet i hovudet større enn det som får plass i det som ligg
   * att av fila, er hovudet ikkje til å tru på — og då er det ei ulesbar
   * fil, som er noko reiskapen alt veit å seie frå om.
   */
  const att = buf.byteLength - end
  for (const e of elems) {
    const minRad = e.props.reduce(
      (n, q) => n + (format === "ascii" ? 1 : q.type === "list" ? 1 : (SIZE[q.type] ?? 4)),
      0,
    )
    if (!Number.isFinite(e.count) || e.count < 0 || (minRad > 0 && e.count * minRad > att)) {
      throw new Error(`ply: «${e.name} ${e.count}» får ikkje plass i fila`)
    }
  }

  return format === "ascii"
    ? readAscii(new TextDecoder().decode(bytes.subarray(end)), elems)
    : readBinary(new DataView(buf, end), elems, format === "binary_little_endian")
}

function assemble(vx: number[], tri: number[]): Soup {
  const n = vx.length / 3
  const pos = new Float32Array(tri.length * 3)
  let k = 0
  for (const t of tri) {
    if (t < 0 || t >= n) return makeSoup(new Float32Array(0))
    pos[k++] = vx[t * 3]
    pos[k++] = vx[t * 3 + 1]
    pos[k++] = vx[t * 3 + 2]
  }
  return makeSoup(pos)
}

function fan(ring: number[], tri: number[]) {
  for (let i = 1; i + 1 < ring.length; i++) tri.push(ring[0], ring[i], ring[i + 1])
}

function readAscii(txt: string, elems: Elem[]): Soup {
  const tok = txt.split(/\s+/)
  let at = 0
  const next = () => +tok[at++]
  const vx: number[] = []
  const tri: number[] = []
  for (const e of elems) {
    const xi = e.props.findIndex((p) => p.name === "x")
    const yi = e.props.findIndex((p) => p.name === "y")
    const zi = e.props.findIndex((p) => p.name === "z")
    for (let i = 0; i < e.count; i++) {
      if (e.name === "vertex") {
        const row: number[] = []
        for (let j = 0; j < e.props.length; j++) row.push(next())
        vx.push(row[xi], row[yi], row[zi])
      } else if (e.name === "face") {
        const idx = indeksLista(e.props)
        for (let k = 0; k < e.props.length; k++) {
          const p = e.props[k]
          if (p.type === "list") {
            const c = next()
            if (k === idx) {
              const ring: number[] = []
              for (let j = 0; j < c; j++) ring.push(next())
              fan(ring, tri)
            } else {
              for (let j = 0; j < c; j++) next()
            }
          } else next()
        }
      } else {
        for (const p of e.props) {
          if (p.type === "list") {
            const c = next()
            for (let j = 0; j < c; j++) next()
          } else next()
        }
      }
    }
  }
  return assemble(vx, tri)
}

function readBinary(dv: DataView, elems: Elem[], le: boolean): Soup {
  let at = 0
  const read = (type: string): number => {
    switch (type) {
      case "char": case "int8": { const v = dv.getInt8(at); at += 1; return v }
      case "uchar": case "uint8": { const v = dv.getUint8(at); at += 1; return v }
      case "short": case "int16": { const v = dv.getInt16(at, le); at += 2; return v }
      case "ushort": case "uint16": { const v = dv.getUint16(at, le); at += 2; return v }
      case "int": case "int32": { const v = dv.getInt32(at, le); at += 4; return v }
      case "uint": case "uint32": { const v = dv.getUint32(at, le); at += 4; return v }
      case "double": case "float64": { const v = dv.getFloat64(at, le); at += 8; return v }
      default: { const v = dv.getFloat32(at, le); at += 4; return v }
    }
  }
  const skip = (n: number) => {
    at += n
  }

  const vx: number[] = []
  const tri: number[] = []
  for (const e of elems) {
    const fixed = e.props.every((p) => p.type !== "list")
    if (e.name === "vertex" && fixed) {
      // Steget mellom to hjørne er summen av eigenskapane, og x, y og z
      // ligg der hovudet sa. Alt anna vert hoppa over utan å lesast.
      let off = 0
      const at3: Record<string, { o: number; t: string }> = {}
      for (const p of e.props) {
        at3[p.name] = { o: off, t: p.type }
        off += SIZE[p.type] ?? 4
      }
      const base = at
      for (let i = 0; i < e.count; i++) {
        for (const key of ["x", "y", "z"]) {
          const q = at3[key]
          at = base + i * off + (q?.o ?? 0)
          vx.push(q ? read(q.t) : 0)
        }
      }
      at = base + e.count * off
      continue
    }
    const idx = indeksLista(e.props)
    for (let i = 0; i < e.count; i++) {
      for (let k = 0; k < e.props.length; k++) {
        const p = e.props[k]
        if (p.type === "list" && p.list) {
          const c = read(p.list.count)
          if (e.name === "face" && k === idx) {
            const ring: number[] = []
            for (let j = 0; j < c; j++) ring.push(read(p.list.item))
            fan(ring, tri)
          } else {
            skip(c * (SIZE[p.list.item] ?? 4))
          }
        } else if (e.name === "vertex" && (p.name === "x" || p.name === "y" || p.name === "z")) {
          vx.push(read(p.type))
        } else {
          skip(SIZE[p.type] ?? 4)
        }
      }
    }
  }
  return assemble(vx, tri)
}
