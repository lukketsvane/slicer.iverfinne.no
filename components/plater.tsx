"use client"

import { useEffect, useLayoutEffect, useRef, useState, type JSX } from "react"
import { LAG_FARGAR, lagFarge, nn, type ArkSyn, type Delplass, type ParamBag } from "@/lib/core"
import { DELING_MAX, DELING_MIN, lesDeling, lesFest, skrivDeling, skrivFest } from "@/lib/params"
import { CHIP, chipStyle } from "./deler"

/**
 * PLATA ER IKKJE EIT BILETE. Kvar del er sitt eige element med adressa på
 * seg; banene er DEI SAME som fila skriv, med same snittkompensasjon, i same
 * koordinat — `translate(0,H) scale(1,-1)` er den same snuinga `sheetSvg`
 * gjer, av di geometrien står med y opp og SVG med y ned.
 *
 * Tre ting ein finger kan gjere med ein del: eit trykk peikar, eit trykk som
 * VARER opnar menyen (fest, snu, byt plate), eit drag flyttar han — og der
 * du slepper, står han fast: eit feste er nøyaktig det pakkinga gjev frå seg
 * som plassering. To fingrar på ein vald del dreg og snur han; utan val er
 * to fingrar eit klyp på plata. Éin finger på bert bord dreg utsnittet, og
 * dobbelttrykk syner heile plata.
 */
const HAIR = { borderColor: "var(--rule)" }

/**
 * MÅLRUTA.
 *
 * Plata er der du avgjer om noko går opp: får delane plass på det
 * restkappet du har, kor langt frå kanten ligg den delen, kor breid er
 * luka. Det stod ingen målestokk i ruta — berre delar på eit kvitt felt —
 * so kvart slikt spørsmål vart eit auge og ei gjetting.
 *
 * STEGET FYLGJER AUGET OG IKKJE PLATA. Ti millimeter på ei plate på tre
 * meter er tre hundre liner og eit grått felt; ti millimeter på eit utsnitt
 * du har zooma inn på er det du vil ha. Difor vert steget valt etter kor
 * mange PIKSLAR det vert på skjermen: det minste steget som gjev minst ni
 * pikslar mellom linene. Kvar femte line er sterkare og ber talet sitt.
 *
 * Ho ligg UNDER delane og tek ikkje imot fingrar. Og ho er berre på
 * skjermen: kuttfila har to fargar og ikkje ein til, og ei hjelpeline i
 * henne er eit lag nokon ein dag gløymer å slå av (sjå `export-svg.ts`).
 */
const STEG = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000] as const

function Maalrute({ arkB, arkH, v, ppm }: { arkB: number; arkH: number; v: Syn; ppm: number }) {
  if (!(ppm > 0)) return null
  const steg = STEG.find((q) => q * ppm >= 9) ?? 1000
  const sterk = steg * 5
  const paa = (t: number, m: number) => Math.abs(t - Math.round(t / m) * m) < 1e-6
  const x0 = Math.max(0, Math.floor(Math.max(0, v.x) / steg) * steg)
  const x1 = Math.min(arkB, v.x + v.w)
  const y0 = Math.max(0, Math.floor(Math.max(0, v.y) / steg) * steg)
  const y1 = Math.min(arkH, v.y + v.h)
  const tsz = 9 / ppm
  const hår = 1 / ppm
  const liner: JSX.Element[] = []
  const tal: JSX.Element[] = []
  // tala står langs den synlege kanten, ikkje langs plata: zoomar du inn
  // på midten, skal målestokken framleis stå der du ser
  const tx = Math.max(0, v.x) + 3 * hår
  const ty = Math.min(arkH, v.y + v.h) - 3 * hår
  for (let x = x0; x <= x1 + 1e-6; x += steg) {
    const s = paa(x, sterk)
    liner.push(<line key={`v${x}`} x1={x} y1={Math.max(0, v.y)} x2={x} y2={y1} strokeWidth={hår} opacity={s ? 0.5 : 0.18} />)
    if (s && x > x0) tal.push(<text key={`tv${x}`} x={x + 3 * hår} y={ty} fontSize={tsz} opacity={0.55}>{x}</text>)
  }
  for (let y = y0; y <= y1 + 1e-6; y += steg) {
    const s = paa(y, sterk)
    // SVG-en har y ned og plata y opp: lina på plate-y står i `arkH − y`
    const sy = arkH - y
    liner.push(<line key={`h${y}`} x1={tx - 3 * hår} y1={sy} x2={x1} y2={sy} strokeWidth={hår} opacity={s ? 0.5 : 0.18} />)
    if (s && y > y0) tal.push(<text key={`th${y}`} x={tx} y={sy - 3 * hår} fontSize={tsz} opacity={0.55}>{y}</text>)
  }
  return (
    <g aria-hidden="true" pointerEvents="none" stroke="var(--ink)" fill="var(--ink)">
      {liner}
      <g stroke="none" className="tab">{tal}</g>
    </g>
  )
}
/**
 * EIT SPOR-ENDE, SOM HANDTAK.
 *
 * Prikken står på den lukka enden av sporet; streken bak henne er kor langt
 * ho kan gå — bandet lesinga tek imot, og ikkje ein millimeter meir. Begge
 * er rekna i PIKSLAR og delte på målestokken, so handtaket er like stort
 * anten du ser heile plata eller står tett på eitt spor. Treffesona er
 * større enn prikken: fingeren er ikkje ein peikar.
 */
function Sporende({ v, ppm, t, ned }: {
  v: Delplass["spor"][number]
  ppm: number
  /** brøken fingeren har han på no, eller null når han står der han står */
  t: number | null
  ned: (e: React.PointerEvent, v: Delplass["spor"][number]) => void
}) {
  const paa = (u: number): [number, number] => [v.lo[0] + (v.hi[0] - v.lo[0]) * u, v.lo[1] + (v.hi[1] - v.lo[1]) * u]
  const [bx, by] = t === null ? v.botn : paa(t)
  const [ax, ay] = paa(DELING_MIN)
  const [cx, cy] = paa(DELING_MAX)
  const r = 5 / ppm
  const djup = Math.hypot(bx - v.munn[0], by - v.munn[1])
  return (
    <g data-spor={v.nokkel} style={{ cursor: "grab" }} onPointerDown={(e) => ned(e, v)}>
      <line x1={ax} y1={ay} x2={cx} y2={cy} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--ink)", opacity: 0.3 }} />
      <circle cx={bx} cy={by} r={12 / ppm} style={{ fill: "transparent" }} />
      <circle cx={bx} cy={by} r={r} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ fill: "var(--paper)", stroke: "var(--ink)" }} />
      <title>{`ledd ${v.nokkel} · ${nn(djup, 0)} mm djupt`}</title>
    </g>
  )
}

const CHIP_B = CHIP.replace("rounded-full", "rounded-[2px]")
/**
 * Kor lenge eit trykk må vare for å vera langt. Klokka ser ikkje fingeren:
 * står hovudtråden stille, kjem rørslene i kø bak henne. Hendingane ber si
 * eiga klokke — ei rørsle som HENDE før terskelen, men kom fram etter, seier
 * at det lange trykket var ei feillesing, og då vert det teke attende.
 */
const LANGT_MS = 450
const vinkel = (ny: number, gml: number) => {
  let v = ny - gml
  while (v > Math.PI) v -= 2 * Math.PI
  while (v <= -Math.PI) v += 2 * Math.PI
  return v
}
const feillese = (t: { tid: number; brukt: boolean; lang: boolean }, no: number) => {
  if (!t.lang || no - t.tid >= LANGT_MS) return false
  t.lang = false
  t.brukt = false
  return true
}
const klem = (v: number, tak: number) => Math.min(Math.max(0, v), Math.max(0, tak))

type Syn = { x: number; y: number; w: number; h: number }
type Plass = Delplass["plass"]

export function Plater({ ark, params, onChange, onArk, peikt, onPeik }: {
  ark: ArkSyn | null
  params: ParamBag
  onChange: (p: ParamBag) => void
  onArk: (i: number) => void
  peikt: string | null
  onPeik: (adr: string | null) => void
}) {
  // --- festa: kvar ein del står, når handa har sagt det -------------------
  const festa = lesFest(params.fest)
  const skriv = (m: Map<string, Plass>) => onChange({ ...params, fest: skrivFest(m) })
  /** kvar delen står NO: festet i parametrane går føre plata, som kan vera frå før trykket */
  const plassAv = (adr: string) => festa.get(adr) ?? ark?.plasser.find((d) => d.adr === adr)?.plass
  const vipFest = (adr: string) => {
    const m = new Map(festa)
    if (m.has(adr)) m.delete(adr)
    else {
      const pl = plassAv(adr)
      if (!pl) return
      m.set(adr, pl)
    }
    skriv(m)
  }
  // --- delinga: kor djupt eitt ledd går ----------------------------------
  /**
   * SPOR-ENDANE ER HANDTAK.
   *
   * Skyvaren «deling» flyttar botnen i ALLE ledd på ein gong; ho er eitt
   * tal for heile kroppen. Men eit ledd er to delar som deler ei line, og
   * kva for ein av dei som skal bere mest er ei avgjerd per ledd: ribba
   * som ber vekta skal ha mest gods att, og naboen mindre.
   *
   * Her er den avgjerda der ho høyrer heime — på plata, med fingeren på
   * den lukka enden av sporet. Botnen fylgjer lina leddet ligg på, og
   * `deling` i posen tek imot brøken. Den ANDRE delen i leddet les den
   * same brøken frå si side og vert grunnare av seg sjølv: det er éi line,
   * ikkje to tal som må haldast i lag.
   */
  const setjDeling = (nokkel: string, t: number) => {
    const m = new Map(lesDeling(params.deling))
    m.set(nokkel, +t.toFixed(3))
    onChange({ ...params, deling: skrivDeling(m) })
  }
  /** botnen der fingeren har han, medan han dreg: brøken langs lo→hi */
  const [sporDra, setSporDra] = useState<{ nokkel: string; t: number } | null>(null)
  const sporDraRef = useRef(sporDra)
  sporDraRef.current = sporDra

  /** eit drag er òg eit feste: ein del flytt for hand og pakka om att er ein del som ikkje vart flytt */
  const flyttDel = (adr: string, plass: Plass) => {
    const m = new Map(festa)
    m.set(adr, { ...plass, x: +plass.x.toFixed(2), y: +plass.y.toFixed(2) })
    skriv(m)
  }
  /** ein kvart sving kring MIDTEN av masken, so delen står i staden for å hoppe */
  const snuDel = (adr: string) => {
    const d = ark?.plasser.find((q) => q.adr === adr)
    if (!d) return
    const no = festa.get(adr) ?? d.plass
    if (no.rot !== d.plass.rot) return
    const marg = Math.max(0, d.boks.x - d.plass.x)
    const W = d.boks.w + 2 * marg
    const H = d.boks.h + 2 * marg
    const cx = d.plass.x + W / 2
    const cy = d.plass.y + H / 2
    const m = new Map(festa)
    m.set(adr, { sheet: d.plass.sheet, rot: ((no.rot + 1) % 4) as 0 | 1 | 2 | 3, x: +Math.max(0, cx - H / 2).toFixed(2), y: +Math.max(0, cy - W / 2).toFixed(2) })
    skriv(m)
  }
  /** eitt steg fram eller attende i bunken — forbi den siste er ei ny plate. Skuffa fylgjer han. */
  const bytPlate = (adr: string, steg: 1 | -1) => {
    const d = ark?.plasser.find((q) => q.adr === adr)
    if (!d) return
    const til = d.plass.sheet + steg
    if (til < 0) return
    const m = new Map(festa)
    m.set(adr, { ...(m.get(adr) ?? d.plass), sheet: til })
    skriv(m)
    onArk(til)
  }

  /**
   * PILENE FLYTTAR DEN VALDE DELEN, ein millimeter per trykk og ti med
   * skift — for benken, der ein drar han om lag rett og set han nøyaktig
   * etterpå. Same veg som draget: innanfor plata, med margen, og festa.
   * Lyttaren står på vindauget medan plata står framme, og les det
   * nyaste gjennom ein ref: eit tastetrykk skal ikkje flytte ein del slik
   * han stod for ein render sidan.
   */
  const stegDel = (dx: number, dy: number) => {
    const d = peikt ? ark?.plasser.find((q) => q.adr === peikt) : undefined
    if (!d || !ark) return
    const no = plassAv(d.adr) ?? d.plass
    const marg = Math.max(0, d.boks.x - d.plass.x)
    const snudd = no.rot % 2 === 1
    const W = (snudd ? d.boks.h : d.boks.w) + 2 * marg
    const H = (snudd ? d.boks.w : d.boks.h) + 2 * marg
    flyttDel(d.adr, { ...no, sheet: ark.i, x: klem(no.x + dx, ark.arkB - W), y: klem(no.y + dy, ark.arkH - H) })
  }
  const stegRef = useRef(stegDel)
  stegRef.current = stegDel
  useEffect(() => {
    const tast = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.getAttribute("role") === "slider" || /^(input|textarea|select)$/i.test(t.tagName))) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = e.shiftKey ? 10 : 1
      const d = e.key === "ArrowLeft" ? [-s, 0] : e.key === "ArrowRight" ? [s, 0] : e.key === "ArrowUp" ? [0, s] : e.key === "ArrowDown" ? [0, -s] : null
      if (!d) return
      e.preventDefault()
      stegRef.current(d[0], d[1])
    }
    window.addEventListener("keydown", tast)
    return () => window.removeEventListener("keydown", tast)
  }, [])

  /** menyen over delen: der fingeren står, ikkje i ein vegg */
  const [meny, setMeny] = useState<{ adr: string; x: number; y: number } | null>(null)
  const menyRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = menyRef.current
    if (!el || !meny) return
    const w = el.offsetWidth
    el.style.left = `${Math.min(Math.max(12, meny.x - w / 2), Math.max(12, window.innerWidth - w - 12))}px`
  }, [meny])

  // --- fingrane -------------------------------------------------------------
  const trykk = useRef<{ adr: string; x: number; y: number; tid: number; plass: Plass; boks: Delplass["boks"]; brukt: boolean; lang: boolean } | null>(null)
  const langt = useRef(0)
  /** spøkelset: delen der fingeren har han, til plata har teke han att */
  const [dra, setDra] = useState<{ adr: string; dx: number; dy: number; vri?: number } | null>(null)
  const draRef = useRef(dra)
  const flata = useRef<SVGGElement | null>(null)
  useEffect(() => { draRef.current = null; setDra(null) }, [ark])
  /** utsnittet, i platekoordinatar, alltid med ruta sitt sideforhold; null er heile plata */
  const [syn, setSyn] = useState<Syn | null>(null)
  const synRef = useRef<Syn | null>(null)
  synRef.current = syn
  const svgRef = useRef<SVGSVGElement | null>(null)
  const fingrar = useRef(new Map<number, { x: number; y: number }>())
  const klyp = useRef<{ v: Syn; ppm: number; a: { x: number; y: number }; b: { x: number; y: number } } | null>(null)
  const pan = useRef<{ id: number; v: Syn; ppm: number; p: { x: number; y: number } } | null>(null)
  const heileRef = useRef<(r: DOMRect) => Syn>(() => ({ x: 0, y: 0, w: 1, h: 1 }))
  const inneRef = useRef<(v: Syn) => Syn>((v) => v)
  /** to fingrar på den valde delen: dreg han dit dei går og vrir han */
  const grep = useRef<{ adr: string; plass: Plass; boks: Delplass["boks"]; anker: { cx: number; cy: number }; sist: number; vri: number; ppm: number; d0: number; a: { x: number; y: number }; b: { x: number; y: number }; v: Syn; modus: "uavgjort" | "del" } | null>(null)
  const tapp = useRef<{ id: number; x: number; y: number; paaDel: boolean; fleire: boolean } | null>(null)
  useEffect(() => setSyn(null), [ark?.arkB, ark?.arkH])
  /** kor stor ruta er i pikslar. `stoda()` les DOM-en når han vert kalla og
   *  duger til gestar; målruta må vite det medan ho vert teikna. */
  const [pikslar, setPikslar] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const les = () => {
      const r = el.getBoundingClientRect()
      setPikslar((q) => (Math.abs(q.w - r.width) < 0.5 && Math.abs(q.h - r.height) < 0.5 ? q : { w: r.width, h: r.height }))
    }
    const ro = new ResizeObserver(les)
    ro.observe(el)
    les()
    return () => ro.disconnect()
  }, [ark])

  // hjulet gjer det klypet gjer. Ikkje `onWheel`: React set hjulet passivt, og passivt kan ikkje stogge rullinga.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const paa = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const v = synRef.current ?? heileRef.current(r)
      const ppm = r.width / v.w
      const ppmHeile = r.width / heileRef.current(r).w
      const ppm1 = Math.min(ppmHeile * 10, Math.max(ppmHeile, ppm * Math.exp(-e.deltaY / 400)))
      if (ppm1 <= ppmHeile * 1.01) return setSyn(null)
      const M = { x: v.x + (e.clientX - r.left) / ppm, y: v.y + (e.clientY - r.top) / ppm }
      setSyn(inneRef.current({ x: M.x - (e.clientX - r.left) / ppm1, y: M.y - (e.clientY - r.top) / ppm1, w: r.width / ppm1, h: r.height / ppm1 }))
    }
    el.addEventListener("wheel", paa, { passive: false })
    return () => el.removeEventListener("wheel", paa)
  }, [ark])

  /**
   * Å TA I EIT SPOR-ENDE. Fingeren vert fylgd i millimeter på plata og
   * projisert ned på lina leddet ligg på: brøken er kor langt ut på det
   * strekket han står. Klemt til det same bandet lesinga tek imot, so eit
   * drag ut i lause lufta ikkje vert stille kasta.
   */
  const taSpor = (e: React.PointerEvent, v: Delplass["spor"][number]) => {
    e.stopPropagation()
    if (!e.isPrimary) return
    const el = e.currentTarget as SVGGElement
    el.setPointerCapture(e.pointerId)
    const dx = v.hi[0] - v.lo[0]
    const dy = v.hi[1] - v.lo[1]
    const len2 = dx * dx + dy * dy
    if (len2 < 1e-9) return
    const broek = (cx: number, cy: number): number | null => {
      const q = mm(cx, cy)
      if (!q) return null
      const t = ((q[0] - v.lo[0]) * dx + (q[1] - v.lo[1]) * dy) / len2
      return Math.min(DELING_MAX, Math.max(DELING_MIN, t))
    }
    const flytt = (h: PointerEvent) => {
      const t = broek(h.clientX, h.clientY)
      if (t !== null) setSporDra({ nokkel: v.nokkel, t })
    }
    const slepp = (h: PointerEvent) => {
      el.removeEventListener("pointermove", flytt)
      el.removeEventListener("pointerup", slepp)
      el.removeEventListener("pointercancel", slepp)
      const t = sporDraRef.current?.nokkel === v.nokkel ? sporDraRef.current.t : broek(h.clientX, h.clientY)
      setSporDra(null)
      if (t !== null) setjDeling(v.nokkel, t)
    }
    el.addEventListener("pointermove", flytt)
    el.addEventListener("pointerup", slepp)
    el.addEventListener("pointercancel", slepp)
  }

  /** frå skjermpikslar til millimeter på plata, gjennom den same spegelen teikninga ligg i */
  const mm = (cx: number, cy: number): [number, number] | null => {
    const ctm = flata.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }

  if (!ark || !ark.tal) return <p className="dim p-4 text-[11px]">ingen plater</p>
  const { arkB, arkH } = ark
  const heile = (r: DOMRect): Syn => {
    const ppm = Math.min(r.width / arkB, r.height / arkH)
    const w = r.width / ppm
    const h = r.height / ppm
    return { x: (arkB - w) / 2, y: (arkH - h) / 2, w, h }
  }
  /** utsnittet og målestokken slik dei står NO, til teikninga */
  const utsnitt: Syn = syn ?? (pikslar.w > 0 && pikslar.h > 0
    ? (() => { const q = Math.min(pikslar.w / arkB, pikslar.h / arkH); return { x: (arkB - pikslar.w / q) / 2, y: (arkH - pikslar.h / q) / 2, w: pikslar.w / q, h: pikslar.h / q } })()
    : { x: 0, y: 0, w: arkB, h: arkH })
  const ppm = pikslar.w > 0 ? pikslar.w / utsnitt.w : 0

  const stoda = () => {
    const r = svgRef.current!.getBoundingClientRect()
    const v = synRef.current ?? heile(r)
    return { r, v, ppm: r.width / v.w }
  }
  /** utsnittet får ikkje gå lenger ut enn at halve ruta framleis er plate */
  const inne = (v: Syn): Syn => ({ ...v, x: Math.min(Math.max(v.x, -v.w / 2), arkB - v.w / 2), y: Math.min(Math.max(v.y, -v.h / 2), arkH - v.h / 2) })
  heileRef.current = heile
  inneRef.current = inne
  const sleppDelen = () => {
    window.clearTimeout(langt.current)
    trykk.current = null
    draRef.current = null
    setDra(null)
  }
  /**
   * SNAPPET: kant i kant er nøyaktig luka. Masken er boksen pluss klaringa,
   * so to masker kant i kant er det tettaste pakkinga sjølv ville lagt dei.
   * Åtte PIKSLAR, ikkje millimeter: fingeren er unøyaktig, zoom inn og han
   * smett fyrst når du er nærare. Og masken stoggar ved kanten av plata.
   */
  const snapp = (g: { adr: string; plass: Plass; boks: Delplass["boks"] }, dx: number, dy: number, ppm: number) => {
    const rekk = 8 / ppm
    const marg = Math.max(0, g.boks.x - g.plass.x)
    const W = g.boks.w + 2 * marg
    const H = g.boks.h + 2 * marg
    const xs = [0, arkB - W]
    const ys = [0, arkH - H]
    for (const d of ark.plasser) {
      if (d.adr === g.adr) continue
      const m = Math.max(0, d.boks.x - d.plass.x)
      const w = d.boks.w + 2 * m
      const h = d.boks.h + 2 * m
      xs.push(d.plass.x + w, d.plass.x - W, d.plass.x, d.plass.x + w - W)
      ys.push(d.plass.y + h, d.plass.y - H, d.plass.y, d.plass.y + h - H)
    }
    const naer = (v: number, kand: number[], tak: number) => {
      let best = v
      let avst = rekk
      for (const c of kand) {
        const a = Math.abs(c - v)
        if (a < avst) { avst = a; best = c }
      }
      return klem(best, tak)
    }
    return { dx: naer(g.plass.x + dx, xs, arkB - W) - g.plass.x, dy: naer(g.plass.y + dy, ys, arkH - H) - g.plass.y }
  }
  /** dei to fingrane slepper: delen står fast der dei hadde han, i næraste kvart sving kring midten */
  const slepp = () => {
    const g = grep.current
    if (!g) return
    grep.current = null
    const q = draRef.current
    if (!q || (!q.dx && !q.dy && !q.vri)) { draRef.current = null; setDra(null); return }
    const k = ((Math.round((q.vri ?? 0) / 90) % 4) + 4) % 4
    const marg = Math.max(0, g.boks.x - g.plass.x)
    const W = g.boks.w + 2 * marg
    const H = g.boks.h + 2 * marg
    const { dx, dy } = k % 2 === 0 ? snapp(g, q.dx, q.dy, g.ppm) : { dx: q.dx, dy: q.dy }
    const cx = g.plass.x + W / 2 + dx
    const cy = g.plass.y + H / 2 + dy
    const [w2, h2] = k % 2 ? [H, W] : [W, H]
    const ny = { ...q, vri: k * 90 }
    draRef.current = ny
    setDra(ny)
    flyttDel(g.adr, { sheet: ark.i, rot: ((g.plass.rot + k) % 4) as 0 | 1 | 2 | 3, x: klem(cx - w2 / 2, arkB - w2), y: klem(cy - h2 / 2, arkH - h2) })
  }
  const faste = ark.plasser.filter((d) => festa.has(d.adr)).length
  const vald = peikt ? ark.plasser.find((d) => d.adr === peikt) : undefined
  const kryss = ark.plasser.filter((d) => d.kross).length
  const delingar = lesDeling(params.deling)
  const sleppFinger = (e: React.PointerEvent) => {
    fingrar.current.delete(e.pointerId)
    if (fingrar.current.size < 2) { klyp.current = null; slepp() }
    if (pan.current?.id === e.pointerId) pan.current = null
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2" style={HAIR}>
        {Array.from({ length: ark.tal }, (_, i) => (
          <button key={i} type="button" className={CHIP_B + " mono min-h-[26px] px-2.5"} style={chipStyle(i === ark.i)} onClick={() => onArk(i)} title={`plate ${i + 1} av ${ark.tal}`}>{i + 1}</button>
        ))}
        <span className="dim mono ml-auto min-w-0 truncate text-[10px]">{ark.delar} delar · {nn(ark.util * 100, 0)} %{faste > 0 && ` · ${faste} faste`}</span>
        {festa.size > 0 && (
          <button type="button" className={CHIP_B + " uppercase tracking-[0.1em]"} style={chipStyle(false)} onClick={() => onChange({ ...params, fest: "" })} title="slepp alle festa delar: pakkinga legg dei der ho vil att">slepp</button>
        )}
        {kryss > 0 && <span className="mono text-[10px]" style={{ color: "var(--warn)" }}>{kryss} overlapp</span>}
        {delingar.size > 0 && (
          <button type="button" className={CHIP_B + " uppercase tracking-[0.1em]"} style={chipStyle(false)} onClick={() => onChange({ ...params, deling: "" })} title="alle ledd like djupe att: skyvaren styrer dei igjen">jamt</button>
        )}
        {dra && (() => {
          const d = ark.plasser.find((q) => q.adr === dra.adr)
          return d ? (
            <span className="mono basis-full truncate text-[10px]">{dra.adr} · {nn(Math.max(0, d.plass.x + dra.dx), 0)} · {nn(Math.max(0, d.plass.y + dra.dy), 0)} mm{dra.vri ? ` · ${nn(dra.vri, 0)}°` : ""}</span>
          ) : null
        })()}
        {sporDra && (() => {
          const v = vald?.spor.find((q) => q.nokkel === sporDra.nokkel)
          if (!v) return null
          const bx = v.lo[0] + (v.hi[0] - v.lo[0]) * sporDra.t
          const by = v.lo[1] + (v.hi[1] - v.lo[1]) * sporDra.t
          return <span className="mono basis-full truncate text-[10px]">ledd {v.nokkel} · {nn(Math.hypot(bx - v.munn[0], by - v.munn[1]), 0)} mm</span>
        })()}
        {!dra && !sporDra && vald && (
          <span className="dim basis-full truncate text-[10px] tracking-[0.04em]">{vald.adr} · {nn(vald.boks.w, 0)} × {nn(vald.boks.h, 0)} mm</span>
        )}
      </div>
      <div className="min-h-0 flex-1 p-3">
        <svg
          ref={svgRef}
          viewBox={syn ? `${syn.x} ${syn.y} ${syn.w} ${syn.h}` : `0 0 ${arkB} ${arkH}`}
          className="h-full w-full"
          role="img"
          aria-label={`plate ${ark.i + 1} av ${ark.tal}, ${ark.delar} delar`}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") onPeik(null) }}
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            fingrar.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            const paaDel = !!(e.target as Element).closest("g[data-del]")
            if (fingrar.current.size === 1) tapp.current = { id: e.pointerId, x: e.clientX, y: e.clientY, paaDel, fleire: false }
            else if (tapp.current) tapp.current.fleire = true
            if (fingrar.current.size === 2) {
              sleppDelen()
              pan.current = null
              const [a, b] = [...fingrar.current.values()]
              const { v, ppm } = stoda()
              if (vald) {
                grep.current = { adr: vald.adr, plass: vald.plass, boks: vald.boks, anker: { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }, sist: Math.atan2(b.y - a.y, b.x - a.x), vri: 0, ppm, d0: Math.hypot(a.x - b.x, a.y - b.y), a: { ...a }, b: { ...b }, v, modus: "uavgjort" }
                klyp.current = null
              } else klyp.current = { v, ppm, a: { ...a }, b: { ...b } }
              e.currentTarget.setPointerCapture(e.pointerId)
              return
            }
            if (fingrar.current.size === 1 && !paaDel && synRef.current) {
              const { v, ppm } = stoda()
              pan.current = { id: e.pointerId, v, ppm, p: { x: e.clientX, y: e.clientY } }
              e.currentTarget.setPointerCapture(e.pointerId)
            }
          }}
          onPointerMove={(e) => {
            if (!fingrar.current.has(e.pointerId)) return
            fingrar.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            const g = grep.current
            if (g && fingrar.current.size >= 2) {
              const [a1, b1] = [...fingrar.current.values()]
              const a = Math.atan2(b1.y - a1.y, b1.x - a1.x)
              g.vri += vinkel(a, g.sist)
              g.sist = a
              if (g.modus === "uavgjort") {
                // lese av vegen KVAR FINGER har gått, ikkje av avstanden: to fingrar
                // rører seg aldri i same augeblinken, og avstanden sprett med steget
                const da = { x: a1.x - g.a.x, y: a1.y - g.a.y }
                const db = { x: b1.x - g.b.x, y: b1.y - g.b.y }
                if (Math.hypot(da.x, da.y) < 8 || Math.hypot(db.x, db.y) < 8) return
                const drag = Math.hypot((da.x + db.x) / 2, (da.y + db.y) / 2)
                const klem2 = Math.abs(Math.hypot(a1.x - b1.x, a1.y - b1.y) - g.d0)
                const bog = Math.abs(g.vri) * (g.d0 / 2)
                if (klem2 > drag && klem2 > bog) {
                  klyp.current = { v: g.v, ppm: g.ppm, a: g.a, b: g.b }
                  grep.current = null
                } else g.modus = "del"
              }
            }
            const gd = grep.current
            if (gd && fingrar.current.size >= 2) {
              const [a1, b1] = [...fingrar.current.values()]
              const cx = (a1.x + b1.x) / 2
              const cy = (a1.y + b1.y) / 2
              // skjermen har y ned og plata y opp, so begge byter forteikn
              const flytt = Math.hypot(cx - gd.anker.cx, cy - gd.anker.cy) > 6
              const grader = (-gd.vri * 180) / Math.PI
              const vri = Math.abs(grader) > 8 ? grader : 0
              let dx = flytt ? (cx - gd.anker.cx) / gd.ppm : 0
              let dy = flytt ? -(cy - gd.anker.cy) / gd.ppm : 0
              if (flytt && !vri) ({ dx, dy } = snapp(gd, dx, dy, gd.ppm))
              const ny = { adr: gd.adr, dx, dy, vri }
              draRef.current = ny
              setDra(ny)
              return
            }
            const k = klyp.current
            if (k && fingrar.current.size >= 2) {
              const [a1, b1] = [...fingrar.current.values()]
              const d0 = Math.hypot(k.a.x - k.b.x, k.a.y - k.b.y) || 1
              const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y) || 1
              const { r } = stoda()
              const ppmHeile = r.width / heile(r).w
              const ppm1 = Math.min(ppmHeile * 10, Math.max(ppmHeile, k.ppm * (d1 / d0)))
              if (ppm1 <= ppmHeile * 1.01) return setSyn(null)
              const m0 = { x: (k.a.x + k.b.x) / 2, y: (k.a.y + k.b.y) / 2 }
              const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
              const M = { x: k.v.x + (m0.x - r.left) / k.ppm, y: k.v.y + (m0.y - r.top) / k.ppm }
              setSyn(inne({ x: M.x - (m1.x - r.left) / ppm1, y: M.y - (m1.y - r.top) / ppm1, w: r.width / ppm1, h: r.height / ppm1 }))
              return
            }
            const q = pan.current
            if (q && q.id === e.pointerId) setSyn(inne({ ...q.v, x: q.v.x - (e.clientX - q.p.x) / q.ppm, y: q.v.y - (e.clientY - q.p.y) / q.ppm }))
          }}
          onPointerUp={(e) => {
            sleppFinger(e)
            const t = tapp.current
            if (t && t.id === e.pointerId) {
              tapp.current = null
              // eit trykk på bert bord, stillestandande og åleine, peikar på ingenting
              if (!t.paaDel && !t.fleire && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 6) onPeik(null)
            }
          }}
          onPointerCancel={(e) => { sleppFinger(e); if (tapp.current?.id === e.pointerId) tapp.current = null }}
          onDoubleClick={() => setSyn(null)}
        >
          <rect x={0} y={0} width={arkB} height={arkH} vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: "var(--rule)" }} />
          <Maalrute arkB={arkB} arkH={arkH} v={utsnitt} ppm={ppm} />
          <g ref={flata} transform={`translate(0,${arkH}) scale(1,-1)`}>
            {ark.plasser.map((d) => {
              const paa = peikt === d.adr
              const fast = festa.has(d.adr)
              const q = dra?.adr === d.adr ? dra : null
              // eit merkt plan står i laget sin farge på plata òg: same fargen som i fila
              const strek = d.kross ? "var(--warn)" : lagFarge(d.farge) !== null ? LAG_FARGAR[d.farge as number] : "var(--ink)"
              return (
                <g
                  key={d.adr}
                  data-del={d.adr}
                  data-paa={paa ? "" : undefined}
                  transform={q ? `translate(${q.dx} ${q.dy})` + (q.vri ? ` rotate(${q.vri} ${d.boks.x + d.boks.w / 2} ${d.boks.y + d.boks.h / 2})` : "") : undefined}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") onPeik(d.adr) }}
                  onPointerDown={(e) => {
                    if (!e.isPrimary) return
                    const x = e.clientX
                    const y = e.clientY
                    trykk.current = { adr: d.adr, x, y, tid: e.timeStamp, plass: d.plass, boks: d.boks, brukt: false, lang: false }
                    e.currentTarget.setPointerCapture(e.pointerId)
                    window.clearTimeout(langt.current)
                    langt.current = window.setTimeout(() => {
                      const t = trykk.current
                      if (!t || t.brukt || t.adr !== d.adr) return
                      t.brukt = true
                      t.lang = true
                      onPeik(d.adr)
                      setMeny({ adr: d.adr, x, y })
                    }, LANGT_MS)
                  }}
                  onPointerMove={(e) => {
                    const t = trykk.current
                    if (!t) return
                    if (feillese(t, e.timeStamp)) setMeny(null)
                    if (t.brukt) return
                    if (!draRef.current && Math.hypot(e.clientX - t.x, e.clientY - t.y) <= 6) return
                    window.clearTimeout(langt.current)
                    const a = mm(t.x, t.y)
                    const b = mm(e.clientX, e.clientY)
                    if (!a || !b) return
                    const ny = { adr: t.adr, ...snapp(t, b[0] - a[0], b[1] - a[1], stoda().ppm) }
                    draRef.current = ny
                    setDra(ny)
                  }}
                  onPointerUp={(e) => {
                    window.clearTimeout(langt.current)
                    const t = trykk.current
                    const q2 = draRef.current
                    if (t && feillese(t, e.timeStamp)) setMeny(null)
                    // eit slepp som HENDE etter terskelen utan at klokka fekk fyre er eit langt trykk
                    if (t && !t.brukt && !q2 && e.timeStamp - t.tid >= LANGT_MS) {
                      t.brukt = true
                      t.lang = true
                      onPeik(t.adr)
                      setMeny({ adr: t.adr, x: t.x, y: t.y })
                      return
                    }
                    if (!t || t.brukt || !q2) return
                    t.brukt = true
                    // innanfor plata: masken er boksen pluss margen, og kanten er der masken stoggar
                    const marg = Math.max(0, t.boks.x - t.plass.x)
                    flyttDel(t.adr, { sheet: ark.i, rot: t.plass.rot, x: klem(t.plass.x + q2.dx, arkB - (t.boks.w + 2 * marg)), y: klem(t.plass.y + q2.dy, arkH - (t.boks.h + 2 * marg)) })
                  }}
                  onPointerCancel={() => { window.clearTimeout(langt.current); trykk.current = null; draRef.current = null; setDra(null) }}
                  onClick={() => {
                    const t = trykk.current
                    trykk.current = null
                    if (!t || t.brukt) return
                    onPeik(paa ? null : d.adr)
                  }}
                  style={{ cursor: q ? "grabbing" : "grab" }}
                >
                  {/* fyllet er treffeflata, med hòla som hòl — og merket for ein festa del */}
                  <path d={[d.ut, ...d.inn].join(" ")} fillRule="evenodd" style={{ fill: paa ? "color-mix(in srgb, var(--ink) 14%, transparent)" : fast ? "color-mix(in srgb, var(--ink) 9%, transparent)" : "transparent" }} />
                  <path d={d.ut} strokeWidth={paa || q ? 2 : 1} vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: strek }} />
                  {d.inn.map((h, j) => <path key={j} d={h} strokeWidth={paa || q ? 2 : 1} vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: strek }} />)}
                  {/* adressa slik laseren skriv henne — berre når du har klypt deg nærare */}
                  {syn && d.merke && <path d={d.merke} data-merke="" vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: "var(--ink)", opacity: 0.55 }} />}
                  <title>{d.adr}{fast ? " · fast" : ""}{d.kross ? " · ligg i ein annan" : ""}</title>
                  {/* handtaka står berre på den delen du har peikt på: alle
                      spor på alle delar på ein gong er ei plate full av prikkar */}
                  {paa && ppm > 0 && d.spor.map((v) => <Sporende key={v.nokkel} v={v} ppm={ppm} t={sporDra?.nokkel === v.nokkel ? sporDra.t : null} ned={taSpor} />)}
                </g>
              )
            })}
          </g>
        </svg>
      </div>
      {meny && (
        <>
          <div className="fixed inset-0 z-30" onPointerDown={() => setMeny(null)} aria-hidden="true" />
          <div ref={menyRef} className="fixed z-40 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-1.5 rounded-3xl border px-1.5 py-1.5" role="dialog" aria-label={`del ${meny.adr}`} style={{ left: Math.max(12, meny.x - 150), top: Math.max(12, meny.y - 64), background: "var(--paper)", borderColor: "var(--rule)" }}>
            <span className="tab px-1.5 text-[11px]">{meny.adr}</span>
            {[
              { ord: festa.has(meny.adr) ? "slepp" : "fest", paa: festa.has(meny.adr), gjer: () => vipFest(meny.adr), att: true },
              { ord: "snu", paa: false, gjer: () => snuDel(meny.adr), att: false },
              ...((plassAv(meny.adr)?.sheet ?? 0) > 0 ? [{ ord: "førre", tit: "til plata før", paa: false, gjer: () => bytPlate(meny.adr, -1), att: true }] : []),
              { ord: "neste", tit: "til neste plate — forbi den siste er ei ny", paa: false, gjer: () => bytPlate(meny.adr, 1), att: true },
            ].map((v) => (
              <button key={v.ord} type="button" className={CHIP} style={chipStyle(v.paa)} title={"tit" in v ? v.tit : undefined} onClick={() => { v.gjer(); if (v.att) setMeny(null) }}>{v.ord}</button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
