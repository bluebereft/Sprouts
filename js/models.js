/* ================================================================
   models.js — Sprouts v0.3.0
   
   Responsibility
   ──────────────
   Define the data shapes used throughout the application.
   This file has no knowledge of the DOM, SVG, or game rules.
   It is the single place to look when asking "what does a Dot
   look like?" or "what does a Move look like?".
   
   Load order: first. No dependencies.
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


/**
 * Creates a Move data object.
 *
 * A Move records a player's intention to connect two dots.
 * It carries only the endpoint dot ids — no geometry, no validation.
 * The game engine (a future module) will interpret moves; this model
 * is deliberately thin.
 *
 * Note: startDotId and endDotId may be the same value. In Sprouts a
 * player may draw a loop from a dot back to itself.
 *
 * Fields
 * ──────
 * startDotId  {number}  Id of the first selected dot.
 * endDotId    {number}  Id of the second selected dot.
 *
 * @param {number} startDotId
 * @param {number} endDotId
 * @returns {{ startDotId: number, endDotId: number }}
 */
function createMove(startDotId, endDotId) {
  return { startDotId, endDotId };
}