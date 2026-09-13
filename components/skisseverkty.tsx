"use client"

import { useEffect, useState, type ReactNode } from "react"
import { PLAN_TAK, nyId, skrivPlan } from "@/lib/plan"
import { SKISSEFORMER, gjentaProfil, skisseprofil, type Gjentaking, type Skisseform } from "@/lib/skisseverkty"
import type { ArketProps } from "./arket"
import { CHIP, chipStyle, num } from "./deler"

/** Berre utkast til ei handling. Angre tek heile rekkja i eitt steg. */
export function useSkisseverkty(p: ArketProps): { skisse: ReactNode[]; gjenta: ReactNode[] } {
  const [akse, setAkse] = useState<0 | 1 | 2>(0)
  const [slag, setSlag] = useState<Gjentaking>("rett")
  const [tal, setTal] = useState(12)
  const [avstand, setAvstand] = useState(10)
  const [vinkel, setVinkel] = useState(30)
  const [feil, setFeil] = useState("")
  const [nyGruppe, setNyGruppe] = useState<number | null>(null)
  const rom = p.view === "flate" || p.view === "lag"
  const vald = p.plan.find(q => q.id === p.vald)
  useEffect(() => {
    if (nyGruppe !== null && p.plan.some(q => q.gruppe === nyGruppe)) {
      p.onVelGruppe(nyGruppe)
      setNyGruppe(null)
    }
  }, [nyGruppe, p.plan, p.onVelGruppe])
  const legg = (form: Skisseform) => {
    if (p.plan.length >= PLAN_TAK) return
    const id = nyId(p.plan)
    p.onChange({ ...p.params, plan: skrivPlan([...p.plan, skisseprofil(form, id, akse)]) })
    p.onVald(id)
    setFeil("")
  }
  const gjenta = () => {
    if (!p.boks || p.vald === null) return
    const svar = gjentaProfil(p.plan, p.vald, tal, avstand, vinkel, slag, p.boks.min, p.boks.max)
    if ("feil" in svar) return setFeil(svar.feil)
    p.onChange({ ...p.params, plan: skrivPlan(svar.plan) })
    setNyGruppe(svar.gruppe)
    setFeil("")
  }
  const felt = (ord: string, verdi: number, set: (v: number) => void, min: number, max: number, steg: number, eining = "") =>
    <label className="skisse-tal"><span className="dim">{ord}</span><input aria-label={ord} type="number" inputMode={steg < 1 ? "decimal" : "numeric"} min={min} max={max} step={steg} value={Number.isFinite(verdi) ? verdi : ""} onFocus={e => e.target.select()} onChange={e => { set(e.target.valueAsNumber); setFeil("") }} /><span className="dim">{eining}</span></label>
  const skisse: ReactNode[] = [
    <div key="akse" className="telefon-preset">{(["x", "y", "z"] as const).map((ord, i) => <button key={ord} type="button" className={CHIP} style={chipStyle(akse === i)} aria-label={`profil langs ${ord}`} aria-pressed={akse === i} onClick={() => setAkse(i as 0 | 1 | 2)}>{ord}</button>)}<button type="button" className={CHIP} style={chipStyle(false)} disabled={!rom} onClick={() => { p.onTeikn(); p.onSteg("line") }}>teikn</button></div>,
    ...[0, 3].map(frå => <div key={frå} className="telefon-uttak">{SKISSEFORMER.slice(frå, frå + 3).map(form => <button key={form} type="button" className={CHIP} style={chipStyle(false)} aria-label={`legg til ${form}`} disabled={!rom || p.busy || p.plan.length >= PLAN_TAK} onClick={() => legg(form)}>{form}</button>)}</div>),
  ]
  const kanGjenta = !!vald && !!p.boks && rom && !p.busy && Number.isInteger(tal) && tal >= 2 && p.plan.length + tal - 1 <= PLAN_TAK && avstand > 0 && Number.isFinite(vinkel) && Math.abs(vinkel) <= 180 && (slag !== "vridd" || (!!vald.omriss && !vald.bog))
  const kvifor = !rom ? "vel flate eller lag" : !vald ? "vel ein profil i modellen eller planlista" : slag === "vridd" && (!vald.omriss || vald.bog) ? "vriding treng eit flatt omriss" : p.plan.length + tal - 1 > PLAN_TAK ? `taket er ${PLAN_TAK} plan` : ""
  const rekkje: ReactNode[] = [
    <div key="slag" className="telefon-preset">{(["rett", "vifte", "vridd"] as const).map(ord => <button key={ord} type="button" className={CHIP} style={chipStyle(slag === ord)} aria-pressed={slag === ord} onClick={() => { setSlag(ord); setFeil("") }}>{ord}</button>)}</div>,
    <div key="mål" className="skisse-mål">{felt("ribber", tal, setTal, 2, PLAN_TAK, 1)}{felt("avstand", avstand, setAvstand, .1, num(p.params, "storleik", 150), .1, "mm")}</div>,
    <div key="lag" className="skisse-mål">{slag !== "rett" ? felt("vinkel", vinkel, setVinkel, -180, 180, 1, "°") : <span className="dim">{vald ? `frå plan ${vald.id}` : "ingen profil vald"}</span>}<button type="button" className={CHIP} style={chipStyle(false)} disabled={!kanGjenta} onClick={gjenta}>lag rekkje</button></div>,
  ]
  if (feil || kvifor) rekkje.push(<p key="feil" className="telefon-rad dim" role="status">{feil || kvifor}</p>)
  return { skisse, gjenta: rekkje }
}
