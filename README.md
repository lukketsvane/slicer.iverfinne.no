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
   it. That is how a seat gets on top of legs. The sketch is hidden while the
   tool is open: one tool at a time.
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
magnifier: press and drag it up to go in, down to go out. Out is 3.4 times
the framed distance — the ceiling was one and a quarter, which is not enough
to see a body with many planes in it. The body turns the
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
whatever rectangle is left over. The bench is where precision lives, because
that is where the keyboard is. Every number in the column can be typed:
double-click it (or press enter with the row focused), type, enter sets it and
escape leaves it; arrows step it, shift-arrows step ten. A selected plane moves
one millimetre along its normal per arrow press, ten with shift, and its row
reads where it stands in millimetres from the centre of the body, live. `D`
duplicates the selected plane, `H` cuts a hole in it, tab and shift-tab walk
the plane list, `F` reframes, and the right mouse button (or the wheel pressed)
pans the view — the reframe button puts it back. On the sheet, arrows nudge the
selected part a millimetre, and shift-arrows ten. A phone gets none of this:
one thumb has no arrows, and a text field there zooms the page.

**With a part selected** (tap it in the object), the handles and the two-finger
drag edit *that* plane instead of the sketch: move it along its normal, re-angle
it. Tap empty space to deselect; the row's `slett` removes the plane.

**Planes made in one action are a group.** A grid is two groups (across and
along), a whirl is one, a mirrored cut is one, and duplicating a group makes
another. The group has a row in the list above its planes; tap it and the
whole group is selected, with the last plane in the row as the one your hand
holds. Whatever you do to that plane the group does too: the handles, the
two-finger drag, the arrow keys, `slett`, `dubler`. `fordel`, under your
thumb while a group is selected, decides how: off, the whole row moves and
turns as one; on, the far end stays, the plane you hold takes all of it and
the ones between take their share, so turning the last rib fans the row
along a curve and pushing it re-spaces the row evenly. Tap the group's row
again, or a single plane, to let it go. The group is a tag on each plane in
the link (`g:1`), never a thing of its own: each plane is still its own point
and normal, and a plane you move alone stays in its group.

**A plane can carry a layer.** Under a selected plane the list shows
LightBurn's own palette, C02 to C29, and a ring for none. Pick one and every
cut of that plane, outline and holes, is written in exactly that colour, so
LightBurn puts it on that layer where you give it its own speed, cut it
last, or switch it off. Black and blue are not on offer: they are the
engrave and the cut, and the order lives in them. With a group selected the
pick tags the whole group. The sheet draws a tagged part in its colour, the
list shows a dot, and the DXF gets a layer named after the LightBurn colour
with the exact value as true colour beside its nearest ACI. Untagged files
are unchanged: two colours, as before.

**The contour view IS the sheet.** It was a ribbon of profiles laid out side
by side in the canvas — the same drawing the sheets already showed, only with
no way to touch it. Now the third view *is* the sheet: the parts where the
laser will cut them, one finger to drag a part, hold for its menu (pin, turn,
next sheet), two fingers to drag and turn a selected one, one finger on bare
board to pan, double-tap for the whole sheet. Tapping a part selects the plane
it was cut from, so the profile tools sit under your thumb as they do in the
object view. There was a pen and an eraser here for a while — one finger inside
the frame drew a freehand mark into the plate — and they are gone; marks on a
plane are placed in the object view, where you can see what you are marking.

The 3D room stays mounted behind it, hidden rather than torn down, so stepping
out and back does not reset the camera. "plater" is no longer a drawer tool —
it is the same surface, and showing it twice was the whole complaint.

**Slot ends are handles.** Select a part and every joint on it gets a dot at
the closed end of its slot, on a hairline track showing how far it can travel.
Drag one and that joint alone gets deeper — and the other half of the joint
gets shallower by exactly as much, because both slots read one number off one
line. `jamt` in the sheet's toolbar hands every joint back to the slider.
**With a plane selected**, the two buttons under your thumb are `skjer hòl`
and `dubler planet`. The second used to add a rectangle of material to the
profile; it duplicates the selected plane now — same normal, same strokes,
shifted one notch along the normal so the copy is not inside what you copied,
and the copy is what stays selected.

**Nothing sits on the object but the handles.** The label that read the joint
count and the millimetre off the sketch is gone from the screen: the sheet
already says both, and it covered exactly what you were aiming at. The handles
are 22-pixel marks at half ink, full ink while you hold one; their touch
targets are still 48.

**Two fingers, one cut.** Hold the sketch handle with your thumb and tap
`skjer` with a finger — the plane is cut where you are holding it, and the
handle never leaves your thumb. Browsers only synthesise a click from the
*first* finger on the screen, so the second tap never reached the button; the
thumb column reads the pointer itself when it is not the primary one. Let go
outside the button you pressed and nothing happens, which is how a tap is
cancelled.

**The view is a decision, not a consequence.** The frame used to be worked
out from the geometry: the scale was `FRAME / longest side` and the centre was
the centre of the box, so *every* change moved and rescaled the whole picture.
Drag a piece out and everything else shrank while your finger was still on it,
and you were aiming at a target that slid away. The camera did the same thing
whenever the radius moved 10 %. Now the scale and the centre stay where they
were set, and the geometry moves inside that frame. It is set again only when
somebody asks: the reframe button, a face of the view cube, or a new body —
opening a file is not editing.

The box itself is still live. A plane's origin is a fraction of it, and a
plane at 0.5 has to sit in the middle of the body as it is now, not as it was.
Only the view holds still.

**Each side of a piece has a dot.** In the body tool, a selected piece shows
six small dots, one on the middle of each face of its box. Drag one and that
axis alone stretches — a cube becomes a plate, a cylinder an oval. The pinch
still scales all three at once and keeps the proportions; the dot is for when
you want a stool and not an inflated cube.

The size of a piece used to be one number. It is three now, one per axis, and
three equal ones are written as the single number they used to be — so a link
from last year opens the same object, and a link with a plain cube in it does
not grow for something nobody touched. The dots are DOM, like the sketch
handles and for the same reason: a 44-pixel target you can hit with a thumb
and a name a screen reader can say. The scene only works out *where* they go,
every frame.

**A plane does not have to be flat.** Select one and drag the bend button
under your thumb: the cutting surface becomes a cylinder, straight along `v`
and curved along `u`. A cylinder is developable — it unrolls to a flat sheet
without stretching — so the part is still cut flat and you bend it on
assembly. That is why it is a cylinder and not a sphere.

The number stored is curvature times size, not a radius in millimetres, so a
bend follows the body when you scale it. The radius in millimetres is what the
material has an opinion about: bending strains the outer fibre by `t/2R`, and
past what the material takes, the sheet splits — in the workshop, not on the
screen. So it is a hard rule, not a hint: plywood 100×t, MDF 200×t, acrylic
230×t cold, cardboard 10×t. 6 mm plywood bends to 600 mm and no tighter; 3 mm
to 300. The rule offers to straighten to exactly what will go.

Inside, a bent plane does not slice the body — it unrolls the *space*. The
cylinder becomes a plane again in the unrolled space, the slice is the same
z-slice as any other, and the profile that comes out is already the flat
pattern, because unrolling turns arc length into length. Straight triangle
edges become curves on the way, so edges longer than `√(8·R·tol)` are split
first; without that a cube would come out as a box with straight sides
claiming to be bent.

**Bent planes carry no joints yet.** Two planes cross along a line, and the
whole slot machinery is built on that; two bent surfaces cross along a curve,
and that finder is not written. Slicing therefore skips joints on a bent
plane, and a hard rule says so instead of letting you find it in the box. That
is the next step.

**The chrome dozes.** Two seconds without a finger and everything that is not
the object fades away — the top line, the thumb column, the sheet, the sketch
handles, the view cube, the cut preview — and any movement brings it back in
ninety milliseconds. Only *at rest*: with a plane or a stroke selected, a
drawer open, the sheet up, a tool running, the sheet surface showing or the
engine still working, you are in the middle of something and what is in front
of you stays. While it is gone the interface takes no touches, which is why it
only dozes at rest — the first tap then has nothing to hit on the object
either, so it wakes and does nothing else.

**Words, not pills.** The three views and the three mirror axes were rings with
a filled pill under whichever one applied. The ring said nothing the word did
not, and three filled shapes sat in the middle of the picture. They are words
now, in the same ink the icons use: full ink when it applies, dimmed when it
does not. The mirror axes moved to sit directly above `skjer`, which is what
they change.

**The shell has a switch.** In the parts view the body you started from is
drawn transparent around the ribs, so you can see how much of the shape they
catch. It is also what stands between you and the slots. The button under the
reframe icon takes it away and puts it back; the link carries it, so a view you
share is the view you sent. It changes no geometry and is not in the undo list.

Keys: `L` cut, `S` sketch mode, `R` grid tool, `V` vortex, `⌫` remove the selected plane,
`Z` undo, `⇧Z` redo, `1` `2` `3` views, `Esc` close.

**Three ways to keep an afternoon's work.** The link carries every setting —
planes included — and no mesh. **LAGRE** gives a project file carrying both.
And the browser remembers by itself, in IndexedDB. The unlocked sketch is
disposable and is not kept; it costs one gesture to make again.

## The body

**The built-in shapes are furniture.** A sphere, a cylinder, a cone and a
torus were honest mathematics and none of them said what the tool is for. Ten
stools and benches say it in one look. They live as glTF under `public/form`
and are fetched when you touch one — 5.8 MB of textured model reduced to about
285 kB of geometry by `scripts/former.ts`, decimated to 25k triangles, which is
under the 40k the build cuts to anyway. Their names are stable, so a link that
carries `stolform-03` finds the same shape tomorrow — the only source a link
can carry, because it is the only one that exists on the server rather than in
somebody's downloads folder.

The cube stays, and it is the only one made in code: it is the default object
and the fallback when a source is missing, so it has to be on screen before
anything has been near a network.

The body is a list of pieces, not a file: shapes made in code or fetched, and
files you dropped in, each scaled to 100 mm on its longest side times its own size,
turned about z and placed, then the whole list is rotated, scaled to
`storleik` and set on the floor. Nothing is stitched: the rays count shells,
so two pieces that overlap are one body where they overlap. The list is the
`scene` string in the parameter bag, and the project file carries every
piece's file.

**One drawing of the plates, not three.** The sheet panel used to carry a
160-pixel thumbnail of the same drawing, and the contour view a WebGL ribbon of
the same profiles again — the same picture three times, and only one of them
could be worked in. Both copies are gone, and with them a third slice, a
`contourLines` pass over every rib, and up to 52 kB of SVG serialised across the
worker boundary on every parameter change.

**The sheet view has a scale.** A measuring grid lies under the parts: the step
follows the eye, not the sheet — the smallest of 1, 2, 5, 10, 20, 50, 100 … that
still leaves nine pixels between lines — with every fifth line stronger and
carrying its number in millimetres. It is screen-only. The cut files have two
colours and not one more, and a helper line in one of them is a layer somebody
eventually forgets to switch off.

**The sheet is often an offcut**, so it takes the size it actually is: width and
height go down to 100 mm in steps of 1, as does the body's size. They were steps
of 10 from 200, which meant a 437 × 285 mm remnant did not exist — and rounding
*up* promises the machine more material than you own.

**The list holds 64 planes**, and says so when you reach it. That ceiling is measured, not
picked: `pnpm tak` puts it at roughly 15 ms per plane sliced plus 1.5 ms per joint, so one
geometry change is about 0.8 s at 32 planes and 2.0 s at 64 on a workstation — three to
five times that on the phone. Below about forty planes an edit stays under a second there.

## Planes

A plane is a **name, a point and a normal**, in the body's own space. The
point is stored as fractions of the box around the body, so resizing keeps a
plane where it is *on the body*. The normal is a unit vector — two angles would
have a pole. The whole list is one string in the parameter bag, so undo, the
link, the project file and the browser's memory all carry it with no extra
code, and a hostile link cannot push anything but a valid plane into the
geometry.

**Symmetry is three switches above the cut button**, one per axis. They change
what **skjer** does: one press locks the plane you are aiming *and its mirrors*
across the body's centre planes — `x` gives two, `x` and `y` give four, all
three give eight. A plane that is already symmetric about an axis mirrors onto
itself and is added once, not twice, so a cut down the middle stays one part.

What comes out are **ordinary planes with ordinary names**. They are not a group
and not a copy: move one, re-angle one, mark one, delete one, and
the others do not care. That is deliberate — a symmetry that persisted would
have to share a name between two parts, and the name is what is engraved on the
plate. So the switches are an aid to *placing* cuts, and then they are done. For
the same reason they are not in the link: they say what the next cut will be,
not what the body is.

**Names belong to the part, not to its position.** A plane is numbered when it
is locked and the number is never reused, so `7` stays `7` while it is nudged,
re-angled and redrawn, and the `7` engraved on a plate in a pile matches the
row on the screen. A plane cut into several islands gets letters: `7a`, `7b`.

**The split is a slider, and then a hand.** `ledd` says how far into the overlap
two planes meet — half and half at 0.5, so the two slots are equally deep. But a
joint is two plates, and sometimes one should carry and the other only hold. One
joint can be set on its own, and setting it deepens one slot and shallows the
other by itself: the bottom of A's slot and the bottom of B's are *the same
number*, read from either side of the same line. Nothing keeps them in step; they
are not two values.

**Every kept plane is editable, down to its outline.** Nudge and re-angle with
two fingers or the handles. Select a part and the thumb column offers **legg til
gods** and **skjer hòl**: a rectangle that adds material, a round that cuts it
away, dropped at the centre of the section and then moved, resized and turned
with three handles. They are cut in the same field as the slots, so a hole you
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

## Two rib languages

Ribbed plate furniture speaks two structural languages, and the tool has a layout
tool for each. **The grid** crosses ribs over one another. **The vortex** stands
them around the upright axis: `n` ribs, each turned `2πi/n`, each *pushed out* so
it is tangent to a circle rather than passing through the middle.

The push is the whole thing. Ribs that all pass through the axis cross each other
along the *same line*: measured, twenty of them collapse to two parts and
thirty-six loose pieces. Pushed out, the same twenty give a hundred joints and
nothing loose. So the offset is clamped above zero, and the two numbers are
coupled — three ribs at a large offset stop meeting altogether, which is why the
line keeps telling you how many parts came out while you drag.

The offset is a fraction of the body's *narrowest* width, not of the bounding box.
That distinction is not pedantic: a plane's point is stored as fractions of the
box, the box is not square, and the same fraction on both axes traces an **ellipse**
in millimetres. On a 300 × 120 mm body it swung the ribs between 21.6 and 54.0 mm
from the axis — two and a half times — and the vortex stood lopsided. Dividing each
axis by its own width holds it at 43.2 mm all the way round.

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
| **DXF** | R12 ASCII, mm, layers `KUTT` and `GRAVER`, kerf-compensated — one file per nested sheet, zipped when there is more than one. The plate is the drawing: `$EXTMIN`/`$EXTMAX`, not a burnable rectangle |
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
| `forenkl` `hol` | cut profile | how far the cut may stray (up to 10 mm — a spiky scan needs the room), and the smallest hole worth cutting |
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
| `deling` | split joints | how deep one joint cuts, `5-12-0:0.35`, written by dragging its slot end on the sheet |

Materials: plywood, MDF, acrylic, cardboard — density and surface.

## Rules

The tool cuts anything, but it says what it cut. **Hard** means the parts can't
be made or assembled; **soft** is a choice worth knowing about. Planes grip ·
parts exist · one way in for each part · every part hangs in a joint ·
material remains at the joint · parts fit the sheet · press fit · kerf · slot
survives the kerf · room between planes · mesh closed · resolution kept ·
utilisation.

The table has one line per reading, coloured by the rule that judges it — and under them,
the rules that judge something the table does not show: whether the parts can be assembled
in any order at all, and the two sliders. Those appear only when they break.

Most broken rules carry their own way out: the rule that knows fifteen parts are
too big also knows *how much*, so it offers `prøv 290 mm` and sets it. **Some
carry none, on purpose.** «Planes grip» and «parts exist» used to offer a 6×6
grid — one press and your plane list was replaced by a generated one. That is
not advice, it is a different drawing; now that the grid tool sets the two
numbers with two fingers, it is work a button
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
pnpm tak     # the plane ceiling: what 64 planes cost, and that slicing stays linear in them
pnpm tung    # a million triangles in, and how long that takes
pnpm ark     # cut sheets as images
pnpm look    # screenshots of the page, and any console errors
pnpm panel   # the controls in a real browser: both surfaces, gestures, keys
```

`probe` through `tak` are headless and fast, and `.github/workflows/vakter.yml`
runs every one of them on each push — the build first, since that is what
catches a worker shipped as raw TypeScript. Point `look` and `panel` at
`next start` on port 3210, never the dev server — they drive a real browser for
minutes, and HMR reloading underneath produces failures that look real.

| | |
|---|---|
| `lib/core.ts` | **start here.** The contract: parameters, metrics, rules, views |
| `lib/plan.ts` | what a plane is: name, point, normal, strokes (box, ellipse); the string; the grid and the vortex |
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
