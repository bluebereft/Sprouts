 /* ================================================================
   move.js — Sprouts Engine Layer (v0.4)

   Responsibility
   ──────────────
   Defines the canonical Move object used by the engine.
   This is NOT UI state. This is pure game intent.

   A move is independent of rendering, selection, or UI logic.
   ================================================================ */

/**
 * Creates a Move object from two endpoint dot IDs.
 *
 * @param {number} a - first endpoint dot id
 * @param {number} b - second endpoint dot id
 * @returns {{ startDotId: number, endDotId: number }}
 */
export function createMove(a, b) {
  return {
    startDotId: a,
    endDotId: b
  };
}