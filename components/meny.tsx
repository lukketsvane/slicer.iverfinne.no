"use client"
/**
 * HØGREMENYEN — og han finst berre på ein benk.
 *
 * Ein telefon har ingen høgreknapp, og eit langt trykk er alt teke: det tek
 * eit punkt bort. So dette er ikkje ein ny måte å gjere ting på — det er
 * den same lista av handlingar, lagd der peikaren står, for den handa som
 * har ei mus. Kvar line her finst frå før som ein tast eller ein knapp, og
 * det er meininga: menyen SYNER kva som går an, han utvidar ikkje kva som
 * går an.
 *
 * Flat som alt anna: hårstrek kring, ingen skugge, ingen glød, ingen
 * overgang. Ei line er eit ord og ein tast, og den som ikkje går an står
 * dempa i staden for å vera borte — eit val som forsvinn er eit val du
 * leitar etter neste gong.
 */
import { useEffect, useRef, type ReactElement } from "react"
import { HAIR } from "./deler"

export type MenyLine = {
  /** ordet på lina. Eitt eller to ord — ei setning høyrer ikkje heime her. */
  ord: string
  /** tasten som gjer det same, om han finst. Menyen lærer deg tastane. */
  tast?: string
  /** kva det gjer. Utan denne står lina dempa og tek ikkje trykk. */
  gjer?: () => void
}

export type MenyStad = { x: number; y: number; liner: MenyLine[] }

export function Meny({ stad, onLukk }: { stad: MenyStad | null; onLukk: () => void }): ReactElement | null {
  const boks = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!stad) return
    /**
     * HAN LUKKAR SEG PÅ ALT SOM IKKJE ER HAN.
     *
     * Eit trykk utanfor, escape, eit hjul, eit nytt vindaugsmål. Grunnen er
     * den same kvar gong: menyen står på ein PLASS, og alt som flyttar det
     * som er under han gjer plassen til ei lygn. Ein meny som heng att over
     * feil rad er verre enn ingen meny.
     */
    /**
     * MEN IKKJE PÅ HAN SJØLV.
     *
     * Lyttaren står i FANGSTFASEN — han må det, elles rekk noko under å
     * svare før menyen er borte — og då er `stopPropagation` på boksen
     * verdlaus: fangstfasen går ovanfrå og ned, og boksen er under. Utan
     * dette lukka eit trykk på ei line menyen FØR lina sitt eige klikk kom
     * fram, og menyen gjorde ingenting same kva du valde.
     */
    const av = (e: Event) => {
      const t = e.target
      if (t instanceof Element && t.closest("[data-meny]")) return
      onLukk()
    }
    const tast = (e: KeyboardEvent) => { if (e.key === "Escape") onLukk() }
    window.addEventListener("pointerdown", av, { capture: true })
    window.addEventListener("wheel", av, { passive: true })
    window.addEventListener("resize", av)
    window.addEventListener("keydown", tast)
    return () => {
      window.removeEventListener("pointerdown", av, { capture: true })
      window.removeEventListener("wheel", av)
      window.removeEventListener("resize", av)
      window.removeEventListener("keydown", tast)
    }
  }, [stad, onLukk])

  /**
   * OG HAN HELD SEG INNANFOR RUTA. Peikaren kan stå fem pikslar frå
   * nedkanten, og ein meny som stikk ut der er ein meny du ikkje kan nå.
   * Rekna av det menyen FAKTISK vart, ikkje av eit overslag: ei line meir
   * eller mindre endrar høgda, og eit overslag ville teke feil nett når
   * lista er lengst.
   */
  useEffect(() => {
    const el = boks.current
    if (!el || !stad) return
    const r = el.getBoundingClientRect()
    const x = Math.max(4, Math.min(stad.x, innerWidth - r.width - 4))
    const y = Math.max(4, Math.min(stad.y, innerHeight - r.height - 4))
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [stad])

  if (!stad) return null
  return (
    <div
      ref={boks}
      data-meny=""
      role="menu"
      className="fixed z-50 min-w-[136px] rounded-lg border py-1"
      style={{ ...HAIR, left: stad.x, top: stad.y, background: "var(--paper)" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stad.liner.map((l) => (
        <button
          key={l.ord}
          type="button"
          role="menuitem"
          disabled={!l.gjer}
          data-meny-line={l.ord}
          className="hit flex w-full items-center gap-4 px-3 py-1.5 text-left text-[11px]"
          style={l.gjer ? undefined : { opacity: 0.3 }}
          onClick={() => {
            l.gjer?.()
            onLukk()
          }}
        >
          <span className="min-w-0 flex-1 truncate">{l.ord}</span>
          {l.tast && <span className="tab dim shrink-0 text-[10px]">{l.tast}</span>}
        </button>
      ))}
    </div>
  )
}
