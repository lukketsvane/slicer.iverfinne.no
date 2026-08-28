/**
 * Ein ZIP-skrivar på femti liner.
 *
 * Eit uttak med tre plater er tre filer, og tre filer er ei mappe. Å dra
 * inn eit heilt bibliotek for det er å leggje ein megabyte i nettlesaren
 * for ei arkivformat frå 1989 — og det format har ein modus som er «legg
 * bytane etter kvarandre og skriv ei innhaldsliste til slutt». Ingen
 * komprimering: ein SVG komprimerer godt, men det er ikkje storleiken som
 * er problemet her, det er at det skal vera éi nedlasting.
 *
 * Namna er ASCII. ZIP kan bera UTF-8, men berre med eit flagg somme
 * gamle utpakkarar ikkje les, og filnamna herifrå er alt reinska.
 */
/** Anten tekst eller bytar. Ein STL og eit nett er ikkje tekst. */
export type Entry = { name: string; text?: string; data?: Uint8Array }

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zip(entries: readonly Entry[]): ArrayBuffer {
  const enc = new TextEncoder()
  const files = entries.map((e) => {
    const name = enc.encode(e.name)
    const data = e.data ?? enc.encode(e.text ?? "")
    return { name, data, crc: crc32(data) }
  })

  let total = 0
  for (const f of files) total += 30 + f.name.length + f.data.length
  const cdStart = total
  for (const f of files) total += 46 + f.name.length
  const cdSize = total - cdStart
  total += 22

  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)
  let at = 0
  const offsets: number[] = []

  for (const f of files) {
    offsets.push(at)
    dv.setUint32(at, 0x04034b50, true)
    dv.setUint16(at + 4, 20, true) // versjon som trengst
    dv.setUint16(at + 6, 0, true) // ingen flagg
    dv.setUint16(at + 8, 0, true) // lagra, ikkje komprimert
    dv.setUint16(at + 10, 0, true) // tid
    dv.setUint16(at + 12, 0x21, true) // dato: 1980-01-01, fast
    dv.setUint32(at + 14, f.crc, true)
    dv.setUint32(at + 18, f.data.length, true)
    dv.setUint32(at + 22, f.data.length, true)
    dv.setUint16(at + 26, f.name.length, true)
    dv.setUint16(at + 28, 0, true)
    u8.set(f.name, at + 30)
    u8.set(f.data, at + 30 + f.name.length)
    at += 30 + f.name.length + f.data.length
  }

  files.forEach((f, i) => {
    dv.setUint32(at, 0x02014b50, true)
    dv.setUint16(at + 4, 20, true)
    dv.setUint16(at + 6, 20, true)
    dv.setUint16(at + 8, 0, true)
    dv.setUint16(at + 10, 0, true)
    dv.setUint16(at + 12, 0, true)
    dv.setUint16(at + 14, 0x21, true)
    dv.setUint32(at + 16, f.crc, true)
    dv.setUint32(at + 20, f.data.length, true)
    dv.setUint32(at + 24, f.data.length, true)
    dv.setUint16(at + 28, f.name.length, true)
    dv.setUint16(at + 30, 0, true)
    dv.setUint16(at + 32, 0, true)
    dv.setUint16(at + 34, 0, true)
    dv.setUint16(at + 36, 0, true)
    dv.setUint32(at + 38, 0, true)
    dv.setUint32(at + 42, offsets[i], true)
    u8.set(f.name, at + 46)
    at += 46 + f.name.length
  })

  dv.setUint32(at, 0x06054b50, true)
  dv.setUint16(at + 4, 0, true)
  dv.setUint16(at + 6, 0, true)
  dv.setUint16(at + 8, files.length, true)
  dv.setUint16(at + 10, files.length, true)
  dv.setUint32(at + 12, cdSize, true)
  dv.setUint32(at + 16, cdStart, true)
  dv.setUint16(at + 20, 0, true)
  return buf
}

/**
 * Og attende igjen.
 *
 * Berre den eine modusen skrivaren over lagar: bytane etter kvarandre,
 * ukomprimerte. Ein ZIP som er komprimert treng ein inflate, og det er
 * hundre gonger meir kode enn heile denne fila — so han vert sagt nei til
 * med eit ord i staden for lesen halvvegs.
 *
 * Innhaldslista til slutt er fasiten, ikkje dei lokale hovuda: eit arkiv
 * som er skrive om att kan ha gamle hovud liggjande att framme.
 */
export function unzip(buf: ArrayBuffer): { name: string; data: Uint8Array }[] {
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)
  const dec = new TextDecoder()
  // Slutten på innhaldslista står bakarst, og kan ha ein kommentar etter
  // seg. Difor eit søk bakfrå, og ikkje ei fast adresse.
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= 0 && i > buf.byteLength - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("ikkje eit ZIP-arkiv")
  const tal = dv.getUint16(eocd + 10, true)
  let at = dv.getUint32(eocd + 16, true)
  const ut: { name: string; data: Uint8Array }[] = []
  for (let i = 0; i < tal; i++) {
    if (at + 46 > buf.byteLength || dv.getUint32(at, true) !== 0x02014b50) {
      throw new Error("øydelagd innhaldsliste i ZIP-en")
    }
    const metode = dv.getUint16(at + 10, true)
    const storleik = dv.getUint32(at + 24, true)
    const nLen = dv.getUint16(at + 28, true)
    const eLen = dv.getUint16(at + 30, true)
    const kLen = dv.getUint16(at + 32, true)
    const lokal = dv.getUint32(at + 42, true)
    const name = dec.decode(u8.subarray(at + 46, at + 46 + nLen))
    if (metode !== 0) throw new Error(`«${name}» er komprimert, og det les ikkje denne`)
    if (lokal + 30 > buf.byteLength || dv.getUint32(lokal, true) !== 0x04034b50) {
      throw new Error(`fann ikkje «${name}» der innhaldslista sa`)
    }
    const lnLen = dv.getUint16(lokal + 26, true)
    const leLen = dv.getUint16(lokal + 28, true)
    const start = lokal + 30 + lnLen + leLen
    if (start + storleik > buf.byteLength) throw new Error(`«${name}» rekk utanfor arkivet`)
    ut.push({ name, data: u8.subarray(start, start + storleik) })
    at += 46 + nLen + eLen + kLen
  }
  return ut
}
