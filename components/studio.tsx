"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { ArkSyn, DetailKey, ExportKind, Kutt, Metrics, ParamBag, Rule, View } from "@/lib/core"
import { KUBE } from "@/lib/sources"
import { hent, lagre } from "@/lib/lagring"
import { VAFFEL } from "@/lib/vaffel/engine"
import type { BuildRes, MaalRes, Req, Res, SynRes } from "@/lib/worker"
import { Verkty, type VerktyId } from "./verkty"
import type { Kandidat } from "@/lib/vaffel/tune"
import { Viewer, type LightDir } from "./viewer"
import { ControlsPanel, type PanelMode } from "./controls-panel"
import type { GestKva, NudgeAxis } from "./gesture-params"
import type { Rute } from "@/lib/ramme"
import { Benk, VEGG } from "./benk"
import { CHIP, VIEWS, chipStyle } from "./deler"

/** kor mange piksel to-fingers-rulling må dra for å sveipe eit heilt band */
const NUDGE_RANGE_PX = 420

/** alt «finn innstillingar» IKKJE rører: endrar noko av dette seg, er eit
 *  hugsa svar eit svar på eit anna spørsmål */
const tuneBase = (p: ParamBag) =>
  // `snitt` står her av di han rører PAKKINGA: luka mellom delane er
  // 2·snitt + 2, og både platetalet og utnyttinga er med i rangeringa. Ei
  // hugsa liste som overlevde ein ny snittbreidd var tolv svar på eit
  // spørsmål som ikkje vart stilt.
  [p.kjelde, p.storleik, p.rotX, p.rotY, p.rotZ, p.glatt, p.trekant, p.tjukn,
   p.klaring, p.snitt, p.arkB, p.arkH, p.lause].join("|")
/** ei fil på meir enn dette er ikkje ein modell, det er eit uhell */
const MAX_FIL = 220 * 1024 * 1024
/** kor mange steg attende du kjem. Fleire enn dette er ikkje ei angring,
 *  det er ein annan dag. */
const ANGRE_DJUPN = 50

/** ruta, i CSS-pikslar */
function useVindu() {
  const [v, setV] = useState({ w: 1280, h: 800 })
  useEffect(() => {
    const sync = () => setV({ w: window.innerWidth, h: window.innerHeight })
    sync()
    window.addEventListener("resize", sync)
    return () => window.removeEventListener("resize", sync)
  }, [])
  return v
}

/**
 * BENKEN.
 *
 * Dei tre høgdene på arket er eit svar på ein telefon. På ein skjerm er
 * svaret at dei forsvinn: det er plass til alt samstundes, og då er kvart
 * steg mellom lukka og ope eit steg som ikkje treng finnast.
 *
 * Terskelen er både peikaren og breidda. Ein pekefinger på eit brett skal
 * ha arket same kor breitt brettet er, av di veggane har knappar for ein
 * peikar; og under tolv hundre piksel er det ikkje plass til to veggar og
 * eit objekt imellom.
 */
function useBenk() {
  const [benk, setBenk] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (min-width: 1180px)")
    const sync = () => setBenk(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return benk
}

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
  const [hiDetail, setHiDetail] = useState(false)
  const [light, setLight] = useState<LightDir>({ az: 0.62, el: 0.92 })
  const [data, setData] = useState<BuildRes | null>(null)
  // Måltala kjem i eiga melding etter nettet, og berre for det siste
  // punktet: under eit drag står den førre tavla dimma til fingeren
  // stoggar, i staden for at kvart einaste mellombilete vert rekna på.
  const [tal, setTal] = useState<MaalRes | null>(null)
  const [syn, setSyn] = useState<SynRes | null>(null)
  /**
   * VERKTYA.
   *
   * Kuttlista, platene og oppsettet er ting du les — ikkje ting du stiller
   * på — og dei treng brei plass. Difor bur dei ikkje i veggane, men i ei
   * skuff som legg seg over lerretet mellom dei, og som er open eller ikkje.
   * Éin om gongen: to opne verkty er to ting som kjempar om det same auget.
   */
  const [verkty, setVerkty] = useState<VerktyId | null>(null)
  /** kuttlista, slik ho står no. Ho kjem med måltala. */
  const [kuttliste, setKuttliste] = useState<Kutt[]>([])
  /** den plata skuffa syner, og teikninga hennar */
  const [ark, setArk] = useState<ArkSyn | null>(null)
  /** adressa peikaren står på, i lista eller i objektet */
  const [peikt, setPeikt] = useState<string | null>(null)
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
  /** heile svarlista, til benken. Ho står til nokon spør om noko anna. */
  const [liste, setListe] = useState<Kandidat[]>([])
  /** kor langt søket er kome, medan det går */
  const [tunar, setTunar] = useState<{ gjort: number; av: number } | null>(null)
  const [drag, setDrag] = useState(false)
  /** kva ein finger held på med akkurat no, til lesing over objektet */
  const [gest, setGest] = useState<GestKva>(null)
  const gestTimer = useRef(0)
  /** Ein gest som melder seg, låser grunnstoda han skal måle frå. */
  const taGest = useCallback((kva: GestKva) => {
    grunn.current =
      kva === null
        ? null
        : {
            storleik: typeof naa.current.storleik === "number" ? naa.current.storleik : 150,
            rotZ: typeof naa.current.rotZ === "number" ? naa.current.rotZ : 0,
          }
    setGest(kva)
  }, [])
  const hintTimer = useRef(0)
  /** ei fil er undervegs inn. Eit skann på hundre megabyte tek fleire
   *  sekund å tolke og sveise, og i dei sekunda står dei gamle tala i
   *  hovudlina og seier noko om eit anna objekt. */
  const [hentar, setHentar] = useState(false)
  /** eit ord attende på noko som elles ikkje synest. Det står i hovudlina
   *  eit lite bel og går av seg sjølv. */
  const [melding, setMelding] = useState<string | null>(null)
  /**
   * EIT ORD, TO GONGER I EI ØKT.
   *
   * Fyrst at fila kan sleppast, av di kuben står der og ingenting seier at
   * han kan bytast ut. So, når fila har landa og fingrane er det einaste
   * som finst: kva to fingrar gjer. Gestane er den raskaste vegen gjennom
   * heile reiskapen og den einaste som ikkje syner seg sjølv.
   */
  const [hint, setHint] = useState<"fil" | "gest" | null>("fil")
  /** kor høgt kontrollarket er, i pikslar. Kameraet stiller objektet inn i
   *  det som er att, so eit ope ark ikkje legg seg over det. */
  const [arkH, setArkH] = useState(0)
  /** id → filnamn, for pilla. Nettet sjølv bur i arbeidaren. */
  const [namn, setNamn] = useState<Record<string, string>>({})
  const isDesktop = useIsDesktop()
  const benk = useBenk()
  const vindu = useVindu()

  /**
   * RUTA, OG KVA SOM LIGG OVER HENNE.
   *
   * To heilt ulike oppsett, eitt tal: kva rektangel objektet har for seg
   * sjølv. På ein telefon er det ruta minus arket nedst; på ein benk er det
   * ruta minus dei to veggane og topplina. Kameraet treng ikkje vita kva
   * for eit av dei det er.
   */
  /**
   * KOR HØG VERKTYSKUFFA ER, I CSS-PIKSLAR.
   *
   * Ei liste og ein tekst vil ha LINER, og fleire liner er berre fleire
   * liner. Ei plate vil ha ei FLATE: ho har eit sideforhold, og ho vert
   * teikna so stor som det trongaste av dei to måla tillet. I ei skuff på
   * ein tredel av ruta stod ei plate på åtte hundre gonger seks hundre som
   * to hundre og nitti pikslar brei, med fem hundre pikslar tomt papir på
   * kvar side — teikninga var høgdebunden, og all breidda i skuffa gjekk
   * til ingenting. Plata får difor meir av ruta enn dei to andre.
   */
  const verktyH = useMemo(
    () =>
      Math.round(
        verkty === "ark"
          ? Math.min(620, Math.max(320, vindu.h * 0.52))
          : Math.min(460, Math.max(240, vindu.h * 0.36)),
      ),
    [vindu.h, verkty],
  )
  const rute: Rute = useMemo(
    () =>
      benk
        ? {
            W: vindu.w,
            H: vindu.h,
            venstre: VEGG.venstre,
            hogre: VEGG.hogre,
            topp: VEGG.topp,
            // Ei open skuff er ei mindre rute, og kameraet rammar inn i
            // det som er att — same mekanismen som arket på telefonen.
            botn: verkty ? verktyH : 0,
          }
        : { W: vindu.w, H: vindu.h, venstre: 0, hogre: 0, topp: 0, botn: arkH },
    [benk, vindu, arkH, verkty, verktyH],
  )

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
      if (!h.startsWith("p=")) {
        /**
         * INGEN LENKJE: TAK DET DU HADDE.
         *
         * Ei lenkje er nokon som seier kva du skal sjå, og då skal ikkje
         * di eiga førre økt overstyre henne. Utan lenkje er det motsett:
         * fana som vart lukka ved eit uhell skal ikkje koste deg
         * arbeidet. Nettet kjem inn den vanlege vegen — gjennom
         * arbeidaren — so det er den same importen som alltid.
         */
        void hent().then((v) => {
          if (!v) return
          setParams((q) => VAFFEL.clamp({ ...v.params, kjelde: KUBE }, q))
          if (!v.nett) return
          setHentar(true)
          const msg: Req = {
            kind: "import",
            id: ++reqId.current,
            name: v.filnamn ?? "nett.stl",
            buf: v.nett,
          }
          worker.current?.postMessage(msg, [v.nett])
        })
        return
      }
      const obj = JSON.parse(decodeURIComponent(h.slice(2))) as Record<string, unknown>
      // Kjelda kan ikkje reise med ei lenkje: nettet er megabyte og ligg
      // berre i den maskina som lasta det opp. Ei lenkje som peikar på ei
      // fil denne nettlesaren ikkje har, fell attende på kuben — og då står
      // alle dei andre innstillingane som dei skal.
      setParams((p) => VAFFEL.clamp({ ...obj, kjelde: KUBE }, p))
      const v = obj.view
      if (v === "lag" || v === "kontur" || v === "flate") setView(v)
    } catch {
      // øydelagd hash — lat standardobjektet stå
    }
  }, [])

  useEffect(() => {
    const w = new Worker(new URL("../lib/worker.ts", import.meta.url), { type: "module" })
    worker.current = w
    /**
     * EIN NY ARBEIDAR ER EIN TOM PORT.
     *
     * Siste-vinn-porten hugsar at det står eit bygg i lufta. Vert
     * arbeidaren bytt ut medan det står der, kjem svaret aldri, og porten
     * står open for alltid: sida melder «snittar …» til nokon lastar
     * henne på nytt.
     *
     * Det er ikkje eit tenkt tilfelle. React monterer alt to gonger i
     * utvikling, og opprydninga i denne effekten avsluttar den fyrste
     * arbeidaren midt i det fyrste bygget — so `pnpm dev` synte «snittar
     * …» og aldri noko meir.
     */
    inFlight.current = false
    pending.current = null
    /**
     * OG EIN ARBEIDAR SOM DØYR SKAL SEIE DET.
     *
     * `onmessage` er den einaste vegen porten vert opna att, so ein
     * arbeidar som ikkje lastar — eit syntaksbrot i ei fil han dreg inn,
     * ein feil MIME-type, minnet som tok slutt — låser reiskapen utan eit
     * ord nokon stad. Det er den same stille døden som Turbopack gjev, og
     * han har fortent den same vakta.
     */
    w.onerror = () => {
      inFlight.current = false
      pending.current = null
      setBusy(false)
      setHentar(false)
      setFeil("motoren stogga. last sida på nytt")
    }
    w.onmessageerror = () => {
      inFlight.current = false
      pump()
    }
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
        setKuttliste(r.liste)
        // fyrst når rekninga for det siste punktet er inne, er motoren ferdig
        if (r.id >= reqId.current) setBusy(false)
        return
      }
      if (r.kind === "prosjekt") {
        // Nettet OG innstillingane i eitt steg: to setParams etter kvarandre
        // ville bygd eit mellombilete som er kjelda utan oppsettet.
        setHentar(false)
        setFeil(null)
        if (r.src) setNamn((m) => ({ ...m, [r.src!.id]: r.src!.label }))
        const kjelde = r.src ? r.src.id : KUBE
        setParams((p) => VAFFEL.clamp({ ...r.params, kjelde }, { ...p, kjelde }))
        setMelding(r.src ? "prosjektet er ope" : "innstillingane er sette")
        return
      }
      if (r.kind === "ark") {
        // `kind` og `id` høyrer til meldinga og ikkje til plata; resten er
        // plata. Ei handskriven liste her hadde alt gløymt eit felt ein
        // gong, og gløymer det neste når det kjem eit til.
        const { kind, id, ...plata } = r
        void kind
        void id
        setArk(plata)
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
        // Nettet er inne. No er det fingrane som gjeld, og dei syner seg
        // ikkje sjølve. Berre der det finst fingrar.
        if (!matchMedia("(pointer: coarse)").matches) return
        setHint("gest")
        window.clearTimeout(hintTimer.current)
        hintTimer.current = window.setTimeout(() => setHint(null), 7000)
        return
      }
      if (r.kind === "feil") {
        // Eit uttak som kasta gjev inga fil. Utan denne greina fall han
        // ned i bygg-greina, som med vilje teier — og då er eit trykk på
        // ein uttaksknapp eit trykk der det ikkje skjer nokon ting.
        if (r.kva === "export") {
          setFeil("uttaket slo feil")
          setBusy(false)
          return
        }
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
        setListe(r.alle)
        if (!r.alle.length) {
          /**
           * EIT SØK UTAN SVAR SEIER BERRE «INGEN».
           *
           * Det stod «fann ingen innstillingar som held», i raudt, i
           * hovudlina, til nokon rørte ein skyvar. Fem ord, og fire av dei
           * var alt på skjermen: knappen heiter «finn innstillingar», so
           * «fann ingen innstillingar» er kommandoen lesen attende med eit
           * nei framfor; og «som held» er ordet frå reglane, som står i
           * tavla i raudt med kvar sin knapp som rettar dei. Setninga sa
           * det tavla sa, utan vegen ut som tavla har.
           *
           * Att står den eine tingen berre søket veit: at det gjekk
           * gjennom rutenetta og ingen av dei kom gjennom. Det er ei
           * MELDING og ikkje ein feil — det seier kommentaren over sjølv,
           * og so gjekk han til `setFeil` likevel: raud, og ståande til
           * neste bygg rydda henne. Ei melding går av seg sjølv.
           */
          setStad(null)
          setMelding("ingen rutenett held")
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

  /**
   * FRÅ EIN PIKSEL TIL EI LINE, OG ATTENDE.
   *
   * Objektet kjenner stykka sine som eit tal — den lina i kuttlista dei
   * vart bygde av. Lista kjenner dei som ei ADRESSE, av di det er adressa
   * som står gravert på plata. Adressa er nøkkelen: ho overlever ei
   * sortering av tabellen, og eit tal gjer ikkje det.
   */
  const peiktIdx = useMemo(
    () => (peikt === null ? -1 : kuttliste.findIndex((k) => k.adr === peikt)),
    [peikt, kuttliste],
  )
  const peikDel = useCallback(
    (i: number) => {
      const adr = i >= 0 ? (kuttliste[i]?.adr ?? null) : null
      setPeikt(adr)
      /**
       * SVARET STÅR DER DU STÅR.
       *
       * Eit trykk på ein del er eit spørsmål om han, og det sende deg
       * ALLTID til kuttlista. Det var rett so lenge plata var eit bilete:
       * det fanst ingenting å peike på der, so lista var det einaste
       * svaret som fanst.
       *
       * No har plata delane sine kvar for seg. Står du i henne og trykkjer
       * på ei ribbe i objektet, er svaret delen som lyser opp på plata —
       * og å rykkje deg over i lista er å ta frå deg det du spurde om.
       * Difor: er eit verkty alt ope, svarar DET. Er ingen open, er lista
       * svaret som før.
       */
      if (adr) setVerkty((v) => v ?? "liste")
    },
    [kuttliste],
  )

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
        "#p=" + encodeURIComponent(JSON.stringify({ ...rest, view })),
      )
    }, 500)
    return () => window.clearTimeout(t)
  }, [params, view, mounted])

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
    // Ei førehandsvising er ikkje ei endring, og ho får ikkje flytte
    // bokføringa heller. Set ein `stodd` til det ein berre ser på, vert
    // det bokført i det ein fer ut av rada att: angre hoppa attende til
    // kandidaten du aldri valde.
    if (forhand.current) return
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
    setHint(null)
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
   * KLYPET OG VRIDINGA MÅLER FRÅ DER GESTEN BYRJA.
   *
   * Fingrane som står tre gonger so langt frå kvarandre skal gje eit objekt
   * som er tre gonger so stort, same kor mange hendingar som kom fram
   * undervegs. Nettlesaren slår saman rørsler når hovudtråden er oppteken,
   * og eit bygg tek hundre millisekund: la ein saman steg for steg, mista
   * ein det som vart slege saman, og den same gesten gav tre gonger den
   * eine gongen og halvanna den neste.
   *
   * Difor hugsar vi kva som stod då gesten byrja, og reknar alltid frå
   * det. Grunnstoda vert sett når gesten melder seg og rydda når han
   * sluttar; sjå `setGest` i onGest.
   */
  const grunn = useRef<{ storleik: number; rotZ: number } | null>(null)

  const skalerObjektet = useCallback((total: number) => {
    if (!Number.isFinite(total) || total <= 0) return
    const g = grunn.current
    if (!g) return
    setHint(null)
    const r = VAFFEL.ranges.storleik
    const v = Math.min(r.max, Math.max(r.min, Math.round((g.storleik * total) / r.step) * r.step))
    setParams((cur) => (cur.storleik === v ? cur : { ...cur, storleik: v }))
  }, [])

  /**
   * VRIDINGA: OBJEKTET SNUR SEG PÅ BORDET.
   *
   * Ribbene fylgjer ikkje med. Dei står i verda, og objektet vender seg
   * inni dei, so du ser med det same om ei anna vending gjev eit betre
   * snitt. Det er den eine tingen ingen skyvar viser deg fort nok.
   */
  const vendObjektet = useCallback((grader: number) => {
    if (!Number.isFinite(grader)) return
    const g = grunn.current
    if (!g) return
    setHint(null)
    setParams((cur) => {
      // Vendinga går rundt: 181 grader er det same som −179.
      const v = ((((Math.round(g.rotZ + grader) + 180) % 360) + 360) % 360) - 180
      return cur.rotZ === v ? cur : { ...cur, rotZ: v }
    })
  }, [])

  /** eitt steg frå tastaturet, utan ein gest kring seg */
  const vendSteg = useCallback((grader: number) => {
    setHint(null)
    setParams((cur) => {
      const at = typeof cur.rotZ === "number" ? cur.rotZ : 0
      const v = ((((Math.round(at + grader) + 180) % 360) + 360) % 360) - 180
      return { ...cur, rotZ: v }
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
    setHint(null)
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

  /**
   * EIT SVAR VALT MED PEIKAREN.
   *
   * Klikk BIND: det er ei endring som vert bokført og som kan angrast.
   * Å stå over ei rad BYGGJER berre: du ser kandidaten på skjermen, og
   * fer du ut att, kjem det du hadde attende. Utan skiljet ville tolv
   * kandidatar vore tolv steg i angrelista, og ingen av dei var noko du
   * bad om.
   */
  const forhand = useRef<ParamBag | null>(null)
  const velSvar = useCallback((i: number) => {
    const cur = finn.current
    if (!cur?.alle.length) return
    forhand.current = null
    cur.nth = i
    setStad({
      nth: i,
      tal: cur.alle.length,
      ribbX: cur.alle[i].ribbX,
      ribbY: cur.alle[i].ribbY,
      base: cur.base,
    })
    setParams((q) => VAFFEL.pick(q, cur.alle, i))
  }, [])

  const synSvar = useCallback((i: number | null) => {
    const cur = finn.current
    if (!cur?.alle.length) return
    if (i === null) {
      const attende = forhand.current
      forhand.current = null
      if (attende) setParams(attende)
      return
    }
    if (!forhand.current) forhand.current = naa.current
    const grunn = forhand.current
    setParams(VAFFEL.pick(grunn, cur.alle, i))
  }, [])

  /**
   * Ei plate til skjermen.
   *
   * Utanom porten, som uttaka: planen er alt rekna, so dette er ei
   * teikning og ikkje ei snitting. Kjem det ei ny måling imellom, byter
   * teikninga seg sjølv ut — det er berre eit bilete.
   */
  const askArk = useCallback((i: number) => {
    const msg: Req = { kind: "ark", id: ++reqId.current, params: naa.current, sheet: Math.max(0, i) }
    worker.current?.postMessage(msg)
  }, [])

  /** Opnar eit verkty, eller lèt det att om det alt stod ope. */
  const opneVerkty = useCallback(
    (id: VerktyId) => {
      setVerkty((v) => (v === id ? null : id))
      if (id === "ark") askArk(0)
    },
    [askArk],
  )

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
    setHint(null)
    if (f.size > MAX_FIL) {
      setFeil("fila er for stor")
      return
    }
    setFeil(null)
    setBusy(true)
    setHentar(true)
    try {
      const buf = await f.arrayBuffer()
      // Ned i basen FØR bufferen vert overført: etterpå er han ikkje her
      // lenger. Ei prosjektfil vert ikkje hugsa som eit nett — ho ER eit
      // oppsett, og oppsettet kjem attende gjennom `prosjekt`-svaret.
      if (!/\.zip$/i.test(f.name)) {
        await lagre({ filnamn: f.name, nett: buf.slice(0) })
      }
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
        vendSteg((k === "," ? -1 : 1) * (e.shiftKey ? 15 : 5))
        setGest("vend")
        window.clearTimeout(gestTimer.current)
        gestTimer.current = window.setTimeout(() => setGest(null), 900)
        return
      }
      if (k === "escape" && verkty) {
        setVerkty(null)
        setHint(null)
        return
      }
      if (k === "l") opneVerkty("liste")
      else if (k === "a") opneVerkty("ark")
      else if (k === "z") angre()
      else if (k === "1") setView("flate")
      else if (k === "2") setView("lag")
      else if (k === "3") setView("kontur")
      else if (k === "o") setMode((m) => (m === "lukka" ? "halv" : "lukka"))
      else if (k === "escape") setMode("lukka")
      else return
      setHint(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [angre, steg, vendSteg, opneVerkty, verkty])

  // Står plateskuffa open og noko flyttar seg, skal teikninga fylgje med.
  // Ho ventar på at motoren er ferdig: `tal` er det siste svaret hans.
  useEffect(() => {
    if (verkty !== "ark") return
    askArk(ark?.i ?? 0)
    // ark.i er med vilje ikkje ei avhengnad: han skal ikkje be om nytt
    // bilete av at han fekk eit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verkty, tal, askArk])

  // Skriv ned innstillingane når dei har fått stå. Same klokka som
  // angrelista bruker: eit drag er hundre punkt og éi endring.
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      const { kjelde, ...rest } = params
      void kjelde
      void lagre({ params: rest as Record<string, number | string> })
    }, 900)
    return () => window.clearTimeout(t)
  }, [params, mounted])

  /**
   * Kor lenge eit ord attende står.
   *
   * To og eit halvt sekund heldt for «lenkja er kopiert» — det er eit
   * kvitteringsord, og du ser på fingeren din når det kjem. Det held ikkje
   * for svaret på eit søk: søket sjølv tek eit par sekund, og eit par
   * sekund er nett lang nok tid til å sjå ein annan veg. Kjem du attende
   * til ei line som alt har gått, ser knappen ut som han ikkje gjorde noko
   * — som er nett det lina fanst for å hindre.
   */
  useEffect(() => {
    if (!melding) return
    const t = window.setTimeout(() => setMelding(null), 4000)
    return () => window.clearTimeout(t)
  }, [melding])

  const endre = useCallback((p: ParamBag) => {
    setHint(null)
    setParams(p)
  }, [])

  const metrics: Metrics | null = tal?.metrics ?? null
  const rules: Rule[] = useMemo(() => tal?.rules ?? [], [tal])
  /** det frie bandet som eit CSS-rektangel, til det som skal stå oppå
   *  lerretet og ikkje bak eit panel */
  const fritt: CSSProperties = benk
    ? { left: VEGG.venstre, right: VEGG.hogre, top: VEGG.topp + 56, bottom: (verkty ? verktyH : 0) + 16 }
    : { left: 0, right: 0, top: 52, bottom: arkH + 24 }

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
            hiDetail={hiDetail && isDesktop}
            rute={rute}
            light={light}
            onNudge={nudge}
            onSkala={skalerObjektet}
            onVend={vendObjektet}
            onLight={nudgeLight}
            onGest={taGest}
            peikt={peiktIdx}
            onPeik={peikDel}
          />
        )}
      </div>

      {/* Eitt ord og ei lenkje. Alt anna sida har å seie, seier objektet.
          På benken bur dei i topplina hans i staden.

          Ordet var «slicer.iverfinne» — halve adressa du alt står på — og
          lenkja ved sida av var «iverfinne.no». Den same adressa to gonger,
          på den einaste lina sida har. Namnet er slicerman; lenkja er han
          som laga han. */}
      {!benk && (
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="tab text-[11px] tracking-[0.14em]" style={{ color: "var(--ink)" }}>
          slicerman
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
      )}

      {/*
        LESEMÅTANE LIGG OPPÅ LERRETET, PÅ BEGGE FLATENE.

        På benken har dei alltid gjort det: dei er eit blikk på det du ser
        og ikkje ein parameter du stiller, og då høyrer dei til objektet og
        ikkje til veggen. På telefonen stod dei nedst i arket og kosta ei
        rad av eit ark som alt tok halve ruta. Her kostar dei ingen ting:
        lerretet er tomt i det hjørnet uansett.

        `fritt` byrjar på 52 px, so dei ligg i overkanten av det bandet
        kameraet rammar objektet inn i — same staden som på benken.
      */}
      {!benk && (
        <div
          className="pointer-events-auto absolute z-10 flex items-center gap-1.5 px-4"
          style={{ left: 0, top: 52 }}
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              title={`${v.hint} (${v.tast})`}
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
              className={CHIP}
              style={{ ...chipStyle(view === v.id), background: view === v.id ? "var(--ink)" : "var(--paper)" }}
            >
              {v.label}
            </button>
          ))}
          {isDesktop && (
            <button
              type="button"
              role="switch"
              aria-checked={hiDetail}
              onClick={() => setHiDetail((d) => !d)}
              title="finare rute i profilane; tyngre å rekne"
              className={CHIP}
              style={{ ...chipStyle(hiDetail), background: hiDetail ? "var(--ink)" : "var(--paper)" }}
            >
              fint nett
            </button>
          )}
        </div>
      )}

      {/*
        KVA FINGRANE GJER, I TAL.
        Ein gest utan tal er ein gest du ikkje kan sikte med: du klyper og
        objektet står like stort på skjermen, av di kameraet rammar det inn
        av seg sjølv. Talet er heile tilbakemeldinga, og det står berre so
        lenge fingrane er nede.
      */}
      {gestTekst && (
        <div
          /**
           * TALET STÅR TIL HØGRE, IKKJE MIDT PÅ.
           *
           * Lesemåtane ligg til venstre i den same lina, og eit tal midt på
           * ei line som byrjar til venstre står ingen stad: det ser ut som
           * det datt dit. I hjørnet til høgre er lina heil — brikkene i den
           * eine enden, talet i den andre — og på benken kjem det på kjøpet
           * at talet ikkje lenger legg seg oppå objektet, som står midt i
           * det same bandet.
           */
          className="pointer-events-none absolute flex justify-end px-4"
          style={fritt}
          aria-hidden="true"
        >
          <span
            className="tab h-fit text-[26px] leading-none tracking-[0.02em]"
            style={{ color: "var(--ink)", opacity: 0.5 }}
          >
            {gestTekst}
          </span>
        </div>
      )}

      {/* Fyrste gongen, og berre då: kuben står der, og ingenting på sida
          seier at han kan bytast ut. Ei line. Ho går i det nokon rører
          noko som helst. */}
      {hint && !drag && (hint === "gest" || kjelde === KUBE) && (
        <div
          className="pointer-events-none absolute flex items-end justify-center px-6"
          style={fritt}
          aria-hidden="true"
        >
          <span
            className="fade-inn text-center text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "var(--ink)", opacity: 0.6 }}
          >
            {hint === "gest" ? "to fingrar: klyp, vri, dra" : "slepp ei fil kvar som helst"}
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

      {benk && (
        <Verkty
          open={verkty}
          liste={kuttliste}
          ark={ark}
          params={params}
          ranges={VAFFEL.ranges}
          keys={VAFFEL.keys}
          clamp={(o, prev) => VAFFEL.clamp(o, prev)}
          peikt={peikt}
          rute={{ venstre: VEGG.venstre, hogre: VEGG.hogre, høgd: verktyH }}
          onArk={askArk}
          onPeik={setPeikt}
          onChange={endre}
          onClose={() => setVerkty(null)}
          onOrd={(t) => {
            void navigator.clipboard
              ?.writeText(t)
              .then(() => setMelding("kuttlista er kopiert"))
              .catch(() => setMelding("fekk ikkje kopiere"))
          }}
        />
      )}

      {benk ? (
        <Benk
          params={params}
          kjelde={kjeldeNamn}
          metrics={metrics}
          rules={rules}
          view={view}
          syn={syn?.svg ?? null}
          hiDetail={hiDetail}
          busy={busy}
          feil={feil}
          hentar={hentar}
          melding={melding}
          tunar={tunar}
          liste={liste}
          paa={finnStad ? finnStad.nth : null}
          gjeld={!!stad && stad.base === tuneBase(params)}
          kanAngre={kanAngre}
          onChange={endre}
          onView={setView}
          onReset={() => endre({ ...VAFFEL.defaults, kjelde: params.kjelde })}
          onAngre={angre}
          onToggleDetail={() => setHiDetail((d) => !d)}
          onExport={doExport}
          onFinn={() => steg(1)}
          onVelSvar={velSvar}
          onSynSvar={synSvar}
          onShare={share}
          onFile={(f) => void takeFile(f)}
          verkty={verkty}
          onVerkty={opneVerkty}
        />
      ) : (
      <ControlsPanel
        params={params}
        kjelde={kjeldeNamn}
        metrics={metrics}
        rules={rules}
        syn={syn?.svg ?? null}
        isDesktop={isDesktop}
        busy={busy}
        feil={feil}
        hentar={hentar}
        melding={melding}
        mode={mode}
        tunar={tunar}
        finnStad={finnStad}
        kanAngre={kanAngre}
        onHogd={setArkH}
        onMode={(m) => {
          setHint(null)
          setMode(m)
        }}
        onChange={endre}
        onReset={() => endre({ ...VAFFEL.defaults, kjelde: params.kjelde })}
        onAngre={angre}
        onExport={doExport}
        onFinn={() => steg(1)}
        onFinnAtt={() => steg(-1)}
        onShare={share}
        onFile={(f) => void takeFile(f)}
      />
      )}
    </main>
  )
}
