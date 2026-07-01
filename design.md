# Sprouts Lab Design
Last updated: v0.7.1 (self-loop deselect fix, discoverability hint)

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
 │    ├── Reducer    (engine/reducer.js)  — pure game state transitions
 │    ├── Rules      (engine/rules.js)    — pure game rule functions
 │    └── Regions    (engine/regions.js)  — combinatorial region model (stub)
 │
 └── Renderer        (renderer.js)        — SVG board
      reads from SelectionState and BoardView
      never reads from engine directly
      └── SVG
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

Defines `createDot` — the shared dot factory used by SelectionState and
the engine layer.

The Move model lives in `engine/move.js` because a Move is a pure engine
concept. createDot lives in models.js because dots are shared between
the UI layer (layout) and the engine (game state).

---

### Engine (`js/engine/`)

The engine owns mathematical game state and the rules of Sprouts.

**`rules.js`** — pure game rule functions. Currently exports `playerForMove(moveIndex)`. Future home for `isMoveLegal`, `isExhausted`, and `hasLegalMoves`. Any module that needs to ask a question about the rules of Sprouts imports from here — including the renderer, which uses `playerForMove` to colour edges without owning the rule itself.

**`engine.js`** — stateful wrapper. Holds the current engine state and
exposes `init(state)`, `apply(move)`, and `getState()`.

**`reducer.js`** — pure function. Takes a state and a move, returns a
new state. No DOM, no UI, no side effects. Same input always produces
same output. This is the foundation for replay, bots, and AI.

Current engine state shape:
```js
{
  dots:          [{ id, lives }, ...],
  edges:         [{ a, b }, ...],
  moves:         [{ startDotId, endDotId }, ...],
  nextDotId:     number,
  currentPlayer: 0 | 1,
}
```

Note: engine dots have no x or y. Screen coordinates are not part of
the mathematical game state — they live in boardView.

**`move.js`** — `createMove(startDotId, endDotId, regionId = 0)` factory.
`regionId` identifies which region of the position the curve was drawn
through (see "Canonical Position Representation" below). Defaults to 0
since `engine/regions.js` is currently a stub.

**`regions.js`** — pure combinatorial region model. v0.7: a stub —
`getRegionForDot()` always returns 0, since no move has yet split the
single starting region. The interface is stable now so v0.9 only needs
to replace the function body with real region-splitting logic; no other
file needs to change shape when that happens.

**`canonical.js`**, **`hash.js`** — stubbed, for Phase 2.

The engine does not know about HTML or SVG. This allows the same engine
to be used for browser play, bots, AI, and command-line testing.

---

### Renderer (`js/renderer.js`)

Draws the board. Reads from SelectionState (for selection highlights)
and BoardView (for positions, paths, and player colours).

Does not modify game state. Does not import from the engine directly.

Uses a retained element architecture — SVG circles are created once per
game and kept alive. Only CSS classes and attributes change on updates.
This avoids animation re-firing and unnecessary DOM churn.

---

### UI (`js/ui.js`)

Coordinates all other modules. Handles dot selection clicks, wires up
DrawInteraction callbacks, commits moves to the engine, syncs renderer
and status text. The only module that reads HTML elements directly.

Does not own drawing gesture mechanics (that's DrawInteraction) or
game rules (that's the engine). Currently applies two UI-layer
courtesy guards — exhausted dots (lives ≤ 0) cannot be selected, and a
self-loop cannot be attempted on a dot with fewer than 2 lives — but
neither is a substitute for engine validation (v0.8).

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

A dot is treated as exhausted when `lives <= 0`, not `lives === 0`.
Until v0.8 adds real engine-level legality enforcement, a UI-layer
rejection gap can allow lives to go negative (e.g. an insufficiently-
checked self-loop). Using `<= 0` for the exhausted check means such a
dot is still correctly locked out of further selection even though the
one illegal move that caused it already went through.

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
