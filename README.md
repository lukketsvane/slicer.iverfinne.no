# slicerman

Turn a 3D mesh into flat parts you can cut on a laser or CNC — parts that hold
themselves together with no glue and no screws.

Drop in an STL. Set the material thickness. Download a DXF.

**[slicerman.iverfinne.no](https://slicerman.iverfinne.no)** — runs in the
browser, nothing to install, no account, no licence key.

> The interface is in Norwegian (nynorsk). The code and this README are not.

## What it does

One construction type: **waffle** — interlocking ribs in two directions.
X-ribs get slots opening upward, Y-ribs slots opening downward, so you lay the
X family on the bench and lower the Y family into it. That is the whole
assembly.

Everything is computed in your browser, in a worker thread. Your mesh never
leaves the machine it was dropped on.

## Use it

1. **Drop a file** anywhere on the page — `.stl` (binary or ASCII), `.obj`,
   `.ply` (ASCII or binary). Up to 220 MB. Or start from the built-in cube.
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
| **ARK** | the nested sheets, 1:1 |

In the SVG files, **colour is the operation**: black = cut, blue = engrave,
grey = information only (sheet outline, header). Nothing is filled. The DXF has
real layers instead.

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
STL / OBJ / PLY
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

## Develop

```bash
pnpm install
pnpm dev
pnpm build      # forces webpack, then checks the worker actually bundled
```

Next.js + React Three Fiber. All geometry runs in a Web Worker; the main thread
only draws.

> Do not build with Turbopack. It ships `new Worker(new URL(…))` as raw
> TypeScript in `static/media`; the worker then dies silently in the browser and
> the page just sits there. A guard script fails the build if that happens.

```bash
pnpm probe   # engine without a browser: parts, joints, cut length, files
pnpm pakk    # redraws every sheet and counts cells — catches overlaps
pnpm tung    # a million triangles in, and how long that takes
pnpm ark     # cut sheets as images
pnpm look    # screenshots of the page, and any console errors
```

| | |
|---|---|
| `lib/core.ts` | **start here.** The contract: parameters, metrics, rules, views |
| `lib/soup.ts` | mesh in two forms, and the road between them |
| `lib/io/` | STL, OBJ, PLY readers |
| `lib/mesh/solid.ts` | the rays — a mesh you can ask questions of |
| `lib/mesh/simplify.ts` `smooth.ts` | vertex clustering, Taubin |
| `lib/contour.ts` | marching squares |
| `lib/pack.ts` | nesting |
| `lib/stroke.ts` | single-stroke font |
| `lib/vaffel/` | body, ribs, joints, parts, metrics, rules, exports |
| `lib/worker.ts` | the engine in its own thread |

## Limits

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
