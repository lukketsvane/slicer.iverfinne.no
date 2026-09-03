/**
 * SLICERMAN — nettet, slik reiskapen held det.
 *
 * To former for det same. `Soup` er lause trekantar, ni tal om gongen: det
 * er formatet STL kjem i, det er formatet skjermkortet vil ha, og det er
 * formatet stråleskytinga les. `Indexed` er hjørne og indeksar: det er
 * formatet ein må ha for å kunne spørje kven som er NABO — og glattinga,
 * forenklinga, kanttalet og skyggjinga er alle reine nabospørsmål.
 *
 * Vegen mellom dei to går gjennom sveisinga: to hjørne som ligg nærare
 * kvarandre enn ein tidels promille av nettet si eiga utstrekning ER det
 * same hjørnet. Utan det steget er ein STL-fil frå ein skannar tre
 * millionar hjørne utan ein einaste nabo, og då har verken glattinga eller
 * forenklinga noko å arbeide med.
 */
import type { Vec3 } from "./core"

export type Soup = {
  /** ni tal per trekant: a, b, c */
  pos: Float32Array
  tris: number
  min: Vec3
  max: Vec3
}

export type Indexed = {
  /** tre tal per hjørne */
  verts: Float32Array
  /** tre indeksar per trekant */
  idx: Uint32Array
}

export function bounds(pos: Float32Array): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = pos[i + k]
      if (v < min[k]) min[k] = v
      if (v > max[k]) max[k] = v
    }
  }
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = 0
    max[0] = max[1] = max[2] = 1
  }
  return { min, max }
}

export function makeSoup(pos: Float32Array): Soup {
  const b = bounds(pos)
  return { pos, tris: Math.floor(pos.length / 9), min: b.min, max: b.max }
}

export const diag = (s: { min: Vec3; max: Vec3 }) =>
  Math.hypot(s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2]) || 1

// =============================================================================
// SVEIS OG SPLITT
// =============================================================================
/**
 * Lause trekantar inn, hjørne og indeksar ut.
 *
 * Nøkkelen er koordinatet runda til `eps`, og det er runding og ikkje
 * avstandssøk: eit ekte næraste-nabo-søk over tre millionar punkt kostar
 * eit tre å byggje, og skilnaden på resultatet er hjørne som ligg nøyaktig
 * på ei cellegrense. Dei vert to i staden for eitt, og det er ein feil
 * ingen kan sjå på eit nett med fleire tusen hjørne.
 *
 * Steget er det som ber heile importen: det som tek lengst tid på ein stor
 * fil, er dette og ikkje sjølve snittinga.
 */
export function weld(s: Soup, eps = 0): Indexed {
  const e = eps > 0 ? eps : diag(s) * 1e-4
  const inv = 1 / e
  // Nøkkelen er eit TAL og ikkje ein streng.
  //
  // Det er ikkje mikrooptimering. Ein streng per hjørne på eit skann med
  // tre millionar hjørne er tre millionar strengar som skal setjast saman,
  // hashast og samlast opp att — og det åleine er halvanna sekund, meir enn
  // heile resten av snittinga til saman. Kvar akse vert klemd inn i sytten
  // bit og pakka i eitt tal; femtien bit ligg godt innanfor det ein double
  // held eksakt, so to like koordinat gjev framleis nøyaktig same nøkkel.
  // Spennet per akse er per definisjon under ti tusen celler, av di `e` er
  // ein titusendel av diagonalen.
  const M = 131072
  const bx = s.min[0]
  const by = s.min[1]
  const bz = s.min[2]
  const q = (v: number, o: number) => {
    const k = Math.round((v - o) * inv)
    return k < 0 ? 0 : k >= M ? M - 1 : k
  }
  const map = new Map<number, number>()
  const verts: number[] = []
  const idx = new Uint32Array(s.tris * 3)
  const P = s.pos
  for (let i = 0; i < s.tris * 3; i++) {
    const o = i * 3
    const x = P[o]
    const y = P[o + 1]
    const z = P[o + 2]
    const key = (q(x, bx) * M + q(y, by)) * M + q(z, bz)
    let v = map.get(key)
    if (v === undefined) {
      v = verts.length / 3
      map.set(key, v)
      verts.push(x, y, z)
    }
    idx[i] = v
  }
  return { verts: new Float32Array(verts), idx }
}

/**
 * Normalar med KNEKK.
 *
 * Ein skanna elefant med flatenormalar ser ut som ein diamant. Ein kube med
 * mjuke normalar ser ut som ei pute. Begge er feil, og dei er feil av
 * motsett grunn: den eine glattar ingenting, den andre glattar alt.
 *
 * Rett svar er å glatte over kantar som ikkje er kantar, og la dei som ER
 * det stå. Kvart hjørne i kvar trekant får summen av flatenormalane til dei
 * nabotrekantane som vender OM LAG same veg som han sjølv — er naboen
 * meir enn førti grader unna, er det ein ekte kant, og då skal dei to ha
 * kvar sin normal. Det er den same regelen som «smoothing groups» i eit
 * modelleringsprogram, berre rekna ut av geometrien i staden for sett av
 * ein brukar.
 *
 * Resultatet er per HJØRNE i kvar trekant og ikkje per hjørne i nettet: eit
 * hjørne på ein kubekant har tre ulike normalar alt etter kva side ein ser
 * han frå, og det er heile poenget.
 */
export function shade(m: Indexed, creaseDeg = 40): { pos: Float32Array; nrm: Float32Array } {
  const V = m.verts
  const nf = m.idx.length / 3
  const nv = V.length / 3
  const cosMin = Math.cos((creaseDeg * Math.PI) / 180)

  // flatenormalane, ikkje normaliserte: lengda er dobbelt arealet, og det
  // er nett den vektinga ein vil ha når fleire flater møtest i eit hjørne
  const fn = new Float32Array(nf * 3)
  for (let t = 0; t < nf; t++) {
    const ia = m.idx[t * 3] * 3
    const ib = m.idx[t * 3 + 1] * 3
    const ic = m.idx[t * 3 + 2] * 3
    const ux = V[ib] - V[ia]
    const uy = V[ib + 1] - V[ia + 1]
    const uz = V[ib + 2] - V[ia + 2]
    const vx = V[ic] - V[ia]
    const vy = V[ic + 1] - V[ia + 1]
    const vz = V[ic + 2] - V[ia + 2]
    fn[t * 3] = uy * vz - uz * vy
    fn[t * 3 + 1] = uz * vx - ux * vz
    fn[t * 3 + 2] = ux * vy - uy * vx
  }

  // kva trekantar kvart hjørne høyrer til, pakka (CSR)
  const start = new Uint32Array(nv + 1)
  for (let i = 0; i < m.idx.length; i++) start[m.idx[i] + 1]++
  for (let i = 0; i < nv; i++) start[i + 1] += start[i]
  const fill = start.slice(0, nv)
  const faces = new Uint32Array(m.idx.length)
  for (let t = 0; t < nf; t++) {
    for (let c = 0; c < 3; c++) faces[fill[m.idx[t * 3 + c]]++] = t
  }

  const pos = new Float32Array(nf * 9)
  const nrm = new Float32Array(nf * 9)
  for (let t = 0; t < nf; t++) {
    const ax = fn[t * 3]
    const ay = fn[t * 3 + 1]
    const az = fn[t * 3 + 2]
    const aL = Math.hypot(ax, ay, az) || 1
    for (let c = 0; c < 3; c++) {
      const v = m.idx[t * 3 + c]
      const src = v * 3
      const dst = t * 9 + c * 3
      pos[dst] = V[src]
      pos[dst + 1] = V[src + 1]
      pos[dst + 2] = V[src + 2]
      let sx = 0
      let sy = 0
      let sz = 0
      for (let i = start[v]; i < start[v + 1]; i++) {
        const g = faces[i] * 3
        const bx = fn[g]
        const by = fn[g + 1]
        const bz = fn[g + 2]
        const bL = Math.hypot(bx, by, bz) || 1
        if ((ax * bx + ay * by + az * bz) / (aL * bL) < cosMin) continue
        sx += bx
        sy += by
        sz += bz
      }
      const L = Math.hypot(sx, sy, sz)
      if (L > 1e-12) {
        nrm[dst] = sx / L
        nrm[dst + 1] = sy / L
        nrm[dst + 2] = sz / L
      } else {
        nrm[dst] = ax / aL
        nrm[dst + 1] = ay / aL
        nrm[dst + 2] = az / aL
      }
    }
  }
  return { pos, nrm }
}

// =============================================================================
// VINDINGA
// =============================================================================
/**
 * Volumet med forteikn, av divergenssetninga.
 *
 * Talet er interessant for ein einaste grunn: FORTEIKNET. Eit lukka nett
 * med normalane ut har positivt volum; eit med normalane inn har negativt.
 * Og eit nett med normalane inn er akkurat like vanleg som det andre —
 * ein eksport som gløymde å snu, eit skann sett frå «feil» side, ein
 * boolsk operasjon i eit program som ikkje reinsa opp etter seg.
 */
export function signedVolume(m: Indexed): number {
  const V = m.verts
  /**
   * RUNDT NETTET SITT EIGE MIDTPUNKT, IKKJE RUNDT ORIGO I FILA.
   *
   * For ei LUKKA flate er summen den same kvar du legg origo — det er
   * divergensteoremet, og flyttinga fell ut. For ei OPEN flate gjer ho
   * ikkje det: kjeglene frå origo ut til randa tel med, og då avgjer det
   * punktet fila tilfeldigvis har som null kva forteikn svaret får.
   *
   * Ein kube utan ei sideflate, rett vunden heile vegen:
   *   origo i hjørnet      +1 000 000   står
   *   origo 300 mm unna             0   står
   *   origo 500 mm unna      −666 667   VERT SNUDD
   *
   * Same form, same vinding. Og eit nett som vert snudd ut-inn les som
   * ingen ting: null ribber, null delar, tom skjerm — nett det `flip` er
   * til for å hindre. «Eit nett frå ein skannar har origo der skannaren
   * stod», seier `place` sin eigen kommentar; det er den situasjonen.
   *
   * Midtpunktet i boksen kring nettet er eit punkt som fylgjer forma og
   * ikkje fila. For lukka nett endrar det ingenting.
   */
  let x0 = Infinity
  let y0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let z1 = -Infinity
  for (let i = 0; i < V.length; i += 3) {
    if (V[i] < x0) x0 = V[i]
    if (V[i] > x1) x1 = V[i]
    if (V[i + 1] < y0) y0 = V[i + 1]
    if (V[i + 1] > y1) y1 = V[i + 1]
    if (V[i + 2] < z0) z0 = V[i + 2]
    if (V[i + 2] > z1) z1 = V[i + 2]
  }
  if (!Number.isFinite(x0)) return 0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const cz = (z0 + z1) / 2
  let v = 0
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t] * 3
    const b = m.idx[t + 1] * 3
    const c = m.idx[t + 2] * 3
    const ax = V[a] - cx
    const ay = V[a + 1] - cy
    const az = V[a + 2] - cz
    const bx = V[b] - cx
    const by = V[b + 1] - cy
    const bz = V[b + 2] - cz
    const cx2 = V[c] - cx
    const cy2 = V[c + 1] - cy
    const cz2 = V[c + 2] - cz
    v += (ax * (by * cz2 - bz * cy2) - ay * (bx * cz2 - bz * cx2) + az * (bx * cy2 - by * cx2)) / 6
  }
  return v
}

/**
 * Nettet snudd ut-inn.
 *
 * Snittinga les innsida ved å telje kva veg kvar trekant vender. Vender
 * dei alle feil veg, tel ho kvar veg INN som ein veg UT, summen kjem
 * aldri over null, og svaret er at objektet ikkje finst: null ribber, null
 * delar, tom skjerm. Reiskapen skal ikkje svare det på ei fil som er heilt
 * i orden bortsett frå ein forteiknsfeil, so han snur henne i staden.
 *
 * Dette rettar den GLOBALE feilen. Eit nett der somme trekantar vender ut
 * og andre inn, om kvarandre, er ein annan og verre skade — der hjelper
 * berre å reparere nettet, og det er ikkje denne reiskapen sin jobb.
 */
export function flip(m: Indexed): Indexed {
  const idx = Uint32Array.from(m.idx)
  for (let t = 0; t < idx.length; t += 3) {
    const q = idx[t + 1]
    idx[t + 1] = idx[t + 2]
    idx[t + 2] = q
  }
  return { verts: m.verts, idx }
}

// =============================================================================
// KANTAR
// =============================================================================
/**
 * Kantar som berre høyrer til éin trekant. Eit lukka nett har ingen; eit
 * skann har som regel nokre, og eit nett med hòl i er eit nett stråla går
 * rett gjennom. Difor står talet i tavla i staden for i ein feilmelding:
 * reiskapen snittar det likevel, men han seier frå kva han snittar.
 */
export function openEdges(m: Indexed): number {
  const seen = new Map<number, number>()
  const n = m.verts.length / 3
  const key = (a: number, b: number) => (a < b ? a * n + b : b * n + a)
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t]
    const b = m.idx[t + 1]
    const c = m.idx[t + 2]
    // Ein NULLTREKANT, ikkje berre den samanfalne kanten hans.
    //
    // Ein trekant med to like hjørne har ikkje noka flate. Berre den
    // samanfalne kanten vart hoppa over, so dei to andre — som er den
    // SAME kanten, gått kvar sin veg — vart begge talde, og den kanten
    // kom opp i fire og vart meld som open. Ei UV-kule har ein slik
    // trekant per rute ved kvar pol: kule(50, 40) er tett, og vart meld
    // med 80 opne kantar. Panelet sa «open» om eit nett som er lukka.
    if (a === b || b === c || c === a) continue
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = key(u, v)
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
  }
  let open = 0
  for (const v of seen.values()) if (v !== 2) open++
  return open
}

// =============================================================================
// FLYTTING
// =============================================================================
/**
 * Rotasjon, skalering og landing, i den rekkjefylgja.
 *
 * Rekkjefylgja er ikkje ein smak: skalerer ein fyrst og roterer etterpå,
 * er «lengste side = 300 mm» ikkje sant lenger — rotasjonen har gjeve
 * objektet ein ny omsluttande boks. Difor vert boksen alltid lesen ETTER
 * at nettet står slik det skal stå.
 *
 * Til slutt vert objektet sentrert i planet og sett ned på golvet. Eit nett
 * frå ein skannar har origo der skannaren stod, og eit objekt som svevar
 * tre meter over golvet er eit objekt kameraet ikkje finn.
 */
export function place(
  pos: Float32Array,
  o: { rotX: number; rotY: number; rotZ: number; storleik: number },
): Float32Array {
  return plassering(pos, o).pos
}

/**
 * Plasseringa med reknestykket sitt synleg.
 *
 * `place` gjev berre hjørna. Men den som skal flytte ein BIT av kroppen med
 * fingeren treng vegen attende: eit drag på skjermen er millimeter i det
 * plasserte rommet, og biten står i det felles. Skalaen `k` og vendinga er
 * det som skil dei to, og dei vert rekna her — éin gong, på same staden som
 * hjørna. `vend` er den same avbildinga for eitt punkt, so ein boks kan
 * fylgje med utan at nokon skriv matematikken om att.
 */
export function plassering(
  pos: Float32Array,
  o: { rotX: number; rotY: number; rotZ: number; storleik: number },
): { pos: Float32Array; k: number; vend: (p: Vec3) => Vec3 } {
  const rx = (o.rotX * Math.PI) / 180
  const ry = (o.rotY * Math.PI) / 180
  const rz = (o.rotZ * Math.PI) / 180
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)
  const out = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i]
    let y = pos[i + 1]
    let z = pos[i + 2]
    // X
    let t = y * cx - z * sx
    z = y * sx + z * cx
    y = t
    // Y
    t = x * cy + z * sy
    z = -x * sy + z * cy
    x = t
    // Z
    t = x * cz - y * sz
    y = x * sz + y * cz
    x = t
    out[i] = x
    out[i + 1] = y
    out[i + 2] = z
  }
  const b = bounds(out)
  const dx = b.max[0] - b.min[0]
  const dy = b.max[1] - b.min[1]
  const dz = b.max[2] - b.min[2]
  const k = o.storleik / Math.max(dx, dy, dz, 1e-6)
  const mx = ((b.min[0] + b.max[0]) / 2) * k
  const my = ((b.min[1] + b.max[1]) / 2) * k
  const mz = b.min[2] * k
  for (let i = 0; i < out.length; i += 3) {
    out[i] = out[i] * k - mx
    out[i + 1] = out[i + 1] * k - my
    out[i + 2] = out[i + 2] * k - mz
  }
  const vend = (p: Vec3): Vec3 => {
    let x = p[0]
    let y = p[1]
    let z = p[2]
    let t2 = y * cx - z * sx
    z = y * sx + z * cx
    y = t2
    t2 = x * cy + z * sy
    z = -x * sy + z * cy
    x = t2
    t2 = x * cz - y * sz
    y = x * sz + y * cz
    x = t2
    return [x * k - mx, y * k - my, z * k - mz]
  }
  return { pos: out, k, vend }
}
