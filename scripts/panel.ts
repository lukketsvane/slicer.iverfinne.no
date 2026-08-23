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
import { MAX_DEKKE, paaSkjermen, ramme, type Fit } from "../lib/ramme"
import { SKALAR, skalaBoks } from "../lib/skala"
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

const rolig = (page: Page) =>
  page.waitForFunction(
    () =>
      document
        .querySelector('section[aria-label="kontrollar"]')
        ?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 60000 },
  )

/** «2 av 13 · 7×6 ribber» */
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
    ["høgt attmed", { r: 1.343, w: 1.542, h: 2.2, cy: 1.1 }],
  ]
  const ruter: [string, number][] = [
    ["telefon 390×780", 390 / 780],
    ["telefon smal 320×700", 320 / 700],
    ["brett 820×1180", 820 / 1180],
    ["skjerm 1280×900", 1280 / 900],
    ["vid 1920×800", 1920 / 800],
  ]
  for (const [rn, aspect] of ruter) {
    for (const [fn, fit] of saker) {
      let verst = ""
      for (let d = 0; d <= MAX_DEKKE + 1e-9; d += 0.05) {
        const r = ramme(fit, { dekke: d, aspect, fovDeg: 30, flat: false })
        const p = paaSkjermen(fit, r)
        // Kula er romsleg: ho er rotasjonsfast og tek med hjørne objektet
        // ikkje har. Difor ein liten slark på toppen.
        if (p.topp < -0.06 || p.botn > 1 - d + 0.02) {
          verst = `dekke ${d.toFixed(2)}: topp ${p.topp.toFixed(2)}, botn ${p.botn.toFixed(2)} mot ${(1 - d).toFixed(2)}`
        }
      }
      ok(`${rn} · ${fn}`, verst === "", verst)
    }
  }
}

/**
 * ER REFERANSANE SÅ STORE SOM DEI SEIER?
 *
 * Heile poenget med å setje eit A4-ark ned ved sida av objektet er at
 * lesaren KJENNER det arket. Er det teikna 250 millimeter langt, er det
 * ikkje eit haldepunkt lenger — det er ei løgn om storleik, og ho er verre
 * enn ingen referanse i det heile. Måla står i ei tabell nokon kjem til å
 * pirke på, so dei vert prøvde.
 */
function referansane() {
  const fasit: Record<string, [number, number, number]> = {
    a4: [297, 210, 0.6],
    brus: [66, 66, 115],
    eple: [78, 78, 78],
  }
  for (const q of SKALAR) {
    const b = skalaBoks(q.id)
    const f = fasit[q.id]
    const rett =
      !!b && !!f && Math.abs(b.w - f[0]) < 1 && Math.abs(b.d - f[1]) < 1 && Math.abs(b.h - f[2]) < 1
    ok(
      `${q.label} er ${f?.[0]} × ${f?.[1]} × ${f?.[2]} mm`,
      rett,
      b ? `${b.w} × ${b.d} × ${b.h}` : "fanst ikkje",
    )
  }
  ok("og «av» er ingenting", skalaBoks("av") === null)
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
  ok("vri med klokka vender objektet med klokka", dv < -25 && dv > -55, `${vend0}° → ${p.rotZ}°`)

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

  await page.close()
}

async function main() {
  console.log("innramminga:")
  innramminga()
  console.log("referansane:")
  referansane()
  console.log("panelet:")
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
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

  const forste = await stadLine(page).innerText()
  const m1 = forste.match(/(\d+) av (\d+) · (\d+)×(\d+)/i)
  ok("lina seier kvar i lista vi står", !!m1, forste.replace(/\s+/g, " "))
  if (!m1) {
    await browser.close()
    process.exit(1)
  }
  ok("fyrste trykket set det beste svaret", m1[1] === "1", `${m1[1]} av ${m1[2]}`)

  // Lina er ikkje ei avskrift av seg sjølv: ribbetalet ho seier skal vera
  // det ribbetalet som faktisk står.
  let p = await lenkja(page)
  ok(
    "ribbetalet i lina er det som er sett",
    String(p.ribbX) === m1[3] && String(p.ribbY) === m1[4],
    `lina ${m1[3]}×${m1[4]}, sett ${p.ribbX}×${p.ribbY}`,
  )

  // --- NESTE OG FØRRE ------------------------------------------------------
  await page.getByLabel("neste svar").click()
  await rolig(page)
  const andre = (await stadLine(page).innerText()).match(/(\d+) av (\d+) · (\d+)×(\d+)/i)!
  ok("neste går eitt steg ned", andre[1] === "2", `${andre[1]} av ${andre[2]}`)
  p = await lenkja(page)
  ok(
    "og set det svaret han seier",
    String(p.ribbX) === andre[3] && String(p.ribbY) === andre[4],
    `${andre[3]}×${andre[4]}`,
  )

  await page.getByLabel("førre svar").click()
  await rolig(page)
  const attende = (await stadLine(page).innerText()).match(/(\d+) av (\d+) · (\d+)×(\d+)/i)!
  ok("førre går eitt steg attende", attende[1] === "1", `${attende[1]} av ${attende[2]}`)
  p = await lenkja(page)
  ok(
    "og er attende på det same svaret",
    attende[3] === m1[3] && attende[4] === m1[4] && String(p.ribbX) === m1[3],
    `${attende[3]}×${attende[4]} mot ${m1[3]}×${m1[4]}`,
  )

  // --- LISTA GJELD BERRE DET SPØRSMÅLET HO SVARTE PÅ -----------------------
  await page.getByLabel("vis kontrollane").click()
  await page.getByLabel("storleik, tal", { exact: true }).fill("240")
  await page.keyboard.press("Enter")
  await rolig(page)
  p = await lenkja(page)
  ok("talfeltet set talet", p.storleik === 240, `storleik ${p.storleik}`)
  ok("og lista er borte når spørsmålet er eit anna", (await stadLine(page).count()) === 0)

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
  await page.evaluate(`(function(){
    window.LES = []
    function sjaa(){
      var el = document.querySelector("section[aria-label='kontrollar'] button[aria-label='delar, kuttlengd og ark']")
      var txt = el ? el.textContent.trim() : ""
      var L = window.LES
      if (txt && (!L.length || L[L.length-1] !== txt)) L.push(txt)
    }
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

  // --- SKALAREFERANSEN FYLGJER LENKJA -------------------------------------
  // Lenkja ber alt anna; ein referanse som ikkje er med i henne er ei
  // innstilling som forsvinn i det du deler.
  await page.getByLabel("skala: eple").click()
  await page.waitForTimeout(300)
  p = await lenkja(page)
  ok("referansen fylgjer lenkja", p.skala === "eple", String(p.skala))
  await page.getByLabel("skala: eple").click()
  await page.waitForTimeout(300)
  p = await lenkja(page)
  ok("og eit nytt trykk tek han bort", p.skala === "av", String(p.skala))

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
  await page.setViewportSize({ width: 1280, height: 900 })

  await gestane(browser)

  ok("ingen feil i konsollen", feil.length === 0, feil.slice(0, 2).join(" | "))
  await browser.close()
  console.log(brot ? `\n${brot} brot` : "\npanelet gjer det det seier")
  process.exit(brot ? 1 : 0)
}

void main()
