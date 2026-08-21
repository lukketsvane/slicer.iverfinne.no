/// <reference lib="webworker" />
/**
 * SLICERMAN — motoren i eigen tråd.
 *
 * Hovudtråden teiknar, og gjer ikkje anna. Alt som rører geometri ligg her:
 * fila som vert lesen, nettet som vert forenkla og glatta, strålane som
 * finn innsida, ribbene, ledda, kuttfilene. Grunnen er ikkje elegansen —
 * det er at eit skann på to millionar trekantar tek fleire sekund å sveise,
 * og eit grensesnitt som frys i fleire sekund er eit grensesnitt folk trur
 * har krasja.
 */
import { VAFFEL } from "./vaffel/engine"
import { parseMesh } from "./io"
import { forget, put, type SourceInfo } from "./sources"
import type {
  DetailKey,
  ExportKind,
  Metrics,
  ParamBag,
  Rule,
  Vec3,
  View,
} from "./core"

export type BuildReq = {
  kind: "build"
  id: number
  params: ParamBag
  detail: DetailKey
  view: View
}
export type ExportReq = { kind: "export"; id: number; params: ParamBag; what: ExportKind }
export type ImportReq = { kind: "import"; id: number; name: string; buf: ArrayBuffer }
export type Req = BuildReq | ExportReq | ImportReq

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
  lines: Float32Array<ArrayBufferLike>
  heavy: Float32Array<ArrayBufferLike>
}
/** Måltala kjem i eiga melding, ETTER nettet — sjå kommentaren nedanfor. */
export type MaalRes = { kind: "maal"; id: number; metrics: Metrics; rules: Rule[] }
export type ExportRes = {
  kind: "export"
  id: number
  name: string
  mime: string
  text?: string
  data?: ArrayBuffer
}
/** Profilteikninga som bilete, generert automatisk etter kvar måling:
 *  alle delane, rett i menyen — ingen skal måtte laste ned ein SVG for å
 *  sjå kva det er dei har snitta. */
export type SynRes = { kind: "syn"; id: number; svg: string }
export type KjeldeRes = { kind: "kjelde"; id: number; src: SourceInfo }
/** Eit bygg som kasta. Svaret finst av éin grunn: porten i studioet slepp
 *  ikkje neste førespurnad før han har fått svar på den førre, og eit
 *  unntak utan svar ville låse heile appen for alltid. */
export type FeilRes = { kind: "feil"; id: number; kva: string; kvifor?: string }
export type Res = BuildRes | MaalRes | ExportRes | SynRes | KjeldeRes | FeilRes

const post = (r: Res, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(r, transfer)

function build(req: BuildReq) {
  const out = VAFFEL.build(req.params, req.detail, req.view)
  const res: BuildRes = { kind: "build", id: req.id, view: req.view, ...out }
  // Berre bufferar med innhald vert overførte, og kvar buffer berre éin
  // gong: same buffer to gonger i lista er ein DataCloneError, og han tek
  // heile meldinga med seg.
  const transfer: Transferable[] = []
  for (const a of [out.positions, out.normals, out.kant, out.lines, out.heavy]) {
    if (a.byteLength && !transfer.includes(a.buffer)) transfer.push(a.buffer)
  }
  return { res, transfer }
}

/**
 * Nettet fyrst, måltala etterpå — og måltala berre for det SISTE punktet.
 *
 * Ein skyvar som vert dregen sender ein straum av punkt, og å måle kvart av
 * dei er å måle objekt ingen kjem til å sjå. Difor vert målinga utsett med
 * setTimeout: arbeidaren er éin tråd, so meldingar som alt står i kø får
 * køyre fyrst, og når målinga endeleg slepp til, veit ho om eit nyare punkt
 * har teke over. Har det det, teier ho. Fristen er ikkje null: klienten
 * sender neste punkt fyrst når svaret på det førre er framme, so neste
 * melding er undervegs over ein rundtur når denne handteraren sluttar — ei
 * måling som fyrer med det same ville alltid vinne det kappløpet og målt
 * kvart einaste mellombilete.
 */
let newest = 0

self.onmessage = (e: MessageEvent<Req>) => {
  const req = e.data
  try {
    if (req.kind === "import") {
      const soup = parseMesh(req.name, req.buf)
      if (soup.tris < 1) {
        post({
          kind: "feil",
          id: req.id,
          kva: "import",
          kvifor: "fann ingen trekantar i fila",
        })
        return
      }
      // Eit ID som ikkje kan kome frå ein URL: kjelda står i lenkja, og ei
      // lenkje som peikar på ei fil ingen andre har er verdilaus uansett —
      // men ho skal ikkje kunne peike på noko anna heller.
      const id = "f" + req.id.toString(36) + Math.floor(soup.tris).toString(36)
      const src = put(id, req.name, soup)
      // Eit skann er lett hundre megabyte. Den som har prøvd seks filer
      // treng ikkje dei fem fyrste.
      forget(id)
      post({ kind: "kjelde", id: req.id, src })
      return
    }

    if (req.kind === "export") {
      const out = VAFFEL.exportFile(req.params, req.what)
      post({ kind: "export", id: req.id, ...out }, out.data ? [out.data] : [])
      return
    }

    newest = req.id
    const out = build(req)
    post(out.res, out.transfer)
    setTimeout(() => {
      if (newest !== req.id) return
      try {
        // Målinga går uansett kva lesemåte som står på: eit tal som berre
        // finst i «lag» ville forsvinne når ein byter til «flate».
        const metrics = VAFFEL.measure(req.params)
        if (newest !== req.id) return
        const rules = VAFFEL.rules(req.params, metrics)
        post({ kind: "maal", id: req.id, metrics, rules })
        // Profilane som bilete, i same utsette steget: mellombygga er alt
        // hugsa frå målinga, so teikninga kostar berre sjølve SVG-en.
        if (newest !== req.id) return
        const svg = VAFFEL.exportFile(req.params, "svg")
        if (newest !== req.id || !svg.text) return
        post({ kind: "syn", id: req.id, svg: svg.text })
      } catch (err) {
        console.error("slicerman: målinga slo feil", err)
      }
    }, 100)
  } catch (err) {
    // Ein parameterkombinasjon som får motoren til å gje opp er ein feil i
    // motoren, ikkje i brukaren. Meld frå i konsollen, lat det førre bygget
    // bli ståande — og SVAR, alltid: porten på hovudtråden ventar på dette
    // svaret, og utan det står appen fastlåst til sida vert lasta på nytt.
    console.error("slicerman: bygget slo feil", err)
    post({
      kind: "feil",
      id: req.id,
      kva: req.kind,
      kvifor: err instanceof Error ? err.message : undefined,
    })
  }
}
