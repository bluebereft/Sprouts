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

### v0.7 — Drawn Moves ✅
- Research: reviewed published Sprouts implementation literature (Čížek &
  Balko, GD 2021) to confirm canonical position representation requirements
  before implementing drawing — see design.md for findings
- Freehand-then-validate drawing: draw normally, simplify and check for
  crossings after pointer release, reject with message if invalid, allow
  immediate redraw without reselecting endpoints
- `engine/move.js` — `regionId` field added to Move (defaults to 0)
- `engine/regions.js` — combinatorial region stub, always returns region 0
- `js/pathSimplify.js` — Douglas-Peucker curve simplification
- `js/crossingDetection.js` — segment intersection, path crossing, dot-radius
  trim via `trimNearPoints()`
- `js/drawInteraction.js` — extracted pointer gesture and validation from
  ui.js; movement-based tap-vs-drag classification; reports via callbacks
- `js/constants.js` — shared DOT_RADIUS and derived thresholds
- Smooth curve rendering via Catmull-Rom-to-Bezier conversion
- Arc-length midpoint placement for new sprout dots
- Endpoint snapping to exact dot centers on commit
- Self-loop support (click same dot twice to select, then draw loop)
- Draw from either endpoint
- Epsilon tolerance in crossing detection for hand-drawn input
- Cleaned up: dead `engine/state.js` deleted, orphaned CSS rules removed,
  unused `promoteSecondToFirst` removed, version strings normalised

### v0.7.1 — Refactor & Interaction Fixes ✅
- Extracted `js/drawInteraction.js` from `ui.js` (647 → 274 lines); ui.js now
  purely orchestrates, drawInteraction.js owns gesture mechanics
- `js/constants.js` introduced — `DOT_RADIUS`, `DOT_CAPTURE_RADIUS`,
  `DOT_EXCLUSION_RADIUS` centralised, derived from one source
- Redesigned pointer/tap interpretation: drawInteraction.js now owns ALL
  pointer gestures on the board, including taps (dot selection/deselection),
  reported via a new `onTap(dotId)` callback. Native browser `click` event
  is no longer used for game logic — pointer capture was found to
  unreliably redirect click-event targeting across browsers, silently
  breaking dot deselection once both endpoints were selected
- Fixed: exhaustion check was `dot.lives === 0`, missed negative lives that
  can occur before v0.8 engine legality exists; changed to `dot.lives <= 0`
  in both `renderer.js` and `ui.js`'s lives guard
- Fixed: self-loop selection had no check that the dot had ≥2 lives (a loop
  consumes 2, not 1); added explicit guard in `ui.js`'s tap handler
- Dead file `js/engine/state.js` deleted (superseded by `selectionState.js`
  since v0.5, never imported)
- Orphaned `.btn-secondary` / `.btn--hidden` CSS rules removed
- Unused `promoteSecondToFirst` removed from `selectionState.js`
- All file version headers normalised to v0.7
- Status text tightened, then extended further to include a deselect hint
  ("...or tap it again to deselect.", "...or tap one to deselect it.")
- **Fixed:** self-loop lives-insufficiency rejection previously left the
  dot stuck selected with no way to deselect by tapping it again (the tap
  re-entered the same rejection branch indefinitely). Now clears the
  selection immediately on rejection — unlike a drawing-geometry rejection
  (crossing, self-intersection), a lives rejection is not retryable, since
  the dot's lives won't change on a second attempt, so there is nothing to
  preserve by keeping it selected.
- **UX discoverability:** addressed with the status text hint above.
  Longer-term candidate — replacing the two-step select-then-draw model
  with drawing directly between two dots and validating afterward — remains
  a deferred, separately-scoped interaction redesign, not undertaken here.

### v0.8 — Engine Rules ✅
- Re-verified rule content against primary sources (Wikipedia, Encyclopedia
  of Mathematics, gameofsprouts.blogspot.com, arxiv Čížek & Balko) before
  implementing — confirmed self-loop needs lives ≥ 2, normal move needs
  lives ≥ 1 on each endpoint, new sprout always starts at 1 life; no rule
  content changes resulted, only implementation-logic refinements
- Designed as a stable engine API contract, not just a legality patch —
  intended to be the same interface bots, replay, and AI call through later
- `RuleError` enum (`DOT_NOT_FOUND`, `INSUFFICIENT_LIVES`) — engine emits
  coded reasons, never English prose; UI translates codes to player-facing
  text via a local `VIOLATION_MESSAGES` map
- `Rules.validateMove(state, move)` — pure function, returns
  `{ ok, violations: [{ rule, dotId }, ...] }`. Collects ALL applicable
  violations in one call rather than stopping at the first. Existence and
  lives checks run independently per dot so a missing dot doesn't prevent
  checking the other. Self-loop and normal-move are mutually exclusive
  branches — a loop is checked as one `lives >= 2` condition on the single
  dot involved, never as two independent `lives >= 1` checks against it
- `Rules.isExhausted(dot)` — single definition of "no lives remaining",
  used everywhere a dot's exhaustion is checked
- `Engine.validate(move)` — exposed separately from `apply()`. Never
  mutates state. Lets a caller (bot, UI shortcut) cheaply ask "would this
  work" before committing
- `Engine.apply(move)` — now calls `validate()` first internally, visible
  in the API rather than buried silently. Returns `{ ok: true, state }` on
  success or `{ ok: false, violations }` on failure. On failure, internal
  engine state is left completely unchanged — the reducer is never invoked
  for an illegal move, making `apply()` a safe, side-effect-free no-op for
  illegal input (important for a bot trying many candidate moves)
- `Reducer.applyMove()` unchanged — continues to assume every move it
  receives is already legal; legality checking is not the reducer's job
  and never will be
- `ui.js` — `commitMove()` checks `result.ok` before any BoardView/Renderer
  mutation, so a rejected move leaves no partial visual trace. Self-loop
  UI shortcut now constructs a candidate move and calls `Engine.validate()`
  directly rather than duplicating the lives threshold inline
- Consolidated: removed inline `dot.lives <= 0` / `dot.lives < 2` checks
  from `ui.js` and `renderer.js` (both call sites now call
  `Rules.isExhausted()`); UI-layer guards reframed as interaction
  shortcuts, not independent legality — the engine is the sole source of
  truth and would reject the same move regardless
- **Known gap (resolved at v0.8.1):** `DOT_NOT_FOUND` was unreachable
  through normal play at the time this version shipped (the UI can only
  ever select existing dots), and was verified via manual console calls to
  `Engine.apply()`/`Engine.validate()`. v0.8.1 replaces this with a real
  automated test suite.

### v0.8.1 — Engine Test Harness ✅
- Installed Node.js LTS (v24.18.0) via `winget install OpenJS.NodeJS.LTS`
- Minimal `package.json` — `"type": "module"`, `npm test` → `node --test`.
  Zero npm dependencies: Node's built-in `node:test` and `node:assert`
  cover everything needed for the pure engine/rules layer
- `tests/` mirrors `js/` source layout (`tests/engine/rules.test.js` ↔
  `js/engine/rules.js`, `tests/engine/engine.test.js` ↔
  `js/engine/engine.js`), so the test file for any source file is always
  at the same relative path
- 29 tests, all passing:
  - `rules.test.js` (18 tests) — `isExhausted`, `playerForMove`, and
    `validateMove` across existence checks, lives checks, self-loop vs.
    normal-move mutual exclusivity, and multi-violation reporting
  - `engine.test.js` (11 tests) — `apply()`'s success path (state update,
    sprout creation, lives decrement, player toggle) and failure path
    (violations returned, state left as the exact same object reference
    via `assert.strictEqual`, no player/move-history advancement on
    rejection), plus `validate()`'s read-only guarantee and its agreement
    with `apply()`
- Only the pure, zero-DOM layer is covered this way by design — `rules.js`,
  `engine.js`, `reducer.js`, `move.js` (and, not yet tested but equally
  testable: `pathSimplify.js`, `crossingDetection.js`). `renderer.js`,
  `ui.js`, `drawInteraction.js`, `boardView.js`, `selectionState.js` all
  touch the DOM and are out of scope for this harness — validates that the
  engine/browser separation the architecture has maintained since v0.5
  actually pays off: these files run and test correctly with no browser at
  all, exactly as intended for future bots/replay/AI
- Note: `node --test tests/` (explicit directory argument) failed to
  discover files on this Node version/setup; `node --test` with no
  argument (relying on Node's default recursive `**/*.test.js` discovery)
  works correctly and is what `npm test` now runs

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
