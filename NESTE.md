# Next session

Found by testing the build at `975babb..4319567`, not by reading. Ordered by
what it costs a person at the bench. Everything below was reproduced in a real
browser at 390×844; nothing here is a guess.

---

## 1. The dozing chrome is invisible and still takes taps — and one of them cuts

**This is a bug, and it is the one to fix first.** The rule is written down in
three places: *while it is gone the interface takes no touches; the first tap
wakes and does nothing else.* It does not hold.

`main[data-sov] .tumme { pointer-events: none }` (`app/globals.css:641`) is
overridden from below: `.tumme > * { pointer-events: auto }` (`:442`) puts the
children back in the hit test, and a parent's `none` does not survive a
descendant's `auto`. Same shape in `.handtak [data-handtak]`, `.sider button`,
`.spor button`, `.punkt button`. Only the sheet is properly inert.

Measured, from a cold load with no plane cut: let it doze 3 s, tap where `skjer`
sits, **0 → 1 plan**. A cut you did not ask for, on a screen showing nothing.
The sketch handle is live under your finger the same way.

Fix is a few lines of CSS (`main[data-sov] .tumme > *`, and the four siblings),
and it wants a harness check — `pnpm panel skalet` already drives the doze, so
the check belongs there: doze, tap each overlay, require nothing happened.

## 2. `kvile` should not call the montage rest

`components/studio.tsx:2065` excludes `kontur` from the doze but not
`montasje`. Measured: the tab does not doze at 1.2 s, does at 3.8 s — which is
in the middle of the animation, with its only control fading out. Watching
something move is not rest. Add `view !== "montasje"`, or hold it off while
`montSpel` is true.

---

## 3. The montage tab has the picture but not the note

This is the biggest *unfinished* thing, rather than the most broken.

`montering.txt` (`lib/motor.ts:105`) already writes exactly what a person needs
while assembling: order, the address engraved on the part, the direction it
comes in (`ned`, `frå sida`), and which already-placed parts it meets. Today it
exists only inside the ALT zip — so the phone in your hand shows the motion, and
the words are in a file on a laptop.

`MontDel` (`lib/montasje.ts:43`) already carries `adr`, `steg` and `ark`. It
does **not** carry the direction; that is `snitt.montering.retning[id]`, which
the engine computes and only ever renders into text. Adding one field to the
montage payload would let the sheet in the montage tab list the current step's
parts by address and direction, and scroll as the animation passes each step.

That also fixes **4** below, because it gives the sheet something true to show.

## 4. The plane list is a dead end in the montage

Measured: open the montage, open the sheet, tap a plane row. The row marks
itself selected, and nothing happens anywhere — the thumb column stays at
`["steget"]` (correctly: the montage changes nothing). So the sheet still offers
a selection the tab cannot honour. The list is the room's content. Replace it
with the step list (item 3) while `view === "montasje"`.

## 5. Leaving the montage forgets where you came from

`romsyn` (`components/studio.tsx:243`) tracks the last *room* view. Measured:
`kontur` → `M` → `Esc` lands in `lag`. Either track the last view of any kind,
or say plainly that the montage always returns to the room. Two lines either
way; the point is to pick one on purpose.

---

## 6. `toFingrar` lands both fingers in the same event, and a hand never does

`scripts/panel.ts:127` dispatches one `touchStart` carrying both points. That is
fine when both belong to one gesture — but it is not how a hand works, and it is
why the side-dot camera bug lived through a green harness for as long as it did.

Give it a `lag` parameter: first finger down, *n* frames of movement, then the
second. Then re-run the existing two-finger sections through it. I already
checked the sketch gesture and the grid at 0, 6 and 14 frames of lag — both hold
— so this is cheap insurance rather than a hunt, but it is the kind of insurance
that paid once already today.

## 7. The room is still built when nobody can see it

`components/studio.tsx:827` runs `bygg("lag", "lav")` plus a debounced
`bygg("lag", detail)` on every parameter change, in **every** view. In `kontur`
the canvas is hidden; in `montasje` the scene draws `Montasjen` instead. The
metrics line comes from a separate `maal` request, so nothing on screen depends
on it there.

It is the same rule this session applied to buttons, applied to work: don't
compute what the tab can't show. Skip it when `!rom` and build once on the way
back in. Worth measuring before and after — on this container a notch of the
size slider cost ~460 ms in `lag` and ~200 ms in `montasje`, but container
numbers are not phone numbers, so measure on the device.

---

## 8. Smaller

- **The empty montage says nothing.** No planes → a blank screen and `steg 1/1 ·
  0`. Say `ingen delar`, the way the sheet's line already does.
- **Tapping a part in the montage does nothing.** Measured. It is the obvious
  gesture in that tab: tap a rib, get its address and the step it belongs to.
  Pairs with item 3.
- **The four views are buttons, not a tablist.** `components/toppline.tsx:149`.
  VoiceOver reads four toggle buttons instead of "tab 2 of 4". `role="tablist"` /
  `role="tab"` / `aria-selected` costs nothing and is true.
- **`pnpm panel` is 364 s and `telefon` is 160 s of it.** CLAUDE.md already says
  to run one section while iterating; `telefon` is now big enough that it is
  worth splitting the body tool out of it into its own section.
