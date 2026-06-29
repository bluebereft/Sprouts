# Sprouts Lab Design
Last updated: v0.6.1 (rules.js refactor)

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
UI  (ui.js)
 │
 ├── SelectionState  (selectionState.js)   — which dots the player has clicked
 │
 ├── BoardView       (boardView.js)        — browser-only visual state
 │     dot positions, edge paths, player colours
 │     never passed to the engine
 │
 ├── Engine          (engine/engine.js)    — stateful wrapper around reducer
 │    └── Reducer    (engine/reducer.js)   — pure game state transitions
 │
 └── Renderer        (renderer.js)         — SVG board
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

**`move.js`** — `createMove(startDotId, endDotId)` factory.

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

Handles buttons, dropdowns, clicks, status text, and the turn indicator.

The only module that reads HTML elements directly.

Coordinates all other modules — it is the only place that knows about
SelectionState, BoardView, Engine, and Renderer simultaneously.

Does not enforce game rules. Rule enforcement is the engine's job (v0.8).
Currently applies a UI-layer lives guard as a courtesy — exhausted dots
cannot be selected — but this is not a substitute for engine validation.

---

## Core Principle

The game state stores game concepts, not visual concepts.

Engine state stores dots (with lives), edges, moves, and whose turn it
is. It never stores SVG elements, colours, coordinates, or animations.

Visual concepts — where dots appear on screen, what paths edges follow,
which player's colour to use — live in boardView, not in the engine.

---

## Long-term Goal

The browser is just one client of Sprouts Lab.

The long-term goal is that the game engine, bots, replay system, and
research tools all operate on the same underlying game model. BoardView
and the renderer are browser-specific layers on top of an engine that
knows nothing about screens.
