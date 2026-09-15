"use client"

import { useEffect } from "react"

/** Heile verkstaden på telefonen. Nye utgåver ventar til appen er lukka;
 * korkje eit snitt eller eit drag får ei omlasting under seg. */
export function Heimskjerm() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    let registrering: ServiceWorkerRegistration | undefined
    let sist = Date.now()
    const start = () => {
      void navigator.serviceWorker.register("/verkstad-sw.js", { scope: "/", updateViaCache: "none" })
        .then((r) => { registrering = r })
        .catch(() => { /* nettutgåva verkar òg utan mellomlager */ })
    }
    const tilbake = () => {
      if (document.visibilityState !== "visible" || Date.now() - sist < 60000) return
      sist = Date.now()
      if (registrering) void registrering.update().catch(() => {})
      else start()
    }
    if (document.readyState === "complete") start()
    else window.addEventListener("load", start, { once: true })
    document.addEventListener("visibilitychange", tilbake)
    return () => {
      window.removeEventListener("load", start)
      document.removeEventListener("visibilitychange", tilbake)
    }
  }, [])
  return null
}
