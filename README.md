# slicerman

Turn a 3D mesh into flat parts you can cut on a laser — parts that hold
themselves together with no glue and no screws — by sketching the cuts
yourself, on a phone, with the object in front of you.

Drop in a file. Set how big you want it. Turn the object, place a cutting
plane where you are looking, press **lås**. Repeat. Download the sheets.

**[slicer.iverfinne.no](https://slicer.iverfinne.no)** — runs in the browser,
nothing to install, no account, no licence key. Your mesh never leaves the
machine it was dropped on.

> The interface is in Norwegian (nynorsk). The code and this README are not.

## What it does

Every part is a **plane cut through the body**, with slots where it crosses
other planes. Any two planes that cross in material lock together: one gets
its slot from one end of the shared line, the other from the other end, and the
part that comes later in the list slides onto the ones that are already there.
A grid of ribs is one thing you can build this way; a set of planes at angles
no grid could describe is another. The tool does not care which.

It opens on **3 mm MDF on a 600 × 400 mm bed** — the common "6040" CO2
laser — with a cube and six planes each way already locked, so you can see
the whole idea before you drop anything in. Change the thickness to the sheet
in your hand and the bed to your machine; the link carries both.

**It is a laser tool.** No cutter diameter and no dogbones, because a beam has
no radius.

## Use it

1. **Drop a file** — `.glb`, `.gltf`, `.stl`, `.obj`, `.ply`, or a `.zip` saved
   by **LAGRE**. Up to 220 MB. Or start from the built-in cube. A new mesh
   clears the planes: they were an answer about the body you had.
2. **Set the size.** Drag the number, or take it from the sheet.
3. **Sketch a plane.** One finger turns the object. The sketch plane is a line
   across the screen — a knife seen edge-on — with a grab handle in the middle
   and a rotation handle at the end: drag the one to move the cut across the
   object, the other to tilt it. **Two fingers on the object** work as they
   always did: spread to size, twist to turn, drag to move the cut. Switch on
   **skisse** (or press `S`) and the same two fingers work on the plane
   instead: drag moves it, twist tilts it, pinch zooms. Three fingers move the
   light; double-tap reframes. The plane swings with the view and nothing is
   built from it.
4. **Press lås.** The sketch becomes a part: it gets a name, a profile, slots
   against every plane it crosses, a place in the assembly and a row in the
   list. Turn the object and lock again. The locked planes stay where you put
   them while the view turns.
5. **Or take a proposal.** **forslag** slices a dozen rib grids for real and
   ranks them; take one whole, or as a start. Hold it for the deep search.
6. **Read the rules.** They say what can't be cut or assembled, and why, and
   each broken rule carries the button that fixes it.
7. **Export ARK** and open it in LightBurn.

Every change is undoable and redoable: the two arrows at the top, or `Z` and
`⇧Z`.

## Two surfaces

The iPhone 16e is the target device: one thumb, a 390-point screen, the object
visible while you work. A slim bar at the top carries the file you dropped in
(tap it to pick another), the three views, undo and the link. A sheet at the
bottom has three heights: one line (lock, the live count, proposals, export),
the middle (size, the plane list, the broken rules with their fixes),
everything (material and thickness, the sliders, the table, the tools).

**Over 1180 px with a mouse**, no sheet — the same controls as one column on
the right, the top bar above the canvas, and the camera frames the object into
whatever rectangle is left over.

**With a part selected** (tap it in the object), the handles and the two-finger
drag edit *that* plane instead of the sketch: move it along its normal, re-angle
it. Tap empty space to deselect; the row's `slett` removes the plane.

**The contour view is a drawing, so it is a canvas**: one finger drags it,
pinch zooms, nothing turns, and double-tap takes you home.

Keys: `L` lock, `S` sketch mode, `⌫` remove the selected plane, `F` proposals,
`D` deep search, `Z` undo, `⇧Z` redo, `1` `2` `3` views, `Esc` close.

**Three ways to keep an afternoon's work.** The link carries every setting —
planes included — and no mesh. **LAGRE** gives a project file carrying both.
And the browser remembers by itself, in IndexedDB. The unlocked sketch is
disposable and is not kept; it costs one gesture to make again.

## Planes

A plane is a **name, a point and a normal**, in the body's own space. The
point is stored as fractions of the box around the body, so resizing keeps a
plane where it is *on the body*. The normal is a unit vector — two angles would
have a pole. The whole list is one string in the parameter bag, so undo, the
link, the project file and the browser's memory all carry it with no extra
code, and a hostile link cannot push anything but a valid plane into the
geometry.

**Names belong to the part, not to its position.** A plane is numbered when it
is locked and the number is never reused, so `7` stays `7` while it is nudged,
re-angled and redrawn, and the `7` engraved on a plate in a pile matches the
row on the screen. A plane cut into several islands gets letters: `7a`, `7b`.

**Every kept plane is editable, down to its outline.** Nudge and re-angle with
two fingers. The outline itself takes hand-drawn strokes — a rectangle or a
round, adding material (`+`) or cutting it away (`-`) — written into the plane
in the settings text; they are cut in the same field as the slots, so a hole
you drew and a slot the engine cut never disagree. When the model changes
underneath a stroke, **the stroke stays**: it is what you did, and the tool
does not throw work away unasked. It may drift out of true, and then you see
it in the profile and remove it yourself.

**Up to 64 planes.** Beyond that a link is trying something.

## Assembly

The list order is the assembly order. A part slides in along its slots, and a
plate can only go one way: when a part comes in, every part it crosses that is
already placed must meet it along parallel lines. Its slots open in the
direction of travel; theirs open toward it. Downward is preferred where the
line has a vertical component. This is exactly what the rib grid always did —
X family slots up, Y family lowered onto it — and it holds for every set where
each part has one way in.

Where it does not hold, the hard rule **kan monterast** names the part, and if
reordering the list would fix it, the button does that. Three planes that
cross each other in material without sharing a common line cannot be assembled
in any order; then it is the plane, not the list, that has to change.
`montering.txt` in the ALT bundle writes the order out, part by part, with the
direction each comes in.

## Proposals

**forslag** takes your mesh at your size on your sheet, slices about a dozen
rib grids **for real** — planes, joints, parts, nesting, every hard rule — and
ranks what came out: does it hold together, how many parts, how many sheets,
utilisation. A broken hard rule is not a deduction, it is a no.

**Hold the button** (or press `D`) and it asks a different question: what does
*this shape* need, for the fewest parts? It reads every rib count from 2×2 to
32×32 by **measuring the body once** — one ray per column of a 128×128 raster
gives volume and the cross-section profiles A(x) and A(y) in one sweep — then
slices the front of them for real. A rib is a *sample* of A; the grid's claim
is the step function holding that sample to the next cell; the area between
claim and truth is the part of your shape that is not there. That is the
`form` column. What comes back is a front, not a point: for each number of
parts, the grid that carries the most shape. The first answer is the knee;
press again to walk along the front. Take a proposal whole, or as a start.

## Output

| | |
|---|---|
| **STL** | the assembled stack |
| **DXF** | R12 ASCII, mm, layers `KUTT` and `GRAVER`, kerf-compensated, all sheets in one drawing |
| **SVG** | every profile side by side, 1:1 |
| **ARK** | one file per nested sheet, 1:1 — zipped when there is more than one |
| **PNG** | the same sheets as pictures, for messages and the wall — not for the machine |
| **PRØVE** | fit-test coupon: seven slots, each 0.05 mm wider than the last |
| **ALT** | the whole job in one download, plus the cut list as CSV and the assembly order as text |
| **LAGRE** | a project file — settings and mesh together |

In the SVG files **colour is the operation, and the colour carries the order**:
`#000000` engrave, `#0000FF` cut. Those are LightBurn's C00 and C01, and
LightBurn runs layers in list order, so **black runs first** — engraving has to
happen while the part is still held by the sheet. Two colours and no more;
nothing is filled. Which sheet a file is comes from its name.

The sheet view in the drawer is not a picture of the file; it *is* the file,
engraved names included. Drag a part and it stays where you drop it; the rest
repacks around it. Hold a part to pin or release it, turn it a quarter, or send
it to the next sheet.

**Cut the fit-test coupon first.** `klaring` and `snitt` are two guesses that
multiply in every joint.

## Parameters

| | | |
|---|---|---|
| `storleik` | size | longest side, 40–1200 mm |
| `rotX/Y/Z` | rotation | ±180° |
| `glatt` | smoothing | 0–24 Taubin passes |
| `trekant` | triangle budget | 0.5–60 k, by vertex clustering |
| `forenkl` `hol` | cut profile | how far the cut may stray, and the smallest hole worth cutting |
| `plan` | the planes | name, point, normal and strokes, as a string |
| `lause` | pieces with no joint | keep / drop |
| `tjukn` | thickness | 1–25 mm |
| `klaring` | press fit | 0–0.6 mm, slot wider than the plate |
| `ledd` | joint split | 0.2–0.8 |
| `snitt` `snittveg` | kerf | 0–6 mm, taken in the file or in the machine |
| `fart` | cut speed | for the time estimate only |
| `arkB/H` | sheet | up to 3000 × 2000 mm |
| `fest` | pinned parts | where a part stands on the sheet, when the hand said so |

Materials: plywood, MDF, acrylic, cardboard — density and surface.

## Rules

The tool cuts anything, but it says what it cut. **Hard** means the parts can't
be made or assembled; **soft** is a choice worth knowing about. Planes grip ·
parts exist · one way in for each part · every part hangs in a joint ·
material remains at the joint · parts fit the sheet · press fit · kerf · slot
survives the kerf · room between planes · mesh closed · resolution kept ·
utilisation.

A broken rule carries its own way out: the rule that knows fifteen parts are too
big also knows *how much*, so it offers `prøv 290 mm` and sets it. The rule
that finds no joints offers a grid to start from.

## How it works

```
GLB / glTF / STL / OBJ / PLY
  ├── weld        loose triangles become vertices with neighbours
  ├── unflip      an inside-out mesh is turned right side out
  ├── simplify    vertex clustering down to the triangle budget
  ├── smooth      Taubin low-pass — volume stays, noise goes
  ├── place       rotate, scale, centre, set on the floor
  ├── rays        which points are inside the solid?
  ├── planes      for each plane: turn the body so the plane is an axis,
  │               one ray per row and column, a signed field, marching squares
  ├── joints      where two planes share a line through material — slots cut
  │               in the field, oriented, widened by the angle between the planes
  ├── nest        parts packed by outline, holes counted as free space
  └── STL · DXF · SVG · ARK
```

**A mesh is a shell, not a solid.** Rays make it one: count which way each
triangle faces, sum rather than parity, because scans have overlapping shells
and parity reads the overlap as a hole.

**An oblique plane has no axis to shoot along, so the body is turned** — a
right-handed rotation of the vertex soup per plane orientation, cached — and
the plane becomes an ordinary section with exact edge distances along every
grid line. A grid has two orientations; a set of hand-placed planes has as many
as you locked.

**Slots are cut in the field, not in the polygon** — the only way the cut file
and the 3D view cannot drift apart. Hand-drawn strokes go into the same field,
before the slots.

**Nesting follows the outline, not the bounding box** — raster-based, no genetic
pass, because the sheet count has to keep up with a gesture.

**Addresses are engraved as strokes, not text.** A `TEXT` entity is a question
about fonts, and the answer is often no.

## Develop

```bash
pnpm install
pnpm dev
pnpm build      # forces webpack, then checks the worker actually bundled
```

Next.js + React Three Fiber. All geometry runs in a Web Worker; the main thread
only draws — and computes the sketch plane, because that is the input.

> Do not build with Turbopack. It ships `new Worker(new URL(…))` as raw
> TypeScript in `static/media`, the worker dies silently, and the page just
> sits there. `pnpm build` forces webpack and fails if it happens anyway.

Every number the tool prints is read off the geometry. So is every check:

```bash
pnpm sjekk   # tsc --noEmit
pnpm probe   # engine without a browser: parts, joints, cut length, files
pnpm rekkje  # reads the cut files back: engrave, inner cuts, outline, in order
pnpm vrient  # meshes that aren't meshes, hostile plane strings, a hostile URL
pnpm ledd    # every joint the panel counted, found again in the cut profiles — grids and oblique planes
pnpm raad    # breaks each rule, presses the fix it offers, checks it worked
pnpm glb     # writes GLB files with known geometry and reads them back
pnpm pakk    # redraws every sheet and counts cells — catches overlaps
pnpm hand    # the plane list as a string: one edit leaves the rest, names never reused, pins hold
pnpm enkel   # the two simplification sliders take what they say and no more
pnpm djup    # the proposals: the profile measures shape, the answers are real
pnpm tung    # a million triangles in, and how long that takes
pnpm ark     # cut sheets as images
pnpm look    # screenshots of the page, and any console errors
pnpm panel   # the controls in a real browser: both surfaces, gestures, keys
```

`probe` through `djup` are headless and fast. Point `look` and `panel` at
`next start` on port 3210, never the dev server — they drive a real browser for
minutes, and HMR reloading underneath produces failures that look real.

| | |
|---|---|
| `lib/core.ts` | **start here.** The contract: parameters, metrics, rules, views |
| `lib/plan.ts` | what a plane is: name, point, normal, strokes; the string; the grid as a proposal |
| `lib/params.ts` | the parameter space and its defaults |
| `lib/kropp.ts` | the body: weld, unflip, simplify, smooth, place — and turned along any normal |
| `lib/snitt.ts` | planes to ribs: the field, the joints, the slots, the parts, the assembly order |
| `lib/bygg.ts` | the whole build once: body, ribs, parts, nesting |
| `lib/soup.ts` | mesh in two forms, and the road between them |
| `lib/io/` | GLB, glTF, STL, OBJ, PLY readers |
| `lib/mesh/solid.ts` | the rays — a mesh you can ask questions of |
| `lib/mesh/simplify.ts` `smooth.ts` | vertex clustering, Taubin |
| `lib/contour.ts` | marching squares |
| `lib/pack.ts` `nest.ts` | nesting |
| `lib/metrics.ts` `rules.ts` | what is measured, and what is judged |
| `lib/export-*.ts` `stroke.ts` `zip.ts` | the files, the single-stroke font, ZIP both ways |
| `lib/forslag.ts` `profil.ts` | the proposals: the body measured once, the front of grids |
| `lib/motor.ts` | the engine as one object |
| `lib/worker.ts` | the engine in its own thread |
| `lib/lagring.ts` | what the browser remembers between visits |
| `components/` | the studio: scene, sketch plane, gestures, sheet, tools |

The reasoning behind each decision lives in the file it belongs to. The comments
are the documentation. `REBUILD.md` is the brief this version was built to.

## Limits

- Draco- and meshopt-compressed GLB cannot be read. Re-export without.
- A `.gltf` pointing at a separate `.bin` cannot reach it from a browser. Use
  `.glb`.
- A globally inverted mesh is fixed automatically; *inconsistently* wound
  triangles are a real defect and need repairing elsewhere.
- Two planes closer than five degrees to parallel do not get a joint: the slot
  would be twelve plates wide.
- Three planes that cross in material without sharing a line cannot be
  assembled in any order. The rule says which one.
- Nesting is deterministic: bottom-left-fill with four rotations, then up to
  three more passes within a fixed work budget, keeping the best. Fewer sheets
  would need a real search.
- Kerf compensation offsets along the angle bisector; tighter corners than the
  kerf are approximate, erring safe.
- Hand-drawn strokes are edited as text for now; the gesture editor for them is
  the next thing to build.

## Credit

Scene, gestures, panel and shareable URL come from
[50x50x50.iverfinne.no](https://50x50x50.iverfinne.no).

## Licence

MIT — see [LICENSE](LICENSE).
