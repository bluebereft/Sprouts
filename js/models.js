/* ================================================================
   models.js — Sprouts v0.2.3
   
   Responsibility
   ──────────────
   Define the data shapes used throughout the application.
   This file has no knowledge of the DOM, SVG, or game rules.
   It is the single place to look when asking "what does a Dot
   look like?" — all other modules import that answer from here.
   
   Load order: first. No dependencies.
   ================================================================ */


/**
 * Factory function that creates a Dot data object.
 *
 * A Dot is a plain object — not a class — because dots carry only
 * data. Behaviour (drawing, selecting, layout) belongs in the modules
 * that are responsible for those concerns.
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
function createDot(id, x, y) {
  return {
    id,
    x,
    y,
    lives: 3,   // standard Sprouts starting value
  };
}