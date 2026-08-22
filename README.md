# slicerman

Turn a 3D mesh into flat parts you can cut on a laser — parts that hold
themselves together with no glue and no screws.

Drop in a file. Set how big you want it. Press **find settings**. Download the
sheets.

**[slicer.iverfinne.no](https://slicer.iverfinne.no)** — runs in the browser,
nothing to install, no account, no licence key.

> The interface is in Norwegian (nynorsk). The code and this README are not.

## What it does

One construction type: **waffle** — interlocking ribs in two directions.
X-ribs get slots opening upward, Y-ribs slots opening downward, so you lay the
X family on the bench and lower the Y family into it. That is the whole
assembly.

Everything is computed in your browser, in a worker thread. Your mesh never
leaves the machine it was dropped on.

## Defaults

The tool opens on **3 mm MDF on an 800 × 600 mm bed**. That is what most people
who open it are standing next to. Change the thickness to the sheet in your
hand and the bed to your machine; the link carries both.

**It is a laser tool.** There is no cutter diameter and no dogbones, because a
beam has no radius. That decision removed a slider, a hard rule and a
correction in the metrics, and it is why the panel fits on a phone.

## Use it

1. **Drop a file** anywhere on the page — `.glb`, `.gltf`, `.stl` (binary or
   ASCII), `.obj`, `.ply` (ASCII or binary). Up to 220 MB. Or start from the
   built-in cube.
2. **Set the size** — the one slider that is always on screen.
3. **Press find settings.** It slices a dozen rib grids for real and ranks
   them, then sets the best. Press again for the next best.
4. **Read the rules.** The panel tells you what can't be cut or assembled, and
   why.
5. **Export ARK** and open it in LightBurn.

**Find settings** only moves the rib counts and the joint split. Your mesh,
your size, your material thickness, your press fit, your kerf and your bed
stay exactly where you put them — a button that changes those has not answered
your question, it has replaced it.

The panel reads everything off the geometry, including **cut length and cut
time** at the speed in `fart`. That is pure beam-on time, no travel between
parts, and it is worth seeing before you press the button rather than after.

Two fingers on the canvas change the rib counts; three fingers move the light.
Double-tap reframes. The URL carries every setting except the mesh itself.

## Find settings

The button next to the panel handle. It takes your mesh at your size on your
sheet, slices about a dozen rib grids **for real** — ribs, joints, parts,
nesting, every hard rule — and ranks what came out:

- **does it hold together?** joints per part, weighted heaviest
- **how many parts?** a soft bell around twenty; six is not a grid, seventy is
  an evening with tweezers
- **how many sheets?** each one is money and another setup
- **utilisation** and **room between ribs**

A broken hard rule is not a deduction. It is a no: that candidate does not
exist. What survives comes back sorted, and each press walks one step down the
list — the first press is the best answer, the second is the second best, and
sometimes that is the one you wanted. The list is computed once and held in the
page, so only the first press costs anything (about a second, four on a
half-million-triangle scan).

## Output

| | |
|---|---|
| **STL** | the assembled stack, for rendering or 3D printing |
| **DXF** | R12 ASCII, mm, layers `KUTT` and `GRAVER`, kerf-compensated |
| **SVG** | every rib profile side by side, 1:1 |
| **ARK** | one file per nested sheet, 1:1 — zipped when there is more than one |
| **PRØVE** | fit-test coupon: seven slots, each 0.05 mm wider than the last |

In the SVG files, **colour is the operation, and the colour carries the
order**: `#000000` engrave, `#0000FF` cut.

Those are exact LightBurn palette values — black is layer C00, blue is C01 —
so the file lands on the same two layers every time. LightBurn runs layers in
the order they appear in the Cuts/Layers list, and a fresh import lists them
by number, so **whatever is black runs first**. Engraving has to happen while
the part is still held by the sheet, so engraving gets black. It reads
backwards to anyone used to black-is-cut; it is the way round that comes out
right without touching the layer order. The panel prints the legend next to
the export buttons.

Two colours and no more — a sheet outline or a header is just another layer to
remember to switch off, and one somebody eventually forgets. Which sheet a file
is comes from its **name**. Nothing is filled; a fill tells the machine to burn
the whole face. The DXF has real layers (`KUTT`, `GRAVER`), with `GRAVER`
declared first for the same reason.

`ARK` gives **one file per sheet** — a single SVG when it fits on one sheet, a
ZIP of `…-ark-1av3.svg` and friends when it does not.

**Cut the fit-test coupon first.** `klaring` and `snitt` are two guesses that
multiply in every joint; get it wrong by 0.05 mm and sixty joints either need a
hammer or fall apart, and you only find out once the whole sheet is cut. The
coupon is a 70 × 30 mm plate with seven slots, each 0.05 mm wider than the last
and engraved with its value. Cut it in the sheet you are about to use, push an
offcut of that same sheet into each slot, and set `klaring` to the one that goes
in under thumb pressure. Twenty seconds of laser time, and it settles kerf and
press fit together.

**Pieces that hang in nothing are dropped.** Slice a horse and the grid finds
an ear tip and a bit of a hoof where the body is thinner than the gap between
ribs: no rib from the other family reaches them, so they are plates that fall
out of the box. They are culled in the grid rather than in the cut list, so the
3D view and the cut file are the same object — set `lause` to *ta med* to cut
them anyway. The same pass drops anything under 4 cm², which the cut list has
always refused; until now those flakes still floated in the 3D view.

**Kerf is taken exactly once.** By default it is taken **in the file**, in both
DXF and SVG, because most people with a laser in the basement don't have a CAM
package that can set tool offset. If yours does, set `snittveg` to *i maskina*
and the files carry the nominal outline instead. Take it twice and every slot
comes out a full kerf too wide; take it nowhere and nothing grips.

**Order is part of the file.** Engraving first, then the inner cuts, then the
outline. Cut the outline first and the part is loose in the sheet while its
slots are still to be cut: it drops into the bed, tips, and what should have
been a slot becomes a stripe beside one. Most laser software reorders this
anyway; not all of it does, and software that does it does it right whether the
file was sorted or not.

## Parameters

| | | |
|---|---|---|
| `storleik` | size | longest side, 40–1200 mm |
| `rotX/Y/Z` | rotation | ±180° |
| `glatt` | smoothing | 0–24 Taubin passes — removes scanner noise without shrinking |
| `trekant` | triangle budget | 0.5–60 k, by vertex clustering |
| `ribbX/Y` | rib counts | 1–32 each way |
| `lause` | pieces with no joint | keep / drop (default drop) |
| `tjukn` | thickness | 1–25 mm (presets 2/2.5/3/4/6/9/12/18) |
| `klaring` | press fit | 0–0.6 mm — slot wider than the plate |
| `ledd` | joint split | 0.2–0.8 — where in the overlap the slot bottoms out |
| `snitt` | kerf | 0–6 mm |
| `snittveg` | who compensates | in the file / in the machine |
| `fart` | cut speed | 1–200 mm/s, for the time estimate only |
| `arkB/H` | sheet | up to 3000 × 2000 mm |

Materials: plywood, MDF, acrylic, cardboard — they set density (mass) and how
the surface is drawn.

## Rules

The tool cuts anything, but it says what it cut. **Hard** means the parts can't
be made or can't be assembled; **soft** is a choice worth knowing about.

- ribs actually interlock
- there are parts to cut
- every part hangs in at least one joint (hard while `lause` keeps them, soft
  once it drops them — the count stays in the panel either way)
- material remains at the joint after the slot has eaten half the overlap
- parts fit on the sheet you actually have
- press fit is in a workable band (soft)
- somebody takes the kerf (soft)
- ribs are far enough apart to get a finger between them (soft)
- the mesh is closed (soft)
- resolution wasn't simplified away (soft)
- sheet utilisation (soft)

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

**A mesh is a shell, not a solid.** Rays make it one: for each triangle a ray
hits, count which way it faces. The running sum is how many shells deep you are;
above zero is material. Sum, not parity — scans often have overlapping shells,
and parity reads the overlap as a hole.

**Slots are cut in the field, not in the polygon** — the only way the cut file
and the 3D view cannot drift apart. What you see is what the beam follows.

**Nesting follows the outline, not the bounding box.** A rib from a curved
object is a tongue or an arch, and the box around it is mostly air. Same idea as
[svgnest](https://svgnest.com), but raster-based rather than no-fit-polygon and
with no genetic pass — the sheet count has to keep up with a slider.

**Addresses are engraved as strokes, not text.** A `TEXT` entity is a question
to the machine about whether it has that font, and the answer is often no.

**A GLB is a scene, not a mesh.** Triangles sit in a tree of nodes, each with
its own transform, and a Blender export usually keeps the whole up-axis
conversion in the root node. Reading the vertex buffers and skipping the tree
gives the right triangle count and the wrong object. slicerman walks the tree,
then converts glTF's Y-up to the workshop's Z-up — glTF *says* which way is up,
so the tool uses what it knows. STL and PLY say nothing, and come in as they
are.

## Develop

```bash
pnpm install
pnpm dev
pnpm build      # forces webpack, then checks the worker actually bundled
```

Next.js + React Three Fiber. All geometry runs in a Web Worker; the main thread
only draws. `vercel.json` pins the framework and build command, so a fork
deploys without touching any dashboard.

> Do not build with Turbopack. It ships `new Worker(new URL(…))` as raw
> TypeScript in `static/media`; the worker then dies silently in the browser and
> the page just sits there. A guard script fails the build if that happens.

```bash
pnpm probe   # engine without a browser: parts, joints, cut length, files
pnpm rekkje  # reads the cut files back: engrave, inner cuts, outline, in that order
pnpm vrient  # meshes that aren't meshes, sliders at both ends, and a hostile URL
pnpm ledd    # asks the cut profiles whether every joint the panel counted is really there
pnpm glb     # writes GLB files with known geometry and reads them back
pnpm pakk    # redraws every sheet and counts cells — catches overlaps
pnpm tung    # a million triangles in, and how long that takes
pnpm ark     # cut sheets as images
pnpm look    # screenshots of the page, and any console errors
```

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
| `lib/zip.ts` | fifty lines of ZIP, so one export is one download |
| `lib/vaffel/` | body, ribs, joints, parts, metrics, rules, exports |
| `lib/worker.ts` | the engine in its own thread |

## Limits

- Draco- and meshopt-compressed GLB files cannot be read — the decoders are
  hundreds of kilobytes of their own. The tool says so and names the extension
  instead of importing nothing. Re-export without compression.
- A `.gltf` that points at a separate `.bin` has no way to reach that file when
  dropped into a browser. Use `.glb`, which carries everything in one file.
- Slicing reads the mesh by counting winding. A globally inverted mesh is fixed
  automatically; a mesh with *inconsistently* wound triangles is a real defect
  and needs repairing elsewhere. The panel says how many open edges it found.
- Nesting is deterministic bottom-left-fill with four rotations. A genetic pass
  would pack tighter and take minutes instead of milliseconds.
- Kerf compensation offsets along the angle bisector. On corners tighter than
  the kerf this is approximate — it errs on the safe side.
- One construction type so far. The contract in `lib/core.ts` is written so a
  second one costs a folder and a line.

## Contributing

Issues and pull requests welcome. A second construction type — waffle is only
one way to build a curved surface from flat plates — is the most useful thing
anyone could add.

## Credit

Scene, gestures, panel and shareable URL come from
[50x50x50.iverfinne.no](https://50x50x50.iverfinne.no). The waffle engine shares
the idea but no geometry: there it built from an equation you could write down,
here from a mesh nobody knows the shape of.

## Licence

MIT — see [LICENSE](LICENSE).
