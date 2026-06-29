 /* ================================================================
   move.js — Sprouts Engine Layer (v0.5)

   Responsibility
   ──────────────
   Defines the canonical Move object used by the engine.
   This is NOT UI state. This is pure game intent.

   A move is independent of rendering, selection, or UI logic.
   ================================================================ */

/**
 * Creates a Move object from two endpoint dot IDs.
 *
 * A Move represents a player's intent to connect two dots.
 * It carries only the endpoint ids — no geometry, no validation.
 * The reducer (engine/reducer.js) interprets moves; this factory
 * is deliberately thin.
 *
 * Note: startDotId and endDotId may be equal. In Sprouts, a player
 * may draw a loop from a dot back to itself.
 *
 * @param {number} startDotId - first endpoint dot id
 * @param {number} endDotId   - second endpoint dot id
 * @returns {{ startDotId: number, endDotId: number }}
 */
export function createMove(startDotId, endDotId) {
  return { startDotId, endDotId };
}