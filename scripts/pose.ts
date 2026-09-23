import type { Page } from "playwright"
import type { Params } from "../lib/params"

const speil = new WeakMap<Page, Params>()

export async function spegl(page: Page) {
  await page.exposeBinding("__pose", ({ page: p }, s: string) => { speil.set(p, JSON.parse(s)) })
  await page.addInitScript(() => {
    let sist = ""
    setInterval(() => {
      const p = window.slicer?.posen()
      if (!p) return
      const s = JSON.stringify(p)
      if (s === sist) return
      sist = s
      ;(window as unknown as { __pose: (s: string) => void }).__pose(s)
    }, 40)
  })
}

export const posen = (page: Page): Params => (speil.get(page) ?? {}) as Params

export async function settPose(page: Page, bag: Record<string, unknown>) {
  await page.waitForFunction(() => !!window.slicer, undefined, { timeout: 30000 })
  await page.evaluate((b) => window.slicer!.set(b), bag)
  await page.waitForFunction(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true)))))
  await page.waitForFunction(() => document.querySelector("[aria-label='kontrollar']")?.getAttribute("aria-busy") !== "true", undefined, { timeout: 45000 })
}

export async function gaa(page: Page, url: string, o?: Parameters<Page["goto"]>[1]) {
  const [adr, h] = url.split("#p=")
  await page.goto(adr, o)
  if (h) await settPose(page, JSON.parse(decodeURIComponent(h)))
}
