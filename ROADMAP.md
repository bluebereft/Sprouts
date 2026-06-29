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
- Lives bug fixes — new sprout dots correctly start with 1 life (not 3); self-loops correctly consume 2 lives from endpoint
- Player tracking added to `boardView` — `movePlayers` and `dotPlayers` maps

---

### v0.7 — Drawn Moves
- Replace straight-line edges with player-drawn freehand curves
- Sample pointer into SVG path data
- Store path in `boardView.setEdgePath()`
- Place new sprout at correct point along drawn path
- Engine still receives only `{ startDotId, endDotId }` — no geometry

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
- Introduce explicit region, boundary, and edge incidence concepts
- Engine begins modelling topology rather than just a flat graph
- Mathematical representation begins to diverge from browser representation
- Foundation for canonicalisation and position hashing

### v1.0 — Fully Playable Sprouts
- Crossing detection
- Region splitting on each move
- Complete legal move generation
- Game-over detection

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
