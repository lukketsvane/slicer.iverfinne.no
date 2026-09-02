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
import { forget, KUBE, label, put, source, type SourceInfo } from "./sources"
import { makeSoup } from "./soup"
import { unzip } from "./zip"
import type { Kandidat, Oppgave } from "./vaffel/tune"
import type {
  DetailKey,
  ExportKind,
  ArkSyn,
  Kutt,
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
/** «finn gode innstillingar»: snittar eit titals punkt og rangerer dei.
 *  `djup` er det lange trykket — heile ribbetavla rekna gjennom på ei
 *  måling av kroppen, og berre dei beste av dei snitta. */
export type TuneReq = { kind: "tune"; id: number; params: ParamBag; djup?: boolean }
/** «stogg søket, og gjev meg det beste du har funne» */
export type AvbrytReq = { kind: "avbryt"; id: number }
/** «syn meg plate nummer i» — teikninga kjem attende, ikkje ei fil */
export type ArkReq = { kind: "ark"; id: number; params: ParamBag; sheet: number }
/** «her er ein hjelpar»: den eine enden av ein kanal til ein arbeidar til,
 *  som snittar for djupsøket. Sjå «FLEIRE SOM SNITTAR». */
export type HjelparReq = { kind: "hjelpar"; id: number; port: MessagePort }
/** «du er ein hjelpar»: den andre enden av same kanalen */
export type HjelpReq = { kind: "hjelp"; id: number; port: MessagePort }
export type Req =
  | BuildReq
  | ExportReq
  | ImportReq
  | TuneReq
  | AvbrytReq
  | ArkReq
  | HjelparReq
  | HjelpReq

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
}
/** Måltala kjem i eiga melding, ETTER nettet — sjå kommentaren nedanfor.
 *  Kuttlista fylgjer med: ho vert lesen rett ut av den planen målinga alt
 *  har rekna, so ho kostar eit oppslag og ikkje ei snitting. */
export type MaalRes = {
  kind: "maal"
  id: number
  metrics: Metrics
  rules: Rule[]
  liste: Kutt[]
}
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
/** Ei prosjektfil som er opna: nettet OG innstillingane som låg med det. */
export type ProsjektRes = {
  kind: "prosjekt"
  id: number
  src: SourceInfo | null
  params: ParamBag
}
export type ArkRes = { kind: "ark"; id: number } & ArkSyn
export type TuneRes = { kind: "tune"; id: number; alle: Kandidat[] }
/**
 * Kor langt søket er kome.
 *
 * Han kjem MEDAN arbeidaren reknar, og det er heile poenget: hovudtråden
 * står tom og tek imot, so knappen kan syne ein ring som fyllest i staden
 * for tre sekund der ingenting rører seg. Ein reiskap som ser hengt fast
 * vert lasta på nytt, og då er dei tre sekunda tapte for alltid.
 */
export type TuneProgRes = { kind: "tunep"; id: number; gjort: number; av: number }
/** Eit bygg som kasta. Svaret finst av éin grunn: porten i studioet slepp
 *  ikkje neste førespurnad før han har fått svar på den førre, og eit
 *  unntak utan svar ville låse heile appen for alltid. */
export type FeilRes = { kind: "feil"; id: number; kva: string; kvifor?: string }
export type Res =
  | BuildRes
  | MaalRes
  | ExportRes
  | SynRes
  | ArkRes
  | ProsjektRes
  | KjeldeRes
  | TuneRes
  | TuneProgRes
  | FeilRes

const post = (r: Res, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(r, transfer)

function build(req: BuildReq) {
  const out = VAFFEL.build(req.params, req.detail, req.view)
  const res: BuildRes = { kind: "build", id: req.id, view: req.view, ...out }
  // Berre bufferar med innhald vert overførte, og kvar buffer berre éin
  // gong: same buffer to gonger i lista er ein DataCloneError, og han tek
  // heile meldinga med seg.
  const transfer: Transferable[] = []
  for (const a of [out.positions, out.normals, out.kant, out.del, out.lines, out.heavy]) {
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
/** kva søk som gjeld. Sjå «eit steg om gongen» nedanfor. */
let tuneKøyr = 0
/** det søket som går: kva melding han svarar på, og det beste so langt */
let tuneGaar: { id: number; alle: Kandidat[] } | null = null

/**
 * FLEIRE SOM SNITTAR.
 *
 * Djupsøket er hundre snittingar som ikkje treng vita om kvarandre, og
 * ein telefon har fleire kjernar enn den eine denne tråden står på.
 * Hovudtråden lagar difor eit par arbeidarar til av same skriptet og
 * knyter kvar av dei til denne med ein kanal: han sjølv teiknar berre,
 * og skal ikkje vita kva som går i kanalen. Denne arbeidaren eig
 * oppgåvene og deler dei ut — to om gongen til kvar hjelpar, so ingen
 * står og ventar medan denne er midt i si eiga snitting — og snittar
 * sjølv imellom.
 *
 * Hjelparane har ikkje nettet. Kjelda vert send éin gong per hjelpar,
 * som ein kopi; kuben lagar dei sjølve. Eit skann på ein million
 * trekantar vert ikkje kopiert tre gonger inn i minnet på ein telefon —
 * over tre hundre tusen snittar denne tråden åleine.
 */
type Ærend =
  | { kind: "kjelde"; id: string; label: string; pos: Float32Array }
  | { kind: "prov"; id: number; n: number; params: ParamBag; o: Oppgave }
type Svar = { kind: "prov"; id: number; n: number; k: Kandidat | null }
type Hjelpar = {
  port: MessagePort
  /** kjelda han held — éi om gongen, den siste han fekk */
  kjelde: string | null
  /** oppgåvene han har fått og ikkje svart på, i den rekkjefylgja han tek dei */
  ute: number[]
}
const hjelparar: Hjelpar[] = []
/** den som tek imot svara for det søket som går */
let svarPaa: ((h: Hjelpar, s: Svar) => void) | null = null
const MED_HJELP_TIL = 300000

function djupSaman(req: TuneReq, mitt: number) {
  const bag = req.params
  const oppgaver = VAFFEL.djupOppgaver(bag)
  if (!oppgaver.length) {
    tuneGaar = null
    post({ kind: "tune", id: req.id, alle: [] })
    return
  }
  const ut: Kandidat[] = []
  let neste = 0
  /** kva oppgåver som er talde — ei oppgåve kan verte snitta to gonger, sjå `steg` */
  const talt = new Uint8Array(oppgaver.length)
  let gjort = 0
  post({ kind: "tunep", id: req.id, gjort: 0, av: oppgaver.length })

  const kjelde = typeof bag.kjelde === "string" ? bag.kjelde : KUBE
  const soup = source(kjelde)
  const med = soup.tris <= MED_HJELP_TIL ? hjelparar : []
  for (const h of med) {
    if (kjelde === KUBE || h.kjelde === kjelde) continue
    const æ: Ærend = { kind: "kjelde", id: kjelde, label: label(kjelde), pos: soup.pos }
    h.port.postMessage(æ)
    h.kjelde = kjelde
  }

  const ferdig = (n: number, k: Kandidat | null) => {
    if (talt[n]) return
    talt[n] = 1
    if (k) ut.push(k)
    gjort++
    const alle = VAFFEL.rangert(ut, true)
    if (tuneGaar) tuneGaar.alle = alle
    if (gjort === oppgaver.length) {
      tuneGaar = null
      post({ kind: "tune", id: req.id, alle })
      return
    }
    post({ kind: "tunep", id: req.id, gjort, av: oppgaver.length })
  }
  const gjev = (h: Hjelpar) => {
    if (neste >= oppgaver.length) return
    const n = neste++
    h.ute.push(n)
    const æ: Ærend = { kind: "prov", id: req.id, n, params: bag, o: oppgaver[n] }
    h.port.postMessage(æ)
  }
  svarPaa = (h, s) => {
    // eit svar på eit søk som er stogga eller bytt ut er ikkje eit svar
    if (s.id !== req.id || mitt !== tuneKøyr) return
    h.ute = h.ute.filter((n) => n !== s.n)
    ferdig(s.n, s.k)
    gjev(h)
  }
  for (const h of med) {
    h.ute = []
    gjev(h)
    gjev(h)
  }
  const steg = () => {
    if (mitt !== tuneKøyr) return
    let n = -1
    if (neste < oppgaver.length) {
      n = neste++
    } else {
      // Tomt for nye: ta den siste ein hjelpar sit med. Den som svarar
      // fyrst tel, og den andre vert ikkje talt to gonger. So står ingen
      // og ventar på den siste snittinga i ein annan tråd — og ein
      // hjelpar som døydde undervegs stoggar ikkje søket.
      let flest: Hjelpar | null = null
      for (const h of med) if (h.ute.length && (!flest || h.ute.length > flest.ute.length)) flest = h
      if (flest) n = flest.ute.pop()!
    }
    if (n < 0) return
    ferdig(n, VAFFEL.prov(bag, oppgaver[n], true))
    setTimeout(steg, 0)
  }
  steg()
}

self.onmessage = (e: MessageEvent<Req>) => {
  const req = e.data
  try {
    if (req.kind === "import") {
      /**
       * EI PROSJEKTFIL ER EI FIL SOM BER TO TING.
       *
       * Ein ZIP inn er ikkje eit nett — det er eit oppsett og eit nett i
       * lag. Nettet vert lese som vanleg; oppsettet fylgjer med i svaret,
       * so hovudtråden kan setje det saman med kjelda i eitt steg. Er det
       * berre eit oppsett i arkivet, kjem innstillingane åleine, og kuben
       * står — som ei lenkje.
       */
      const erZip =
        req.buf.byteLength > 4 && new DataView(req.buf).getUint32(0, true) === 0x04034b50
      if (erZip) {
        const filer = unzip(req.buf)
        const opp = filer.find((f) => f.name === "oppsett.json" || f.name.endsWith("/oppsett.json"))
        const nett = filer.find((f) => f.name.startsWith("nett/") && f.data.byteLength > 0)
        if (!opp && !nett) throw new Error("arkivet er korkje eit oppsett eller eit nett")
        let params: ParamBag = {}
        if (opp) {
          const lese = JSON.parse(new TextDecoder().decode(opp.data)) as { p?: ParamBag }
          params = lese.p ?? {}
        }
        let src: SourceInfo | null = null
        if (nett) {
          const kort = nett.name.slice(5)
          // ein eigen kopi: `subarray` peikar inn i arkivet, og arkivet
          // skal kunne sleppast
          const bytes = new Uint8Array(nett.data)
          const soup = parseMesh(kort, bytes.buffer.slice(0) as ArrayBuffer)
          if (soup.tris > 0) {
            const id = "f" + req.id.toString(36) + Math.floor(soup.tris).toString(36)
            src = put(id, kort, soup, bytes)
            forget(id)
          }
        }
        post({ kind: "prosjekt", id: req.id, src, params })
        return
      }
      const bytes = new Uint8Array(req.buf.slice(0))
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
      const src = put(id, req.name, soup, bytes)
      // Eit skann er lett hundre megabyte. Den som har prøvd seks filer
      // treng ikkje dei fem fyrste.
      forget(id)
      post({ kind: "kjelde", id: req.id, src })
      return
    }

    if (req.kind === "hjelpar") {
      const h: Hjelpar = { port: req.port, kjelde: null, ute: [] }
      req.port.onmessage = (e: MessageEvent<Svar>) => svarPaa?.(h, e.data)
      hjelparar.push(h)
      return
    }

    if (req.kind === "hjelp") {
      // Denne arbeidaren er ein hjelpar: han får kjelda og oppgåver over
      // kanalen, og svarar same veg. Hovudtråden høyrer aldri frå han.
      const port = req.port
      port.onmessage = (e: MessageEvent<Ærend>) => {
        const æ = e.data
        if (æ.kind === "kjelde") {
          // Eitt nett om gongen: den som har prøvd seks filer treng ikkje
          // dei fem fyrste i tre hjelparar òg.
          put(æ.id, æ.label, makeSoup(æ.pos))
          forget(æ.id)
          return
        }
        let k: Kandidat | null = null
        try {
          k = VAFFEL.prov(æ.params, æ.o, true)
        } catch (err) {
          console.error("slicerman: hjelparen slo feil", err)
        }
        const svar: Svar = { kind: "prov", id: æ.id, n: æ.n, k }
        port.postMessage(svar)
      }
      return
    }

    if (req.kind === "avbryt") {
      // EIT SØK SOM VERT STOGGA HAR SVART.
      //
      // Hundre ekte snittingar er eit svar, om to hundre var planen. Det
      // beste so langt går attende som om søket var ferdig, med same
      // melding og same id, so hovudtråden ikkje treng vita at det vart
      // kappa.
      const g = tuneGaar
      tuneGaar = null
      tuneKøyr++
      if (g) post({ kind: "tune", id: g.id, alle: g.alle })
      return
    }

    if (req.kind === "tune") {
      // EIT STEG OM GONGEN, med ein tur innom køen imellom.
      //
      // Framdrift som vert send inni ei lang rekning kjem ikkje fram:
      // meldingsrøyret vert tømt fyrst når arbeidaren slepper tråden, so
      // tolv meldingar sende inni lykkja landa alle tolv i det svaret kom.
      // Ein ring som hoppar frå null til ferdig er ikkje framdrift.
      //
      // Turen innom køen kostar eit par millisekund per kandidat, og han
      // gjev meir enn framdrifta attende: eit bygg som kjem medan søket
      // går, slepp til imellom i staden for å stå og vente på heile.
      const mitt = ++tuneKøyr
      tuneGaar = { id: req.id, alle: [] }
      if (req.djup && hjelparar.length) {
        djupSaman(req, mitt)
        return
      }
      const it = VAFFEL.tuneSteg(req.params, req.djup)
      const steg = () => {
        // Eit nytt søk gjer det gamle uinteressant. Utan denne ville to
        // søk rekna om kvarandre og sendt kvar sine svar.
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
          // Ei tom liste tyder «ingen av dei held», og det er eit svar.
          // Eit søk som kasta er noko anna, og skal ikkje seiast som om
          // det var eit svar.
          console.error("slicerman: søket slo feil", err)
          tuneGaar = null
          post({
            kind: "feil",
            id: req.id,
            kva: "tune",
            kvifor: err instanceof Error ? err.message : undefined,
          })
        }
      }
      steg()
      return
    }

    if (req.kind === "ark") {
      // Utanom porten som uttaka: eit klikk på ei plate er eit klikk, og
      // planen er alt rekna, so dette er ei teikning og ikkje ei snitting.
      post({ kind: "ark", id: req.id, ...VAFFEL.arkSyn(req.params, req.sheet) })
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
        post({ kind: "maal", id: req.id, metrics, rules, liste: VAFFEL.liste(req.params) })
        // Profilane som bilete, i same utsette steget: mellombygga er alt
        // hugsa frå målinga, so teikninga kostar berre sjølve SVG-en.
        if (newest !== req.id) return
        const svg = VAFFEL.preview(req.params)
        if (newest !== req.id || !svg) return
        post({ kind: "syn", id: req.id, svg })
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
