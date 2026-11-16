"use client"

import { GizmoViewcube, TransformControls, useGizmoContext } from "@react-three/drei"
import { useThree, type ThreeEvent } from "@react-three/fiber"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react"
import * as THREE from "three"
import type { Vec3 } from "@/lib/core"
import { useMaal, mt } from "@/lib/i18n"
import { broek, PLAN_ROM, ramme as planRamme, type Plan } from "@/lib/plan"
import { GROUND_Y } from "@/lib/ramme"
import type { GizmoModus } from "./arket-legacy"

const SIDEORD_NN = ["høgre", "venstre", "topp", "botn", "framme", "bak"]
const SIDEORD_EN = ["right", "left", "top", "bottom", "front", "back"]

type OrbitLike = {
  enabled: boolean
  enableDamping?: boolean
  target: THREE.Vector3
  update?: () => void
}

const MODEL_TIL_VERD = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 1, 0),
)
const VERD_TIL_MODEL = MODEL_TIL_VERD.clone().transpose()

const KUBE_KANT = new THREE.EdgesGeometry(new THREE.BoxGeometry(60.4, 60.4, 60.4))

export function ModernKube({
  laast,
  paper,
  ink,
  hoverColor,
  ...rest
}: {
  laast: boolean
  paper: string
  ink: string
  hoverColor: string
} & Omit<ComponentProps<typeof GizmoViewcube>, "faces" | "color" | "textColor" | "strokeColor" | "hoverColor">) {
  const maal = useMaal()
  const { tweenCamera } = useGizmoContext()
  const faces = mt(maal, SIDEORD_EN, SIDEORD_NN)

  const trykk = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.object.position.lengthSq() > 1e-6 || !e.face) return null
    tweenCamera(e.face.normal)
    return null
  }

  return (
    <group>
      <GizmoViewcube
        {...rest}
        faces={faces}
        color={paper}
        textColor={ink}
        strokeColor={ink}
        hoverColor={hoverColor}
        onClick={laast ? trykk : undefined}
      />
      <lineSegments geometry={KUBE_KANT} raycast={() => null}>
        <lineBasicMaterial color={ink} transparent opacity={0.32} />
      </lineSegments>
      <group position={[-33, -33, -33]}>
        <mesh position={[17, 0, 0]} rotation={[0, 0, -Math.PI / 2]} raycast={() => null}>
          <cylinderGeometry args={[0.9, 0.9, 34, 10]} />
          <meshBasicMaterial color="#e05a1a" />
        </mesh>
        <mesh position={[35, 0, 0]} rotation={[0, 0, -Math.PI / 2]} raycast={() => null}>
          <coneGeometry args={[2.5, 6, 10]} />
          <meshBasicMaterial color="#e05a1a" />
        </mesh>
        <mesh position={[0, 17, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.9, 0.9, 34, 10]} />
          <meshBasicMaterial color="#1f6feb" />
        </mesh>
        <mesh position={[0, 35, 0]} raycast={() => null}>
          <coneGeometry args={[2.5, 6, 10]} />
          <meshBasicMaterial color="#1f6feb" />
        </mesh>
        <mesh position={[0, 0, 17]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.9, 0.9, 34, 10]} />
          <meshBasicMaterial color={ink} />
        </mesh>
        <mesh position={[0, 0, 35]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <coneGeometry args={[2.5, 6, 10]} />
          <meshBasicMaterial color={ink} />
        </mesh>
      </group>
    </group>
  )
}

type RammaMini = {
  cx: number
  cy: number
  s: number
  min: Vec3
  max: Vec3
  midt: Vec3
}

const tilVerd = (f: RammaMini, p: Vec3) =>
  new THREE.Vector3(f.s * (p[0] - f.cx), f.s * p[2] + GROUND_Y, -f.s * (p[1] - f.cy))
const fraaVerd = (f: RammaMini, v: THREE.Vector3): Vec3 => [
  v.x / f.s + f.cx,
  f.cy - v.z / f.s,
  (v.y - GROUND_Y) / f.s,
]
const nTilVerd = (n: Vec3) => new THREE.Vector3(n[0], n[2], -n[1]).normalize()
const nFraaVerd = (v: THREE.Vector3): Vec3 => {
  const n = new THREE.Vector3(v.x, -v.z, v.y).normalize()
  return [n.x, n.y, n.z]
}

const quatFraaModelEuler = (rxDeg: number, ryDeg: number, rzDeg: number) => {
  const e = new THREE.Euler((rxDeg * Math.PI) / 180, (ryDeg * Math.PI) / 180, (rzDeg * Math.PI) / 180, "ZYX")
  const m = new THREE.Matrix4().makeRotationFromEuler(e)
  const w = new THREE.Matrix4().multiplyMatrices(MODEL_TIL_VERD, m).multiply(VERD_TIL_MODEL)
  return new THREE.Quaternion().setFromRotationMatrix(w)
}

const modelEulerFraaQuat = (q: THREE.Quaternion): Vec3 => {
  const w = new THREE.Matrix4().makeRotationFromQuaternion(q)
  const m = new THREE.Matrix4().multiplyMatrices(VERD_TIL_MODEL, w).multiply(MODEL_TIL_VERD)
  const e = new THREE.Euler().setFromRotationMatrix(m, "ZYX")
  const deg = (r: number) => {
    const d = Math.round((r * 180) / Math.PI)
    return Object.is(d, -0) ? 0 : d
  }
  return [deg(e.x), deg(e.y), deg(e.z)]
}

export function RomGizmo({
  f,
  modus,
  valt,
  snappSteg,
  rot = [0, 0, 0],
  storleik = 150,
  onPlan,
  onSettRot,
  onSettStorleik,
}: {
  f: RammaMini | null
  modus: GizmoModus | null
  valt: Plan | null
  snappSteg: number
  rot?: Vec3
  storleik?: number
  onPlan: (id: number, o: Vec3, n: Vec3) => void
  onSettRot?: (rx: number, ry: number, rz: number) => void
  onSettStorleik?: (s: number) => void
}) {
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const invalidate = useThree((s) => s.invalidate)
  const [targetObj, setTargetObj] = useState<THREE.Group | null>(null)
  const [shift, setShift] = useState(false)
  const dreg = useRef(false)
  const startStor = useRef(storleik)

  useEffect(() => {
    const ned = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShift(true)
    }
    const opp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShift(false)
    }
    window.addEventListener("keydown", ned)
    window.addEventListener("keyup", opp)
    return () => {
      window.removeEventListener("keydown", ned)
      window.removeEventListener("keyup", opp)
    }
  }, [])

  const ankret = useMemo(() => {
    if (!f) return null
    if (valt) {
      const r = planRamme(valt, f.min, f.max)
      return {
        pos: tilVerd(f, r.o),
        q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nTilVerd(r.n)),
      }
    }
    return {
      pos: tilVerd(f, f.midt),
      q: modus === "rotate" ? quatFraaModelEuler(rot[0], rot[1], rot[2]) : new THREE.Quaternion(),
    }
  }, [f, valt, modus, rot])

  useLayoutEffect(() => {
    if (!targetObj || !ankret || dreg.current) return
    targetObj.position.copy(ankret.pos)
    targetObj.quaternion.copy(ankret.q)
    targetObj.scale.set(1, 1, 1)
    targetObj.updateMatrixWorld()
    invalidate()
  }, [targetObj, ankret, invalidate])

  if (!f || !modus || !ankret) return null

  const aktivSteg = shift ? 15 : snappSteg > 0 ? snappSteg : 0
  const rotSnap = aktivSteg ? (aktivSteg * Math.PI) / 180 : null
  const transSnap = shift ? 0.08 : null
  const scaleSnap = shift ? 0.1 : null

  return (
    <>
      <group
        ref={(g) => {
          if (g !== targetObj) setTargetObj(g)
        }}
      />
      {targetObj && (
        <TransformControls
          object={targetObj}
          mode={modus}
          size={0.72}
          rotationSnap={rotSnap}
          translationSnap={transSnap}
          scaleSnap={scaleSnap}
          onMouseDown={() => {
            dreg.current = true
            startStor.current = storleik
            if (controls) {
              controls.enabled = false
              const d = controls.enableDamping
              controls.enableDamping = false
              controls.update?.()
              controls.enableDamping = d
            }
          }}
          onObjectChange={() => {
            if (!targetObj || !f) return
            if (valt && modus !== "scale") {
              const nyO = broek(fraaVerd(f, targetObj.position), f.min, f.max).map((c) =>
                Math.min(1 + PLAN_ROM, Math.max(-PLAN_ROM, +c.toFixed(4))),
              ) as Vec3
              const nyN = nFraaVerd(new THREE.Vector3(0, 0, 1).applyQuaternion(targetObj.quaternion))
              onPlan(valt.id, nyO, nyN)
            } else if (modus === "rotate" && onSettRot) {
              const [rx, ry, rz] = modelEulerFraaQuat(targetObj.quaternion)
              onSettRot(rx, ry, rz)
            } else if (modus === "scale" && onSettStorleik) {
              const s = (targetObj.scale.x + targetObj.scale.y + targetObj.scale.z) / 3
              onSettStorleik(Math.round(startStor.current * s))
            }
            invalidate()
          }}
          onMouseUp={() => {
            dreg.current = false
            targetObj.scale.set(1, 1, 1)
            if (controls) {
              const d = controls.enableDamping
              controls.enableDamping = false
              controls.update?.()
              controls.enableDamping = d
              controls.enabled = true
            }
            invalidate()
          }}
        />
      )}
    </>
  )
}
