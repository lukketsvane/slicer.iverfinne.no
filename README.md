# slicerman

Turn a 3D mesh into flat parts you can cut on a laser — parts that hold
themselves together with no glue and no screws.

Drop in a file. Set how big you want it. Press **find settings**. Download the
sheets.

**[slicer.iverfinne.no](https://slicer.iverfinne.no)** — runs in the browser,
nothing to install, no account, no licence key. Your mesh never leaves the
machine it was dropped on.

> The interface is in Norwegian (nynorsk). The code and this README are not.

## What it does

One construction type: **waffle** — interlocking ribs in two directions. X-ribs
get slots opening upward, Y-ribs slots opening downward, so you lay the X family
on the bench and lower the Y family into it. That is the whole assembly.

It opens on **3 mm MDF on a 600 × 400 mm bed** — the common "6040" CO2
laser, the smallest bed anyone calls a workshop machine. Change the thickness
to the sheet in your hand and the bed to your machine; the link carries both.

**It is a laser tool.** No cutter diameter and no dogbones, because a beam has
no radius.

## Use it

1. **Drop a file** — `.glb`, `.gltf`, `.stl`, `.obj`, `.ply`, or a `.zip` saved
   by **LAGRE**. Up to 220 MB. Or start from the built-in cube.
2. **Set the size.** Pinch the object, or drag the number.
3. **Press find settings.** It slices a dozen rib grids for real, ranks them and
   sets the best. Press again for the next. **Hold** it for the deep search.
4. **Read the rules.** They say what can't be cut or assembled, and why.
5. **Export ARK** and open it in LightBurn.

Every change is undoable, by the arrow in the panel or by `Z`.

## Two surfaces

**On a phone**, a sheet at the bottom with three heights: one line, the middle
of the job, everything. **Over 1180 px with a mouse**, no sheet — two fixed
walls with the object between them: what you put in on the left, what comes out
on the right. The camera frames the object into whatever rectangle is left over.

**Two fingers on the object**: spread to size, twist to turn, drag to change the
rib counts. Three fingers move the light, double-tap reframes, one finger
orbits.

**The contour view is a drawing, so it is a canvas**: one finger drags it,
pinch zooms, nothing turns. The parameter gestures are off there — changing the
drawing while you are navigating it is not what two fingers are for on a flat
page — and double-tap still takes you home.

Keys: `F` find settings, `⇧F` back, `D` deep search, `1` `2` `3` views, `←` `→`
nudge the rib you point at, `Z` undo, `L` cut list, `A` sheets, `S` stack, `O`
control sheet, `Esc` close.

**Three ways to keep an afternoon's work.** The link carries every setting and
no mesh. **LAGRE** gives a project file carrying both — drop it back in and you
are where you left off. And the browser remembers by itself, in IndexedDB.

## Four tools

A drawer, one tool at a time, as tall as its contents and no taller — a list of
three rows is three rows and the object keeps the rest. On the bench it sits in
the lower half so you read a list *while* looking at what it points at. On a
phone the closed control line stays visible below it, so you move a rib and
watch the counts answer. The stack has its own icon in the sheet's footer; the
other three are a word away in the drawer's title bar.

- **Cut list** — every part with its engraved address, size, joints and sheet,
  plus shape id, area and cut length where there is room for them. Click a rib
  in the object and the list opens on that line. A part with no joints is red.
  Once anything is locked it shows **yours** first — the ribs you locked,
  copied or moved — with a chip reading `mine 6 av 20`, because while you are
  building it is those six you are working on, not the twenty.
- **Sheets** — one at a time, large enough to read the addresses. Not a picture
  of the file; it *is* the file, engraved addresses included: zoom in and each
  part carries the same strokes the laser will burn, in the same place. **Drag a part** and it stays where you drop
  it; the rest repacks around it. **Hold a part** to pin or release it, to
  turn it a quarter at a time about its centre, or to send it to the next or
  previous sheet — the drawer follows it. **Tap a part** to select it, in the
  sheet or in the model; the sheet turns to the plate that part is on, and
  tapping empty sheet or empty canvas deselects. With a
  part selected, **two fingers** slide it by the millimetre — zoom in and the
  same motion is a smaller step — and twist to turn it, snapping to a quarter
  when you let go. A moving part **snaps** to its neighbours' edges, at exactly
  the gap, and to the sheet edge, within a fingertip; zoom in to snap finer.
  **Pinch** to zoom the sheet, selection or not, drag
  empty sheet to pan, double-tap for the whole sheet. Pinned parts are shaded. Two
  pinned parts you have put inside each other are drawn red, and the sheet
  rule says no until you move one.
- **Stack** — every rib on both axes: where it stands in mm, whether it is
  fixed, what it became. See below.
- **Settings, as text** — select, copy, paste back.

## Find settings

It takes your mesh at your size on your sheet, slices about a dozen rib grids
**for real** — ribs, joints, parts, nesting, every hard rule — and ranks what
came out: does it hold together, how many parts, how many sheets, utilisation,
room between ribs. A broken hard rule is not a deduction, it is a no.

**Hold the button** (or press `D`) and it asks a different question: what does
*this shape* need, for the fewest parts? It reads every rib count from 2×2 to
32×32 — about a thousand grids — then slices the front of them for real: the
best few grids at every part count, one or two hundred of them, each nested and
checked against the hard rules. It takes the time it takes; the ring around the
button shows how far it is, and tapping the button again stops it and keeps the
best found so far. On a device with cores to spare the slicing is shared across
a few extra workers; the ring counts the same grids, it just fills faster.

It affords a thousand by **measuring the body once**: one ray per column of a
128×128 raster gives volume and the cross-section profiles A(x) and A(y) in one
sweep, for less than one slicing. A rib is a *sample* of A; the waffle's claim
is the step function holding that sample to the next cell; the area between
claim and truth is the part of your shape that is not there. That is the `form`
column.

It behaves like a measurement, not a guess. A cube scores 100 % at *every* rib
count — its profile is constant. A standing torus scores differently along x
than y, so the deep search picks lopsided grids there. And on a body with legs
it is **not monotonic**: three ribs can score worse than two, because the third
plane landed between the legs.

What comes back is a front, not a point: for each number of parts, the grid that
carries the most shape. The first answer is the knee, where more parts stop
paying for themselves; press again to walk along the front. The list rules off
where the front ends — below it are grids something else beats on every count
you asked about — and on a phone that answer says `slegen` instead.

## Building by hand

`6` means six evenly spaced planes. It does not mean *these* six.

**A lock is a fraction of the span.** Ribs are a list, not a count: locked ones
hold their exact fraction and the free ones distribute around them, so the
slider keeps meaning something — drag it from six to ten with four locked and
four new planes appear *between* them. A fraction and not a millimetre, so
resizing keeps a rib where it is **on the body**. The stack shows millimetres
anyway, from the near edge, because nobody builds in fractions.

**Every edit locks the whole stack first.** A free rib has no position of its
own — it is "the fourth of six evenly spaced" — so moving one without writing
the stack down first moves a rib you never touched. Neighbours bound the move:
two planes closer than one plate thickness are two plates inside each other.

Once anything is locked the rib slider says how many (`4 låste`), because a lock
beats the count. A **new mesh clears the locks and the pins** — both are answers
about the body you had. A project file is different: there the mesh and the
settings were saved together.

## Output

| | |
|---|---|
| **STL** | the assembled stack |
| **DXF** | R12 ASCII, mm, layers `KUTT` and `GRAVER`, kerf-compensated, all sheets in one drawing |
| **SVG** | every rib profile side by side, 1:1 |
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
| `ribbX/Y` | rib counts | 2–32 each way |
| `lause` | pieces with no joint | keep / drop |
| `tjukn` | thickness | 1–25 mm |
| `klaring` | press fit | 0–0.6 mm, slot wider than the plate |
| `ledd` | joint split | 0.2–0.8 |
| `snitt` `snittveg` | kerf | 0–6 mm, taken in the file or in the machine |
| `fart` | cut speed | for the time estimate only |
| `arkB/H` | sheet | up to 3000 × 2000 mm |

Materials: plywood, MDF, acrylic, cardboard — density and surface.

## Rules

The tool cuts anything, but it says what it cut. **Hard** means the parts can't
be made or assembled; **soft** is a choice worth knowing about. Ribs interlock ·
parts exist · every part hangs in a joint · material remains at the joint ·
parts fit the sheet · press fit · kerf · slot survives the kerf · finger room ·
mesh closed · resolution kept · utilisation.

A broken rule carries its own way out: the rule that knows fifteen parts are too
big also knows *how much*, so it offers `prøv 290 mm` and sets it.

## How it works

```
GLB / glTF / STL / OBJ / PLY
  ├── weld        loose triangles become vertices with neighbours
  ├── unflip      an inside-out mesh is turned right side out
  ├── simplify    vertex clustering down to the triangle budget
  ├── smooth      Taubin low-pass — volume stays, noise goes
  ├── place       rotate, scale, centre, set on the floor
  ├── rays        which points are inside the solid?
  ├── ribs        plane sections, with slots where they cross
  ├── nest        parts packed by outline, holes counted as free space
  └── STL · DXF · SVG · ARK
```

**A mesh is a shell, not a solid.** Rays make it one: count which way each
triangle faces, sum rather than parity, because scans have overlapping shells
and parity reads the overlap as a hole.

**Slots are cut in the field, not in the polygon** — the only way the cut file
and the 3D view cannot drift apart.

**Nesting follows the outline, not the bounding box** — raster-based, no genetic
pass, because the sheet count has to keep up with a slider.

**Addresses are engraved as strokes, not text.** A `TEXT` entity is a question
about fonts, and the answer is often no.

## Develop

```bash
pnpm install
pnpm dev
pnpm build      # forces webpack, then checks the worker actually bundled
```

Next.js + React Three Fiber. All geometry runs in a Web Worker; the main thread
only draws.

> Do not build with Turbopack. It ships `new Worker(new URL(…))` as raw
> TypeScript in `static/media`, the worker dies silently, and the page just
> sits there. `pnpm build` forces webpack and fails if it happens anyway.

Every number the tool prints is read off the geometry. So is every check:

```bash
pnpm sjekk   # tsc --noEmit
pnpm probe   # engine without a browser: parts, joints, cut length, files
pnpm rekkje  # reads the cut files back: engrave, inner cuts, outline, in order
pnpm vrient  # meshes that aren't meshes, sliders at both ends, a hostile URL
pnpm ledd    # every joint the panel counted, found again in the cut profiles
pnpm raad    # breaks each rule, presses the fix it offers, checks it worked
pnpm glb     # writes GLB files with known geometry and reads them back
pnpm pakk    # redraws every sheet and counts cells — catches overlaps
pnpm hand    # locked ribs: moving one leaves the others where they are
pnpm enkel   # the two simplification sliders take what they say and no more
pnpm djup    # the deep search: the profile measures shape, the answers are real
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
| `lib/soup.ts` | mesh in two forms, and the road between them |
| `lib/io/` | GLB, glTF, STL, OBJ, PLY readers |
| `lib/mesh/solid.ts` | the rays — a mesh you can ask questions of |
| `lib/mesh/simplify.ts` `smooth.ts` | vertex clustering, Taubin |
| `lib/contour.ts` | marching squares |
| `lib/pack.ts` | nesting |
| `lib/stroke.ts` | single-stroke font |
| `lib/zip.ts` | ZIP, both ways |
| `lib/lagring.ts` | what the browser remembers between visits |
| `lib/vaffel/` | body, ribs, joints, parts, metrics, rules, exports |
| `lib/vaffel/profil.ts` | the body measured once, and how much of a shape a set of rib planes carries |
| `lib/worker.ts` | the engine in its own thread |
| `components/verkty.tsx` | the four tools in the drawer |

The reasoning behind each decision lives in the file it belongs to. The comments
are the documentation.

## Limits

- Draco- and meshopt-compressed GLB cannot be read. Re-export without.
- A `.gltf` pointing at a separate `.bin` cannot reach it from a browser. Use
  `.glb`.
- A globally inverted mesh is fixed automatically; *inconsistently* wound
  triangles are a real defect and need repairing elsewhere.
- Nesting is deterministic: bottom-left-fill with four rotations, then up to
  three more passes (lowest-top placement, lightly perturbed order) within a
  fixed work budget, keeping the best. Fewer sheets would need a real search.
- Kerf compensation offsets along the angle bisector; tighter corners than the
  kerf are approximate, erring safe.
- One construction type so far. `lib/core.ts` is written so a second costs a
  folder and a line.

## Credit

Scene, gestures, panel and shareable URL come from
[50x50x50.iverfinne.no](https://50x50x50.iverfinne.no).

## Licence

MIT — see [LICENSE](LICENSE).
