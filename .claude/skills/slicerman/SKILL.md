---
name: slicerman
description: Design a lamp, stool, shelf or any object in slicerman (slicer.iverfinne.no) headless — cut a built-in skulptur/stolform/sau/dyr form or your own STL/GLB into interlocking slotted plates and get laser cut files, a project zip and a one-line verdict from one JSON spec and one command.
---

# slicerman for agents: one spec in, one line out

Run everything from the repo root. Never read `README.md` (118 KB), `REBUILD.md`, `PLAN.md` or `lib/` to design: this file is all you need. Depth only when stuck: `scripts/lampe/LES.md`.

## 1. The command

```
pnpm -s lampe <spek.json> [--auto] [--full] [--bilete] [--ut <mappe>] [--feil]
pnpm -s lampe --former
```

| flag | does | time |
|---|---|---|
| none | engine + rules at 220 cells, one line per mode | 2–8 s |
| `--auto` | applies the fixes round by round (≤ 6); writes `<spek>.auto.json` next to the spec **only** when every mode ends `ALT OK` | ×1–3 |
| `--full` | + production files and the 1200-cell check `fin` (**always before cutting**) | +5–10 s |
| `--bilete` | + `ark.png` per mode (contact sheet) | +15 s per mode |
| `--former` | one line per built-in form: B×D×H at H = 1, fill, section profile 0.1..0.9 H (digits 0–9), narrowest and widest height | 2 s |
| `--feil` | stack trace instead of the one `FEIL` line | |

Exit 0 = every mode `ALT OK`, 1 = something `BROT`, 2 = `FEIL` (bad spec, unknown flag, missing file) or `--bilete` made no picture. Output: `<spek dir>/ut/<namn>/<modus>/` (single mode: `<modus>` = `<namn>`).

The spec (JSON; unknown fields and wrong types are refused with one `FEIL` line):

| field | meaning | default |
|---|---|---|
| `form` | `skulptur-01..12`, `stolform-01..10`, `sau-01..04`, `dyr-01..05`, `kube`, or a path (relative to the spec) to `.stl/.glb/.obj/.ply` | required |
| `mm` / `hogd` | longest side / height in mm of the **unturned** body (40–600 longest side); each mode line shows its own turned box | `mm` 200 |
| `drei` | `[x,y,z]` degrees, turns the raw form before scaling | `[0,0,0]` |
| `gitter.tal`, `.avstand` | plates in family 1 (integer), spacing mm (≥ 3 × `tjukn`) | as many as fit the body, 30 |
| `gitter.tal2`, `.avstand2` | family 2 (ids 21.., or 101.. when `tal` > 20) | = family 1 |
| `gitter.vinkel` | family angle about the axis: 45 = diamond, 0 = ribs + spines | 45 |
| `gitter.akse` | `"z"` (vertical plates), `"x"`, `"y"` or `[x,y,z]` | `"z"` |
| `gitter.fase` | absolute mm shift of the families, number or `[a,b]` | 0.1 |
| `gitter.fjern` | plate ids to drop (family 1 = 1..tal, family 2 = 21..) | `[]` |
| `hol` | `[{kule:[x,y,z], r}]`, r > 0: a spherical cavity as a round hole in every plate it meets | |
| `tjukn`, `material` | sheet mm 1–25; `graa bjork finer mdf akryl papp` | 3, `mdf` |
| `ark` | sheet `[B,H]` mm (your laser bed) | `[600,400]` |
| `farge`, `opal` | picture only: plate colour; ids drawn as opal acrylic | |
| `lys`, `utstyr`, `vegg`, `golv` | picture only: light points `[[x,y,z]]`; hardware `{slag: paere/sokkel/leidning/sylinder/boks/kule, senter, diameter, lengd, retning, punkt, storleik, matrise, farge, metall}`; wall at y; floor z | |
| `modus` | `{namn: {snu, drei, vipp, lys, utstyr, vegg, golv}}`: the same lamp turned. `snu` = upside down, `drei` = deg about z, `vipp` = deg about x | one mode |

Coordinates (`hol`, `lys`, `utstyr`) are mm in the unturned body: centred on x = y = 0, standing on z = 0. Each mode turns body, plates, holes, hardware (matrices too) and stands the result on z = 0 again. `klaring` 0.1 and `snitt` 0.2 are fixed.

Forms: run `--former` once instead of guessing where the neck or the bulk is. Slender ones (`skulptur-01` figure with a thin neck, `skulptur-09` shell on a narrow foot) need `hogd` ≥ 260 at 3 mm sheet, or almost every pair is `klem`.

## 2. Read the lines, then fix

```
arbeid  BROT klem 2–21, 2–23, 3–29 · tomme plan 9 · 263×301×134 mm
kveld   BROT klem 2–21, 4–26 · tomme plan 9 · 263×301×134 mm
→ prøv: gitter {"fjern":[2,9,21,26,29]}  (eller --auto)
arbeid  ALT OK  15 delar · 41 ledd · 2 ark · 0,46 kg · 263×296×134 mm · står 47 mm · skjerm 79 %
auto: OK etter 1 runde · gitter {"fjern":[2,9,21,26,29]} → sopp.auto.json · køyr --full før skjering
```

`→ prøv:` is one line for all modes: merge its JSON into `gitter` (values are absolute, `fase` already wrapped to the spacing), or rerun with `--auto`. Open `ut/<namn>/<modus>/rapport.txt` only if the lines are not enough, and only `head -12` (box, `tal`, hard rules); every `why` is at the end under `kvifor`.

| broken | means | fix (the `→ prøv:` line does it) |
|---|---|---|
| `klem a–b` | two plates cross where the body is thin (rim, neck): no room for a slot | `fjern` the outer id of the pair; or `mm`/`hogd` up, `tjukn` down, `tal`−1, larger `avstand` |
| `gods X mm [ids]` | less than max(2, tjukn) mm beside a slot (absolute mm) | same as klem |
| `lause plan ids` | a piece from those plates crosses no other plate | `fase` = half the spacing; when already shifted, `fjern` the plate |
| `tomme plan ids` | a plate gave no part (edge plate missing the body, or on a voxel line) | edge: `fjern`; inner: `fase` +0.5 |
| `orden ids` | parts that cannot be slid in | `fjern` the outermost |
| `spalte plan ids` | a slot in that plate runs on through solid past its mouth | `fjern` the outer plate of the crossing |
| `fin plan ids` (`--full`) | the 1200-cell cut file splits a plate differently | `fjern` it; never cut before `--full` is `ALT OK` |
| `paaark` | a part is larger than the sheet | `mm` down, or `ark` larger if your laser takes it (never automatic) |
| `auto: gav opp … (ville fjerne N av M)` | the fix would leave half the plates or fewer | change the grid (`avstand`, `tal`, `vinkel` 0↔45) or `mm`/form |
| `auto: gav opp … (ingen fleire framlegg)` | nothing left to try | same |

`ALT OK` lines add two soft numbers that never break the run: `står X mm` = centre of mass inside the footprint (`VIPPAR X mm` = outside, it tips; 0 = rests on a point or edge); `skjerm X %` = share of near-horizontal rays (±30°) from `lys` that a plate stops. A louvre against glare wants many plates and a high `skjerm`: the fewest plates that pass is not a louvre. `(fin N)` after `ark` = the cut files need N sheets.

`åtvaring: lys … ligg i gods utan hol` = a light inside solid without a cavity: add `hol` around it.

Two families of plain mesh plates (this spec) never get tenons. Drawn outlines (half-ribs, rings, discs) do, and on a solid body they are clipped away silently: that needs a TS concept, see LES.md §7.

## 3. Recipes (all ran `ALT OK`)

Louvre lamp from a sculpture, two modes (`scripts/lampe/eksempel/sopp.json`):
```json
{"namn":"sopp","form":"skulptur-04","mm":300,
 "gitter":{"vinkel":45,"avstand":30,"tal":9,"fjern":[2,7,9,21,26,27,29]},
 "hol":[{"kule":[0,0,50],"r":32}],"farge":"#3f4b42","lys":[[0,0,50]],
 "modus":{"arbeid":{},"kveld":{"snu":true}}}
```
Start without `fjern`; `--auto` found `[2,9,21,26,29]`, `--full --auto` added 7 and 27.

Slender sculpture lamp: `{"form":"skulptur-01","hogd":260,"gitter":{"vinkel":0,"avstand":32,"tal":4,"fjern":[1,3,24]},"hol":[{"kule":[0,0,130],"r":18}],"lys":[[0,0,130]]}`.

Cavity for an LED (`eksempel/kapsel.json`): `"hol":[{"kule":[0,0,130],"r":40}]`, `"lys":[[0,0,130]]`, `"opal":[3]`. Keep r 15–40 mm: a big cavity opens windows in every plate. Put the centre off the grid's crossing lines (e.g. `fase` = half the spacing): a plate through the centre gets the cavity open to its slot (a U-plate). No mesh booleans needed.

Flat-pack object without light (stool, 4 mm birch):
```json
{"form":"skulptur-07","mm":420,"gitter":{"vinkel":0,"avstand":45,"tal":7},"tjukn":4,"material":"bjork"}
```

Own mesh: `"form":"min.stl"`. Open or non-manifold meshes still slice: the CLI repairs, flips and decimates to 39 000 triangles. Blender is only for cropping.

## 4. Pictures

Only `ark.png` (`--bilete`), once per design, after the line says `ALT OK`. 1800×1200: helt · lys · sprengt / front · side · topp · under. Check: plates complete, light not trapped, mode turned the right way. Never a picture per iteration. A failed picture shows `· syn: …` on the line and exits 2.

## 5. Never

- read README/REBUILD/PLAN/LES.md before trying the spec; read `studio.tsx`, `scene.tsx`, `snitt.ts` whole
- write a TS concept when the spec can say it. TS only for drawn plates, hardware krav, `ekstra`, other `klaring`: `pnpm -s lampe:konsept <mappe> [--rask]` (LES.md §1)
- call `MOTOR.fiksAlt` (it rescales the body); set `rotX/Y/Z`, `glatt`, `forenkl`, `hol`, `scene` in a bag
- print `rapport.json` or a whole log; screenshot per step
- drive the GUI unless the user wants to see the app. Then: `pnpm build` and `pnpm start -p 3210` in the background (never `pnpm dev`), `pnpm kvikk "tom; …; les"` (one line out). The chrome dozes after 2 s and the first touch only wakes it: hover or move first, then click.

## 6. Outputs (`--full`, in `ut/<namn>/<modus>/`)

| file | use |
|---|---|
| `produksjon/fin/ark-N.dxf .svg` | **the files to cut** (1200 cells, kerf taken) |
| `produksjon/<id>.zip` | the project: open it in slicer.iverfinne.no (body pill → your own file) |
| `produksjon/passprove.svg` | cut first; set `klaring` to the slot that holds |
| `produksjon/montering.txt`, `deler.csv` | assembly order, cut list |
| `produksjon/samla.glb .stl .3mf .usdz`, `flat.glb`, `ark-N.dxf/.svg` | 3D and 220-cell sheets |
| `rapport.txt`, `rapport.json`, `delar.json`, `kropp.stl` | verdict, numbers, parts, the body as sliced |
| `ark.png` | contact sheet (`--bilete`) |

The `filer:` line names the output folder once (`<spekmappa>/…` when outside the working directory), then the files relative to it.

STEP (TS concept only): `pnpm -s lampe:konsept <mappe> --step` needs env `FORGECAD` and `LAMPE_PY`; without them it prints `step hoppa over` and passes.
