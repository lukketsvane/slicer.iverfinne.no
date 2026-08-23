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
import { chromium, type Page } from "playwright"
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

async function main() {
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
  // Ein prøvetakar inne på sida, som skriv ned kvar gong lina endrar seg.
  // Han må stå INNE i sida: sett utanfrå ville kvar avlesing gå ein tur
  // over ei protokollgrense, og det er tregare enn det som skal målast.
  await page.evaluate(`(function(){
    window.LOGG = []
    function sjaa(){
      var row = document.querySelector("section[aria-label='kontrollar'] [aria-live='polite']")
      var txt = row ? row.textContent.trim() : ""
      var L = window.LOGG
      if (txt && (!L.length || L[L.length-1] !== txt)) L.push(txt)
    }
    setInterval(sjaa, 25)
  })()`)
  await page.getByLabel("finn innstillingar").click()
  await rolig(page)

  /**
   * FRAMDRIFTA MÅ RØRE SEG MEDAN HO GJELD.
   *
   * Ho har to måtar å kollapse til «null, og so ferdig» på, og ingen av dei
   * kastar: arbeidaren som reknar heile søket i eitt jafs (då kjem alle
   * meldingane i same augeblinken som svaret), og hovudtråden som teiknar
   * heile scena om att for kvar melding (då hopar dei seg opp i køen og kjem
   * i klumpar). Begge to gjev ein ring som står stille og so er ferdig, og
   * ein ring som står stille er verre enn ingen ring.
   */
  const gang = (await page.evaluate(
    "window.LOGG",
  )) as string[]
  const steg = gang.filter((t) => /søkjer/i.test(t))
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
  const fil = join(mappe, "kule.stl")
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

  ok("ingen feil i konsollen", feil.length === 0, feil.slice(0, 2).join(" | "))
  await browser.close()
  console.log(brot ? `\n${brot} brot` : "\npanelet gjer det det seier")
  process.exit(brot ? 1 : 0)
}

void main()
