"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DetailKey, ExportKind, Metrics, ParamBag, Rule, View } from "@/lib/core"
import { KUBE } from "@/lib/sources"
import { VAFFEL } from "@/lib/vaffel/engine"
import type { BuildRes, MaalRes, Req, Res, SynRes } from "@/lib/worker"
import type { Kandidat } from "@/lib/vaffel/tune"
import { Viewer, type LightDir } from "./viewer"
import { ControlsPanel, type PanelMode } from "./controls-panel"
import type { GestKva, NudgeAxis } from "./gesture-params"
import type { SkalaId } from "@/lib/skala"

/** kor mange piksel to-fingers-rulling må dra for å sveipe eit heilt band */
const NUDGE_RANGE_PX = 420

/** alt «finn innstillingar» IKKJE rører: endrar noko av dette seg, er eit
 *  hugsa svar eit svar på eit anna spørsmål */
const tuneBase = (p: ParamBag) =>
  [p.kjelde, p.storleik, p.rotX, p.rotY, p.rotZ, p.glatt, p.trekant, p.tjukn,
   p.klaring, p.arkB, p.arkH, p.lause].join("|")
/** ei fil på meir enn dette er ikkje ein modell, det er eit uhell */
const MAX_FIL = 220 * 1024 * 1024
/** kor mange steg attende du kjem. Fleire enn dette er ikkje ei angring,
 *  det er ein annan dag. */
const ANGRE_DJUPN = 50

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (min-width: 1024px)")
    const sync = () => setDesktop(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return desktop
}

export function Studio() {
  const [params, setParams] = useState<ParamBag>(() => ({ ...VAFFEL.defaults }))
  // «lag» fyrst: ribbene slik dei faktisk står. Det er dei som ER objektet,
  // og det er dei som skil reiskapen frå ein framsyningsmodell. Nettet du
  // kom med er eit klikk unna.
  const [view, setView] = useState<View>("lag")
  /**
   * NOKO KJENT VED SIDA AV.
   *
   * Ikkje ein parameter. Han rører ikkje ein einaste del, og ein parameter
   * som ikkje rører noko ville lagt seg i nøkkelen til kvart mellombygg og
   * fått motoren til å rekne om att for ingenting. Han er ein lesemåte, som
   * `view`, og han fylgjer lenkja på same viset.
   */
  const [skala, setSkala] = useState<SkalaId>("av")
  const [hiDetail, setHiDetail] = useState(false)
  const [light, setLight] = useState<LightDir>({ az: 0.62, el: 0.92 })
  const [data, setData] = useState<BuildRes | null>(null)
  // Måltala kjem i eiga melding etter nettet, og berre for det siste
  // punktet: under eit drag står den førre tavla dimma til fingeren
  // stoggar, i staden for at kvart einaste mellombilete vert rekna på.
  const [tal, setTal] = useState<MaalRes | null>(null)
  const [syn, setSyn] = useState<SynRes | null>(null)
  const [busy, setBusy] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  // Arket sin tilstand bur her og ikkje i panelet: tastaturet skal kunne
  // opne og lukke han, og ein tilstand to stader er to tilstandar.
  const [mode, setMode] = useState<PanelMode>("lukka")
  /**
   * Svara frå «finn innstillingar», og kor langt ned i lista vi står.
   *
   * `base` er dei parametrane knappen IKKJE rører — nettet, storleiken,
   * tjukna, plata. Endrar du ein av dei, er lista eit svar på eit anna
   * spørsmål, og neste trykk må rekne på nytt.
   *
   * Ein REF og ikkje ein tilstand: to trykk kan lande i same runden, og
   * eit steg som vert rekna av ein gamal kopi går same steget to gonger.
   */
  const finn = useRef<{ base: string; alle: Kandidat[]; nth: number } | null>(null)
  /** det same, men til SKJERMEN: kvar i lista vi står, og kva som kom ut */
  const [stad, setStad] = useState<
    { nth: number; tal: number; ribbX: number; ribbY: number; base: string } | null
  >(null)
  /** kor langt søket er kome, medan det går */
  const [tunar, setTunar] = useState<{ gjort: number; av: number } | null>(null)
  const [drag, setDrag] = useState(false)
  /** kva ein finger held på med akkurat no, til lesing over objektet */
  const [gest, setGest] = useState<GestKva>(null)
  const gestTimer = useRef(0)
  /** ei fil er undervegs inn. Eit skann på hundre megabyte tek fleire
   *  sekund å tolke og sveise, og i dei sekunda står dei gamle tala i
   *  hovudlina og seier noko om eit anna objekt. */
  const [hentar, setHentar] = useState(false)
  /** eit ord attende på noko som elles ikkje synest. Det står i hovudlina
   *  eit lite bel og går av seg sjølv. */
  const [melding, setMelding] = useState<string | null>(null)
  /** fyrste gongen: eit ord om at fila kan sleppast. Det forsvinn i det
   *  nokon rører noko som helst, og kjem aldri att. */
  const [hint, setHint] = useState(true)
  /** kor stor del av ruta kontrollarket dekkjer. Kameraet stiller objektet
   *  inn i det som er att, so eit ope ark ikkje legg seg over det. */
  const [dekke, setDekke] = useState(0)
  /** id → filnamn, for pilla. Nettet sjølv bur i arbeidaren. */
  const [namn, setNamn] = useState<Record<string, string>>({})
  const isDesktop = useIsDesktop()

  const worker = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const shown = useRef(0)
  /** dei parametrane som står NO, lesbare frå ei stabil lukking */
  const naa = useRef(params)
  naa.current = params
  const tunarRef = useRef(false)
  // Siste-vinn-porten: aldri meir enn eitt bygg i lufta. Ein skyvar som
  // vert dregen lagar punkt fortare enn motoren byggjer dei, og utan port
  // stiller kvart einaste mellombilete seg i kø i arbeidaren — som so
  // byggjer nett ingen kjem til å sjå. Med porten vert eit uteståande punkt
  // berre BYTT UT til bygget i lufta er ferdig, og draget går i nøyaktig
  // den takta maskina faktisk klarar.
  const inFlight = useRef(false)
  const pending = useRef<Req | null>(null)
  const pump = useCallback(() => {
    if (inFlight.current || !pending.current) return
    inFlight.current = true
    worker.current?.postMessage(pending.current)
    pending.current = null
  }, [])

  // Hashen er ikkje til å stole på: kvart felt vert lese for seg og klemt
  // inn i sitt eige band av motoren sin eigen clamp, så inga laga lenkje kan
  // skyve NaN eller framande verdiar inn i geometrien.
  useEffect(() => {
    setMounted(true)
    try {
      const h = window.location.hash.slice(1)
      if (!h.startsWith("p=")) return
      const obj = JSON.parse(decodeURIComponent(h.slice(2))) as Record<string, unknown>
      // Kjelda kan ikkje reise med ei lenkje: nettet er megabyte og ligg
      // berre i den maskina som lasta det opp. Ei lenkje som peikar på ei
      // fil denne nettlesaren ikkje har, fell attende på kuben — og då står
      // alle dei andre innstillingane som dei skal.
      setParams((p) => VAFFEL.clamp({ ...obj, kjelde: KUBE }, p))
      const v = obj.view
      if (v === "lag" || v === "kontur" || v === "flate") setView(v)
      const sk = obj.skala
      if (sk === "a4" || sk === "brus" || sk === "eple") setSkala(sk)
    } catch {
      // øydelagd hash — lat standardobjektet stå
    }
  }, [])

  useEffect(() => {
    const w = new Worker(new URL("../lib/worker.ts", import.meta.url), { type: "module" })
    worker.current = w
    w.onmessage = (e: MessageEvent<Res>) => {
      const r = e.data
      if (r.kind === "build") {
        // porten opnar att, og eit venta punkt får gå
        inFlight.current = false
        pump()
        // Eit svar som er eldre enn det sist viste er alltid forelda:
        // meldingane kjem ikkje nødvendigvis i den rekkjefylgja dei vart
        // sende.
        if (r.id < shown.current) return
        shown.current = r.id
        setData(r)
        return
      }
      if (r.kind === "maal") {
        setTal(r)
        // fyrst når rekninga for det siste punktet er inne, er motoren ferdig
        if (r.id >= reqId.current) setBusy(false)
        return
      }
      if (r.kind === "syn") {
        setSyn((prev) => (prev && prev.id > r.id ? prev : r))
        return
      }
      if (r.kind === "kjelde") {
        setNamn((m) => ({ ...m, [r.src.id]: r.src.label }))
        setParams((p) => ({ ...p, kjelde: r.src.id }))
        setFeil(null)
        setHentar(false)
        return
      }
      if (r.kind === "feil") {
        if (r.kva === "import") {
          setFeil(r.kvifor ?? "las ikkje fila")
          setHentar(false)
          setBusy(false)
          return
        }
        if (r.kva === "tune") {
          // Eit søk som kasta må sleppe knappen fri. Elles står vakta som
          // hindrar to søk om gongen for alltid, og knappen gjer ingenting
          // resten av økta — utan at noko har feila for auget.
          tunarRef.current = false
          setTunar(null)
          setFeil("søket slo feil")
          setBusy(false)
          return
        }
        // bygget kasta: slepp porten fri og lat det førre objektet stå
        inFlight.current = false
        pump()
        if (r.id >= reqId.current) setBusy(false)
        return
      }
      if (r.kind === "tunep") {
        // framdrifta kjem medan arbeidaren reknar — sjå TuneProgRes
        setTunar({ gjort: r.gjort, av: r.av })
        return
      }
      if (r.kind === "tune") {
        // Lista vert halden her og ikkje i arbeidaren: andre trykk på
        // knappen skal vera momentant, og då kan han ikkje gå ein tur
        // gjennom ein tråd som held på å snitte.
        tunarRef.current = false
        setTunar(null)
        setBusy(false)
        const base = finn.current?.base ?? ""
        if (finn.current) finn.current.alle = r.alle
        if (!r.alle.length) {
          // Eit søk utan svar er ikkje eit søk som feila: det er eit nett
          // som ikkje kan verte ein vaffel i den plata. Det skal STÅ, elles
          // ser knappen ut som han ikkje verkar.
          setStad(null)
          setFeil("fann ingen innstillingar som held")
          return
        }
        setParams((q) => VAFFEL.pick(q, r.alle, 0))
        setStad({
          nth: 0,
          tal: r.alle.length,
          ribbX: r.alle[0].ribbX,
          ribbY: r.alle[0].ribbY,
          base,
        })
        return
      }
      const blob = r.text
        ? new Blob([r.text], { type: r.mime })
        : new Blob([r.data as ArrayBuffer], { type: r.mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = r.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      setBusy(false)
    }
    return () => {
      w.terminate()
      worker.current = null
    }
    // pump er stabil (useCallback utan avhengnader)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const detail: DetailKey = hiDetail && isDesktop ? "hog" : isDesktop ? "mid" : "lav"

  // To steg: eit grovt nett med det same, det fine når fingeren stoggar.
  // Under eit drag er det grove alt ein rekk å sjå, og det fine ville berre
  // stå i kø og gjere alt tregare. Vert punktet endra før det fine steget
  // fyrer, vert det avlyst av oppryddinga — det er heile logikken.
  //
  // Det GROVE steget låg òg på ei klokke, på fire og tjue millisekund. Ei
  // klokke som vart avlyst av oppryddinga kvar gong punktet flytta seg —
  // og under eit drag flyttar det seg oftare enn det. Klokka fyrte difor
  // aldri: objektet stod bom stille heilt til fingeren slapp. Ho trongst
  // ikkje heller. `pump` held berre EIN førespurnad om gongen og byter
  // ut han som ventar, so arbeidaren kan ikkje druknast uansett kor fort
  // ein dreg.
  useEffect(() => {
    if (!mounted) return
    setBusy(true)
    // Ei feilmelding frå ein import står i hovudlina, PÅ PLASSEN til
    // delar, kutt og ark. Ho vart berre rydda vekk av ein ny import, so
    // ein som prøvde ei Draco-komprimert fil og gav opp mista dei tre
    // tala for resten av økta. Rører du ein skyvar, har du lese henne.
    setFeil(null)
    const enqueue = (d: DetailKey) => {
      const id = ++reqId.current
      pending.current = { kind: "build", id, params, detail: d, view }
      pump()
    }
    enqueue("lav")
    if (detail === "lav") return
    const t = window.setTimeout(() => enqueue(detail), 300)
    return () => window.clearTimeout(t)
  }, [params, detail, view, mounted, pump])

  // URL-en kodar alltid det objektet som står på skjermen — bortsett frå
  // nettet, som ingen URL kan bera.
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      const { kjelde, ...rest } = params
      void kjelde
      window.history.replaceState(
        null,
        "",
        "#p=" + encodeURIComponent(JSON.stringify({ ...rest, view, skala })),
      )
    }, 500)
    return () => window.clearTimeout(t)
  }, [params, view, skala, mounted])

  /**
   * ANGRE.
   *
   * Reiskapen inviterer til å prøve: dra i ein skyvar, trykk på knappen som
   * finn eit anna svar, sveip med to fingrar. Alt det er billig å gjere og
   * dyrt å finne att — punktet du kom frå står ingen stad.
   *
   * Bokføringa ventar med å skrive ned. Eit drag er hundre punkt, og hundre
   * punkt er ikkje hundre endringar; det er éi. Difor vert eit punkt fyrst
   * ført opp når det har fått stå i ein knapp sekund.
   */
  const fortid = useRef<ParamBag[]>([])
  /** det siste punktet som har fått stå lenge nok til å vera ei endring */
  const stodd = useRef<ParamBag | null>(null)
  const [kanAngre, setKanAngre] = useState(false)

  useEffect(() => {
    if (!mounted) return
    if (stodd.current === null) {
      stodd.current = params
      return
    }
    if (stodd.current === params) {
      setKanAngre(fortid.current.length > 0)
      return
    }
    // Det finst noko å gå attende til med det same — sjølv om det ikkje er
    // bokført enno. Sjå `angre`.
    setKanAngre(true)
    const t = window.setTimeout(() => {
      if (stodd.current === null || stodd.current === params) return
      fortid.current.push(stodd.current)
      if (fortid.current.length > ANGRE_DJUPN) fortid.current.shift()
      stodd.current = params
    }, 450)
    return () => window.clearTimeout(t)
  }, [params, mounted])

  const angre = useCallback(() => {
    const no = naa.current
    // Ei endring som ikkje har rukke å verte bokført er framleis ei
    // endring: han som dreg ein skyvar og angrar med det same, vil attende
    // dit han var FØR draget, ikkje eit steg lenger.
    const mal =
      stodd.current !== null && stodd.current !== no ? stodd.current : fortid.current.pop()
    if (!mal) return
    stodd.current = mal
    setKanAngre(fortid.current.length > 0)
    setParams(mal)
  }, [])

  /**
   * Resten som ikkje vart eit heilt steg.
   *
   * Fingeren flyttar seg nokre få pikslar per hending, og eit ribbetal er
   * eit heiltal. Vert kvar hending runda av for seg, er kvar av dei null:
   * seks pikslar er fire tidels ribbe, det rundar til null, og gesten som
   * står i README-en gjorde ingenting. Berre eit rykk stort nok til å
   * krysse ein halv ribbe i EI hending kom gjennom, og då som eit hopp.
   *
   * Difor vert resten liggjande att her til neste hending.
   */
  const rest = useRef<Record<string, number>>({})

  const nudge = useCallback((axis: NudgeAxis, deltaPx: number) => {
    const key = VAFFEL.nudge[axis]
    const r = VAFFEL.ranges[key]
    if (!r) return
    const raa = (deltaPx / NUDGE_RANGE_PX) * (r.max - r.min) + (rest.current[key] ?? 0)
    const steg = r.int ? Math.trunc(raa) : raa
    rest.current[key] = r.int ? raa - steg : 0
    if (steg === 0) return
    setHint(false)
    setParams((cur) => {
      const at = typeof cur[key] === "number" ? (cur[key] as number) : r.min
      const v = Math.min(r.max, Math.max(r.min, at + steg))
      // Ligg han mot ei grense, skal ikkje resten hope seg opp: elles må
      // du dra like langt attende før noko skjer.
      if (v === at) rest.current[key] = 0
      return v === at ? cur : { ...cur, [key]: r.int ? Math.round(v) : +v.toFixed(4) }
    })
  }, [])

  /**
   * KLYPET: STORLEIKEN.
   *
   * Faktoren kjem for kvar hending og vert gonga inn. Resten som ikkje vart
   * eit heilt steg vert liggjande att, akkurat som for ribbetalet: eit klyp
   * er hundre små hendingar, og rundar ein kvar av dei for seg, er kvar av
   * dei null.
   */
  const skalaRest = useRef(0)
  const skalerObjektet = useCallback((faktor: number) => {
    if (!Number.isFinite(faktor) || faktor <= 0) return
    setHint(false)
    const r = VAFFEL.ranges.storleik
    setParams((cur) => {
      const at = typeof cur.storleik === "number" ? cur.storleik : r.min
      const raa = at * faktor + skalaRest.current
      const v = Math.min(r.max, Math.max(r.min, Math.round(raa / r.step) * r.step))
      skalaRest.current = v === at ? 0 : raa - v
      return v === at ? cur : { ...cur, storleik: v }
    })
  }, [])

  /**
   * VRIDINGA: OBJEKTET SNUR SEG PÅ BORDET.
   *
   * Ribbene fylgjer ikkje med. Dei står i verda, og objektet vender seg
   * inni dei, so du ser med det same om ei anna vending gjev eit betre
   * snitt. Det er den eine tingen ingen skyvar viser deg fort nok.
   */
  const vendRest = useRef(0)
  const vendObjektet = useCallback((grader: number) => {
    if (!Number.isFinite(grader)) return
    setHint(false)
    setParams((cur) => {
      const at = typeof cur.rotZ === "number" ? cur.rotZ : 0
      const raa = at + grader + vendRest.current
      const heil = Math.round(raa)
      vendRest.current = raa - heil
      // Vendinga går rundt: 181 grader er det same som −179.
      const v = ((((heil + 180) % 360) + 360) % 360) - 180
      return v === at ? cur : { ...cur, rotZ: v }
    })
  }, [])

  const nudgeLight = useCallback((dx: number, dy: number) => {
    setLight((l) => ({
      az: l.az + dx * 0.012,
      el: Math.min(1.4, Math.max(0.12, l.el - dy * 0.008)),
    }))
  }, [])

  /**
   * FINN INNSTILLINGAR, eitt steg om gongen.
   *
   * Fyrste trykket reknar: eit titals punkt vert snitta for alvor og
   * rangerte, og det beste vert sett. Kvart trykk etterpå går eitt steg i
   * den lista, og det kostar ingenting — lista ligg her.
   *
   * Bakover går berre i ei liste som alt finst. Har du flytta på noko han
   * ikkje rører imens, er lista eit svar på eit anna spørsmål, og han
   * reknar på nytt.
   */
  const steg = useCallback((dir: 1 | -1) => {
    if (tunarRef.current) return
    const base = tuneBase(naa.current)
    const cur = finn.current
    if (cur && cur.base === base && cur.alle.length) {
      const i = (((cur.nth + dir) % cur.alle.length) + cur.alle.length) % cur.alle.length
      cur.nth = i
      setStad({ nth: i, tal: cur.alle.length, ribbX: cur.alle[i].ribbX, ribbY: cur.alle[i].ribbY, base })
      setParams((q) => VAFFEL.pick(q, cur.alle, i))
      return
    }
    // Ingen liste: det finst ikkje noko «førre svar» å gå attende til.
    if (dir < 0) return
    setHint(false)
    setBusy(true)
    tunarRef.current = true
    setTunar({ gjort: 0, av: 0 })
    finn.current = { base, alle: [], nth: 0 }
    // Utanom porten, som uttaka: eit klikk er ikkje ein straum, og eit
    // søk som stod i kø bak eit bygg ville kome fram etter at brukaren
    // hadde gjeve opp.
    const msg: Req = { kind: "tune", id: ++reqId.current, params: naa.current }
    worker.current?.postMessage(msg)
  }, [])

  const doExport = useCallback((what: ExportKind) => {
    setBusy(true)
    // utanom porten: eit klikk, ikkje ein straum — og svaret slepp porten fri
    const msg: Req = { kind: "export", id: ++reqId.current, params: naa.current, what }
    worker.current?.postMessage(msg)
  }, [])

  /**
   * DEL.
   *
   * Ei lenkje som vert lagd på utklippstavla utan eit ord attende er ikkje
   * til å skilje frå ein knapp som ikkje verkar: ingenting rører seg, og
   * du trykkjer ein gong til. Difor eit ord. Delingsarket på telefonen
   * seier frå sjølv, so der treng det ikkje stå noko.
   */
  const share = useCallback(() => {
    const url = window.location.href
    if (navigator.share) {
      void navigator.share({ url })
      return
    }
    void navigator.clipboard
      ?.writeText(url)
      .then(() => setMelding("lenkja er kopiert"))
      .catch(() => setMelding("fekk ikkje kopiere lenkja"))
  }, [])

  /**
   * Fila inn. Ho vert lesen på hovudtråden — det er berre kopiering — og
   * SENDT til arbeidaren, som gjer alt det tunge: tolking, sveis,
   * forenkling. Bufferen vert overført og ikkje kopiert, so eit skann på
   * hundre megabyte kryssar trådgrensa utan at det finst to av det.
   */
  const takeFile = useCallback(async (f: File) => {
    setHint(false)
    if (f.size > MAX_FIL) {
      setFeil("fila er for stor")
      return
    }
    setFeil(null)
    setBusy(true)
    setHentar(true)
    try {
      const buf = await f.arrayBuffer()
      const msg: Req = { kind: "import", id: ++reqId.current, name: f.name, buf }
      worker.current?.postMessage(msg, [buf])
    } catch {
      setFeil("fekk ikkje lese fila")
      setHentar(false)
      setBusy(false)
    }
  }, [])

  // Slepp ei fil kvar som helst på sida. Ein reiskap som krev at du finn
  // ein bestemt firkant å sleppe i, er ein reiskap som ikkje har forstått
  // kva ein drar-og-slepp er.
  useEffect(() => {
    let depth = 0
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return
      e.preventDefault()
      depth++
      setDrag(true)
    }
    const move = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault()
    }
    const out = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDrag(false)
    }
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0]
      if (!f) return
      e.preventDefault()
      depth = 0
      setDrag(false)
      void takeFile(f)
    }
    window.addEventListener("dragenter", over)
    window.addEventListener("dragover", move)
    window.addEventListener("dragleave", out)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragenter", over)
      window.removeEventListener("dragover", move)
      window.removeEventListener("dragleave", out)
      window.removeEventListener("drop", drop)
    }
  }, [takeFile])

  /**
   * TASTANE.
   *
   * Den som kjem att til reiskapen gjer det same kvar gong: hentar, skalar,
   * finn, ser på det, finn eit anna. Med musa er det fire treff på små
   * knappar; med tastaturet er det fire tastar. Dei står nedst i panelet og
   * i kvar sin tooltip, so dei let seg finne utan å gjettast.
   *
   * Eit felt som er teke eig sine eigne tastar: skriv du 150 i storleiken,
   * skal ikkje 1 byte lesemåte.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return
      if (e.altKey) return
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault()
        angre()
        return
      }
      if (e.metaKey || e.ctrlKey) return
      if (k === "f") {
        e.preventDefault()
        steg(e.shiftKey ? -1 : 1)
        return
      }
      // Vending frå tastaturet: styreflata sender aldri ei vriding til
      // sida, so det er komma og punktum som gjer det der.
      if (k === "," || k === ".") {
        vendObjektet((k === "," ? -1 : 1) * (e.shiftKey ? 15 : 5))
        setGest("vend")
        window.clearTimeout(gestTimer.current)
        gestTimer.current = window.setTimeout(() => setGest(null), 900)
        return
      }
      if (k === "z") angre()
      else if (k === "1") setView("flate")
      else if (k === "2") setView("lag")
      else if (k === "3") setView("kontur")
      else if (k === "o") setMode((m) => (m === "lukka" ? "halv" : "lukka"))
      else if (k === "escape") setMode("lukka")
      else return
      setHint(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [angre, steg, vendObjektet])

  useEffect(() => {
    if (!melding) return
    const t = window.setTimeout(() => setMelding(null), 2400)
    return () => window.clearTimeout(t)
  }, [melding])

  const endre = useCallback((p: ParamBag) => {
    setHint(false)
    setParams(p)
  }, [])

  const metrics: Metrics | null = tal?.metrics ?? null
  const rules: Rule[] = useMemo(() => tal?.rules ?? [], [tal])
  const les = (k: string) =>
    String(typeof params[k] === "number" ? Math.round(params[k] as number) : 0)
  const gestTekst =
    gest === "storleik"
      ? `${les("storleik")} mm`
      : gest === "ribber"
        ? `${les("ribbX")} × ${les("ribbY")} ribber`
        : gest === "vend"
          ? `${les("rotZ")}°`
          : null

  const kjelde = String(params.kjelde ?? KUBE)
  const kjeldeNamn = kjelde === KUBE ? "kube" : (namn[kjelde] ?? "nett")

  /**
   * Står svaret framleis?
   *
   * Lista svarar på eitt spørsmål: dette nettet, i den storleiken, i den
   * plata. Og han som les lina skal kunne stole på at det som står der er
   * det som ER sett — so ribbetalet må stemme òg. Skyv nokon ribbene for
   * hand etterpå, er «2 av 13» ei påstand om noko anna enn det på skjermen.
   */
  const finnStad =
    stad &&
    stad.base === tuneBase(params) &&
    stad.ribbX === params.ribbX &&
    stad.ribbY === params.ribbY
      ? stad
      : null

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: "var(--paper)" }}>
      <div className="absolute inset-0">
        {mounted && (
          <Viewer
            data={data}
            view={view}
            material={String(params.material ?? "finer")}
            skala={skala}
            hiDetail={hiDetail && isDesktop}
            dekke={dekke}
            light={light}
            onNudge={nudge}
            onSkala={skalerObjektet}
            onVend={vendObjektet}
            onLight={nudgeLight}
            onGest={setGest}
          />
        )}
      </div>

      {/* Eitt ord og ei lenkje. Alt anna sida har å seie, seier objektet. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="text-[11px] tracking-[0.22em]" style={{ color: "var(--ink)" }}>
          SLICERMAN
        </div>
        <a
          href="https://iverfinne.no"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto text-[11px] tracking-wide opacity-60 hover:opacity-100"
          style={{ color: "var(--ink)" }}
        >
          iverfinne.no
        </a>
      </header>

      {/*
        KVA FINGRANE GJER, I TAL.
        Ein gest utan tal er ein gest du ikkje kan sikte med: du klyper og
        objektet står like stort på skjermen, av di kameraet rammar det inn
        av seg sjølv. Talet er heile tilbakemeldinga, og det står berre so
        lenge fingrane er nede.
      */}
      {gestTekst && (
        <div
          className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+52px)] flex justify-center"
          aria-hidden="true"
        >
          <span
            className="tab text-[26px] leading-none tracking-[0.02em]"
            style={{ color: "var(--ink)", opacity: 0.5 }}
          >
            {gestTekst}
          </span>
        </div>
      )}

      {/* Fyrste gongen, og berre då: kuben står der, og ingenting på sida
          seier at han kan bytast ut. Ei line. Ho går i det nokon rører
          noko som helst. */}
      {hint && !drag && kjelde === KUBE && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+86px)] flex justify-center px-6"
          aria-hidden="true"
        >
          <span
            className="fade-inn text-center text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "var(--ink)", opacity: 0.4 }}
          >
            slepp ei fil kvar som helst
          </span>
        </div>
      )}

      {drag && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--paper) 82%, transparent)" }}
        >
          <div
            className="rounded-2xl border border-dashed px-6 py-4 text-[11px] uppercase tracking-[0.2em]"
            style={{ borderColor: "var(--ink)", color: "var(--ink)" }}
          >
            slepp nettet
          </div>
        </div>
      )}

      <ControlsPanel
        params={params}
        kjelde={kjeldeNamn}
        metrics={metrics}
        rules={rules}
        view={view}
        skala={skala}
        syn={syn?.svg ?? null}
        hiDetail={hiDetail}
        isDesktop={isDesktop}
        busy={busy}
        feil={feil}
        hentar={hentar}
        melding={melding}
        mode={mode}
        tunar={tunar}
        finnStad={finnStad}
        kanAngre={kanAngre}
        onDekke={setDekke}
        onMode={(m) => {
          setHint(false)
          setMode(m)
        }}
        onChange={endre}
        onView={setView}
        onSkala={setSkala}
        onReset={() => endre({ ...VAFFEL.defaults, kjelde: params.kjelde })}
        onAngre={angre}
        onToggleDetail={() => setHiDetail((d) => !d)}
        onExport={doExport}
        onFinn={() => steg(1)}
        onFinnAtt={() => steg(-1)}
        onShare={share}
        onFile={(f) => void takeFile(f)}
      />
    </main>
  )
}
