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
- Dot selection
- Renderer optimisation (no redraw/flicker)
- Visual design refresh
- Modular JavaScript architecture

### v0.3
- Introduce Move model
- Two-endpoint selection
- Move creation
- Selection UX refinement
- Debug move list

### v0.4
- Draw move paths
- Draw inserted Sprouts dot
- Support loop moves

### v0.5
- Player turns
- Player colours
- Turn indicator

### v0.6
- Introduce game engine
- Legal move framework

### v0.7
- Degree (max 3 lines) rule

### v0.8
- Crossing detection
- Region tracking

### v0.9
- Save / Load games
- Replay games

### v1.0
- Fully playable Sprouts

---

## Phase 2 - Research Tools

- Canonical notation
- Position database
- Position comparison
- Position search

---

## Phase 3 - Bots

- Random bot
- Rule-based bot
- Strong heuristic bot
- Bot vs Bot

---

## Phase 4 - AI

- Self-play
- Position evaluation
- Strategy learning
- Compare learned strategy with known mathematics