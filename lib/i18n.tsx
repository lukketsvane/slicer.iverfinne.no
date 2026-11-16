"use client"

import { createContext, useContext, useEffect, type ReactNode } from "react"

export type Maal = "en" | "nn"

const MaalKontekst = createContext<Maal>("en")

export function lesMaal(sti?: string): Maal {
  if (!sti) return "en"
  return sti === "/nn" || sti.startsWith("/nn/") ? "nn" : "en"
}

export function MaalProvider({ maal, children }: { maal: Maal; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = maal
  }, [maal])

  return <MaalKontekst.Provider value={maal}>{children}</MaalKontekst.Provider>
}

export function useMaal(): Maal {
  return useContext(MaalKontekst)
}

export function mt<T>(m: Maal, en: T, nn: T): T {
  return m === "nn" ? nn : en
}

export const ord = mt
