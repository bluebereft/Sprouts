# Sprouts Lab Roadmap

## Vision

Build a browser-based implementation of Sprouts that evolves into a research platform for:

- Playing Sprouts
- Single-player puzzle mode with auto-generated, difficulty-graded levels
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

### v0.8.5 — Game Record Serialisation ✅
- Reframed from "browser save/load" to **engine serialisation** per tech
  lead review: the saved format describes a game (what happened), not a
  snapshot of the engine's internal representation at one moment
- Decided the exact persisted shape before implementing (see design.md
  "Persistence"): `formatVersion`, `initialDotCount`, `startingPlayer`,
  and the ordered `moves` array — deliberately NOT `dots`, `edges`,
  `nextDotId`, or `currentPlayer`, all of which are fully derivable by
  replaying `moves` through the real engine
- `initialDotCount` kept as a bare integer, not an array of dot objects —
  in classic Sprouts the starting position is defined entirely by the
  rules (N dots, 3 lives each) given one number; promoting it to an array
  of engine-shaped objects would mirror the engine's internal
  representation rather than describe the game's actual parameters. A
  future variant with genuinely custom starting positions would extend
  the record with a new `startingPosition`/`game` section, not repurpose
  this field
- `engine/gameRecord.js` (new, pure, zero DOM) —
  `exportGame(state)` / `exportGameToJSON(state)`,
  `importGame(record)` / `importGameFromJSON(json)`.
  `importGame` replays every move through `Engine.apply()` — the exact
  function ordinary play uses — so a Game Record's legality is checked by
  the same code path as a human player's move, never a second,
  independent implementation of the rules
- `importGame` snapshots whatever Engine currently holds before replay and
  restores it if any move in the record turns out illegal, so a failed
  import never corrupts or silently replaces a game already in progress
- `ImportError` enum (`INVALID_FORMAT_VERSION`, `INVALID_RECORD_SHAPE`,
  `ILLEGAL_MOVE`) — coded, same pattern as `RuleError`; `gameRecordUI.js`
  translates codes to player-facing text, the engine never emits prose
- `engine.js`'s `init()` unchanged — `initialDotCount`/`startingPlayer`
  are just additional fields on whatever object is passed in, since
  `init()` already spreads its argument
- Bug found and fixed during this work: `renderer.js`'s `renderEdges()`
  and `ui.js`'s `commitMove()` both derived edge/move player colour via
  `playerForMove(moveIndex)` using its default `startingPlayer = 0`,
  never reading the real value from engine state. Harmless while every
  game always started at player 0, but would have silently mis-coloured
  every edge of an imported game with `startingPlayer: 1`. Both now read
  `state.startingPlayer` explicitly
- `ui.js` — new `loadImportedGame(engineState)`, exposed from its public
  API. Game Records store no drawn curve geometry (only topology), so
  this invents placeholder layout for an imported game: initial dots use
  the same even-row layout as a fresh game; each sprout is placed at the
  straight-line midpoint of its move's two endpoints, computed in move
  order. Edges render as straight lines via `renderEdges()`'s existing
  "no recorded path" fallback — built defensively at v0.7, now serving
  its first real purpose
- `js/gameRecordUI.js` (new) — minimal copy/paste browser UI: Export
  button populates a read-only textarea with the current game's JSON;
  Import textarea + button calls `importGameFromJSON`, shows a coded
  error inline on failure, or calls `ui.js`'s `loadImportedGame` on
  success. Kept as its own file rather than added to `ui.js`, continuing
  the precedent set by extracting `drawInteraction.js` at v0.7.1
- `tests/engine/gameRecord.test.js` (17 tests) — round-trip fidelity
  (export→import reproduces identical dots/edges/moves/currentPlayer,
  including a `startingPlayer: 1` case), malformed-record rejection for
  every shape check, illegal-move-sequence rejection with `moveIndex` and
  `violations` reported, and the snapshot/restore guarantee itself:
  a failed import leaves a previously in-progress game's engine state
  byte-for-byte unchanged (verified via `assert.deepEqual` against the
  pre-import state, and `assert.strictEqual` — same object reference —
  for the malformed-shape case, which never touches Engine at all)
- 46 tests total, all passing (29 from v0.8.1 + 17 new)
- Deferred per tech lead: `pathSimplify.js`/`crossingDetection.js` tests
  (valuable, but don't unlock roadmap items the way serialisation does —
  candidate for the next maintenance milestone); an optional snapshot
  cache in the persisted format, only if a future performance need
  justifies it (not currently justified — engine state is still simple)

### v0.8.6 — Architecture Review Follow-up ✅
- Senior-architect-level review of the full v0.1–v0.8.5 codebase, scoped
  specifically to what becomes expensive after canonicalisation, replay,
  databases, and AI (style/naming/comments explicitly excluded)
- **Finding 1 — edge provenance.** Edges previously carried no reference
  to the move that created them; the only link was positional arithmetic
  (`floor(edgeIndex / 2)`) duplicated across `renderer.js` and implicitly
  assumed by `boardView.js`. Fixed by having the reducer stamp
  `originatingMoveIndex` directly on every edge it creates
  (`state.moves.length` at creation time). Considered and rejected a
  globally unique `moveId`: a move is an event within one playthrough,
  not a mathematical entity with independent identity, so a *local*,
  per-game index is the correct scope, not a global counter.
  `renderer.js`'s `renderEdges()` now groups edges by
  `originatingMoveIndex` directly rather than deriving grouping from
  array position
- **Finding 2 — gameRecord.js decoupled from the Engine singleton.**
  `importGame()` previously called `Engine.init()`/`Engine.apply()`
  directly, snapshotting and restoring the singleton on failure — but
  had no equivalent protection on success, meaning a legal-but-unwanted
  import would silently overwrite whatever game was live. `gameRecord.js`
  no longer imports `engine.js` at all; `importGame()` now calls
  `validateMove()`/`applyMove()` directly, builds a local state object,
  and never touches any shared singleton — so calling it has zero effect
  on a live game unless the caller explicitly acts on success.
  `gameRecordUI.js` now owns that explicit step (`Engine.init(result.state)`
  only after `result.ok === true`). This also makes `importGame()` safe
  to call repeatedly with different records with no risk of one call's
  replay leaking into another's — directly relevant to a future database
  validating many stored records, or a bot exploring several hypothetical
  continuations
- **Finding 4 — direct reducer tests.** `applyMove()` was previously only
  exercised indirectly through `Engine.apply()`. New
  `tests/engine/reducer.test.js` (15 tests) tests it in isolation: lives
  arithmetic (including the published "-1 total lives per move"
  invariant), sprout creation, edge creation and the new
  `originatingMoveIndex` field, move history, turn toggling,
  immutability of the input state, and preservation of
  `initialDotCount`/`startingPlayer` across a move
- **Finding 3 — deliberately not acted on**, kept as a documented note:
  v0.9 is scoped as "replace the `regions.js` stub," which undersells the
  work — making `regionId` meaningful requires the reducer itself to gain
  real region-splitting logic, not just a swapped-out lookup function.
  The reducer's current flat, easy-to-audit character should not be
  assumed to survive unchanged into v0.9
- `tests/engine/gameRecord.test.js` rewritten to match the new
  Engine-independent contract: fixtures now built via direct `applyMove()`
  calls rather than through `Engine`; the old "failed import restores
  Engine" tests replaced with tests proving successive `importGame()`
  calls are fully independent of each other
- Findings reviewed and explicitly NOT acted on, with reasoning recorded:
  `BoardView`/`SelectionState` singletons are correct as-is (genuinely
  single-instance browser concepts, unlike `Engine`); `Move`'s
  `{startDotId, endDotId, regionId}` shape is sufficient for canonical
  identity without a new field; the dot-ID scheme (simple incrementing
  counter) is fine as an internal identifier, since canonicalisation's
  job is precisely to map it to an ID-independent form; the "exactly 1
  new dot + 2 new edges per move" assumption is safe long-term, being
  fundamental to Sprouts itself; `validateMove`'s violations-array design
  already correctly anticipates future multi-violation cases
- 61 tests total, all passing (46 existing, 2 replaced, 17 new)

### v0.9 — Topological Model (unbundled into sub-versions)

Originally scoped as one version bundling four distinct mathematical
capabilities: the data model, query functions, the mutation/splitting
algorithm, and region-aware legality. Following a design review, these
are now separate milestones — the same reasoning that split v0.8 into
v0.8/v0.8.1/v0.8.5/v0.8.6, and directly informed by the v0.8.6
architecture review's note that this work is not contained to
`regions.js` alone.

**Architectural framing:** the engine is moving from representing a
plain graph (vertices + edges) to representing an embedded planar
graph (vertices + edges + faces/regions + boundary cycles) — a
different kind of mathematical object, not a richer version of the
same one. Everything from v0.9 onward is reducer work on that
different object.

#### v0.9 — Topological data model ✅
- `engine/regions.js` — new `buildInitialTopology(dotCount)`. Seeds the
  starting position as one region containing **one boundary per dot**,
  each of length 1 — not one shared boundary holding every dot. A
  boundary is a cyclic walk along real edges; with zero edges at game
  start there is no walk connecting separate dots, so each isolated dot
  is trivially its own boundary. This matters for Euler's formula
  (`V − E + F = 1 + C`): N isolated dots means `C = N`, which requires
  N boundaries, not one — getting this wrong here would fail the
  invariant checker on the very first position it's asked to check
- Engine state shape gains `regions`, `boundaries`, `nextRegionId`,
  `nextBoundaryId`. `reducer.js` needed NO changes — its `...state`
  spread already carries forward fields it doesn't know about, the same
  mechanism that let `initialDotCount`/`startingPlayer` ride along for
  free at v0.8.5. Confirms the scope is genuinely as narrow as intended
- `getRegionForDot`'s stub body is deliberately UNCHANGED — still always
  returns 0, and remains behaviourally correct throughout v0.9 (only
  region 0 exists until v0.9.2's splitting logic exists). The value
  doesn't change yet, only how it will be computed once v0.9.1 replaces
  the implementation with a genuine lookup
- Seeded at both fresh-game construction sites: `ui.js`'s `startGame`
  and `gameRecord.js`'s `buildInitialState`, via the same
  `buildInitialTopology()` call — avoiding the duplication risk that
  `initialDotCount`/`startingPlayer` deliberately avoided the same way
- `tests/engine/regions.test.js` (new, 7 tests) — narrow structural
  checks on `buildInitialTopology()` only: one region, exactly
  `dotCount` boundaries (not one shared boundary), correct vertex
  membership, sequential ids, correct starting counters, and the
  degenerate 1-dot case. Deliberately does NOT test Euler's formula,
  `getRegionForDot`, or any invariant checker — those belong to v0.9.1,
  which will test them against hand-constructed multi-region fixtures
  independent of anything this version produces
- `gameRecord.test.js` fixtures updated to seed topology consistently
  with real game construction; new round-trip test confirming
  regions/boundaries/counters re-derive identically on import
- 69 tests total, all passing (61 existing + 8 new)
- Not observable in the browser — with exactly one region for the
  entire duration of this milestone, a genuinely-computed
  `getRegionForDot` result and the hardcoded stub are identical. This
  is intentional, the same safe isolation `regionId` itself had for two
  full versions before v0.9 gave it anything to compute

#### v0.9.1 — Pure region query functions ✅
- `getBoundaryForDot`, `getRegionForDot` (real implementation replacing
  the v0.7/v0.9 stub), `areDotsInSameRegion`, `areDotsOnSameBoundary`,
  `getBoundariesForRegion` — all pure containment lookups over
  `state.regions`/`state.boundaries`
- `checkInvariants(state)` — `{ ok, violations }` shape matching
  `validateMove`'s, with a new `TopologyError` enum. Checks: every dot
  in exactly one boundary, every boundary in exactly one region, every
  boundary's cyclic vertex sequence corresponds to real edges, and
  Euler's formula (`V − E + F = 1 + C`, via union-find over dots/edges
  for the connected-component count)
- **Scope correction found while designing tests, worth recording:**
  two hand-built "multi-region" fixtures turned out to be invalid on
  inspection. Two isolated dots as separate regions is wrong — isolated
  points enclose nothing, so they can't be separate faces (this is
  exactly what `buildInitialTopology` already models correctly: one
  region, multiple trivial boundaries). A triangle-plus-floating-dot
  fixture failed Euler's formula by hand — a triangle alone divides the
  plane into inside and outside (`F=2`, not the `F=1` first assumed),
  and correctly placing a fourth dot into one of those two faces
  requires knowing which side of an edge each boundary walks — the
  same "does every edge border exactly two boundary-sides, in opposite
  directions" question already flagged in design.md as unverified.
  Rather than encode that unverified guess into a test, `checkInvariants`'
  Euler's-formula coverage is limited to states already known correct
  (the seeded starting topology, several dot counts) for this version.
  Real multi-region Euler coverage is deferred to v0.9.2, checked
  against a state the splitting algorithm actually produces and
  cross-validated against the literature once, rather than invented
  by hand now
- The five lookup functions don't have this problem — pure containment
  queries, correct for any structurally well-formed input regardless of
  whether it represents a valid embedding — so they're tested against
  simple hand-built fixtures without needing that convention resolved
- `checkInvariants`'s non-Euler checks (partition counts, boundary-edge
  correspondence) tested via deliberately-broken variants of the known-
  good 2-dot starting state — confirms the checker actually detects bad
  structure, not just that it accepts good structure
- `ui.js` needed zero changes — `getRegionForDot`'s call sites are
  unchanged in shape; only what happens behind them changed
- 88 tests total, all passing (69 existing + 19 new)
- Still not observable in the browser, for the same reason as v0.9 —
  only one region exists until v0.9.2
- Open question still unresolved, carried to the literature pass:
  where (if anywhere) do "lands" (independent connected components)
  belong — possibly a canonicalisation-layer concept rather than an
  engine one

#### v0.9.2 — Reducer learns to mutate the topological model (implemented — PRs 1-6, merged; six reviewable sub-steps landed under one version: darts, σ, tracer/oracle, Move v2 + corners, containment, cutover — see docs/migration-plan.md)
- Expected to be the hardest algorithm in the project so far
- **Literature verification pass: DONE (July 2026)** — against the full
  Čížek & Balko text (arXiv:2108.07671 including its appendix, which
  carries the precise move-insertion formulas). The pass grew into a
  full architectural review (six memos, session archive) and produced
  a normative specification:
  `docs/specifications/topological-model.md` — **accepted (tech lead,
  July 2026); implementation proceeds per `docs/migration-plan.md`**
  (PR-level sequence: darts → σ → tracer/oracle → Move v2 + corner
  resolution → containment → cutover; then v0.9.3 legality and a
  formatVersion-2 milestone, v0.9.4)
- Key outcomes, recorded here so this entry is readable without the
  chat history:
  - The v0.9.1 data model (boundaries as dot-id lists) cannot represent
    positions once any dot has degree ≥ 1 — vertex *occurrences*
    (corners) are the real primitive, per the paper's Fig. 13
  - Authoritative state becomes: deterministic darts + rotation system
    (σ) + containment anchors; faces/regions/boundaries/lives all
    become derived (spec §4–§5)
  - Split, merge, and self-loops are one uniform σ-operation (insert
    four darts) plus containment reconciliation — the earlier
    "implement split first, then merge, as two algorithms" plan is
    superseded; the real case analysis lives in containment (spec §8)
  - The paper's splice formulas become the property-test oracle, not
    production code (spec §9.3, P-O1)
  - Move is redefined: corner pair + occupant-subtree placement
    function (spec §7); Game Records will need formatVersion 2
- **Implementation is gated on the spec's proof obligations** P-O1
  through P-O4 (P-O5 blocks only formatVersion 2) — see spec §11.3
  — all satisfied; see docs/migration-plan.md for the per-PR record
- **O-Q1 resolved (Jared, product decision):** formatVersion 1 Game
  Records dropped entirely — no migration path, no default-corner
  fallback, no backward-compatible replay. Spec §12 updated;
  `js/engine/gameRecord.js` rejects v1 shapes via
  `INVALID_FORMAT_VERSION`. Implemented in PR 8
  (`formatVersion` bumped to 2, `regionId` retired)
- **Minor cleanup candidate, not blocking:** `js/models.js`'s header
  comment and doc-block still describe `createDot` as used by "the
  engine layer" / "reserved for the game engine." Stale since the v0.5
  cleanup that gave engine dots their coordinate-free `{ id, lives }`
  shape — `createDot` is actually browser-only, used by
  `selectionState.js` alone (see design.md's Models section, corrected
  v0.9.1). Comment-only; worth fixing whenever `selectionState.js` is
  next touched, e.g. if v0.9.2/v0.9.3 UI work goes near it

#### v0.9.3 — Region-aware legality (implemented — PR 7, merged; PR 5b absorbed)
- `validateMove` gained a new coded violation, `DIFFERENT_REGIONS`,
  when the two dots involved don't share a region — generalizes and
  absorbs PR 5b's narrower `SAME_COMPONENT_DIFFERENT_FACE` check
  (removed, not duplicated)
- Crossing detection remains v1.0's job, not this version's — v0.9.3 is
  "the engine enforces that a move stays within one region," not
  "the engine detects an edge crossing within a region"

#### v0.9.4 — Game Record formatVersion 2 (implemented — PR 8, merged)
- `regionId` retired entirely from `Move`/`createMove`; new signature
  `createMove(startDotId, endDotId, startCorner=null, endCorner=null,
  placement=null)` serializes real corners/placement (spec §7.5)
  instead of `regionId`
- `FORMAT_VERSION` bumped to 2; v1 records rejected via the existing,
  unmodified `INVALID_FORMAT_VERSION` path — no migration, no
  default-corner fallback (O-Q1, resolved under v0.9.2 above)
- `ui.js`: both `createMove()` call sites carry the documented
  corner-0 placeholder (real corner resolution is v1.0 PR 9's job,
  below); dead `getRegionForDot` import/calls removed

### v1.0 — Fully Playable Sprouts (in progress — see docs/migration-plan.md)

The migration (darts → σ → containment → cutover → region-aware
legality) is complete and merged through PR 8 / v0.9.4. What's left to
reach "fully playable" is **not** migration cleanup — it's real
feature gaps, sequenced as follows (agreed July 2026):

- **PR 9 — Wire real corner resolution into the browser.** ✅
  **COMPLETE** — `ui.js`'s commit path now resolves real corners via
  the new `js/cornerGeometry.js` bridge, using `js/cornerResolution.js`
  (built at PR 4) against curve geometry from `js/pathGeometry.js`
  (new). 186/186 tests passing (171 prior + 15 new). See
  docs/migration-plan.md for the full record, including a real
  finding: self-loops are structurally confined to degree ≤ 1
  vertices, so their corners always resolve to 0 by necessity — not
  a bug, a consequence of the lives rule. Residual, explicit: no
  browser/DOM test infrastructure exists (same PR 4 scope cut), so
  the actual pointer-drag wiring needs a manual playtest, not yet
  done.
- **PR 10 — Nonempty-K placement (enclosure).** ✅ **COMPLETE** —
  moves that enclose other components (looping a line around other
  dots) are handled by the engine, but a manual playtest (Jared)
  found two real bugs before this was actually playable — see
  PR 10a/10b below. 202/202 tests at initial completion.
- **PR 10a — Merge must preserve containment.** ✅ **COMPLETE** —
  connecting a loop's owner to its own enclosed occupant no longer
  corrupts containment (was silently overwriting the owner's real
  exterior anchor). Also fixed a latent test-walker bug this surfaced
  (cornerless cross-component moves could be region-illegal without
  anything checking). 204/204 tests.
- **PR 10b — Geometric interior-side resolution.** ✅ **COMPLETE,
  scoped** — enclosure placement (which occupant lands inside vs.
  outside a drawn loop) is now determined from real screen geometry
  (reconstructed face polygons, or winding sign for self-loops)
  instead of dart numbering, fixing an asymmetry bug where the same
  enclosure worked from one dot but not another. 214/214 tests,
  including the exact mirror-pair (CW/CCW) test that catches that
  asymmetry directly. Residual found while verifying end-to-end
  (drawing a follow-up curve into a freshly-enclosed region could
  still be wrongly rejected) turned out to be a separate, pre-existing
  gap in PR 9's corner resolution — fixed at PR 10c, below.
- **PR 10c — Corner resolution for dots with self-loop-created darts.**
  ✅ **COMPLETE** — a follow-up move drawn into a region an enclosure
  just created now correctly resolves to the right corner at the
  loop's owner. Root cause confirmed by direct testing (not
  hand-reasoning): a self-loop's two "existing angle" values don't
  describe two independent departure rays the way naive angle-gap
  comparison assumes — verified specific to self-loop-adjacent dots
  via a control fixture (a real triangle, zero self-loops, where the
  same angle-gap logic works correctly). Fix: geometrically verify
  every angle-gap corner candidate by reconstructing its real face
  polygon and testing the drawn curve's actual next point against it,
  falling back to winding-number sign (a new `windingNumber` primitive)
  compared against the reference loop's own winding when a pure
  self-loop's two sides are geometrically indistinguishable by plain
  containment. 222/222 tests.
- **PR 11 — Legal move enumeration + `hasLegalMove` + game-over
  detection.** ✅ **COMPLETE** — new `js/engine/legalMoves.js`, built
  entirely on `validateMove` so it can never drift out of sync with
  the actual rules. `hasLegalMove` cheaply short-circuits on the
  first legal move found (Prop 7.4 means placement shape is never a
  reason to reject, so it never needs to search placements just to
  answer yes/no); `enumerateLegalMoves` returns every distinct move
  including every distinct occupant placement, for future bots/puzzle
  generation. Found and fixed a real containment-corrupting bug via a
  random-full-game simulation test (not caught by ordinary unit
  tests, since any single generated move looked individually legal):
  leaving `exteriorSide` null on enclosure-style moves let the
  reducer's own default collide with where the canonical placement
  had just nested an occupant. Verified against the classical Sprouts
  theorem (a game with n starting dots always lasts 2n to 3n−1 moves)
  across multiple independent sources before using it as a test
  oracle. No crossing-detection dependency (checked, not assumed —
  the region model already guarantees same-region pairs are reachable
  without crossing anything). 233/233 tests. No "Game Over" banner in
  the browser yet — deliberately deferred as a small separate
  follow-on.
- **Post-PR-11 stress testing (Jared's suggestion) — three more real
  bugs found and fixed; a fourth, deeper issue found and scoped as
  PR 10d.** A randomized simulator drawing REAL geometric curves
  through `resolveMoveCorners`/`resolveMovePlacement` (the actual
  layer PR 10a/b/c bugs lived in — PR 11's own random-game test never
  exercised it) found: (1) K = ∅ self-loops never got a real
  `exteriorSide`, corrupting outer-face bookkeeping even with nothing
  to place; (2) the same gap for K = ∅ different-dot splits, fixed via
  a non-geometric dart-membership check rather than fragile
  point-in-polygon (a reference dot is typically a pendant sitting
  exactly on its own polygon's boundary); (3) a bridge-point tie-break
  regression against an existing PR 9 test. All three fixed and
  verified. 234/234 tests.
- **PR 10d — systematic outer-face tracking through arbitrary move
  sequences (found, NOT fixed, design not started).** The same stress
  test still fails ~8 of 10 random games even after the three fixes
  above, each at increasing move depth — suggesting a deeper,
  structural gap rather than more independent bugs: there's no single
  mechanism maintaining "which face is truly exterior" as an invariant
  through arbitrary move sequences, just patches for shapes of the
  problem found so far. Deliberately not chased further this session
  to avoid an unbounded sequence of narrow patches. See
  docs/migration-plan.md for the full record and scope for the design
  pass this needs.
- **PR 12 — Crossing detection integrated into engine rules,** reusing
  the geometry primitives that already exist from v0.7
  (`crossingDetection.js`) — their fit against the new corner/
  placement vocabulary is an assumption to verify at design time, not
  an assumed drop-in. → **v1.0 declared.**

---

## Phase 2 - Research Tools

- **Canonical encoding deliberately kept out of Phase 1 entirely** —
  there's no useful canonical-form work possible against a topology
  that's always exactly one region, so this has a hard dependency on
  v0.9.2 existing and being trustworthy, not just a sequencing
  preference. Also mirrors, in reverse, the reasoning that justified
  building Game Record serialisation early at v0.8.5 (build persistence
  while the state underneath is simple) — canonical encoding should be
  built once the topology underneath is complete and stable, not while
  it's still being proven correct
- `canonical.js` consumes the finished topological model and produces
  canonical strings inspired by the published sr(P) representation: per
  land → per region → per boundary → cyclic sequence of vertex visits
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

---

## Phase 5 — Single-Player Puzzle Mode (long-term track)

A sudoku-style single-player game: the player is given a generated
position and must play so that the opponent (the engine) is left with
no legal moves. Recorded as a named destination so nearer-term work
can be checked against it — nothing here changes any current
migration PR.

**Convention decision:** puzzles use normal play — last player able
to move WINS. Misère is a separate future category, not a toggle.

**Levels are seeds, not stored data.** A level is a generator seed:
deterministic RNG + deterministic engine → the same puzzle,
regenerated on demand, storing nothing — so wiping/resetting user
record storage cannot lose levels, and seeds are shareable ids.
(Internally the generator still builds positions by replaying a move
sequence — replay is the engine's ONLY constructor for non-initial
positions, per the two-level-truth architecture — but that sequence
is transient generation machinery, never user-stored data.)

**Mode selection is a UI concern, by construction.** The engine has
no concept of who produces moves. Single vs. two player is which move
SOURCE ui.js wires up at game start: pointer gestures for both turns,
or gestures plus a bot function. When PR 4 reworks commitMove, keep
the "move arrives → validate → commit" path source-agnostic — no
speculative mode code, just don't foreclose a second source.

### Tier 1 — minimal viable puzzle game (shortly after v1.0)

Win-in-1: "make one right move and the AI is stuck." No runtime
solver — a 1-ply check does everything:

1. **Generate:** seeded random self-play from n dots to a terminal
   position (uses v1.0's legal move enumeration); step back one ply —
   a win-in-1 candidate by construction.
2. **Classify:** for each legal move, apply + hasLegalMove. Winning
   moves leave the AI stuck; the rest are wrong answers. Keep
   candidates with at least one of each; winning/total ratio is the
   difficulty knob.
3. **Wrong-move feedback:** the AI's surviving reply is already known
   from step 2. Display floor: highlight its endpoints + region.
   Display target: draw it — via fast-path curve synthesis
   (propose → validate with crossingDetection.js → perturb, retry),
   made safe by the generator itself: **candidates whose AI replies
   the fast path cannot draw are simply discarded**, so no
   termination guarantee is needed at this tier. Satisficing plus
   disposability replaces the routing fallback.

### Tier 2 — win-in-N (AI takes real turns)

Needs a real (still small) solver, a move-selection policy, and
robust curve synthesis: a guaranteed-termination routing fallback for
cramped positions (the AI must draw whatever the game reaches — no
discard option mid-game), with correctness constraints (exit through
the RIGHT corner; realize the bipartition) inherited from PR 4's
corner/placement vocabulary — synthesis ≈ PR 4's resolution run in
reverse. Čížek & Balko implement machine drawing; the literature
path exists.

### What the existing roadmap already provides
Headless engine (generator/solver run anywhere); canonical encoding
(Phase 2) for deduping generated levels at scale — optional at Tier 1,
required for "auto-generated, gradually increasing" at scale;
position database (Phase 2) as solved-puzzle cache; the containment
forest (v0.9.2 spec) as the Sprague-Grundy decomposition solvers use.

### Difficulty comes out of the engine
Depth to win (win-in-1 … win-in-N); forgiveness (winning/legal
ratio); technique required (region split, containment trap,
lives-parity). Display is a browser concern, per the standing
boundary.

### Rough sequence
Migration (current) → v0.9.3 → v1.0 (hasLegalMove, enumeration,
game-over) → **Tier 1: seeded win-in-1 generator + 1-ply classifier +
fast-path reply drawing** → canonical encoding (Phase 2) →
small-n solver → graded generator at scale → **Tier 2: AI turns +
robust synthesis**. The Tier 2 solver doubles as Phase 3's first bot.
