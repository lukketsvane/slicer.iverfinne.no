"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import type {
  ArkSyn,
  Delplass,
  DetailKey,
  ExportKind,
  Kutt,
  Metrics,
  ParamBag,
  Rule,
  View,
} from "@/lib/core"
import { KUBE } from "@/lib/sources"
import { hent, lagre } from "@/lib/lagring"
import { zip } from "@/lib/zip"
import { VAFFEL, filnamnStamme } from "@/lib/vaffel/engine"
import {
  PARAM_RANGES,
  lesFest,
  lesLaas,
  plasser,
  skrivFest,
  skrivLaas,
} from "@/lib/vaffel/params"
import type { ArkRes, BuildRes, MaalRes, Req, Res, SynRes } from "@/lib/worker"
import { Verkty, type Ribba, type VerktyId } from "./verkty"
import type { Kandidat } from "@/lib/vaffel/tune"
import { Viewer, type LightDir } from "./viewer"
import { ControlsPanel, type PanelMode } from "./controls-panel"
import type { GestKva, NudgeAxis } from "./gesture-params"
import type { Rute } from "@/lib/ramme"
import { Benk, VEGG } from "./benk"
import { CHIP, VIEWS, chipStyle } from "./deler"

/** kor mange piksel to-fingers-rulling må dra for å sveipe eit heilt band */
const NUDGE_RANGE_PX = 420

/**
 * EI FERDIG FIL UT TIL BRUKAREN, same kvar ho vart laga.
 *
 * På ein telefon er nedlastingsmappa ein dårleg stad for ei kuttfil: ho
 * skal til maskina som står ved laseren. Delingsarket kan AirDroppe henne
 * dit, leggje henne i Filer eller sende henne i ei melding, so der det
 * finst fingrar og eit delingsark som tek filer, får arket fila. Ein
 * skjerm med peikar lastar ned som før: der er nedlastingsmappa nett der
 * LightBurn leitar.
 *
 * Seier nokon nei i arket, er det eit svar. Går det gale på annan vis —
 * aktiveringa gjekk ut medan arbeidaren rekna, eller filtypen vart
 * avvist — ligg nedlastinga der som vegen attende.
 */
async function lastNed(blob: Blob, namn: string) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (
    matchMedia("(pointer: coarse)").matches &&
    typeof nav.share === "function" &&
    typeof nav.canShare === "function"
  ) {
    const fil = new File([blob], namn, { type: blob.type })
    if (nav.canShare({ files: [fil] })) {
      try {
        await nav.share({ files: [fil] })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = namn
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * SVG → PNG, gjennom lerretet.
 *
 * Biletet vert lagt på KVITT fyrst. Ein PNG utan botn er gjennomsiktig,
 * og ei kuttfil med svarte strekar på ingenting ser tom ut i alt som
 * viser gjennomsikt som svart — som er dei fleste meldingsappar.
 *
 * `decode()` og ikkje `onload`: ein `Image` som har lasta er ikkje
 * nødvendigvis ferdig tolka, og eit `drawImage` på ein utolka SVG gjev ei
 * blank rute utan at noko feilar.
 */
async function tilPng(svg: string, w: number, h: number): Promise<Uint8Array> {
  const im = new Image()
  im.width = w
  im.height = h
  im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
  await im.decode()
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const x = c.getContext("2d")
  if (!x) throw new Error("ikkje noko lerret")
  x.fillStyle = "#ffffff"
  x.fillRect(0, 0, w, h)
  x.drawImage(im, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"))
  if (!blob) throw new Error("tom png")
  return new Uint8Array(await blob.arrayBuffer())
}

/** alt «finn innstillingar» IKKJE rører: endrar noko av dette seg, er eit
 *  hugsa svar eit svar på eit anna spørsmål */
const tuneBase = (p: ParamBag) =>
  // `snitt` står her av di han rører PAKKINGA: luka mellom delane er
  // 2·snitt + 2, og både platetalet og utnyttinga er med i rangeringa. Ei
  // hugsa liste som overlevde ein ny snittbreidd var tolv svar på eit
  // spørsmål som ikkje vart stilt.
  [p.kjelde, p.storleik, p.rotX, p.rotY, p.rotZ, p.glatt, p.trekant, p.tjukn,
   p.klaring, p.snitt, p.arkB, p.arkH, p.lause].join("|")
/** kor høgt det LUKKA kontrollarket er, med botnmargen sin. Skuffa står
 *  over det på ein telefon, so hovudlina er synleg medan du redigerer. */
const LUKKA_ARK = 84

/** ei fil på meir enn dette er ikkje ein modell, det er eit uhell */
const MAX_FIL = 220 * 1024 * 1024
/** kor mange steg attende du kjem. Fleire enn dette er ikkje ei angring,
 *  det er ein annan dag. */
const ANGRE_DJUPN = 50

/** ruta, i CSS-pikslar */
/**
 * Motoren — og hjelparane hans — er det same skriptet. Webpack kjenner
 * arbeidaren att på nett denne forma, so ho står éin stad.
 */
function nyArbeidar() {
  return new Worker(new URL("../lib/worker.ts", import.meta.url), { type: "module" })
}

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
  /** kor høg skuffa faktisk vart. 0 til ho har målt seg sjølv. */
  const [verktyMaalt, setVerktyMaalt] = useState(0)
  /** kuttlista, slik ho står no. Ho kjem med måltala. */
  const [kuttliste, setKuttliste] = useState<Kutt[]>([])
  /** den plata skuffa syner, og teikninga hennar */
  const [ark, setArk] = useState<ArkSyn | null>(null)
  /** adressa peikaren står på, i lista eller i objektet */
  const [peikt, setPeikt] = useState<string | null>(null)
  /** kva skuffa syner no — lese av `peikDel`, som køyrer utanfor teikninga */
  const verktyRef = useRef<VerktyId | null>(null)
  const arkRef = useRef<ArkSyn | null>(null)
  const askArkRef = useRef((i: number) => {
    void i
  })
  /**
   * DELEVERKTYET: eit langt trykk på ein del, og kva det gjeld.
   *
   * Han står der fingeren står og ikkje i ein vegg: det du held på er det
   * han handlar om, og ein meny i den andre enden av skjermen krev at du
   * hugsar kva du peika på medan du fer dit.
   */
  const [delVerkty, setDelVerkty] = useState<{
    adr: string
    x: number
    y: number
    /**
     * Han vart opna PÅ PLATA. Då er handlingane feste og snu, og ikkje
     * ribbehandlingane: ein del på ei plate har ingen naboribbe å kopiere
     * seg til.
     *
     * Berre eit ja, og ikkje plasseringa sjølv: ho stod her som ein kopi
     * teken i det trykket kom, og eit «snu» etter eit «snu» las den gamle.
     * Kvar delen står NO, veit festa i parametrane og plata — sjå
     * `plassAv`.
     */
    plate?: boolean
  } | null>(null)
  const delVerktyRef = useRef<HTMLDivElement | null>(null)
  const [busy, setBusy] = useState(true)
  /** nummeret på det siste BYGGET — sjå `maal` nedanfor */
  const sisteBygg = useRef(0)
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
  const finn = useRef<{ base: string; alle: Kandidat[]; nth: number; djup: boolean } | null>(null)
  /** arbeidarane som snittar for djupsøket saman med motoren — sjå `steg` */
  const hjelparar = useRef<Worker[] | null>(null)
  /** det same, men til SKJERMEN: kvar i lista vi står, og kva som kom ut */
  const [stad, setStad] = useState<
    {
      nth: number
      tal: number
      ribbX: number
      ribbY: number
      base: string
      /** svaret sjølv, so lina kan seie kva det er og ikkje berre kvar det står */
      svar: Kandidat
    } | null
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
  /** kjelda, og namnet ho går under. Dei står HER av di PNG-uttaket
   *  namngjev filene sine etter dei, og det er definert lenger nede. */
  const kjelde = String(params.kjelde ?? KUBE)
  const kjeldeNamn = kjelde === KUBE ? "kube" : (namn[kjelde] ?? "nett")
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
  /**
   * KOR HØG SKUFFA ER — OG PÅ EIN TELEFON ER ho nesten alt.
   *
   * På benken er ho ei skuff: ho tek nedre halvdel, objektet står over, og
   * du les lista MEDAN du ser på det ho peikar på. Det er heile grunnen til
   * at ho ikkje er eit vindauge.
   *
   * På ein telefon finst ikkje det valet. Ei skuff på ein tredel av ein
   * telefon er tolv ribber du må rulle i eit hol, over eit objekt som er
   * for lite til å peike på. So der er ho ei SIDE: ho tek alt over den
   * lukka kontrollina, og du er anten i objektet eller i verktyet.
   */
  const verktyH = useMemo(
    () =>
      Math.round(
        !benk
          ? Math.max(240, vindu.h - 128 - LUKKA_ARK)
          : verkty === "ark"
            ? Math.min(620, Math.max(320, vindu.h * 0.52))
            : Math.min(460, Math.max(240, vindu.h * 0.36)),
      ),
    [benk, vindu.h, verkty],
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
            // KOR HØG SKUFFA FAKTISK VART, og ikkje kor høg ho fekk lov
            // til å verte. Ei kuttliste med tre rader i tok heile taket
            // sitt, og objektet vart pressa opp i eit band det ikkje
            // trong. Skuffa måler seg sjølv; sjå `onHogd` i verkty.tsx.
            botn: verkty ? Math.min(verktyH, verktyMaalt || verktyH) : 0,
          }
        : {
            W: vindu.w,
            H: vindu.h,
            venstre: 0,
            hogre: 0,
            topp: 0,
            // På telefonen ligg skuffa OVER det lukka arket, so ho tek
            // over som det som dekkjer nedre kant.
            botn: verkty ? LUKKA_ARK + Math.min(verktyH, verktyMaalt || verktyH) : arkH,
          },
    [benk, vindu, arkH, verkty, verktyH, verktyMaalt],
  )

  const worker = useRef<Worker | null>(null)
  const reqId = useRef(0)
  /** importar som ber eit nett som HØYRER til oppsettet som alt står. Sjå
   *  `kjelde`-greina: alle andre importar reinsar låsane og festa. */
  const attende = useRef(new Set<number>())
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
          // Dette nettet HØYRER til oppsettet som nettopp vart sett. Det er
          // den same importen som alltid — arbeidaren veit ingen skilnad —
          // men svaret skal ikkje reinse låsane, av di dei er skrivne for
          // nettopp dette nettet. Sjå `kjelde`-greina.
          attende.current.add(msg.id)
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
    const w = nyArbeidar()
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
        // Fyrst når rekninga for det SISTE BYGGET er inne, er motoren
        // ferdig. Og det er bygget som gjeld, ikkje den siste meldinga:
        // teljaren er felles for alt som går til arbeidaren, so eit spørsmål
        // om ei plate — som er det å opne skuffa er — la seg forbi bygget
        // som gjekk. Målinga kom då med eit lågare nummer enn teljaren, og
        // «reknar» stod på til noko anna endra seg. Målt: dra ein skyvar og
        // opne plata med det same, og prikken går aldri av.
        if (r.id >= sisteBygg.current) setBusy(false)
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
        // PNG-uttaket ber om kvar plate etter tur og ventar på henne. Dei
        // platene skal IKKJE bytast inn i skuffa undervegs: du står og ser
        // på plate to, og uttaket ville bladd deg gjennom heile bunken.
        const vent = arkVent.current.get(r.id)
        if (vent) {
          arkVent.current.delete(r.id)
          vent(r)
          return
        }
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
        /**
         * EIT NYTT NETT TEK LÅSANE OG FESTA MED SEG UT.
         *
         * Båe er svar om DEN KROPPEN DU HADDE, og han er borte.
         *
         * Ein lås er ein brøkdel av spennet til kroppen. Seks brøkar
         * skrivne for ein hest tyder seks heilt andre plan i ein stol, og
         * dei står der utan at noko på skjermen seier kvifor: du slepper
         * inn ei fil, trykkjer finn, og får eit rutenett som ikkje er det
         * jamne — av di det ligg gamle tal i det.
         *
         * Eit feste er ei adresse på ei plate. «X1» finst i kvart einaste
         * objekt, so festet råkar alltid noko — berre aldri den delen det
         * var meint for. Pakkinga klemmer han inn på plata og legg han
         * der, og det er eit stykke som ligg ein tilfeldig stad av ein
         * grunn ingen kan sjå.
         *
         * TO IMPORTAR SOM IKKJE ER NYE NETT går fri. Prosjektfila går ei
         * anna grein heilt — der vart nettet og oppsettet lagra I LAG. Den
         * hugsa økta går derimot GJENNOM denne: ho set oppsettet og sender
         * so nettet inn den vanlege vegen, og det nettet er nettopp det
         * låsane vart skrivne for. `attende` er dei importane.
         */
        const eiga = attende.current.delete(r.id)
        setParams((p) =>
          eiga ? { ...p, kjelde: r.src.id } : { ...p, kjelde: r.src.id, laas: "", fest: "" },
        )
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
        if (r.id >= sisteBygg.current) setBusy(false)
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
          svar: r.alle[0],
        })
        return
      }
      const blob = r.text
        ? new Blob([r.text], { type: r.mime })
        : new Blob([r.data as ArrayBuffer], { type: r.mime })
      void lastNed(blob, r.name)
      setBusy(false)
    }
    return () => {
      w.terminate()
      hjelparar.current?.forEach((h) => h.terminate())
      hjelparar.current = null
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
  /**
   * PLATA FYLGJER DEN DU VEL.
   *
   * Ei ribbe vald i modellen eller i kuttlista er eit spørsmål om HAN, og
   * svaret er delen som lyser opp på plata. Men skuffa syner éi plate om
   * gongen, og delen kan liggje på ei anna: då peika du på noko og
   * ingenting hende — plata stod med tolv andre delar, og ingen av dei
   * var din.
   *
   * Det står HER, i valet, og ikkje i ein effekt som ser på kva som er
   * vald. Ein effekt måtte lese plata av kuttlista kvar gong noko rørte
   * seg, og lista er eit steg etter parametrane: flyttar du ein del til
   * neste plate, seier ho framleis den gamle, og effekten bladar deg
   * attende dit delen ikkje er. Her er lista og nummeret det same
   * oppslaget, so dei kan ikkje vera usamde.
   *
   * Og handa rår over resten: bladar du sjølv i bunken, med ein del vald,
   * vert du ståande.
   */
  const peikDel = useCallback(
    (i: number) => {
      const adr = i >= 0 ? (kuttliste[i]?.adr ?? null) : null
      setPeikt(adr)
      const paa = i >= 0 ? kuttliste[i]?.ark : undefined
      if (adr && paa && verktyRef.current === "ark" && arkRef.current && arkRef.current.i !== paa - 1) {
        askArkRef.current(paa - 1)
      }
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

  /**
   * FRÅ EI ADRESSE TIL EI RIBBE.
   *
   * Adressa som står gravert er «X3» — akse og NUMMER, frå éin. Resten er
   * eit oppslag: `plasser` svarar på nøyaktig det same rutenettet spør han
   * om, so hovudtråden reknar ikkje geometri, han slår opp i henne.
   *
   * INDEKSEN OG IKKJE BERRE BRØKEN. Ein fri ribbe står på 0,0833333…, og
   * brøken vi låser er den avrunda 0,0833. Dei to er ikkje det same talet,
   * so eit `indexOf` på brøken finn ingen ting — og «kopier» ville ikkje
   * funne naboen sin. Plassen i lista er eintydig; brøken er han ikkje.
   */
  const ribbene = useCallback(
    (akse: "x" | "y", p: ParamBag) =>
      plasser(Number(p[akse === "x" ? "ribbX" : "ribbY"]) || 1, lesLaas(String(p.laas ?? ""))[akse]),
    [],
  )

  const ribbaTil = useCallback(
    (adr: string, p: ParamBag = naa.current) => {
      const m = /^([XY])(\d+)/.exec(adr)
      if (!m) return null
      const akse = m[1].toLowerCase() as "x" | "y"
      const alle = ribbene(akse, p)
      const i = Number(m[2]) - 1
      return alle[i] === undefined
        ? null
        : { akse, i, alle, t: +alle[i].toFixed(4), nokkel: akse === "x" ? "ribbX" : "ribbY" }
    },
    [ribbene],
  )

  /** står denne ribba fast? */
  const erLaast = useCallback(
    (adr: string) => {
      const q = ribbaTil(adr, params)
      return !!q && lesLaas(String(params.laas ?? ""))[q.akse].includes(q.t)
    },
    [params, ribbaTil],
  )

  /**
   * EI NY LÅSELISTE FOR EI AKSE.
   *
   * Kanten fell ut: ei ribbe på 0 eller 1 er ei ribbe med null breidd.
   * Dublettar fell ut. Resten står sortert, so strengen er den same same
   * kva rekkjefylgje han vart bygd i.
   */
  const medLaas = useCallback(
    (cur: ParamBag, akse: "x" | "y", f: (l: number[]) => number[]) => {
      const l = lesLaas(String(cur.laas ?? ""))
      l[akse] = [...new Set(f(l[akse]).map((t) => +t.toFixed(4)))]
        .filter((t) => t > 0 && t < 1)
        .sort((a, b) => a - b)
      return skrivLaas(l)
    },
    [],
  )

  const RIBB_MAX = 32

  /**
   * Å RØRE ÉI RIBBE ER Å LÅSE DEI ANDRE.
   *
   * Ein FRI ribbe har ingen eigen plass. Han finst berre som «den fjerde
   * av seks jamne», og den plassen er ei rekning på talet: går talet opp,
   * flyttar han seg. Det er heile poenget med frie ribber, og det er
   * grunnen til at ingen av dei kan rørast for seg sjølv.
   *
   * So det fyrste kvar redigering gjer, er å skrive ned kvar heile
   * stabelen står. Etterpå er han eksplisitt, og då — og berre då — tyder
   * «flytt denne» noko som ikkje òg flyttar dei andre.
   *
   * `slettRibbe` har alltid gjort dette; her står det éin stad, av di
   * flytte, slette og kopiere alle treng det same.
   */
  const laasStabelen = useCallback(
    (cur: ParamBag, akse: "x" | "y") => medLaas(cur, akse, () => ribbene(akse, cur)),
    [medLaas, ribbene],
  )

  /**
   * LÅS, ELLER SLEPP.
   *
   * Alle fire handlingane går gjennom `setParams` som alt anna: dei legg
   * seg i angrestabelen, i lenkja og i prosjektfila utan ei line til.
   */
  const vipLaas = useCallback(
    (adr: string) => {
      setHint(null)
      setParams((cur) => {
        const q = ribbaTil(adr, cur)
        if (!q) return cur
        return {
          ...cur,
          laas: medLaas(cur, q.akse, (l) =>
            l.includes(q.t) ? l.filter((v) => v !== q.t) : [...l, q.t],
          ),
        }
      })
    },
    [ribbaTil, medLaas],
  )

  /**
   * KOPIER: EI RIBBE TIL, MIDT IMELLOM DENNE OG NABOEN.
   *
   * Ho vert LÅST med det same, og den ho vart kopiert frå òg. Elles ville
   * dei to vore frie plassar som fordelte seg på nytt i same augeblinken
   * talet gjekk opp, og kopien hamna ein annan stad enn der du bad om
   * henne.
   */
  const kopierRibbe = useCallback(
    (adr: string) => {
      setHint(null)
      setParams((cur) => {
        const q = ribbaTil(adr, cur)
        if (!q || q.alle.length >= RIBB_MAX) return cur
        const hogre = q.alle[q.i + 1]
        const venstre = q.alle[q.i - 1]
        // Midt imellom naboen. Er det ingen nabo på den sida, går ho like
        // langt ut som ho har til kanten.
        const ny =
          hogre !== undefined
            ? (q.alle[q.i] + hogre) / 2
            : venstre !== undefined
              ? (q.alle[q.i] + venstre) / 2
              : q.alle[q.i] / 2
        return {
          ...cur,
          [q.nokkel]: q.alle.length + 1,
          laas: medLaas(cur, q.akse, (l) => [...l, q.t, ny]),
        }
      })
    },
    [ribbaTil, medLaas],
  )

  /** SPEGL: den same ribba på hi sida av midten. */
  const speglRibbe = useCallback(
    (adr: string) => {
      setHint(null)
      setParams((cur) => {
        const q = ribbaTil(adr, cur)
        if (!q || q.alle.length >= RIBB_MAX) return cur
        const spegla = +(1 - q.alle[q.i]).toFixed(4)
        // Står det alt ei ribbe der, er spegelbiletet alt på plass.
        if (q.alle.some((t) => Math.abs(t - spegla) < 0.005)) return cur
        return {
          ...cur,
          [q.nokkel]: q.alle.length + 1,
          laas: medLaas(cur, q.akse, (l) => [...l, q.t, spegla]),
        }
      })
    },
    [ribbaTil, medLaas],
  )

  /**
   * SLETT: denne ribba vekk, og dei andre står der dei står.
   *
   * Ein fri ribbe kan ikkje fjernast for seg sjølv — han finst berre som
   * «ein av seks jamne», og eit lågare tal ville flytta alle saman. Difor
   * vert dei andre LÅSTE der dei står i det same steget. Det er den einaste
   * lesinga av «slett denne» som lèt resten av stabelen vera i fred.
   */
  const slettRibbe = useCallback(
    (adr: string) => {
      setHint(null)
      setParams((cur) => {
        const q = ribbaTil(adr, cur)
        if (!q || q.alle.length <= PARAM_RANGES.ribbX.min) return cur
        const att = q.alle.filter((_, j) => j !== q.i)
        return {
          ...cur,
          [q.nokkel]: att.length,
          laas: medLaas(cur, q.akse, () => att),
        }
      })
    },
    [ribbaTil, medLaas],
  )

  /**
   * KOR BREIDT SPENNET RIBBENE ER FORDELTE OVER ER, I MILLIMETER.
   *
   * Ein lås er ein BRØKDEL av det spennet, og det er rett: dreg du
   * storleiken, skal ribba bli verande der ho står PÅ KROPPEN og ikkje der
   * ho står på bordet. Men ingen byggjer i brøkdelar, og ein stabeleditor
   * som seier «0,4167» er ikkje ein reiskap, han er ei feilsøking.
   *
   * Spennet er ikkje `envX`. Det ytremålet er det FERDIGE objektet sitt, og
   * det krympar inn til der det står gods; ribbene er fordelte over
   * KROPPEN sitt eige spenn, og på ei form som ikkje fyller boksen sin er
   * dei to ulike tal. Ei line passa til feil spenn ser rett ut og er nokre
   * millimeter feil i kvar einaste rad.
   *
   * So det vert lese av fasiten. Kuttlista ber no kvar del si eiga
   * plassering, og plasseringa er `min + t · vidd` — ei RETTLINE. To ribber
   * med kjend plass gjev stigninga hennar, og alle dei andre ligg på henne,
   * òg dei som ikkje råka kroppen og difor ikkje har ein einaste del.
   *
   * To ribber trengst. Er det berre éi — eller ingen — finst det inga line
   * og ingen millimeter å syne. Botnen på skyvaren er to, so det er ein
   * tilstand du berre kjem i medan ei fil vert lesen.
   */
  const skala = useMemo(() => {
    const ut: Record<"x" | "y", { vidd: number } | null> = { x: null, y: null }
    for (const akse of ["x", "y"] as const) {
      const alle = ribbene(akse, params)
      const stor = akse.toUpperCase()
      /** fyrste og siste ribbe som HAR ein del, med brøken sin */
      let a: { t: number; mm: number } | null = null
      let b: { t: number; mm: number } | null = null
      for (const k of kuttliste) {
        const m = new RegExp(`^${stor}(\\d+)`).exec(k.adr)
        if (!m) continue
        const t = alle[Number(m[1]) - 1]
        if (t === undefined) continue
        if (!a || t < a.t) a = { t, mm: k.pos }
        if (!b || t > b.t) b = { t, mm: k.pos }
      }
      if (!a || !b || Math.abs(b.t - a.t) < 1e-6) continue
      ut[akse] = { vidd: (b.mm - a.mm) / (b.t - a.t) }
    }
    return ut
  }, [kuttliste, params, ribbene])

  /**
   * FLYTT: sett ribba der du vil ha henne, i millimeter.
   *
   * Dette er verbet som mangla. Ein lås heldt ei ribbe i ro, og det er
   * halve saka — «i ro» er ikkje det same som «her». Utan ein måte å
   * SETJE plassen på, var det einaste nokon kunne byggje for hand det
   * rutenettet reiskapen alt hadde gjeve dei, med nokre ribber fjerna.
   *
   * Han låser heile stabelen fyrst. Sjå `laasStabelen`: utan det ville ei
   * flytt av ei fri ribbe fordelt dei andre på nytt, av di brøken ho fekk
   * krev ein av dei jamne plassane og dei andre fyller resten.
   *
   * NABOANE SET GRENSA, og ho er fysisk: to ribbeplan nærare kvarandre enn
   * ei platetjukn er to plater som står i kvarandre. Han stoggar der i
   * staden for å avvise — ein skyvar som stoggar mot ein vegg fortel kvar
   * veggen er, medan eit tal som ikkje tek berre ser ut som ein feil.
   *
   * Millimeteren er frå KANTEN av kroppen, den same lesinga stabelen syner.
   * Sjå kommentaren der.
   */
  const flyttRibbe = useCallback(
    (adr: string, mm: number) => {
      setHint(null)
      setParams((cur) => {
        const q = ribbaTil(adr, cur)
        const s = skala[q?.akse ?? "x"]
        if (!q || !s || !Number.isFinite(mm) || Math.abs(s.vidd) < 1e-6) return cur
        const t = mm / s.vidd
        const luft = Math.abs((Number(cur.tjukn) || 3) / s.vidd)
        const lo = (q.alle[q.i - 1] ?? -luft) + luft
        const hi = (q.alle[q.i + 1] ?? 1 + luft) - luft
        // Ei ribbe på 0 eller 1 er ei ribbe med null breidd, og `lesLaas`
        // ville kasta henne på golvet. Er det ikkje plass mellom naboane,
        // står ho der ho står.
        const ny = +Math.min(Math.max(t, lo), hi).toFixed(4)
        if (!Number.isFinite(ny) || ny <= 0 || ny >= 1) return cur
        const att = q.alle.map((v, j) => (j === q.i ? ny : v))
        return {
          ...cur,
          [q.nokkel]: att.length,
          laas: medLaas(cur, q.akse, () => att),
        }
      })
    },
    [ribbaTil, medLaas, skala],
  )

  /**
   * HEILE AKSEN: LÅS ALT, ELLER SLEPP ALT.
   *
   * «Lås alt» er steget frå eit rutenett reiskapen fann til ein stabel du
   * eig: etterpå står kvar ribbe der ho står, og skyvaren legg nye til i
   * staden for å skuve dei du har. «Slepp alt» er vegen attende, og han er
   * det same som «fordel jamt» — ein stabel utan låsar ER den jamne
   * fordelinga, og det er ikkje to funksjonar.
   */
  const laasAkse = useCallback(
    (akse: "x" | "y", paa: boolean) => {
      setHint(null)
      setParams((cur) => ({
        ...cur,
        laas: paa ? laasStabelen(cur, akse) : medLaas(cur, akse, () => []),
      }))
    },
    [laasStabelen, medLaas],
  )

  /**
   * HEILE STABELEN, SLIK VERKTYET SER HAN.
   *
   * Éi rad per PLAN og ikkje per stykke. Kuttlista tel stykke — ei ribbe
   * gjennom fire bein er fire liner der — og stabelen redigerer planet dei
   * fire ligg i. Difor vert lista lagd opp av `plasser`, som er fasiten på
   * kva plan som finst, og stykka vert talde opp mot henne.
   *
   * MILLIMETERANE ER FRÅ KANTEN AV KROPPEN, og ikkje frå origo.
   *
   * Modellen sine eigne koordinatar har null i midten — objektet står
   * sentrert på golvet — so ei ribbe der kom ut som «−62,5 mm». Det er det
   * sanne talet, og det er ikkje eit tal nokon byggjer etter: den som set
   * ei ribbe seier «tolv og ein halv frå enden». Difor vert kanten null, og
   * bandet er 0 til spennet. Brøken under er den same brøken som før — det
   * er berre lesinga som byrjar ein annan stad.
   *
   * BANDET ER NABOANE, og det er rekna her og ikkje i feltet: to ribbeplan
   * nærare kvarandre enn ei platetjukn er to plater som står i kvarandre.
   * Feltet stoggar der, og `flyttRibbe` klemmer det same ein gong til — det
   * eine er kva fingeren får lov til, det andre er kva ei lenkje får lov
   * til.
   */
  const stabelen = useMemo((): Ribba[] => {
    const laas = lesLaas(String(params.laas ?? ""))
    const luft = Math.abs(Number(params.tjukn) || 3)
    const ut: Ribba[] = []
    for (const akse of ["x", "y"] as const) {
      const s = skala[akse]
      if (!s) continue
      const alle = ribbene(akse, params)
      const stor = akse.toUpperCase()
      for (let i = 0; i < alle.length; i++) {
        const adr = stor + (i + 1)
        // Stykka som høyrer til dette planet. «X3» og ikkje «X30»: det er
        // bokstaven eller enden som skil dei, aldri eit siffer til.
        const mine = kuttliste.filter((k) => new RegExp(`^${adr}([a-z]*)$`).test(k.adr))
        const mm = alle[i] * s.vidd
        const lo = (i > 0 ? alle[i - 1] * s.vidd : 0) + luft
        const hi = (i < alle.length - 1 ? alle[i + 1] * s.vidd : s.vidd) - luft
        // EIN DESIMAL, som alt anna i millimeter her. Brøken vert lagra med
        // fire desimalar, og fire desimalar av eit spenn på hundre og femti
        // er ein hundredels millimeter: ei ribbe på 12,5 kom ut som 12,495
        // og stod som «12,49» i feltet. Talet var rett og lesinga var ikkje
        // det — og under ein tidels millimeter held korkje snittet eller
        // klaringa noko som helst.
        const av1 = (v: number) => +v.toFixed(1)
        ut.push({
          adr,
          akse,
          mm: av1(mm),
          // Er det ikkje plass mellom naboane, er bandet det punktet ribba
          // står i: eit felt med botn over tak tek ingenting, og då er det
          // sletting og ikkje flytting som er svaret.
          lo: av1(Math.min(lo, mm)),
          hi: av1(Math.max(hi, mm)),
          laast: laas[akse].includes(+alle[i].toFixed(4)),
          stykke: mine.length,
          ledd: mine.reduce((a, k) => a + k.joints, 0),
        })
      }
    }
    return ut
  }, [params, skala, ribbene, kuttliste])

  /** delane som står fast på plata, etter adresse */
  const festa = useMemo(
    () => new Set(lesFest(String(params.fest ?? "")).keys()),
    [params.fest],
  )

  /**
   * KVAR EIN DEL STÅR NO.
   *
   * To kjelder, og den eine går føre. Står delen fast, er festet i
   * parametrane sanninga — det er skrive i det du trykte, og plata som
   * ligg framme kan vera frå før trykket. Står han fri, er det plata som
   * veit: pakkinga la han der, og talet er det ho sjølv gav frå seg.
   */
  const plassAv = useCallback(
    (adr: string, cur: ParamBag) =>
      lesFest(String(cur.fest ?? "")).get(adr) ??
      ark?.plasser.find((d) => d.adr === adr)?.plass,
    [ark],
  )

  /**
   * FEST, ELLER SLEPP.
   *
   * «Der han står» er ikkje ei rekning: plasseringa er talet pakkinga
   * sjølv gav frå seg, og det går rett attende inn hit.
   */
  const vipFest = useCallback(
    (adr: string) => {
      setHint(null)
      setParams((cur) => {
        const m = lesFest(String(cur.fest ?? ""))
        if (m.has(adr)) m.delete(adr)
        else {
          const pl = plassAv(adr, cur)
          if (!pl) return cur
          m.set(adr, pl)
        }
        return { ...cur, fest: skrivFest(m) }
      })
    },
    [plassAv],
  )

  /**
   * FLYTT: delen står fast der fingeren sleppte han.
   *
   * Plata har alt rekna talet — hjørnet han stod i, pluss det fingeren
   * gjekk, klemt inn på plata. Her vert det berre skrive. Eit drag er òg
   * eit feste: ein del som er flytt for hand og so pakka om att av
   * maskina er ein del som ikkje vart flytt.
   */
  const flyttDel = useCallback((adr: string, plass: Delplass["plass"]) => {
    setHint(null)
    setParams((cur) => {
      const m = lesFest(String(cur.fest ?? ""))
      m.set(adr, { ...plass, x: +plass.x.toFixed(2), y: +plass.y.toFixed(2) })
      return { ...cur, fest: skrivFest(m) }
    })
  }, [])

  /**
   * SNU: ein kvart sving, kring midten av delen.
   *
   * Pakkinga kjenner fire svingar og ikkje fleire, og ho snur kring
   * HJØRNET av masken. Ein del som snur kring hjørnet sitt hoppar; ein som
   * snur kring midten står. So midten vert halden: masken er boksen pluss
   * margen kring han, og etter svingen har han bytt breidd og høgd, so det
   * nye hjørnet er midten minus dei bytte halvmåla.
   *
   * Margen er lesen av plata sjølv — avstanden frå hjørnet pakkinga gav
   * til boksen ho teikna — og ikkje rekna om att her. Boksen er ei celle
   * for smal på kvar side av rasteret sitt, og midten hans ei halv celle
   * for langt inne; dei to feila et kvarandre opp i det nye hjørnet.
   *
   * Plata må ha teke att det siste festet fyrst: har ho ikkje det, står
   * boksen i den gamle svingen og breidd og høgd er bytte om. Då ventar
   * trykket til neste plate. Delen vert festa av svingen, som av draget.
   */
  const snuDel = useCallback(
    (adr: string) => {
      setHint(null)
      setParams((cur) => {
        const d = ark?.plasser.find((q) => q.adr === adr)
        if (!d) return cur
        const m = lesFest(String(cur.fest ?? ""))
        const no = m.get(adr) ?? d.plass
        if (no.rot !== d.plass.rot) return cur
        const marg = Math.max(0, d.boks.x - d.plass.x)
        const W = d.boks.w + 2 * marg
        const H = d.boks.h + 2 * marg
        const cx = d.plass.x + W / 2
        const cy = d.plass.y + H / 2
        m.set(adr, {
          sheet: d.plass.sheet,
          rot: ((no.rot + 1) % 4) as 0 | 1 | 2 | 3,
          x: +Math.max(0, cx - H / 2).toFixed(2),
          y: +Math.max(0, cy - W / 2).toFixed(2),
        })
        return { ...cur, fest: skrivFest(m) }
      })
    },
    [ark],
  )

  /** eit langt trykk på ein del opnar verktyet der fingeren står */
  const langtrykk = useCallback(
    (i: number, x: number, y: number) => {
      const adr = i >= 0 ? (kuttliste[i]?.adr ?? null) : null
      if (!adr) return
      setPeikt(adr)
      setDelVerkty({ adr, x, y })
    },
    [kuttliste],
  )

  /**
   * VERKTYET SKAL FÅ PLASS PÅ SKJERMEN.
   *
   * Han stod klemt mot fingeren med eit gjetta tal for kor brei han er, og
   * det talet var sett då han hadde to knappar. Med fire vart «slett»
   * ståande utanfor ruta. Breidda er noko nettlesaren VEIT — ho kjem an på
   * skrifta, orda og språket — so ho vert målt i staden for rekna, og
   * verktyet vert dregen inn frå kanten han er på veg ut av.
   */
  useLayoutEffect(() => {
    const el = delVerktyRef.current
    if (!el || !delVerkty) return
    const w = el.offsetWidth
    el.style.left = `${Math.min(Math.max(12, delVerkty.x - w / 2), Math.max(12, vindu.w - w - 12))}px`
  }, [delVerkty, vindu.w])

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
      sisteBygg.current = id
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
   *
   * `djup` er DET LANGE TRYKKET. Det er ikkje eit steg til i den same
   * lista, det er ei anna liste: heile ribbetavla rekna gjennom på ei
   * måling av kroppen, rangert på kor mykje av forma ho ber og kor mange
   * plater ho tek. Difor reknar eit langt trykk PÅ NYTT sjølv om det ligg
   * ei grunn liste her — ho er eit svar på eit anna spørsmål — medan eit
   * langt trykk på ei liste som alt er djup berre bladar vidare, som eit
   * kort.
   */
  const steg = useCallback((dir: 1 | -1, djup = false) => {
    if (tunarRef.current) return
    const base = tuneBase(naa.current)
    const cur = finn.current
    if (cur && cur.base === base && cur.alle.length && (cur.djup || !djup)) {
      const i = (((cur.nth + dir) % cur.alle.length) + cur.alle.length) % cur.alle.length
      cur.nth = i
      setStad({
        nth: i,
        tal: cur.alle.length,
        ribbX: cur.alle[i].ribbX,
        ribbY: cur.alle[i].ribbY,
        base,
        svar: cur.alle[i],
      })
      setParams((q) => VAFFEL.pick(q, cur.alle, i))
      return
    }
    // Ingen liste: det finst ikkje noko «førre svar» å gå attende til.
    if (dir < 0) return
    setHint(null)
    setBusy(true)
    tunarRef.current = true
    setTunar({ gjort: 0, av: 0 })
    finn.current = { base, alle: [], nth: 0, djup }
    /**
     * HJELPARANE KJEM FYRST NÅR NOKON HELD KNAPPEN.
     *
     * Djupsøket er hundre snittingar som ikkje treng vita om kvarandre,
     * og telefonen har fleire kjernar enn den eine motoren står på. So
     * eit par arbeidarar til av same skriptet, kvar knytt til motoren
     * med ein kanal — hovudtråden held berre endane, og høyrer aldri kva
     * som går i dei. Ikkje før nokon held: dei kostar minne og tråd, og
     * eit kort trykk treng dei ikkje. Ein kjerne til hovudtråden og ein
     * til motoren; resten, opp til tre, får snitte.
     */
    if (djup && !hjelparar.current) {
      const tal = Math.min(3, Math.max(1, (navigator.hardwareConcurrency ?? 4) - 2))
      const flokk: Worker[] = []
      // EIN HJELPAR SOM IKKJE VART TIL, ER BERRE EIN HJELPAR MINDRE.
      //
      // Ein tråd er minne, og ein telefon med lite att kan nekte. Han skal
      // ikkje ta søket med seg i fallet: motoren snittar sjølv, og han tek
      // over oppgåvene til ein hjelpar som aldri svarar — sjå «steg» i
      // arbeidaren. So det som vart til, hjelper; det som ikkje vart til,
      // kostar eit sekund eller to.
      for (let i = 0; i < tal; i++) {
        try {
          const h = nyArbeidar()
          const kanal = new MessageChannel()
          const hjelp: Req = { kind: "hjelp", id: 0, port: kanal.port1 }
          h.postMessage(hjelp, [kanal.port1])
          const hjelpar: Req = { kind: "hjelpar", id: 0, port: kanal.port2 }
          worker.current?.postMessage(hjelpar, [kanal.port2])
          flokk.push(h)
        } catch {
          break
        }
      }
      hjelparar.current = flokk
    }
    // Utanom porten, som uttaka: eit klikk er ikkje ein straum, og eit
    // søk som stod i kø bak eit bygg ville kome fram etter at brukaren
    // hadde gjeve opp.
    const msg: Req = { kind: "tune", id: ++reqId.current, params: naa.current, djup }
    worker.current?.postMessage(msg)
  }, [])

  /**
   * STOGG SØKET, OG HALD DET BESTE SO LANGT.
   *
   * Djupsøket snittar hundrevis, og det tek den tida det tek. Den som har
   * sett nok — ringen er halvvegs og svaret ser rett ut — skal ikkje
   * måtte vente på resten: eit trykk til stoggar det, og arbeidaren svarar
   * med det han har funne, sortert, som om søket var ferdig.
   */
  const avbryt = useCallback(() => {
    if (!tunarRef.current) return
    const msg: Req = { kind: "avbryt", id: ++reqId.current }
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
      svar: cur.alle[i],
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

  // `peikDel` står før `askArk` og køyrer utanfor teikninga, so det ho
  // treng vita om skuffa vert lagt her, kvar teikning.
  askArkRef.current = askArk
  verktyRef.current = verkty
  arkRef.current = ark

  /**
   * TIL EI ANNA PLATE.
   *
   * Draget flyttar innanfor plata, og plata er den einaste skuffa syner.
   * Ein del som skal AV ei full plate treng difor ein annan veg: eitt
   * steg fram eller attende i bunken. Nummeret er plata sitt eige — det
   * pakkinga gav frå seg — og eitt steg forbi den siste er ei ny plate.
   * Han vert festa av flyttinga, som av draget, og skuffa fylgjer han:
   * ein del som forsvinn frå skjermen er ein del som vart borte.
   */
  const bytPlate = useCallback(
    (adr: string, steg: 1 | -1) => {
      setHint(null)
      const d = ark?.plasser.find((q) => q.adr === adr)
      if (!d) return
      const til = d.plass.sheet + steg
      if (til < 0) return
      setParams((cur) => {
        const m = lesFest(String(cur.fest ?? ""))
        const no = m.get(adr) ?? d.plass
        m.set(adr, { ...no, sheet: til })
        return { ...cur, fest: skrivFest(m) }
      })
      askArk(til)
    },
    [ark, askArk],
  )

  /** Opnar eit verkty, eller lèt det att om det alt stod ope. */
  const opneVerkty = useCallback(
    (id: VerktyId) => {
      setVerkty((v) => (v === id ? null : id))
      // PÅ EIN TELEFON ER DEI TO NEDST BEGGE TO.
      //
      // Kontrollarket og skuffa deler den same kanten, og eit halvope ark
      // under ei skuff som tek resten er to ting som slåst om den same
      // plassen. Arket går difor til lukka — éi line — og du er anten i
      // kontrollane eller i verktyet. På benken bur dei i kvar sin kant og
      // treng ikkje vite om kvarandre.
      if (!benk) setMode("lukka")
      if (id === "ark") askArk(0)
    },
    [askArk, benk],
  )

  /**
   * PLATENE SOM BILETE.
   *
   * SVG og DXF er til maskina. Ein PNG er til alt det andre: å sende plata
   * i ei melding, leggje henne i ei bestilling, henge henne på veggen ved
   * laseren. Det er filtypen alle kan opne og ingen treng eit program for.
   *
   * HO VERT RASTERISERT HER OG IKKJE I ARBEIDAREN. Det bryt ikkje regelen
   * om at hovudtråden berre teiknar — det ER teikning. Ein arbeidar har
   * ingen `Image` å tolke SVG med, og `createImageBitmap` på ein SVG-blob
   * er ikkje noko Safari gjer. Geometrien er framleis arbeidaren sin:
   * `ArkSyn.svg` er den SAME strengen SVG-uttaket skriv, med den same
   * snittkompensasjonen.
   */
  const arkVent = useRef(new Map<number, (r: ArkRes) => void>())
  const hentArk = useCallback((i: number) => {
    const id = ++reqId.current
    const svar = new Promise<ArkRes>((ok, nei) => {
      arkVent.current.set(id, ok)
      // Ein arbeidar som døyr midt i skal ikkje la uttaket stå og vente
      // for alltid; `onerror` ryddar ikkje i denne kartoteket.
      window.setTimeout(() => {
        if (!arkVent.current.delete(id)) return
        nei(new Error("plata kom ikkje"))
      }, 20000)
    })
    const msg: Req = { kind: "ark", id, params: naa.current, sheet: i }
    worker.current?.postMessage(msg)
    return svar
  }, [])

  /**
   * Kor stort biletet vert.
   *
   * SVG-en står i millimeter. Fire pikslar per millimeter er hundre dpi —
   * nok til å lese adressa gravert på ein del — men ei plate på 800×600
   * vert då 3200×2400, og fire slike i minnet på ein telefon er der
   * fanen døyr. Difor eit tak på lengste kanten òg.
   */
  const pngAvArk = useCallback(async () => {
    const n = Math.max(0, tal?.metrics.sheets ?? 0)
    if (!n) return
    setBusy(true)
    try {
      const filer: { name: string; data: Uint8Array }[] = []
      const stamme = filnamnStamme(kjeldeNamn)
      for (let i = 0; i < n; i++) {
        const a = await hentArk(i)
        const mm = Math.max(a.arkB, a.arkH, 1)
        const pxmm = Math.min(4, 2400 / mm)
        const w = Math.max(1, Math.round(a.arkB * pxmm))
        const h = Math.max(1, Math.round(a.arkH * pxmm))
        // Storleiken vert skriven inn i sjølve SVG-en so nettlesaren
        // rasteriserer HAN i den storleiken. Skalerer ein i staden eit
        // ferdig rasterisert bilete opp, får ein ei uskarp plate.
        const kilde = a.svg.replace(
          /^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/,
          `<svg$1 width="${w}" height="${h}"`,
        )
        filer.push({
          name: n <= 1 ? `${stamme}-ark.png` : `${stamme}-ark-${i + 1}av${n}.png`,
          data: await tilPng(kilde, w, h),
        })
      }
      if (filer.length === 1) {
        lastNed(new Blob([filer[0].data as BlobPart], { type: "image/png" }), filer[0].name)
      } else {
        lastNed(
          new Blob([zip(filer) as BlobPart], { type: "application/zip" }),
          `${stamme}-ark-png.zip`,
        )
      }
    } catch {
      setFeil("fekk ikkje teikne platene")
    } finally {
      setBusy(false)
    }
  }, [tal, hentArk, kjeldeNamn])

  const doExport = useCallback(
    (what: ExportKind) => {
      // PNG-en går ikkje gjennom arbeidaren: han vert teikna her. Sjå
      // `pngAvArk`.
      if (what === "png") {
        void pngAvArk()
        return
      }
      setBusy(true)
      // utanom porten: eit klikk, ikkje ein straum — og svaret slepp porten fri
      const msg: Req = { kind: "export", id: ++reqId.current, params: naa.current, what }
      worker.current?.postMessage(msg)
    },
    [pngAvArk],
  )

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
      // Djupsøket har eit langt trykk på knappen, og eit langt trykk er
      // ingen veg for den som ikkje har ein peikar. Difor ein tast òg.
      if (k === "d") {
        e.preventDefault()
        steg(1, true)
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
      /**
       * PILENE SKYV RIBBA DU PEIKAR PÅ.
       *
       * Talfeltet i stabelen er godt til å treffe og tungt til å leite:
       * for å prøve «litt lenger denne vegen» må du ta feltet, skrive, gå
       * ut av det, sjå. Piltastane er den prøvinga — eitt steg om gongen,
       * på det du alt peikar på, med auga i modellen i staden for i
       * tabellen.
       *
       * Ho verkar kvar du enn peikar frå: modellen, kuttlista, plata eller
       * stabelen. Alle fire set den same `peikt`, og adressa er den same
       * adressa. Med shift går ho ti steg — det er skilnaden på å finkjenne
       * og å flytte.
       */
      if (k === "arrowleft" || k === "arrowright") {
        const r = peikt && stabelen.find((q) => peikt.startsWith(q.adr))
        if (!r) return
        e.preventDefault()
        flyttRibbe(r.adr, r.mm + (k === "arrowright" ? 1 : -1) * (e.shiftKey ? 5 : 0.5))
        setHint(null)
        return
      }
      if (k === "l") opneVerkty("liste")
      else if (k === "a") opneVerkty("ark")
      else if (k === "s") opneVerkty("stabel")
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
  }, [angre, steg, vendSteg, opneVerkty, verkty, peikt, stabelen, flyttRibbe])

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
            onLangtrykk={langtrykk}
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
        DELEVERKTYET.

        Eit langt trykk på ei ribbe opnar han, og han står DER FINGEREN
        STÅR. Ein meny i ein vegg krev at du hugsar kva du peika på medan
        du fer bort til han; denne står på det du held.

        På ei ribbe i objektet: lås, kopier, spegl, slett. Ei låst ribbe
        rikkar seg ikkje når du dreg ribbeskyvaren — dei frie fordeler seg
        kring henne — og det er det som gjer at ein stabel kan byggjast for
        hand i staden for å veljast blant seks jamne.

        På ein del på plata: fest eller slepp, og snu. Flyttinga har ingen
        knapp — ho er draget på sjølve delen.
      */}
      {delVerkty && (
        <>
          {/* Eit trykk utanfor lèt att. Han ligg UNDER verktyet og over alt
              anna, so det fyrste trykket lukkar i staden for å gjere to
              ting på ein gong. */}
          <div
            className="fixed inset-0 z-30"
            onPointerDown={() => setDelVerkty(null)}
            aria-hidden="true"
          />
          <div
            ref={delVerktyRef}
            // Fire handlingar og ei adresse er breiare enn ein smal telefon,
            // og då hjelper det ikkje å skuve han inn frå kanten: han må få
            // BRYTE. Ei pille som brekk til to rader er ikkje ei pille, so
            // hjørna er runde og ikkje halvsirklar.
            className="fixed z-40 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-1.5 rounded-3xl border px-1.5 py-1.5"
            role="dialog"
            aria-label={`${delVerkty.plate ? "del" : "ribbe"} ${delVerkty.adr}`}
            style={{
              // Ei startgjetting; `useLayoutEffect` over måler og rettar
              // henne før noko vert teikna.
              left: Math.max(12, delVerkty.x - 150),
              top: Math.max(12, delVerkty.y - 64),
              background: "var(--paper)",
              borderColor: "var(--rule)",
              boxShadow: "0 6px 24px color-mix(in srgb, var(--ink) 14%, transparent)",
            }}
          >
            <span className="tab px-1.5 text-[11px]" style={{ color: "var(--ink)" }}>
              {delVerkty.adr}
            </span>
            {(delVerkty.plate
              ? [
                  {
                    ord: festa.has(delVerkty.adr) ? "slepp" : "fest",
                    paa: festa.has(delVerkty.adr),
                    gjer: () => vipFest(delVerkty.adr),
                    kva: festa.has(delVerkty.adr)
                      ? "slepp delen: pakkinga legg han der ho vil att"
                      : "sett delen fast der han ligg: han vert lagd ned fyrst, og resten pakkar seg kring han",
                  },
                  {
                    ord: "snu",
                    paa: false,
                    gjer: () => snuDel(delVerkty.adr),
                    kva: "ein kvart sving mot klokka, kring midten. Delen vert festa der han står.",
                    /** verktyet står: fire svingar er tre trykk til */
                    blir: true,
                  },
                  // Fram og attende i bunken. «Førre» finst berre når det
                  // er ei plate før; «neste» alltid — forbi den siste er
                  // ei ny plate.
                  ...((ark?.plasser.find((q) => q.adr === delVerkty.adr)?.plass.sheet ?? 0) > 0
                    ? [
                        {
                          ord: "førre plate",
                          paa: false,
                          gjer: () => bytPlate(delVerkty.adr, -1),
                          kva: "flytt delen til plata før. Han vert festa der, og skuffa fylgjer han.",
                        },
                      ]
                    : []),
                  {
                    ord: "neste plate",
                    paa: false,
                    gjer: () => bytPlate(delVerkty.adr, 1),
                    kva: "flytt delen til neste plate — ei ny om dette er den siste. Han vert festa der, og skuffa fylgjer han.",
                  },
                ]
              : [
                  {
                    ord: erLaast(delVerkty.adr) ? "slepp" : "lås",
                    paa: erLaast(delVerkty.adr),
                    gjer: () => vipLaas(delVerkty.adr),
                    kva: erLaast(delVerkty.adr)
                      ? "slepp ribba fri: ho fordeler seg med dei andre att"
                      : "lås ribba her: ho står stille når du dreg ribbeskyvaren",
                  },
                  {
                    ord: "kopier",
                    paa: false,
                    gjer: () => kopierRibbe(delVerkty.adr),
                    kva: "ei ribbe til, midt imellom denne og naboen. Begge vert låste.",
                  },
                  {
                    ord: "spegl",
                    paa: false,
                    gjer: () => speglRibbe(delVerkty.adr),
                    kva: "den same ribba på hi sida av midten",
                  },
                  {
                    ord: "slett",
                    paa: false,
                    gjer: () => slettRibbe(delVerkty.adr),
                    kva: "denne ribba vekk. Dei andre vert låste der dei står, so stabelen ligg i fred.",
                  },
                ]
            ).map((v) => (
              <button
                key={v.ord}
                type="button"
                className={CHIP}
                style={chipStyle(v.paa)}
                title={v.kva}
                onClick={() => {
                  v.gjer()
                  if (!("blir" in v && v.blir)) setDelVerkty(null)
                  /**
                   * Å LÅSE EI RIBBE ER Å BYRJE Å BYGGJE FOR HAND.
                   *
                   * Menyen her tek éi ribbe om gongen, og du må finne
                   * henne i modellen fyrst. Det er nok til å prøve; det er
                   * ikkje nok til å byggje ein stabel. So det fyrste
                   * grepet opnar staden der resten av dei står — den same
                   * regelen peikinga alt fylgjer: er eit verkty ope,
                   * svarar DET, og er ingen open, opnar vi det som svarar
                   * på det du nettopp gjorde.
                   */
                  if (!delVerkty.plate) setVerkty((t) => t ?? "stabel")
                }}
              >
                {v.ord}
              </button>
            ))}
          </div>
        </>
      )}

      {/*
        KVA FINGRANE GJER, I TAL.
        Ein gest utan tal er ein gest du ikkje kan sikte med: du klyper og
        objektet står like stort på skjermen, av di kameraet rammar det inn
        av seg sjølv. Talet er heile tilbakemeldinga, og det står berre so
        lenge fingrane er nede.

        HØGRE HJØRNE, ØVERST. Det stod midt oppe i det frie bandet, og der
        stod lesemåtane frå før: «−100°» la seg tvers over «kontur». Talet
        og knappane deler den same lina no, men kvar sin ende av henne, og
        dei kan ikkje møtast — tre korte ord til venstre, eit kort tal til
        høgre. Same innrykk som brikkene har, so dei står i lodd.
      */}
      {gestTekst && (
        <div
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

      {/*
        SKUFFA STÅR PÅ BÅE FLATENE NO.
        Ho var `benk &&`, og då fanst korkje kuttlista, platene, stabelen
        eller oppsettet på ein telefon. Det var ikkje eit val — det var at
        ho vart bygd for to veggar og aldri flytt. Kva ho MÅLER er ulikt på
        dei to flatene (sjå `verktyH`); kva ho ER, er det same.
      */}
      {(verkty !== null || benk) && (
        <Verkty
          open={verkty}
          liste={kuttliste}
          ark={ark}
          params={params}
          ranges={VAFFEL.ranges}
          keys={VAFFEL.keys}
          clamp={(o, prev) => VAFFEL.clamp(o, prev)}
          peikt={peikt}
          ribber={stabelen}
          /* Veggane er benken sine. På ein telefon finst dei ikkje, og
             skuffa som fekk dei stod inne i eit rektangel som ikkje er
             der: to hundre og sytti pikslar frå venstre kant, halve
             breidda utanfor skjermen. */
          rute={{
            venstre: benk ? VEGG.venstre : 0,
            hogre: benk ? VEGG.hogre : 0,
            høgd: verktyH,
            botn: benk ? 0 : LUKKA_ARK,
            // Plata er ei teikning og fyller det ho får; dei tre andre er
            // lister og er så høge som dei er.
            fast: verkty === "ark",
          }}
          onHogd={setVerktyMaalt}
          onArk={askArk}
          onPeik={setPeikt}
          festa={festa}
          onLangtrykk={(adr, x, y) => setDelVerkty({ adr, plate: true, x, y })}
          onAvbryt={() => setDelVerkty(null)}
          onFlyttDel={flyttDel}
          onSleppAlle={() => endre({ ...params, fest: "" })}
          onChange={endre}
          onFlytt={flyttRibbe}
          onLaas={vipLaas}
          onKopier={kopierRibbe}
          onSpegl={speglRibbe}
          onSlett={slettRibbe}
          onAkse={laasAkse}
          onBytt={opneVerkty}
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
          onFinnDjup={() => steg(1, true)}
          onAvbryt={avbryt}
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
        onFinnDjup={() => steg(1, true)}
        onAvbryt={avbryt}
        onFinnAtt={() => steg(-1)}
        onShare={share}
        onFile={(f) => void takeFile(f)}
        verkty={verkty}
        onVerkty={opneVerkty}
      />
      )}
    </main>
  )
}
