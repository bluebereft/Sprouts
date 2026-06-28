# Sprouts Lab Design
Last updated: v0.3.1

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

### Models

Represent the core concepts of Sprouts.

Examples include:

- Dot
- Move

Models should not know about HTML, SVG or rendering.

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

The engine owns the rules of Sprouts.

It should not know about HTML, SVG or user interaction.

The same engine should support:

- browser play
- replay
- bots
- AI
- command-line testing

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

The long-term goal is that the game engine, bots, replay system and research tools all operate on the same underlying game model.

---

## Core Principle

The game state stores game concepts, not visual concepts.

For example, it stores dots and moves, but never SVG elements, colours or animations.