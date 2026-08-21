# slicerman

Turn a 3D mesh into flat parts you can cut on a laser or CNC — parts that hold
themselves together with no glue and no screws.

Drop in an STL. Set the material thickness. Download a DXF.

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

The tool opens on **2 mm MDF, cut on a laser**: no cutter diameter, straight
joint corners, a 600 × 400 mm bed. That is what most people who open it are
holding. Set `fres` above zero and it becomes a CNC tool again, with dogbones
and T-bones — and the rules start checking that the slot is wide enough for the
tool.

## Use it

1. **Drop a file** anywhere on the page — `.glb`, `.gltf`, `.stl` (binary or
   ASCII), `.obj`, `.ply` (ASCII or binary). Up to 220 MB. Or start from the
   built-in cube.
2. **Place it**: size, rotation. Simplify and smooth if it came from a scanner.
3. **Set the material**: thickness, kerf, cutter diameter, sheet size.
4. **Read the rules.** The panel tells you what can't be cut or assembled, and
   why.
5. **Export.**

Two fingers on the canvas change the rib counts; three fingers move the light.
Double-tap reframes. The URL carries every setting except the mesh itself.

## Output

| | |
|---|---|
| **STL** | the assembled stack, for rendering or 3D printing |
| **DXF** | R12 ASCII, mm, layers `KUTT` and `GRAVER`, kerf-compensated |
| **SVG** | every rib profile side by side, 1:1 |
| **ARK** | one file per nested sheet, 1:1 — zipped when there is more than one |
| **PRØVE** | fit-test coupon: seven slots, each 0.05 mm wider than the last |

In the SVG files, **colour is the operation**: `#000000` cut, `#0000FF` engrave.
Exact palette values, so LightBurn puts them on the same layers every time.
Two colours and no more — a sheet outline or a header is just another layer to
remember to switch off, and one somebody eventually forgets. Which sheet a file
is comes from its **name**. Nothing is filled; a fill tells the machine to burn
the whole face. The DXF has real layers (`KUTT`, `GRAVER`) instead.

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

Kerf compensation is applied **in the file**, in both DXF and SVG — most people
with a laser in the basement don't have a CAM package that can set tool offset.
If your software also compensates, set `snitt` to 0 or you will compensate
twice.

## Parameters

| | | |
|---|---|---|
| `storleik` | size | longest side, 40–1200 mm |
| `rotX/Y/Z` | rotation | ±180° |
| `glatt` | smoothing | 0–24 Taubin passes — removes scanner noise without shrinking |
| `trekant` | triangle budget | 0.5–60 k, by vertex clustering |
| `ribbX/Y` | rib counts | 1–32 each way |
| `tjukn` | thickness | 1–25 mm (presets 3/4/6/9/12/18) |
| `klaring` | press fit | 0–0.6 mm — slot wider than the plate |
| `ledd` | joint split | 0.2–0.8 — where in the overlap the slot bottoms out |
| `leddtype` | joint corners | straight / dogbone / T-bone |
| `fres` | cutter diameter | 0–12 mm (0 = laser) |
| `snitt` | kerf | 0–6 mm |
| `arkB/H` | sheet | up to 3000 × 2000 mm |

Materials: plywood, MDF, acrylic, cardboard — they set density (mass) and how
the surface is drawn.

## Rules

The tool cuts anything, but it says what it cut. **Hard** means the parts can't
be made or can't be assembled; **soft** is a choice worth knowing about.

- ribs actually interlock
- there are parts to cut
- every part hangs in at least one joint — otherwise it's a loose plate
- the slot is wider than the cutter
- material remains at the joint after the slot has eaten half the overlap
- parts fit on the sheet you actually have
- press fit is in a workable band (soft)
- ribs are far enough apart to get a tool between them (soft)
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
and the 3D view cannot drift apart. What you see is what the cutter follows.

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
