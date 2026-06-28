# Sprouts Lab Design

## Philosophy

Keep the code simple.

Every version should add one idea.

The project should remain understandable by a single developer.

---

## Architecture

UI

↓

State

↓

Renderer

↓

SVG

The game engine will be introduced later.

---

## Principles

### State

Stores only the current game state.

It should not know how anything is drawn.

---

### Renderer

Draws the board.

It should not modify game state.

---

### UI

Handles buttons and mouse clicks.

It should not enforce game rules.

---

### Game Engine (future)

Determines whether moves are legal.

The engine should not know about HTML or SVG.

This will allow:

- browser play
- bots
- AI
- command-line testing

to all use the same engine.

---

## Long-term Goal

The browser is just one client of Sprouts Lab.

The long-term goal is that the game engine, bots, replay system, and research tools can all operate on the same underlying game model without depending on the browser UI.

The game engine should eventually support:

- browser interface
- replay viewer
- bots
- AI
- canonical game analysis

The game state stores game concepts, not visual concepts. For example, it stores dots and moves, but never SVG elements or colours.
