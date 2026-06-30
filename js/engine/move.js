 /* ================================================================
   move.js — Sprouts Engine Layer (v0.7)

   Responsibility
   ──────────────
   Defines the canonical Move object used by the engine.
   This is NOT UI state. This is pure game intent.

   A move is independent of rendering, selection, or UI logic.

   v0.7: regionId field added.
   ──────────────────────────
   regionId identifies which region of the current position the
   move's curve was drawn through. Two moves between the same pair
   of dots are NOT necessarily the same move once a position has
   more than one region — the region the curve passes through is
   part of the move's topological identity, not just its endpoints.

   For v0.7, every position has exactly one region (engine/regions.js
   is a stub), so regionId is always 0. The field exists now so the
   Move shape does not need to change again when engine/regions.js
   becomes real at v0.9.
   ================================================================ */

/**
 * Creates a Move object from two endpoint dot IDs and a region id.
 *
 * A Move represents a player's intent to connect two dots within a
 * specific region of the current position. It carries only the
 * minimal topological facts — no geometry, no validation. The
 * reducer (engine/reducer.js) interprets moves; this factory is
 * deliberately thin.
 *
 * Note: startDotId and endDotId may be equal. In Sprouts, a player
 * may draw a loop from a dot back to itself.
 *
 * @param {number} startDotId    - first endpoint dot id
 * @param {number} endDotId      - second endpoint dot id
 * @param {number} [regionId=0]  - region the curve passes through
 * @returns {{ startDotId: number, endDotId: number, regionId: number }}
 */
export function createMove(startDotId, endDotId, regionId = 0) {
  return { startDotId, endDotId, regionId };
}