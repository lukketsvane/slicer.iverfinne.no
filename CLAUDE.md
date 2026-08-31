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
cut files all share. It knows nothing about waffle, cube or STL. A change that
teaches it about one of those is in the wrong file.

Read `README.md` before changing behaviour. The decisions in it are decisions,
not accidents — it is a laser tool with no cutter diameter, colour is the
operation and carries the order, kerf is taken exactly once, slots are cut in
the field and not in the polygon, and there are two colours and no more.

## Verify with the harnesses, not by eye

Every number this tool prints is read off the geometry. So is every check:

```bash
pnpm sjekk    # tsc --noEmit
pnpm build    # webpack (never Turbopack), then guards that the worker bundled
pnpm probe    # engine without a browser: parts, joints, cut length, files
pnpm rekkje   # reads the cut files back: engrave, inner cuts, outline, in order
pnpm vrient   # meshes that aren't meshes, sliders at both ends, a hostile URL
pnpm ledd     # every joint the panel counted, found again in the cut profiles
pnpm raad     # breaks each rule, presses the fix it offers, checks it worked
pnpm glb      # writes GLB files with known geometry and reads them back
pnpm pakk     # redraws every sheet and counts cells — catches overlaps
pnpm djup     # the deep search: the profile measures shape, the answers are real
pnpm tung     # a million triangles in, and how long that takes
pnpm ark      # cut sheets as images
pnpm look     # screenshots of the page, and any console errors
pnpm panel    # the controls in a real browser: both surfaces, gestures, keys
```

The headless ones (`probe` through `djup`) are fast and must stay green. Point
`pnpm look` and `pnpm panel` at `next start` on port 3210, never at the dev
server: they drive a real browser for minutes, and HMR reloading the page
underneath produces failures that look exactly like real ones.

Changing geometry, exports or rules without running the harness that covers it
is the one thing this project has no way to catch later.

## Two traps

- **Turbopack ships the worker as raw TypeScript** into `static/media`. The
  worker then dies silently and the page just sits there. `pnpm build` forces
  webpack and fails if it happens anyway.
- **The main thread only draws.** All geometry belongs in `lib/worker.ts` and
  what it calls. A metric computed in a component is a metric that will drift
  from the cut file.
