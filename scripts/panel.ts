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

  /** to fingrar frå ei stode til ei anna, i tjue steg */
  const gest = async (fra: [Pt, Pt], til: (t: number) => [Pt, Pt]) => {
    await send("touchStart", fra)
    for (let i = 1; i <= 20; i++) {
      await send("touchMove", til(i / 20))
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
  // Fyrti grader inn skal gje fyrti grader ut. Bandet var −25 til −55 og
  // dekte over at gesten gav 53: `sumVri` la den same vridinga saman om
  // att for kvar hending som gjekk før gesten fekk namn (sjå `last = c` i
  // daudsona). Ein vri som gjev ein tredel for mykje er ikkje ein vri du
  // kan sikte med.
  ok("vri med klokka vender objektet like mykje", dv < -35 && dv > -45, `${vend0}° → ${p.rotZ}°`)

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
  const vend1 = Number(p.rotZ)
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
  ok("og vender ikkje objektet", Number(p.rotZ) === vend1, `${vend1}° → ${p.rotZ}°`)

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

  // --- MELLOMROM: BERRE OBJEKTET -------------------------------------------
  await page.locator("body").click({ position: { x: 660, y: 500 } })
  await page.keyboard.down("Space")
  await page.waitForTimeout(300)
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
   * KVA SVARET VART, LESE AV LENKJA.
   *
   * Rada «1 av 12 · 10×22 ribber» stod her og vart lesen med ein
   * `aria-live`-veljar. Ho er borte frå telefonen: ho kosta ei rad av eit
   * ark med tak på 45 %, og det ho fortalde er det knappen sjølv gjer.
   *
   * Sjølve steget er uendra, og det er DET som må prøvast. URL-en ber
   * ribbetalet som faktisk er sett, so han seier alt rada sa — utan å
   * krevje at rada finst. Heile den rangerte lista står framleis på
   * benken, og `benken()` prøver henne der.
   */
  let p = await lenkja(page)
  const fyrste = `${p.ribbX}×${p.ribbY}`
  ok("fyrste trykket set eit svar", Number(p.ribbX) > 0 && Number(p.ribbY) > 0, fyrste)

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
  await page.getByLabel("vis kontrollane").click()
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
  ok(
    "kjelda er fila",
    (await page.getByLabel("hent eit nett").innerText()).toLowerCase().includes("kule"),
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
      await page.getByLabel(vidare).click()
      await page.waitForTimeout(350)
    }
  }
  await page.setViewportSize({ width: 1000, height: 900 })

  await gestane(browser)
  await benken(browser, feil)

  ok("ingen feil i konsollen", feil.length === 0, feil.slice(0, 2).join(" | "))
  await browser.close()
  console.log(brot ? `\n${brot} brot` : "\npanelet gjer det det seier")
  process.exit(brot ? 1 : 0)
}

void main()
