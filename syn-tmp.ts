import { chromium } from "playwright"
import { rutenett, skrivPlan } from "./lib/plan"
import { lesDeling } from "./lib/params"
const URL = "http://127.0.0.1:3210"
const UT = "/tmp/claude-0/-home-user-slicer-iverfinne-no/1babd847-efe0-5861-8838-14e703052e23/scratchpad"
const main = async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } })
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load")) console.log("  konsoll:", m.text().slice(0, 140)) })
  await page.addInitScript(`setInterval(function () { window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })) }, 700)`)
  await page.goto(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan: skrivPlan(rutenett(3, 3)), storleik: 300 })), { waitUntil: "networkidle" })
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(7000)
  console.log("prikkar utan val:", await page.locator("[data-spor]").count())
  await page.getByRole("button", { name: "gruppe 1", exact: true }).click()
  await page.waitForTimeout(700)
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").first().locator("button").first().click()
  await page.waitForTimeout(3500)
  const prikk = page.locator("[data-spor]")
  console.log("prikkar med eit plan valt:", await prikk.count())
  await page.screenshot({ path: `${UT}/spor3d.png`, clip: { x: 0, y: 40, width: 1060, height: 860 } })
  const hash = () => JSON.parse(decodeURIComponent(page.url().split("#p=")[1] ?? "%7B%7D"))
  const box = await prikk.first().boundingBox()
  console.log("fyrste prikk:", box && `${Math.round(box.x)},${Math.round(box.y)} ${box.width}×${box.height}`)
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 30, cy + 30, { steps: 12 })
    await page.mouse.up()
  }
  await page.waitForTimeout(3500)
  console.log("deling:", hash().deling ?? "(tom)")
  await page.screenshot({ path: `${UT}/spor3d-etter.png`, clip: { x: 0, y: 40, width: 1060, height: 860 } })
  await b.close()
}
void main()
