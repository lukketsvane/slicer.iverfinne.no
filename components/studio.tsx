"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { bbox, shoelace, type ArkSyn, type ExportKind, type DetailKey, type ParamBag, type Pt, type Rom, type Vec3, type View } from "@/lib/core"
import { erPrimitiv, KUBE } from "@/lib/sources"
import { gløymGamaltNett, hent, hentNett, lagre, lagreNett, ryddNett } from "@/lib/lagring"
import { unzip, zip } from "@/lib/zip"
import { MOTOR } from "@/lib/motor"
import { BOG_TAK, MJUK_TAK, OMRISS_TAK, PLAN_TAK, add3, broek, delAv, dot, dreiing, iGruppa, lesPlan, mul3, norm3, nyGruppe, nyId, omrissLine, ramme as planRamme, rutenett, sameSnitt, skilRute, spegla, speglingar, skrivPlan, sub3, virvel, vriOm, type Plan, type Strek } from "@/lib/plan"
import { simplify, type Pt2 } from "@/lib/contour"
import { byggKey, lesDeling, lesFest, skrivDeling, skrivFest } from "@/lib/params"
import { BIT_MAX, BIT_MIN, eiKjelde, erFilform, familien, fyrsteForm, lesScene, nesteForm, skrivScene, SCENE_TAK, type Bit } from "@/lib/scene"
import type { Rute } from "@/lib/ramme"
import type { SkisseSyn } from "@/lib/snitt"
import type { ArkRes, BuildRes, MaalRes, Req, Res, SkisseReq } from "@/lib/worker"
import type { Montasje } from "@/lib/montasje"
import { Scene, snittMidt, type GestKva, type Modus, type Skisse } from "./scene"
import { Arket, KOL, type Steg } from "./arket"
import { CHIP, chipStyle, DOBBELT_MS, HAIR, ORD, VIEWS, IcoBit, IcoBoy, IcoDupliser, IcoForm, IcoHol, IcoMontasje, IcoRute, IcoSkjer, IcoSlett, IcoVirvel } from "./deler"
import { Plater } from "./plater"
import { Skuff, type VerktyId } from "./verkty"
import { Toppline } from "./toppline"

/**
 * STUDIOET. Ein parameterpose, ein arbeidar, og det som skal til for at
 * posen overlever: angre, lenkja, økta i nettlesaren, prosjektfila. Alt
 * som rører geometri går til arbeidaren; her vert det berre teikna.
 */

/** storleiken ut av posen: den lengste sida av kroppen, mm — det streka og
 *  omrisset er brøkar av */
const storleikAv = (p: ParamBag) => (typeof p.storleik === "number" && p.storleik > 0 ? p.storleik : 150)
/**
 * EIT PUNKT I OMRISSET, KLEMT TIL DET STRENGEN TEK IMOT.
 *
 * `lesPlan` kastar HEILE omrisset om eitt punkt ligg meir enn to storleikar
 * frå planet sitt punkt — ei form som forsvinn av di eitt hjørne kom for
 * langt ut er ikkje ei form du kan arbeide i. Halvanna er innanfor med god
 * margin, og det gjeld kvar veg eit punkt kjem inn: frose, dregen, eller
 * som eit hjørne i boksen.
 */
const klemPunkt = (q: Pt): Pt => [+Math.min(1.5, Math.max(-1.5, q[0])).toFixed(4), +Math.min(1.5, Math.max(-1.5, q[1])).toFixed(4)]
/** bogane er plassar i omrisset: flyttar punkta seg, må plassane fylgje med */
const skiftRunde = (r: readonly number[] | undefined, f: (i: number) => number | null) =>
  r?.length ? { runde: r.map(f).filter((i): i is number => i !== null) } : {}
/**
 * DEN STØRSTE RINGEN I SNITTET, FØR SPORA.
 *
 * Ein profil kan vera fleire stykke og ha hòl, og eit omriss er ÉI mangekant
 * — det er den avgjerda som gjer at punkta kan vera punkt du dreg og ikkje
 * eit tre du må navigere. Hòl og øyar teiknar du attende med streka.
 *
 * `raa` og ikkje `ringar`: den siste er profilen med ledda skorne i seg, og
 * å fryse HAN ville bake spora inn i forma og so skjere dei ein gong til.
 */
function stoersteRing(sn: SkisseSyn | null): Pt[] | null {
  const ringar = sn?.raa?.length ? sn.raa : sn?.ringar
  if (!ringar?.length) return null
  let stor = ringar[0]
  for (const q of ringar) if (Math.abs(shoelace(q)) > Math.abs(shoelace(stor))) stor = q
  return stor.length >= 3 ? stor : null
}

/** ei fil på meir enn dette er ikkje ein modell, det er eit uhell */
const MAX_FIL = 220 * 1024 * 1024
const ANGRE_DJUPN = 50
/** kor høgt det lukka arket er med botnmargen; skuffa står over det på telefonen */
const LUKKA_ARK = 84
/** knappane over skjer i tommelspalta: 48 pikslar, runde, flate */
/** knappane over skjer: ikon, og ikkje anna. Tilstanden er blekk mot dempa. */
const TUMME_BTN = "hit ikon relative flex h-12 w-12 items-center justify-center"
/**
 * HAKKET EIT PLAN FÅR AV VIRRET, mellom −1 og 1, gjeve av NAMNET.
 *
 * Ein `Math.random()` her ville gjeve ei ny rad for kvart bilete medan du
 * dreg, og du kunne aldri dra deg attende dit du var. Ein knasar på talet
 * gjev det same hakket kvar gong, so virret er ein funksjon og ikkje eit
 * kast — og eit drag ned tek nøyaktig attende det draget opp la på.
 */
const stoy = (id: number): number => {
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return (((h ^ (h >>> 16)) >>> 0) / 0xffffffff) * 2 - 1
}
/** eit steg i rutenettet: so langt fingrane må gå for éin kolonne eller éi rad */
const RUTE_STEG = 44
/** storleiken på ein bit, klemt til det lista tek imot */
const klemBit = (v: number) => Math.min(BIT_MAX, Math.max(BIT_MIN, v))
/** kor mykje bøy éin piksel drag er verd: hundre pikslar er ein halv bøy */
const BOY_STEG = 0.005
/**
 * MONTASJEN: kor mange pikslar eit heilt steg er når du dreg i knappen.
 *
 * Hundre og seksti — lenger enn ein tommel går utan å flytte handa, med
 * vilje: du skal kunne stoppe MIDT i eit steg og sjå kva som går kvar.
 * Ein knapp der heile animasjonen gjekk på tjue pikslar ville vore ein
 * brytar mellom flatt og ferdig, og det er ikkje det same som å sjå.
 */
const MONT_STEG_PX = 160
/** kor lenge grensesnittet står framme etter siste rørsle, i millisekund */
const SOV_MS = 2000
/** eit steg i virvelen: so langt fingrane går for éi ribbe til, og for eit hakk ut frå aksen */
const VIRVEL_STEG = 40
const VIRVEL_R_STEG = 0.02
/** kor nær aksen ribbene får koma. Null er det utarta: alle gjennom same
 *  lina, og tjue plan vart to delar og seks og tretti lause stykke då det
 *  vart målt. Ein halv er tangent til den innskrivne sirkelen. */
const VIRVEL_R = { min: 0.06, max: 0.5 }
/** kor mange ribber virvelen opnar med, og kor langt ute */
const VIRVEL_START: [number, number] = [12, 0.26]
/** vidda til kroppen i x og y, millimeter: det virvelen treng for å stå rundt */
const vidd = (k: { min: Vec3; max: Vec3 }): [number, number] => [k.max[0] - k.min[0], k.max[1] - k.min[1]]
/** det som er KROPPEN: berre desse ber om eit nytt «flate»-bygg */
const kroppKey = (p: ParamBag) => [p.kjelde, p.scene, p.storleik, p.rotX, p.rotY, p.rotZ, p.glatt, p.trekant].join("|")
/** filnamn utan mellomrom og aksentar; desimalkomma er bråk */
const stamme = (label: string) =>
  ("slicer-" + label).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase().slice(0, 48)

/**
 * Ei fil ut, same kvar ho vart laga. På ein telefon er nedlastingsmappa
 * ein dårleg stad for ei kuttfil: delingsarket kan AirDroppe henne til
 * maskina ved laseren. Ein skjerm med peikar lastar ned som før.
 */
async function lastNed(blob: Blob, namn: string) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (matchMedia("(pointer: coarse)").matches && typeof nav.share === "function" && typeof nav.canShare === "function") {
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

/** SVG → PNG gjennom lerretet, på kvitt: ein PNG utan botn er svart i dei fleste meldingsappar */
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

function useMedia(q: string) {
  const [v, setV] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const sync = () => setV(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [q])
  return v
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

type Port = { inFlight: boolean; pending: Req | null; shown: number }

const INGEN: readonly number[] = []
/** brøkane må halde seg nær boksen: eit plan langt utanfor råkar ingenting */
const klemO = (o: Vec3): Vec3 => o.map((c) => Math.min(1.5, Math.max(-0.5, c))) as Vec3

/**
 * GRUPPA FYLGJER LEIAREN. Plan `i` i lista har fått eit nytt punkt og ei ny
 * normal; er det i den valde gruppa, tek dei andre i gruppa det same
 * skuvet og den same dreiinga — heilt (saman) eller sin del av det
 * (fordelt, sjå `delAv`). Skuvet er det same for alle, so rada flyttar seg
 * stiv; dreiinga er den minste som tek den gamle normalen til den nye, lagd
 * på kvar si normal. Utan gruppe er det planet åleine som før.
 */
function medGruppa(l: Plan[], i: number, o: Vec3, n: Vec3, g: number | null, fordel: boolean): Plan[] {
  const q = l[i]
  const ut = [...l]
  ut[i] = { ...q, o: klemO(o), n }
  if (g === null || q.gruppe !== g) return ut
  const dO = sub3(o, q.o)
  const { akse, ang } = dreiing(q.n, n)
  const del = delAv(iGruppa(l, g), q.id, fordel)
  for (let j = 0; j < l.length; j++) {
    if (j === i) continue
    const t = del.get(l[j].id)
    if (t === undefined) continue
    const nn = ang ? (norm3(vriOm(l[j].n, akse, ang * t)).map((c) => +c.toFixed(4)) as Vec3) : l[j].n
    ut[j] = { ...l[j], o: klemO(add3(l[j].o, mul3(dO, t))), n: nn }
  }
  return ut
}

export function Studio() {
  const [params, setParams] = useState<ParamBag>(() => ({ ...MOTOR.defaults }))
  const [view, setView] = useState<View>("lag")
  /** ...og den same lesemåten til lyttarar som vart sette opp éin gong */
  const viewRef = useRef<View>("lag")
  viewRef.current = view
  /**
   * ROMMET: dei to lesemåtane der kroppen og plana ER det du ser.
   *
   * Reiskapane bur her og ingen annan stad. Plateflata syner delane
   * liggjande og montasjen syner dei reise seg; eit rutenett, ein bøy eller
   * eit hòl skorne der ville vore ei endring ingen såg — og ein knapp du
   * ikkje ser verknaden av er ein knapp som lyg. Difor står tommelspalta,
   * speglingane og skjer berre i «flate» og «lag».
   */
  const rom = view === "flate" || view === "lag"
  /**
   * SYNET ROMMET STÅR I. Konturen og montasjen er ikkje romsyn — den eine er
   * plateflata, den andre er delane på veg opp av henne — so rommet held på
   * det synet det hadde medan dei står framme. Å sende «lag» inn i staden
   * ville bytt nettet under eit lerret ingen ser, og bytt det attende, for
   * ingenting.
   */
  const romsyn = useRef<Rom>("lag")
  if (rom) romsyn.current = view
  /**
   * ...OG FANA DU KOM FRÅ, som ikkje er det same.
   *
   * Montasjen er ein veg du går inn i og ut av att, og ut av att tyder dit
   * du stod. Han las `romsyn`, og `romsyn` er eit ROM — so `kontur` → `M` →
   * `Esc` landa i «lag», ei fane du ikkje hadde vore i. Dei to spørsmåla
   * berre såg like ut: kva nett skal rommet halde på, og kvar var eg.
   */
  const foer = useRef<View>("lag")
  if (view !== "montasje") foer.current = view
  /**
   * SKALET: kroppen slik han var, teikna gjennomsiktig kring delane i «lag».
   * Han er der for å seie kor mykje av forma ribbene fangar — og han er i
   * vegen når du vil sjå ribbene sjølve. Difor ein brytar, og ikkje ein
   * parameter: han endrar ingen geometri og skal ikkje stå i angrelista.
   * Lenkja ber han like fullt, ved sida av lesemåten, so eit syn du deler
   * er det synet du sende.
   */
  const [skal, setSkal] = useState(true)
  /**
   * DEI INNEBYGDE FORMENE ER FILER, og filer må hentast.
   *
   * Kuben er laga i koden og står på skjermen med det same; dei fem andre
   * ligg under `public/form` og kjem når noko tek i dei — anten du vel ei
   * frå menyen, eller ei lenkje du opna ber henne. `formLasta` er dei vi
   * har bede om, `formSvar` er dei som er i lufta, og `formTal` er det
   * bygget lyttar på: eit nett som kjem inn ETTER at scena peika på det,
   * må byggjast på nytt, elles står biten som ein kube som ingen bad om.
   */
  const formLasta = useRef(new Set<string>())
  const formSvar = useRef(new Set<number>())
  const [formTal, setFormTal] = useState(0)
  /** dei to bygga: kroppen (flate) og delane (lag). Konturen byggjer ingenting — han er plateflata. */
  const [kropp, setKropp] = useState<BuildRes | null>(null)
  const [lag, setLag] = useState<BuildRes | null>(null)
  const [tal, setTal] = useState<MaalRes | null>(null)
  const [ark, setArk] = useState<ArkSyn | null>(null)
  /** det valde planet, og den valde delen på plata */
  const [vald, setVald] = useState<number | null>(null)
  /** det valde streket i det valde planet, som plass i lista hans */
  const [valdStrek, setValdStrek] = useState<number | null>(null)
  /**
   * GRUPPA SOM ER VALD, og planet i henne handa held i (`vald`, leiaren).
   * Trykk på gruppa i lista, og alle plana i henne svarar på det du gjer
   * med leiaren: handtaka, to fingrar, pilene, slett, dubler. `fordel` er
   * kva rada gjer med det: saman, eller fordelt frå den eine enden til
   * leiaren — då er ei dreiing ei vifte og eit skuv eit nytt mellomrom.
   */
  const [valdGruppe, setValdGruppe] = useState<number | null>(null)
  const [fordel, setFordel] = useState(false)
  const gruppeNo = useRef<{ g: number | null; fordel: boolean }>({ g: null, fordel: false })
  gruppeNo.current = { g: valdGruppe, fordel }
  const valdRef = useRef<number | null>(null)
  valdRef.current = vald
  /**
   * PUNKTET SOM ER TEKE, som plass i omrisset til det valde planet.
   *
   * Eit strek har det same (`valdStrek`), og av same grunn: utan noko som
   * er TEKE finst det ikkje eit tastatur. Pilene, ⌫ og escape treng eit
   * emne, og på ein benk er tastane vegen inn. Handa tek eit punkt ved å
   * leggje fingeren på det — same rørsla som byrjar eit drag — so det
   * kostar ikkje eit trykk å velje.
   */
  const [valdPunkt, setValdPunkt] = useState<number | null>(null)
  // eit anna plan er ei anna form: punktet handa heldt finst ikkje der
  useEffect(() => setValdPunkt(null), [vald])
  /** biten som er vald i verktyet for kroppen, som plass i scenelista */
  const [valdBit, setValdBit] = useState<number | null>(null)
  const bitRef = useRef<number | null>(null)
  bitRef.current = valdBit
  /** ein verdi vert dregen i arket: angre ventar til fingeren slepper */
  const [skrubbar, setSkrubbar] = useState(false)
  const [peikt, setPeikt] = useState<string | null>(null)
  const [steg, setSteg] = useState<Steg>("line")
  const [verkty, setVerkty] = useState<VerktyId | null>(null)
  /** kolonner og rader, medan fingrane set dei: lesinga over kroppen */
  const [ruteTal, setRuteTal] = useState<[number, number] | null>(null)
  /** ribber og avstand, medan fingrane set dei: lesinga over kroppen */
  const [virvelTal, setVirvelTal] = useState<[number, number] | null>(null)
  /**
   * MONTASJEN: delane med dei to plassane sine, og kvar i animasjonen vi er.
   *
   * Sjølve talet står i ein REF og ikkje i tilstanden. Det endrar seg kvart
   * bilete medan animasjonen går, og ei React-teikning per bilete er seksti
   * teikningar i sekundet av eit tre som ikkje har endra seg. Scena les
   * refen i si eiga lykkje; det einaste som kjem attende hit er kva STEG vi
   * er på, og det byter eit par gonger i heile animasjonen.
   */
  const [mont, setMont] = useState<Montasje | null>(null)
  const montT = useRef(0)
  const montSpel = useRef(false)
  const [montSteg, setMontSteg] = useState(1)
  /** draget i montasjeknappen: kva peikar, kvar han sist stod, og kvar han landa */
  const montDra = useRef<number | null>(null)
  const montNed = useRef<{ id: number; y: number } | null>(null)
  /** scena teiknar på oppmoding: her legg ho vekkjaren sin, so eit drag i
   *  knappen får eit bilete ut av henne */
  const montVakn = useRef<(() => void) | null>(null)
  const [busy, setBusy] = useState(true)
  const [feil, setFeil] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [hentar, setHentar] = useState(false)
  const [drag, setDrag] = useState(false)
  const [arkH, setArkH] = useState(0)
  const [toppH, setToppH] = useState(44)
  /**
   * NEDSTE KANTEN AV SYNSKUBEN, MÅLT.
   *
   * Dei to spaltene står i den same kanten av skjermen: synskuben med
   * låsen, innramminga og lupa øvst, reiskapane nedst. Bandet reiskapane
   * bur i vart klemt mot TOPPLINA, og det er ei line for høgt — ein stabel
   * som er lang nok legg seg over synskuben, og då er det reiskapen som tek
   * trykket du meinte for innramminga.
   *
   * Målt og ikkje talfesta: kuben er scena sin og kan endre seg, og eit
   * tal skrive to stader er to tal som fyrr eller seinare skil lag.
   */
  const [kubeBotn, setKubeBotn] = useState(0)
  /** gestmodusen: «form» er dei gamle gestane på objektet, «skisse» er gestane på planet */
  const [modus, setModus] = useState<Modus>("form")
  /** kor mange millimeter virr du har lagt på gruppa du står i, denne økta */
  const [virr, setVirr] = useState(0)
  /**
   * SYMMETRIEN PÅ SNITTET: tre brytarar i eitt tal (1 er x, 2 er y, 4 er z).
   *
   * Han høyrer til SKJER og ikkje til noko plan: eitt trykk låser snittet du
   * siktar og spegelbileta hans om midtplana i kroppen. Det som kjem ut er
   * heilt vanlege plan med kvart sitt namn — dei kan flyttast, vinklast,
   * teiknast i og slettast kvar for seg etterpå. Ein symmetri som var ein
   * eigenskap ved planet måtte ha delt namn mellom to delar, og namnet er
   * det som står gravert på plata.
   *
   * Difor er han heller ikkje ein parameter: han seier kva NESTE kutt vert,
   * ikkje kva kroppen er, og ei lenkje ber kroppen.
   */
  const [speil, setSpeil] = useState(0)
  /** kva ein finger held på med akkurat no, til lesing over objektet */
  const [gest, setGest] = useState<GestKva>(null)
  /** snittet skissa (eller det valde planet) ville gje, slik motoren las det */
  const [snitt, setSnitt] = useState<SkisseSyn | null>(null)
  /** planet som nett vart skore: delen hans blinkar éin gong når han kjem */
  const [blink, setBlink] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [namn, setNamn] = useState<Record<string, string>>({})
  const benk = useMedia("(pointer: fine) and (min-width: 1180px)")
  const vindu = useVindu()

  const worker = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const sisteBygg = useRef(0)
  const naa = useRef(params)
  naa.current = params
  /**
   * BYTANE MEDAN SVARET ER I LUFTA.
   *
   * Eit nett får namnet sitt av arbeidaren — det er bytane sine — so kopien
   * må liggje att her til svaret kjem og seier kva han skal heite i basen.
   * Han går i det same steget han vert skriven ned.
   */
  const bytar = useRef(new Map<number, { namn: string; buf: ArrayBuffer }>())
  /** det gamle eine nettet er henta inn og skal ryddast ut av luka si */
  const gamaltNett = useRef(false)
  /**
   * IMPORTAR SOM SKAL BYTE EIN BIT, og kva bit dei skal byte.
   *
   * Ein import er ei ny kjelde, og ei ny kjelde er ein annan kropp: plana
   * fylgjer ikkje med. Men står ein bit vald, er fila eit svar om HAN — ho
   * skal inn i klossen du peika på, ikkje i staden for heile kroppen. Kva
   * nettet kjem til å heite veit vi ikkje før arbeidaren har lese bytane,
   * so meininga må berast av førespurnaden fram til svaret.
   */
  const bytSvar = useRef(new Map<number, number>())
  const arkVent = useRef(new Map<number, (r: ArkRes) => void>())
  /** skisseplanet slik det står no, skrive av scena kvar teikning */
  const skisse = useRef<Skisse | null>(null)
  const kroppRef = useRef<BuildRes | null>(null)
  kroppRef.current = kropp
  /** snittet slik motoren sist svara: det forma vert frose av */
  const snittRef = useRef<SkisseSyn | null>(null)
  snittRef.current = snitt
  const kjelde = String(params.kjelde ?? KUBE)
  const kjeldeNamn = kjelde === KUBE ? "kube" : (namn[kjelde] ?? "nett")
  /** bitane kroppen er sett saman av: kjelda åleine når lista er tom */
  const bitar = useMemo(() => lesScene(String(params.scene || "") || eiKjelde(kjelde)), [params.scene, kjelde])
  const plan = useMemo(() => lesPlan(params.plan), [params.plan])
  const liste = useMemo(() => tal?.liste ?? [], [tal])

  /**
   * SISTE-VINN-PORTEN, éin per lesemåte. Ein skyvar lagar punkt fortare
   * enn motoren byggjer dei; med porten vert eit uteståande punkt berre
   * BYTT UT til bygget i lufta er ferdig, og draget går i motoren si takt.
   */
  const portar = useRef<Record<Rom, Port>>({
    flate: { inFlight: false, pending: null, shown: 0 },
    lag: { inFlight: false, pending: null, shown: 0 },
  })
  const pump = useCallback((v: Rom) => {
    const p = portar.current[v]
    if (p.inFlight || !p.pending) return
    p.inFlight = true
    worker.current?.postMessage(p.pending)
    p.pending = null
  }, [])
  const bygg = useCallback((v: Rom, detail: DetailKey) => {
    const id = ++reqId.current
    sisteBygg.current = id
    portar.current[v].pending = { kind: "build", id, params: naa.current, detail, view: v }
    pump(v)
  }, [pump])
  const send = useCallback((msg: Req, transfer?: Transferable[]) => {
    worker.current?.postMessage(msg, transfer ?? [])
  }, [])
  /**
   * SKISSEPORTEN. Skissa er ein straum av punkt og motoren svarar på eitt
   * om gongen: éin i lufta, det siste ventar, og eit svar som er eldre enn
   * det som alt er synt vert kasta. `plan` er det som vert snitta no —
   * skissa med namn 0, eller det valde planet — og eit byte tømer snittet,
   * so det gamle ikkje står i den nye fargen. `p` er posen motoren snittar
   * frå: den som står, eller — medan eit strek vert drege — ein kopi med
   * streken der fingeren har han, so snittet syner det du får utan at
   * parametrane rører seg før du slepper.
   */
  const skissePort = useRef<{ inFlight: boolean; pending: SkisseReq | null; shown: number; plan: Plan | null }>({ inFlight: false, pending: null, shown: 0, plan: null })
  const pumpSkisse = useCallback(() => {
    const p = skissePort.current
    if (p.inFlight || !p.pending) return
    p.inFlight = true
    worker.current?.postMessage(p.pending)
    p.pending = null
  }, [])
  const spørSkisse = useCallback((pl: Plan | null, p: ParamBag = naa.current) => {
    const port = skissePort.current
    if ((pl?.id ?? null) !== (port.plan?.id ?? null)) setSnitt(null)
    port.plan = pl
    if (!pl) {
      port.pending = null
      return
    }
    port.pending = { kind: "skisse", id: ++reqId.current, params: p, plan: pl }
    pumpSkisse()
  }, [pumpSkisse])
  /** skissa flytta seg i scena: punktet som brøk av boksen, og normalen som han er */
  const skisseEndra = useCallback((s: Skisse) => {
    const k = kroppRef.current
    if (k) spørSkisse({ id: 0, o: broek(s.o, k.min, k.max), n: s.n, bog: 0, strek: [] })
  }, [spørSkisse])

  /**
   * DER DU SLAPP, UTAN AT DU BAD OM DET.
   *
   * Lenkja og økta er ikkje to vegar inn — dei er to HALVDELAR av den same.
   * Lenkja ber innstillingane (ho står alt i adressefeltet, appen skriv
   * henne sjølv), og økta ber nettet. Dei vart lesne som eit anten–eller
   * før, og av di appen alltid har lagt ei lenkje i adressefeltet, tok
   * omlastinga alltid lenkjevegen: nettet du drog inn låg i basen og vart
   * aldri spurt om. Du fekk ribbene dine attende på ein kube.
   *
   * No les vi lenkja fyrst og hentar so KVART nett ho peikar på — kjelda og
   * kvar bit i scena — under id-en sin. Namnet på eit importert nett er
   * bytane sine, so oppslaget er eintydig, og det held difor på tvers av
   * fanar og omstartar.
   *
   * EI LENKJE FRÅ EIN ANNAN kan ikkje dra nett ut av basen din: ho må be om
   * nøyaktig dei id-ane du har. Har du dei ikkje, fell kroppen til kuben som
   * han alltid har gjort — og lina seier at det var eit nett ho ikkje fann,
   * i staden for å la deg tru at kuben er det du laga.
   */
  useEffect(() => {
    setMounted(true)
    const hentInn = (obj: Record<string, unknown>) => {
      const kj = typeof obj.kjelde === "string" ? obj.kjelde : KUBE
      const idar = [...new Set([kj, ...lesScene(obj.scene).map((b) => b.id)])].filter((id) => !erPrimitiv(id) && !erFilform(id))
      if (!idar.length) return
      setHentar(true)
      void hentNett(idar).then((funne) => {
        for (const v of funne) {
          const id = ++reqId.current
          formSvar.current.add(id)
          setNamn((m) => ({ ...m, [v.id]: v.label }))
          // `som` gjev nettet det FASTE namnet det hadde; utan det ville det
          // fått eit av bytane sine — same talet, men rekna på nytt — og
          // scena peikar alt på namnet.
          send({ kind: "import", id, name: v.label, buf: v.bytes, som: v.id, etikett: v.label }, [v.bytes])
        }
        if (funne.length === idar.length) return setHentar(false)
        // det gamle eine nettet, frå den tida ein kropp var éi fil
        void hent().then((g) => {
          if (!g?.nett) {
            setHentar(false)
            setMelding(funne.length ? "eitt nett mangla" : "fann ikkje nettet")
            return
          }
          const id = ++reqId.current
          formSvar.current.add(id)
          gamaltNett.current = true
          // ein kopi att, so det gamle nettet kan skrivast ned under namnet
          // sitt i den nye butikken og luka det låg i kan tømast
          bytar.current.set(id, { namn: g.filnamn ?? "nett.stl", buf: g.nett.slice(0) })
          send({ kind: "import", id, name: g.filnamn ?? "nett.stl", buf: g.nett, som: idar.find((q) => !funne.some((f) => f.id === q)), etikett: g.filnamn ?? "nett" }, [g.nett])
        })
      })
    }
    try {
      const h = window.location.hash.slice(1)
      if (!h.startsWith("p=")) {
        // inga lenkje: tak det du hadde, innstillingar og nett i lag
        void hent().then((v) => {
          if (!v) return
          setParams((q) => MOTOR.clamp(v.params, q))
          hentInn(v.params)
        })
        return
      }
      const obj = JSON.parse(decodeURIComponent(h.slice(2))) as Record<string, unknown>
      // EI LENKJE BER IKKJE EIT NETT — men ho ber godt eit NAMN som tyder
      // det same overalt. Ei innebygd form ligg på tenaren og kjem når nokon
      // spør; ei importert fil ligg i din eigen base, under det same namnet,
      // og `hentInn` spør etter henne der.
      setParams((p) => MOTOR.clamp(obj, p))
      if (VIEWS.some((v) => v.id === obj.view)) setView(obj.view as View)
      if (typeof obj.skal === "boolean") setSkal(obj.skal)
      hentInn(obj)
    } catch {
      // øydelagd hash — lat standardobjektet stå
    }
  }, [send])

  useEffect(() => {
    const w = new Worker(new URL("../lib/worker.ts", import.meta.url), { type: "module" })
    worker.current = w
    // ein ny arbeidar er ein tom port — React monterer to gonger i utvikling
    for (const p of Object.values(portar.current)) {
      p.inFlight = false
      p.pending = null
    }
    skissePort.current.inFlight = false
    skissePort.current.pending = null
    // og ein arbeidar som døyr skal seie det: same stille døden som Turbopack gjev
    w.onerror = () => {
      setBusy(false)
      setHentar(false)
      setFeil("motoren stogga")
    }
    w.onmessage = (e: MessageEvent<Res>) => {
      const r = e.data
      if (r.kind === "build") {
        const p = portar.current[r.view]
        p.inFlight = false
        pump(r.view)
        if (r.id < p.shown) return
        p.shown = r.id
        ;(r.view === "flate" ? setKropp : setLag)(r)
        return
      }
      if (r.kind === "skisse") {
        const p = skissePort.current
        p.inFlight = false
        pumpSkisse()
        if (r.id < p.shown || !p.plan) return
        p.shown = r.id
        const { kind, id, ...syn } = r
        void kind
        void id
        // det same snittet om att — etter eit skjer ligg det nye planet i skissa, etter eit slepp står streken der han alt var synt — er inga endring, og skal ikkje teiknast om att. Nøkkelen seier det.
        setSnitt((prev) => (prev && prev.nokkel === syn.nokkel ? prev : syn))
        return
      }
      if (r.kind === "maal") {
        setTal(r)
        // fyrst når rekninga for det SISTE bygget er inne, er motoren ferdig
        if (r.id >= sisteBygg.current) setBusy(false)
        return
      }
      if (r.kind === "prosjekt") {
        setRammInn((n) => n + 1)
        // nettet OG innstillingane i eitt steg
        setHentar(false)
        setFeil(null)
        if (r.src) setNamn((m) => ({ ...m, [r.src!.id]: r.src!.label }))
        const kj = r.src ? r.src.id : KUBE
        setParams((p) => MOTOR.clamp({ ...r.params, kjelde: kj }, { ...p, kjelde: kj }))
        setVald(null)
        setMelding(r.src ? "prosjekt ope" : "oppsett sett")
        /**
         * OG EIT OPE PROSJEKT ER EI ØKT SOM ALLE ANDRE.
         *
         * Arkivet ber KVART nett i scena; luka i basen bar eitt, so ei
         * omlasting etter «opna prosjekt» tok deg attende til ein kube. Her
         * vert arkivet pakka opp her på tråden — berre pakka opp, ikkje
         * tolka; nettet er alt lese i arbeidaren — og kvar fil skriven ned
         * under id-en som står i namnet hennar. Det er den same id-en scena
         * peikar på, av di det var slik ho vart skriven.
         */
        const bs = bytar.current.get(r.id)
        bytar.current.delete(r.id)
        if (bs) {
          try {
            for (const f of unzip(bs.buf)) {
              const m = /^nett\/([a-z0-9_-]{1,40})__(.*)$/i.exec(f.name)
              if (!m || !f.data.byteLength) continue
              void lagreNett(m[1], m[2], f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer)
            }
          } catch {
            // eit arkiv som ikkje let seg pakke opp her, er alt lese der det
            // tel — økta er det einaste som går tapt, og ho seier ikkje frå
          }
        }
        return
      }
      if (r.kind === "ark") {
        const vent = arkVent.current.get(r.id)
        if (vent) {
          arkVent.current.delete(r.id)
          vent(r)
          return
        }
        const { kind, id, ...plata } = r
        void kind
        void id
        setArk(plata)
        return
      }
      if (r.kind === "montasje") {
        /**
         * OG EIT SVAR SOM KJEM ETTER AT FANA ER FORLATEN, FELL PÅ GOLVET.
         *
         * På ein kropp med mange plan tek montasjen opp mot eit halvt
         * sekund, so eit byte av fane rekk å skje FØR svaret kjem. Sette vi
         * han då, stod du att med stabelen av plater i ei fane som ikkje er
         * montasjen: kroppen, snittet og skjer var borte, og berre to byte
         * til henta dei.
         *
         * Refen og ikkje `view`: denne lyttaren er sett opp éin gong, og
         * ser difor alltid lesemåten frå det fyrste biletet.
         */
        if (viewRef.current !== "montasje") return
        const { kind, id, ...m } = r
        void kind
        void id
        // Ein ny montasje er ei ny liste delar, so animasjonen byrjar på
        // golvet — og han SPELAR: du opna reiskapen for å sjå han, og eit
        // objekt som står stille i utgangsstillinga si seier ingenting.
        montT.current = 0
        montSpel.current = true
        setMontSteg(1)
        setMont(m)
        return
      }
      if (r.kind === "kjelde") {
        setNamn((m) => ({ ...m, [r.src.id]: r.src.label }))
        /**
         * EI INNEBYGD FORM RAMMAR IKKJE INN.
         *
         * Ho kjem same vegen som ei fil — nettet vert henta, og kjelda
         * melder seg — men ho er ikkje ein ny kropp: ho er ein bit som
         * byter form, med plassen, storleiken og vendinga si i behald. Å
         * blaste kameraet heim for kvart trykk på «bla» er å kaste vinkelen
         * du stod og såg på, ti gonger på rad, medan du ser gjennom ti
         * stolar. Ei FIL er noko anna: der er kroppen ein annan, og han
         * skal du sjå.
         */
        if (!erFilform(r.src.id)) setRammInn((n) => n + 1)
        /**
         * NED I BASEN, UNDER NAMNET SITT.
         *
         * Bytane låg der før òg, men i ei einaste luke og utan namn: det
         * sist importerte nettet, og ferdig med det. Ein kropp av tre
         * importerte figurar kom difor attende som ein kube og to til. Her
         * går kvart nett ned under den id-en arbeidaren nett gav det — den
         * same id-en scena og lenkja peikar på — og eit oppslag ved neste
         * opning finn nøyaktig rett fil.
         *
         * Eit nett som er for stort til å hugsast er ikkje ein feil, men det
         * er noko den som står med fila må VITE: utan prosjektfila kostar
         * ei omlasting henne arbeidet.
         */
        const bs = bytar.current.get(r.id)
        bytar.current.delete(r.id)
        if (bs) {
          void lagreNett(r.src.id, r.src.label, bs.buf).then((ok) => {
            if (!ok) setMelding("for stort å hugse — lagre prosjektfila")
          })
        }
        if (gamaltNett.current) {
          gamaltNett.current = false
          void gløymGamaltNett()
        }
        // EI FORM ER IKKJE EIN IMPORT. Ho vart beden om av di noko på
        // skjermen alt PEIKAR på henne — ein bit i scena, eller ei lenkje
        // som ber henne — so ho skal ikkje byte kjelde og ikkje tømme plana.
        // Ho skal berre byggjast, no som nettet er framme.
        if (formSvar.current.delete(r.id)) {
          setFormTal((n) => n + 1)
          setHentar(false)
          return
        }
        // OG EIN IMPORT MED EIN BIT VALD ER EIT BYTE. Nettet går inn i den
        // klossen du peika på og let plassen, storleiken og vendinga hans
        // stå — kroppen er den same kroppen, med ei anna form i éin bit, so
        // korkje kjelda eller plana skal røre seg.
        const byt = bytSvar.current.get(r.id)
        bytSvar.current.delete(r.id)
        if (byt !== undefined) {
          setParams((p) => {
            const l = lesScene(String(p.scene || "") || eiKjelde(String(p.kjelde ?? KUBE)))
            if (!l[byt]) return p
            l[byt] = { ...l[byt], id: r.src.id }
            return { ...p, scene: skrivScene(l) }
          })
          setFeil(null)
          setHentar(false)
          return
        }
        // EIT NYTT NETT TEK PLANA OG FESTA MED SEG UT: båe er svar om den
        // kroppen du hadde. Ei økt som vert henta inn att går ikkje denne
        // vegen i det heile — ho er skriven for dette nettet, og går ut over
        // `formSvar` ovanfor.
        setParams((p) => ({ ...p, kjelde: r.src.id, scene: "", plan: "", fest: "" }))
        setVald(null)
        setFeil(null)
        setHentar(false)
        return
      }
      if (r.kind === "feil") {
        if (r.kva === "build" && r.view) {
          portar.current[r.view].inFlight = false
          pump(r.view)
          if (r.id >= sisteBygg.current) setBusy(false)
          return
        }
        if (r.kva === "skisse") {
          // ei skisse som kasta er ikkje ein feil å syne; porten skal berre opnast att
          skissePort.current.inFlight = false
          pumpSkisse()
          return
        }
        // ei fil som kasta har ingen kopi å hugse
        bytar.current.delete(r.id)
        setFeil(r.kva === "import" ? (r.kvifor ?? "ulesbar fil") : "uttak feila")
        setHentar(false)
        setBusy(false)
        return
      }
      void lastNed(r.text ? new Blob([r.text], { type: r.mime }) : new Blob([r.data as ArrayBuffer], { type: r.mime }), r.name)
      // Ei fil som ikkje bar alt ho lova, skal seie det MEDAN du står der.
      // Finn du det ut når du opnar henne att, er arbeidet borte.
      if (r.merknad) setMelding(r.merknad)
      setBusy(false)
    }
    return () => {
      w.terminate()
      worker.current = null
    }
  }, [pump, pumpSkisse])

  /**
   * KVA MOTOREN SNITTAR MEDAN DU SIKTAR: skissa, eller det valde planet.
   * Om att kvar gong posen endrar seg — eit nytt låst plan gjev nye kryss —
   * og kvar gong kroppen kjem, so brøkane er rekna mot den rette boksen.
   */
  useEffect(() => {
    if (!mounted || !kropp) return
    // verktyet for kroppen snittar ingenting: der byggjer du emnet, ikkje delane
    if (modus === "bit") return spørSkisse(null)
    // og berre rommet snittar: på plata ligg delane alt, og i montasjen er
    // dei på veg opp av henne
    if (!rom) return spørSkisse(null)
    if (vald !== null) return spørSkisse(plan.find((q) => q.id === vald) ?? null)
    const s = skisse.current
    spørSkisse(s ? { id: 0, o: broek(s.o, kropp.min, kropp.max), n: s.n, bog: 0, strek: [] } : null)
  }, [mounted, kropp, vald, plan, params, modus, rom, spørSkisse])
  const harSnitt = !!snitt?.ringar.length

  /**
   * SKJERMEN SYNER DET FILA VERT SKOREN PÅ.
   *
   * Nivået låg på peikaren: ei grov flate fekk det låge nivået og vart
   * ståande der, av di det fine bygget berre vart bede om når det var ei mus
   * i rommet. Det gjorde telefonen — den eine maskina dette er laga for —
   * til den einaste flata som synte ei grovare utgåve av delane enn den
   * laseren får: trappetrinn i omrisset som ikkje finst i kuttfila.
   *
   * No er nivået det same på begge flatene, og det same som uttaket og
   * måltala.
   *
   * OG DET ER EITT NIVÅ, ikkje to. Det stod grovt fyrst og fint etterpå, og
   * den avveginga løner seg berre om det grove er RASKARE. Det er det ikkje:
   * 60, 120, 220 og 320 celler kostar 230, 212, 211 og 215 ms på ei kule med
   * seksten plan. Snittinga er flat i celletalet — arbeidet ligg i
   * trekantane per plan og ikkje i feltet — so `DETAIL` styrer kor fint
   * resultatet vert, og ingenting anna.
   *
   * Det grove passet kjøpte altso eit dårlegare omriss til full pris, og
   * buffernøkkelen har celletalet i seg, so dei to bygga delte ingenting:
   * «lav so mid» 452 ms, «mid åleine» 224, «mid to gonger» 219 — det andre
   * bygget på same posen er gratis. Kvart parameterhakk, i kvar fane, betalte
   * for to fulle snittingar og synte den dårlegaste fyrst.
   */
  const detail: DetailKey = "mid"
  const kk = kroppKey(params)
  useEffect(() => {
    if (mounted) bygg("flate", "lav")
  }, [kk, mounted, formTal, bygg])
  useEffect(() => {
    if (!mounted) return
    setBusy(true)
    setFeil(null)
    bygg("lag", detail)
  }, [params, detail, view, mounted, formTal, bygg])

  /** hent dei formene som står på skjermen og ikkje er bedne om før */
  useEffect(() => {
    if (!mounted) return
    const vil = new Set<string>([String(params.kjelde ?? ""), ...bitar.map((b) => b.id)].filter(erFilform))
    for (const id of vil) {
      if (formLasta.current.has(id)) continue
      formLasta.current.add(id)
      setHentar(true)
      void fetch(`/form/${id}.glb`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((buf) => {
          const q = ++reqId.current
          formSvar.current.add(q)
          send({ kind: "import", id: q, name: `${id}.glb`, buf, som: id }, [buf])
        })
        .catch(() => {
          // ei form som ikkje kom er ei form du kan be om att
          formLasta.current.delete(id)
          setHentar(false)
          setFeil("fekk ikkje forma")
        })
    }
  }, [params.kjelde, bitar, mounted, send])

  /**
   * LENKJA KODAR ALT SOM STÅR PÅ SKJERMEN — bortsett frå bytane i nettet.
   *
   * NAMNET på nettet står, og det gjorde det ikkje før: eit importert nett
   * vart stroke ut av lenkja, av di det ikkje tyder noko for den som opnar
   * henne på ei anna maskin. Men det tyder alt for DEG: det er oppslaget som
   * hentar nettet ditt attende ut av basen etter ei omlasting, og utan det
   * kom du attende til ribbene dine på ein kube. Namnet er bytane sine, so
   * det seier ingenting om deg og opnar ingenting for den som ikkje alt har
   * fila.
   */
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      window.history.replaceState(null, "", "#p=" + encodeURIComponent(JSON.stringify({ ...params, view, skal })))
    }, 500)
    return () => window.clearTimeout(t)
  }, [params, view, skal, mounted])
  // og økta hugsar seg sjølv, straks. iOS drep ein PWA i bakgrunnen utan å
  // spørje, so det som står skal alt vera skrive — og skrivast ein gong til
  // i det appen går i bakgrunnen, for det som stod under ein halv sekund.
  const skrivOkta = useCallback(() => {
    void lagre(naa.current as Record<string, number | string>)
  }, [])
  /**
   * OG DET KROPPEN IKKJE PEIKAR PÅ LENGER, GÅR.
   *
   * Same regelen som `forget` i `sources.ts`, berre på disken: ein brukar
   * som har prøvd seks filer treng ikkje dei fem fyrste, og eit skann er
   * lett hundre megabyte. Han går ved sida av skrivinga av innstillingane,
   * so det er alltid nøyaktig kroppen som står, som ligg der.
   */
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      const idar = [String(params.kjelde ?? ""), ...bitar.map((b) => b.id)].filter((id) => id && !erPrimitiv(id) && !erFilform(id))
      void ryddNett(idar)
    }, 1500)
    return () => window.clearTimeout(t)
  }, [params.kjelde, bitar, mounted])
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(skrivOkta, 150)
    return () => window.clearTimeout(t)
  }, [params, mounted, skrivOkta])
  useEffect(() => {
    if (!mounted) return
    const gøymd = () => { if (document.visibilityState === "hidden") skrivOkta() }
    document.addEventListener("visibilitychange", gøymd)
    window.addEventListener("pagehide", skrivOkta)
    return () => {
      document.removeEventListener("visibilitychange", gøymd)
      window.removeEventListener("pagehide", skrivOkta)
    }
  }, [mounted, skrivOkta])

  /**
   * ANGRE OG GJER OM. Eit drag er hundre punkt og éi endring: eit punkt
   * vert fyrst bokført når det har fått stå i ein knapp sekund — og aldri
   * medan ein gest er i gang. Eit bygg som stoggar hovudtråden midt i ei
   * vriding gav elles to bokføringar av éin gest, og Z tok berre halve.
   * Framtida er det du angra: eit angre legg det som stod der, ei ny
   * endring kastar henne.
   */
  const fortid = useRef<ParamBag[]>([])
  const framtid = useRef<ParamBag[]>([])
  const stodd = useRef<ParamBag | null>(null)
  const [kanAngre, setKanAngre] = useState(false)
  const [kanGjerOm, setKanGjerOm] = useState(false)
  /** eit hopp i historikka er ikkje ei ny endring, og skal ikkje tøme framtida */
  const hopp = useRef(false)
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
    if (hopp.current) hopp.current = false
    else if (framtid.current.length) {
      framtid.current = []
      setKanGjerOm(false)
    }
    setKanAngre(true)
    if (gest || skrubbar) return
    const t = window.setTimeout(() => {
      if (stodd.current === null || stodd.current === params) return
      fortid.current.push(stodd.current)
      if (fortid.current.length > ANGRE_DJUPN) fortid.current.shift()
      stodd.current = params
    }, 450)
    return () => window.clearTimeout(t)
  }, [params, mounted, gest, skrubbar])
  const angre = useCallback(() => {
    const no = naa.current
    const mal = stodd.current !== null && stodd.current !== no ? stodd.current : fortid.current.pop()
    if (!mal) return
    framtid.current.push(no)
    setKanGjerOm(true)
    stodd.current = mal
    hopp.current = true
    setKanAngre(fortid.current.length > 0)
    setParams(mal)
  }, [])
  const gjerOm = useCallback(() => {
    const mal = framtid.current.pop()
    if (!mal) return
    const no = naa.current
    if (stodd.current !== null && stodd.current !== no) fortid.current.push(stodd.current)
    fortid.current.push(no)
    if (fortid.current.length > ANGRE_DJUPN) fortid.current.shift()
    stodd.current = mal
    hopp.current = true
    setKanAngre(true)
    setKanGjerOm(framtid.current.length > 0)
    setParams(mal)
  }, [])

  const endre = useCallback((p: ParamBag) => {
    setParams(p)
  }, [])

  // --- KROPPEN ---------------------------------------------------------------
  /**
   * EIN BIT TIL. Primitiva er hundre millimeter på det lengste, og ein ny
   * står ved sida av dei som alt er der med femten millimeters overlapp:
   * strålane tel skal, so to bitar som går i kvarandre er ÉIN kropp der
   * dei overlappar, og ei rad av lause klossar ville vore lause delar.
   *
   * Rada vert lagd om att kvar gong og står midt i rommet. Det er ikkje ei
   * plassering nokon har valt — det finst ikkje eit handtak å flytte ein
   * bit med enno — men ho er den same kvar gong, og ho held seg innanfor
   * det scenestrengen tek imot. Steget krympar når bitane vert mange.
   *
   * MED EIN BIT VALD ER DET EIT BYTE OG IKKJE EIT TILLEGG. Du peika på ein
   * bit; det du vel etterpå er eit svar om HAN. Plassen, storleiken og
   * vendinga står — det er den same klossen med ei anna form i seg — og
   * valet står, so du kan bla gjennom formene og sjå kva som passar.
   *
   * OG DET ER FAMILIEN DU VEL, ikkje utgåva: menyen har éi line per familie
   * (sjå `scene.ts`). Ein ny bit vert den fyrste utgåva. Står biten alt i
   * den familien, tek det same valet deg til den NESTE — det er slik du
   * blar gjennom dei ti stolformene med kroppen framme i staden for i ei
   * liste som dekkjer han.
   */
  const leggBit = useCallback((val: string) => {
    const byt = bitRef.current
    // og det same for bitane: seksten er taket, og det skal seiast — utanfor
    // oppdateringa, som skal vera ei rein rekning og kan kallast to gonger.
    // Eit byte legg ingen bit til og har ikkje noko tak å nå.
    if (byt === null && lesScene(String(naa.current.scene || "") || eiKjelde(String(naa.current.kjelde ?? KUBE))).length >= SCENE_TAK) {
      setMelding(`taket er ${SCENE_TAK} bitar`)
      return
    }
    setParams((cur) => {
      const l = lesScene(String(cur.scene || "") || eiKjelde(String(cur.kjelde ?? KUBE)))
      if (byt !== null) {
        const no = l[byt]
        if (!no) return cur
        const id = familien(no.id) === val ? nesteForm(no.id) : fyrsteForm(val)
        if (id === no.id) return cur
        l[byt] = { ...no, id }
        return { ...cur, scene: skrivScene(l) }
      }
      if (l.length >= SCENE_TAK) return cur
      const ny = [...l, { id: fyrsteForm(val), t: [0, 0, 0] as Vec3, s: [1, 1, 1] as Vec3, rz: 0 }]
      const steg = Math.min(85, 760 / Math.max(1, ny.length - 1))
      const midt = (steg * (ny.length - 1)) / 2
      return { ...cur, scene: skrivScene(ny.map((b, i) => ({ ...b, t: [+(i * steg - midt).toFixed(2), b.t[1], b.t[2]] as Vec3 }))) }
    })
  }, [])
  // --- VERKTYET FOR KROPPEN --------------------------------------------------
  /**
   * FRÅ DET PLASSERTE ROMMET ATTENDE TIL BITANE SITT EIGE.
   *
   * `place` vender kroppen (X, so Y, so Z) og skalerer han. Fingeren gjev
   * millimeter i det ferdig plasserte rommet; ein bit står i det felles
   * rommet FØR vendinga. Difor vendinga snudd, i motsett rekkjefylgje, og
   * so delt på skalaen motoren rapporterte. Dette er ikkje geometri som
   * vert målt — det er ein finger som vert lesen, som skisseplanet.
   */
  const motVend = (d: Vec3, p: ParamBag): Vec3 => {
    const rad = (k: string) => ((typeof p[k] === "number" ? (p[k] as number) : 0) * Math.PI) / 180
    let [x, y, z] = d
    let c = Math.cos(-rad("rotZ"))
    let sn = Math.sin(-rad("rotZ"))
    let t = x * c - y * sn
    y = x * sn + y * c
    x = t
    c = Math.cos(-rad("rotY"))
    sn = Math.sin(-rad("rotY"))
    t = x * c + z * sn
    z = -x * sn + z * c
    x = t
    c = Math.cos(-rad("rotX"))
    sn = Math.sin(-rad("rotX"))
    t = y * c - z * sn
    z = y * sn + z * c
    y = t
    return [x, y, z]
  }
  /** ein bit skriven om: gjennom parametrane, so angre og lenkja gjeld */
  const skrivBit = useCallback((i: number, endra: Partial<Bit>) => {
    setParams((cur) => {
      const l = lesScene(String(cur.scene || "") || eiKjelde(String(cur.kjelde ?? KUBE)))
      if (!l[i]) return cur
      l[i] = { ...l[i], ...endra }
      return { ...cur, scene: skrivScene(l) }
    })
  }, [])
  const flyttBit = useCallback((dmm: Vec3) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    const k = kroppRef.current?.skala ?? 1
    if (!g || i === null || !(k > 0)) return
    const d = motVend(dmm, naa.current)
    skrivBit(i, { t: [g.t[0] + d[0] / k, g.t[1] + d[1] / k, g.t[2] + d[2] / k] as Vec3 })
  }, [skrivBit])
  /** klypet: alle tre aksane like mykje, so forholdet i biten står */
  const skalerBit = useCallback((faktor: number) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    if (!g || i === null || !Number.isFinite(faktor) || faktor <= 0) return
    skrivBit(i, { s: g.s.map((c) => klemBit(c * faktor)) as Vec3 })
  }, [skrivBit])
  /**
   * OG EI SIDE ÅLEINE: prikkane på boksen.
   *
   * Klypet gjer heile biten større og let forholdet stå. Prikken på ei side
   * dreg den EINE aksen, so ein kube vert ei plate og ein sylinder ein
   * oval. `akse` er 0, 1 eller 2 i biten sitt eige rom — det same rommet
   * `s` bur i — og faktoren er kor mykje sida har flytt seg, delt på kor
   * brei ho var.
   */
  const sideBit = useCallback((akse: 0 | 1 | 2, faktor: number) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    if (!g || i === null || !Number.isFinite(faktor) || faktor <= 0) return
    const s2 = [...g.s] as Vec3
    s2[akse] = klemBit(g.s[akse] * faktor)
    skrivBit(i, { s: s2 })
  }, [skrivBit])
  /**
   * LAGET BITEN EIG. Same paletten plana merkjer seg med, og det er
   * meininga: eit plan med det same laget høyrer til denne biten og vert
   * skore inne i boksen hans. Sjå `klippDist` i `snitt.ts`.
   */
  const fargBit = useCallback((farge: number) => {
    const i = bitRef.current
    if (i === null) return
    skrivBit(i, { farge: farge || undefined })
  }, [skrivBit])
  const vriBit = useCallback((grader: number) => {
    const g = grunn.current?.bit
    const i = bitRef.current
    if (!g || i === null || !Number.isFinite(grader)) return
    skrivBit(i, { rz: (((g.rz + grader) % 360) + 360) % 360 })
  }, [skrivBit])
  /** ein bit til, lik den valde og skoven litt til sides, og han er den valde */
  const dupliserBit = useCallback(() => {
    const i = bitRef.current
    if (i === null) return
    setParams((cur) => {
      const l = lesScene(String(cur.scene || "") || eiKjelde(String(cur.kjelde ?? KUBE)))
      const b = l[i]
      if (!b || l.length >= SCENE_TAK) return cur
      const ny: Bit = { ...b, t: [b.t[0] + 30 * b.s[0], b.t[1], b.t[2]] as Vec3 }
      return { ...cur, scene: skrivScene([...l.slice(0, i + 1), ny, ...l.slice(i + 1)]) }
    })
    setValdBit(i + 1)
  }, [])
  /** den valde biten bort. Er han den siste, er kroppen kjelda si eiga att. */
  const slettBit = useCallback(() => {
    const i = bitRef.current
    if (i === null) return
    setParams((cur) => {
      const l = lesScene(String(cur.scene || "") || eiKjelde(String(cur.kjelde ?? KUBE)))
      if (l.length <= 1 || !l[i]) return cur
      return { ...cur, scene: skrivScene(l.filter((_, j) => j !== i)) }
    })
    setValdBit(null)
  }, [])

  /**
   * ATTENDE TIL KJELDA ÅLEINE. Bitane bort, og plana står. Eit plan er ein
   * brøk av boksen kring kroppen, so det fylgjer kroppen når han vert mindre
   * — akkurat som når storleiken vert dregen. Ei ny FIL er noko anna: der
   * er kroppen ein annan, og plana var eit svar om den du hadde.
   */
  const tomScene = useCallback(() => {
    setParams((cur) => ({ ...cur, scene: "" }))
    // attende til kjelda åleine er ein annan kropp, ikkje ei redigering
    setRammInn((n) => n + 1)
  }, [])

  // --- GESTANE --------------------------------------------------------------
  /**
   * GRUNNSTODA er biten gesten tok i, slik han stod då fingrane landa: alt
   * det to fingrar gjer med han vert målt frå det punktet. Klypet er
   * kameraet sitt og vridinga er snittet sitt — begge held sitt eige, og
   * ingen av dei er parametrar.
   */
  const grunn = useRef<{ bit: Bit | null } | null>(null)
  const taGest = useCallback((kva: GestKva) => {
    const p = naa.current
    const i = bitRef.current
    const l = i === null ? [] : lesScene(String(p.scene || "") || eiKjelde(String(p.kjelde ?? KUBE)))
    grunn.current = kva === null ? null : { bit: i === null ? null : (l[i] ?? null) }
    if (kva === "rute") {
      const r = skilRute(lesPlan(p.plan))
      rutGrunn.current = [r.nx, r.ny]
    }
    if (kva === "virvel") virvGrunn.current = virvNo()
    else if (kva === null) {
      setRuteTal(null)
      setVirvelTal(null)
    }
    setGest(kva)
  }, [])
  /** brytaren mellom form og skisse, med lina som seier kva som gjeld no */
  /** rutenettet: to fingrar set kolonner og rader. Eit valt plan er ikkje eit rutenett, so valet går. */
  const vekslRute = useCallback(() => {
    setModus((m) => (m === "rute" ? "form" : "rute"))
    setValdBit(null)
    setVald(null)
  }, [])
  /** virvelen: to fingrar set kor mange ribber, og kor langt ut frå aksen */
  const vekslVirvel = useCallback(() => {
    setModus((m) => (m === "virvel" ? "form" : "virvel"))
    setValdBit(null)
    setVald(null)
  }, [])
  /**
   * MONTASJEN: kroppen som reiser seg av platene sine.
   *
   * Han var ein reiskap i tommelspalta og er ei FANE no. Det er den same
   * skilnaden som mellom «lag» og «kontur»: dei tre andre fanene syner
   * kvar sin lesemåte av det same objektet, og montasjen er den fjerde —
   * delane med vegen frå plata til kroppen i seg. Ein reiskap ENDRAR noko;
   * montasjen rører ikkje eit einaste tal, og han stod difor i ei spalte
   * full av knappar som gjer det.
   *
   * Tasten M står att, av di handa hugsar han.
   */
  const vekslMontasje = useCallback(() => {
    setView((v) => (v === "montasje" ? foer.current : "montasje"))
  }, [])
  /**
   * VERKTYET FOR KROPPEN: bitane står som boksar, og gestane gjeld den valde.
   *
   * Og han slepper planet, slik rutenettet, virvelen og montasjen gjer det.
   * Utan det stod BEGGE reiskapssetta i spalta samstundes — dei fem for
   * planet og dei to for biten, elleve knappar i alt — og stabelen rakk opp
   * i synskuben og la seg over innrammingsknappen. Du trykte på han, og
   * rutenettet tok trykket.
   */
  const vekslBit = useCallback(() => {
    setModus((m) => (m === "bit" ? "form" : "bit"))
    setValdBit(null)
    setVald(null)
  }, [])

  // --- PLANA -----------------------------------------------------------------
  /**
   * SKJER: skissa vert ein del. Punktet vert brøk av boksen kring kroppen, so
   * planet står på kroppen når storleiken endrar seg. Skissa står der ho
   * står, so du kan snu synet og skjere att — og den nye delen blinkar éin
   * gong når han kjem, so du ser kva du gjorde.
   */
  const laas = useCallback(() => {
    const s = skisse.current
    const k = kroppRef.current
    if (!s || !k) return
    const o = broek(s.o, k.min, k.max)
    if (o.some((c) => c < -0.5 || c > 1.5)) {
      setMelding("utanfor kroppen")
      return
    }
    // TAKET SEIER FRÅ. Lista stogga på seksti og fire og gav att posen han
    // fekk — men blinken fyrte likevel, so eit trykk på skjer lyste opp ein
    // del som aldri vart laga. Ein reiskap som gjer ingenting skal seie kva
    // han ikkje gjorde.
    const naaPlan = lesPlan(naa.current.plan)
    if (naaPlan.length >= PLAN_TAK) {
      setMelding(`taket er ${PLAN_TAK} plan`)
      return
    }
    /**
     * SYMMETRIEN LAGAR SNITTA, og so er ho ferdig med dei. Éin brytar gjev
     * to snitt, to gjev fire, tre gjev åtte — spegla om midtplana i kroppen,
     * kvart med sitt eige namn. Eit snitt som speglar seg til seg sjølv
     * (gjennom midten, på tvers av aksen du speglar om) er éin del og ikkje
     * to, so det vert lagt til éin gong.
     */
    const nye: { o: Vec3; n: Vec3 }[] = []
    for (const akser of speglingar(speil)) {
      let q = { o, n: s.n }
      for (const a of akser) q = spegla(q.o, q.n, a)
      if (!nye.some((r) => sameSnitt(r, q))) nye.push(q)
    }
    // Taket kappar, og seier frå om det kappa noko.
    const tek = nye.slice(0, PLAN_TAK - naaPlan.length)
    if (tek.length < nye.length) setMelding(`taket er ${PLAN_TAK} plan`)
    const id = nyId(naaPlan)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      if (l.length >= PLAN_TAK) return cur
      let i = nyId(l)
      // to eller fleire snitt av éi spegling høyrer i hop: dei er ei gruppe
      const gruppe = tek.length > 1 ? nyGruppe(l) : 0
      return { ...cur, plan: skrivPlan([...l, ...tek.map((q) => ({ id: i++, o: q.o, n: q.n, bog: 0, strek: [], ...(gruppe ? { gruppe } : {}) }))].slice(0, PLAN_TAK)) }
    })
    setBlink(id)
  }, [speil])
  /**
   * DUPLISER DET VALDE PLANET.
   *
   * Same normal, same strek, skuva eitt hakk langs normalen sin so det ikkje
   * vert liggjande oppi det du kopierte. Hakket er to platetjukner, i BRØK
   * av kroppen — plana bur i brøk, og eit tal i millimeter ville flytta seg
   * når du skalerte kroppen. Det nye planet vert valt: du dupliserer for å
   * flytte kopien, ikkje for å sjå på henne.
   */
  const dupliserPlan = useCallback((id: number) => {
    const k = kroppRef.current
    if (!k) return
    const l = lesPlan(naa.current.plan)
    const j = l.findIndex((q) => q.id === id)
    if (j < 0) return
    if (l.length >= PLAN_TAK) return setMelding(`taket er ${PLAN_TAK} plan`)
    const t = typeof naa.current.tjukn === "number" ? naa.current.tjukn : 6
    const q = l[j]
    // heile gruppa når ho er vald: kvart plan eit hakk langs si eiga normal, og kopiane er ei ny gruppe
    const g = gruppeNo.current.g
    const kjelde = g !== null && q.gruppe === g ? iGruppa(l, g) : [q]
    if (l.length + kjelde.length > PLAN_TAK) return setMelding(`taket er ${PLAN_TAK} plan`)
    const skuv = (p: Plan): Vec3 =>
      p.o.map((c, a) => {
        const vidd = Math.max(1e-6, k.max[a] - k.min[a])
        return Math.min(1, Math.max(0, +(c + (p.n[a] * 2 * t) / vidd).toFixed(4)))
      }) as Vec3
    const nyG = kjelde.length > 1 ? nyGruppe(l) : 0
    let ny = nyId(l)
    const leiar = ny + kjelde.findIndex((p) => p.id === id)
    setParams((cur) => {
      const m = lesPlan(cur.plan)
      if (m.length + kjelde.length > PLAN_TAK) return cur
      let i = nyId(m)
      ny = i
      return { ...cur, plan: skrivPlan([...m, ...kjelde.map((p) => ({ id: i++, o: skuv(p), n: p.n, bog: p.bog, strek: p.strek, ...(nyG ? { gruppe: nyG } : {}) }))]) }
    })
    setVald(leiar)
    setValdGruppe(nyG || null)
    setBlink(leiar)
  }, [])
  /**
   * BØYEN PÅ EIT PLAN, sett med ein finger.
   *
   * Talet er krumming gonge storleik (sjå `Plan.bog`), so det du bøygde
   * fylgjer kroppen når han vert skalert. Draget går oppover for meir bøy
   * mot normalen og nedover for meir mot den andre vegen, med null i
   * midten — og null er flatt, ikkje ein grense du må treffe.
   *
   * Kva materialet TOLER er ikkje klemt her: regelen `bog` reknar radien i
   * millimeter mot tjukna og seier frå, med eit råd som rettar ut til det
   * som går. Ein skyvar som stogga deg ville ikkje kunna seie kvifor.
   */
  /**
   * KVA EIN OPERATOR TEK: planet, eller heile gruppa når ho er vald.
   *
   * Det er den same regelen som laget, slett og dubler alt fylgjer — ei
   * gruppe svarar som éi — og operatorane under er dei fyrste som er
   * skrivne med han i staden for kring han.
   */
  const iScope = (l: readonly Plan[], id: number): Set<number> => {
    const g = gruppeNo.current.g
    const q = l.find((p) => p.id === id)
    return new Set(g !== null && q?.gruppe === g ? iGruppa(l, g).map((p) => p.id) : [id])
  }
  /**
   * FORMA: PROFILEN FROSEN TIL PUNKT, OG PUNKTA HANDA DREG I.
   *
   * Eitt trykk frys profilen slik han står: den største ringen, forenkla
   * til noko ei hand kan ta i, skriven inn i planet som eit omriss. Frå då
   * av er det omrisset som ER profilen — kroppen vert ikkje lesen for dette
   * planet — og kvart punkt står som eit handtak i rommet.
   */
  const frysOmriss = useCallback((id: number) => {
    const k = kroppRef.current
    const stor = stoersteRing(snittRef.current)
    if (!k || !stor) return
    /**
     * FORENKLA HEILT NED TIL DET HANDA KAN TA I. Konturen har eit punkt på
     * kvar rutekant — hundrevis — og taket er fire og tjue. Toleransen vert
     * dobla til lista går inn under det: ei forenkling som KUTTA lista ville
     * late att mangekanten på ein annan stad enn ho var open.
     */
    let pts = stor as Pt[]
    for (let tol = 0.25; pts.length > OMRISS_TAK && tol < 4096; tol *= 2) pts = simplify(stor as Pt2[], tol) as Pt[]
    if (pts.length < 3) return
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0) return cur
      const r = planRamme(l[j], k.min, k.max)
      const S = storleikAv(cur)
      const ou = dot(r.o, r.u)
      const ov = dot(r.o, r.v)
      // ein frosen profil er hjørne: bogane frå ei tidlegare form peikar på
      // punkt som ikkje finst meir
      l[j] = { ...l[j], omriss: pts.slice(0, OMRISS_TAK).map((q) => klemPunkt([(q[0] - ou) / S, (q[1] - ov) / S])), runde: undefined }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /**
   * DOBBELTTRYKKET: BOKSEN KRING FORMA, SOM FIRE PUNKT DU KAN DRA I.
   *
   * Ei ribbe gjennom eit dyr er ein kontur med øyre og hovar, og av og til
   * er det plata du vil ha. Boksen kring det omrisset som står — eller kring
   * profilen, om ingen står — er fire punkt, og dei er punkt som alle andre:
   * du dreg eitt hjørne skeivt og har ei trapes.
   */
  const firkantOmriss = useCallback((id: number) => {
    const k = kroppRef.current
    if (!k) return
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0) return cur
      const S = storleikAv(cur)
      let b: { x0: number; y0: number; x1: number; y1: number }
      // boksen kring det forma FAKTISK er: ein boge bular utanfor punkta sine
      if (l[j].omriss?.length) b = bbox(omrissLine(l[j].omriss as Pt[], l[j].runde))
      else {
        // same ringen frysinga tek: eit dobbelttrykk i eitt drag og eit
        // dobbelttrykk etter eit sleppt omriss skal gje den same boksen
        const stor = stoersteRing(snittRef.current)
        if (!stor) return cur
        const r = planRamme(l[j], k.min, k.max)
        const ou = dot(r.o, r.u)
        const ov = dot(r.o, r.v)
        b = bbox(stor.map((q): Pt => [(q[0] - ou) / S, (q[1] - ov) / S]))
      }
      const { x0, y0, x1, y1 } = b
      if (!(x1 > x0 && y1 > y0)) return cur
      // ein boks er fire hjørne, og ingen ting anna
      l[j] = { ...l[j], omriss: [klemPunkt([x0, y0]), klemPunkt([x1, y0]), klemPunkt([x1, y1]), klemPunkt([x0, y1])], runde: undefined }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /** og eit trykk til slepper forma: profilen er nettet att */
  const losOmriss = useCallback((id: number) => {
    setValdPunkt(null)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0 || !l[j].omriss) return cur
      const { omriss: _, runde: _r, ...utan } = l[j]
      l[j] = utan
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /**
   * EIT PUNKT TIL, SETT INN RETT ETTER `i`.
   *
   * Rekkjefylgja i lista ER mangekanten — kva punkt som er nabo til kva — so
   * eit nytt punkt må inn der kanten var og ingen annan stad. Lagt bakarst
   * ville det dregi ei line tvers over forma.
   */
  const leggPunkt = useCallback((id: number, i: number, q: Pt) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i] || om.length >= OMRISS_TAK) return cur
      const ny = om.slice()
      ny.splice(i + 1, 0, klemPunkt(q))
      // BOGANE ER PLASSAR, so eit punkt sett inn flyttar dei bakanfor seg.
      // Nytt punkt er eit hjørne: det du drog ut skal vera der du sette det.
      l[j] = { ...l[j], omriss: ny, ...skiftRunde(l[j].runde, (k) => (k > i ? k + 1 : k)) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /** og eit punkt bort. Tre er golvet: under det er det inga flate. */
  const taPunkt = useCallback((id: number, i: number) => {
    setValdPunkt(null)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i] || om.length <= 3) return cur
      l[j] = { ...l[j], omriss: om.filter((_, k) => k !== i), ...skiftRunde(l[j].runde, (k) => (k === i ? null : k > i ? k - 1 : k)) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /**
   * HJØRNE ELLER BOGE: DOBBELTTRYKKET PÅ PUNKTET.
   *
   * Eitt flagg og ingen kontrollarmar. Ein boge er rekna av naboane sine
   * (sjå `omrissLine`), so det finst ikkje eit handtak til å dra i — og det
   * er meininga: to armar per punkt er fire fleire ting å bomme på med ein
   * tommel, og kurva du får er den mjukaste som går gjennom dei punkta du
   * alt har sett.
   */
  const vriPunkt = useCallback((id: number, i: number) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i]) return cur
      const har = l[j].runde ?? []
      const ny = har.includes(i) ? har.filter((k) => k !== i) : [...har, i].sort((a, b) => a - b)
      l[j] = { ...l[j], ...(ny.length ? { runde: ny } : { runde: undefined }) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /**
   * EIT PUNKT EITT HAKK MED PILENE — millimeter i planet si EIGA ramme.
   *
   * Ikkje langs normalen, som pilene gjer med eit heilt plan: eit punkt bur
   * i profilen, og profilen er det du ser på plata. Høgre er +u og opp er
   * +v, dei same to aksane delen ligg i når han vert skoren, so ei pil
   * flyttar punktet den vegen du ser det gå.
   */
  const stegPunkt = useCallback((id: number, i: number, du: number, dv: number) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i]) return cur
      const S = storleikAv(cur)
      const ny = om.slice()
      ny[i] = klemPunkt([om[i][0] + du / S, om[i][1] + dv / S])
      l[j] = { ...l[j], omriss: ny }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /** eit punkt drege, der fingeren slapp det */
  const flyttPunkt = useCallback((id: number, i: number, q: Pt) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((p) => p.id === id)
      const om = l[j]?.omriss
      if (!om || !om[i]) return cur
      const ny = om.slice()
      ny[i] = klemPunkt(q)
      l[j] = { ...l[j], omriss: ny }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /**
   * EITT TRYKK, TO TRYKK, OG TRYKKET ETTER DET.
   *
   * Knappen gjer tre ting, og tida mellom trykka er det som skil dei: eitt
   * trykk frys profilen (eller slepper forma som står), og eit trykk til
   * innan vindauget gjer dei fire punkta i boksen kring henne. Difor endar
   * eit dobbelttrykk ALLTID i boksen, same kva planet bar frå før — det
   * fyrste trykket i det er berre eit steg på vegen.
   *
   * Vindauget er det same som eit trykk på lerretet får: eit trykk er kort,
   * og to trykk som er lengre frå kvarandre enn dette er to trykk.
   */
  const sisteForm = useRef(0)
  const formTrykk = useCallback(() => {
    const id = valdRef.current
    if (id === null) return
    const no = performance.now()
    const dobbelt = no - sisteForm.current < DOBBELT_MS
    sisteForm.current = no
    if (dobbelt) return firkantOmriss(id)
    if (lesPlan(naa.current.plan).find((q) => q.id === id)?.omriss?.length) losOmriss(id)
    else frysOmriss(id)
  }, [firkantOmriss, frysOmriss, losOmriss])
  /**
   * VIRRET: EI RAD SOM IKKJE STÅR PÅ LINE.
   *
   * Eit rutenett er jamt, og jamt er ærleg — men ei rad ribber som står
   * millimeteren jamt er òg ei rad ingen har teke i. Virret skuvar kvart
   * plan i den valde gruppa langs si EIGA normal, med eit hakk som er
   * gjeve av namnet og ikkje av tilfeldet: same planet får same hakket
   * kvar gong, so eit drag opp og eit like langt drag ned tek rada
   * nøyaktig attende dit ho stod.
   *
   * Og det vert skrive inn i PUNKTA, som alt anna handa gjer. Talet i rada
   * er det du har lagt på medan du står her; det som ligg i strengen er
   * kvar plana står, og det er den einaste sanninga om dei. Difor kan
   * handtaka, pilene og angre ta i dei etterpå utan å vite om virret.
   */
  const virrPlan = useCallback((dmm: number) => {
    const k = kroppRef.current
    if (!k || !dmm) return
    setParams((cur) => {
      const g = gruppeNo.current.g
      if (g === null) return cur
      const l = lesPlan(cur.plan)
      const treff = new Set(iGruppa(l, g).map((p) => p.id))
      if (!treff.size) return cur
      // MIDT PÅ NULL: hakka er tilfeldige nok til at summen deira ikkje er
      // det, og ei rad som glir sidelengs medan du virrar er ei rad du
      // ikkje bad om å flytte. Difor midten av dei, trekt frå kvart hakk.
      const midt = [...treff].reduce((sum, id) => sum + stoy(id), 0) / treff.size
      return {
        ...cur,
        plan: skrivPlan(
          l.map((p) => {
            if (!treff.has(p.id)) return p
            const f = (stoy(p.id) - midt) * dmm
            return {
              ...p,
              o: p.o.map((c, a) => Math.min(1, Math.max(0, +(c + (p.n[a] * f) / Math.max(1e-6, k.max[a] - k.min[a])).toFixed(4)))) as Vec3,
            }
          }),
        ),
      }
    })
  }, [])
  /** mjukinga: eit drag, som bøyen. Under eit halvt promille er ho ingen ting */
  const mjukPlan = useCallback((id: number, d: number) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const treff = iScope(l, id)
      const mine = l.filter((p) => treff.has(p.id))
      if (!mine.length) return cur
      const naa = Math.max(...mine.map((p) => p.mjuk ?? 0))
      const v = Math.max(0, Math.min(MJUK_TAK, naa + d))
      if (Math.abs(v - naa) < 1e-6) return cur
      const mjuk = v < 0.0005 ? 0 : +v.toFixed(4)
      return {
        ...cur,
        plan: skrivPlan(
          l.map((p) => {
            if (!treff.has(p.id)) return p
            const { mjuk: _, ...utan } = p
            return mjuk ? { ...utan, mjuk } : utan
          }),
        ),
      }
    })
  }, [])
  const boyPlan = useCallback((id: number, d: number) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const i = l.findIndex((q) => q.id === id)
      if (i < 0) return cur
      const b = Math.max(-BOG_TAK, Math.min(BOG_TAK, l[i].bog + d))
      if (Math.abs(b - l[i].bog) < 1e-6) return cur
      l[i] = { ...l[i], bog: Math.abs(b) < 0.01 ? 0 : +b.toFixed(4) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /**
   * EIT LEDD DELT PÅ NYTT, FRÅ ROMMET.
   *
   * Det same `deling` plata skriv: nøkkelen er leddet, talet er kvar
   * botnen står på strekket det kan delast på. Begge spora les den same
   * lina frå kvar si side, so den eine vert grunnare når den andre vert
   * djupare — her som der.
   */
  const setjDeling = useCallback((nokkel: string, t: number) => {
    setParams((cur) => {
      const m = new Map(lesDeling(cur.deling))
      if (m.get(nokkel) === t) return cur
      m.set(nokkel, t)
      return { ...cur, deling: skrivDeling(m) }
    })
  }, [])
  /** eit plan flytt eller vinkla om av fingrane — gjennom parametrane, so angre og lenkja gjeld */
  const flyttPlan = useCallback((id: number, o: Vec3, n: Vec3) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const i = l.findIndex((p) => p.id === id)
      if (i < 0) return cur
      const { g, fordel } = gruppeNo.current
      return { ...cur, plan: skrivPlan(medGruppa(l, i, o, n, g, fordel)) }
    })
  }, [])
  /** planet bort — og festa til delane hans, som ikkje peikar på noko lenger.
   *  Er gruppa hans vald, går heile gruppa. */
  const slett = useCallback((id: number) => {
    const l = lesPlan(naa.current.plan)
    const q = l.find((p) => p.id === id)
    const g = gruppeNo.current.g
    const bort = new Set(g !== null && q?.gruppe === g ? iGruppa(l, g).map((p) => p.id) : [id])
    setVald((v) => (v !== null && bort.has(v) ? null : v))
    setParams((cur) => {
      const m = lesFest(cur.fest)
      for (const adr of [...m.keys()]) if (bort.has(Number(/^\d+/.exec(adr)?.[0]))) m.delete(adr)
      return { ...cur, plan: skrivPlan(lesPlan(cur.plan).filter((p) => !bort.has(p.id))), fest: skrivFest(m) }
    })
  }, [])
  /** laget på det valde planet — eller på heile gruppa, når ho er vald. Null tek merket bort. */
  const setFarge = useCallback((farge: number) => {
    const { g } = gruppeNo.current
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const v = valdRef.current
      if (v === null) return cur
      const q = l.find((p) => p.id === v)
      if (!q) return cur
      const treff = new Set(g !== null && q.gruppe === g ? iGruppa(l, g).map((p) => p.id) : [v])
      const ny = l.map((p) => {
        if (!treff.has(p.id)) return p
        const { farge: _, ...utan } = p
        return farge ? { ...utan, farge } : utan
      })
      return { ...cur, plan: skrivPlan(ny) }
    })
  }, [])
  /** heile gruppa bort, frå lista — utan å velje henne fyrst */
  const slettGruppe = useCallback((g: number) => {
    const bort = new Set(iGruppa(lesPlan(naa.current.plan), g).map((p) => p.id))
    setVald((v) => (v !== null && bort.has(v) ? null : v))
    setParams((cur) => {
      const m = lesFest(cur.fest)
      for (const adr of [...m.keys()]) if (bort.has(Number(/^\d+/.exec(adr)?.[0]))) m.delete(adr)
      return { ...cur, plan: skrivPlan(lesPlan(cur.plan).filter((p) => !bort.has(p.id))), fest: skrivFest(m) }
    })
  }, [])
  /** eit plan valt i scena eller lista; ein del valt på plata eller i kuttlista. Eit anna plan er eit anna strek, og ingen er valt. */
  const velPlan = useCallback((id: number | null) => {
    setVald(id)
    setValdGruppe(null)
    setValdStrek(null)
    setPeikt(id === null ? null : (liste.find((k) => k.plan === id)?.adr ?? null))
  }, [liste])
  /** gruppa vald: det siste planet i rada er leiaren handa held i */
  const velGruppe = useCallback((g: number) => {
    const rad = iGruppa(lesPlan(naa.current.plan), g)
    if (!rad.length) return
    const id = rad[rad.length - 1].id
    setVald(id)
    setValdGruppe(g)
    setValdStrek(null)
    setPeikt(liste.find((k) => k.plan === id)?.adr ?? null)
  }, [liste])
  /**
   * EIN REISKAP STÅR DER HAN VERKAR.
   *
   * Går du frå rommet til plata eller montasjen, er reiskapen sleppt med
   * det same: knappen hans står ikkje der, og eit rutenett som er på utan
   * ein knapp å slå det av med er ein modus du ikkje kjem ut av.
   *
   * MONTASJEN SLEPPER VALET MED. Handtaka på eit plan ville stått i eit
   * objekt som er halvvegs teke frå kvarandre. Plata held på det: ei rad i
   * lista og ein del på arket er det same valet, og laget på det er ein
   * operasjon du SER der.
   */
  useEffect(() => {
    if (rom) return
    setModus("form")
    setValdBit(null)
    if (view !== "montasje") return
    setValdPunkt(null)
    velPlan(null)
  }, [rom, view, velPlan])
  // ei ny gruppe er ei ny rad: virret du la på den førre fylgjer ikkje med
  useEffect(() => { setVirr(0) }, [valdGruppe])
  // ei gruppe er vald berre so lenge leiaren står i henne: eit anna plan, eit angre, ei sletting slepper gruppa
  useEffect(() => {
    if (valdGruppe === null) return
    if (vald === null || !plan.some((p) => p.id === vald && p.gruppe === valdGruppe)) setValdGruppe(null)
  }, [vald, plan, valdGruppe])
  // eit strek som ikkje finst lenger — planet bytt, streken sletta, eit angre — er ikkje valt
  useEffect(() => {
    if (valdStrek === null) return
    const pl = vald === null ? undefined : plan.find((q) => q.id === vald)
    if (!pl || valdStrek >= pl.strek.length) setValdStrek(null)
  }, [vald, plan, valdStrek])
  /**
   * STREKA: gods eller hòl i det valde planet, midt i snittet, og valt med det
   * same so handtaka står på det. Midten er tyngdepunktet i det største
   * stykket, lese av snittet motoren alt har svara med. Streken står relativt
   * til planet sitt punkt, som brøk av storleiken, so det du teikna fylgjer
   * kroppen når han vert skalert — sjå `lib/plan.ts`. Alt går gjennom
   * parametrane: angre, lenkja og økta får det utan ei line til.
   */
  const leggStrek = useCallback((slag: Strek["slag"]) => {
    const id = vald
    if (id === null) return
    const l = lesPlan(naa.current.plan)
    const j = l.findIndex((q) => q.id === id)
    if (j < 0) return
    const k = kroppRef.current
    const S = typeof naa.current.storleik === "number" ? naa.current.storleik : 150
    let x = 0
    let y = 0
    if (k && snitt?.ringar.length) {
      const r = planRamme(l[j], k.min, k.max)
      const m = snittMidt(snitt)
      x = (m[0] - dot(r.o, r.u)) / S
      y = (m[1] - dot(r.o, r.v)) / S
    }
    const s: Strek = slag === "gods" ? { slag, form: "rekt", x, y, w: 0.25, h: 0.12, a: 0 } : { slag, form: "rund", x, y, w: 0.08, h: 0.08, a: 0 }
    const i = l[j].strek.length
    setParams((cur) => {
      const ll = lesPlan(cur.plan)
      const jj = ll.findIndex((q) => q.id === id)
      if (jj < 0) return cur
      ll[jj] = { ...ll[jj], strek: [...ll[jj].strek, s] }
      return { ...cur, plan: skrivPlan(ll) }
    })
    setValdStrek(i)
  }, [vald, snitt])
  /** streken slik fingrane la han frå seg: eitt steg i angre */
  const endraStrek = useCallback((id: number, i: number, s: Strek) => {
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0 || !l[j].strek[i]) return cur
      const strek = l[j].strek.slice()
      strek[i] = s
      l[j] = { ...l[j], strek }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [])
  /** medan fingeren dreg: motoren snittar planet med streken der han står no, utan å røre parametrane */
  const synStrek = useCallback((id: number, i: number, s: Strek) => {
    const l = lesPlan(naa.current.plan)
    const j = l.findIndex((q) => q.id === id)
    if (j < 0 || !l[j].strek[i]) return
    const strek = l[j].strek.slice()
    strek[i] = s
    l[j] = { ...l[j], strek }
    spørSkisse(l[j], { ...naa.current, plan: skrivPlan(l) })
  }, [spørSkisse])
  const slettStrek = useCallback(() => {
    const id = vald
    const i = valdStrek
    if (id === null || i === null) return
    setValdStrek(null)
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const j = l.findIndex((q) => q.id === id)
      if (j < 0) return cur
      l[j] = { ...l[j], strek: l[j].strek.filter((_, k) => k !== i) }
      return { ...cur, plan: skrivPlan(l) }
    })
  }, [vald, valdStrek])
  const askArk = useCallback((i: number) => send({ kind: "ark", id: ++reqId.current, params: naa.current, sheet: Math.max(0, i) }), [send])
  /**
   * MONTASJEN VERT SPURD OM NÅR FANA STÅR FRAMME, og på nytt kvar gong noko
   * som endrar delane endrar seg. Ikkje kvar gong KVA SOM HELST endrar seg:
   * eit drag i lyset eller eit byte av lesemåte lagar ikkje ein einaste ny
   * del, og å rekne heile montasjen om att for det ville teke reiskapen frå
   * å vera til å scrubbe i.
   *
   * OG NØKKELEN ER MOTOREN SIN. Han stod som ei handskriven liste på ni
   * parametrar her, og det er den same feilen to gonger: `byggKey` er
   * nøyaktig det `makeBygg` hugsar på, og montasjen er bygd av det bygget.
   * Lista mangla vendinga, glattinga, forenklinga, klaringa, leddlengda —
   * alt `params.ts` seier tel — so eit drag i «vend x» let animasjonen
   * spele delane til den forrige kroppen, med gamle steg i lina.
   */
  const montNokkel = view === "montasje" ? byggKey(params, 0) : ""
  useEffect(() => {
    if (!montNokkel) return setMont(null)
    send({ kind: "montasje", id: ++reqId.current, params: naa.current })
  }, [montNokkel, send])
  const velDel = useCallback((adr: string | null) => {
    setPeikt(adr)
    const k = adr ? liste.find((q) => q.adr === adr) : undefined
    setVald(k ? k.plan : null)
    // plata fylgjer den du vel
    if (k?.ark && view === "kontur" && ark && ark.i !== k.ark - 1) askArk(k.ark - 1)
  }, [liste, view, ark, askArk])

  // --- VIRVELEN ------------------------------------------------------------------
  /**
   * DET ANDRE RIBBESPRÅKET. Rutenettet gjev ribber på tvers av kvarandre;
   * virvelen gjev dei kring loddaksen — n ribber, kvar vridd `2π·i/n`, og
   * kvar skoven ut so ho tek på ein sirkel i staden for å gå gjennom midten.
   * Vassrett set kor mange, loddrett kor langt ut.
   *
   * SKUVET ER HEILE SAKA. Går alle gjennom aksen, kryssar dei kvarandre
   * langs den same lina: tjue plan vart to delar og seks og tretti lause
   * stykke då det vart målt. Difor er `r` klemt over null. Og dei to tala
   * heng saman — tre ribber på 0,30 kryssar ikkje kvarandre i det heile —
   * so lina over kroppen syner begge medan du dreg, og lina i arket syner
   * kva som kom ut.
   *
   * VIDDA TIL KROPPEN GÅR MED INN, av di eit punkt i eit plan er brøkar av
   * boksen og boksen ikkje er kvadratisk (sjå `virvel` i plan.ts).
   */
  const virvGrunn = useRef<[number, number]>(VIRVEL_START)
  /** kva virvelen står på no: tala som skreiv lista, om lista er hans. Er ho
   *  ikkje det, byrjar han der han sist stod — ein virvel lèt seg ikkje lesa
   *  attende ut av ei vilkårleg liste slik to aksetal gjer. */
  const virvSist = useRef<[number, number]>(VIRVEL_START)
  const virvNo = useCallback((): [number, number] => {
    const k = kroppRef.current
    const [n, r] = virvSist.current
    if (k && skrivPlan(virvel(n, r, vidd(k))) === String(naa.current.plan)) return [n, r]
    return virvSist.current
  }, [])
  const dragVirvel = useCallback((dx: number, dy: number) => {
    const k = kroppRef.current
    if (!k) return
    const [n0, r0] = virvGrunn.current
    const n = Math.max(2, Math.min(PLAN_TAK, n0 + Math.round(dx / VIRVEL_STEG)))
    const r = Math.max(VIRVEL_R.min, Math.min(VIRVEL_R.max, +(r0 + Math.round(-dy / VIRVEL_STEG) * VIRVEL_R_STEG).toFixed(3)))
    virvSist.current = [n, r]
    setVirvelTal([n, r])
    setParams((cur) => {
      const plan = skrivPlan(virvel(n, r, vidd(k)))
      return cur.plan === plan ? cur : { ...cur, plan, fest: "" }
    })
  }, [])

  // --- RUTENETTET ----------------------------------------------------------------
  /**
   * TO TAL, OG ALT FYLGJER. Rutenettet var reiskapen denne saka byrja med,
   * og det som mangla var ikkje eit søk som gjetta på dei to tala for deg —
   * det var ein måte å setje dei på med fingrane. Vassrett er kolonner,
   * loddrett er rader, og fyrtifire pikslar er eitt plan. Grunnstoda er det
   * som ALT står: plan langs x og plan langs y, talde, so verktyet held fram
   * der nettet ditt slutta.
   *
   * HAN TEK BERRE SITT EIGE. Han skreiv lista OM før — eit rutenett var ei
   * liste og ikkje eit tillegg — og ti plan du hadde sett for hand var borte
   * i det du tok i han. No eig han dei plana eit rutenett ville laga, kjende
   * att på geometrien (`skilRute` i `plan.ts`), og alt anna står: namnet
   * sitt, streka sine, laget sitt og plassen sin på plata.
   *
   * Difor byrjar namna og gruppene der DEI ANDRE sluttar, og taket er det
   * som er att av dei seksti og fire. Festa til dei som står, står; berre
   * dei som peika på ei ribbe som gjekk, går.
   *
   * Éin skrift per steg — tala er heiltal — og eitt steg i angre for heile
   * gesten, av di gesten melder seg til `taGest` medan han varer.
   */
  const rutGrunn = useRef<[number, number]>([0, 0])
  /** rein rekning, so oppdateringa kan kallast to gonger: lista med det nye
   *  nettet i, og dei to tala han vart */
  const ruteSteg = useCallback((cur: ParamBag, dx: number, dy: number) => {
    const [nx0, ny0] = rutGrunn.current
    const { andre } = skilRute(lesPlan(cur.plan))
    const rom = Math.max(0, PLAN_TAK - andre.length)
    const tak = Math.min(Math.floor(PLAN_TAK / 2), rom)
    let nx = Math.max(0, Math.min(tak, nx0 + Math.round(dx / RUTE_STEG)))
    let ny = Math.max(0, Math.min(tak, ny0 + Math.round(-dy / RUTE_STEG)))
    // dei to saman skal heller ikkje sprengje taket; den sist rørte vik
    if (nx + ny > rom) {
      if (Math.abs(dy) > Math.abs(dx)) ny = Math.max(0, rom - nx)
      else nx = Math.max(0, rom - ny)
    }
    return { nx, ny, liste: [...andre, ...rutenett(nx, ny, nyId(andre), nyGruppe(andre))] }
  }, [])
  const dragRute = useCallback((dx: number, dy: number) => {
    const { nx, ny } = ruteSteg(naa.current, dx, dy)
    setRuteTal([nx, ny])
    setParams((cur) => {
      const { liste } = ruteSteg(cur, dx, dy)
      const plan = skrivPlan(liste)
      if (cur.plan === plan) return cur
      // festa til dei som står, står. Nøkkelen er adressa til delen, og ho
      // byrjar på namnet til planet — «3» eller «3a».
      const att = new Set(liste.map((q) => q.id))
      const m = lesFest(cur.fest)
      for (const adr of [...m.keys()]) if (!att.has(Number(/^\d+/.exec(adr)?.[0]))) m.delete(adr)
      return { ...cur, plan, fest: skrivFest(m) }
    })
  }, [ruteSteg])

  // --- FILER ---------------------------------------------------------------------
  const hentArk = useCallback((i: number) => {
    const id = ++reqId.current
    const svar = new Promise<ArkRes>((ok, nei) => {
      arkVent.current.set(id, ok)
      window.setTimeout(() => {
        if (arkVent.current.delete(id)) nei(new Error("plata kom ikkje"))
      }, 20000)
    })
    send({ kind: "ark", id, params: naa.current, sheet: i })
    return svar
  }, [send])
  /** platene som bilete, rasteriserte HER: ein arbeidar har ingen Image, og
   *  geometrien er framleis hans — same SVG som uttaket skriv */
  const pngAvArk = useCallback(async () => {
    const n = Math.max(0, tal?.metrics.sheets ?? 0)
    if (!n) return
    setBusy(true)
    try {
      const filer: { name: string; data: Uint8Array }[] = []
      const st = stamme(kjeldeNamn)
      for (let i = 0; i < n; i++) {
        const a = await hentArk(i)
        // fire pikslar per millimeter, med tak på lengste kanten: fire plater i minnet på ein telefon
        const pxmm = Math.min(4, 2400 / Math.max(a.arkB, a.arkH, 1))
        const w = Math.max(1, Math.round(a.arkB * pxmm))
        const h = Math.max(1, Math.round(a.arkH * pxmm))
        const kilde = a.svg.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 width="${w}" height="${h}"`)
        filer.push({ name: n <= 1 ? `${st}-ark.png` : `${st}-ark-${i + 1}av${n}.png`, data: await tilPng(kilde, w, h) })
      }
      if (filer.length === 1) void lastNed(new Blob([filer[0].data as BlobPart], { type: "image/png" }), filer[0].name)
      else void lastNed(new Blob([zip(filer) as BlobPart], { type: "application/zip" }), `${st}-ark-png.zip`)
    } catch {
      setFeil("png feila")
    } finally {
      setBusy(false)
    }
  }, [tal, hentArk, kjeldeNamn])
  const doExport = useCallback((what: ExportKind) => {
    if (what === "png") return void pngAvArk()
    setBusy(true)
    send({ kind: "export", id: ++reqId.current, params: naa.current, what })
  }, [pngAvArk, send])
  const share = useCallback(() => {
    const url = window.location.href
    if (navigator.share) return void navigator.share({ url })
    void navigator.clipboard?.writeText(url).then(() => setMelding("lenkje kopiert")).catch(() => setMelding("ikkje kopiert"))
  }, [])
  /**
   * FILA INN: lesen her, tolka i arbeidaren, bufferen overført og ikkje
   * kopiert. Ein KOPI vert liggjande att her medan svaret er i lufta, av di
   * det er fyrst i svaret nettet får namnet sitt — og namnet er det basen
   * skal leggje henne under. Kopien går so snart ho er skriven ned.
   */
  const takeFile = useCallback(async (f: File) => {
    if (f.size > MAX_FIL) return setFeil("for stor")
    setFeil(null)
    setBusy(true)
    setHentar(true)
    try {
      const buf = await f.arrayBuffer()
      const id = ++reqId.current
      bytar.current.set(id, { namn: f.name, buf: buf.slice(0) })
      // ein bit vald: fila byter HAN. Ei prosjektfil er eit heilt oppsett og
      // byter ingen bit — ho kjem attende som «prosjekt» og les seg sjølv.
      if (bitRef.current !== null && !/\.zip$/i.test(f.name)) bytSvar.current.set(id, bitRef.current)
      send({ kind: "import", id, name: f.name, buf }, [buf])
    } catch {
      setFeil("ulesbar fil")
      setHentar(false)
      setBusy(false)
    }
  }, [send])
  // slepp ei fil kvar som helst på sida: ein reiskap som krev ein bestemt firkant har ikkje forstått drag-og-slepp
  useEffect(() => {
    let djup = 0
    const filer = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files")
    const inn = (e: DragEvent) => { if (filer(e)) { e.preventDefault(); djup++; setDrag(true) } }
    const over = (e: DragEvent) => { if (filer(e)) e.preventDefault() }
    const ut = () => { djup = Math.max(0, djup - 1); if (!djup) setDrag(false) }
    const slepp = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0]
      if (!f) return
      e.preventDefault()
      djup = 0
      setDrag(false)
      void takeFile(f)
    }
    const par: [string, (e: DragEvent) => void][] = [["dragenter", inn], ["dragover", over], ["dragleave", ut], ["drop", slepp]]
    for (const [n, h] of par) window.addEventListener(n, h as EventListener)
    return () => { for (const [n, h] of par) window.removeEventListener(n, h as EventListener) }
  }, [takeFile])

  const opneVerkty = useCallback((id: VerktyId) => {
    setVerkty((v) => (v === id ? null : id))
    // på telefonen deler arket og skuffa den same kanten: arket går til lina
    if (!benk) setSteg("line")
  }, [benk])
  // står plateflata framme og noko flyttar seg, skal ho fylgje med
  useEffect(() => {
    if (view === "kontur") askArk(ark?.i ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tal, askArk])
  /**
   * SØVNEN.
   *
   * Verktyet er til for å SJÅ på det du lagar. Etter to sekund utan ein
   * finger er alt anna i vegen, so det fell bort — og ei rørsle hentar det
   * att med det same. Overgangen står i `globals.css`.
   *
   * BERRE I KVILE. Står eit plan eller eit strek valt, ei skuff open, arket
   * oppe, eit verkty i gang eller plateflata framme, er du MIDT I noko: det
   * som står framme er det du arbeider i, og det skal ikkje forsvinne under
   * handa. Det same medan motoren reknar, og medan ei line har noko å seie.
   *
   * Og medan det søv tek grensesnittet ikkje imot fingrar. Eit trykk du
   * ikkje ser er eit trykk du ikkje bad om — og av di han berre søv i kvile,
   * har det fyrste trykket ingenting å ta på objektet heller: det vekkjer,
   * og det er alt det gjer.
   */
  const [sov, setSov] = useState(false)
  /** knappen den andre fingeren tok, medan han er nede — sjå tommelspalta */
  const andreFinger = useRef<Element | null>(null)
  /** kvar fingeren stod sist medan han bøygde eit plan */
  const boy = useRef<number | null>(null)
  /** og der han LANDA, med tida for det førre trykket: to trykk rettar planet ut */
  const boyNed = useRef<number | null>(null)
  const sisteBoy = useRef(0)
  /**
   * EIN NY KROPP RAMMAR INN, EI REDIGERING GJER DET IKKJE.
   *
   * Synet i scena står der du sette det (sjå `Scene`), so ein bit som vert
   * dregen ikkje flyttar heile biletet under fingeren. Men ei NY fil, eit
   * nytt prosjekt eller ei tømd scene er ikkje ei redigering — det er eit
   * anna objekt, og det skal du sjå. Talet stig, og scena rammar inn.
   */
  const [rammInn, setRammInn] = useState(0)
  /**
   * KVILE ER KVILE, og ikkje «ingen har rørt skjermen».
   *
   * `kontur` står utanfor av di lerretet ligg gøymt der — det er ingenting
   * å sjå på, og då er det heller ikkje noko i vegen. Montasjen er det
   * motsette og høyrer like fullt utanfor: han ER eit bilete i rørsle, med
   * éin einaste kontroll, og å sjå på noko som rører seg er ikkje kvile.
   * Han sovna midt i animasjonen og tok steget med seg.
   */
  const kvile =
    mounted && !verkty && steg === "line" && view !== "kontur" && view !== "montasje" &&
    vald === null && valdStrek === null && valdBit === null &&
    modus !== "bit" && modus !== "rute" && modus !== "virvel" &&
    !busy && !drag && !melding && !feil && !hentar
  /**
   * DET FYRSTE TRYKKET VEKKJER, OG GJER ELLES INGENTING.
   *
   * Regelen stod skriven, og han heldt ikkje. `pointer-events: none` på
   * det som søv er rett og naudsynt — utan det tek eit handtak fingeren og
   * eit drag byrjar — men det er ikkje NOK, og grunnen ligg i rekkjefylgja:
   * vekkjaren under høyrer `pointerdown`, og nettlesaren lagar `click`
   * fyrst ved `touchend`. Fingeren vekkjer altso grensesnittet, `data-sov`
   * fell bort, knappane er levande att — og so kjem klikket og landar på
   * ein knapp som stod usynleg då fingeren gjekk ned. Målt: eit trykk der
   * `skjer` står skar eit plan på ein skjerm som synte ingenting.
   *
   * So den fingeren som vekkjer må svelgje sitt eige klikk. Same grepet som
   * scena gjer med det klikket eit drag lagar: ein lyttar i fangstfasen på
   * `window`, framfor React sin eigen, og han tek eitt klikk og ikkje meir.
   * Vindauget er kort og vert rydda av seg sjølv — vekkjer du med eit drag
   * eller ein tast kjem det aldri noko klikk, og då skal ikkje det neste
   * ekte klikket svelgjast i staden.
   */
  const soven = useRef(false)
  soven.current = sov
  useEffect(() => {
    if (!kvile) return setSov(false)
    let t = 0
    const vak = (e?: Event) => {
      if (soven.current && e?.type === "pointerdown") {
        const svelg = (k: Event) => {
          k.stopImmediatePropagation()
          k.preventDefault()
        }
        window.addEventListener("click", svelg, { capture: true, once: true })
        window.setTimeout(() => window.removeEventListener("click", svelg, true), 700)
      }
      setSov(false)
      window.clearTimeout(t)
      t = window.setTimeout(() => setSov(true), SOV_MS)
    }
    const kva = ["pointerdown", "pointermove", "wheel", "keydown"] as const
    for (const n of kva) window.addEventListener(n, vak, { capture: true, passive: true })
    vak()
    return () => {
      window.clearTimeout(t)
      for (const n of kva) window.removeEventListener(n, vak, true)
    }
  }, [kvile])

  useEffect(() => {
    if (!melding) return
    const t = window.setTimeout(() => setMelding(null), 4000)
    return () => window.clearTimeout(t)
  }, [melding])
  /**
   * SYNSKUBEN VERT MÅLT, ikkje rekna. Han er scena sin — kuben, låsen,
   * innramminga og lupa — og han flyttar seg med ruta og med topplina.
   * `ResizeObserver` fangar båe utan at nokon må hugse å seie frå.
   */
  useEffect(() => {
    if (!mounted) return
    const el = document.querySelector<HTMLElement>(".synskube")
    if (!el) return
    const maal = () => setKubeBotn(Math.round(el.getBoundingClientRect().bottom))
    maal()
    const ro = new ResizeObserver(maal)
    ro.observe(el)
    window.addEventListener("resize", maal)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", maal)
    }
    // `toppH` er det einaste som flyttar kuben loddrett; storleiken tek
    // observatøren, og ei flytting sidelengs endrar ikkje nedste kanten
  }, [mounted, toppH])
  /**
   * INGENTING PÅ SIDA VERT MERKT, FORSTØRRA ELLER RULLA. Skalaen er låst i
   * viewporten og merkinga i CSS; her går det som CSS ikkje når: iOS sine
   * eigne klypehendingar, eit fleirfingerdrag utanfor lerretet (lerretet
   * tek sine eigne), og menyen som kjem på eit langt trykk.
   */
  useEffect(() => {
    const stogg = (e: Event) => e.preventDefault()
    const fleire = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    document.addEventListener("gesturestart", stogg, { passive: false })
    document.addEventListener("gesturechange", stogg, { passive: false })
    document.addEventListener("touchmove", fleire, { passive: false })
    document.addEventListener("contextmenu", stogg)
    return () => {
      document.removeEventListener("gesturestart", stogg)
      document.removeEventListener("gesturechange", stogg)
      document.removeEventListener("touchmove", fleire)
      document.removeEventListener("contextmenu", stogg)
    }
  }, [])

  /**
   * EIT VALT PLAN, EITT STEG LANGS NORMALEN SIN. Handtaket gjev deg
   * planet om lag der du vil ha det; pilene gjev deg det nøyaktig: ein
   * millimeter per trykk, ti med skift. Boksen er i millimeter alt, so
   * steget er millimeteren delt på vidda i kvar akse.
   *
   * Punktet vert skrive med fire desimalar av boksen — 0,015 mm per akse
   * på ein kropp på 150 — og det nettet treff sjeldan millimeteren langs
   * ei skrå normal: kvart trykk vart 0,99 mm, og tolv trykk las 11,9.
   * So steget siktar på AVSTANDEN: målet er der planet står pluss
   * millimeteren, og av cella nærast det nøyaktige punktet og dei
   * seks-og-tjue kring henne vinn den som les nærast målet. Ei celle til
   * sides er ein hundredels millimeter inne i planet, og planet er det
   * same planet.
   *
   * Steget vert lagt på det som STÅR, ikkje på det som stod ved siste
   * teikning: ei tast som held seg nede sender tretti trykk i sekundet,
   * og to av dei mellom to teikningar skal vera to millimeter, ikkje éin.
   */
  const stegPlan = useCallback((id: number, mm: number) => {
    const k = kroppRef.current
    if (!k) return
    setParams((cur) => {
      const l = lesPlan(cur.plan)
      const i = l.findIndex((p) => p.id === id)
      if (i < 0) return cur
      const q = l[i]
      const vidd = [0, 1, 2].map((a) => Math.max(1e-6, k.max[a] - k.min[a]))
      const les = (o: Vec3) => o.reduce((s, c, a) => s + (c - 0.5) * vidd[a] * q.n[a], 0)
      const maal = les(q.o) + mm
      const rund = (c: number) => Math.min(1.5, Math.max(-0.5, +c.toFixed(4)))
      const g = q.o.map((c, a) => rund(c + (q.n[a] * mm) / vidd[a])) as Vec3
      let best = g
      let feil = Math.abs(les(g) - maal)
      for (let j = 0; j < 27; j++) {
        const c: Vec3 = [rund(g[0] + ((j % 3) - 1) * 1e-4), rund(g[1] + ((Math.floor(j / 3) % 3) - 1) * 1e-4), rund(g[2] + (Math.floor(j / 9) - 1) * 1e-4)]
        const e = Math.abs(les(c) - maal)
        if (e < feil - 1e-9) {
          best = c
          feil = e
        }
      }
      const { g: gruppe, fordel } = gruppeNo.current
      return { ...cur, plan: skrivPlan(medGruppa(l, i, best, q.n, gruppe, fordel)) }
    })
  }, [])

  /**
   * FAMILIEN I DEN VALDE BITEN, når ho har fleire utgåver — elles tom.
   *
   * Han er heile vilkåret for bladeren nedst til venstre: ein kube har inga
   * neste utgåve, so knappen er ikkje der. `nesteForm` gjev forma attende
   * uendra på ein familie av éi, so spørsmålet er alt svara i `scene.ts`.
   */
  const bla = valdBit !== null && bitar[valdBit] && nesteForm(bitar[valdBit].id) !== bitar[valdBit].id ? familien(bitar[valdBit].id) : ""
  // TASTANE. Eit felt som er teke eig sine eigne.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return
      if (e.altKey) return
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault()
        return e.shiftKey ? gjerOm() : angre()
      }
      if (e.metaKey || e.ctrlKey) return
      // same som knappen: med eit plan valt er skissa gøymd, og L slepp valet
      if (k === "l") {
        if (vald !== null) velPlan(null)
        // og skjer finst berre der skissa finst — sjå tommelspalta
        else if (rom) laas()
      } else if (k === "delete" || k === "backspace") {
        // det minste emnet fyrst: eit punkt, so eit strek, so planet. Handa
        // tek bort det ho held i, ikkje det som held det.
        if (valdPunkt !== null && vald !== null) taPunkt(vald, valdPunkt)
        else if (valdStrek !== null) slettStrek()
        else if (vald !== null) slett(vald)
      } else if (k === "z") (e.shiftKey ? gjerOm : angre)()
      // REISKAPANE HØYRER ROMMET TIL, og tastane deira gjer det same: på
      // plata og i montasjen er det ingen knapp å sjå dei i, og ein tast
      // som slår på noko du ikkje ser er verre enn ingen tast.
      else if (k === "r" && rom) vekslRute()
      else if (k === "v" && rom) vekslVirvel()
      // K som KROPPEN: det var den einaste reiskapen utan ein tast, og på
      // ein benk er tastane vegen inn til dei — R, V, S og no K.
      else if (k === "k" && rom) vekslBit()
      // M som MONTASJEN: fana, og handa hugsar tasten frå då han var ein reiskap
      else if (k === "m") vekslMontasje()
      // B SOM BOGE, når du held eit punkt: hjørne eller boge, same handling
      // som dobbelttrykket på punktet. Det minste emnet fyrst, som ⌫ — held
      // du eit punkt, er det DET tasten gjeld.
      else if (k === "b" && valdPunkt !== null && vald !== null) vriPunkt(vald, valdPunkt)
      // B som BLA elles: den neste utgåva av forma i den valde biten. Same
      // vegen inn som knappen nedst til venstre, og han finst berre når
      // familien har fleire utgåver — difor er tasten stum på ein kube.
      else if (k === "b" && bla) leggBit(bla)
      else if (k === "1") setView("flate")
      else if (k === "2") setView("lag")
      else if (k === "3") setView("kontur")
      else if (k === "4") setView("montasje")
      // den same knappen som under synskuben: innramminga er éi handling, og tasten er vegen til henne
      else if (k === "f") document.querySelector<HTMLButtonElement>("[data-heim]")?.click()
      else if (k === "d" && vald !== null && rom) dupliserPlan(vald)
      else if (k === "h" && vald !== null && rom) leggStrek("hol")
      // O som OMRISSET: same knappen, og eit trykk til innan vindauget gjev
      // boksen — eit dobbelttrykk er eit dobbelttrykk på ein tast òg.
      else if (k === "o" && vald !== null && valdGruppe === null && rom) formTrykk()
      // PILENE FLYTTAR DET VALDE PLANET, ikkje synet: opp og høgre er langs
      // normalen, ned og venstre er mot. Ein skrubbar i fokus eig pilene
      // sine sjølv, og på plata er det delen pilene flyttar (sjå `Plater`).
      // EIT PUNKT FYRST: held du eit punkt, er det DET pilene flyttar — i
      // profilen si eiga ramme, og ikkje planet langs normalen sin.
      else if (k.startsWith("arrow") && vald !== null && valdPunkt !== null && rom && t?.getAttribute("role") !== "slider") {
        const mm = e.shiftKey ? 10 : 1
        stegPunkt(vald, valdPunkt, k === "arrowright" ? mm : k === "arrowleft" ? -mm : 0, k === "arrowup" ? mm : k === "arrowdown" ? -mm : 0)
      }
      else if (k.startsWith("arrow") && vald !== null && valdStrek === null && rom && t?.getAttribute("role") !== "slider") {
        const retn = k === "arrowup" || k === "arrowright" ? 1 : -1
        stegPlan(vald, retn * (e.shiftKey ? 10 : 1))
      }
      // TAB GÅR TIL NESTE PLAN når eitt er valt: gjennom lista, og rundt.
      // Skift går attende. Står fokus på ein skrubbar, er tab framleis
      // tab — elles kom ein aldri til neste skrubbar med tastaturet.
      else if (k === "tab" && vald !== null && plan.length > 1 && t?.getAttribute("role") !== "slider") {
        const i = plan.findIndex((p) => p.id === vald)
        velPlan(plan[(i + (e.shiftKey ? plan.length - 1 : 1)) % plan.length].id)
      } else if (k === "escape") {
        if (verkty) setVerkty(null)
        else if (valdPunkt !== null) setValdPunkt(null)
        else if (valdStrek !== null) setValdStrek(null)
        else if (vald !== null) velPlan(null)
        // montasjen er ei lesing og ikkje eit val: escape tek deg attende til
        // rommet, som han slepper alt anna du står inne i
        else if (view === "montasje") vekslMontasje()
        else setSteg("line")
      } else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [angre, gjerOm, laas, slett, slettStrek, vald, valdGruppe, valdPunkt, valdStrek, vekslRute, vekslVirvel, vekslMontasje, rom, verkty, velPlan, vekslBit, bla, leggBit, dupliserPlan, leggStrek, formTrykk, stegPlan, stegPunkt, taPunkt, vriPunkt, plan, view])

  /** ruta og kva som ligg over henne: kameraet rammar inn i det som er att */
  const skuffH = benk ? Math.round(vindu.h * 0.46) : 0
  const rute: Rute = useMemo(
    () => ({ W: vindu.w, H: vindu.h, venstre: 0, hogre: benk ? KOL : 0, topp: toppH, botn: benk ? (verkty ? skuffH : 0) : arkH }),
    [vindu, benk, verkty, skuffH, arkH, toppH],
  )
  const skuffRute: CSSProperties = benk
    ? { left: 0, right: KOL, bottom: 0, height: skuffH }
    : { left: 8, right: 8, top: toppH + 8, bottom: `calc(${LUKKA_ARK}px + env(safe-area-inset-bottom))` }
  /** operatorane på det valde planet — eller på heile gruppa: står dei, og kor mykje */
  const iValt = vald === null ? [] : plan.filter((q) => (valdGruppe !== null && q.gruppe === valdGruppe ? true : q.id === vald))
  const mjukNo = iValt.reduce((m, q) => Math.max(m, q.mjuk ?? 0), 0)
  /** ber det valde planet ei form handa har sett? */
  const harOmriss = vald !== null && !!plan.find((q) => q.id === vald)?.omriss?.length
  /** kva fingrane held på med, med eitt ord — rutenettet med dei to tala sine */
  const gestTekst =
    // MONTASJEN STÅR SÅ LENGE FANA GJER DET, og ikkje berre medan ein finger
    // er nede: han er ei lesing og ikkje ein gest, og steget er det du treng
    // å vite medan du ser på — kva runde dette er, og kor mange ribber ho er.
    view === "montasje" && mont ? `steg ${montSteg}/${mont.steg} · ${mont.delar.filter((d) => d.steg === montSteg - 1).length}`
    : gest === "rute" ? (ruteTal ? `${ruteTal[0]}×${ruteTal[1]}` : "rutenett")
    : gest === "virvel" ? (virvelTal ? `${virvelTal[0]} · ${Math.round(virvelTal[1] * 100)}%` : "virvel")
    : gest
  /** ord, ikkje setningar: gestane i den rekkjefylgja du tek dei */

  return (
    <main className="fixed inset-0 overflow-hidden" data-sov={sov ? "" : undefined} style={{ background: "var(--paper)" }}>
      {/* fyrste gesten på objektet tek lina om gestane bort. Rommet vert
          GØYMT og ikkje teke ned når plateflata står framme: lerretet held
          på WebGL-samanhengen og synet sitt, og synskuben — som høyrer til
          rommet — fylgjer med i gøymsla. */}
      <div className="absolute inset-0" style={{ visibility: view === "kontur" ? "hidden" : undefined }}>
        {mounted && (
          <Scene
            kropp={kropp}
            lag={lag}
            view={romsyn.current}
            skal={skal}
            onSkal={() => setSkal((q) => !q)}
            sov={sov}
            modus={modus}
            montasje={view === "montasje"}
            material={String(params.material ?? "finer")}
            rute={rute}
            liste={liste}
            plan={plan}
            vald={vald}
            gruppe={valdGruppe === null ? INGEN : plan.filter((p) => p.gruppe === valdGruppe).map((p) => p.id)}
            snitt={snitt}
            blink={blink}
            skisse={skisse}
            storleik={typeof params.storleik === "number" ? params.storleik : 150}
            valdStrek={valdStrek}
            onVald={velPlan}
            onDeling={setjDeling}
            onValdStrek={setValdStrek}
            onPunkt={flyttPunkt}
            onLeggPunkt={leggPunkt}
            onTaPunkt={taPunkt}
            onVriPunkt={vriPunkt}
            mont={mont}
            montT={montT}
            montSpel={montSpel}
            montVakn={montVakn}
            onMontSteg={setMontSteg}
            valdPunkt={valdPunkt}
            onValdPunkt={setValdPunkt}
            onPlan={flyttPlan}
            onStrek={endraStrek}
            onSynStrek={synStrek}
            onGest={taGest}
            onSkisse={skisseEndra}
            valdBit={valdBit}
            onValdBit={setValdBit}
            onBitFlytt={flyttBit}
            onBitSkala={skalerBit}
            onBitVri={vriBit}
            onBitSide={sideBit}
            rammInn={rammInn}
            onRute={modus === "virvel" ? dragVirvel : dragRute}
            benk={benk}
          />
        )}
      </div>

      {/*
        PLATEFLATA. «Kontur» var ei stripe med profilane ved sida av kvarandre
        i lerretet — den same teikninga som platene alt syner, berre utan å
        kunne røre ved henne. No ER konturen platene: same delane, i den
        rekkjefylgja og på dei arka fila vert skoren på, der ein finger flyttar
        dei. Rommet står att under henne med synet det hadde, so eit steg ut og
        inn att ikkje nullstiller kameraet.
      */}
      {mounted && view === "kontur" && (
        <section
          aria-label="plateflata"
          // UTAN z: flata skal stable seg som DOM-en seier — over rommet, som
          // står før henne, og under tommelspalta og toppen, som står etter.
          // Eit z-tal her ville laga ein stabel av henne, og menyen over ein
          // del — som skal liggje over ALT medan han står — vart fanga i han.
          className="absolute flex flex-col"
          style={{ left: 0, right: rute.hogre, top: rute.topp, bottom: benk ? rute.botn : `calc(${arkH}px + env(safe-area-inset-bottom))`, background: "var(--paper)" }}
        >
          <Plater ark={ark} params={params} onChange={endre} onArk={askArk} peikt={peikt} onPeik={velDel} />
        </section>
      )}

      <Toppline benk={benk} kjelde={kjeldeNamn} bitar={bitar.length} byt={valdBit !== null ? familien(bitar[valdBit]?.id ?? "") : ""} onLegg={leggBit} onTom={tomScene} view={view} onView={setView} onFile={(f) => void takeFile(f)} onAngre={angre} kanAngre={kanAngre} onGjerOm={gjerOm} kanGjerOm={kanGjerOm} onShare={share} onHogd={setToppH} />

      {/* kva fingrane gjer, i tal, so lenge dei er nede: øvst til VENSTRE i
          det frie bandet — synskuben har det høgre hjørnet */}
      {gestTekst && (
        <div data-lesing="" className="pointer-events-none absolute flex justify-start" style={{ top: toppH + 10, left: 14 }} aria-hidden="true">
          <span className="tab text-[26px] leading-none tracking-[0.02em]" style={{ opacity: 0.5 }}>{gestTekst}</span>
        </div>
      )}

      {/* SYMMETRIEN PÅ SNITTET: tre brytarar, ei line, ØVST I MIDTEN. Kvar
          akse speglar snittet om midtplanet i kroppen, og dei tel saman: x og
          y er fire ribber av ei. Ord og ikkje ikon: ein akse har eit namn, og
          x er kortare enn kvart bilete av x. Og berre ordet: tre piller midt
          over objektet var tre flater du såg i staden for det du lagar.

          Dei stod i tommelspalta, rett over skjer. Spalta midtstiller borna
          sine, so ei line på tre ord måtte stå utanfor flyten for ikkje å
          skuve skjer innover — og ho tok ei høgd tommelen kunne brukt. Midt
          i det frie bandet står ho for seg sjølv: gesttalet har venstre
          hjørnet, synskuben det høgre. Bandet tek ingen fingrar; berre orda
          gjer det — og orda ligg UNDER handtaka, so eit handtak som kjem
          til å stå oppå eit av dei tek fingeren sin (sjå `.speil`). */}
      {mounted && vald === null && rom && modus !== "bit" && (
        <div className="speil" style={{ top: toppH + 6, left: 0, right: benk ? KOL : 0 }} role="group" aria-label="symmetri">
          {(["x", "y", "z"] as const).map((ord, a) => (
            <button
              key={ord}
              type="button"
              aria-label={`speil ${ord}`}
              aria-pressed={(speil & (1 << a)) !== 0}
              title={`speil snittet om ${ord}-planet gjennom midten: skjer låser båe`}
              onClick={() => setSpeil((q) => q ^ (1 << a))}
              // FIRE OG FØRTI PIKSLAR KVAR. `hit` blæs treffesona ut til
              // 44 px kring midten av knappen, og tre ord på tjue pikslar
              // fekk difor tre soner som låg oppå kvarandre: «x» tok ikkje
              // trykket sitt, «y» tok det. Ordet er smalt, sona er ikkje —
              // so knappen ber henne sjølv.
              className={ORD + " w-11 shrink-0"}
              data-speil={ord}
            >
              {ord}
            </button>
          ))}
        </div>
      )}

      {/*
        TOMMELSPALTA. Skjer står der høgre tommelen alt er: nedst til høgre,
        over arket, 64 pikslar. Med eit plan valt er skissa gøymd — det er
        ingenting å skjere — og då står den store plassen tom, so
        reiskapane fell ned i han. Over han: skissebrytaren, og med eit plan
        valt òg slett — og dei to streka, gods og hòl, som teiknar i profilen
        hans. Er eit strek valt, er det streken slett tek. Ikon, aldri ord.
        Prikken i hjørnet er motoren som reknar. På benken står spalta nedst
        i lerretet, ved kolonna.

        OG HO BER BERRE DET FANA KAN SYNE.

        Ein reiskap er eit spørsmål og eit svar: du trykkjer, og noko
        endrar seg framfor deg. Står svaret i eit bilete som ikkje er oppe,
        er knappen berre eit spørsmål — og eit spørsmål utan svar er verre
        enn ingen knapp. Difor: i rommet («flate» og «lag») står alle,
        av di det er DER kroppen, plana og skissa er teikna. På plateflata
        står dei to som ein knapp kan gjere åleine og arket syner med ein
        gong — dubler og slett. I montasjen står steget, og ikkje anna: han
        endrar ingenting i det heile.
      */}
      {mounted && (
        <div
          className="tumme"
          style={{ right: (benk ? KOL : 0) + 16, top: Math.max(toppH + 8, kubeBotn + 8), bottom: benk ? rute.botn + 16 : `calc(${arkH}px + env(safe-area-inset-bottom) + 4px)` }}
          /**
           * DEN ANDRE FINGEREN.
           *
           * Nettlesaren lagar berre `click` av den FYRSTE fingeren på
           * skjermen. Held du snitthandtaket med tommelen og trykkjer skjer
           * med peikefingeren, er det andre trykket ikkje primært — og
           * knappen høyrer det aldri. Det er nett den gripinga verktyet er
           * laga for: hald snittet der du vil ha det, og skjer utan å sleppe.
           *
           * So spalta les peikaren sjølv når han ikkje er primær. Ingen
           * fanging: slepper du utanfor knappen du tok, skjer ingenting —
           * det er slik eit trykk vert avlyst. Den primære fingeren går den
           * vanlege vegen gjennom `click`, so ingenting fyrer to gonger.
           */
          onPointerDown={(e) => { if (!e.isPrimary) andreFinger.current = (e.target as Element).closest("button") }}
          onPointerCancel={() => { andreFinger.current = null }}
          onPointerUp={(e) => {
            if (e.isPrimary) return
            const b = (e.target as Element).closest<HTMLButtonElement>("button")
            const same = !!b && b === andreFinger.current
            andreFinger.current = null
            if (same && !b.disabled) b.click()
          }}
        >
          {/*
            MONTASJEN HAR ÉIN KONTROLL, OG DET ER STEGET.

            Fana er reiskapen no: du står i montasjen av di du valde han
            øvst, og spalta ber det einaste som er att å gjere her.

            TO GESTAR, OG BEGGE ER LÆRDE FRÅ FØR. Eit drag opp og ned tek
            deg dit du vil sjå og let deg STÅ der, som bøyen og lupa: ein
            animasjon du ikkje kan stoppe midt i er ein animasjon du må sjå
            fire gonger. Og eit trykk spelar han om att frå golvet — «sjå det
            ein gong til», utan at nokon må lære eit dobbelttrykk til.
          */}
          {view === "montasje" && (
            <button
              type="button"
              data-montasje=""
              aria-label="steget"
              title={`montasjen: steg ${montSteg} av ${mont?.steg ?? 1}. dra opp og ned for å stå midt i han; trykk for å sjå han om att`}
              className={TUMME_BTN}
              style={{ touchAction: "none", cursor: "ns-resize" }}
              onPointerDown={(e) => {
                // BERRE DEN PEIKAREN SOM TOK I KNAPPEN. Landa ein annan
                // finger borti han medan den fyrste heldt, skreiv han over
                // kvar trykket byrja — og trykket vart lese som eit drag og
                // gjorde ingenting. (Spalta les ein finger som ikkje er den
                // primære med vilje; difor eit namn og ikkje `isPrimary`.)
                if (montNed.current) return
                montNed.current = { id: e.pointerId, y: e.clientY }
                e.currentTarget.setPointerCapture(e.pointerId)
                montDra.current = e.clientY
                montSpel.current = false
                setSkrubbar(true)
              }}
              onPointerMove={(e) => {
                if (montDra.current === null || !mont) return
                const dy = e.clientY - montDra.current
                montDra.current = e.clientY
                // opp er mot ferdig og ned er attende mot plata: den vegen delane går
                montT.current = Math.min(mont.steg, Math.max(0, montT.current - dy / MONT_STEG_PX))
                montVakn.current?.()
              }}
              onPointerUp={(e) => {
                const ned = montNed.current
                if (!ned || ned.id !== e.pointerId) return
                montDra.current = null
                montNed.current = null
                setSkrubbar(false)
                // eit trykk er eit trykk berre når det ikkje flytte seg — elles
                // er det byrjinga på eit drag, og eit drag spelar ingenting om att
                if (Math.abs(e.clientY - ned.y) > 6) return
                montT.current = 0
                montSpel.current = true
                setMontSteg(1)
                montVakn.current?.()
              }}
              onPointerCancel={(e) => {
                if (montNed.current && montNed.current.id !== e.pointerId) return
                montDra.current = null
                montNed.current = null
                setSkrubbar(false)
              }}
              /*
                OG INGEN `onClick`. Han er den same knappen som bøyen: alt
                går gjennom peikaren, av di eit drag og eit trykk berre kan
                skiljast der. Den andre fingeren når han likevel: handlarane
                her høyrer på kvar peikar, primær eller ikkje (sjå spalta
                over).
              */
            >
              {IcoMontasje}
            </button>
          )}
          {/* RUTENETTET OG VIRVELEN HØYRER ROMMET TIL. Begge vert sette med
              TO FINGRAR PÅ OBJEKTET, og på plateflata ligg objektet gøymt
              under arka — ein brytar du kan slå på og ikkje bruke. */}
          {rom && (<>
          {/* RUTENETTET. Han stod i lina på arket, ved talet han endrar. Men
              han er ein REISKAP og ikkje eit tal: to fingrar set kolonner og
              rader, som skissa og kroppen gjer det, og reiskapane bur i denne
              spalta. Difor øvst her, over dei andre. */}
          <button
            type="button"
            aria-pressed={modus === "rute"}
            aria-label="rutenett"
            title={modus === "rute" ? "rutenettet (R): to fingrar — vassrett er kolonner, loddrett er rader. trykk for å gå ut" : "rutenettet (R): to fingrar set kolonner og rader"}
            onClick={vekslRute}
            className={TUMME_BTN}
            data-ruteverkty=""
          >
            {IcoRute}
          </button>
          {/* OG VIRVELEN, UNDER HAN. Dei to er det same slaget reiskap —
              begge skriv heile plana på nytt, og begge vert sette med to
              fingrar — so dei står saman, øvst, over dei som gjeld eitt
              plan. Han hadde berre ein tast ei stund, og ein reiskap du
              berre når frå eit tastatur finst ikkje på telefonen. */}
          <button
            type="button"
            aria-pressed={modus === "virvel"}
            aria-label="virvel"
            title={modus === "virvel" ? "virvelen (V): to fingrar — vassrett er kor mange ribber, loddrett er kor langt ut frå aksen. trykk for å gå ut" : "virvelen (V): to fingrar set ribber kring ein akse, og kor langt ut dei står"}
            onClick={vekslVirvel}
            className={TUMME_BTN}
            data-virvelverkty=""
          >
            {IcoVirvel}
          </button>
          </>)}
          {/* Og reiskapane for PLANET står ikkje medan kroppsverktyet er ope.
              Der er det bitane du held på med, og eit trykk på objektet vel
              ein bit — men det vel planet under han òg, og då stod begge
              setta i spalta samstundes: elleve knappar, klemte ned til 40
              px kvar. Verktyet seier kva du arbeider med. */}
          {/*
            OG PÅ PLATA STÅR BERRE DEI SOM EIN KNAPP KAN GJERE ÅLEINE.

            Ein del på plata ER eit plan, so eit trykk på han vel planet —
            og då skal det gå an å ta planet bort, eller ta eitt til likt
            det. Dei to er knappar og ikkje anna, og svaret på dei er
            teikna rett framfor deg: ei rute mindre, eller ei rute meir.

            Resten treng ROMMET. Hòlet legg ein ring du flyttar og dreg med
            handtaka på snittet, forma frys profilen til punkt du dreg i,
            bøyen er ein skrubbar med snittet som avlesing, fordel gjeld
            eit drag på ei gruppe — og alle fire teiknar seg på lerretet,
            som ligg gøymt under arka her. Ein reiskap du kan trykkje på og
            ikkje sjå er ein reiskap som lyg.

            OG I MONTASJEN STÅR INGEN AV DEI. Han ER ei lesing: han endrar
            ingenting, og ei rad du trykte på i arket skal ikkje gje deg to
            knappar som gjer det.
          */}
          {vald !== null && modus !== "bit" && view !== "montasje" && (
            <>
              <button
                type="button"
                aria-label={valdGruppe !== null ? "dubler gruppa" : "dubler planet"}
                title={valdGruppe !== null ? "ei gruppe til, lik denne, kvart plan skuva eit hakk langs normalen sin (D)" : "eitt plan til, likt dette, skuva eit hakk langs normalen (D)"}
                onClick={() => dupliserPlan(vald)}
                className={TUMME_BTN}
              >
                {IcoDupliser}
              </button>
              {rom && valdGruppe === null && (
                <button
                  type="button"
                  aria-label="skjer hòl"
                  title="skjer eit hòl: ein ring midt i snittet. flytt, vri og dra han større (H)"
                  onClick={() => leggStrek("hol")}
                  className={TUMME_BTN}
                >
                  {IcoHol}
                </button>
              )}
              {/* FORMA: eitt trykk frys profilen til punkt du kan dra i, eit
                  dobbelttrykk gjer dei fire til boksen kring forma, og eit
                  trykk til slepper det heile. Merket seier om planet ber ei
                  form no; kva det NESTE trykket gjer, seier tittelen. */}
              {rom && valdGruppe === null && (
                <button
                  type="button"
                  aria-pressed={harOmriss}
                  aria-label="form"
                  title={harOmriss ? "forma (O): dra punkta i profilen. dobbelttrykk for boksen kring dei, eitt trykk slepper forma" : "forma (O): frys profilen til punkt du kan dra i. dobbelttrykk for boksen kring han"}
                  // utan eit snitt er det ingen profil å fryse — og då ville
                  // eit trykk vore eit trykk som ikkje gjorde noko
                  disabled={!harOmriss && !snitt}
                  onClick={formTrykk}
                  className={TUMME_BTN}
                  data-form=""
                >
                  {IcoForm}
                </button>
              )}
              {/* FORDEL: kva rada gjer med det leiaren får. Saman, eller
                  frå den eine enden til leiaren — ei dreiing vert ei vifte,
                  eit skuv eit nytt mellomrom. Eit ord, av di det er eit ord. */}
              {rom && valdGruppe !== null && (
                <button
                  type="button"
                  aria-pressed={fordel}
                  aria-label="fordel"
                  title={fordel ? "fordelt: den eine enden står, leiaren tek alt, rada tek sin del. trykk for saman" : "saman: heile gruppa fylgjer leiaren. trykk for fordelt — vifte og mellomrom"}
                  onClick={() => setFordel((f) => !f)}
                  className={ORD}
                  data-fordel=""
                >
                  fordel
                </button>
              )}
              {/* BØYEN: TRYKK OG DRA, som lupa. Ein skyvar ville teke ei
                  rad i arket for noko som gjeld eitt plan, og handtaka på
                  snittet er alt tre. Draget er buelengd og ikkje pikslar:
                  hundre pikslar er ein halv bøy same kva skjerm du held.

                  OG EIT DOBBELTTRYKK RETTAR PLANET UT ATT. Ein skrubbar har
                  ingen veg attende til null utan at du dreg deg dit og
                  bommar på siste hundredelen; knappen er sin eigen veg ut,
                  som forma er det. Eit trykk er eit trykk berre når det
                  ikkje flytte seg — elles er det byrjinga på eit drag. */}
              {rom && valdStrek === null && valdGruppe === null && (
                <button
                  type="button"
                  data-boy=""
                  aria-label="bøy planet"
                  title="dra opp og ned: bøy planet. materialet set grensa, og regelen seier kvar ho går. dobbelttrykk rettar han ut att"
                  className={TUMME_BTN}
                  style={{ touchAction: "none", cursor: "ns-resize" }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId)
                    boy.current = e.clientY
                    boyNed.current = e.clientY
                    setSkrubbar(true)
                  }}
                  onPointerMove={(e) => {
                    if (boy.current === null || vald === null) return
                    const dy = e.clientY - boy.current
                    boy.current = e.clientY
                    boyPlan(vald, -dy * BOY_STEG)
                  }}
                  onPointerUp={(e) => {
                    const ned = boyNed.current
                    boy.current = null
                    boyNed.current = null
                    setSkrubbar(false)
                    if (ned === null || vald === null || Math.abs(e.clientY - ned) > 6) return
                    const no = performance.now()
                    const dobbelt = no - sisteBoy.current < DOBBELT_MS
                    sisteBoy.current = no
                    if (dobbelt) boyPlan(vald, -(plan.find((q) => q.id === vald)?.bog ?? 0))
                  }}
                  onPointerCancel={() => { boy.current = null; boyNed.current = null; setSkrubbar(false) }}
                >
                  {IcoBoy}
                </button>
              )}
              <button
                type="button"
                aria-label={valdStrek !== null ? "slett strek" : valdGruppe !== null ? "slett gruppa" : "slett"}
                title={valdStrek !== null ? "ta streken bort (⌫)" : valdGruppe !== null ? "ta heile gruppa bort (⌫)" : "ta det valde planet bort (⌫)"}
                onClick={valdStrek !== null ? slettStrek : () => slett(vald)}
                className={TUMME_BTN}
                style={{ color: "var(--warn)" }}
              >
                {IcoSlett}
              </button>
            </>
          )}
          {rom && (<>
          {/* VERKTYET FOR KROPPEN: bitane står som boksar, trykk vel ein, og
              to fingrar flyttar, vrir og gjer han større. Med ein bit valt
              står han til å dublere eller ta bort. */}
          {modus === "bit" && valdBit !== null && (
            <>
              <button type="button" aria-label="dubler biten" title="ein bit til, lik denne" onClick={dupliserBit} className={TUMME_BTN}>
                {IcoDupliser}
              </button>
              <button type="button" aria-label="ta biten bort" title="ta den valde biten ut av kroppen" onClick={slettBit} className={TUMME_BTN} style={{ color: "var(--warn)" }}>
                {IcoSlett}
              </button>
            </>
          )}
          <button
            type="button"
            aria-pressed={modus === "bit"}
            aria-label="kroppen"
            title={modus === "bit" ? "verktyet for kroppen (K): trykk ein bit, to fingrar flyttar, vrir og skalerer han. trykk for å gå ut" : "verktyet for kroppen (K): flytt, vri og skaler bitane han er sett saman av"}
            onClick={vekslBit}
            className={TUMME_BTN}
            data-bitverkty=""
          >
            {IcoBit}
          </button>

          {/* SKJER, og ikkje anna. Med eit plan valt stod her eit merke som
              sa «ferdig», og det var ein knapp for å slutte å gjere noko:
              eit trykk utanfor planet, eit trykk på rada hans, escape —
              alle tre slepper han frå før. So med eit plan valt står den
              store knappen tom, og reiskapane hans fell ned i staden. */}
          {vald === null && (
            <button
              type="button"
              onClick={laas}
              disabled={!harSnitt}
              aria-label="skjer"
              title="skjer: skissa vert ein del (L)"
              className="skjer ikon"
            >
              {IcoSkjer}
              <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "var(--ink)", opacity: busy ? 1 : 0, transition: "opacity 200ms ease" }} />
            </button>
          )}
          </>)}
        </div>
      )}

      {/*
        BLADREN, NEDST TIL VENSTRE — motsett veg av reiskapane.

        Ti stolformer er éi line i menyen, og vegen til den neste gjekk
        gjennom han: opne menyen, finn familien, trykk. To trykk med
        kroppen dekt, kvar gong, for det som er EITT val — er denne
        stolen den rette? Her er det eitt trykk, og menyen står ikkje i
        vegen for å svare.

        Han står berre når svaret finst: ein bit vald, og fleire utgåver i
        familien hans. Og han går den same vegen som menyen — `leggBit`
        med familien — so angre, lenkja og økta ser det same bytet dei
        alltid har sett.
      */}
      {mounted && rom && modus === "bit" && bla && (
        <div
          className="bla"
          style={{ left: 16, bottom: benk ? rute.botn + 16 : `calc(${arkH}px + env(safe-area-inset-bottom) + 4px)` }}
        >
          <button
            type="button"
            aria-label="bla"
            title={`bla til den neste utgåva av ${bla} (B): same plassen, same storleiken, ei anna form`}
            onClick={() => leggBit(bla)}
            className={ORD}
            data-bla=""
          >
            bla
          </button>
        </div>
      )}

      {drag && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--paper) 82%, transparent)" }}>
          <div className="rounded-2xl border border-dashed px-6 py-4 text-[11px] uppercase tracking-[0.2em]" style={{ borderColor: "var(--ink)" }}>slepp fila</div>
        </div>
      )}

      <Skuff
        open={verkty}
        rute={skuffRute}
        liste={liste}
        params={params}
        clamp={(o, prev) => MOTOR.clamp(o, prev)}
        peikt={peikt}
        onPeik={velDel}
        onChange={endre}
        onBytt={opneVerkty}
        onClose={() => setVerkty(null)}
        onOrd={(t) => void navigator.clipboard?.writeText(t).then(() => setMelding("kopiert")).catch(() => setMelding("ikkje kopiert"))}
      />

      <Arket
        benk={benk}
        steg={steg}
        onSteg={setSteg}
        params={params}
        onChange={endre}
        onSkrubb={setSkrubbar}
        view={view}
        topp={toppH}
        metrics={tal?.metrics ?? null}
        rules={tal?.rules ?? []}
        liste={liste}
        plan={plan}
        boks={kropp ? { min: kropp.min, max: kropp.max } : null}
        vald={vald}
        onVald={velPlan}
        valdGruppe={valdGruppe}
        onVelGruppe={velGruppe}
        onSlettGruppe={slettGruppe}
        mjuk={mjukNo}
        onMjuk={(v) => vald !== null && mjukPlan(vald, v - mjukNo)}
        virr={virr}
        onVirr={(v) => { virrPlan(v - virr); setVirr(v) }}
        onFarge={setFarge}
        bitFarge={valdBit !== null ? (bitar[valdBit]?.farge ?? 0) : null}
        onBitFarge={fargBit}
        onSlett={slett}
        busy={busy}
        feil={feil}
        melding={melding}
        hentar={hentar}

        onExport={doExport}
        onReset={() => endre({ ...MOTOR.defaults, kjelde: params.kjelde })}
        verkty={verkty}
        onVerkty={opneVerkty}
        onHogd={setArkH}
      />
    </main>
  )
}
