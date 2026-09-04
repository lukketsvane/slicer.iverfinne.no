# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# slicerman — project specifics

## Language

The interface, every identifier and every code comment is **Norwegian nynorsk**.
Commit messages are nynorsk too. `README.md` is English, and stays English.
Do not translate code to English, and do not rename a nynorsk symbol because an
English one would read better to you.

## The contract

`lib/core.ts` is what everything else reads from: what a parameter is, what a
metric is, what a rule is, and the geometry the slicing, the measuring and the
cut files all share. It knows nothing about planes, cube or STL. A change that
teaches it about one of those is in the wrong file. `lib/plan.ts` is what a
cutting plane is — a name, a point, a normal and a bend in the body's space,
encoded as the `plan` string in the parameter bag — and it knows nothing about
meshes. A bent plane is a cylinder, not a plane: developable, so the part is
still cut flat, and the radius is limited by what the material takes. Bent
planes do not carry joints yet — two bent surfaces cross along a curve, and
that finder is not written; a hard rule says so.

Read `README.md` and `REBUILD.md` before changing behaviour. The decisions in
them are decisions, not accidents — the phone is the tool, a sketched plane is
invisible until locked, a locked plane stays where you put it, the view is a
decision and never a consequence of the geometry, names belong to
the part and never get reused, it is a laser tool with no cutter diameter,
colour is the operation and carries the order, kerf is taken exactly once,
slots are cut in the field and not in the polygon, and there are two colours
and no more.

## Verify with the harnesses, not by eye

Every number this tool prints is read off the geometry. So is every check:

```bash
pnpm sjekk    # tsc --noEmit
pnpm build    # webpack (never Turbopack), then guards that the worker bundled
pnpm probe    # engine without a browser: parts, joints, cut length, files
pnpm rekkje   # reads the cut files back: engrave, inner cuts, outline, in order
pnpm vrient   # meshes that aren't meshes, sliders at both ends, a hostile URL
pnpm ledd     # every joint the panel counted, found again in the cut profiles — grids and oblique planes
pnpm raad     # breaks each rule, presses the fix it offers, checks it worked
pnpm glb      # writes GLB files with known geometry and reads them back
npx tsx scripts/former.ts <namn>=<fil>   # a heavy model becomes a built-in form
pnpm pakk     # redraws every sheet and counts cells — catches overlaps
pnpm hand     # the plane list as a string: hostile input, one edit leaves the rest, names never reused
pnpm tak      # the plane ceiling: what 64 planes cost, and that slicing stays linear in them
pnpm tung     # a million triangles in, and how long that takes
pnpm ark      # cut sheets as images
pnpm look     # screenshots of the page, and any console errors
pnpm panel    # the controls in a real browser: both surfaces, gestures, keys
```

The headless ones (`probe` through `tak`) are fast and must stay green. Point
`pnpm look` and `pnpm panel` at `next start` on port 3210, never at the dev
server: they drive a real browser for minutes, and HMR reloading the page
underneath produces failures that look exactly like real ones.

Changing geometry, exports or rules without running the harness that covers it
is the one thing this project has no way to catch later.

## The one device

The iPhone 16e, saved to the home screen and opened standalone, is the only
target. Every control sits under one thumb, the primary action bottom-right.
The page never zooms (`maximum-scale=1`, `user-scalable=no`, `gesturestart`
prevented), never scrolls (html and body fixed, overscroll none, containers
contain), and lets nothing be selected or long-press-called-out (`user-select:
none` everywhere; the only caret is a focused number field; the settings text
is read-only with copy and paste buttons). A button is an icon or a word,
never both, and it is flat: no shadow, glow, gradient, blur, pulse, scale or
transition on a control — no ring and no filled pill either; a state is ink
against dimmed ink, and disabled is opacity. The interface speaks in words and
numbers, not sentences; only a rule's «why» gets one short sentence.

The one animation in the house is the **doze**: two seconds without a finger
and everything that is not the object fades out — top line, thumb column,
sheet, handles, view cube, sketch — and any movement brings it back. It is
one fade over the whole chrome, not an effect on a control, and while it is
gone the interface takes no touches. `pnpm panel` checks all of it; a change
that breaks one of these is wrong even if it looks fine on a laptop.

## Two traps

- **Turbopack ships the worker as raw TypeScript** into `static/media`. The
  worker then dies silently and the page just sits there. `pnpm build` forces
  webpack and fails if it happens anyway.
- **The main thread only draws.** All geometry belongs in `lib/worker.ts` and
  what it calls. A metric computed in a component is a metric that will drift
  from the cut file. The one thing the main thread computes is the sketch
  plane itself — a point and a normal from the camera — because that is the
  input, not a result.
