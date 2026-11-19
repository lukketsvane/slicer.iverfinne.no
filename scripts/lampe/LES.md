# LES.md — depth for the lamp toolkit (`scripts/lampe/`)

Start with the skill (`.claude/skills/slicerman/SKILL.md`) and a JSON spec: `pnpm -s lampe <spek.json>`. Read this only when the spec cannot say it: drawn plates (rings, half-ribs, floors, walls, discs, bent sheets), your own `krav`, `ekstra` parts, another `klaring`/`snitt`, STEP.

## 0. The TS concept command

```
pnpm -s lampe:konsept <mappe|konsept.ts> [--rask] [--bilete] [--alle] [--stor] [--step] [--ut <mappe>] [--json]
```

- no flag (≈3–8 s): engine, rules, built-in `krav`, `produksjon/`. `--rask`: skip `produksjon/`.
- `--bilete` (+15 s): `ark.png` and `produksjon/ark-N.png`. `--alle` (+≈100 s): also 7 views at 1400² in `bilete/`; `--stor` doubles them.
- `--step`: STEP assembly via ForgeCAD, only when env `FORGECAD` (the CLI) and `LAMPE_PY` (python with OCP) are set; otherwise one `step hoppa over` and nothing fails.
- One line out: `ALT OK|IKKJE OK <namn> · BxDxH mm · N plan N delar N ledd N lause N ark M m kg · brot klem[1-21,…] · krav x/y · fiks: <engine fix> · <files>`. `--json` prints the whole `Utfall` instead (rarely needed). Exit 0/1/2.
- Output in `<mappe>/ut/` (gitignored under `scripts/lampe/`). Run `lag()` once per process: the source store is global.

## 1. A `konsept.ts`

```ts
import { profil, skal } from "../../form"
import { halvribber, ringar, utanfraa } from "../../plan"
import type { Kontekst, Params, Registrert, Utstyr } from "../../typar"

export const namn = "ribber"
const H = 250, NAV = 44, HOL = 40.4, Z_NAV = H - NAV / 2
const ytre = (z: number) => 58 + 102 * Math.pow(1 - Math.pow(z / H, 2.2), 1 / 2.2)
export const kropp = () => skal(profil(ytre, 0, H, 72), { vegg: 24, seg: 128, nav: { hogd: NAV, hol: HOL } })
export const bag: Partial<Params> = { tjukn: 4, material: "bjork", klaring: 0.1, snitt: 0.2, arkB: 600, arkH: 400 }
export const plan = (k: Registrert) => utanfraa(ringar(k, 1, [22, 125, Z_NAV]), halvribber(k, 10, 16, 34))
export const utstyr: Utstyr = {
  heng: { tak: H + 420, feste: [0, 0, Z_NAV + 12] },
  utstyr: [{ slag: "paere", senter: [0, 0, Z_NAV - 108], diameter: 60, lengd: 105, retning: [0, 0, 1] }],
}
export const krav = (x: Kontekst) => [x.holKrav("3", HOL), x.krav("ingen tappar", x.tappar === 0, `${x.tappar} tappar`)]
```

(Imports as seen from `scripts/lampe/eksempel/<namn>/konsept.ts`. A working example: `eksempel/hette-a/`, built on `eksempel/gitter.ts`.)

- `kropp()` returns a triangle soup (`Float32Array`, mm, Z up, centred on x = y = 0, standing on z = 0, ≤ 40 000 triangles) or a path to an STL/GLB in mm. All coordinates you write are in that frame, 1:1; `storleik` is set for you.
- `bag` overrides `DEFAULT_PARAMS`; defaults here `tjukn 4`, `bjork`. Never set `rotX/Y/Z`, `glatt`, `forenkl`, `hol`, `scene`.
- `plan` is `Plan[]`, a plan string, or a function of the registered body `k`.
- `utstyr` is the picture only: `heng`, `vegg`, `golv`, `lys`, `utstyr[]` (`paere sokkel leidning sylinder boks kule`; `paere.retning` points from the glass to the base), `delar: { "3": { farge, material } }`, `steg`, `ekstra`.
- `krav(x)`: `x.del(adr)`, `x.hol(adr)`, `x.fri(a, b, skip?)` (smallest distance segment–plate), `x.tappar`, `x.liste`, `x.m` (Metrics), `x.data`, and builders `krav / holKrav / friKrav`.

Working order: body plus two rings with `--rask`; add one family of planes at a time and read `tal` first (as many parts as planes? `0 tapp`? `0 lause`?); then hardware and `krav`; full run only when `--rask` says `ALT OK`. Ids are the engraved addresses and are never renumbered (rings 1.., ribs 10.., feet 30..).

## 2. `rapport.txt`

```
tal      19 plan · 19 delar (5 unike) · 48 ledd (0 tapp, 0 avviste) · 0 lause
kutt     18.48 m · 15.4 min ved 20 mm/s · 3 ark 600 x 400 · utnytting 31 % · 0.531 kg · spor 4.10 mm · minste gods 12.0 mm
harde reglar
  ok   gods       gods i leddet            12,0 mm
```

- Fewer parts than planes: planes vanished (`tomme plan` names them). `tapp` must be 0 unless drawn on purpose; `avviste` and `lause` must be 0.
- `gods` ≥ max(2, tjukn). `utnytting` under 35 % is advice only.
- The `why` of every broken rule is at the end of the file under `kvifor`, so `head -12` is all numbers.
- Built-in krav ids: `lukka budsjett sentrert eittilein volum alleplan posen lause paaark tommeplan spalte`, plus `fin` (full run) and `step`. An open mesh passes `lukka` when the engine reads the same volume.

## 3. `form.ts` — bodies (closed soups; `sjekkNett(n).ok` proves it)

- `skal(profile [r,z][], { vegg, seg?, nav?: { hogd, hol? } })` shell of revolution; `profil(z => r, z0, z1, n)`.
- `loft(sections { z, ring }[], { vegg, lok?, hol? })`; rings `sirkelRing superRing bylgjeRing vriRing blandRing`.
- `vri spegl skaler flytt sentrer saman`, `dreiRing sylinder skive boks prisme`, `lesNett skrivStl skrivGlb`, `forgeStl` (needs `FORGECAD`).
- A hole or cavity must be part of one connected surface (`skal`, `loft`, `skive` are). Subtraction and closed inner shells are filled silently.

## 4. `plan.ts` — planes in mm (`k` = the registered body)

| constructor | gives |
|---|---|
| `plan(k, id, [x,y,z], n, extra)` · `mm(k, pts)` · `sirkel(k, r)` | the general plane · outline fractions · round outline |
| `ringar(k, id0, [z…], extra?)` | horizontal sections |
| `halvribber(k, id0, N, r0, { z0, z1, r1, fase })` · `utanfraa(rings, ribs)` | radial half-planes · the order that opens ring slots at the rim |
| `radial(k, id0, N)` · `tangent(k, id0, N, r)` · `lameller(k, id0, "x"\|"y", [pos…])` | full planes through the axis · planes tangent to radius r · parallel slats |
| `radialplate(k, id, deg, [[r,z]…])` · `golv` · `vegg` · `rundskive(k, id, z, r, hole)` | drawn plates |
| `skjerm(k, id, R, deg, z0, z1, mid)` · `renne` | bent sheets |
| `rundt(k, "hol"\|"gods", d, x, y)` · `rektStrek` · `ellipse` | strokes in `extra.strek`, ≤ 24 per plane |

2D frame: `n = (0,0,1)` → u = X, v = Y; a vertical plane → v = Z.

## 5. Traps

- **A drawn plate that stops near another plate becomes a tenon and is cut off there**, with every hard rule green. It needs its own material ≥ t/2 + max(10, 2t) (12 mm at t 4) past the mid-plane of every plate it crosses. Keep rings ≥ 14 mm from where a rib's material stops, or use mesh planes (`radial`, `lameller`, the spec's `gitter`), which never get tenons.
- **A slot opens through whatever lies past its mouth**: a ring filled with a `gods` stroke and crossed by slats whose slots open inward gets slit (krav `spalte`). Fill only a bridge between the slats.
- A `gods` stroke that does not reach the ring is an island and is thrown away, its hole stays (`holKrav` fails: `ligg i eit anna hol`).
- A plane within a few mm of a cavity wall gives `klem`: keep 5 mm inside the cavity or well inside the wall.
- Full planes through the axis of a closed solid: `orden`. Rings plus crossing ribs: `orden`. Use half-ribs.
- Bent planes join only floors across their axis or ribs along it, need an outline, go last.
- One `tjukn` and one material per run; a thin diffuser is `ekstra` (`flatark`, `sylinderark` in `ekstra.ts`: drawn, written as `ekstra-<namn>.svg/.dxf`, no rules).
- Never `MOTOR.fiksAlt`. A part larger than the sheet room (593 × 393 on 600 × 400) is in no cut file. Pieces under 400 mm² vanish. Keep plates perpendicular.

## 6. Numbers

| what | number |
|---|---|
| slot width | (tjukn + klaring) / sin θ; the file is narrower by `snitt` (4.10 → 3.90 at t 4) |
| joint cut when | common run ≥ max(2, t) and w + 4 mm of plate across the slot, else `klem` |
| gods | ≥ max(2, t) at the slot bottom → shell wall ≥ 8 mm at t 4 |
| tenon | meeting ≥ max(6, 3t); wedges only at t ≥ 6 (`kilar: 1`) |
| body | longest side 40–600 mm; ≤ 40 000 triangles; ≤ 64 planes; outline ≤ 48 points |
| bend | R ≥ storleik / 4; solid down to 150·t birch, 100·t finer, 200·t mdf, 230·t acrylic |

| bag | material | tjukn | klaring | snitt |
|---|---|---|---|---|
| birch ply | `bjork` | 3 | 0.10 | 0.15 |
| poplar ply | `finer` | 4 | 0.10 | 0.20 |
| acrylic | `akryl` | 3 | 0.15 | 0.20 |
| cardboard | `papp` | 2 | 0.05 | 0.30 |

`tjukn` is the caliper reading. Cut `produksjon/passprove.svg` first and set `klaring` to the slot that holds. Kerf values are guesses until then.

## 7. Limits

Outlines are polylines (no arcs). Nothing checks that a part can travel to its seat beyond the engine's joint directions. A mixed-thickness design cannot get matching slots in one run. The `fin/` files were read back but never cut on a machine.
