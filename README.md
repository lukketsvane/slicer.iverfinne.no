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
   ASCII), `.obj`, `.ply` (ASCII or binary), or a `.zip` saved by **LAGRE**.
   Up to 220 MB. Or start from the built-in cube.
2. **Set the size** — pinch the object, or drag the number. The longest side
   in millimetres is the one number the rest of the tool is measured against.
3. **Press find settings.** It slices a dozen rib grids for real and ranks
   them, then sets the best. A ring around the button fills while it runs, and
   a line under the panel then says where you are in that list (`1 av 12 · 7×7
   ribber`) and walks it both ways.
4. **Read the rules.** Tap the three numbers to open the panel: it tells you
   what can't be cut or assembled, and why.
5. **Export ARK** and open it in LightBurn.

Nothing here is one-way. Every change is undoable, by the arrow in the panel or
by `Z`.

## Two surfaces

**On a phone** the controls are a sheet at the bottom with three heights: one
line, the controls, everything. Half open is a third of the screen and never
scrolls; the object keeps the rest. What you press sits in a footer that stays
put while the rest scrolls.

Half open carries **the middle of the job** and nothing else: the file, the
three numbers, find settings, the size, the plate thickness, and any **hard**
break with the button that fixes it. A hard break is a stop; a soft one is a
choice, and a choice does not need a line of its own on a phone — the headline
dots the numbers a soft rule touches, and the board in the full step says what
and why. Everything that is not the middle of the job lives one tap down:
material (thickness is the plate you own, material is mass and surface), the
board, every slider, and the whole output stage — seven export buttons and the
colour legend, which are the *end* of the job, not the middle of it. That is
the difference between a sheet at half the screen and one at a quarter.

**The view chips sit on the canvas on both surfaces.** `flate` `lag` `kontur`
are a glance at what you are looking at rather than a setting you dial, so they
belong next to the object. On the bench they always did; on the phone they used
to cost a row of the sheet and now cost nothing, because that corner of the
canvas is empty anyway.

**On a screen wider than 1180 px with a mouse there is no sheet at all.** A
tablet gets the sheet however wide it is: the walls are built for a pointer.
 Three heights are
an answer to a phone; on a desk the answer is that they disappear. Two fixed
walls stand instead, and the object lives between them. The left wall is what
you put in, in the order you do it: the file, the size, what to measure it
against, the button that finds the grid, the plate, and then every slider. The
right wall is what comes out: the numbers, the twelve rules, the profiles, the
files. Nothing opens, and on a tall enough screen nothing scrolls either. On a
short one the wall runs out of room and the list scrolls after all — and then
it says so, with a shade at the edge it is running past. A wall that scrolls in
silence is a slider you never learn is there.

The camera knows about the walls. It frames the object into the rectangle
between them (`camera.setViewOffset`, not a moved target — moving the target
moves the pivot, and then the object spins around a point that isn't in it),
while the scene is still drawn edge to edge underneath, so the walls sit on
paper rather than on a hard edge.

**Find settings answers with a list, not a number.** Twelve rows: ribs, parts,
sheets, joints. You see that number four has half as many parts and jump
straight there. Hovering a row builds that candidate on screen after 90 ms and
leaving puts yours back; only a click binds, and only a click is undoable. Above
400 000 source triangles each build is too expensive for that, so it takes a
click.

Hold space and both walls fade: a key you *hold* is not a state, you are always
back where you were when you let go.

**Find settings** only moves the rib counts and the joint split. Your mesh,
your size, your material thickness, your press fit, your kerf and your bed
stay exactly where you put them — a button that changes those has not answered
your question, it has replaced it.

The panel reads everything off the geometry, including **cut length and cut
time** at the speed in `fart`. That is pure beam-on time, no travel between
parts, and it is worth seeing before you press the button rather than after.

**Two fingers on the object.** Spread to size it, twist to turn it on the bed,
drag to change the rib counts. Three fingers move the light, double-tap
reframes, one finger orbits. Pinch no longer zooms the camera: the camera
frames the object by itself whatever size it is, so that gesture was being
spent on the one thing in the tool that already happens on its own. On a
trackpad, ctrl+scroll pinches and `,` / `.` turn. Whatever the fingers are
doing shows as a number above the object while they do it, because a pinch
that resizes an auto-framed object is otherwise invisible.

The URL carries every setting except the mesh itself.

**Three ways to keep an afternoon's work.** The link carries every setting and
no mesh, because a URL cannot carry a hundred megabytes. **LAGRE** gives you a
project file that carries both — drop it back anywhere on the page and you are
where you left off; the harness saves, reopens and compares the DXF character
by character, because a save that comes back with a different object is worse
than no save. And the browser remembers by itself: settings a second after they
stop moving, the mesh once when it arrives, in IndexedDB rather than
localStorage because a mesh is megabytes and localStorage is five. A link
always beats the remembered session — a link is somebody telling you what to
look at.

The camera frames whatever is on screen into the band the control sheet leaves
free, rather than into the whole window.

Every number next to a slider is a **field**: a slider is good at hunting and
bad at hitting, so type `240` when you want 240. Keys, on a desktop: `F` finds
settings and `⇧F` steps back, `D` runs the deep search, `1` `2` `3` switch
views, `←` `→` nudge the rib you are pointing at, `Z` undoes, `L` opens the cut
list, `A` the sheets, `S` the stack, and `Esc` closes whatever is open. `O`
opens the control sheet, which only exists on the phone surface.

## Four tools

The walls are what you set and what you read. The rest is what you **look up**
and what you **edit by hand** — and neither fits in a wall three hundred pixels
wide. A drawer holds them, one tool at a time.

On the bench it takes the lower half of the canvas and the camera reframes the
object into what's left, so you read a list *while* looking at what it points
at. On a phone that choice doesn't exist — a drawer at a third of a phone is
twelve ribs in a peephole over an object too small to point at — so there it is
a page: everything above the closed control line, which stays visible, so you
move a rib and watch the part and sheet counts answer. The stack has its own
icon in the sheet's footer; the other three are a word away in the drawer's
title bar.

**The cut list** is the panel's `12 delar · 12 · 2 unike` written out: every
part with the address engraved on it, its shape id, size, area, cut length,
joints and which sheet it lands on. Sort on any column; copy the lot as CSV. A
part with no joints is red — it hangs in nothing.

**Click a rib in the object and the list opens on that line.** Hover a line and
that part stands out in the object — not a different colour, the same plate
lifted, because the reason to point at it is to see where it sits among the
others. The engine marks every triangle with the cut-list line it was built
from, the same way it already marks face from cut edge, so the answer comes
from the slicing rather than from a second guess at it.

**The sheets**, one at a time, drawn large enough to read the addresses, with
how much of each became part. It is not a picture of the file — it *is* the
file, the same SVG the export writes.

**The stack.** Every rib, on both axes, one row each: where it stands in
millimetres, whether it is fixed, and what it became — `4·0` in red is a plane
that broke into four islands and holds none of them. Drag the number or type
it. Duplicate, mirror, delete. Lock all on an axis and the rib slider stops
pushing what you have and starts adding between it. See **Building by hand**
below.

**The settings, as text.** A slider is good at hunting and bad at hitting, and
a field takes one number at a time; this takes them all. Select, copy, paste
into a message, get them back, paste them here. Out-of-band numbers are pulled
into range by the engine's own clamp, and the line below says which moved.

## Building by hand

The rib count is a slider, and a slider is a good place to start and a bad
place to stop. `6` means six evenly spaced planes; it does not mean *these*
six. Moving one to where the joint should sit, taking out the one that cuts
through an eye, putting two close together where the material is thin — none of
that is a number.

**A lock is a fraction of the span, and that is the whole mechanism.** Ribs are
a *list*, not a count: locked ones hold their exact fraction and the free ones
distribute around them, so the slider keeps meaning something. Drag it from six
to ten with four locked and four new planes appear *between* them.

A fraction and not a millimetre, deliberately: resize the object and a locked
rib stays where it is **on the body**, not where it was on the bench. The stack
shows millimetres because nobody builds in fractions — measured from the near
edge of the body, derived from the straight line `pos = min + t · vidd` fitted
to the positions the cut list reports. Not from `envX`: that is the *finished*
object's extent, which shrinks to where material actually stands, and on a
shape that doesn't fill its box the two differ. A line fitted to the wrong span
looks right and is wrong in every row.

Once anything is locked, the rib slider says how many are (`4 låste` under the
label). It has to: a lock beats the count, so a stack of six locked ribs stays
at six whatever the slider reads, and a slider that does nothing with no reason
given is worse than no slider. Dropping in a **new mesh clears the locks and
the pins** — both are answers about the body you had, and six fractions written
for a horse mean six entirely different planes in a chair. A project file is
different and takes a different path: there the mesh and the settings were
saved together.

**Every edit locks the whole stack first.** This is not caution, it is the only
reading that works. A free rib has no position of its own — it is "the fourth
of six evenly spaced", and that position is a function of the count. Ask to
move it without writing the stack down and the fraction it lands on claims the
nearest even slot, the others redistribute into what's left, and a rib moves
that you never touched. `pnpm hand` holds exactly this case: moving X2 from
0,25 to 0,35 unlocked leaves X2 where it was and deletes X3.

Neighbours bound the move, and the bound is physical: two rib planes closer
than one plate thickness are two plates standing inside each other. The field
stops there rather than refusing — a slider that stops against a wall tells you
where the wall is.

Arrow keys nudge whatever you are pointing at, from the model, the cut list,
the sheet or the stack. Shift for ten times the step.

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
half-million-triangle scan), and a ring around the button fills while it runs.

The search yields between candidates rather than running to completion in one
go. That is not politeness: a worker that never lets go of its thread has its
messages flushed only when it finally does, so twelve progress reports would
land in the same instant as the answer. A ring that jumps from nothing to done
is not progress.

### Hold the button: the deep search

A press asks what is usually sensible. **Holding** the button (or pressing `d`)
asks what *this shape* needs: the grid that carries the most of your form on
the fewest sheets. It reads every rib count from 2×2 to 32×32 — about a
thousand grids — and then slices only the best of them for real.

It can afford a thousand because it stops guessing and **measures the body
once**. One vertical ray per column of a 128×128 raster over the floor gives
the volume, the cross-section profile A(x), and A(y) in a single sweep, for
less than the cost of one slicing. A rib at x = a is a *sample* of A at a, and
the waffle's claim about your object is the step function that holds that
sample to the next cell. The area between that claim and the real A is the part
of the shape that is not there — a number, in millimetres squared, read off the
geometry. That is the `form` column on the bench.

It behaves the way a measurement should and a guess would not. A cube is 100 %
at *every* rib count, because its profile is constant and one sample tells you
everything — a cube with two ribs really is a cube. A sphere climbs smoothly.
A standing torus scores differently along x than along y, which is why the deep
search picks lopsided grids there and the plain search, which chooses on rib
*spacing*, never can. And on a body with legs it is **not monotonic**: three
ribs can score worse than two, because the third plane landed between the legs
instead of on them. No heuristic over rib counts can see that.

Ranking uses the same weights in both stages — estimates in the wide one,
measurements in the narrow one, because a prefilter that ranks on something
other than what finally decides will sieve out the winner before anyone looks
at it. Fidelity is weighted heaviest, sheets much more steeply than in the
plain search, and parts are a *price* rather than a bell: fidelity saturates,
so without a price on the work the search only stops when it needs another
sheet — on a torus that bought four percent more shape for fifty more parts.

What comes back is a front, not a point: the best grid on one sheet, the best
on two, the best on three. That list is worth more than the winner. *On one
sheet it looks like this; on two, like this.*

## Output

| | |
|---|---|
| **STL** | the assembled stack, for rendering or 3D printing |
| **DXF** | R12 ASCII, mm, layers `KUTT` and `GRAVER`, kerf-compensated |
| **SVG** | every rib profile side by side, 1:1 |
| **ARK** | one file per nested sheet, 1:1 — zipped when there is more than one |
| **PRØVE** | fit-test coupon: seven slots, each 0.05 mm wider than the last |
| **ALT** | the whole job in one download: all of the above, plus the cut list as CSV and the settings as JSON |
| **LAGRE** | a project file — the settings and the mesh you dropped in, together |

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

Two colours and no more — in an SVG a sheet outline or a header is just another
layer to remember to switch off, and one somebody eventually forgets. Which
sheet an SVG is comes from its **name**. Nothing is filled; a fill tells the
machine to burn the whole face.

**The DXF is the other way round, on purpose.** It has real named layers
(`KUTT`, `GRAVER`, with `GRAVER` declared first), and it keeps every sheet in
one drawing, stacked 200 mm apart in Y. So it does draw a rectangle round each
sheet and an `ARK i/n` header above it — both on `GRAVER`, which is also where
the part addresses are, so they cannot be switched off separately. The header
sits outside the material; if you run `GRAVER` with the sheet lined up under
the origin, the beam passes over the bed there.

`ARK` gives **one file per sheet** — a single SVG when it fits on one sheet, a
ZIP of `…-ark-1av3.svg` and friends when it does not.

**Cut the fit-test coupon first.** `klaring` and `snitt` are two guesses that
multiply in every joint; get it wrong by 0.05 mm and sixty joints either need a
hammer or fall apart, and you only find out once the whole sheet is cut. The
coupon is sized from the plate — seven slots wide and about four thicknesses
deep, so 107 × 34 mm in 3 mm stock and 212 × 46 mm in 6 mm — each slot 0.05 mm
wider than the last
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
| `glatt` | smoothing | 0–24 Taubin passes, removes scanner noise without shrinking |
| `trekant` | triangle budget | 0.5–60 k, by vertex clustering |
| `ribbX/Y` | rib counts | 1–32 each way |
| `lause` | pieces with no joint | keep / drop (default drop) |
| `tjukn` | thickness | 1–25 mm (buttons for 2/2.5/3/4/6, the plates a laser cuts) |
| `klaring` | press fit | 0–0.6 mm, slot wider than the plate |
| `ledd` | joint split | 0.2–0.8, where in the overlap the slot bottoms out |
| `snitt` | kerf | 0–6 mm |
| `snittveg` | who compensates | in the file / in the machine |
| `fart` | cut speed | 1–200 mm/s, for the time estimate only |
| `arkB/H` | sheet | up to 3000 × 2000 mm |

Materials: plywood, MDF, acrylic, cardboard. They set density (mass) and how
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
- the kerf does not eat the slot it is compensating for
- ribs are far enough apart to get a finger between them (soft)
- the mesh is closed (soft)
- resolution wasn't simplified away (soft)
- sheet utilisation (soft)

A broken rule carries its own way out. The rule that knows fifteen parts are
too big for the sheet also knows *how much* too big, so instead of the word
"smaller" it offers a button that says `prøv 290 mm` and sets it. Rules that
have no remedy in the parameters (an open mesh isn't closed by a number) offer
nothing, which is the honest answer. `pnpm raad` takes each of them, breaks it
on purpose, presses the button, and recomputes: a remedy that doesn't remedy is
worse than no button at all.

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

> Point `pnpm panel` at `next start`, not at the dev server. It drives a real
> browser for several minutes, and any file you touch while it runs makes HMR
> reload the page underneath it. The failures that produces look exactly like
> real ones.

```bash
pnpm probe   # engine without a browser: parts, joints, cut length, files
pnpm rekkje  # reads the cut files back: engrave, inner cuts, outline, in that order
pnpm vrient  # meshes that aren't meshes, sliders at both ends, and a hostile URL
pnpm ledd    # asks the cut profiles whether every joint the panel counted is really there
pnpm raad    # breaks each rule, presses the fix it offers, and checks it worked
pnpm glb     # writes GLB files with known geometry and reads them back
pnpm pakk    # redraws every sheet and counts cells — catches overlaps
pnpm hand    # locked ribs and pinned parts: moving one leaves the others where they are
pnpm djup    # the deep search: does the profile measure shape, and are the answers real
pnpm tung    # a million triangles in, and how long that takes
pnpm ark     # cut sheets as images
pnpm look    # screenshots of the page, and any console errors
pnpm panel   # the controls in a real browser: both surfaces, gestures, keys
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
| `lib/zip.ts` | ZIP, both ways: one export is one download, one project file is one drop |
| `lib/lagring.ts` | what the browser remembers between visits |
| `lib/vaffel/` | body, ribs, joints, parts, metrics, rules, exports |
| `lib/vaffel/profil.ts` | the body measured once: volume and cross-section profile, and how much of a shape a set of rib planes carries |
| `lib/worker.ts` | the engine in its own thread |
| `components/verkty.tsx` | the three tools on the bench |

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
