/// <reference lib="webworker" />
/**
 * SLICERMAN — motoren i eigen tråd.
 *
 * Hovudtråden teiknar, og gjer ikkje anna. Alt som rører geometri ligg her:
 * fila som vert lesen, nettet som vert sveist og forenkla, plana som vert
 * snitta, ledda, kuttfilene. Eit skann på to millionar trekantar tek
 * sekund å sveise, og eit grensesnitt som frys i sekund les som krasj.
 */
import { MOTOR } from "./motor"
import { parseMesh } from "./io"
import { forget, put, type SourceInfo } from "./sources"
import { unzip } from "./zip"
import type { Kandidat } from "./forslag"
import type { Plan } from "./plan"
import { lesScene } from "./scene"
import type { SkisseSyn } from "./snitt"
import type { ArkSyn, DetailKey, ExportKind, Kutt, Metrics, ParamBag, Rule, Vec3, View } from "./core"

export type BuildReq = { kind: "build"; id: number; params: ParamBag; detail: DetailKey; view: View }
export type ExportReq = { kind: "export"; id: number; params: ParamBag; what: ExportKind }
export type ImportReq = { kind: "import"; id: number; name: string; buf: ArrayBuffer }
/** «finn gode plan»: snittar eit titals sett og rangerer dei. `djup` er det
 *  lange trykket — kroppen målt, og dei beste snitta for alvor. */
export type TuneReq = { kind: "tune"; id: number; params: ParamBag; djup?: boolean }
/** «stogg søket, og gjev meg det beste du har funne» */
export type AvbrytReq = { kind: "avbryt"; id: number }
/** «syn meg plate nummer i» — teikninga kjem attende, ikkje ei fil */
export type ArkReq = { kind: "ark"; id: number; params: ParamBag; sheet: number }
/** «snitt skissa for meg»: profilen gjennom kroppen og kryssa mot dei låste
 *  plana, medan du siktar. Ein straum av punkt; berre det siste tel. */
export type SkisseReq = { kind: "skisse"; id: number; params: ParamBag; plan: Plan }
export type Req = BuildReq | ExportReq | ImportReq | TuneReq | AvbrytReq | ArkReq | SkisseReq

export type BuildRes = {
  kind: "build"
  id: number
  view: View
  positions: Float32Array<ArrayBufferLike>
  normals: Float32Array<ArrayBufferLike>
  tris: number
  min: Vec3
  max: Vec3
  kant: Float32Array<ArrayBufferLike>
  del: Float32Array<ArrayBufferLike>
  lines: Float32Array<ArrayBufferLike>
  heavy: Float32Array<ArrayBufferLike>
  /** bitane kroppen er sett saman av — berre «flate» — og skalaen mellom dei to romma */
  bitar: { id: string; min: Vec3; max: Vec3 }[]
  skala: number
}
/** Måltala kjem i eiga melding, ETTER nettet. Kuttlista fylgjer med: ho er
 *  lesen rett ut av bygget målinga alt har rekna. */
export type MaalRes = { kind: "maal"; id: number; metrics: Metrics; rules: Rule[]; liste: Kutt[] }
export type ExportRes = { kind: "export"; id: number; name: string; mime: string; text?: string; data?: ArrayBuffer }
/** profilane som bilete, etter kvar måling */
export type SynRes = { kind: "syn"; id: number; svg: string }
export type KjeldeRes = { kind: "kjelde"; id: number; src: SourceInfo }
/** ei prosjektfil som er opna: nettet OG innstillingane som låg med det */
export type ProsjektRes = { kind: "prosjekt"; id: number; src: SourceInfo | null; params: ParamBag }
export type ArkRes = { kind: "ark"; id: number } & ArkSyn
export type SkisseRes = { kind: "skisse"; id: number } & SkisseSyn
export type TuneRes = { kind: "tune"; id: number; alle: Kandidat[] }
/** kor langt søket er kome — MEDAN arbeidaren reknar, so ringen kan fyllast */
export type TuneProgRes = { kind: "tunep"; id: number; gjort: number; av: number }
/** Noko som kasta. Svaret finst av éin grunn: porten på hovudtråden slepp
 *  ikkje neste førespurnad før den førre er svara, og eit unntak utan svar
 *  ville låse appen for alltid. */
export type FeilRes = { kind: "feil"; id: number; kva: string; view?: View; kvifor?: string }
export type Res =
  | BuildRes
  | MaalRes
  | ExportRes
  | SynRes
  | ArkRes
  | SkisseRes
  | ProsjektRes
  | KjeldeRes
  | TuneRes
  | TuneProgRes
  | FeilRes

const post = (r: Res, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(r, transfer)

function build(req: BuildReq) {
  const out = MOTOR.build(req.params, req.detail, req.view)
  const res: BuildRes = { kind: "build", id: req.id, view: req.view, ...out }
  // Berre bufferar med innhald, og kvar berre éin gong: same buffer to
  // gonger i lista er ein DataCloneError som tek heile meldinga.
  const transfer: Transferable[] = []
  for (const a of [out.positions, out.normals, out.kant, out.del, out.lines, out.heavy]) {
    if (a.byteLength && !transfer.includes(a.buffer)) transfer.push(a.buffer)
  }
  return { res, transfer }
}

/**
 * NAMNET PÅ EI KJELDE FYLGJER BYTANE, ikkje rekkjefylgja fila kom i.
 *
 * Scena peikar på kjeldene sine med namn. Var namnet ein teljar, fekk den
 * same fila eit nytt namn kvar gong ho kom inn — ei økt attende, ei
 * prosjektfil opna — og bitane i scena peika på noko som ikkje fanst
 * lenger. Med bytane som namn kjem ho attende som seg sjølv.
 *
 * Dei fyrste seksti og fire kilobytane og lengda, og ikkje heile fila:
 * eit skann er hundre megabyte, og to filer som er like i hovudet OG like
 * lange er den same fila i denne samanhengen. Namnet kan ikkje gjettast
 * frå ein URL — det er bytane, og dei ligg ikkje i lenkja.
 */
function kjeldeId(b: Uint8Array): string {
  let h = 0x811c9dc5
  const n = Math.min(b.length, 65536)
  for (let i = 0; i < n; i++) h = Math.imul(h ^ b[i], 0x01000193)
  return "f" + (h >>> 0).toString(36) + b.length.toString(36)
}

/**
 * Nettet fyrst, måltala etterpå — og berre for det SISTE punktet.
 *
 * Ein skyvar sender ein straum av punkt, og å måle kvart av dei er å måle
 * objekt ingen ser. Målinga vert utsett med setTimeout: meldingar som alt
 * står i kø får køyre fyrst, og når ho slepp til veit ho om eit nyare
 * punkt har teke over. Fristen er ikkje null: klienten sender neste punkt
 * fyrst når svaret på det førre er framme, so ei måling som fyrte med det
 * same ville alltid vinne det kappløpet.
 */
let newest = 0
let tuneKøyr = 0
let tuneGaar: { id: number; alle: Kandidat[] } | null = null

self.onmessage = (e: MessageEvent<Req>) => {
  const req = e.data
  try {
    if (req.kind === "import") {
      // EI PROSJEKTFIL BER TO TING: eit oppsett og eit nett i lag. Nettet
      // vert lese som vanleg; oppsettet fylgjer med i svaret, so
      // hovudtråden set dei saman i eitt steg.
      const erZip = req.buf.byteLength > 4 && new DataView(req.buf).getUint32(0, true) === 0x04034b50
      if (erZip) {
        const filer = unzip(req.buf)
        const opp = filer.find((f) => f.name === "oppsett.json" || f.name.endsWith("/oppsett.json"))
        // KVART nett i arkivet, ikkje berre det fyrste: ein kropp av fleire
        // bitar peikar på kvar si kjelde, og ei kjelde som ikkje kom med er
        // ein bit som fell attende på kuben utan å seie frå. Det fyrste er
        // kjelda; namnet ber id-en si, og etiketten står etter han.
        const nett = filer.filter((f) => f.name.startsWith("nett/") && f.data.byteLength > 0)
        if (!opp && !nett.length) throw new Error("arkivet er korkje eit oppsett eller eit nett")
        let params: ParamBag = {}
        if (opp) params = (JSON.parse(new TextDecoder().decode(opp.data)) as { p?: ParamBag }).p ?? {}
        let src: SourceInfo | null = null
        for (const f of nett) {
          const kort = f.name.slice(5).replace(/^[a-z0-9]+__/i, "")
          // eigen kopi: `subarray` peikar inn i arkivet, og arkivet skal sleppast
          const bytes = new Uint8Array(f.data)
          const soup = parseMesh(kort, bytes.buffer.slice(0) as ArrayBuffer)
          if (soup.tris < 1) continue
          const inn = put(kjeldeId(bytes), kort, soup, bytes)
          /* scena avgjer kva som skal hugsast — sjå bygg */
          if (!src) src = inn
        }
        post({ kind: "prosjekt", id: req.id, src, params })
        return
      }
      const bytes = new Uint8Array(req.buf.slice(0))
      const soup = parseMesh(req.name, req.buf)
      if (soup.tris < 1) {
        post({ kind: "feil", id: req.id, kva: "import", kvifor: "fann ingen trekantar i fila" })
        return
      }
      const src = put(kjeldeId(bytes), req.name, soup, bytes)
      /* scena avgjer kva som skal hugsast — sjå bygg */
      post({ kind: "kjelde", id: req.id, src })
      return
    }

    if (req.kind === "avbryt") {
      // Eit søk som vert stogga har svart: det beste so langt går attende
      // som om søket var ferdig, med same melding og same id.
      const g = tuneGaar
      tuneGaar = null
      tuneKøyr++
      if (g) post({ kind: "tune", id: g.id, alle: g.alle })
      return
    }

    if (req.kind === "tune") {
      // EIT STEG OM GONGEN, med ein tur innom køen imellom: framdrift som
      // vert send inni ei lang rekning kjem ikkje fram, og eit bygg som
      // kjem medan søket går slepp til imellom.
      const mitt = ++tuneKøyr
      tuneGaar = { id: req.id, alle: [] }
      const it = MOTOR.tuneSteg(req.params, req.djup)
      const steg = () => {
        if (mitt !== tuneKøyr) return
        try {
          const n = it.next()
          if (n.done) {
            tuneGaar = null
            post({ kind: "tune", id: req.id, alle: n.value })
            return
          }
          if (tuneGaar) tuneGaar.alle = n.value.alle
          post({ kind: "tunep", id: req.id, gjort: n.value.gjort, av: n.value.av })
          setTimeout(steg, 0)
        } catch (err) {
          // Ei tom liste er eit svar. Eit søk som kasta er noko anna.
          console.error("slicerman: søket slo feil", err)
          tuneGaar = null
          post({ kind: "feil", id: req.id, kva: "tune", kvifor: err instanceof Error ? err.message : undefined })
        }
      }
      steg()
      return
    }

    if (req.kind === "build") {
      // Importar hopar seg opp. Det scena ikkje bruker lenger, kan gå.
      forget([String(req.params.kjelde), ...lesScene(String(req.params.scene || "")).map((b) => b.id)])
    }

    if (req.kind === "skisse") {
      // Utanom porten, som plata: skissa skal svare medan bygget står i kø,
      // og ei skisse som er gått ut på dato svarar hovudtråden ikkje på.
      post({ kind: "skisse", id: req.id, ...MOTOR.skisse(req.params, req.plan) })
      return
    }

    if (req.kind === "ark") {
      post({ kind: "ark", id: req.id, ...MOTOR.arkSyn(req.params, req.sheet) })
      return
    }

    if (req.kind === "export") {
      const out = MOTOR.exportFile(req.params, req.what)
      post({ kind: "export", id: req.id, ...out }, out.data ? [out.data] : [])
      return
    }

    newest = req.id
    const out = build(req)
    post(out.res, out.transfer)
    setTimeout(() => {
      if (newest !== req.id) return
      try {
        const metrics = MOTOR.measure(req.params)
        if (newest !== req.id) return
        const rules = MOTOR.rules(req.params, metrics)
        post({ kind: "maal", id: req.id, metrics, rules, liste: MOTOR.liste(req.params) })
        if (newest !== req.id) return
        const svg = MOTOR.preview(req.params)
        if (newest !== req.id || !svg) return
        post({ kind: "syn", id: req.id, svg })
      } catch (err) {
        console.error("slicerman: målinga slo feil", err)
      }
    }, 100)
  } catch (err) {
    // Ein parameterkombinasjon som får motoren til å gje opp er ein feil i
    // motoren. Meld frå, lat det førre stå — og SVAR, alltid.
    console.error("slicerman: bygget slo feil", err)
    post({
      kind: "feil",
      id: req.id,
      kva: req.kind,
      view: req.kind === "build" ? req.view : undefined,
      kvifor: err instanceof Error ? err.message : undefined,
    })
  }
}
