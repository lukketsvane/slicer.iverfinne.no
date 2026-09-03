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
laser — with a cube and **no cuts**: the body sits there as a shell and the
first thing you do is cut it. Want a grid, switch on **rutenett** and set the
columns and rows with two fingers. Change the thickness to the sheet
in your hand and the bed to your machine; the link carries both.

**It is a laser tool.** No cutter diameter and no dogbones, because a beam has
no radius.

## Use it

1. **Pick a body.** The pill at the top opens the body: five primitives
   (cube, sphere, cylinder, cone, torus) and your own files — `.glb`, `.gltf`,
   `.stl`, `.obj`, `.ply`, up to 220 MB, or a `.zip` saved by **LAGRE**. A
   primitive is *added* beside what is already there, overlapping it, so the
   body is all of them together — a sphere next to a cube, a cylinder into its
   side; the pill then says `kube +2`. `tøm` goes back to the source alone,
   and undo takes a piece off again. A file starts over, and a new body clears
   the planes: they were an answer about the body you had.
2. **Compose it.** The cube button under your thumb opens the body tool: every
   piece stands as a box you can press. Two fingers on the selected one move it
   (horizontal slides it along the floor, vertical lifts it), twist it about the
   upright, and pinch it larger — and two buttons appear to duplicate or remove
   it. That is how a seat gets on top of legs. **`x y z`** above them are the
   symmetry: each mirrors the piece across the plane through the body's centre,
   and they count together, so one leg placed off the corner with `x` and `y` on
   is four legs — and they stay four while you drag it. The sketch is hidden
   while the tool is open: one tool at a time.
3. **Set the size.** Drag the number, or take it from the sheet.
4. **Sketch a plane.** One finger turns the object. The sketch plane is a line
   across the screen — a knife seen edge-on — with a grab handle in the middle
   and a rotation handle at the end: drag the one to move the cut across the
   object, the other to tilt it. **Two fingers on the object** aim the cut:
   drag moves it, twist tilts it, pinch zooms the view. Neither the pinch nor
   the twist touches the body — the size is a number you drag and the turn is
   the body tool; a body that grows when you want a closer look is a body
   doing something you did not ask for. Switch on
   **skisse** (or press `S`) and drag, twist and pinch all work on the plane
   at once. Three fingers move the
   light. The plane swings with the view and nothing is built from it — and a
   double-tap does nothing, because a reframe you did not ask for throws away
   the angle you were finding.
5. **Press skjer** — the big button under your right thumb. The sketch shows
   the slice it would make while you aim: the section through the body, and
   marks where it would lock into planes you already cut, with the joint
   count on its label. Cut, and the section becomes a part: a name, a
   profile, slots against every plane it crosses, a place in the assembly and
   a row in the list. Turn the object and cut again. The cut planes stay where
   you put them while the view turns.
6. **Or set a grid.** Switch on **rutenett** (or press `R`) and two fingers
   set the two numbers: sideways is columns, up and down is rows. It writes
   the whole plane list, so it is one step in undo.
7. **Read the rules.** They say what can't be cut or assembled, and why, and
   most broken rules carry the button that fixes it.
8. **Export ARK** and open it in LightBurn.

Every change is undoable and redoable: the two arrows at the top, or `Z` and
`⇧Z`.

## Two surfaces

The iPhone 16e, saved to the home screen, is the target device — the only one:
one thumb, a 390-point screen, the object visible while you work. The page
itself never zooms, scrolls or lets you select anything; every gesture belongs
to the object. A slim bar at the top carries the body you are working on
(tap it for a primitive or another file), the three views, undo and the link.
A sheet at the bottom has three heights: one line (the live count, the grid
tool, export), the middle (size and the plane list), everything (material and thickness, the
sliders, the table with the rules and their fixes, the tools). The cut button
and the sketch toggle float above it, under the right thumb.

**The view cube**, top right, turns with the camera and is how you aim it: press
a face for that side, an edge for the 45° view between two, a corner for the
isometric between three, and the camera swings there. It is drei's
`GizmoViewcube` — geometry in the canvas, hit by the same raycast as everything
else in the scene — not a hand-built one, and it is 45 px. Under it is the
reframe button, which fits the object back into the screen, and under that the
magnifier: press and drag it up to go in, down to go out. The body turns the
whole way round, underside included.

**Dark is black.** There is no toggle: the page takes the system's setting and
inverts the four colours it is built from — paper becomes black, ink becomes
white. No dark greys; a grey surface is a third layer that does not exist in
the light version either. The 3D view follows the same two tokens, so the
canvas is black too. What does *not* follow is the output: an SVG, a DXF and a
PNG are black on white paper whatever the screen is set to, because they are
documents and not interface.

**Over 1180 px with a mouse**, no sheet — the same controls as one column on
the right, the top bar above the canvas, and the camera frames the object into
whatever rectangle is left over.

**With a part selected** (tap it in the object), the handles and the two-finger
drag edit *that* plane instead of the sketch: move it along its normal, re-angle
it. Tap empty space to deselect; the row's `slett` removes the plane.

**The contour view is a drawing, so it is a canvas**: one finger drags it,
pinch zooms, nothing turns, and the reframe button takes you home. It zooms
in much further than the object view does — a 3 mm slot in a half-metre
outline is four pixels on a phone, and going in close is the only way to see
whether it is there.

**And it is a surface you shape on.** Tap a plate: it goes to full ink with a
frame around it, the rest stay at a whisper. Tap **skjer hòl** or **legg til
gods** — in this view they latch — and one finger *inside that frame* draws.
Outside the frame the same finger still drags the drawing, and two fingers
still pan and zoom; the frame is the line where the finger changes meaning,
which is why it is drawn and not implied. The ink follows at the width the
mark will have, and nothing is cut until you lift: the plate is then sliced
again with the mark in it, in one undo step. Tap the other pen to flip sign
without leaving, the lit one or `Esc` to stop drawing, empty paper to let the
plate go.

**The mark is a saw, not an undo.** `hòl` does not distinguish material you
added from material the mesh gave you: a mark across a plate cuts the plate,
into two parts if it spans it, and the addresses follow. The pen is floored on
the material — two plate thicknesses, never under the kerf — because a slit
narrower than the beam is a scorch line and a rib thinner than the plate is a
matchstick. Erasing adds a stroke rather than removing one; the list only
shrinks through undo or `⌫`.

Keys: `L` cut, `S` sketch mode, `R` grid tool, `⌫` remove the selected plane,
`Z` undo, `⇧Z` redo, `1` `2` `3` views, `Esc` close.

**Three ways to keep an afternoon's work.** The link carries every setting —
planes included — and no mesh. **LAGRE** gives a project file carrying both.
And the browser remembers by itself, in IndexedDB. The unlocked sketch is
disposable and is not kept; it costs one gesture to make again.

## The body

The body is a list of pieces, not a file: primitives made in code and files
you dropped in, each scaled to 100 mm on its longest side times its own size,
turned about z and placed, then the whole list is rotated, scaled to
`storleik` and set on the floor. Nothing is stitched: the rays count shells,
so two pieces that overlap are one body where they overlap. The list is the
`scene` string in the parameter bag, and the project file carries every
piece's file.

**Symmetry is three switches on a piece**, one per axis, and they are one digit
in that string. Each mirrors the piece across the plane through the **body's
origin** — not the piece's own centre, where mirroring a primitive would be
nothing at all — and they compose: `x` gives two, `x` and `y` give four, all
three give eight. It is a mirror and not a copy, so a leg you drag afterwards
drags all four, and a reflection genuinely reflects: the triangles come back
wound the other way, because a half-flipped mesh is not something anything
downstream would catch — the rays count shells, and material would end up on
the wrong side.

Radial symmetry — *n* copies about the upright — is not here. It would need a
count and an axis where this needs three switches, and mirrors are what a body
with a front and two sides is made of.

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
two fingers or the handles. Select a part and the thumb column offers **legg til
gods** and **skjer hòl**: a rectangle that adds material, a round that cuts it
away, dropped at the centre of the section and then moved, resized and turned
with three handles. The third kind is the freehand mark drawn in the contour
view — a polyline with a width, moved and re-widened with the same handles,
minus the rotate one, because a path carries its own direction. They are cut in the same field as the slots, so a hole you
drew and a slot the engine cut never disagree, and the section shows the real
result while you drag. When the model changes underneath a stroke, **the
stroke stays**: it is what you did, and the tool does not throw work away
unasked. It may drift out of true, and then you see it in the profile and
remove it yourself.

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

## The grid

A rib grid is two numbers, and **rutenett** is the tool that sets them with
your fingers: sideways is columns, up and down is rows, 44 px to a plane. It
starts from what is already there — planes along x counted as columns, planes
along y as rows — so it carries on where your grid left off.

It **rewrites the list**, because a grid is a list and not an addition. That is
one step in undo, however far the fingers went: the whole drag is one entry,
and `Z` gives back the planes you had.

There used to be a search here that sliced a dozen grids for real and ranked
them, and a deep search that measured the body and walked a front. It answered
a question nobody had asked — the two numbers were never the hard part, and a
ranking is not a decision. The tool that sets them is.

## Output

| | |
|---|---|
| **STL** | the assembled stack |
| **GLB** | the same stack as glTF binary — metres, Y up, flat-shaded: Blender, Sketchfab, a browser |
| **USDZ** | the same again for AR Quick Look: share it on an iPhone and the assembly stands on the table in front of you, at size |
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
engraved names included — drawn in the interface's ink, while the file itself
is always black and blue on white paper. Drag a part and it stays where you drop it; the rest
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
| `trekant` | triangle budget | 0.5–60 k, by vertex clustering; 40 k by default |
| `forenkl` `hol` | cut profile | how far the cut may stray, and the smallest hole worth cutting |
| `scene` | the body | pieces: source, place, size, turn, mirrors, as a string |
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

Most broken rules carry their own way out: the rule that knows fifteen parts are
too big also knows *how much*, so it offers `prøv 290 mm` and sets it. **Some
carry none, on purpose.** «Planes grip» and «parts exist» used to offer a 6×6
grid — one press and your plane list was replaced by a generated one. That is
not advice, it is a different drawing; now that the grid tool sets the two
numbers with two fingers and the pen draws into the planes, it is work a button
has no business throwing away. Those rules state the reason and stop there.

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
  └── STL · GLB · USDZ · DXF · SVG · ARK
```

**A mesh is a shell, not a solid.** Rays make it one: count which way each
triangle faces, sum rather than parity, because scans have overlapping shells
and parity reads the overlap as a hole.

**Two resolutions decide how the parts look**, and they are not the same
thing. `trekant` is the mesh budget — 40 000 triangles by default, which is
what a scanned or modelled figure needs before it stops looking faceted. The
sampling grid is the other: 220 cells along the longest side for everything
that is measured, cut or drawn on screen (a coarser 120 while a finger is
still moving, and the fine build lands when it stops). The screen and the cut
file are built at the same number on purpose — the phone used to be pinned to
the coarse level, so it showed stair-steps that were not in the file.

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
pnpm tung    # a million triangles in, and how long that takes
pnpm ark     # cut sheets as images
pnpm look    # screenshots of the page, and any console errors
pnpm panel   # the controls in a real browser: both surfaces, gestures, keys
```

`probe` through `enkel` are headless and fast. Point `look` and `panel` at
`next start` on port 3210, never the dev server — they drive a real browser for
minutes, and HMR reloading underneath produces failures that look real.

| | |
|---|---|
| `lib/core.ts` | **start here.** The contract: parameters, metrics, rules, views |
| `lib/plan.ts` | what a plane is: name, point, normal, strokes (box, ellipse, freehand mark); the string; the grid |
| `lib/params.ts` | the parameter space and its defaults |
| `lib/scene.ts` | the body as pieces: primitives and files, placed |
| `lib/kropp.ts` | the body: pieces joined, weld, unflip, simplify, smooth, place — and turned along any normal |
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
| `lib/motor.ts` | the engine as one object |
| `lib/worker.ts` | the engine in its own thread |
| `lib/lagring.ts` | what the browser remembers between visits |
| `components/` | the studio: scene, sketch plane, gestures, sheet, tools |

The reasoning behind each decision lives in the file it belongs to. The comments
are the documentation. `REBUILD.md` is the brief this version was built to.

## Limits

- Draco- and meshopt-compressed GLB cannot be read. Re-export without.
- **GLB** and **USDZ** out carry the geometry and one colour, and nothing else:
  no normals (both formats shade the flat parts from the faces themselves), no
  textures, one mesh. The USDZ is ASCII USD in an uncompressed, 64-byte-aligned
  archive, which is what the format asks for.
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

## Credit

Scene, gestures, panel and shareable URL come from
[50x50x50.iverfinne.no](https://50x50x50.iverfinne.no).

## Licence

MIT — see [LICENSE](LICENSE).
