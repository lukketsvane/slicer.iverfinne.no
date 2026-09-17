export type Fit = {
  r: number
  w: number
  h: number
  cy: number
}

export type Rute = {
  W: number
  H: number
  venstre: number
  hogre: number
  topp: number
  botn: number
}

export const GROUND_Y = -0.9
export const FIT_MARGIN = 1.35
export const FLOOR_TAN = 0.1637
export const MIN_DIST = 3.2
export const MAX_DIST = 48
export const SKODDE_NAER = 8
export const SKODDE_FJERN = 34
export const NAER_LUFT = 12
export const FOV_NAER = 30
export const FOV_FLAT = 2
export const fovSkala = (fovDeg: number) =>
  Math.tan((FOV_NAER * Math.PI) / 360) / Math.tan((fovDeg * Math.PI) / 360)
export const MIN_FRITT = 0.5

export function fritt(rute: Rute) {
  const takX = rute.W * (1 - MIN_FRITT)
  const takY = rute.H * (1 - MIN_FRITT)
  const sumX = Math.max(0, rute.venstre) + Math.max(0, rute.hogre)
  const sumY = Math.max(0, rute.topp) + Math.max(0, rute.botn)
  const kx = sumX > takX ? takX / sumX : 1
  const ky = sumY > takY ? takY / sumY : 1
  const L = Math.max(0, rute.venstre) * kx
  const T = Math.max(0, rute.topp) * ky
  return {
    L,
    T,
    w: Math.max(1, rute.W - sumX * kx),
    h: Math.max(1, rute.H - sumY * ky),
  }
}

export function ramme(
  fit: Fit,
  o: { rute: Rute; fovDeg: number },
): { dist: number; y: number; fri: ReturnType<typeof fritt> } {
  const fri = fritt(o.rute)
  const vHalf = (o.fovDeg * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(vHalf) * (fri.w / fri.h))
  const raw = (fit.r * FIT_MARGIN) / Math.tan(Math.min(vHalf, hHalf))
  const k = fovSkala(o.fovDeg)
  const dist = Math.min(MAX_DIST * k, Math.max(MIN_DIST * k, raw))
  return {
    dist,
    y: Math.min(GROUND_Y + dist * FLOOR_TAN, GROUND_Y + fit.cy),
    fri,
  }
}

export function paaSkjermen(
  fit: Fit,
  r: { dist: number; y: number },
  fovDeg: number,
) {
  const viewH = 2 * r.dist * Math.tan((fovDeg * Math.PI) / 360)
  const midt = GROUND_Y + fit.cy
  const del = (y: number) => 0.5 - (y - r.y) / viewH
  return { topp: del(midt + fit.r), botn: del(midt - fit.r) }
}
