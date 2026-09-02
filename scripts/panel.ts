/**
 * PANELVAKTA — verkar knappane?
 *
 * Motoren har prøvebenkar for kvart tal han reknar. Grensesnittet hadde
 * ingen. Det er den halvdelen brukaren faktisk tek i: knappen som finn
 * innstillingar, lina som seier kvar i lista du står, feltet du skriv eit
 * mål i, tasten som tek deg attende.
 *
 * Kvar av dei har ein måte å svikte på som ikkje kastar, ikkje loggar og
 * ikkje syner att på eit bilete:
 *
 *   · lina seier «2 av 13» medan ribbene som står er frå eit anna svar
 *   · «førre» går framover, eller hoppar to
 *   · lista står att etter at du har endra storleiken, og lyg om kva ho
 *     er eit svar på
 *   · talfeltet tek imot 9999 og set eit objekt ingen plate kan bera
 *   · angre går eitt steg for langt, eller eitt for kort
 *   · eit drag på ein del på plata festar han ein annan stad enn der
 *     fingeren sleppte han, eller opnar verktyet i staden for å dra
 *
 * Difor vert dei prøvde her, i ein ekte nettlesar, mot det som faktisk
 * står i lenkja — lenkja ber alle parametrane, so ho er den einaste
 * fasiten som ikkje er ei avskrift av det panelet sjølv trur.
 *
 *   npx tsx scripts/panel.ts [url]
 */
import { chromium, type Browser, type Page } from "playwright"
import { fritt, paaSkjermen, ramme, type Fit, type Rute } from "../lib/ramme"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeSoup } from "../lib/soup"
import { meshToStl } from "../lib/vaffel/export-stl"

const URL = process.argv[2] ?? "http://127.0.0.1:3210"
let brot = 0

const ok = (namn: string, sant: boolean, sett?: string) => {
  if (!sant) brot++
  console.log(`${sant ? "  ok " : "FEIL"}  ${namn}${sett ? ` · ${sett}` : ""}`)
}

/**
 * Parametrane slik dei står i lenkja.
 *
 * Panelet si eiga bokføring er ikkje eit vitne på seg sjølv, so fasiten
 * vert lesen ut av URL-en. Han vert skriven eit halvt sekund etter siste
 * endring, og under eit bygg kan den klokka fyre seinare enn det — difor
 * vert han lesen til han står STILLE, og ikkje etter ei gjetta venting.
 * Ei venting som er for kort gjev eit brot som ikkje er eit brot, og eit
 * brot som ikkje er eit brot er verre enn ingen prøve.
 */
async function lenkja(page: Page): Promise<Record<string, number | string>> {
  const les = () => page.evaluate(() => window.location.hash)
  let sist = await les()
  let stille = 0
  for (let i = 0; i < 50 && (stille < 6 || i < 8); i++) {
    await page.waitForTimeout(120)
    const h = await les()
    stille = h === sist ? stille + 1 : 0
    sist = h
  }
  return JSON.parse(decodeURIComponent(sist.replace(/^#p=/, "")))
}

/** Arket og benken er to ulike element; begge ber aria-busy, og det er det
 *  einaste haldepunktet som ikkje er ei gjetting på tid. */
const rolig = (page: Page) =>
  page.waitForFunction(
    () => document.querySelector("[aria-busy]")?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 60000 },
  )

/** Opnar kontrollarket om det ikkje alt er ope. Knappen byter namn når han
 *  er open, so eit blindt klikk nummer to ventar på ein knapp som ikkje
 *  finst. */
const opnePanelet = async (page: Page) => {
  const knapp = page.getByLabel("vis kontrollane")
  if (await knapp.count()) await knapp.click()
}

/** «1 av 12 · 9×7 ribber» — ho bur i kontrollane, so dei må vera opne */
const stadLine = (page: Page) =>
  page.locator("section[aria-label='kontrollar'] [aria-live='polite']")

/** ei kule med nok trekantar til at tolkinga tek meir enn eit augeblink */
function kuleStl(r: number, seg: number): Buffer {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)]
  }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  const soup = makeSoup(new Float32Array(pos))
  const nrm = new Float32Array(soup.pos.length)
  for (let i = 0; i < nrm.length; i += 3) {
    const L = Math.hypot(soup.pos[i], soup.pos[i + 1], soup.pos[i + 2]) || 1
    nrm[i] = soup.pos[i] / L
    nrm[i + 1] = soup.pos[i + 1] / L
    nrm[i + 2] = soup.pos[i + 2] / L
  }
  return Buffer.from(meshToStl({ positions: soup.pos, normals: nrm, tris: soup.tris }, "kule"))
}

/**
 * STÅR OBJEKTET I DET BANDET ARKET LET STÅ ATT?
 *
 * Dette er den eine feilen i heile reiskapen som ikkje kastar, ikkje
 * loggar og ikkje syner att på eit einaste måltal: kameraet rammar inn
 * objektet i HEILE ruta, kontrollarket ligg over den nedste halvdelen, og
 * det som er att på skjermen er toppen av noko. Ingen prøve i ein
 * nettlesar fangar det heller — biletet er der, det er berre gøymt.
 *
 * So det vert rekna. For kvar rutestorleik nokon faktisk har, og for kvar
 * høgd arket kan ha, skal kula kring objektet liggje mellom øvste kanten
 * og overkanten av arket.
 */
function innramminga() {
  const saker: [string, Fit][] = [
    ["kube", { r: 1.556, w: 2.2, h: 2.2, cy: 1.1 }],
    ["flat plate", { r: 1.12, w: 2.2, h: 0.44, cy: 0.22 }],
    ["høg søyle", { r: 1.12, w: 0.44, h: 2.2, cy: 1.1 }],
    ["høgt og smalt", { r: 1.343, w: 1.542, h: 2.2, cy: 1.1 }],
  ]
  /** ruter og det som ligg over dei: telefonarket nedst, benken i sidene */
  const ruter: [string, Rute][] = [
    ["telefon 390×780, lukka", { W: 390, H: 780, venstre: 0, hogre: 0, topp: 0, botn: 70 }],
    ["telefon 390×780, halvope", { W: 390, H: 780, venstre: 0, hogre: 0, topp: 0, botn: 314 }],
    ["telefon 390×780, heilope", { W: 390, H: 780, venstre: 0, hogre: 0, topp: 0, botn: 523 }],
    ["smal 320×700, halvope", { W: 320, H: 700, venstre: 0, hogre: 0, topp: 0, botn: 300 }],
    ["brett 820×1180, halvope", { W: 820, H: 1180, venstre: 0, hogre: 0, topp: 0, botn: 330 }],
    ["benk 1280×900", { W: 1280, H: 900, venstre: 264, hogre: 304, topp: 44, botn: 0 }],
    ["benk 1920×1080", { W: 1920, H: 1080, venstre: 288, hogre: 336, topp: 44, botn: 0 }],
    ["benk 1180×720", { W: 1180, H: 720, venstre: 240, hogre: 272, topp: 44, botn: 0 }],
  ]
  for (const [rn, rute] of ruter) {
    for (const [fn, fit] of saker) {
      const r = ramme(fit, { rute, fovDeg: 30, flat: false })
      const p = paaSkjermen(fit, r, 30)
      // Kula er romsleg: ho er rotasjonsfast og tek med hjørne objektet
      // ikkje har. Difor ein liten slark.
      const held = p.topp > -0.06 && p.botn < 1.06
      ok(
        `${rn} · ${fn}`,
        held,
        held ? "" : `topp ${p.topp.toFixed(2)}, botn ${p.botn.toFixed(2)}`,
      )
    }
  }

  // Klemminga: eit ark som tek meir enn helvta av ruta får ikkje meir.
  const kvalt = fritt({ W: 390, H: 780, venstre: 0, hogre: 0, topp: 0, botn: 700 })
  ok("eit ark som tek nesten alt får berre helvta", kvalt.h === 390, `${kvalt.h} px fritt`)
  // …og forhaldet mellom kantane skal halde, elles hoppar objektet sidelengs.
  const skeiv = fritt({ W: 1000, H: 600, venstre: 300, hogre: 600, topp: 0, botn: 0 })
  ok(
    "to veggar som til saman er for breie krympar likt",
    Math.abs(skeiv.L / (1000 - skeiv.L - skeiv.w) - 300 / 600) < 0.001 && skeiv.w === 500,
    `venstre ${skeiv.L.toFixed(0)}, fritt ${skeiv.w.toFixed(0)}`,
  )
}

/**
 * TYNGDEPUNKTET TIL DET SOM ER TEIKNA.
 *
 * Ein gest på eit lerret har ikkje eitt einaste vitne i DOM-en: ingen
 * knapp, ingen tekst, ingen parameter. Det einaste som svarar er BILETET,
 * so det vert lese — kvar blekket ligg, og kor mykje det er av det.
 *
 * Ei dreiing og ei flytting skil seg tydeleg der. Ei flytting skuvar heile
 * teikninga same veg som fingeren og lét mengda blekk stå; ei dreiing
 * flyttar tyngdepunktet lite og endrar FORMA, so mengda går opp eller ned.
 *
 * PNG-en vert dekoda av nettlesaren sjølv. Å lese pikslar rett ut av eit
 * WebGL-lerret gjev svart: bufferet er sleppt når ramma er komponert, og
 * `frameloop="demand"` teiknar han ikkje på nytt for oss.
 */
async function blekket(page: Page) {
  const buf = await page.screenshot({ clip: { x: 120, y: 120, width: 660, height: 520 } })
  return page.evaluate(async (b64: string) => {
    const im = new Image()
    im.src = "data:image/png;base64," + b64
    await im.decode()
    const g = document.createElement("canvas")
    g.width = im.width
    g.height = im.height
    const cx = g.getContext("2d")!
    cx.drawImage(im, 0, 0)
    const d = cx.getImageData(0, 0, g.width, g.height).data
    let sx = 0
    let sy = 0
    let n = 0
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const i = (y * g.width + x) * 4
        if (d[i] < 170 && d[i + 1] < 170) {
          sx += x
          sy += y
          n++
        }
      }
    }
    return n ? { x: Math.round(sx / n), y: Math.round(sy / n), n } : { x: 0, y: 0, n: 0 }
  }, buf.toString("base64"))
}

/**
 * FINGRANE.
 *
 * Gestane er det einaste i reiskapen ingen annan prøve kjem nær: dei har
 * ingen knapp å trykkje på, dei står ikkje i DOM-en, og eit bilete syner
 * dei ikkje. Dei kan slutte å verke — ein terskel som er feil veg, eit
 * forteikn som er snudd, ein klassifikator som tek eit klyp for eit drag —
 * utan at noko som helst feilar.
 *
 * Difor vert dei send inn som ekte punkt gjennom nettlesaren sin eigen
 * inngang, og svaret vert lese av lenkja.
 */
async function gestane(browser: Browser) {
  const page = await browser.newPage({
    viewport: { width: 900, height: 900 },
    hasTouch: true,
  })
  await page.goto(URL, { waitUntil: "networkidle" })
  await rolig(page)
  const cdp = await page.context().newCDPSession(page)
  type Pt = { x: number; y: number; id: number }
  const send = (type: string, touchPoints: Pt[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints } as never)

  /**
   * FINGRANE DIRRAR.
   *
   * Gestane stod her med reine tal: to punkt som flytta seg nøyaktig dit
   * dei skulle, hending etter hending. Ein skjerm gjev ikkje det. Han gjev
   * eit par pikslar støy på kvar finger for seg, og den støyen er både
   * avstand og vinkel — akkurat dei to tinga klassifikatoren skil eit klyp
   * og ei vriding frå eit drag på.
   *
   * Utan dirret prøvde denne bolken den eine saka som aldri kjem inn frå
   * ein ekte skjerm, og sa «ok». Med dirret feila ho annakvar gong: eit
   * drag på to hundre og tjue pikslar vart kalla ei vriding, og ribbetalet
   * rørte seg ikkje. Det var det brukaren såg.
   *
   * Tre pikslar kvar veg, uavhengig per finger. Det er på den rause sida av
   * det ein kapasitiv skjerm gjev, og det er meininga: gestane skal halde
   * med marg.
   */
  const dirr = () => (Math.random() - 0.5) * 6
  const skjelv = ([a, b]: [Pt, Pt]): [Pt, Pt] => [
    { ...a, x: a.x + dirr(), y: a.y + dirr() },
    { ...b, x: b.x + dirr(), y: b.y + dirr() },
  ]

  /** to fingrar frå ei stode til ei anna, i tjue steg */
  const gest = async (fra: [Pt, Pt], til: (t: number) => [Pt, Pt]) => {
    await send("touchStart", skjelv(fra))
    for (let i = 1; i <= 20; i++) {
      await send("touchMove", skjelv(til(i / 20)))
      await page.waitForTimeout(16)
    }
    await send("touchEnd", [])
    await rolig(page)
  }

  const midt = { x: 450, y: 300 }
  const pkt = (r: number, v: number): [Pt, Pt] => [
    { x: midt.x - r * Math.cos(v), y: midt.y - r * Math.sin(v), id: 1 },
    { x: midt.x + r * Math.cos(v), y: midt.y + r * Math.sin(v), id: 2 },
  ]

  // --- KLYP: STORLEIKEN ----------------------------------------------------
  let p = await lenkja(page)
  const for0 = Number(p.storleik)
  await gest(pkt(60, 0), (t) => pkt(60 + 120 * t, 0))
  p = await lenkja(page)
  ok("klyp ut gjer objektet større", Number(p.storleik) > for0 * 1.5, `${for0} → ${p.storleik} mm`)

  const for1 = Number(p.storleik)
  await gest(pkt(180, 0), (t) => pkt(180 - 120 * t, 0))
  p = await lenkja(page)
  ok("og klyp inn gjer det mindre", Number(p.storleik) < for1 * 0.8, `${for1} → ${p.storleik} mm`)

  // --- VRI: VENDINGA -------------------------------------------------------
  // Med klokka på skjermen skal objektet gå med klokka, og det er negativ
  // rotasjon kring den ståande aksen.
  const vend0 = Number(p.rotZ)
  await gest(pkt(140, 0), (t) => pkt(140, (t * 40 * Math.PI) / 180))
  p = await lenkja(page)
  const dv = Number(p.rotZ) - vend0
  /**
   * FYRTI GRADER INN SKAL GJE FYRTI GRADER UT.
   *
   * Bandet var −25 til −55 og dekte over at gesten gav 53: `sumVri` la den
   * same vridinga saman om att for kvar hending som gjekk før gesten fekk
   * namn. Ein vri som gjev ein tredel for mykje er ikkje ein vri du kan
   * sikte med.
   *
   * Så vart det stramma til −35..−45, og då kom det fram at HALVE feilen
   * stod att: dei to greinene som går ut att før gesten har fått namn er
   * daudsona OG ventinga på at leiaren skal halde i tre bilete, og berre
   * den fyrste vart retta. Fem køyringar gav 40, 43, 44, 45 og 49 grader —
   * talet voks med kor mange bilete ventinga tok. Eit tal som varierer med
   * timing er ikkje eit tal.
   *
   * Med båe greinene retta: 39 og 40 på to køyringar. Bandet er ±4 no, og
   * det ville teke både dei 53 og dei 49.
   */
  ok("vri med klokka vender objektet like mykje", dv <= -36 && dv >= -44, `${vend0}° → ${p.rotZ}°`)

  // --- DRAG: RIBBETALET ----------------------------------------------------
  const ribb0 = Number(p.ribbY)
  const stor0 = Number(p.storleik)
  await gest(pkt(90, 0), (t) => [
    { x: midt.x - 90, y: midt.y - 220 * t, id: 1 },
    { x: midt.x + 90, y: midt.y - 220 * t, id: 2 },
  ])
  p = await lenkja(page)
  ok("drag oppover gjev fleire ribber", Number(p.ribbY) > ribb0, `${ribb0} → ${p.ribbY}`)
  // Klassifikatoren vel ÉIN gest. Eit drag som òg skalerer tyder at
  // terskelen mellom dei to er for laus.
  ok("og lét storleiken stå", Number(p.storleik) === stor0, `${stor0} → ${p.storleik} mm`)

  // Og den andre vegen. Dei to aksane er kvar sin parameter og kvar sin
  // gren i klassifikatoren, so den eine seier ingen ting om den andre.
  const langs0 = Number(p.ribbX)
  const vend1 = Number(p.rotZ)
  await gest(pkt(90, 0), (t) => [
    { x: midt.x - 90 + 220 * t, y: midt.y, id: 1 },
    { x: midt.x + 90 + 220 * t, y: midt.y, id: 2 },
  ])
  p = await lenkja(page)
  ok("drag til høgre gjev fleire ribber langs x", Number(p.ribbX) > langs0, `${langs0} → ${p.ribbX}`)
  ok("og lét vendinga stå", Number(p.rotZ) === vend1, `${vend1}° → ${p.rotZ}°`)

  // --- DRAG NEDOVER: BOTNEN HELD -------------------------------------------
  // Draget den andre vegen er langt nok til å køyre båe tala under null om
  // ingen tok imot. Botnen er to, og han er to av di ei einaste ribbe kvar
  // veg ikkje er eit rutenett: det er to plater som kryssar, og på ein
  // kropp med bein og hovud eit dusin øyer som ikkje heng i noko.
  for (const [namn, veg] of [
    ["ned", (t: number) => [
      { x: midt.x - 90, y: midt.y + 700 * t, id: 1 },
      { x: midt.x + 90, y: midt.y + 700 * t, id: 2 },
    ]],
    ["til venstre", (t: number) => [
      { x: midt.x - 90 - 700 * t, y: midt.y, id: 1 },
      { x: midt.x + 90 - 700 * t, y: midt.y, id: 2 },
    ]],
  ] as const) {
    await gest(pkt(90, 0), veg as (t: number) => [Pt, Pt])
    p = await lenkja(page)
    ok(
      `eit langt drag ${namn} stoggar på to ribber`,
      Number(p.ribbX) >= 2 && Number(p.ribbY) >= 2,
      `${p.ribbX}×${p.ribbY}`,
    )
  }

  // --- DRAG MED RULL I HANDA -----------------------------------------------
  /**
   * EI HAND SOM DREG, RULLAR LITT.
   *
   * Draget over er reint: begge fingrane går rett opp, null grader vri.
   * Slik dreg ingen. Ei hand som set to fingrar på glaset og dreg oppover
   * rullar nokre grader medan ho set seg, og vridinga vert vegen som ein
   * BOGE — vinkelen gonga med halve fingeravstanden. Med fingrane 180 px
   * frå kvarandre er seks grader ti pikslar boge, meir enn dei fyrste
   * pikslane av draget, og gesten vart namngjeven «vri». Éin gong, for
   * heile draget: resten av rørsla gjorde ingen ting.
   *
   * Difor eit lite drag — eit par ribber, ikkje heile bandet — med rullen
   * fremst, der han er verst.
   */
  const ribb1 = Number(p.ribbY)
  const vend2 = Number(p.rotZ)
  await gest(pkt(90, 0), (t) => {
    const rull = (Math.min(1, t / 0.3) * 8 * Math.PI) / 180
    const drag = 60 * Math.max(0, (t - 0.15) / 0.85)
    return [
      { x: midt.x - 90 * Math.cos(rull), y: midt.y - 90 * Math.sin(rull) - drag, id: 1 },
      { x: midt.x + 90 * Math.cos(rull), y: midt.y + 90 * Math.sin(rull) - drag, id: 2 },
    ]
  })
  p = await lenkja(page)
  ok(
    "eit drag med åtte grader rull i seg er framleis eit drag",
    Number(p.ribbY) !== ribb1,
    `${ribb1} → ${p.ribbY} ribber`,
  )
  ok("og vender ikkje objektet", Number(p.rotZ) === vend2, `${vend2}° → ${p.rotZ}°`)

  await page.close()
}

/**
 * PLATA PÅ EIN TELEFON: DRA EIN DEL, HALD HAN, SNU HAN.
 *
 * Kvar del på plata er sitt eige element, og ein finger kan gjere tre ting
 * med han: eit trykk peikar, eit trykk som varer opnar verktyet, og eit drag
 * FLYTTAR han — der fingeren slepper, står han fast. Ingen av dei tre står
 * i DOM-en som anna enn resultatet sitt, so dei vert prøvde med ekte
 * trykkpunkt gjennom nettlesaren sin eigen inngang, og svaret vert lese av
 * lenkja: `fest` er adressa, plata, svingen og hjørnet.
 *
 * Den eine feilen som ikkje kastar: klokka som gjer eit trykk langt ser
 * ikkje fingeren. Står hovudtråden stille etter at delen lyste opp — og i
 * ein nettlesar utan skjermkort gjer han det i eit halvt sekund — kjem
 * klokka før rørslene, og verktyet opnar seg over eit drag. Sjå `LANGT_MS`
 * i verkty.tsx. Difor er dette nett det miljøet prøva må halde i.
 */
async function plata(browser: Browser, feil: string[]) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  })
  page.on("pageerror", (e) => feil.push(String(e)))
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) feil.push(m.text())
  })
  await page.goto(URL, { waitUntil: "networkidle" })
  await rolig(page)
  await opnePanelet(page)
  await page.getByLabel("opne stabelen").click()
  await rolig(page)
  const skuffa = page.locator("section[aria-label='verkty']")
  await skuffa.locator("button", { hasText: /^plater$/i }).first().click()
  await rolig(page)
  await page.waitForTimeout(600)

  const svg = skuffa.locator("svg[role=img]")
  const delar = svg.locator("g > g")
  ok("plata har delar på seg", (await delar.count()) > 0, `${await delar.count()} delar`)

  /** midten av delen med denne adressa, i skjermpikslar. Tittelen ber
   *  adressa fyrst, og «· fast» etter når han står fast. */
  const midt = async (adr: string) => {
    const g = svg
      .locator("g > g", { has: page.locator("title", { hasText: new RegExp(`^${adr}( |$)`) }) })
      .first()
    const b = (await g.boundingBox())!
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const adr = ((await delar.first().locator("title").textContent()) ?? "").trim().split(" ")[0]
  const fyrst = await midt(adr)

  const cdp = await page.context().newCDPSession(page)
  type Pt = { x: number; y: number; id: number }
  const send = (type: string, touchPoints: Pt[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints } as never)
  /** ein finger frå ein stad til ein annan, i tolv steg */
  let undervegs = ""
  const dra = async (fra: { x: number; y: number }, til: { x: number; y: number }) => {
    await send("touchStart", [{ x: fra.x, y: fra.y, id: 1 }])
    for (let i = 1; i <= 12; i++) {
      await send("touchMove", [
        { x: fra.x + ((til.x - fra.x) * i) / 12, y: fra.y + ((til.y - fra.y) * i) / 12, id: 1 },
      ])
      await page.waitForTimeout(30)
    }
    // det som står i hovudet på plata medan fingeren enno er nede
    undervegs = await skuffa.innerText()
    await send("touchEnd", [])
    await rolig(page)
    await page.waitForTimeout(500)
  }
  const festet = async () => String((await lenkja(page)).fest)

  // --- DRAGET FESTAR ---------------------------------------------------------
  ok("ingen feste før nokon har dregen", (await festet()) === "")
  const mål = { x: Math.min(370, fyrst.x + 90), y: fyrst.y - 60 }
  await dra(fyrst, mål)
  // Fingeren dekkjer delen; hovudet på plata seier kvar hjørnet landar.
  ok("medan du dreg seier plata kvar hjørnet landar", /x \d+ · y \d+ mm/.test(undervegs), undervegs.replace(/\s+/g, " ").slice(0, 90))
  const f1 = await festet()
  ok("eit drag festar delen", f1.startsWith(adr + ":"), f1)
  const etter = await midt(adr)
  ok(
    "og delen ligg der fingeren sleppte han",
    Math.abs(etter.x - mål.x) < 30 && Math.abs(etter.y - mål.y) < 30,
    `${fyrst.x.toFixed(0)},${fyrst.y.toFixed(0)} → ${etter.x.toFixed(0)},${etter.y.toFixed(0)}, mål ${mål.x.toFixed(0)},${mål.y.toFixed(0)}`,
  )

  // --- HALD: SLEPP OG SNU -------------------------------------------------------
  await send("touchStart", [{ x: etter.x, y: etter.y, id: 1 }])
  await page.waitForTimeout(700)
  await send("touchEnd", [])
  await page.waitForTimeout(300)
  const meny = page.getByRole("dialog", { name: `del ${adr}` })
  ok("eit langt trykk opnar verktyet over delen", (await meny.count()) === 1)
  ok("og delen står som fast der", (await meny.locator("button", { hasText: /^slepp$/ }).count()) === 1)
  const rotAv = (f: string) => Number(f.split(";").find((q) => q.startsWith(adr + ":"))?.split(":")[1].split(",")[1])
  const rot0 = rotAv(f1)
  await meny.locator("button", { hasText: /^snu$/ }).click()
  await rolig(page)
  const rot1 = rotAv(await festet())
  ok("snu tek ein kvart sving", rot1 === (rot0 + 1) % 4, `${rot0} → ${rot1}`)
  ok("og verktyet står att, so neste sving er eitt trykk", (await meny.count()) === 1)
  await page.waitForTimeout(400)
  await meny.locator("button", { hasText: /^snu$/ }).click()
  await rolig(page)
  ok("og ein til", rotAv(await festet()) === (rot0 + 2) % 4)
  await page.waitForTimeout(400)
  const snudd = await midt(adr)
  ok(
    "delen snur kring midten sin",
    Math.abs(snudd.x - etter.x) < 25 && Math.abs(snudd.y - etter.y) < 25,
    `${etter.x.toFixed(0)},${etter.y.toFixed(0)} → ${snudd.x.toFixed(0)},${snudd.y.toFixed(0)}`,
  )
  await meny.locator("button", { hasText: /^slepp$/ }).click()
  await rolig(page)
  ok("slepp tek festet bort", (await festet()) === "")

  // --- TO FESTE I KVARANDRE ----------------------------------------------------
  /**
   * Pakkinga overprøver ikkje handa: dreg du ein del inn i ein annan festa
   * del, ligg dei i kvarandre. Men plata skal SEIE det — raud del, og eit
   * tal i hovudet på henne — og regelen om plata skal ryke.
   */
  const a = await midt(adr)
  await dra(a, { x: Math.min(370, a.x + 90), y: a.y - 60 })
  const andre = ((await delar.nth(1).locator("title").textContent()) ?? "").trim().split(" ")[0]
  const b = await midt(andre)
  const inn = await midt(adr)
  await dra(b, inn)
  const f3 = await festet()
  ok("to delar dregne står begge fast", f3.split(";").length === 2, f3)
  ok(
    "og plata seier at dei ligg i kvarandre",
    /\d+ i kvarandre/.test(await skuffa.innerText()),
    (await skuffa.innerText()).replace(/\s+/g, " ").slice(0, 80),
  )
  const raude = await page.evaluate(() =>
    [...document.querySelectorAll("section[aria-label='verkty'] svg g > g > path")].filter(
      (q) => getComputedStyle(q).stroke === "rgb(185, 28, 28)",
    ).length,
  )
  ok("og teiknar den som ligg i den andre raud", raude > 0, `${raude} raude baner`)

  // --- TIL NESTE PLATE ---------------------------------------------------------
  /**
   * Draget flyttar innanfor plata. Ein del som skal AV henne tek vegen
   * gjennom verktyet: «neste plate» festar han på plata etter — ei ny om
   * det er den siste — og skuffa fylgjer han dit. Her tek det òg dei to ut
   * av kvarandre.
   */
  const plateAv = (f: string, a: string) =>
    Number((f.split(";").find((q) => q.startsWith(a + ":")) ?? "").split(":")[1]?.split(",")[0])
  // Dei to ligg i kvarandre, so trykket landar på den som er teikna sist.
  // Kven det vart, seier verktyet sjølv.
  const her = await midt(andre)
  await send("touchStart", [{ x: her.x, y: her.y, id: 1 }])
  await page.waitForTimeout(700)
  await send("touchEnd", [])
  await page.waitForTimeout(300)
  const meny2 = page.getByRole("dialog")
  ok("verktyet opnar seg over ein festa del", (await meny2.count()) === 1)
  const kven = ((await meny2.getAttribute("aria-label")) ?? "").replace(/^del /, "")
  await meny2.locator("button", { hasText: /^neste plate$/ }).click()
  await rolig(page)
  await page.waitForTimeout(700)
  const f4 = await festet()
  ok("neste plate festar delen på plata etter", plateAv(f4, kven) === 1, `${kven} · ${f4}`)
  const paaSkjermen = () => svg.locator("title", { hasText: new RegExp(`^${kven}( |$)`) }).count()
  ok("og skuffa fylgjer han dit", (await paaSkjermen()) === 1)
  ok("og dei ligg ikkje i kvarandre lenger", !/i kvarandre/.test(await skuffa.innerText()))
  const der = await midt(kven)
  await send("touchStart", [{ x: der.x, y: der.y, id: 1 }])
  await page.waitForTimeout(700)
  await send("touchEnd", [])
  await page.waitForTimeout(300)
  await page.getByRole("dialog", { name: `del ${kven}` }).locator("button", { hasText: /^førre plate$/ }).click()
  await rolig(page)
  await page.waitForTimeout(700)
  ok("og førre plate tek han attende", plateAv(await festet(), kven) === 0 && (await paaSkjermen()) === 1, await festet())

  // Vegen attende, éin gong for alle: to feste står, ein knapp tek dei.
  await skuffa.locator("button", { hasText: /^slepp alle$/ }).click()
  await rolig(page)
  ok("slepp alle tek alle festa", (await festet()) === "" && (await skuffa.locator("button", { hasText: /^slepp alle$/ }).count()) === 0)

  // --- KLYPET --------------------------------------------------------------------
  /**
   * Ei plate på 600 mm er 366 pikslar brei på ein telefon. To fingrar
   * klyp henne nærare, éin finger på bert bord dreg utsnittet, og eit
   * dobbelttrykk syner heile plata att.
   */
  const viewBox = () => svg.getAttribute("viewBox")
  const heile = await viewBox()
  const sb = (await svg.boundingBox())!
  const c = { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 }
  await send("touchStart", [{ x: c.x - 40, y: c.y, id: 1 }, { x: c.x + 40, y: c.y, id: 2 }])
  for (let i = 1; i <= 8; i++) {
    await send("touchMove", [{ x: c.x - 40 - 12 * i, y: c.y, id: 1 }, { x: c.x + 40 + 12 * i, y: c.y, id: 2 }])
    await page.waitForTimeout(30)
  }
  await send("touchEnd", [])
  await page.waitForTimeout(300)
  const naert = await viewBox()
  const breidd = (v: string | null) => Number((v ?? "").split(" ")[2])
  ok("eit klyp zoomar plata", !!naert && breidd(naert) < breidd(heile) * 0.6, `${heile} → ${naert}`)
  ok("og delane står framleis på henne", (await delar.count()) > 0)
  await svg.dblclick({ position: { x: 8, y: 8 } })
  await page.waitForTimeout(300)
  ok("dobbelttrykket syner heile plata att", (await viewBox()) === heile, String(await viewBox()))
  await page.close()
}

/**
 * LERRETET: KONTUREN ER EI TEIKNING, DEI ANDRE ER EIT ROM.
 *
 * Eitt drag, to heilt ulike svar, og ingen av dei står i DOM-en. I `lag`
 * skal draget SNU objektet; i `kontur` skal det FLYTTE teikninga, av di ein
 * kontur er dei flate kuttprofilane sedde rett ovanfrå og det einaste ein
 * gjer med ei teikning er å dra henne dit ein vil sjå.
 *
 * Skilnaden er målt i blekket. Ei flytting skuvar tyngdepunktet like langt
 * som fingeren og lét mengda stå; ei dreiing flyttar det lite og endrar
 * mengda, av di forma vert ei anna.
 */
async function lerretet(browser: Browser, feil: string[]) {
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
  page.on("pageerror", (e) => feil.push(String(e)))
  await page.goto(URL, { waitUntil: "networkidle" })
  await rolig(page)

  const dra = async (dx: number, dy: number) => {
    await page.mouse.move(450, 380)
    await page.mouse.down()
    for (let i = 1; i <= 14; i++) {
      await page.mouse.move(450 + (dx * i) / 14, 380 + (dy * i) / 14)
      await page.waitForTimeout(20)
    }
    await page.mouse.up()
    await page.waitForTimeout(500)
  }

  await page.keyboard.press("2")
  await rolig(page)
  await page.waitForTimeout(600)
  const lag0 = await blekket(page)
  await dra(150, 0)
  const lag1 = await blekket(page)
  ok(
    "eit drag i lag snur objektet i staden for å flytte det",
    Math.abs(lag1.x - lag0.x) < 60 && Math.abs(lag1.n - lag0.n) > lag0.n * 0.01,
    `flytta ${lag1.x - lag0.x} px, blekket ${lag0.n} → ${lag1.n}`,
  )

  await page.keyboard.press("3")
  await rolig(page)
  await page.waitForTimeout(700)
  const k0 = await blekket(page)
  await dra(150, 100)
  const k1 = await blekket(page)
  ok(
    "eit drag i konturen flyttar teikninga",
    k1.x - k0.x > 70 && k1.y - k0.y > 40,
    `flytta ${k1.x - k0.x}, ${k1.y - k0.y} px av 150, 100`,
  )
  ok(
    "og teikninga er den same — det var ei flytting, ikkje ei dreiing",
    Math.abs(k1.n - k0.n) < k0.n * 0.2,
    `blekket ${k0.n} → ${k1.n}`,
  )

  // Dobbelttrykket er vegen heim for den som har panorert seg bort. Det er
  // ein av gestane konturen BEHELD, og difor verdt å prøve nett her.
  await page.mouse.dblclick(450, 380)
  await page.waitForTimeout(1000)
  const k2 = await blekket(page)
  ok(
    "og dobbelttrykket tek deg heim att",
    Math.abs(k2.x - k0.x) < 25 && Math.abs(k2.y - k0.y) < 25,
    `${k1.x},${k1.y} → ${k2.x},${k2.y} mot ${k0.x},${k0.y}`,
  )
  await page.close()
}

/**
 * BENKEN.
 *
 * Over 1180 px er grensesnittet eit heilt anna: to faste veggar, ingen
 * tilstandar, og svaret frå finn som ei liste du kan peike i. Tre ting der
 * inne kan svikte utan at noko feilar, og alle tre er nye:
 *
 *   · lista syner tolv rader og set ein annan kandidat enn den du klikka
 *   · peikaren byggjer ei førehandsvising som ikkje vert rydda opp att
 *   · og verre: ei førehandsvising som vert BOKFØRT, so angre går attende
 *     til noko du berre såg på
 */
async function benken(browser: Browser, feil: string[]) {
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 } })
  page.on("pageerror", (e) => feil.push(String(e)))
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) feil.push(m.text())
  })
  await page.goto(URL, { waitUntil: "networkidle" })
  await rolig(page)
  ok("benken står over 1180 px", (await page.locator("aside[aria-label='innstillingar']").count()) === 1)

  // Lista sitt eige namn, og ikkje skriftklassen på radene. Selektoren
  // stod på «.tab»; radene skifta til «.mono» i ei endring som ser lik ut
  // på benken, og vakta fann null rader og sa frå — men berre om at det
  // var null, ikkje om at det var HO som hadde drive. Eit namn skiftar
  // ikkje av at nokon vel ei anna skrift.
  const rader = page.locator("aside[aria-label='innstillingar'] [aria-label='svar'] button")
  ok("og ingen svarliste før nokon har spurt", (await rader.count()) === 0)

  await page.getByLabel("finn innstillingar").click()
  await rolig(page)
  const n = await rader.count()
  ok("finn gjev heile lista, ikkje eitt svar", n >= 8, `${n} rader`)

  let p = await lenkja(page)
  const fyrst = `${p.ribbX}×${p.ribbY}`
  const raden = (i: number) => rader.nth(i).innerText()
  ok("og den fyrste rada er den som står", (await raden(0)).includes(fyrst), fyrst)

  // --- KLIKK BIND ----------------------------------------------------------
  const fjerde = (await raden(3)).split("\n")
  await rader.nth(3).click()
  await rolig(page)
  p = await lenkja(page)
  ok(
    "eit klikk i lista set den kandidaten",
    fjerde.join(" ").includes(`${p.ribbX}×${p.ribbY}`),
    `${p.ribbX}×${p.ribbY}`,
  )

  // --- PEIKAREN BYGGJER, OG RYDDAR OPP ATT ---------------------------------
  const for0 = `${p.ribbX}×${p.ribbY}`
  await rader.nth(7).hover()
  await page.waitForTimeout(900)
  const under = await lenkja(page)
  ok(
    "å stå over ei rad byggjer henne",
    `${under.ribbX}×${under.ribbY}` !== for0,
    `${for0} → ${under.ribbX}×${under.ribbY}`,
  )
  await page.mouse.move(660, 500)
  await rolig(page)
  p = await lenkja(page)
  ok("og å fare ut att gjev deg ditt attende", `${p.ribbX}×${p.ribbY}` === for0, for0)

  // --- OG EI FØREHANDSVISING ER INGA ENDRING -------------------------------
  await page.keyboard.press("z")
  await rolig(page)
  p = await lenkja(page)
  ok(
    "angre hoppar ikkje til noko du berre såg på",
    `${p.ribbX}×${p.ribbY}` !== `${under.ribbX}×${under.ribbY}`,
    `${p.ribbX}×${p.ribbY}`,
  )

  // --- STABELEN ------------------------------------------------------------
  /**
   * Å RØRE ÉI RIBBE SKAL LA DEI ANDRE STÅ.
   *
   * `pnpm hand` prøver den rekninga for seg, i motoren. Her vert han prøvd
   * gjennom heile vegen: feltet, verbet, lenkja og attende ut i tabellen.
   * Det er tre stader talet kan bli borte imellom, og ingen av dei feilar
   * høgt — ei ribbe som ikkje flytta seg ser ut som ei ribbe du ikkje
   * trykte hardt nok på.
   */
  await page.keyboard.press("s")
  await rolig(page)
  const stabel = page.locator("section[aria-label='verkty']")
  const stader = () =>
    stabel.evaluate((el) =>
      [...el.querySelectorAll("input")]
        .filter((q) => /^X\d+, stad$/.test(q.getAttribute("aria-label") ?? ""))
        .map((q) => (q as HTMLInputElement).value),
    )

  /**
   * «STÅR STILLE» ER PÅ EIN TIDELS MILLIMETER, og ikkje på teiknet.
   *
   * Ein lås er ein brøkdel av spennet, lagra med fire desimalar. Å låse
   * stabelen kvantiserer difor kvar einaste ribbe, og på eit spenn på
   * hundre og femti er det ein hundredels millimeter — nok til at ei ribbe
   * som stod og las «117,9» les «117,8» etterpå.
   *
   * Det er ikkje ei ribbe som flytta seg. Det er den fjerde desimalen i
   * brøken, og han er under snittbreidda på kvar einaste storleik skyvaren
   * kan stille. Ei prøve som krev det same TEIKNET prøver avrundinga.
   */
  const mm = (s: string) => Number(s.replace(",", "."))
  const same = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => Math.abs(mm(v) - mm(b[i])) < 0.15)

  const fyrsteStad = await stader()
  ok("stabelen syner ei rad per ribbe", fyrsteStad.length >= 2, fyrsteStad.join(" "))

  // Eit tal skrive i ei rad flyttar DEN ribba, og berre henne.
  const rad = stabel.getByLabel("X2, stad")
  await rad.click()
  await rad.fill("30")
  await rad.press("Enter")
  await rolig(page)
  const flytta = await stader()
  ok("eit tal i ei rad flyttar den ribba", flytta[1] === "30,0", flytta.join(" "))
  ok(
    "og dei andre står stille",
    same(
      flytta.filter((_, i) => i !== 1),
      fyrsteStad.filter((_, i) => i !== 1),
    ),
    flytta.join(" "),
  )

  // Å flytte ei ribbe er å låse stabelen: ei fri ribbe har ingen eigen
  // plass å flytte seg frå.
  p = await lenkja(page)
  ok(
    "og heile stabelen er låst etterpå",
    String(p.laas).split("x:")[1]?.split(";")[0]?.split(",").length === fyrsteStad.length,
    String(p.laas),
  )

  // Slett: talet går ned, og dei som står att står der dei stod.
  await stabel.getByLabel("X1: ×").click()
  await rolig(page)
  const etterSlett = await stader()
  p = await lenkja(page)
  ok(
    "slett tek ei ribbe ut av stabelen",
    etterSlett.length === flytta.length - 1 && Number(p.ribbX) === etterSlett.length,
    `${flytta.length} → ${etterSlett.length}, ribbX ${p.ribbX}`,
  )
  ok(
    "og dei som står att står stille",
    same(etterSlett, flytta.slice(1)),
    etterSlett.join(" "),
  )

  // Piltastane skyv den ribba peikaren står på.
  await stabel.getByLabel("X2, stad").hover()
  const foerPil = await stader()
  await page.keyboard.press("ArrowRight")
  await rolig(page)
  const etterPil = await stader()
  ok(
    "høgrepila skyv ribba du peikar på",
    etterPil[1] !== foerPil[1],
    `${foerPil[1]} → ${etterPil[1]}`,
  )
  ok(
    "og berre henne",
    same(
      etterPil.filter((_, i) => i !== 1),
      foerPil.filter((_, i) => i !== 1),
    ),
    etterPil.join(" "),
  )

  // «Lås alle» på den andre aksen: y skal få ei full låseliste.
  await stabel.locator("button", { hasText: /^(lås alle|slepp alle)$/ }).nth(1).click()
  await rolig(page)
  p = await lenkja(page)
  ok(
    "lås alle skriv ned heile aksen",
    String(p.laas).split("y:")[1]?.split(",").length === Number(p.ribbY),
    String(p.laas).slice(0, 60),
  )
  await page.keyboard.press("s")
  await rolig(page)

  // --- EIT LANGT TRYKK ER DJUPSØKET ----------------------------------------
  /**
   * TO TING UT AV ÉIN KNAPP.
   *
   * Eit langt trykk skal gje ei anna liste, og det korte skal IKKJE fyre
   * med. Ei rekning på tolv grunne kandidatar som kjem etter djupsøket
   * ville sett det beste svaret hans til side utan at nokon såg det.
   *
   * Det som skil dei to listene er formkolonnen: truskapen er det
   * djupsøket rangerer på, og det raske reknar han ikkje. Kjem han fram,
   * kom lista frå djupsøket — og det er ein skilnad ein kan LESE, ikkje
   * ein ein må tru på.
   */
  const harForm = () =>
    page
      .locator("aside[aria-label='innstillingar'] [aria-label='svar']")
      .innerText()
      .then((t) => /\bform\b/i.test(t))

  ok("det korte trykket gjev inga formkolonne", !(await harForm()))

  const kb = (await page.getByLabel("finn innstillingar").boundingBox())!
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  // Djupsøket snittar hundrevis for alvor, og på ein benk utan skjermkort
  // tek det kring eit minutt. Ringen syner det; prøva ventar.
  await page.waitForFunction(
    () => document.querySelector("[aria-busy]")?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 240000 },
  )

  ok("eit langt trykk gjev djupsøket", await harForm())
  const djupe = await rader.count()
  ok("og ei liste å bla i", djupe > 0, `${djupe} rader`)

  // Kvar rad ber eit formtal, og eit formtal er ein prosent mellom null og
  // hundre. Ein kolonne med «NaN%» i ser rett ut på avstand.
  const tal = (await page.locator("aside[aria-label='innstillingar'] [aria-label='svar'] button").first().innerText())
    .match(/(\d+)%/)
  ok("og eit formtal som er eit tal", !!tal && Number(tal[1]) > 0 && Number(tal[1]) <= 100, tal?.[0])

  // Og det som står er det som er sett: eit langt trykk skal binde svaret
  // sitt, ikkje berre rekne det ut.
  p = await lenkja(page)
  ok(
    "og det fyrste djupe svaret er sett",
    (await raden(0)).includes(`${p.ribbX}×${p.ribbY}`),
    `${p.ribbX}×${p.ribbY}`,
  )

  // --- EIT TRYKK TIL STOGGAR SØKET -----------------------------------------
  /**
   * Djupsøket tek den tida det tek, og knappen er ein stoppknapp medan det
   * går: eit trykk til held det beste so langt. Lista skal koma, med form i,
   * og ho skal vera kortare enn heile fronten — det er det som viser at ho
   * vart kappa og ikkje fullført.
   */
  await page.getByLabel("storleik, tal", { exact: true }).fill("200")
  await page.keyboard.press("Enter")
  await rolig(page)
  const heile = djupe
  const kb2 = (await page.getByLabel("finn innstillingar").boundingBox())!
  await page.mouse.move(kb2.x + kb2.width / 2, kb2.y + kb2.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await page.waitForTimeout(4000)
  ok("medan søket går heiter knappen stopp", /stopp/i.test(await page.getByLabel("finn innstillingar").innerText()))
  await page.getByLabel("finn innstillingar").click()
  await rolig(page)
  const kappa = await rader.count()
  ok("eit trykk til stoggar søket og held det beste so langt", kappa > 0 && kappa < heile && (await harForm()), `${kappa} rader av ${heile}`)

  // --- MELLOMROM: BERRE OBJEKTET -------------------------------------------
  await page.locator("body").click({ position: { x: 660, y: 500 } })
  await page.keyboard.down("Space")
  // Til veggane ER borte, og ikkje ei fast venting: klikket kan ha
  // landa på objektet og lyst opp ein del, og ramma det kostar på ein
  // benk utan skjermkort held tasten i køen lenger enn 300 ms.
  await page
    .waitForFunction(
      () =>
        Number(
          getComputedStyle(document.querySelector("aside[aria-label='innstillingar']")!).opacity,
        ) < 0.1,
      undefined,
      { timeout: 5000 },
    )
    .catch(() => undefined)
  const skjult = await page.evaluate(
    `getComputedStyle(document.querySelector("aside[aria-label='innstillingar']")).opacity`,
  )
  await page.keyboard.up("Space")
  await page.waitForTimeout(300)
  const synleg = await page.evaluate(
    `getComputedStyle(document.querySelector("aside[aria-label='innstillingar']")).opacity`,
  )
  ok("mellomrom tek veggane bort", Number(skjult) < 0.1 && Number(synleg) > 0.9, `${skjult} → ${synleg}`)

  // --- STORLEIKEN ER EIT TAL DU KAN DRA I ----------------------------------
  const felt = page.getByLabel("storleik, tal", { exact: true })
  const boks = (await felt.boundingBox())!
  const stor0 = Number((await lenkja(page)).storleik)
  await page.mouse.move(boks.x + 20, boks.y + boks.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(boks.x + 20 + i * 8, boks.y + boks.height / 2)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  await rolig(page)
  const stor1 = Number((await lenkja(page)).storleik)
  ok("drag på storleikstalet skrur han", stor1 > stor0, `${stor0} → ${stor1} mm`)

  // --- BLINDGATA HAR EIN VEG UT --------------------------------------------
  /**
   * Det brukaren sat med: eit klyp gjorde objektet så stort at kvar del
   * var større enn plata. «bryt · delane får plass · 15 utanfor», DXF og
   * ARK strekne over, og ingen ting å trykkje på.
   *
   * `raad.ts` prøver at rådet reknar rett. Dette prøver at det er ein
   * KNAPP: at han står i lina, at han set talet, og at uttaka som var
   * stengde opnar seg av det.
   */
  // Lenkja vert lesen når sida vert MONTERT, og ei navigering som berre
  // byter hash monterer ingenting. Difor ei omlasting etterpå.
  await page.goto(
    URL + "#p=" + encodeURIComponent(JSON.stringify({ storleik: 1100, ribbX: 3, ribbY: 3, arkB: 400, arkH: 300 })),
    { waitUntil: "networkidle" },
  )
  await page.reload({ waitUntil: "networkidle" })
  await rolig(page)
  const ark = page.locator("aside[aria-label='måltal'] button", { hasText: /^ark$/i })
  ok("eit objekt som ikkje får plass stengjer arket", await ark.isDisabled())

  const knapp = page.getByLabel(/^fiks delane får plass/)
  const ordet = (await knapp.innerText()).trim()
  ok("og lina ber rådet som ein knapp", /^prøv \d+ mm$/.test(ordet), ordet)

  await knapp.click()
  await rolig(page)
  const etter = await lenkja(page)
  ok(
    "knappen set talet han seier",
    String(etter.storleik) === ordet.replace(/\D/g, ""),
    `${ordet} → ${etter.storleik} mm`,
  )
  ok("og arket er ope att", !(await ark.isDisabled()))
  ok("og rådet er borte når regelen står", (await page.getByLabel(/^fiks delane får plass/).count()) === 0)

  // --- EIT NYTT NETT TEK LÅSANE MED SEG UT ---------------------------------
  /**
   * Låsane er brøkdelar av spennet til DEN KROPPEN DU HADDE. Slepper du inn
   * ei anna fil, tyder dei same brøkane heilt andre plan — og ingen ting på
   * skjermen seier at det ligg gamle tal i det nye objektet.
   *
   * Prøva står sist i bolken av di ho byter ut objektet: alt etter henne
   * ville handla om ei kule i staden for ein kube.
   */
  await page.keyboard.press("s")
  await rolig(page)
  await stabel.locator("button", { hasText: /^(lås alle|slepp alle)$/ }).first().click()
  await rolig(page)
  p = await lenkja(page)
  ok("lås alle før importen", String(p.laas).includes("x:"), String(p.laas).slice(0, 40))

  const mappe2 = mkdtempSync(join(tmpdir(), "slicerman-"))
  const fil2 = join(mappe2, "ei-anna-kule.stl")
  writeFileSync(fil2, kuleStl(50, 40))
  await page.setInputFiles("input[type=file]", fil2)
  await rolig(page)
  p = await lenkja(page)
  ok("og eit nytt nett tek dei med seg ut", p.laas === "" && p.fest === "", `laas «${p.laas}»`)

  await page.close()
}

async function main() {
  console.log("innramminga:")
  innramminga()
  console.log("panelet:")
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
  // Under 1180 px er det ARKET som gjeld. Benken har sin eigen bolk.
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  const feil: string[] = []
  page.on("pageerror", (e) => feil.push(String(e)))
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) feil.push(m.text())
  })

  await page.goto(URL, { waitUntil: "networkidle" })
  await rolig(page)

  // --- FINN INNSTILLINGAR --------------------------------------------------
  // Ein prøvetakar inne på sida, som skriv ned kvar gong ringen kring
  // finn-knappen flyttar seg. Han må stå INNE i sida: sett utanfrå ville
  // kvar avlesing gå ein tur over ei protokollgrense, og det er tregare
  // enn det som skal målast.
  await page.evaluate(`(function(){
    window.LOGG = []
    function sjaa(){
      var c = document.querySelector("section[aria-label='kontrollar'] button[aria-label='finn innstillingar'] svg circle:last-child")
      var v = c ? c.getAttribute("stroke-dashoffset") : ""
      var L = window.LOGG
      if (v && (!L.length || L[L.length-1] !== v)) L.push(v)
    }
    setInterval(sjaa, 25)
  })()`)
  await page.getByLabel("finn innstillingar").click()
  await rolig(page)

  /**
   * FRAMDRIFTA MÅ RØRE SEG MEDAN HO GJELD.
   *
   * Ringen kring knappen har to måtar å kollapse til «null, og so ferdig»
   * på, og ingen av dei kastar: arbeidaren som reknar heile søket i eitt
   * jafs (då kjem alle meldingane i same augeblinken som svaret), og
   * hovudtråden som teiknar heile scena om att for kvar melding (då hopar
   * dei seg opp i køen og kjem i klumpar). Begge to gjev ein ring som står
   * stille og so er ferdig, og ein ring som står stille er verre enn ingen
   * ring.
   */
  const steg = (await page.evaluate("window.LOGG")) as string[]
  ok("framdrifta rører seg medan søket går", steg.length >= 4, `${steg.length} steg synte seg`)

  /**
   * KVA SVARET VART, LESE AV LENKJA — OG SO AV LINA.
   *
   * Steget vert prøvd mot URL-en og ikkje mot rada. URL-en ber ribbetalet
   * som faktisk er sett, so han seier alt rada sa, og han seier det utan å
   * krevje at rada finst: rada er kontrollane sitt eige rekneskap, og eit
   * rekneskap er ikkje eit vitne på seg sjølv.
   *
   * SO VERT RADA LESEN LIKEVEL, og mot den same URL-en. Ho finst — ho bur i
   * kontrollane, so dei må opnast for at ho skal kunne lesast — og ei rad
   * som finst kan lyge. Det er den eine feilen ho har: å seie «1 av 12 ·
   * 9×7» medan ribbene som står er frå eit anna svar.
   */
  await opnePanelet(page)
  await rolig(page)
  let p = await lenkja(page)
  const fyrste = `${p.ribbX}×${p.ribbY}`
  ok("fyrste trykket set eit svar", Number(p.ribbX) > 0 && Number(p.ribbY) > 0, fyrste)

  const rada = await stadLine(page).innerText()
  const m1 = rada.match(/(\d+) av (\d+) · (\d+)×(\d+)/i)
  ok("lina seier kvar i lista vi står", !!m1, rada.replace(/\s+/g, " "))
  if (m1) {
    ok("og ho står på det fyrste svaret", m1[1] === "1", `${m1[1]} av ${m1[2]}`)
    ok(
      "og ribbetalet ho seier er det som faktisk står",
      `${m1[3]}×${m1[4]}` === fyrste,
      `lina ${m1[3]}×${m1[4]}, sett ${fyrste}`,
    )
  }

  // --- NESTE OG FØRRE ------------------------------------------------------
  // Tastane, ikkje pilene: pilene budde i rada som er borte. `steg(±1)` er
  // den same funksjonen dei kalla.
  await page.keyboard.press("f")
  await rolig(page)
  p = await lenkja(page)
  const andre = `${p.ribbX}×${p.ribbY}`
  ok("neste går eitt steg ned i lista", andre !== fyrste, `${fyrste} → ${andre}`)

  await page.keyboard.press("Shift+f")
  await rolig(page)
  p = await lenkja(page)
  ok(
    "førre er attende på det same svaret",
    `${p.ribbX}×${p.ribbY}` === fyrste,
    `${andre} → ${p.ribbX}×${p.ribbY}`,
  )

  // --- LISTA GJELD BERRE DET SPØRSMÅLET HO SVARTE PÅ -----------------------
  await opnePanelet(page)
  await page.getByLabel("storleik, tal", { exact: true }).fill("240")
  await page.keyboard.press("Enter")
  await rolig(page)
  p = await lenkja(page)
  ok("talfeltet set talet", p.storleik === 240, `storleik ${p.storleik}`)
  // Ei liste som svarte på ein annan storleik er ikkje ei liste lenger:
  // «førre svar» har ingen stad å gå, og skal la ribbetalet stå.
  const forStorleik = `${p.ribbX}×${p.ribbY}`
  await page.keyboard.press("Shift+f")
  await rolig(page)
  p = await lenkja(page)
  ok(
    "og lista gjeld ikkje når spørsmålet er eit anna",
    `${p.ribbX}×${p.ribbY}` === forStorleik,
    `${forStorleik} → ${p.ribbX}×${p.ribbY}`,
  )

  // --- TALFELTET KLEMMER ---------------------------------------------------
  await page.getByLabel("storleik, tal", { exact: true }).fill("99999")
  await page.keyboard.press("Enter")
  await rolig(page)
  p = await lenkja(page)
  ok("eit tal utanfor bandet vert klemt inn i det", p.storleik === 1200, `storleik ${p.storleik}`)

  // --- ANGRE ---------------------------------------------------------------
  // Frå 99999 → 1200 er eitt steg attende til 240, og eitt til dit vi kom frå.
  await page.getByLabel("angre siste endring").click()
  await rolig(page)
  p = await lenkja(page)
  ok("angre tek deg eitt steg attende", p.storleik === 240, `storleik ${p.storleik}`)
  await page.keyboard.press("z")
  await rolig(page)
  p = await lenkja(page)
  ok("og tasten gjer det same", p.storleik === 150, `storleik ${p.storleik}`)

  // --- TASTANE -------------------------------------------------------------
  for (const [tast, vent] of [["1", "flate"], ["3", "kontur"], ["2", "lag"]]) {
    await page.keyboard.press(tast)
    await page.waitForTimeout(250)
    const q = await lenkja(page)
    ok(`tasten ${tast} byter lesemåte`, q.view === vent, String(q.view))
  }
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)
  ok("escape lukkar arket", (await page.getByLabel("vis kontrollane").count()) === 1)
  await page.keyboard.press("o")
  await page.waitForTimeout(200)
  ok("o opnar han att", (await page.getByLabel("gøym kontrollane").count()) === 1)

  // --- EIT FELT SOM ER TEKE EIG SINE EIGNE TASTAR --------------------------
  const felt = page.getByLabel("storleik, tal", { exact: true })
  await felt.click()
  await felt.press("3")
  await page.waitForTimeout(250)
  p = await lenkja(page)
  ok("eit tal skrive i eit felt byter ikkje lesemåte", p.view === "lag", String(p.view))
  await felt.press("Escape")

  // --- MEDAN FILA VERT LESEN -----------------------------------------------
  // Eit skann tek fleire sekund å tolke. I dei sekunda stod dei gamle tala
  // i hovudlina og fortalde om eit objekt som ikkje var der lenger. No
  // står det at fila vert lesen — og det MÅ slutte å stå der når ho er
  // lesen: ei line som heng att er verre enn inga line.
  // Prøvetakaren ser på ENDRINGAR og ikkje på klokka: ei lita fil kan verte
  // lesen på under ein tjuedels sekund, og ein prøvetakar som ser kvart
  // tjuande millisekund melder då at lina aldri stod der ho stod.
  await page.evaluate(`(function(){
    window.LES = []
    function sjaa(){
      var el = document.querySelector("section[aria-label='kontrollar'] button[aria-label='delar, kuttlengd og ark']")
      var txt = el ? el.textContent.trim() : ""
      var L = window.LES
      if (txt && (!L.length || L[L.length-1] !== txt)) L.push(txt)
    }
    new MutationObserver(sjaa).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })
    setInterval(sjaa, 20)
  })()`)
  const mappe = mkdtempSync(join(tmpdir(), "slicerman-"))
  // Eit langt filnamn er den verste saka for hovudlina: kjeldepilla
  // veks til taket sitt og et av plassen tala har.
  const fil = join(mappe, "kule-med-eit-ganske-langt-namn.stl")
  writeFileSync(fil, kuleStl(60, 150))
  await page.setInputFiles("input[type=file]", fil)
  await rolig(page)
  await page.waitForTimeout(400)
  const les = (await page.evaluate("window.LES")) as string[]
  ok("hovudlina seier frå medan fila vert lesen", les.some((t) => /les fila/i.test(t)))
  ok(
    "og sluttar å seie det når ho er lesen",
    !/les fila/i.test(les[les.length - 1] ?? ""),
    les[les.length - 1],
  )
  /**
   * NAMNET STÅR, MEN IKKJE PÅ KNAPPEN.
   *
   * Kjeldeknappen bar filnamnet i hovudlina, og på ein telefon vart det
   * «DRAGON_…»: kappa so kort at ikonet ved sida sa meir enn bokstavane —
   * og han pressa den siste knappen i lina ned på ei rad for seg sjølv. No
   * er han eit ikon, og namnet står heilt i grepslina når arket er ope.
   *
   * Lukka står det framleis i det TILGJENGELEGE namnet, som er det ein
   * skjermlesar får, og det er det denne prøva ser på. Ho las teksten i
   * knappen, og den er tom no.
   */
  ok(
    "kjelda er fila",
    ((await page.getByLabel("hent eit nett").getAttribute("aria-label")) ?? "")
      .toLowerCase()
      .includes("kule"),
  )
  await opnePanelet(page)
  await rolig(page)
  ok(
    "og namnet står heilt når arket er ope",
    (await page.locator("section[aria-label='kontrollar'] button", { hasText: /kule/i }).count()) > 0,
  )

  // --- PÅ EIN SMAL TELEFON -------------------------------------------------
  // Dei tre tala ER grunnen til at lina finst. På ein skjerm på 320 stod
  // det «12 delar · 17,…»: kjelda, tala og tre knappar fekk ikkje plass på
  // ei line, og det som gav etter var det einaste som ikkje kunne det.
  for (const breidd of [320, 360, 390, 414, 430]) {
    await page.setViewportSize({ width: breidd, height: 720 })
    await page.waitForTimeout(250)
    const kappa = await page.evaluate(`(function(){
      var el = document.querySelector("section[aria-label='kontrollar'] button[aria-label='delar, kuttlengd og ark']")
      return el ? el.scrollWidth - el.clientWidth : -1
    })()`)
    ok(`tala står heile på ${breidd} px`, kappa === 0, `${kappa} px kappa`)
  }

  // --- TAKET ---------------------------------------------------------------
  /**
   * INGEN TILSTAND FÅR DEKKJE MEIR ENN DETTE.
   *
   * Arket er ein meny over eit objekt, og eit objekt du ikkje ser er ein
   * reiskap som ikkje seier deg noko. Det fulle steget las 621 px av 844
   * — sytti prosent — av di taket låg på RULLEKASSA og ikkje på arket:
   * grep, hovudline, svarline og fot står utanfor kassa og tel like fullt.
   *
   * Taket ligg på arket no (sjå `maxHeight` i controls-panel), og då er
   * dette den prøva som held det der. Utan henne driv det attende ei rad
   * om gongen, og kvar rad ser rimeleg ut åleine.
   */
  const TAK = 45
  const dekninga = () =>
    page.evaluate(`(function(){
      var s = document.querySelector("section[aria-label='kontrollar']")
      if (!s) return -1
      var r = s.getBoundingClientRect()
      return Math.round((window.innerHeight - r.top) / window.innerHeight * 1000) / 10
    })()`) as Promise<number>
  // MÅLMASKINA STÅR FYRST: iPhone 16e er 1170×2532 på tre gonger, som er
  // 390×844 i CSS. Dei to andre er ein mindre Android og ein gamal SE —
  // ei rad som får plass på 390 og ikkje på 320 er ei rad som bryt.
  for (const [breidd, hogd] of [
    [390, 844],
    [360, 780],
    [320, 700],
  ]) {
    await page.setViewportSize({ width: breidd, height: hogd })
    await page.waitForTimeout(300)
    // Arket står halvope her; knappen tek det til det fulle og attende.
    for (const [steg, vidare] of [
      ["halvope", "alle parametrar"],
      ["heilope", "færre kontrollar"],
    ]) {
      const d = await dekninga()
      ok(`${steg} dekkjer under ${TAK} % på ${breidd}×${hogd}`, d > 0 && d <= TAK, `${d} %`)
      /**
       * OG INGEN KNAPP UTANFOR SKJERMEN.
       *
       * Høgda var målt og breidda var det ikkje. Ei rad med fem knappar og
       * ei teiknforklaring treng 359 px; ei rute på 320 gjev rada 270, og
       * dei to siste knappane låg på 342..384 — ikkje kappa, ikkje
       * rullbare, berre utanfor. Ingenting feilar: knappen finst i DOM-en,
       * `getByLabel` finn han, og eit klikk ventar til det gjev opp.
       *
       * Det gjekk gale i det ein femte knapp kom i rada, og rada var trong
       * frå før. Difor står prøva her og ikkje på den eine knappen.
       */
      const ute = (await page.evaluate(`(function(){
        var W = window.innerWidth
        var ut = []
        document.querySelectorAll("section[aria-label='kontrollar'] button").forEach(function(e){
          var r = e.getBoundingClientRect()
          if (!r.width) return
          if (r.right > W + 0.5 || r.left < -0.5) ut.push((e.getAttribute("aria-label")||e.textContent||"?").trim())
        })
        return ut
      })()`)) as string[]
      ok(`${steg} held kvar knapp innanfor ${breidd} px`, ute.length === 0, ute.join(" | "))
      await page.getByLabel(vidare).click()
      await page.waitForTimeout(350)
    }
  }
  await page.setViewportSize({ width: 1000, height: 900 })

  // --- STABELEN FINST PÅ TELEFONEN OG -------------------------------------
  /**
   * SKUFFA VAR `benk &&`, og då fanst korkje kuttlista, platene, stabelen
   * eller oppsettet på ein telefon. Stabelen er den av dei fire du GJER noko
   * i, og han hadde ingen dør der i det heile: heile handa var ein reiskap
   * du berre kunne nå frå ein skjerm over 1180 px.
   *
   * Tre ting må halde, og alle tre er ting som ikkje kastar når dei ryk:
   * knappen finst, skuffa opnar seg der ho skal — ho fekk benkeveggane sine
   * og stod to hundre og sytti pikslar frå venstre kant med halve breidda
   * utanfor skjermen — og ho lèt hovudlina stå, so du ser delane og platene
   * svare medan du redigerer.
   */
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await opnePanelet(page)
  const stabelKnapp = page.getByLabel("opne stabelen")
  ok("telefonen har ein veg inn i stabelen", (await stabelKnapp.count()) === 1)
  await stabelKnapp.click()
  await rolig(page)
  await page.waitForTimeout(300)

  const skuffa = page.locator("section[aria-label='verkty']")
  const boks = await skuffa.boundingBox()
  ok(
    "og skuffa står innanfor skjermen",
    !!boks && boks.x >= 0 && boks.x + boks.width <= 391,
    boks ? `x ${boks.x.toFixed(0)}, breidd ${boks.width.toFixed(0)}` : "inga skuff",
  )
  const rader390 = await skuffa.getByLabel(/^X\d+, stad$/).count()
  ok("og han syner ribbene", rader390 >= 2, `${rader390} rader`)

  // Hovudlina skal stå UNDER skuffa og ikkje bak henne: du flyttar ei ribbe
  // og ser talet svare. Ei skuff som dekkjer svaret må lukkast for å lesast.
  const lina = await page
    .locator("section[aria-label='kontrollar'] button[aria-label='delar, kuttlengd og ark']")
    .boundingBox()
  ok(
    "og hovudlina står under henne, ikkje bak",
    !!lina && !!boks && lina.y >= boks.y + boks.height - 1,
    lina && boks ? `skuffa endar ${(boks.y + boks.height).toFixed(0)}, lina ${lina.y.toFixed(0)}` : "",
  )
  // --- SKUFFA BYTER VERKTY, OG KUTTLISTA ER EI ANNA LISTE HER ------------
  /**
   * FIRE ORD I TOPPLINA, av di ein telefon ikkje har den topplina benken
   * har. Utan dei kom du berre dit knappen du trykte tok deg.
   */
  for (const ord of ["kuttliste", "plater", "stabelen", "oppsett"]) {
    const kn = skuffa.locator("button", { hasText: new RegExp(`^${ord}$`, "i") })
    ok(`skuffa byter til ${ord}`, (await kn.count()) === 1)
  }

  /**
   * SJU KOLONNAR ER EIN TABELL FOR EIN SKJERM.
   *
   * På 390 px braut «74,5 × 129,8» over to liner i kvar einaste rad. Fire
   * står att, og det er dei fire du treng med lista i handa: kva delen
   * heiter, kor stor han er, om han heng i noko, og kva plate han ligg på.
   */
  await skuffa.locator("button", { hasText: /^kuttliste$/i }).first().click()
  await rolig(page)
  const kolonnar = () =>
    page.evaluate(`(function(){
      var ut = []
      document.querySelectorAll("section[aria-label='verkty'] thead th").forEach(function(e){
        if (getComputedStyle(e).display !== "none") ut.push(e.textContent.replace(/[\u2191\u2193]/g, "").trim())
      })
      return ut
    })()`) as Promise<string[]>
  const rad390 = await kolonnar()
  ok("kuttlista har fire kolonnar på 390 px", rad390.length === 4, rad390.join(" · "))

  /**
   * OG DEI DU HAR TEKE I STÅR FYRST.
   *
   * Ei kuttliste er heile jobben. Medan du byggjer er det ikkje heile
   * jobben du held på med — det er dei du har låst, og dei ligg spreidde
   * mellom alle dei andre. Filteret er ikkje ei gøymsle: brikka seier
   * forholdet, og talet i hovudlina er framleis heile jobben.
   */
  const teljRader = () => skuffa.locator("tbody tr").count()
  const alle390 = await teljRader()
  ok(
    "utan låsar står alle radene, og inga brikke",
    alle390 > 0 &&
      (await skuffa.locator("button", { hasText: /^mine /i }).count()) === 0,
    `${alle390} rader`,
  )

  await skuffa.locator("button", { hasText: /^stabelen$/i }).first().click()
  await rolig(page)
  for (const a of ["X1", "X3"]) {
    await skuffa.getByLabel(`${a}: lås`).click()
    await rolig(page)
  }
  await skuffa.locator("button", { hasText: /^kuttliste$/i }).first().click()
  await rolig(page)
  const mine390 = await teljRader()
  const adr390 = await skuffa.locator("tbody tr td:first-child").allInnerTexts()
  const brikka = await skuffa.locator("button", { hasText: /^mine /i }).first().innerText()
  ok(
    "med låsar står berre dine",
    mine390 < alle390 && mine390 > 0,
    `${adr390.join(" ")} — ${mine390} av ${alle390}`,
  )
  ok("og brikka seier forholdet", /\d+\s+av\s+\d+/i.test(brikka), brikka)

  /**
   * OG SKUFFA ER SÅ HØG SOM LISTA, IKKJE SÅ HØG SOM HO FÅR LOV TIL.
   *
   * Ei kuttliste med tre rader i stod med tusen pikslar kvitt papir under
   * seg, over eit objekt som var pressa opp i eit band det ikkje trong.
   * Det kvite er ikkje ein feil som kastar — det er berre plass ingen får.
   */
  const skuffH = async () => (await skuffa.boundingBox())?.height ?? 0
  const kort = await skuffH()
  await skuffa.locator("button", { hasText: /^mine /i }).first().click()
  await rolig(page)
  await page.waitForTimeout(500)
  const lang = await skuffH()
  ok(
    "skuffa er så høg som lista er lang",
    kort > 0 && lang > kort + 40,
    `${mine390} rader ${kort.toFixed(0)} px, ${alle390} rader ${lang.toFixed(0)} px`,
  )

  await page.setViewportSize({ width: 1000, height: 900 })

  await gestane(browser)
  await plata(browser, feil)
  await lerretet(browser, feil)
  await benken(browser, feil)

  ok("ingen feil i konsollen", feil.length === 0, feil.slice(0, 2).join(" | "))
  await browser.close()
  console.log(brot ? `\n${brot} brot` : "\npanelet gjer det det seier")
  process.exit(brot ? 1 : 0)
}

void main()
