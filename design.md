# Sprouts Lab Design
Last updated: v0.9.1 (pure region query functions, checkInvariants)

## Philosophy

Keep the code simple.

Every version should add one idea.

The project should remain understandable by a single developer.

---

## Development Principles

- Build one small feature at a time.
- Keep the project working after every version.
- Separate game concepts from presentation.
- Prefer simple solutions over premature optimisation.
- Refactor when it improves clarity.

---

## Testing (`tests/`)

Introduced at v0.8.1. Uses Node's built-in `node:test` and
`node:assert` — zero npm dependencies. Run with `npm test`.

`tests/` mirrors the `js/` source layout exactly:
`tests/engine/rules.test.js` ↔ `js/engine/rules.js`,
`tests/engine/engine.test.js` ↔ `js/engine/engine.js`,
`tests/engine/reducer.test.js` ↔ `js/engine/reducer.js`,
`tests/engine/gameRecord.test.js` ↔ `js/engine/gameRecord.js`,
`tests/engine/regions.test.js` ↔ `js/engine/regions.js` (v0.9 — data
model only so far; see "Topological Model" below for the query and
mutation tests still to come). The test file for any source file is
always at the same relative path under `tests/`.

Only the pure, zero-DOM layer is covered this way: `engine/rules.js`,
`engine/engine.js`, `engine/reducer.js`, `engine/move.js`,
`engine/gameRecord.js`, `engine/regions.js`, and (candidates, not yet
written) `pathSimplify.js`, `crossingDetection.js`. `renderer.js`,
`ui.js`, `drawInteraction.js`, `boardView.js`, and `selectionState.js`
all touch the DOM directly and are out of scope for this harness — they
would need a DOM shim (e.g. jsdom) to run under Node, which hasn't
been added.

This is a useful validation of the architecture, not just a testing
convenience: `engine.js` and `rules.js` run and test correctly under
plain Node with no browser at all, which is exactly the property the
engine/browser separation (established at v0.5 with BoardView) was
supposed to guarantee. A future bot or replay system can rely on the
same modules these tests exercise directly, with no adaptation.

One gotcha worth knowing before adding more engine tests: `Engine`
(`js/engine/engine.js`) is a module-level singleton — a closed-over
`let engineState`, not a class instantiated fresh per test. Node
caches ES module imports within a process, so every `test()` in
`engine.test.js` shares the same `Engine` instance. Each test must
call `Engine.init(...)` first to establish a known state before
asserting anything.

This gotcha does NOT apply to `reducer.test.js` or `gameRecord.test.js`
(v0.8.6) — neither file imports `engine.js` at all. `reducer.test.js`
calls `applyMove()` directly against a locally-constructed state
object; `gameRecord.test.js` does the same to build its fixtures, and
`gameRecord.js` itself has no Engine dependency to test around (see
"Persistence" below for why). Only tests that specifically exercise
`Engine`'s own wrapper behaviour need the reset discipline.

---

## Architecture

```
UI  (ui.js)                              — orchestration, status, turn indicator
 │
 ├── DrawInteraction (drawInteraction.js) — pointer gesture, path validation
 │    ├── pathSimplify.js                 — Douglas-Peucker simplification
 │    ├── crossingDetection.js            — segment intersection, trimming
 │    └── constants.js                    — shared DOT_RADIUS and thresholds
 │
 ├── SelectionState  (selectionState.js)  — which dots the player has clicked
 │
 ├── BoardView       (boardView.js)       — browser-only visual state
 │     dot positions, edge paths
 │     never passed to the engine
 │
 ├── Engine          (engine/engine.js)   — stateful wrapper around reducer
 │    ├── Reducer      (engine/reducer.js)   — pure game state transitions
 │    └── Rules        (engine/rules.js)     — pure game rule functions
 │
 ├── GameRecord      (engine/gameRecord.js) — pure export/import; calls
 │    ├── Reducer      (engine/reducer.js)     reducer.js + rules.js DIRECTLY,
 │    └── Rules        (engine/rules.js)       never through the Engine singleton
 │
 ├── Regions         (engine/regions.js)   — combinatorial region model (stub)
 │
 └── Renderer        (renderer.js)        — SVG board
      reads from SelectionState and BoardView
      never reads from engine directly
      └── SVG

GameRecordUI (gameRecordUI.js)             — thin DOM layer, separate from ui.js
 ├── engine/gameRecord.js                  — pure export/import/replay
 ├── engine/engine.js                      — Engine.init(result.state) only
 │                                            after a successful import
 └── ui.js (loadImportedGame)              — visual rebuild
```

The engine layer contains only pure game logic.
It has no knowledge of the DOM, SVG, or UI interaction.

The browser is one client of the engine.
The same engine will eventually support replay, bots, and AI.

---

## Module Responsibilities

### SelectionState (`js/selectionState.js`)

Stores UI interaction state only — which dots the player has currently
selected as the first and second endpoints of a move in progress.

Also holds the initial dot layout so the renderer can position circles
on game start. This is the only time coordinates are computed outside
of boardView.

SelectionState does not know about the engine, game rules, or SVG.

---

### BoardView (`js/boardView.js`)

The browser's visual representation of the current game. A browser-only
concept — it does not exist in command-line, bot, or AI contexts.

Stores everything the renderer needs that the engine does not know:
- Screen position of every dot
- SVG path data for each move's drawn curve (v0.7+)

Player ownership is NOT stored here. Which player made a given move is
derivable from the move index via `engine/rules.js (playerForMove)`.
Storing it in boardView would duplicate game knowledge that the engine
already encodes implicitly through `currentPlayer` and the ordered move
history.

---

### Models (`js/models.js`)

Defines `createDot(id, x, y)` — the browser-side dot factory, including
screen coordinates. Used by `selectionState.js` only.

The Move model lives in `engine/move.js` because a Move is a pure engine
concept. `createDot` lives in `models.js` because it's a UI-layer
concern — dots as laid out on screen, not dots as the engine represents
them.

Engine dots (`{ id, lives }`, no `x`/`y`) are constructed inline in
`ui.js` and `gameRecord.js`, not via this factory. This wasn't always
true — `createDot` predates the v0.5 cleanup that gave engine dots their
coordinate-free shape — but the module's own header comment still
describes it as shared with "the engine layer," which is stale. Not
worth a standalone version bump to fix; noted here and flagged in
ROADMAP.md as a pre-v0.9.2 cleanup candidate, since `selectionState.js`
may already be under review by then.

---

### Engine (`js/engine/`)

The engine owns mathematical game state and the rules of Sprouts.

**`rules.js`** — pure game rule functions. This is the engine's single
source of truth for legality; any module that needs to ask a question
about the rules of Sprouts imports from here.

- `playerForMove(moveIndex)` — which player acts on a given move index.
  Used by the renderer to colour edges without owning the rule itself.
- `isExhausted(dot)` — whether a dot has no lives remaining. The one
  definition of exhaustion in the codebase; `ui.js` and `renderer.js`
  both call this rather than checking `dot.lives` inline.
- `validateMove(state, move)` — returns
  `{ ok, violations: [{ rule, dotId }, ...] }`. Checks dot existence
  and lives (self-loop needs ≥2 on the one dot involved; a normal
  move needs ≥1 on each of its two distinct endpoints, checked as
  mutually exclusive branches). Collects every applicable violation
  in one call rather than stopping at the first, so a doubly-invalid
  move — both endpoints simultaneously out of lives — is fully
  diagnosed in a single call. Deferred to v0.9/v1.0: crossings and
  regions will add more entries to the same violations array; the
  function's signature and return shape do not change when that
  happens.
- `RuleError` — coded violation reasons (`DOT_NOT_FOUND`,
  `INSUFFICIENT_LIVES`). The engine never emits English text; `ui.js`
  translates codes to player-facing strings via a local
  `VIOLATION_MESSAGES` map, so bots, replay, and tests never need to
  parse prose.
- Future: `hasLegalMoves(state)` — v1.0, game-over detection.

**`engine.js`** — stateful wrapper. Holds the current engine state and
exposes:
- `init(state)`
- `getState()`
- `validate(move)` — calls `rules.js`'s `validateMove` against the
  current state without mutating anything. Lets a caller (bot, or a
  UI-layer shortcut) cheaply ask "would this work" before committing.
- `apply(move)` — calls `validate()` first, visibly in the API rather
  than as a silent internal guard. On success, applies the reducer
  and returns `{ ok: true, state }`. On failure, internal state is
  left completely unchanged and the reducer is never invoked; returns
  `{ ok: false, violations }`. This makes `apply()` a safe,
  side-effect-free no-op for illegal input — important for a bot
  trying many candidate moves.

**`reducer.js`** — pure function. Takes a state and a move, returns a
new state. No DOM, no UI, no side effects. Same input always produces
same output. Assumes the move it receives is already legal — it
performs no validation itself and never will; `engine.js` guarantees
this by calling `validate()` before the reducer ever runs. Keeping the
reducer an unconditional state transition is what makes it easy to
reason about, test, and reuse for replay.

Every edge it creates carries `originatingMoveIndex` (v0.8.6) — the
position of the move that created it within this game's own move
history (`state.moves.length` at creation time). This is explicit
provenance, not a global move identifier: a move is an event within
one playthrough, not a mathematical entity with independent identity,
so the index is deliberately local/per-game, not a monotonic counter
like `nextDotId`. Before this, the only way to know which move
produced an edge was positional arithmetic (`floor(edgeIndex / 2)`),
duplicated in `renderer.js` and implicitly assumed by `boardView.js`'s
`edgePaths` map — now it's explicit data on the edge itself.

Current engine state shape:
```js
{
  dots:             [{ id, lives }, ...],
  edges:            [{ a, b, originatingMoveIndex }, ...],
  moves:            [{ startDotId, endDotId, regionId }, ...],
  nextDotId:        number,
  currentPlayer:    0 | 1,
  initialDotCount:  number,   // v0.8.5 — how many dots the game started with
  startingPlayer:   0 | 1,    // v0.8.5 — which player moved first
  regions:          [{ id, boundaries: [boundaryId, ...] }, ...],   // v0.9
  boundaries:       [{ id, vertices: [dotId, ...] }, ...],          // v0.9
  nextRegionId:     number,   // v0.9 — next unused region id
  nextBoundaryId:   number,   // v0.9 — next unused boundary id
}
```

`initialDotCount` and `startingPlayer` are set once at `Engine.init()`
and never change for the life of a game — the reducer's `...state`
spread carries them forward on every move automatically, without the
reducer needing to know they exist. They exist specifically so
`engine/gameRecord.js`'s `exportGame()` can read them directly rather
than trying to reverse-derive them from other fields (e.g. `currentPlayer`
and `moves.length`) via modular arithmetic that would be correct today
but fragile against any future rule change to turn alternation.

Note: engine dots have no x or y. Screen coordinates are not part of
the mathematical game state — they live in boardView.

**`move.js`** — `createMove(startDotId, endDotId, regionId = 0)` factory.
`regionId` identifies which region of the position the curve was drawn
through (see "Canonical Position Representation" below). Defaults to 0
because every position currently has exactly one region — `regionId`
now reflects a genuine computation (v0.9.1's real `getRegionForDot`),
just one whose answer hasn't had a reason to differ from 0 yet, since
mutation/splitting logic doesn't exist until v0.9.2.

**`regions.js`** — pure combinatorial region model. As of v0.9.1, this
holds real data (`regions`, `boundaries`, `nextRegionId`,
`nextBoundaryId` on engine state) and real query logic, but no
mutation logic yet — the topological model is real, correctly seeded,
and fully queryable, but nothing splits or merges it.
`buildInitialTopology(dotCount)` (v0.9) seeds the starting position:
one region containing one boundary PER DOT (not one shared boundary),
since a boundary is a cyclic walk along real edges and there are none
yet — see "Topological Model" below for why this matters.
`getBoundaryForDot`, `getRegionForDot` (real implementation, replacing
the v0.7/v0.9 stub), `areDotsInSameRegion`, `areDotsOnSameBoundary`,
`getBoundariesForRegion` (v0.9.1) are pure containment lookups.
`checkInvariants(state)` (v0.9.1) — `{ ok, violations }` shape
matching `validateMove`'s, with a `TopologyError` enum — checks
structural well-formedness including Euler's formula. Its Euler
coverage is currently tested only against states already known
correct; see "Topological Model" below for why. The splitting
algorithm itself is tracked separately in ROADMAP.md as v0.9.2/v0.9.3
— deliberately not bundled into this version.

**`gameRecord.js`** — pure export/import of Game Records (v0.8.5,
decoupled from `Engine` at v0.8.6). See "Persistence" below for the
full design. `exportGame(state)` / `exportGameToJSON(state)` read the
four persisted fields directly off engine state. `importGame(record)` /
`importGameFromJSON(json)` replay a record's moves by calling
`validateMove()` and `applyMove()` directly — the exact same pure
functions `Engine.apply()` itself calls internally — building a local
state object and returning it. This file does not import `engine.js`
at all, and has no effect on any live game unless the caller explicitly
acts on a successful result (see `gameRecordUI.js`).

**`canonical.js`**, **`hash.js`** — stubbed, for Phase 2.

The engine does not know about HTML or SVG. This allows the same engine
to be used for browser play, bots, AI, and command-line testing.

---

### Renderer (`js/renderer.js`)

Draws the board. Reads from SelectionState (for selection highlights)
and BoardView (for positions, paths, and player colours).

Does not modify game state. Does not import from the engine directly,
except `engine/rules.js`'s `playerForMove` (a pure rule function, not
the Engine singleton) to derive edge colours.

`renderEdges()` groups edges by `originatingMoveIndex` (v0.8.6) rather
than deriving that grouping from array position — see `reducer.js`'s
entry above for why the positional version was a latent risk.

Uses a retained element architecture — SVG circles are created once per
game and kept alive. Only CSS classes and attributes change on updates.
This avoids animation re-firing and unnecessary DOM churn.

---

### UI (`js/ui.js`)

Coordinates all other modules. Handles dot selection clicks, wires up
DrawInteraction callbacks, commits moves to the engine, syncs renderer
and status text. The only module that reads HTML elements directly.

Does not own drawing gesture mechanics (that's DrawInteraction) or
game rules (that's the engine). Applies two UI-layer interaction
shortcuts — exhausted dots cannot be selected, and a self-loop attempt
is checked via `Engine.validate()` before the player draws a whole
curve — but neither is an independent implementation of legality.
`Engine.apply()`'s internal `validateMove()` call is the actual source
of truth and would reject the same move regardless of whether either
shortcut ran or had a bug.

`commitMove()` checks `Engine.apply()`'s `result.ok` before any
BoardView or Renderer mutation. A rejected move — whether from the
UI-layer shortcut or a case only the engine catches — leaves no
partial visual trace, the same guarantee a drawing-geometry rejection
already provided.

A lives-insufficiency rejection (e.g. an illegal self-loop attempt)
clears the endpoint selection immediately rather than leaving it in
place, since — unlike a drawing-geometry rejection, where the same
retry might succeed — a dot's lives will not change on a second
attempt, so there is nothing to preserve.

---

### DrawInteraction (`js/drawInteraction.js`)

Owns ALL pointer interpretation on the board — both taps (dot
selection/deselection) and drags (curve drawing). Sampling always
starts on pointerdown; on pointerup, net movement decides whether the
gesture was a tap or a drag.

For a tap, `onTap(dotId)` is called so ui.js can run its own
selection/deselection logic. For a drag, the full simplify → validate
→ commit-or-reject pipeline runs (crossing detection, endpoint
distance, self-intersection), reporting via `onMoveDrawn` / `onReject`.

The module does NOT use the browser's native `click` event for game
logic. An earlier version relied on `click` firing after a tap that
was too short to count as a drag, but `setPointerCapture` was found to
unreliably redirect the click event's hit-testing target to the
capturing element across browsers — silently breaking dot deselection.
Owning tap detection directly, driven purely by measured pointer
movement, removes this dependency entirely.

Does not modify game state, update status text, or know about the
engine beyond reading existing edge paths from BoardView for crossing
checks.

---

### GameRecordUI (`js/gameRecordUI.js`)

Minimal browser-facing wiring for exporting/importing Game Records
(v0.8.5). Thin DOM layer only — reads/writes two textareas and two
buttons. All actual logic is delegated: `engine/gameRecord.js` for pure
export/import/replay, `ui.js`'s `loadImportedGame()` for rebuilding the
visible board after a successful import.

Since `gameRecord.js` no longer touches the `Engine` singleton at all
(v0.8.6), this file is the one place that decides whether a
successfully-imported record becomes the live game — it calls
`Engine.init(result.state)` itself, only after seeing
`result.ok === true`. A failed import was never applied to `Engine` in
the first place, so there's nothing to undo.

Kept as its own file rather than folded into `ui.js`, for the same
reason `drawInteraction.js` was split out at v0.7.1 — `ui.js` stays
focused on orchestrating the active game; this file owns one small,
separable concern and nothing else.

Translates `engine/gameRecord.js`'s coded `ImportError` values into
player-facing text locally, the same pattern `ui.js`'s
`VIOLATION_MESSAGES` uses for `RuleError` — the engine layer never
emits English strings.

---

### Constants (`js/constants.js`)

Shared numeric constants derived from the same underlying concept:
DOT_RADIUS (how big a dot is), DOT_CAPTURE_RADIUS (how close a drawn
curve must end to a dot), DOT_EXCLUSION_RADIUS (crossing-detection
skip zone around each dot). Centralised here so renderer.js and
drawInteraction.js derive from the same source instead of duplicating
magic numbers.

---

## Core Principle

The game state stores game concepts, not visual concepts.

Engine state stores dots (with lives), edges, moves, and whose turn it
is. It never stores SVG elements, colours, coordinates, or animations.

Visual concepts — where dots appear on screen, what paths edges follow,
which player's colour to use — live in boardView, not in the engine.

A dot is treated as exhausted when `lives <= 0` (via `Rules.isExhausted`),
not `lives === 0`. Before v0.8, a UI-layer rejection gap could let an
illegal move through and drive a dot's lives negative (e.g. an
insufficiently-checked self-loop); `<= 0` was a defensive measure to
stop such a dot from being reachable again. As of v0.8, `Engine.apply`
rejects any move that would do this before the reducer ever runs, so
lives should never actually go negative in normal operation — the
`<= 0` check remains as cheap, harmless defence-in-depth rather than
a load-bearing correctness fix.

---

## Long-term Goal

The browser is just one client of Sprouts Lab.

The long-term goal is that the game engine, bots, replay system, and
research tools all operate on the same underlying game model. BoardView
and the renderer are browser-specific layers on top of an engine that
knows nothing about screens.

---

## Canonical Position Representation

Before implementing v0.7, we researched published Sprouts implementations
to confirm what minimal data is needed to recognise two positions as the
same game state. The key reference is Čížek & Balko, "Implementation of
Sprouts: A Graph Drawing Game" (Graph Drawing 2021), which independently
arrives at the same two-layer separation this project already uses:

- A **graphical representation** — pixel/coordinate data, used for
  rendering and crossing detection. This is BoardView's role here.
- A **string representation (sr(P))** — a compact, purely combinatorial
  encoding used for canonical comparison, hashing, and search. This is
  the future role of `engine/canonical.js`.

Their finding directly relevant to this project: a move is not fully
described by its two endpoint dots once a position has more than one
region. The same two dots can be connected through different regions,
producing different game states. The region a curve passes through is
part of a move's topological identity, not just its endpoints — which
is why `engine/move.js` now carries a `regionId` field, even though it's
a stub value (0) until `engine/regions.js` becomes real at v0.9.

(Superseded for v0.9.2 onward: the v0.9.2 review found the corner, not
the region, is the fundamental datum — regionId is derivable from it.
See docs/specifications/topological-model.md §7 and the review banner
under "Topological Model" below.)

Their canonical string structure, summarised: positions split into
independent **lands**; each land contains **regions**; each region
contains one or more **boundaries** (a region can have multiple
disconnected pieces of graph sitting inside it, e.g. a free dot floating
in an otherwise-empty region); each boundary is a cyclic sequence of
vertex visits. This is the target shape for `engine/canonical.js` at v0.9
— no coordinates anywhere, just vertex identity and boundary structure.

## Drawing Approach (v0.7)

We considered three ways to implement curve drawing:

1. **Pure freehand, retrospective check** — draw normally, validate after
   release.
2. **Live-constrained ("guided freehand")** — the curve cannot be drawn
   past the boundary of the current region; checked continuously during
   the gesture.
3. **Template-based guided drawing** — system proposes a pre-shaped legal
   curve between two clicked dots.

We chose **option 1**. Option 2 would have required a real-time,
continuously-queryable geometric region boundary (a new browser-side
module), which is meaningfully more complex than a one-time check after
the gesture completes, and that complexity is specific to "guided
freehand" rather than something v0.9 would need anyway. Option 1's
crossing-check code is identical to what v0.9 will need once real
regions exist — only what it's checked against changes (a flat edge
list now, a region boundary later) — so nothing here is throwaway.

This produced two new browser-side pure-geometry files, used by `ui.js`
but living outside both `engine/` and `boardView.js` since they contain
no game knowledge and no persistent state:

- **`js/pathSimplify.js`** — Douglas-Peucker simplification of raw
  pointer-sampled points into a clean curve.
- **`js/crossingDetection.js`** — segment intersection tests: does a
  candidate path cross any existing path, or itself. Includes
  `trimNearPoints()` for excluding dot-radius zones from checks.
- **`js/drawInteraction.js`** — owns the full pointer gesture lifecycle
  (pointerdown/move/up), path validation pipeline, and movement-based
  tap-vs-drag classification. Reports results to ui.js via callbacks.
- **`js/constants.js`** — shared DOT_RADIUS and derived thresholds.

Path endpoints are snapped to exact dot centers on commit, so every
stored path begins and ends precisely at a dot's position regardless
of where within the dot's radius the player clicked. This improves
both visual tidiness and crossing-detection accuracy.

---

## Persistence (v0.8.5)

### A Game Record describes a game, not an engine snapshot

The persisted format is a **Game Record** — a description of what
happened in a game — not a serialized snapshot of the engine's internal
state at one moment. This distinction matters: the engine's internal
representation is an implementation detail that has already changed
several times (v0.5 removed coordinates from engine dots; v0.7 added
`regionId`; v0.9 will add region/boundary tracking) and will keep
changing. A persistence format tied to that representation would need
migration logic every time it does. A format that only describes the
game's actual parameters and the sequence of moves made does not.

The persisted shape:
```js
{
  formatVersion:   1,
  initialDotCount: number,
  startingPlayer:  0 | 1,
  moves:           [{ startDotId, endDotId, regionId }, ...],
}
```

Deliberately **not** persisted: `dots`, `edges`, `nextDotId`,
`currentPlayer`. All four are fully derivable by replaying `moves`
through the real engine starting from `initialDotCount`/`startingPlayer`
— storing them would be storing the same information twice, in a form
tied to the engine's current shape rather than the game's actual
description. If a future performance need ever justifies it (very long
games making full replay costly), an optional snapshot cache could be
added as an addition to the format, not a replacement for this
principle — not currently justified, since engine state stays simple
through at least v0.9.

**Why `initialDotCount` is a bare integer, not a dot array.** In classic
Sprouts the starting position is entirely defined by the rules — N dots,
each with 3 lives — given one number. An array of `{ id, lives }`
objects would be recording something derivable, dressed up as if it
were data: exactly the "mirroring the engine's internal representation"
the Game Record format exists to avoid. A future variant with genuinely
custom starting positions (not currently planned) would add a new
`startingPosition`/`game` section to the format, rather than promoting
this field into something it was never meant to describe.

### Import replays through the real rules, not a parallel validator

`importGame()` does not re-implement legality checking. It replays every
move in the record by calling `validateMove()` and `applyMove()`
directly — the exact same pure functions `Engine.apply()` itself calls
internally — so a Game Record's legality is checked by exactly one
implementation of the rules, the same one that already rejects an
illegal move drawn by a human player. There is deliberately no second,
independent notion of "is this move sequence legal" anywhere in the
codebase.

`importGame()` never touches the `Engine` singleton (v0.8.6 — see
"Architecture" above). It builds a local state object and returns it,
on success or failure, with zero effect on whatever game happens to be
live in the browser. This means it's safe to call repeatedly with
different records — e.g. a database validating many stored games, or a
bot exploring several hypothetical continuations — with no risk of one
call's replay leaking into another's, and no risk of a legal-but-
unwanted import silently overwriting a game in progress. Whether a
successful import becomes the live game is an explicit, separate
decision made by the caller (`gameRecordUI.js`), not something
`importGame()` decides on its own.

An earlier version of this function called `Engine.init()`/
`Engine.apply()` directly against the shared singleton, snapshotting
and restoring it if a move turned out illegal. That protected the
failure case but not the success case — a legal import would still
silently become the live game. Operating on local state throughout
removes the asymmetry entirely, rather than patching around it.

### Rendering an imported game has no original geometry to restore

A Game Record deliberately stores no drawn curve geometry — only
topology. Loading one therefore cannot reproduce the original hand-drawn
curves, because that information was never captured. `ui.js`'s
`loadImportedGame()` invents placeholder geometry instead: initial dots
use the same even-row layout as a fresh game, and each sprout is placed
at the straight-line midpoint of its move's two endpoints, computed in
move order. Edges render as straight lines entirely through
`renderer.js`'s existing "no recorded path" fallback in `renderEdges()`
— built defensively back at v0.7 for a case that hadn't occurred yet,
now serving its first real purpose.


---

## Topological Model (v0.9)

### v0.9.2 pre-implementation review — see the specification

The literature verification pass required before v0.9.2 was completed
in July 2026 and grew into a full architectural review. Its outcome is
a normative specification:

    docs/specifications/topological-model.md
    (draft — pending tech lead approval)

The specification supersedes the topological portions of this section
for v0.9.2 onward. The subsections below are retained as design
history — they record what was believed at v0.9/v0.9.1 and why — but
several of their claims are now known to be superseded or wrong:

- **"Every dot belongs to exactly one boundary" is false once any dot
  has degree ≥ 1.** A degree-d vertex has d occurrences (corners)
  across boundary walks, and they can lie on different boundaries.
  It held at v0.9.1 only because every dot had degree 0. See spec
  §5 (D3), §13.
- **The boundary-orientation open question is resolved** (inner
  boundaries clockwise, border boundary counterclockwise; every edge
  borders two boundary-sides via its two darts). Spec §2.4, §11.2.
- **Self-loops are the degenerate single-boundary case**, not a
  separate operation. Spec §8.1–8.2.
- **The lands question is closed: lands are derived**, not engine
  state. Spec D8.
- **`Move {startDotId, endDotId, regionId}` is superseded** — one
  derived field too many, two fundamental components (corners,
  placement) missing. Spec §7. This also supersedes the
  "regionId is part of a move's topological identity" framing under
  "Canonical Position Representation" above: the region is derivable
  from the corner, so the corner subsumes the field.
- **Split and merge are one uniform σ-operation** in the spec's model;
  their differences live in containment reconciliation and derived
  structure, not in separate mutation algorithms. The "two operations,
  not one algorithm" framing below described the walk-primary model
  and does not carry over. Spec §8.

### From graph to embedded planar graph

Through v0.8.x the engine represented a plain graph: vertices and
edges, nothing more. v0.9 begins moving it to an **embedded planar
graph** — vertices, edges, faces (regions), and boundary cycles. This
is a different kind of mathematical object, not a richer version of
the same one. Concepts like Euler's formula, face-counting, and
boundary traversal only have meaning once an embedding exists; they
don't generalise from the plain-graph model at all. Every reducer
change from v0.9 onward operates on this different object, which is
why the v0.8.6 architecture review's note about the reducer's "flat,
easy-to-audit character" not surviving unchanged is treated as a
structural warning, not a minor caveat.

### Why v0.9 was unbundled into sub-versions

The original plan bundled four distinct mathematical capabilities
into one version: the data model, pure query functions, the
mutation/splitting algorithm, and region-aware legality. A design
review concluded these are separate problems and should be separate
milestones — see ROADMAP.md's v0.9/v0.9.1/v0.9.2/v0.9.3 breakdown for
the full scope of each.

The load-bearing reason, not just "keep versions small": **putting
pure queries (v0.9.1) before mutation (v0.9.2) gives an independent
verification oracle for the hard algorithm before the hard algorithm
exists.** v0.9.1's queries get tested against hand-constructed
multi-region fixtures — built by hand, never produced by any
splitting algorithm, since none will exist yet. When v0.9.2's
algorithm is written, its output is checked against v0.9.1's
already-trusted queries, rather than needing to trust the queries and
the algorithm simultaneously.

Canonical string encoding (`canonical.js`) was deliberately kept
entirely out of Phase 1, not just sequenced later within it — see
Phase 2 in ROADMAP.md. There's no useful canonical-form work possible
against a topology that's always exactly one region, so this is a
hard dependency on v0.9.2 existing and being trustworthy, not a
scheduling preference.

### Starting topology: one boundary per dot, not one shared boundary

`buildInitialTopology(dotCount)` (v0.9) seeds every fresh game with
**one region containing one boundary per dot**, each boundary of
length 1 — not one boundary holding every dot. A boundary is a cyclic
walk along real edges. With zero edges at game start there is no walk
connecting separate dots into anything, so each isolated dot is
trivially its own boundary.

This isn't a minor implementation detail — it's required for Euler's
formula to hold at the starting position, which is the first thing
v0.9.1's invariant checker will verify: `V − E + F = 1 + C`, where `C`
is the number of connected components. At game start, `V = N` (dots),
`E = 0`, `C = N` (each isolated dot is its own component), `F = 1`
(one region). Checking: `1 + N = N − 0 + 1` holds. `C = N` requires
`N` boundaries to exist, not one — seeding one shared boundary would
make this invariant fail on the very first position anyone checks it
against.

### A fixture-construction failure that confirmed the open question (v0.9.1)

While designing v0.9.1's tests, two hand-built "multi-region" fixtures
turned out, on inspection, to be invalid planar structures — not just
wrong test data, but genuinely impossible configurations.

The first: two isolated dots modelled as two separate regions. Wrong —
isolated points enclose nothing, so they can't be separate faces at
all. This is exactly what `buildInitialTopology` already gets right:
one region, multiple trivial boundaries, never multiple regions for
disconnected points with no enclosing structure.

The second, more instructive: a triangle (one boundary, three dots)
plus a fourth, floating dot placed inside the same declared region.
Working through Euler's formula by hand for this fixture failed
immediately — a triangle alone divides the plane into an inside face
and an outside face, `F = 2`, not the `F = 1` first assumed. Correctly
placing the fourth dot into whichever of those two faces it actually
sits in — and correctly modelling the triangle's boundary once as the
*inside* face's boundary and once, walked in the opposite direction,
as part of the *outside* face's boundary — requires resolving exactly
the question already flagged above as unverified: whether every edge
borders two boundary-sides, traversed in opposite directions by each
side's face.

Rather than encode an unverified guess about that convention into a
trusted test, v0.9.1's `checkInvariants` Euler's-formula coverage was
scoped down to states already known correct (the seeded starting
topology, several dot counts) instead of a hand-built multi-region
example. Real multi-region Euler coverage is deferred to v0.9.2, where
it can be checked against a state the splitting algorithm actually
produces and cross-validated against the literature once, rather than
invented by hand under uncertainty now. The five pure lookup functions
(`getBoundaryForDot`, `getRegionForDot`, `areDotsInSameRegion`,
`areDotsOnSameBoundary`, `getBoundariesForRegion`) don't have this
problem — they're containment queries, correct for any structurally
well-formed input regardless of whether it represents a valid
embedding, so they were tested against simple hand-built fixtures
without needing the convention resolved first.

### Split vs. merge — two operations, not one algorithm

Recalled from the Čížek & Balko paper (Graph Drawing 2021) and
scheduled for re-verification before v0.9.2 is implemented, not taken
on faith: a move within a region is one of two topologically distinct
operations.

- **Single-boundary move** — both endpoints already lie on the same
  boundary. This SPLITS that boundary, and its region, into two.
- **Double-boundary move** — the endpoints lie on two *different*
  boundaries within the same region. This MERGES those two boundaries
  into one, with no region split at all.

These aren't variations of one function with a branch inside — they
have different topological effects and should get independent
design, independent tests, and independent verification against the
source material. v0.9.2's plan is to implement and fully test the
split case first, then the merge case, each checked against v0.9.1's
`checkInvariants` before moving on.

Whether a self-loop reduces to the single-boundary case naturally, or
needs distinct handling the way it already does for lives arithmetic
in `reducer.js` (`isLoop` branch), is an open question for the
literature pass, not yet assumed either way.

### Essential invariants (destination: v0.9.1's `checkInvariants`)

Split by confidence, since "don't implement from memory" applies here
too:

**General graph theory, confident without re-verification:**
- Euler's formula `V − E + F = 1 + C`, checked after every mutation
- Every dot belongs to exactly one boundary — never zero, never more
  than one
- Every boundary belongs to exactly one region
- A boundary's cyclic vertex sequence corresponds to a real closed
  walk along edges that actually exist — not an arbitrary list that
  happens to include the right vertices
- The existing total-lives invariant (v0.8.6: total lives across all
  dots decreases by exactly 1 per move) — orthogonal to topology, but
  worth re-asserting as a cross-check once mutation logic touches the
  same reducer function, since it was correct before regions existed
  and has no reason to stop being correct now

**Needs the literature pass to confirm precisely:**
- Exact bookkeeping convention for how self-loops and trivial
  single-vertex boundaries factor into Euler's formula in degenerate
  cases
- Whether every edge borders exactly two region-sides (standard
  planar embedding convention) or whether a Sprouts-specific
  structure (e.g. a bridge edge) needs special treatment
- The precise structural mechanics of the split/merge distinction
  above
- Whether "lands" (independent connected components) belong in the
  engine's topological model at all, or are better understood as a
  canonicalisation-layer concept (expressing a position as a sum of
  independent subgames) that the engine itself doesn't need to track
