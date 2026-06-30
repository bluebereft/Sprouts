/* ================================================================
   regions.js — Sprouts Engine Regions (v0.7 stub)

   Responsibility
   ──────────────
   Pure combinatorial region model. Answers "which region does this
   dot belong to?" using only graph structure — no coordinates, no
   geometry. Geometry-based region boundaries (used for drawing
   constraints) live in browser-side code, not here.

   v0.7 status — STUB
   ───────────────────
   Every Sprouts position drawn so far in this project has exactly
   one region (the outer region), because no move has yet split it.
   This file currently always returns region 0 for every dot.

   This is intentional scaffolding, not a placeholder to be ignored.
   The Move model (engine/move.js) already carries a regionId field
   that this function supplies. Keeping the interface stable now
   means v0.9 only needs to replace the body of this function with
   real region tracking — no other file needs to change shape again.

   v0.9 will replace this stub with real logic that:
     • tracks how each move splits a region into two
     • tracks region membership as the planar graph grows
     • returns the correct region id for any dot at any point in
       the game, not just region 0

   Depends on: nothing. Pure function of engine state.
   ================================================================ */

/**
 * Returns the id of the region a dot currently belongs to.
 *
 * v0.7: always returns 0, since no region-splitting logic exists
 * yet and every position has exactly one region.
 *
 * @param {object} state — current engine state (unused in v0.7 stub)
 * @param {number} dotId — unused in v0.7 stub
 * @returns {number} region id
 */
export function getRegionForDot(state, dotId) {
  return 0;
}
