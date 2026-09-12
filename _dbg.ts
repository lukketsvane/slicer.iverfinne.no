import { chromium } from "playwright"
const U = process.env.URL + "#p=" + encodeURIComponent(JSON.stringify({ plan: "1@0.5,0.5,0.5/1,0,0;2@0.5,0.5,0.5/0,1,0" }))
void (async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM })
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await page.goto(U, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  for (const namn of [".tumme .skjer", ".tumme button:not(.skjer)", ".synskube button"]) {
    await page.goto(U, { waitUntil: "networkidle" })
    await page.waitForTimeout(1200)
    await page.mouse.move(190, 700)
    await page.waitForTimeout(3500)
    const st = await page.evaluate(`(() => {
      var m = document.querySelector("main")
      var k = document.querySelector("[aria-label='kontrollar']")
      return { sov: m.hasAttribute("data-sov"), busy: k ? k.getAttribute("aria-busy") : "?", attr: Array.from(m.attributes).map(a=>a.name).join(",") }
    })()`)
    const boks = await page.locator(namn).first().boundingBox()
    console.log(namn.padEnd(30), JSON.stringify(st), "boks=", boks ? `${Math.round(boks.x)},${Math.round(boks.y)} ${Math.round(boks.width)}×${Math.round(boks.height)}` : "null")
  }
  await b.close()
})()
