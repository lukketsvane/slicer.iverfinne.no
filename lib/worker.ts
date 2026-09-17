import { MOTOR } from "./motor"
import { parseMesh } from "./io"
import { forget, put, type SourceInfo } from "./sources"
import { unzip } from "./zip"
import type { Plan } from "./plan"
import { lesScene } from "./scene"
import type { SkisseSyn } from "./snitt"
import type { Montasje } from "./montasje"
import type { ArkSyn, DetailKey, ExportKind, Kutt, Metrics, ParamBag, Rom, Rule, Vec3 } from "./core"

export type BuildReq = { kind: "build"; id: number; params: ParamBag; detail: DetailKey; view: Rom }
export type ExportReq = { kind: "export"; id: number; params: ParamBag; what: ExportKind }
export type ImportReq = { kind: "import"; id: number; name: string; buf: ArrayBuffer; som?: string; etikett?: string }
export type ArkReq = { kind: "ark"; id: number; params: ParamBag; sheet: number }
export type SkisseReq = { kind: "skisse"; id: number; params: ParamBag; plan: Plan }
export type MontReq = { kind: "montasje"; id: number; params: ParamBag }
export type FiksReq = { kind: "fiksalt"; id: number; params: ParamBag }
export type Req = BuildReq | ExportReq | ImportReq | ArkReq | SkisseReq | MontReq | FiksReq

export type BuildRes = {
  kind: "build"
  id: number
  view: Rom
  positions: Float32Array<ArrayBufferLike>
  normals: Float32Array<ArrayBufferLike>
  tris: number
  min: Vec3
  max: Vec3
  kant: Float32Array<ArrayBufferLike>
  del: Float32Array<ArrayBufferLike>
  bitar: { id: string; min: Vec3; max: Vec3 }[]
  skala: number
}
export type MaalRes = { kind: "maal"; id: number; metrics: Metrics; rules: Rule[]; liste: Kutt[] }
export type ExportRes = { kind: "export"; id: number; name: string; mime: string; text?: string; data?: ArrayBuffer; merknad?: string }
export type KjeldeRes = { kind: "kjelde"; id: number; src: SourceInfo }
export type ProsjektRes = { kind: "prosjekt"; id: number; src: SourceInfo | null; params: ParamBag }
export type ArkRes = { kind: "ark"; id: number } & ArkSyn
export type MontRes = { kind: "montasje"; id: number } & Montasje
export type FiksRes = { kind: "fiksalt"; id: number; params: ParamBag; fiksa: string[]; att: string[] }
export type SkisseRes = { kind: "skisse"; id: number } & SkisseSyn
export type FeilRes = { kind: "feil"; id: number; kva: string; view?: Rom; kvifor?: string }
export type Res =
  | BuildRes
  | FiksRes
  | MaalRes
  | ExportRes
  | ArkRes
  | MontRes
  | SkisseRes
  | ProsjektRes
  | KjeldeRes
  | FeilRes

const post = (r: Res, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(r, transfer)

function build(req: BuildReq) {
  const out = MOTOR.build(req.params, req.detail, req.view)
  const res: BuildRes = { kind: "build", id: req.id, view: req.view, ...out }
  const transfer: Transferable[] = []
  for (const a of [out.positions, out.normals, out.kant, out.del]) {
    if (a.byteLength && !transfer.includes(a.buffer)) transfer.push(a.buffer)
  }
  return { res, transfer }
}

function kjeldeId(b: Uint8Array): string {
  let h = 0x811c9dc5
  const n = Math.min(b.length, 65536)
  for (let i = 0; i < n; i++) h = Math.imul(h ^ b[i], 0x01000193)
  return "f" + (h >>> 0).toString(36) + b.length.toString(36)
}

let newest = 0

self.onmessage = (e: MessageEvent<Req>) => {
  const req = e.data
  try {
    if (req.kind === "import") {
      const erZip = req.buf.byteLength > 4 && new DataView(req.buf).getUint32(0, true) === 0x04034b50
      if (erZip) {
        const filer = unzip(req.buf)
        const opp = filer.find((f) => f.name === "oppsett.json" || f.name.endsWith("/oppsett.json"))
        const nett = filer.filter((f) => f.name.startsWith("nett/") && f.data.byteLength > 0)
        if (!opp && !nett.length) throw new Error("arkivet er korkje eit oppsett eller eit nett")
        let params: ParamBag = {}
        if (opp) params = (JSON.parse(new TextDecoder().decode(opp.data)) as { p?: ParamBag }).p ?? {}
        let src: SourceInfo | null = null
        for (const f of nett) {
          const kort = f.name.slice(5).replace(/^[a-z0-9]+__/i, "")
          const bytes = new Uint8Array(f.data)
          const soup = parseMesh(kort, bytes.buffer.slice(0) as ArrayBuffer)
          if (soup.tris < 1) continue
          const inn = put(kjeldeId(bytes), kort, soup, bytes)
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
      const src = put(req.som ?? kjeldeId(bytes), req.etikett ?? req.som ?? req.name, soup, bytes)
      post({ kind: "kjelde", id: req.id, src })
      return
    }

    if (req.kind === "build") {
      forget([String(req.params.kjelde), ...lesScene(String(req.params.scene || "")).map((b) => b.id)])
    }

    if (req.kind === "skisse") {
      post({ kind: "skisse", id: req.id, ...MOTOR.skisse(req.params, req.plan) })
      return
    }

    if (req.kind === "ark") {
      post({ kind: "ark", id: req.id, ...MOTOR.arkSyn(req.params, req.sheet) })
      return
    }

    if (req.kind === "fiksalt") {
      const ut = MOTOR.fiksAlt(req.params)
      post({ kind: "fiksalt", id: req.id, params: ut.p, fiksa: ut.fiksa, att: ut.att })
      return
    }

    if (req.kind === "montasje") {
      const m = MOTOR.montasje(req.params)
      const transfer: Transferable[] = []
      for (const d of m.delar) {
        for (const a of [d.positions, d.ferdig, d.flat, d.boygd]) {
          if (a?.byteLength && !transfer.includes(a.buffer)) transfer.push(a.buffer)
        }
      }
      post({ kind: "montasje", id: req.id, ...m }, transfer)
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
      } catch (err) {
        console.error("slicerman: målinga slo feil", err)
      }
    }, 100)
  } catch (err) {
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
