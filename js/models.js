/* ================================================================
   models.js — Sprouts v0.7

   Responsibility
   ──────────────
   Defines shared data factory functions used across the application.
   This file has no knowledge of the DOM, SVG, or game rules.

   Currently defines:
     createDot — used by selectionState.js and the engine layer.

   Note: the Move model lives in engine/move.js because a Move is
   a pure engine concept. createDot lives here because dots are
   shared between the UI layer (layout) and the engine (game state).
   ================================================================ */


/**
 * Creates a Dot data object.
 *
 * A Dot is a plain object — not a class — because dots carry only
 * data. Behaviour (drawing, selecting, layout) belongs in the modules
 * responsible for those concerns.
 *
 * Fields
 * ──────
 * id     {number}  Unique index, assigned at game start. 0-based.
 * x      {number}  Horizontal position in SVG user units.
 * y      {number}  Vertical position in SVG user units.
 * lives  {number}  Remaining available connections. Always 3 for a
 *                  fresh dot in standard Sprouts rules. Reserved for
 *                  the game engine; not yet enforced by any logic.
 *
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @returns {{ id: number, x: number, y: number, lives: number }}
 */
export function createDot(id, x, y) {
  return {
    id,
    x,
    y,
    lives: 3,   // standard Sprouts starting value
  };
}
