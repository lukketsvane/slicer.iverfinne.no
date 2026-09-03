import { MOTOR } from "../lib/motor"
import { DEFAULT_PARAMS } from "../lib/params"
import { rutenett, skrivPlan } from "../lib/plan"
import type { ParamBag } from "../lib/core"
import { eiKjelde } from "../lib/scene"

const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))
const ms = (f: () => unknown) => { const t = Date.now(); f(); return Date.now() - t }

function kjor(namn: string, over: Record<string, unknown>) {
  const p = { ...DEFAULT_PARAMS, ...over } as unknown as ParamBag
  const tM = ms(() => MOTOR.measure(p))
  const m = MOTOR.measure(p)
  const r = MOTOR.rules(p, m)
  const tLav = ms(() => MOTOR.build(p, "lav", "lag"))
  const tMid = ms(() => MOTOR.build(p, "mid", "lag"))
  const raude = r.filter((x) => x.hard && !x.ok).map((x) => `${x.label}=${x.value}${x.fiks ? ` [${x.fiks.ord}]` : ""}`)
  console.log(
    `${namn.padEnd(34)} delar=${String(m.parts).padStart(3)} ledd=${String(m.joints).padStart(3)} lause=${String(m.loose ?? "-").padStart(2)} ark=${String(m.sheets).padStart(3)} env=${m.envX.toFixed(0)}x${m.envY.toFixed(0)}x${m.envZ.toFixed(0)} | measure ${String(tM).padStart(5)}ms lav ${String(tLav).padStart(5)}ms mid ${String(tMid).padStart(5)}ms | HARDT: ${raude.length ? raude.join(" ; ") : "grønt"}`,
  )
}

kjor("kube 150 (kald opning) 0 plan", {})
kjor("kube 450, 6x6", { storleik: 450, plan: nett(6, 6) })
kjor("kube 450, 6x6, ark 600x500", { storleik: 450, plan: nett(6, 6), arkH: 500 })
kjor("kjegle 450, 6x6", { kjelde: "kjegle", scene: eiKjelde("kjegle"), storleik: 450, plan: nett(6, 6) })
kjor("kjegle 450, 5x5", { kjelde: "kjegle", scene: eiKjelde("kjegle"), storleik: 450, plan: nett(5, 5) })
kjor("sylinder 450, 6x6", { kjelde: "sylinder", scene: eiKjelde("sylinder"), storleik: 450, plan: nett(6, 6) })
kjor("kule 450, 6x6", { kjelde: "kule", scene: eiKjelde("kule"), storleik: 450, plan: nett(6, 6) })
kjor("kube 450, 12 plan (6x6) igjen", { storleik: 450, plan: nett(6, 6) })
