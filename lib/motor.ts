/**
 * SLICERMAN — motoren: kontrakten samla på éin stad.
 *
 * Kvar del er flat og rett, medan forma over dei er krum: ei krum flate
 * let seg ikkje bøyge av ei plate, men ho let seg TILNÆRME av kantane på
 * mange plater. Plana kryssar kvarandre og held seg sjølve — ikkje eit lim,
 * ein skrue eller ei oppspenning i heile stabelen.
 */
import { bbox, kuttCsv, MATERIALS, nn, offsetPoly, type Material, type Pt } from "./core"
import type { BuildOut, DetailKey, ExportKind, ExportOut, Group, ArkSyn, Kutt, Metrics, ParamBag, Range, Rom, Rule, Vec3 } from "./core"
import { erPrimitiv, label as srcLabel, raw as srcRaw } from "./sources"
import { makeKropp, scenaAv } from "./kropp"
import { erFilform, lesScene } from "./scene"
import { buildSnitt, DETAIL, skisseSyn, type SkisseSyn, type Snitt } from "./snitt"
import type { Plan } from "./plan"
import { flatDelar, flateMesh, lagDelar, lagMesh, type DelMesh } from "./mesh"
import { measure } from "./metrics"
import { checkRules } from "./rules"
import { makeBygg } from "./bygg"
import { montasjen, vegen, type Montasje } from "./montasje"
import { fitSize, strokesAt } from "./stroke"
import { placedRings } from "./nest"
import { apply } from "./pack"
import { meshToStl } from "./export-stl"
import { meshToGlb } from "./export-glb"
import { delarTo3mf } from "./export-3mf"
import { meshToUsdz } from "./export-usdz"
import { sheetDxf } from "./export-dxf"
import { couponSvg, profileSvg, ring, sheetSvg } from "./export-svg"
import { zip } from "./zip"
import { DEFAULT_PARAMS, GROUPS, PARAM_KEYS, PARAM_RANGES, clampParams, type Params } from "./params"

export type EngineDef = {
  id: string
  label: string
  note: string
  ranges: Record<string, Range>
  groups: readonly Group[]
  keys: readonly string[]
  defaults: ParamBag
  clamp(o: unknown, prev: ParamBag): ParamBag
  build(p: ParamBag, detail: DetailKey, view: Rom): BuildOut
  measure(p: ParamBag): Metrics
  rules(p: ParamBag, m: Metrics): Rule[]
  exportFile(p: ParamBag, what: ExportKind): ExportOut
  /** kuttlista: éi line per del, med adressa, forma, målet og plata */
  liste(p: ParamBag): Kutt[]
  /** éi plate slik ho ligg, som SVG — den same teikninga uttaket gjev */
  arkSyn(p: ParamBag, i: number): ArkSyn
  /**
   * MONTASJEN: dei same delane som kuttlista, kvar med nettet sitt, dei to
   * plassane sine — på plata og i objektet — og kva runde han kjem i.
   */
  montasje(p: ParamBag): Montasje
  /** skissa snitta før ho er låst: profilen og kryssa mot dei låste plana */
  skisse(p: ParamBag, plan: Plan): SkisseSyn
}

const asP = (p: ParamBag) => p as unknown as Params

/** Kor mykje snitt kuttfila skal kompensere for: NØYAKTIG éin gong. Står
 *  `snittveg` på maskina, er ho alt teken der. */
export const kerfOf = (p: Params) => (p.snittveg ? 0 : p.snitt)

/** Ein ny tom buffer kvar gong: ein delt tom Float32Array vert kopla frå
 *  fyrste gong han vert send gjennom postMessage. */
const EMPTY = () => new Float32Array(0)

/** desimalkomma i eit filnamn er bråk: 2,5 mm vert «2p5» */
const num = (v: number) => String(+v.toFixed(2)).replace(".", "p")

/** Materialet sin farge slik GLB og USDZ vil ha han: lineær, ikkje sRGB.
 *  Ein hex som vert send rett inn kjem ut for lys i kvar einaste lesar. */
const linear = (m: string): [number, number, number] => {
  const hex = MATERIALS[(m in MATERIALS ? m : "finer") as Material].hex
  return [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return +(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).toFixed(4)
  }) as [number, number, number]
}

/** Same stamme til PNG-en som til SVG-en; PNG-en vert laga på hovudtråden,
 *  so namnet må kunne lagast der òg, av ETIKETTEN. */
export const filnamnStamme = (label: string) =>
  ("slicer-" + label).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase().slice(0, 48)

const stem = (p: Params) => filnamnStamme(srcLabel(p.kjelde))

/** delane slik GLB-en vil ha dei: adressa er namnet på noden */
const nodar = (delar: readonly DelMesh[]) => delar.map((d) => ({ namn: d.adr, positions: d.positions, tris: d.tris }))

/**
 * KVA VEG EIN DEL KJEM INN, med ord — arket si utgåve.
 *
 * Kva veg det ER, seier `vegen` i `montasje.ts`, og han seier det til båe
 * som spør. Her står berre ordlyden: dette er ei tekstfil ved sida av ein
 * haug med delar, og ho har plass til ei heil setning der spalta på
 * telefonen har plass til eit ord.
 */
function retningOrd(m: Vec3 | null): string {
  switch (vegen(m)) {
    case "ligg":
      return "ligg — ingen ledd mot delar som alt ligg"
    case "ned":
      return "ovanfrå og ned"
    case "opp":
      return "nedanfrå og opp"
    default:
      return `sidelengs, langs (${(m as Vec3).map((c) => nn(c, 2)).join(", ")})`
  }
}

/**
 * DOMEN, SOM TEKST — reiskapen si eiga lesing, med ut i pakka.
 *
 * Tavla står på skjermen, og skjermen er ikkje med når plata ligg på
 * laseren. Ei hard line tyder at delane ikkje LET SEG lage eller setje
 * saman; ei mjuk er noko som kan gå betre. Begge høyrer med ut, av di ei
 * pakke med kuttfiler i er det som overlever økta.
 *
 * Ho stoggar ingenting. Ho står der so ingen kan seie at han ikkje visste.
 */
function reglarTxt(p: Params): string {
  const m = measure(p)
  const r = checkRules(p, m, undefined, false)
  const harde = r.filter((q) => q.hard && !q.ok)
  const mjuke = r.filter((q) => !q.hard && !q.ok)
  const line = (q: Rule) => `  ${q.ok ? "  " : "!!"} ${q.label.padEnd(22)} ${q.value}`
  return [
    `REGLAR — ${srcLabel(p.kjelde)}`,
    "",
    harde.length
      ? `${harde.length} HARDT BROT. Delane let seg ikkje lage eller setje saman slik dei står. Filene i denne pakka er skrivne likevel — reiskapen avgjer ikkje for deg — men dette er kva han veit:`
      : "Ingen harde brot: delane let seg lage og setje saman.",
    "",
    ...harde.flatMap((q) => [line(q), `     ${q.why}`, ""]),
    ...(mjuke.length ? ["Og desse kan gå betre:", "", ...mjuke.map(line), ""] : []),
    "Alle linene:",
    "",
    ...r.map(line),
    "",
  ].join("\n")
}

/**
 * MONTERINGA, SOM TEKST. Den som står ved benken med tjue delar og ein
 * telefon med tomt batteri treng det på papir: kva del fyrst, kva veg han
 * kjem inn, og mot kva. Adressa på delen er nøkkelen.
 */
export function montering(p: Params, s: Snitt): string {
  const liner = s.montering.orden.map((id, i) => {
    const r = s.ribber.find((q) => q.plan.id === id)
    const mot = [...new Set((r?.spor ?? []).map((q) => q.mot))].filter((m) => s.montering.orden.indexOf(m) < i)
    const stykke = r?.outlines.length ?? 0
    const namn = `${id}${stykke > 1 ? ` (${stykke} stykke)` : ""}`
    const veg = retningOrd(s.montering.retning[id] ?? null)
    // eit merke på den som ikkje kjem inn, so lista og varselet over syner
    // det same utan at nokon må telje seg fram
    const fast = s.montering.brot.includes(id) ? "  << STÅR FAST" : ""
    return `  ${i + 1}  ${namn}  ${veg}${mot.length ? `, mot ${mot.join(", ")}` : ""}${fast}`
  })
  /**
   * OG FILA LISTAR IKKJE EI REKKJEFYLGJE HO VEIT IKKJE GÅR.
   *
   * `montering.brot` er dei delane som ikkje kjem inn: dei har ledd mot to
   * delar som alt ligg, langs liner som ikkje er parallelle, og ei plate kan
   * berre skuvast éin veg. Den harde regelen `orden` seier det på skjermen —
   * men skjermen står ikkje ved benken, og denne fila gjer det.
   *
   * Ho stoggar ikkje kuttinga. Reiskapen avgjer ikkje for deg, og det finst
   * grunnar til å skjere delane likevel. Men ho skal ikkje gje deg ei liste
   * med tal som ser ut som ein plan når ho ikkje er det: eit ark som seier
   * «1, 2, 3» og stoggar på 3 er verre enn eit ark som seier frå.
   */
  const brotne = s.montering.brot
  const varsel = brotne.length
    ? [
        "DETTE GÅR IKKJE OPP.",
        "",
        `Desse delane kjem ikkje inn: ${brotne.join(", ")}.`,
        "Ein del vert skuva inn langs spora sine, og ei plate kan berre gå éin veg. Desse har ledd mot to delar som alt ligg, langs liner som ikkje er parallelle — så dei står fast same kva du gjer.",
        "",
        "Rekkjefylgja under er den reiskapen ville ha brukt. Ho stoggar på den fyrste av dei over. Skjer du dette, får du delar som ikkje let seg setje saman.",
        "Byt rekkjefylgja så ein slik del kjem inn FØR den eine han står fast mot, eller vinkle planet om. Reiskapen syner kva for eitt under «kan monterast».",
        "",
        "---",
        "",
      ]
    : []
  return [
    `MONTERING — ${srcLabel(p.kjelde)}`,
    `${s.ribber.length} plan, ${p.tjukn} mm plate. Adressa er gravert på kvar del.`,
    "",
    ...varsel,
    "I denne rekkjefylgja. Sporet på delen som kjem opnar seg i fartsretninga; sporet på delen som ligg opnar seg mot han.",
    ...liner,
    "",
    "Sit eit ledd for hardt, er klaringa for liten: skjer passprøva i den same plata og set klaringa til det sporet avkappet går i med tommelkraft.",
    "",
  ].join("\n")
}

export const MOTOR: EngineDef = {
  id: "plan",
  label: "plan",
  note: "kryssande plan, utan lim og utan skruar",
  ranges: PARAM_RANGES,
  groups: GROUPS,
  keys: PARAM_KEYS,
  defaults: DEFAULT_PARAMS as unknown as ParamBag,

  clamp: (o, prev) => clampParams(o, asP(prev)) as unknown as ParamBag,

  build(bag: ParamBag, detail: DetailKey, view: Rom): BuildOut {
    const p = asP(bag)
    const k = makeKropp(p)
    if (view === "flate") {
      const m = flateMesh(k)
      // berre her: kroppen er ein kropp, og handa skal kunne peike på bitane
      return { ...m, kant: EMPTY(), del: EMPTY(), bitar: k.bitar, skala: k.skala }
    }
    const s = buildSnitt(k, p, DETAIL[detail])
    return { ...lagMesh(s, p.tjukn), bitar: [], skala: k.skala }
  },

  measure: (bag) => measure(asP(bag)),
  rules: (bag, m) => checkRules(asP(bag), m),

  exportFile(bag: ParamBag, what: ExportKind): ExportOut {
    const p = asP(bag)
    const name = stem(p)
    if (what === "stl") {
      // SAME OBJEKT SOM DELANE, men lese fint: sjå `DETAIL.fil`.
      const bytes = meshToStl(lagMesh(makeBygg(p, DETAIL.fil).s, p.tjukn), name)
      return { name: `${name}.stl`, mime: "model/stl", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "glb") {
      // SAME GEOMETRIEN, DELT: ein node per del, med adressa som namn, under
      // éi gruppe som er heile montasjen.
      const b = makeBygg(p, DETAIL.fil)
      const bytes = meshToGlb([{ namn: name, delar: nodar(lagDelar(b.s, b.dl.delar, p.tjukn)) }], name, linear(p.material))
      return { name: `${name}.glb`, mime: "model/gltf-binary", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "flat") {
      /**
       * DEI SAME DELANE, LAGDE NED PÅ PLATA.
       *
       * Ei gruppe per plate og ein node per del, der nestinga la han. Namnet
       * ber tjukna og materialet av di dei to er det du ser i fila — kor
       * tjukk plata er, og kva farge ho har. SNITTET STÅR IKKJE I NAMNET,
       * av di det ikkje er teke: omrisset her er det nominelle, og ein
       * 3D-modell kompensert for laseren sin veg ville vore ein modell av
       * noko ingen skal lage.
       *
       * OG HO STÅR PÅ `mid`, ulikt dei andre objektfilene. «flat» er EI
       * GRUPPE PER PLATE — ho syner kvar nestinga la kvar del — og då gjer
       * ho ein påstand om ARK. Står det to plater i panelet, skal det vera
       * to grupper her, og ei pakking rekna på eit anna celletal kan lande
       * på eit anna tal. Dei andre objektfilene seier ingenting om plater
       * (3MF seier det rett ut: trykkjaren har inga plate), og dei er difor
       * fri til å lesast fint.
       */
      const { ns } = makeBygg(p, DETAIL.mid)
      const grupper = flatDelar(ns, p.tjukn).map((g) => ({ namn: `ark-${g.ark}`, delar: nodar(g.delar) }))
      const bytes = meshToGlb(grupper, name, linear(p.material))
      return { name: `${name}-${num(p.tjukn)}mm-${p.material}-flat.glb`, mime: "model/gltf-binary", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "3mf") {
      /**
       * DEI SAME FLATE DELANE, I DET FORMATET EIN SLICER OPNAR.
       *
       * «flat» er den rette geometrien for ein trykkjar og feil format;
       * dette er den same geometrien i rett format. Arka fell bort — ein
       * trykkjar har inga plate, han har alle delane — so dei vert éi
       * liste, og kvar del er sitt eige objekt med adressa si.
       *
       * Materialet står ikkje i namnet: fila seier ikkje kva du trykkjer
       * i, det gjer spolen. TJUKNA står, av di ho ER geometrien.
       */
      const { ns } = makeBygg(p, DETAIL.fil)
      const delar = flatDelar(ns, p.tjukn).flatMap((g) => nodar(g.delar))
      return { name: `${name}-${num(p.tjukn)}mm-delar.3mf`, mime: "model/3mf", data: delarTo3mf(delar, name).buffer.slice(0) as ArrayBuffer }
    }
    if (what === "usdz") {
      const bytes = meshToUsdz(lagMesh(makeBygg(p, DETAIL.fil).s, p.tjukn), linear(p.material))
      return { name: `${name}.usdz`, mime: "model/vnd.usdz+zip", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "prove") {
      // Passprøva treng korkje plan eller nesting: ei lita plate med sju spor.
      return { name: `passprove-${num(p.tjukn)}mm-${p.material}.svg`, mime: "image/svg+xml", text: couponSvg(p.tjukn, kerfOf(p), p.snitt, p.material) }
    }
    const { s, ns } = makeBygg(p, DETAIL.mid)
    const kerf = kerfOf(p)
    /**
     * KVA PLATE FILA VART SKOREN FOR, I NAMNET.
     *
     * Eit kuttark er ikkje ei teikning av eit objekt, det er ei oppskrift på
     * ei plate: tre millimeter mdf med eit snitt på to tidelar. Same objekt
     * på fire millimeter finér er ei anna fil som ser lik ut, og eit ark som
     * ligg i nedlastingsmappa i tre veker seier ikkje kva av dei det er.
     *
     * Snittvegen er den skarpaste av dei. Ligg snittet i MASKINA, skriv
     * fila den nominelle konturen — og då er ho byte for byte den same som
     * ei fil utan snitt i det heile. To jobbar som må køyrast ulikt og som
     * ikkje kan skiljast på innhaldet: namnet er den einaste staden det
     * kan stå. Passprøva gjekk føre og heiter alt `passprove-3mm-mdf.svg`.
     */
    const plate = `${num(p.tjukn)}mm-${p.material}-${p.snittveg ? "maskinsnitt" : `k${num(p.snitt)}`}`
    /** Éi plate = éi fil. Namnet seier kva for ei av kor mange. */
    const arkFiler = () => {
      const n = ns.sheets.length
      return ns.sheets.map((_, i) => ({ name: n <= 1 ? `${name}-${plate}-ark.svg` : `${name}-${plate}-ark-${i + 1}av${n}.svg`, text: sheetSvg(ns, i, kerf) }))
    }
    /** Det same for DXF-en: han stabla platene i ei fil, og då låg dei
     *  fleste av dei utanfor kva maskina kan setjast til. */
    const dxfFiler = () => {
      const n = ns.sheets.length
      return ns.sheets.map((_, i) => ({ name: n <= 1 ? `${name}-${plate}.dxf` : `${name}-${plate}-ark-${i + 1}av${n}.dxf`, text: sheetDxf(ns, i, kerf) }))
    }
    /** innstillingane som tekst — det er denne fila som gjer eit prosjekt til noko du kan opne att */
    const oppsett = (utan?: string[]) =>
      JSON.stringify({ reiskap: "slicer.iverfinne", utgåve: 2, kjelde: srcLabel(p.kjelde), ...(utan?.length ? { utan } : {}), p }, null, 1)

    if (what === "alt") {
      // HEILE JOBBEN I EI NEDLASTING: alt som høyrer til det same objektet
      // i den same mappa, med kuttlista og oppsettet ved sida av.
      return {
        name: `${name}-alt.zip`,
        mime: "application/zip",
        data: zip([
          { name: `${name}.stl`, data: meshToStl(lagMesh(s, p.tjukn), name) },
          ...dxfFiler(),
          { name: `${name}-profilar.svg`, text: profileSvg(s, kerf) },
          ...arkFiler(),
          { name: `passprove-${num(p.tjukn)}mm-${p.material}.svg`, text: couponSvg(p.tjukn, kerf, p.snitt, p.material) },
          { name: "kuttliste.csv", text: kuttCsv(MOTOR.liste(bag)) },
          { name: "montering.txt", text: montering(p, s) },
          { name: "reglar.txt", text: reglarTxt(p) },
          { name: "oppsett.json", text: oppsett() },
        ]),
      }
    }
    if (what === "prosjekt") {
      // Lenkja ber kvar innstilling utan om nettet. Denne fila ber begge —
      // kvar fil i scena, med id-en sin i namnet, so scena finn dei att.
      const idar = [...new Set([String(p.kjelde), ...lesScene(scenaAv(p)).map((b) => b.id)])]
      /**
       * KVA SOM MÅTTE BERAST, OG KVA SOM VART BORE.
       *
       * Eit primitiv er laga i koden og ei innebygd form ligg på tenaren:
       * ei prosjektfil utan dei er komplett, av di scena hentar dei att på
       * namn. Det er berre dei INNDRAGNE filene som må liggje i arkivet.
       *
       * `put` slepp bytane når fila er over taket på 96 MB, og reiskapen
       * tek imot filer på 220. I bandet imellom lasta nettet, skar seg og
       * eksporterte — og prosjektfila var tom for det utan å seie det.
       * `sources.ts` skreiv alt ned at ho skulle seie frå; no gjer ho det.
       */
      const kravde = idar.filter((id) => !erPrimitiv(id) && !erFilform(id))
      const utan = kravde.filter((id) => !srcRaw(id)).map((id) => srcLabel(id))
      const filer = [{ name: "oppsett.json", text: oppsett(utan) }]
      for (const id of idar) {
        const bytes = srcRaw(id)
        if (bytes) filer.push({ name: `nett/${id}__${srcLabel(id)}`, data: bytes } as never)
      }
      // Bar ho ikkje eitt einaste nett ho skulle bore, er ho ikkje ei
      // prosjektfil. Då heiter ho det ho er, og namnet seier det før du
      // opnar henne.
      const tomt = kravde.length > 0 && utan.length === kravde.length
      return {
        name: `${name}-${tomt ? "oppsett" : "prosjekt"}.zip`,
        mime: "application/zip",
        data: zip(filer),
        ...(utan.length ? { merknad: `nettet er for stort til å leggjast ved: ${utan.join(", ")}` } : {}),
      }
    }
    if (what === "svg") return { name: `${name}-profilar.svg`, mime: "image/svg+xml", text: profileSvg(s, kerf) }
    if (what === "ark") {
      const n = ns.sheets.length
      if (n <= 1) return { name: `${name}-${plate}-ark.svg`, mime: "image/svg+xml", text: sheetSvg(ns, 0, kerf) }
      return { name: `${name}-${plate}-ark-${n}plater.zip`, mime: "application/zip", data: zip(arkFiler()) }
    }
    // `image/vnd.dxf` er den registrerte typen; `application/dxf` er han
    // ikkje, og naboane over — model/stl, model/gltf-binary, model/vnd.usdz+zip
    // — er alle registrerte.
    const dxf = dxfFiler()
    if (dxf.length <= 1) return { name: dxf[0]?.name ?? `${name}-${plate}.dxf`, mime: "image/vnd.dxf", text: dxf[0]?.text ?? sheetDxf(ns, 0, kerf) }
    return { name: `${name}-${plate}-dxf-${dxf.length}plater.zip`, mime: "application/zip", data: zip(dxf) }
  },

  liste(bag: ParamBag): Kutt[] {
    const p = asP(bag)
    const { dl, ns } = makeBygg(p, DETAIL.mid)
    const ark = new Map<object, number>()
    ns.sheets.forEach((sh, i) => {
      for (const q of sh.placed) ark.set(q.part, i + 1)
    })
    return dl.delar.map((q) => {
      const b = bbox(q.outline)
      return { adr: q.adr, id: q.id, w: b.x1 - b.x0, h: b.y1 - b.y0, area: q.area, cutLen: q.cutLen, joints: q.joints, ark: ark.get(q) ?? 0, plan: q.plan }
    })
  },

  arkSyn(bag: ParamBag, i: number): ArkSyn {
    /** eit punkt på sporlina, som avstand langs `d` frå `p` */
    const langs = (v: { p: Pt; d: Pt }, t: number): Pt => [v.p[0] + v.d[0] * t, v.p[1] + v.d[1] * t]
    const p = asP(bag)
    const { ns } = makeBygg(p, DETAIL.mid)
    const tal = ns.sheets.length
    if (i < 0 || i >= tal) return { i, tal, svg: "", delar: 0, util: 0, plasser: [], arkB: ns.sheetW, arkH: ns.sheetH }
    const sheet = ns.sheets[i]
    const flate = sheet.placed.reduce((a, q) => a + q.part.area, 0)
    // SAME REKNESTYKKET SOM I TAVLA: utnytting av det du faktisk SKAR I.
    const skore = sheet.used * ns.sheetW
    const kerf = kerfOf(p)
    return {
      i,
      tal,
      svg: sheetSvg(ns, i, kerf),
      // dei same delane ein gong til, kvar for seg, so skjermen kan peike på dei
      plasser: sheet.placed.map((q) => {
        const r = placedRings(q)
        const utr = offsetPoly(r.outline, kerf / 2)
        const bb = bbox(utr)
        return {
          adr: q.part.adr,
          id: q.part.id,
          ut: ring(utr),
          inn: r.holes.map((h) => ring(offsetPoly(h, -kerf / 2))),
          boks: { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0, h: bb.y1 - bb.y0 },
          plass: { sheet: q.slot.sheet, rot: q.slot.rot, x: q.slot.sx, y: q.slot.sy },
          merke: merket(q.part.adr, q.label),
          // spora gjennom den same plasseringa som omrisset: handtaka står
          // på den geometrien fila vert skoren av, ikkje ved sida av henne
          spor: q.part.spor.map((v) => ({
            nokkel: v.nokkel,
            munn: apply(q.slot.m, langs(v, v.munn)),
            botn: apply(q.slot.m, langs(v, v.botn)),
            lo: apply(q.slot.m, langs(v, v.lo)),
            hi: apply(q.slot.m, langs(v, v.hi)),
          })),
          ...(q.slot.kross ? { kross: true } : {}),
          ...(q.part.farge ? { farge: q.part.farge } : {}),
        }
      }),
      arkB: ns.sheetW,
      arkH: ns.sheetH,
      delar: sheet.placed.length,
      util: skore > 0 ? flate / skore : 0,
    }
  },

  /** montasjen: kvar kvar del ligg, kvar han skal, og kva runde han kjem i */
  montasje(bag: ParamBag): Montasje {
    const p = asP(bag)
    const b = makeBygg(p, DETAIL.mid)
    return montasjen(b.s, b.dl.delar, b.ns, p.tjukn, b.k.solid.min, b.k.solid.max)
  },

  skisse(bag: ParamBag, plan: Plan): SkisseSyn {
    // det låge nivået: skissa er ein straum av punkt, og kvart av dei skal
    // svare før neste kjem
    const p = asP(bag)
    return skisseSyn(makeKropp(p), p, plan, DETAIL.lav)
  },
}

/** Adressa som bane, slik ho vert gravert: same rekning som uttaket. */
function merket(adr: string, label: { p: readonly [number, number] | Pt; room: number; wide: number }): string {
  const size = fitSize(adr, label.room, label.wide)
  if (!size) return ""
  return strokesAt(adr, label.p[0], label.p[1], size)
    .map((line) => line.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(3)},${q[1].toFixed(3)}`).join(" "))
    .join(" ")
}
