"use client"

import { useEffect } from "react"

export function Heimskjerm() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    let registrering: ServiceWorkerRegistration | undefined
    let sist = Date.now()
    let rort = false
    let byter = false
    const ned = () => { rort = true }
    const byt = (r: ServiceWorkerRegistration | undefined) => {
      if (!r?.waiting || byter || !navigator.serviceWorker.controller) return
      byter = true
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true })
      r.waiting.postMessage("byt")
    }
    const start = () => {
      void navigator.serviceWorker.register("/verkstad-sw.js", { scope: "/", updateViaCache: "none" })
        .then((r) => {
          registrering = r
          if (!rort) byt(r)
          r.addEventListener("updatefound", () => {
            const ny = r.installing
            ny?.addEventListener("statechange", () => { if (ny.state === "installed" && !rort) byt(r) })
          })
        })
        .catch(() => { /* nettutgåva verkar òg utan mellomlager */ })
    }
    const tilbake = () => {
      if (document.visibilityState !== "visible") return
      byt(registrering)
      if (Date.now() - sist < 60000) return
      sist = Date.now()
      if (registrering) void registrering.update().catch(() => {})
      else start()
    }
    window.addEventListener("pointerdown", ned, { capture: true, once: true })
    if (document.readyState === "complete") start()
    else window.addEventListener("load", start, { once: true })
    document.addEventListener("visibilitychange", tilbake)
    return () => {
      window.removeEventListener("pointerdown", ned, { capture: true })
      window.removeEventListener("load", start)
      document.removeEventListener("visibilitychange", tilbake)
    }
  }, [])
  return null
}
