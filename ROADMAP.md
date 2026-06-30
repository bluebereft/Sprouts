# Sprouts Lab Roadmap

## Vision

Build a browser-based implementation of Sprouts that evolves into a research platform for:

- Playing Sprouts
- Saving and replaying games
- Canonical topological representation
- Database of unique positions
- Bot development
- Self-play
- AI strategy discovery

## Development Principles

- Build one small feature at a time.
- Keep the architecture modular.
- Separate UI, rendering, state and engine.
- Prefer simple solutions over premature optimisation.
- Every version should leave the project in a working state.

---

## Phase 1 - Browser Game

### v0.1 ✅
- Initial board
- Draw starting dots

### v0.2 ✅
- Dot selection (single dot, toggle)
- Renderer optimisation — retained element architecture, no redraw flicker
- Visual design refresh — warm palette, Inter font, pill controls
- Modular JavaScript architecture — models, state, renderer, ui, app

### v0.3 ✅
- Two-endpoint selection (first and second dot)
- Move model introduced (`createMove`)
- Create Move button — appears when both endpoints are selected
- Debug move list below board

### v0.4 ✅
- Engine layer introduced (`engine/engine.js`, `engine/reducer.js`)
- Pure reducer — deterministic, no DOM, no UI
- Engine applies moves and tracks dots, edges, lives, move history
- `engine/move.js` — canonical Move model in engine layer

### v0.5 ✅
- Architectural cleanup sprint
- `engine/state.js` moved to `js/selectionState.js` — UI state out of engine folder
- Dead `createMove` duplicate removed from `models.js`
- Endpoint naming standardised (`startDotId` / `endDotId` throughout)
- `boardView.js` introduced — browser-only visual state layer
- Dot positions and edge paths moved out of engine; engine dots now `{ id, lives }` only
- Renderer reads all spatial data from `boardView`, never from engine
- `syntheticEdges` workaround deleted

### v0.6 ✅
- Architecture review and documentation update
- `design.md` and `ROADMAP.md` brought up to date

### v0.6.1 ✅
- Player turns — `currentPlayer` (0 or 1) in engine state, toggles after each move
- Player colours — `data-player` stamped on dots and edges; CSS handles all colouring
- Turn indicator pill in controls bar
- Degree rule (UI layer) — exhausted dots (lives = 0) cannot be selected
- `dot--exhausted` visual state — muted, `pointer-events: none`
- Lives bug fixes — new sprout dots correctly start with 1 life; self-loops consume 2 lives
- `engine/rules.js` introduced — canonical home for pure game rule functions
- `playerForMove(moveIndex)` — player alternation rule lives in the engine, not in BoardView
- Player ownership removed from `boardView.js` — derived from move index on demand

---

### v0.7 — Drawn Moves (in progress)
- Research: reviewed published Sprouts implementation literature (Čížek &
  Balko, GD 2021) to confirm canonical position representation requirements
  before implementing drawing — see design.md for findings
- Decided against live-constrained ("guided freehand") drawing in favour of
  simpler freehand-then-validate: draw normally, simplify and check for
  crossings only after the pointer is released, reject with a message and
  allow redraw if invalid. Avoids needing a real-time region-boundary query
  that would otherwise require a throwaway browser-side module.
- `engine/move.js` — `regionId` field added to Move (defaults to 0) ✅
- `engine/regions.js` — combinatorial region stub, always returns region 0,
  ready for real implementation at v0.9 without changing its interface ✅
- `js/pathSimplify.js` — Douglas-Peucker curve simplification (pure geometry) ✅
- `js/crossingDetection.js` — segment intersection / path crossing checks
  (pure geometry); permanent infrastructure, reused unchanged at v0.9 against
  real region boundaries rather than a flat edge list ✅
- Remaining: wire pointer-driven drawing into `ui.js`, render real `<path>`
  curves in `renderer.js`, arc-length sprout placement

### v0.8 — Engine Rules
- Enforce lives / degree rule inside the engine (not just UI)
- Self-loop legality
- Reject illegal moves before they reach the reducer
- New sprout dot gets correct starting lives (already correct in reducer)

### v0.8.5 — Save / Load
- Serialise engine state + boardView paths to JSON
- Save to file download
- Load and restore full visual and game state
- Foundation for replay (replay = load + re-apply moves)

### v0.9 — Topological Model
- Replace `engine/regions.js` stub with real region tracking
- Region splitting: how a move divides one region into two
- Boundary structure per region (supports multiple boundaries per region,
  e.g. a free-floating dot inside a larger region)
- Canonical encoding inspired by published string representation sr(P):
  per land → per region → per boundary → cyclic sequence of vertex visits
- Mathematical representation begins to diverge from browser representation
- Foundation for canonicalisation and position hashing

### v1.0 — Fully Playable Sprouts
- Complete legal move generation
- Game-over detection
- Crossing detection and region splitting fully integrated into engine rules
  (geometry-side primitives already exist from v0.7 — `crossingDetection.js`
  — this version connects them to the real topological model)

---

## Phase 2 - Research Tools

- Canonical position notation
- Position database
- Position comparison and search
- `canonical.js` and `hash.js` (currently stubbed) implemented

---

## Phase 3 - Bots

- Random bot
- Rule-based bot
- Strong heuristic bot
- Bot vs Bot self-play

---

## Phase 4 - AI

- Self-play training
- Position evaluation
- Strategy learning
- Compare learned strategy with known Sprouts mathematics
