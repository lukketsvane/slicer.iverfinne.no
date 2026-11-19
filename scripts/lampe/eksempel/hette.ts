import { fileURLToPath } from "node:url"
import { gitter, type Grep } from "./gitter"
const STL = fileURLToPath(new URL("./skygge.stl", import.meta.url))
const MESSING = "#b8935a"
const SKJERM = { slag: "boks" as const, senter: [330, 110, 230] as [number, number, number], storleik: [540, 26, 320] as [number, number, number], farge: "#151515" }
export const hette = (grep: Grep) =>
  gitter({
    namn: grep === "drei" ? "hette-kveld" : "hette-arbeid", stl: STL, H: 190.6, grep, avstand: 30, tal: 8, fjern: [1], farge: "#3f4b42", vegg: 260,
    lys: [{ punkt: [-10, -10, 166], radius: 9, farge: "#ffcf9a", styrke: 1.4 }],
    utstyr: (P, D) => [
      { slag: "sylinder", senter: P([-10, -10, 172]), diameter: 30, lengd: 6, retning: [0, 0, 1], farge: "#f4efe6" },
      { slag: "sylinder", senter: P([-10, -10, 192]), diameter: 22, lengd: 8, retning: [0, 0, 1], farge: MESSING, metall: true, ru: 0.35 },
      SKJERM,
    ],
  })
