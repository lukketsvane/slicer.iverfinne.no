"use client"

import { Fragment, useEffect, useRef, useState, type JSX, type RefObject } from "react"
import { FARGE_MIN, LAG_FARGAR, MATERIALS, TJUKNER, klokke, lagFarge, nn, type ExportKind, type Kutt, type Material, type Metrics, type ParamBag, type Rule, type Vec3, type View } from "@/lib/core"
import { GROUPS, PARAM_RANGES } from "@/lib/params"
import { MJUK_TAK, type Plan } from "@/lib/plan"
import {
  CHIP, HAIR, ICON_BTN, IcoDown, IcoReset, IcoSliders, IcoUttak, UTTAK,
  SliderRow, Tavla, chipStyle, n0, num, stengd, tjukn,
} from "./deler"
import type { VerktyId } from "./verkty"

/**
 * ARKET. Tre høgder på ein telefon: éi line, midten av jobben, alt. På
 * benken er det ei fast spalte til høgre med det same innhaldet.
 *
 * Lina er det som avgjer om uttaket er verdt å skjere: kor mange plan, kor
 * mange delar, kor mange plater, kor lang tid — og rutenettet og uttaket
 * eitt trykk unna. Sjølve handlinga, skjer, står ikkje her: ho står under høgre
 * tommel, i spalta over arket (sjå studio.tsx). Midten er plana
 * du har låst — berre dei låste; eit skissa plan finst ikkje nokon annan
 * stad enn på lerretet. Alt er resten: materialet, skyvarane, tavla,
 * uttaka, verktya. Fila, lesemåtane, angre og lenkja står i topplina.
 */
export type Steg = "line" | "midt" | "alt"
const STEG: readonly Steg[] = ["line", "midt", "alt"]
export const KOL = 340
/**
 * TOMMELSPALTA EIG DEN HØGRE KANTEN, og ein boks over arket må vike for
 * henne. Skjer er 64 px brei og spalta står 16 frå kanten av ruta, so ho
 * tek dei ytste 80. Arket ligg 12 frå kanten, og då er det 68 att å halde
 * fri langs si eiga høgre side.
 *
 * Utan det la den femte brikka i «rom» seg under skjer: ho stod der, ho
 * var synleg, og eit trykk midt på henne gjekk til kniven. `pnpm panel
 * uttaka` trykkjer på KVAR brikke og fangar det — ei prøve på berre den
 * fyrste ville sagt ja, av di den fyrste står lengst frå spalta.
 */
const TUMME_FRI = 68
/** storleiken står framme; plata står saman med materialet */
const FRAMME = new Set(["storleik", "arkB", "arkH"])

/** kva planet er, lese av normalen: loddrett, vassrett eller skrått, med kursen */
export function kvaSlag(n: Vec3): string {
  const tilt = (Math.asin(Math.min(1, Math.abs(n[2]))) * 180) / Math.PI
  const kurs = (((Math.atan2(n[1], n[0]) * 180) / Math.PI + 360) % 180 + 360) % 180
  if (tilt > 85) return "vassrett"
  if (tilt < 5) return `loddrett ${n0(kurs)}°`
  return `skrå ${n0(tilt)}°/${n0(kurs)}°`
}

export type ArketProps = {
  benk: boolean
  steg: Steg
  onSteg: (s: Steg) => void
  params: ParamBag
  onChange: (p: ParamBag) => void
  /** ein verdi vert dregen: angre ventar til fingeren slepper */
  onSkrubb: (aktiv: boolean) => void
  view: View
  /** kor høg topplina er: kolonna på benken byrjar under henne */
  topp: number
  metrics: Metrics | null
  rules: readonly Rule[]
  /** boksen kring kroppen, i millimeter: der planet står, lese av som eit tal */
  boks: { min: Vec3; max: Vec3 } | null
  liste: readonly Kutt[]
  plan: readonly Plan[]
  vald: number | null
  onVald: (id: number | null) => void
  /** gruppa som er vald, om nokon: trykk på gruppa i lista vel alle plana i henne */
  valdGruppe: number | null
  onVelGruppe: (g: number) => void
  onSlettGruppe: (g: number) => void
  /**
   * MJUKINGA PÅ PROFILEN til det valde planet — eller til heile den valde
   * gruppa. Ho bur i arket og ikkje i tommelspalta: eit TAL høyrer heime på
   * ei rad, saman med laget. Firkanten stod her ved sida av henne og er
   * flytt: han var ei HANDLING på forma, og handlingar bur under tommelen —
   * sjå forma i spalta (`studio.tsx`).
   *
   * Som brøkdel av den lengste sida; rada syner henne i millimeter.
   */
  mjuk: number
  onMjuk: (v: number) => void
  /**
   * VIRRET: kor mange millimeter du har skuva rada ut av lina, denne økta.
   * Berre med ei gruppe vald — ein einsleg plan har ingen line å bryte.
   */
  virr: number
  onVirr: (mm: number) => void
  /** laget (C02–C29) på det valde planet — eller heile den valde gruppa; 0 er ikkje noko lag */
  onFarge: (farge: number) => void
  /** laget på den valde biten, eller null når ingen bit står vald */
  bitFarge: number | null
  onBitFarge: (farge: number) => void
  onSlett: (id: number) => void
  busy: boolean
  feil: string | null
  melding: string | null
  hentar: boolean

  onExport: (k: ExportKind) => void
  onReset: () => void
  verkty: VerktyId | null
  onVerkty: (id: VerktyId) => void
  onHogd: (px: number) => void
}

/** dei fire tala i lina, farga av den harde regelen som dømer kvart av dei */
function Lina({ p }: { p: ArketProps }) {
  const { metrics: m, rules, plan, feil, melding, hentar } = p
  if (feil) return <span style={{ color: "var(--warn)" }}>{feil}</span>
  if (melding) return <span className="opacity-70">{melding}</span>
  if (hentar) return <span className="dim">les …</span>
  if (!m) return <span className="dim">snittar …</span>
  const raud = new Set(rules.filter((r) => !r.ok && r.hard && r.rad).map((r) => r.rad))
  const tal: { id: string; text: string; smal?: boolean }[] = [
    { id: "plan", text: `${plan.length} plan` },
    { id: "delar", text: `${n0(m.parts)} delar` },
    { id: "ark", text: `${n0(m.sheets)} ark` },
    // tida er det fyrste som må vike på ein smal telefon: ho står òg i tavla
    { id: "tid", text: klokke(m.cutTime), smal: true },
  ]
  return (
    <>
      {tal.map((t, i) => (
        <span key={t.id} className={t.smal ? "hidden min-[430px]:inline" : undefined}>
          {i > 0 && <span className="px-0.5 opacity-30">·</span>}
          <span style={raud.has(t.id) ? { color: "var(--warn)" } : { opacity: 0.62 }}>{t.text}</span>
        </span>
      ))}
    </>
  )
}

/** éi rad per låst plan: namn, kva det er, streka handa la i det, ledd (og stykke når det er fleire), og vegen ut.
 *  Tom liste er tom: rettleiinga og snittet seier alt kva som skal til. */
/** Lista står der jamvel når ho er tom: ho er staden plana bur, og ei tom
 *  liste teiknar ingenting likevel. */
function Plana({ p }: { p: ArketProps }) {
  /**
   * EI GRUPPE LIGG BRETTA. Eit rutenett er tretti plan i lista, og lista er
   * det meste av det du ser på ein telefon — so gruppa er si eine rad til
   * du ber om noko anna. Trykket på henne gjer det han alltid har gjort —
   * han TEK henne, so handtaka, pilene, slett og dubler gjeld alle plana i
   * henne — og han brettar henne ut medan han gjer det. Trykk att, og ho
   * vert sleppt og lagd saman.
   *
   * Det du HELD står likevel: planet som er valt er med i lista jamvel om
   * gruppa hans ligg saman, av di lista alltid skal syne kva handa har.
   *
   * Bretten fylgjer trykket og ikkje valet: vel du ei anna gruppe, ligg den
   * fyrste open vidare. Gruppetalet vert aldri brukt om att (`nyGruppe`),
   * so eit tal som ligg att her etter ei sletta gruppe kan aldri treffe ei ny.
   */
  const [utbretta, setUtbretta] = useState<ReadonlySet<number>>(() => new Set())
  const brett = (g: number) => {
    const paa = p.valdGruppe === g
    setUtbretta((s) => {
      const n = new Set(s)
      if (paa) n.delete(g)
      else n.add(g)
      return n
    })
    if (paa) p.onVald(null)
    else p.onVelGruppe(g)
  }
  /** gruppene, i den rekkja dei fyrst syner seg: ei rad over det fyrste planet i kvar */
  const sett = new Set<number>()
  return (
    <ul className="py-1" role="listbox" aria-label="plan">
      {p.plan.map((pl) => {
        const mine = p.liste.filter((k) => k.plan === pl.id)
        const ledd = mine.reduce((a, k) => a + k.joints, 0)
        const paa = p.vald === pl.id
        const iGruppa = !!pl.gruppe && p.valdGruppe === pl.gruppe
        const hovud = pl.gruppe && !sett.has(pl.gruppe) ? pl.gruppe : 0
        if (hovud) sett.add(hovud)
        const tal = hovud ? p.plan.filter((q) => q.gruppe === hovud).length : 0
        const att = !!pl.gruppe && !utbretta.has(pl.gruppe) && !paa
        return (
          <Fragment key={pl.id}>
          {/* GRUPPA SOM RAD: ho ligg saman, og trykket brettar henne ut og
              vel alle plana i henne, med det siste som leiar. Plana hennar
              står inndregne under henne. × tek heile gruppa. */}
          {hovud > 0 && (
            <li
              role="option"
              aria-selected={p.valdGruppe === hovud}
              data-gruppe={hovud}
              className="flex items-center gap-2 rounded-lg px-1.5 text-[11px]"
              style={p.valdGruppe === hovud ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)" } : undefined}
            >
              <button type="button" aria-label={`gruppe ${hovud}`} aria-expanded={utbretta.has(hovud)} title="brett gruppa ut og tak henne: handtaka, pilene, slett og dubler tek alle plana i henne. trykk att slepper henne og legg henne saman att" className="hit flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={() => brett(hovud)}>
                <span className="tab w-6 shrink-0" style={{ color: "var(--ink)" }}>G{hovud}</span>
                <span className="min-w-0 flex-1 truncate">gruppe</span>
                <span className="tab dim shrink-0">· {tal} plan</span>
              </button>
              <button type="button" aria-label={`slett gruppe ${hovud}`} title="ta heile gruppa bort" className="hit dim h-9 w-11 shrink-0" onClick={() => p.onSlettGruppe(hovud)}>
                ×
              </button>
            </li>
          )}
          {!att && (
            <li
              role="option"
              aria-selected={paa}
              data-plan={pl.id}
              className={"flex items-center gap-2 rounded-lg text-[11px] " + (pl.gruppe ? "ml-3 pl-1.5 pr-1.5" : "px-1.5")}
              style={paa ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)" } : iGruppa ? { background: "color-mix(in srgb, var(--ink) 4%, transparent)" } : undefined}
            >
              <button type="button" className="hit flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={() => p.onVald(paa ? null : pl.id)}>
                <span className="tab w-6 shrink-0" style={{ color: "var(--ink)" }}>{pl.id}</span>
                {lagFarge(pl.farge) !== null && <span aria-hidden="true" className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LAG_FARGAR[pl.farge as number] }} />}
                <span className="min-w-0 flex-1 truncate">{kvaSlag(pl.n)}</span>
                {/* KVAR PLANET STÅR, SOM EIT TAL: millimeter frå midten av kroppen,
                    langs normalen. Det er inndata lese av — punktet og normalen
                    planet ER — og ikkje eit mål frå kuttet. Pilene flyttar det
                    éin om gongen, og talet fylgjer. Berre på benken: på
                    telefonen er rada 390 pikslar, og ledda står der alt. */}
                {p.benk && p.boks && (
                  <span className="tab dim shrink-0" title="millimeter frå midten av kroppen, langs normalen. pilene flyttar planet éin om gongen">
                    {fraaMidten(pl, p.boks)}
                  </span>
                )}
                <span className="tab dim shrink-0" style={{ color: mine.length && !ledd ? "var(--warn)" : undefined }} title={`${mine.length} stykke, ${ledd} ledd`}>
                  {mine.length ? `· ${mine.length > 1 ? `${mine.length} stk · ` : ""}${ledd} ledd` : "· utanfor"}
                </span>
                {pl.strek.length > 0 && (
                  <span className="tab dim shrink-0 rounded-full border px-1.5 text-[9px] leading-[14px]" style={HAIR} title="handteikna strek i profilen">{pl.strek.length} strek</span>
                )}
              </button>
              <button type="button" aria-label={`slett plan ${pl.id}`} title="ta planet bort" className="hit dim h-9 w-11 shrink-0" onClick={() => p.onSlett(pl.id)}>
                ×
              </button>
            </li>
          )}
          </Fragment>
        )
      })}
      {p.valdGruppe !== null && <Virret p={p} />}
      {p.vald !== null && <Profilen p={p} />}
      {p.vald !== null && <Laga p={p} />}
    </ul>
  )
}

/**
 * LAGET, SOM EI RAD MED FARGAR. LightBurn sine eigne, C02 til C29, i
 * palettorden — svart og blått er graveringa og kuttet og står ikkje til
 * val. Ringen fyrst er «ikkje noko lag»: kuttet blått som alle andre.
 *
 * Rada står under det valde PLANET, og under den valde BITEN, og ho er den
 * same rada båe stader — av di fargen er den same fargen. Merkjer du ein
 * bit og eit plan med det same laget, høyrer planet til biten og vert
 * skore inne i han åleine; det er heile grunnen til at biten har eit lag i
 * det heile. Med ei gruppe vald gjeld valet heile gruppa.
 */
function Lagrad({ no, ord, tittel, onFarge }: {
  no: number
  /** ordet i margen: kva det er som får laget — og kva rada er, for vaktene */
  ord: string
  /** eitt kort tillegg til kvar farge si forklaring, om det trengst */
  tittel: string
  onFarge: (farge: number) => void
}) {
  return (
    /* ÉI RAD, OG HO RULLAR. Åtte og tjue fargar braut i tre rader og tok
       ein tredjedel av arket for eit val du gjer sjeldan. No er det éi
       line som rullar sidelengs inni seg sjølv: like mange fargar, og
       arket får høgda si attende. Prikkane kunne ikkje krympast i staden
       — tolv pikslar kvar er tolv pikslar med treffesoner som ligg oppå
       kvarandre, og då tek feil farge trykket. */
    <li role="group" aria-label="lag" data-lag={ord} className="flex items-center gap-1 px-1.5 pb-1 pt-0.5">
      <span className="dim w-6 shrink-0 text-[9px] uppercase tracking-[0.12em]">{ord}</span>
      <span className="rull-x flex min-w-0 flex-1 items-center gap-x-0.5 overflow-x-auto overscroll-contain">
        <button type="button" aria-pressed={no === 0} aria-label="ikkje noko lag" title="ikkje noko lag: kuttet er blått som dei andre" onClick={() => onFarge(0)} className="hit flex h-7 w-7 shrink-0 items-center justify-center">
          <span aria-hidden="true" className="block h-4 w-4 rounded-full border-2" style={{ borderColor: no === 0 ? "var(--ink)" : "var(--rule)" }} />
        </button>
        {LAG_FARGAR.map((hex, i) =>
          i < FARGE_MIN ? null : (
            <button key={hex} type="button" aria-pressed={no === i} aria-label={`lag C${String(i).padStart(2, "0")}`} title={`lag C${String(i).padStart(2, "0")} i LightBurn · ${hex}${tittel}`} onClick={() => onFarge(i)} className="hit flex h-7 w-7 shrink-0 items-center justify-center">
              <span aria-hidden="true" className="block h-4 w-4 rounded-full border-2" style={{ background: hex, borderColor: no === i ? "var(--ink)" : "transparent" }} />
            </button>
          ),
        )}
      </span>
    </li>
  )
}

/**
 * VIRRET: RADA UT AV LINA.
 *
 * Eit rutenett er jamt, og jamt er ærleg — men ei rad ribber som står
 * millimeteren jamt er òg ei rad ingen har teke i. Rada her skuvar kvart
 * plan i gruppa langs si eiga normal, med eit hakk som er gjeve av namnet:
 * same planet får same hakket kvar gong, so du kan dra deg attende.
 *
 * Talet er det du har lagt på MEDAN DU STÅR HER, og ikkje noko som ligg i
 * lenkja: det som ligg der er kvar plana står. Difor byrjar rada på null
 * kvar gong du tek ei gruppe — virret er ikkje ei innstilling, det er ei
 * hand som skuvar.
 */
function Virret({ p }: { p: ArketProps }) {
  const S = num(p.params, "storleik", 150)
  return (
    <li role="group" aria-label="virr" data-virr="" className="px-1.5 pt-1">
      <SliderRow
        k="virr"
        r={{ label: "virr", min: 0, max: Math.round(S * 0.12), step: 0.5, unit: "mm" }}
        value={Math.min(Math.round(S * 0.12), p.virr)}
        benk={p.benk}
        onChange={(_, v) => p.onVirr(v)}
        onSkrubb={p.onSkrubb}
      />
    </li>
  )
}

/**
 * PROFILEN: KVA SOM SKJER MED KANTEN FØR SPORA VERT SKORNE.
 *
 * Mjukinga rundar av hakket trekantane i nettet la att, og ho tek heile
 * gruppa når ho er vald, som laget under.
 *
 * Ho står i MILLIMETER her og som ein brøk i strengen: brøken fylgjer
 * kroppen når han vert skalert, og millimeteren er det du ser på plata.
 * Rada er den same skrubbaren som alle andre tal — drag, piler, hjul, og
 * skriving på benken.
 */
function Profilen({ p }: { p: ArketProps }) {
  const S = num(p.params, "storleik", 150)
  const tak = +(MJUK_TAK * S).toFixed(1)
  return (
    <li role="group" aria-label="profil" data-profil="" className="px-1.5 pb-0.5 pt-1">
      {/* INGEN ETIKETT I MARGEN: rada seier «mjuk» sjølv, og eit ord til
          framfor henne er eit ord som berre tek plass — «profil» er seks
          teikn i ein marg som er tre. */}
      <SliderRow
        k="mjuk"
        r={{ label: "mjuk", min: 0, max: tak, step: 0.5, unit: "mm" }}
        value={Math.min(tak, +(p.mjuk * S).toFixed(1))}
        benk={p.benk}
        onChange={(_, v) => p.onMjuk(S > 0 ? v / S : 0)}
        onSkrubb={p.onSkrubb}
      />
    </li>
  )
}

function Laga({ p }: { p: ArketProps }) {
  const leiar = p.plan.find((q) => q.id === p.vald)
  return (
    <Lagrad
      no={lagFarge(leiar?.farge) ?? 0}
      ord="lag"
      tittel={p.valdGruppe !== null ? " · heile gruppa" : ""}
      onFarge={p.onFarge}
    />
  )
}

/** planet sitt punkt, som avstand frå midten av kroppen langs normalen, i millimeter */
function fraaMidten(pl: Plan, b: { min: Vec3; max: Vec3 }): string {
  let d = 0
  for (let a = 0; a < 3; a++) d += (pl.o[a] - 0.5) * (b.max[a] - b.min[a]) * pl.n[a]
  return `${d < -0.05 ? "−" : "+"}${nn(Math.abs(d), 1)} mm`
}

/**
 * UTTAKA: éi rad per bolk, éi brikke per fil, og kva dei to fargane tyder.
 *
 * Bolken står i margen — rom, plate, alt — der skyvargruppene har ordet
 * sitt. Eit dusin brikker på ei line er ein haug du må lesa gjennom kvar
 * gong; tre korte rader med eit ord framfor seg er tre stader å sjå.
 *
 * Fargeforklaringa høyrer til PLATA og står under henne. Ho sat nedst,
 * ved sida av «lagre», og forklarte noko som ikkje stod der.
 */
function Uttaka({ p, onGjort }: { p: ArketProps; onGjort?: () => void }) {
  const { metrics } = p
  return (
    <div className="py-1.5">
      {UTTAK.map((g) => (
        <div key={g.bolk} role="group" aria-label={g.bolk} data-bolk={g.bolk}>
          {/* Ordet står på FYRSTE brikkerada og ikkje midt i bolken: ei rad
              som bryt til to sender eit midtstilt ord ned mellom dei, og
              då peikar det ikkje lenger på noko. Trettan pikslar er halve
              brikkehøgda minus halve ordet. */}
          <div className="flex items-start gap-1.5 py-0.5">
            <span aria-hidden="true" className="dim mt-[13px] w-9 shrink-0 text-[9px] uppercase leading-none tracking-[0.12em]">{g.bolk}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              {g.filer.map((x) => {
                const stopp = stengd(x.id, metrics)
                return (
                  <button key={x.id} type="button" title={stopp || x.hint} disabled={p.busy || stopp !== ""} onClick={() => { p.onExport(x.id); onGjort?.() }} className={CHIP + " uppercase tracking-[0.1em]"} style={{ ...chipStyle(false), opacity: stopp ? 0.3 : undefined, textDecoration: stopp ? "line-through" : undefined }}>
                    {x.label}
                  </button>
                )
              })}
            </span>
          </div>
          {/* svart er C00 i LightBurn og køyrer fyrst: difor graverer det */}
          {g.bolk === "plate" && (
            <span className="dim flex items-center gap-3 pb-0.5 pl-[42px] text-[10px] uppercase tracking-[0.14em]" title="svart graverer, blått kutt. fargen er rekkjefylgja">
              {[["#000000", "graver"], ["#0000ff", "kutt"]].map(([farge, ord]) => (
                // ringen kring prikken: den svarte er ein svart prikk på svart papir når systemet står mørkt
                <span key={ord} className="flex items-center gap-1.5"><span aria-hidden="true" className="block h-[7px] w-[7px] rounded-full border" style={{ background: farge, borderColor: "var(--rule)" }} />{ord}</span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/** alt: material og plate, verdiane, tavla med reglane i, uttaka, verktya. Reglane står HER og i dei raude tala i lina, ikkje i midten. */
function Alt({ p, uttak }: { p: ArketProps; uttak: RefObject<HTMLDivElement | null> }) {
  const { params, onChange, metrics } = p
  const setParam = (k: string, v: number) => onChange({ ...params, [k]: v })
  const naaTjukn = num(params, "tjukn", TJUKNER[0])
  /** bolkane du har bretta saman: overskrifta er knappen, som gruppa i planlista */
  const [bretta, setBretta] = useState<ReadonlySet<string>>(() => new Set())
  const brett = (id: string) =>
    setBretta((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })
  return (
    <>
      {/* materialet og tjukna på éi rad der det er plass, og på to der det ikkje er */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-2">
        {(Object.keys(MATERIALS) as Material[]).map((mk) => (
          <button
            key={mk}
            type="button"
            aria-pressed={params.material === mk}
            aria-label={`materiale: ${MATERIALS[mk].label}`}
            title={MATERIALS[mk].label}
            onClick={() => onChange({ ...params, material: mk })}
            className="hit flex h-9 w-9 shrink-0 items-center justify-center"
          >
            <span aria-hidden="true" className="block h-6 w-6 rounded-full border-2" style={{ backgroundColor: MATERIALS[mk].hex, borderColor: params.material === mk ? "var(--ink)" : "var(--rule)" }} />
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          {TJUKNER.map((t) => (
            <button key={t} type="button" aria-pressed={naaTjukn === t} title={`${tjukn(t)} mm plate`} onClick={() => onChange({ ...params, tjukn: t })} className={CHIP + " tab min-w-[44px] px-2"} style={chipStyle(naaTjukn === t)}>
              {tjukn(t)}
            </button>
          ))}
        </span>
      </div>
      {["arkB", "arkH"].map((k) => (
        <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(params, k, PARAM_RANGES[k].min)} benk={p.benk} onChange={setParam} onSkrubb={p.onSkrubb} />
      ))}
      {/* BOLKANE BRETTAR SEG. Sju overskrifter og tjue skyvarar er meir enn
          ein telefon syner på ein gong, og du arbeider i éin bolk om gongen.
          Overskrifta er knappen: trykk henne, og skyvarane under henne fell
          bort til du trykkjer att. */}
      {GROUPS.map((g) => {
        const keys = g.keys.filter((k) => !FRAMME.has(k))
        if (!keys.length) return null
        const att = bretta.has(g.id)
        return (
          <div key={g.id} className="pt-3">
            <h3>
              <button type="button" aria-expanded={!att} title={att ? `syn ${g.label}` : `brett ${g.label} saman`} onClick={() => brett(g.id)} className="hit dim block w-full pb-0.5 text-left text-[10px] uppercase leading-none tracking-[0.24em]" data-bolk={g.id}>
                {g.label}
              </button>
            </h3>
            {!att && keys.map((k) => (
              <SliderRow key={k} k={k} r={PARAM_RANGES[k]} value={num(params, k, PARAM_RANGES[k].min)} benk={p.benk} onChange={setParam} onSkrubb={p.onSkrubb} />
            ))}
          </div>
        )
      })}
      <div className="mt-3 border-t pt-3" style={HAIR}>
        <Tavla metrics={metrics} rules={p.rules} busy={p.busy} params={params} onChange={onChange} />
      </div>
      <div ref={uttak} className="border-t" style={HAIR}>
        <Uttaka p={p} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 py-1">
        {([["kuttliste", "kuttliste", "kvar del, med adresse, mål og plate"], ["oppsett", "oppsett", "alle innstillingane som tekst"]] as const).map(([id, ord, hint]) => (
          <button key={id} type="button" title={hint} aria-pressed={p.verkty === id} onClick={() => p.onVerkty(id)} className={CHIP + " uppercase tracking-[0.1em]"} style={chipStyle(p.verkty === id)}>
            {ord}
          </button>
        ))}
      </div>
    </>
  )
}

export function Arket(p: ArketProps): JSX.Element {
  const { benk, steg, onSteg, onHogd } = p
  const open = benk || steg !== "line"
  /** uttaka eitt trykk unna: ein liten boks over lina. I «alt» står dei alt i arket, og knappen rullar dit. */
  const [visUttak, setVisUttak] = useState(false)
  const uttak = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!visUttak) return
    const ute = (e: PointerEvent) => { if (!(e.target as Element).closest("[data-uttak]")) setVisUttak(false) }
    const tast = (e: KeyboardEvent) => { if (e.key === "Escape") setVisUttak(false) }
    window.addEventListener("pointerdown", ute, true)
    window.addEventListener("keydown", tast, true)
    return () => { window.removeEventListener("pointerdown", ute, true); window.removeEventListener("keydown", tast, true) }
  }, [visUttak])
  const eksport = () => {
    if (steg === "alt") uttak.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    else setVisUttak((v) => !v)
  }
  // Kor mykje av ruta arket tek, MÅLT: kameraet stiller objektet inn i det
  // som er att. Grovkorna, so ei line til i arket ikkje rykkjer kameraet.
  const el = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const s = el.current
    if (!s || benk) return
    const meld = () => onHogd(Math.round((s.getBoundingClientRect().height + 24) / 40) * 40)
    const ro = new ResizeObserver(meld)
    ro.observe(s)
    meld()
    return () => ro.disconnect()
  }, [onHogd, benk])

  // iOS-ark: dra i hovudlina, opp for meir og ned for mindre
  const drag = useRef<{ y0: number; id: number } | null>(null)
  const [pull, setPull] = useState(0)
  const svelg = useRef(false)
  const stegOm = (dir: 1 | -1) => onSteg(STEG[Math.min(2, Math.max(0, STEG.indexOf(steg) + dir))])
  const dragOpp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    setPull(0)
    const dy = e.clientY - d.y0
    svelg.current = Math.abs(dy) > 12
    if (dy < -34) stegOm(1)
    else if (dy > 34) stegOm(-1)
  }

  const linja = (
    <div className="flex items-center gap-1 px-2 py-2">
      {/* tala fyrst: dei er det lina er til. Skjer og skissebrytaren står i tommelspalta. */}
      <button type="button" onClick={() => !benk && onSteg(open ? "line" : "midt")} className="hit tab min-w-0 flex-1 truncate rounded-lg pl-2 text-left text-[10px] tracking-[0.04em]" aria-label="plan, delar, ark og tid">
        <Lina p={p} />
      </button>

      {!benk && (
        <button type="button" aria-label="eksport" aria-expanded={visUttak} title="uttaka: rom — stl, glb, flat, 3mf, usdz. plate — dxf, svg, ark, png, passprøve. alt og lagre" onClick={eksport} className={ICON_BTN} aria-pressed={visUttak} data-uttak="">
          {IcoUttak}
        </button>
      )}
    </div>
  )

  const midt = (
    <>
      <SliderRow k="storleik" r={PARAM_RANGES.storleik} value={num(p.params, "storleik", 150)} benk={benk} onChange={(k, v) => p.onChange({ ...p.params, [k]: v })} onSkrubb={p.onSkrubb} bi={p.metrics ? `${n0(p.metrics.envX)}×${n0(p.metrics.envY)}×${n0(p.metrics.envZ)}` : undefined} />
      {/* BITEN SITT LAG. Same rada som planet sitt, av di det er den same
          fargen: eit plan merkt likt høyrer til biten og vert skore inne i
          han. Ho står her og ikkje i tommelspalta — spalta er ikon, og eit
          lag er åtte og tjue fargar. */}
      {p.bitFarge !== null && (
        <ul className="pt-1">
          <Lagrad no={p.bitFarge} ord="bit" tittel=" · plan med same laget vert skore inne i denne biten" onFarge={p.onBitFarge} />
        </ul>
      )}
      <Plana p={p} />
    </>
  )

  const fot = (
    <div className="flex items-center gap-1.5 py-1">
      <span className="dim tab text-[10px]">{p.metrics ? `${nn(p.metrics.cutLen / 1000, 1)} m kutt` : ""}</span>
      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={p.onReset} aria-label="attende til standarden" title="attende til standarden. nettet ditt står" className={CHIP} style={chipStyle(false)}>{IcoReset}</button>
        {!benk && (
          <button type="button" aria-expanded={steg === "alt"} aria-label={steg === "alt" ? "færre kontrollar" : "alle kontrollane"} onClick={() => onSteg(steg === "alt" ? "midt" : "alt")} className={CHIP} style={chipStyle(steg === "alt")}>
            {steg === "alt" ? IcoDown : IcoSliders}
          </button>
        )}
      </span>
    </div>
  )

  if (benk) {
    return (
      <aside aria-label="kontrollar" aria-busy={p.busy} className="benk fixed bottom-0 right-0 z-20 flex flex-col border-l" style={{ ...HAIR, top: p.topp, width: KOL, background: "var(--paper)", color: "var(--ink)" }}>
        {linja}
        <div className="rull min-h-0 flex-1 px-3 pb-2">
          {midt}
          <Alt p={p} uttak={uttak} />
        </div>
        <div className="border-t px-3" style={HAIR}>{fot}</div>
      </aside>
    )
  }

  /**
   * UTTAKSBOKSEN STÅR OVER ARKET OG IKKJE INNI DET.
   *
   * Han låg inne i arket, absolutt plassert over toppen av det. Arket
   * klipper: `overflow-x-hidden` gjer at nettlesaren reknar den andre
   * aksen som `auto`, og alt som stikk opp over kanten vert skore bort.
   * Boksen hadde difor plass, mål og knappar — og teikna ingenting. Ei
   * rute du kan måle og ikkje sjå er den verste sorten feil: han syner
   * seg ikkje i eit einaste tal.
   *
   * No er han eit sysken av arket i den same faste ramma, over det.
   * Søvnen tek han med (sjå `.uttak` i globals.css), som han tek alt
   * anna som ikkje er objektet.
   */
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex flex-col items-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      {visUttak && steg !== "alt" && (
        <div
          data-uttak=""
          role="group"
          aria-label="uttak"
          className="uttak ark pointer-events-auto mb-2 min-w-0 max-w-md rounded-2xl border px-3 sm:max-w-xl"
          style={{ ...HAIR, width: "calc(100vw - 24px)", paddingRight: TUMME_FRI, background: "var(--paper)", color: "var(--ink)" }}
        >
          <Uttaka p={p} onGjort={() => setVisUttak(false)} />
        </div>
      )}
      <section
        ref={el}
        aria-label="kontrollar"
        aria-busy={p.busy}
        className="ark pointer-events-auto relative flex min-w-0 max-w-md flex-col overflow-x-hidden rounded-3xl border sm:max-w-xl"
        style={{
          ...HAIR,
          // aldri breiare enn skjermen: ei rad med for lang tekst skal ikkje skuve arket ut av kanten
          width: "calc(100vw - 24px)",
          background: "var(--paper)",
          color: "var(--ink)",
          // taket ligg på ARKET, og trygdesona tel med: summen er taket
          maxHeight: steg === "alt" ? "calc(72dvh - env(safe-area-inset-bottom) - 12px)" : "calc(48dvh - env(safe-area-inset-bottom) - 12px)",
          transform: pull ? `translateY(${pull}px)` : undefined,
        }}
      >
        <div
          className="shrink-0"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => { if (e.pointerType !== "mouse") drag.current = { y0: e.clientY, id: e.pointerId } }}
          onPointerMove={(e) => { const d = drag.current; if (d && e.pointerId === d.id) setPull(Math.max(-26, Math.min(26, (e.clientY - d.y0) * 0.3))) }}
          onPointerUp={dragOpp}
          onPointerCancel={dragOpp}
          onClickCapture={(e) => { if (svelg.current) { svelg.current = false; e.preventDefault(); e.stopPropagation() } }}
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 22%, transparent)" }} />
          {linja}
        </div>
        {open && (
          <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-1">
            {midt}
            {steg === "alt" && <Alt p={p} uttak={uttak} />}
          </div>
        )}
        {open && <div className="shrink-0 px-3 pb-1">{fot}</div>}
      </section>
    </div>
  )
}
