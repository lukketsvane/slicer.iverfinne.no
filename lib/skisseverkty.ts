import { type Pt, type Vec3 } from "./core"
import { PLAN_ROM, PLAN_TAK, akser, dot, nyGruppe, nyId, vriOm, type Plan } from "./plan"

/** Startpunkt for handa. Alle profilar er vanlege omriss med flyttbare punkt. */
export const SKISSEFORMER = ["plate", "rund", "c-profil", "kryss", "sadel", "ramme"] as const
export type Skisseform = typeof SKISSEFORMER[number]
export type Gjentaking = "rett" | "vifte" | "vridd"

export function skisseprofil(slag: Skisseform, id: number, akse: 0 | 1 | 2): Plan {
  const profilar: Record<Skisseform, Pt[]> = {
    plate: [[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]],
    rund: [[0,-.4],[.4,0],[0,.4],[-.4,0]],
    "c-profil": [[.4,-.45],[-.35,-.45],[-.4,-.2],[-.4,.2],[-.35,.45],[.4,.45],[.4,.36],[-.18,.36],[-.24,.16],[-.24,-.16],[-.18,-.36],[.4,-.36]],
    kryss: [[-.4,-.45],[-.24,-.45],[0,-.1],[.24,-.45],[.4,-.45],[.1,0],[.4,.4],[.24,.4],[0,.1],[-.24,.4],[-.4,.4],[-.1,0]],
    sadel: [[-.45,.4],[-.2,.3],[0,.26],[.2,.3],[.45,.4],[.42,.22],[.12,.06],[.36,-.45],[.2,-.45],[0,-.12],[-.2,-.45],[-.36,-.45],[-.12,.06],[-.42,.22]],
    ramme: [[-.4,-.45],[-.28,-.45],[-.28,.28],[.28,.28],[.28,-.45],[.4,-.45],[.4,.4],[-.4,.4]],
  }
  const n: Vec3 = [0, 0, 0]
  n[akse] = 1
  return { id, o: [.5,.5,.5], n, bog: 0, strek: [], omriss: profilar[slag],
    ...(slag === "rund" ? { runde: [0,1,2,3] } : slag === "sadel" ? { runde: [1,2,3] } : {}) }
}

/** Kopien eig òg omrisset, bogane, streka, mjukinga og laget sitt. */
export function kopierPlan(p: Plan): Plan {
  return { ...p, o: [...p.o], n: [...p.n], strek: p.strek.map(s => ({ ...s })),
    ...(p.omriss ? { omriss: p.omriss.map(q => [...q] as Pt) } : {}),
    ...(p.runde ? { runde: [...p.runde] } : {}) }
}

/** Rekkja er inndata til den same motoren. Originalen står der handa sette han.
 * Avstand er senteravstand i mm, målt langs originalen sin normal. Vifta vender
 * kvart plan kring si eiga oppakse; vridinga vender profilen i sitt eige plan. */
export function gjentaProfil(liste: readonly Plan[], id: number, tal: number, avstand: number, vinkel: number, slag: Gjentaking, min: Vec3, max: Vec3): { plan: Plan[]; gruppe: number } | { feil: string } {
  const kjelde = liste.find(p => p.id === id)
  if (!kjelde) return { feil: "vel eit plan" }
  if (![tal, avstand, vinkel, ...min, ...max].every(Number.isFinite) || tal < 2 || !Number.isInteger(tal) || avstand <= 0 || Math.abs(vinkel) > 180) return { feil: "ugyldige mål" }
  if (liste.length + tal - 1 > PLAN_TAK) return { feil: `taket er ${PLAN_TAK} plan` }
  if (slag === "vridd" && (!kjelde.omriss || kjelde.bog)) return { feil: "vel eit flatt omriss" }
  const ramme = akser(kjelde.n)
  const gruppe = nyGruppe(liste)
  const rad: Plan[] = [{ ...kopierPlan(kjelde), gruppe }]
  let neste = nyId(liste)
  for (let i = 1; i < tal; i++) {
    const p = kopierPlan(kjelde)
    p.id = neste++
    p.gruppe = gruppe
    p.o = p.o.map((c, a) => c + kjelde.n[a] * i * avstand / Math.max(1e-6, max[a] - min[a])) as Vec3
    if (p.o.some(c => c < -PLAN_ROM || c > 1 + PLAN_ROM)) return { feil: "rekkja går utanfor arbeidsrommet" }
    const ang = vinkel * Math.PI / 180 * i / (tal - 1)
    let vend = slag === "vridd" ? ang : 0
    if (slag === "vifte") {
      p.n = vriOm(kjelde.n, ramme.v, ang)
      const ny = akser(p.n)
      const u = vriOm(ramme.u, ramme.v, ang)
      vend = Math.atan2(dot(u, ny.v), dot(u, ny.u))
      // Ein sylinder har bøy langs u. Å snu den aksen vekk er ikkje same flata.
      if (p.bog && Math.abs(vend) > 1e-6) return { feil: "rett ut bøyen før denne vifta" }
    }
    if (vend) {
      const snu = ([x, y]: Pt): Pt => [x * Math.cos(vend) - y * Math.sin(vend), x * Math.sin(vend) + y * Math.cos(vend)]
      if (p.omriss) p.omriss = p.omriss.map(snu)
      p.strek = p.strek.map(s => { const [x, y] = snu([s.x, s.y]); return { ...s, x, y, a: s.a + vend * 180 / Math.PI } })
    }
    rad.push(p)
  }
  return { plan: [...liste.map(p => p.id === id ? rad[0] : p), ...rad.slice(1)], gruppe }
}
