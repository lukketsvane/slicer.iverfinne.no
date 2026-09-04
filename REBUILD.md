# Rebuild brief

For a team starting slicerman again from nothing. What we are making, the one idea
the whole thing turns on, what to carry over, and what to decide early.

---

## What we are making

**The ultimate nesting designer for laser cutting.** Not a mesh-to-DXF converter with a
nesting step bolted on. A design tool where laying out the parts *is* the design work:
you decide where the material is cut, you place the parts on the sheet, and the machine
file falls out of what you drew. Everything else in the tool exists to serve that.

## Who it is for, on what

**The iPhone 16e is the target device.** Not "responsive", not "works on mobile too".
The phone is the tool; a desktop browser is a convenience that happens to also work.
Every gesture, every control and every readout is designed for one thumb on a 390-point
screen with the object visible while you work. If a feature only makes sense with a mouse
and a keyboard, it is not finished.

## How big it should be

**A full refactor, at a fraction of the code.** Today:

    lib           8 653 lines   34 files
    components    5 238 lines    7 files
    app             432 lines    4 files
    -----------------------------------
    source       14 323 lines
    harnesses     5 787 lines   15 files

Of the source, roughly 5 400 lines are comments. That is deliberate and much of it is
worth keeping as knowledge, but it sits on top of a structure that grew by accretion:
one file of 2 395 lines holds the scene and every gesture in it, another of 1 321 holds the
whole application state. The rebuild should land far below this, and the reduction should come
from a simpler model, not from deleting the reasoning.

Aim for **under a third of the current source**. The single largest saving is item 1
below: when planes are one kind of object with one list, the grid machinery, the lock
machinery, the pin machinery and the per-axis special cases all collapse into it.

---

## The one idea

**Today you choose two numbers.** Ribs across, ribs along. Everything else follows from
the mesh. Fast to get *something*, impossible to get *this* thing.

**After the rebuild you sketch each plane, and keep the ones you want.** Pinch, pan and
twist place a cut where you are looking. Lock it and it becomes a real part. The grid
survives only as a first guess you can take or leave.

While sketching, the plane swings with the view and nothing is built yet. Once locked,
the view keeps turning and the plane stays where you put it. The whole rebuild is that
difference.

---

## Ten decisions it turns on

**1. Gestures are sketching, not settings.**
Pinch, pan and twist place a cutting plane in the view you are holding. It is quick,
throwaway, and costs nothing to try. You find the object by moving your hand, not by
typing counts into a form.

**2. A sketched plane is invisible everywhere else.**
No address, no part, no row in the stack, no line in the cut list, nothing on a sheet.
Until you keep it, it does not exist. The stack today is full of things nobody chose,
and that is why it reads as noise.

**3. Locking is the moment something is made.**
One deliberate act turns a sketch into a part: it gains an identity, a profile, a place
in the assembly and a row you can return to. Everything downstream keys off that act.

**4. A locked plane stays where you put it.**
It belongs to the object, not to the camera. Turn the model, sketch from a new angle,
lock again. Repeat, and you have a set of planes at angles no grid could describe. If
locked planes drift when the view moves, the idea collapses.

**5. Any two planes that cross can lock together.**
Joints come from planes meeting in space, not from rows meeting columns. Slot direction
and assembly order follow from that same web of crossings, so the tool can still say what
goes in first when the set is irregular.

**6. Every kept plane is editable, down to its outline.** *— and symmetry respects it.*
The mirror switches make cuts and then let go: what they produce are ordinary planes with
ordinary names, each movable, re-angleable, maskable and deletable on its own. A symmetry
that stayed attached would have to share one name between two parts, and decision 7 is what
that would break.
Nudge it, re-angle it, and redraw the shape itself. What the mesh gives you is a starting
proposal, not a verdict: thicken a leg, straighten a base, cut a hole for a cable. This is
what makes it a design tool rather than a converter.

**7. Names belong to the part, not to its position.**
`X3` means "third rib across" and breaks the moment planes are arbitrary. A part needs a
name it keeps while it is moved, re-angled and re-drawn, because that name is engraved on
it and read off it in a pile on a workbench.

**8. The automatic answers become proposals.** *— went further since: they were removed.*
The grid and the long search were made into suggestions, and then the search was deleted
outright. Ranking a dozen grids answered a question nobody had asked: the two numbers were
never the hard part. What replaced it is a **tool** — two fingers set columns and rows
directly, and the grid it writes is a list like any other, one step in undo. The principle
holds and is stronger for it: deciding for you is not the tool's job, and neither is
guessing what you would have decided.

**9. The phone is the tool, not the preview.**
See above. It is repeated here because it is the first thing a rebuild forgets.

**10. The output half is done — carry it across intact.**
Sheets, kerf, engraved names, assembly order, the share sheet. It works, it has been
measured, and it is the part a rebuild is most likely to quietly break. Treat it as
inherited, not as something to redo.

---

## Carry over without arguing

- **It is a laser, not a mill.** No tool diameter. Cut width is taken exactly once, and
  the file says which side took it.
- **Colour is the operation.** Two colours, no more: one cuts, one engraves, and the order
  is in the colour.
- **The sheet is the file.** What you see on screen is what the machine gets, engraved
  names included. It is a full view and not a panel: laying out the parts is the design
  work, so it gets the whole screen, and it is the only place the plates are drawn.
- **Every number is measured.** Parts, joints, cut length, how much of the shape survives:
  read off the geometry, never estimated.
- **Geometry never runs on the drawing thread.** A frozen screen reads as a crash, and
  slicing takes seconds.
- **The harnesses are the memory.** They record why things are the way they are. Port them
  before porting features — and they may not shrink, that is fine.
- **Nynorsk throughout.** Interface, identifiers, comments and commit messages. This file
  and the README are the exception.

## Answered since

**What happens to a hand-drawn outline when the model changes underneath it?**
*The mark stands.* It sits in the plane's own frame as a fraction of the size, so it
follows the body when the body is scaled — but when the *mesh* changes under it, it is
kept exactly where you put it and allowed to drift out of true. The tool does not throw
away work without being asked; you see the drift in the profile and remove it yourself.
Written down in `lib/plan.ts`.

**How far can a plane travel before it is a different part?**
*Any distance.* The name is a number given at the moment of locking and never reused, so
a part keeps its name while it is moved, re-angled and redrawn. There is no threshold,
because a threshold is the thing that would break the pile-on-a-workbench test.

**How many hand-placed planes before a phone gives up?**
*Measured: around forty.* `pnpm tak` sweeps the count on a 200 mm sphere and reports two
coefficients — roughly **15 ms per plane sliced** and **1.5 ms per joint**, the second of
which is quadratic in the plane count because every pair that crosses must find its
joints. So one geometry change costs about 0.8 s at 32 planes and **2.0 s at the ceiling
of 64**, on a workstation; a phone is three to five times that. Below about forty planes
an edit stays under a second there and remains a conversation; above it you are waiting.
The list is capped at 64 and **says so** when you reach it. That is the number the editing
model has to be ambitious within — and `pnpm tak` now fails if slicing ever stops being
linear in the plane count, which is the one regression here that would look like nothing
at all.

**Does a sketch survive a reload?**
*No, and deliberately.* Unlocked work is disposable: it costs one gesture to make again,
and keeping it would mean a sketch could outlive the view it was made in.

## Open

Nothing from the original four. They are all answered above, three of them by decisions
already written into the code and one by measurement. A rebuild inherits the answers, not
the questions.
