"use client"

import { useMemo } from "react"
import * as THREE from "three"
import { bitarI, type SkalaId } from "@/lib/skala"

/**
 * Referansen teikna, i millimeter, med botnen på golvet.
 *
 * Materialet er lyst og matt og ligg med vilje langt frå treet: det er ikkje
 * noko du skal skjere, og det skal ikkje eit augeblikk kunne forvekslast med
 * ein del. Skuggen står, av di eit ting utan skugge ikkje står på golvet —
 * det svevar.
 */
export function Skala({ id, x, y }: { id: SkalaId; x: number; y: number }) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d8d8d8",
        roughness: 0.95,
        metalness: 0,
      }),
    [],
  )
  const bitar = bitarI(id)
  if (!bitar.length) return null
  return (
    <group position={[x, y, 0]}>
      {bitar.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, b.y, b.z]}
          // Sylinderen i three ligg langs Y; her er det Z som er opp.
          rotation={b.form === "sylinder" ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
          material={mat}
          castShadow
          receiveShadow
        >
          {b.form === "boks" && <boxGeometry args={[b.w, b.d, b.h]} />}
          {b.form === "sylinder" && <cylinderGeometry args={[b.r, b.r, b.h, 32]} />}
          {b.form === "kule" && <sphereGeometry args={[b.r, 28, 20]} />}
        </mesh>
      ))}
    </group>
  )
}
