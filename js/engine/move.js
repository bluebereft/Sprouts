 /* ================================================================
   move.js — Sprouts Engine Layer (v0.9.2 — PR 4)

   Responsibility
   ──────────────
   Defines the canonical Move object used by the engine.
   This is NOT UI state. This is pure game intent.

   A move is independent of rendering, selection, or UI logic.

   v0.7: regionId field added.
   ──────────────────────────
   regionId identifies which region of the current position the
   move's curve was drawn through. For v0.7-v0.9.1, every position
   had exactly one region, so regionId was always 0. Per the accepted
   specification (docs/specifications/topological-model.md §7.2),
   regionId is properly DERIVED from a move's corners, not
   fundamental — it is retained here only for backward compatibility
   with formatVersion 1 Game Records, and is scheduled for removal at
   formatVersion 2 (PR 8).

   v0.9.2 PR 4: startCorner, endCorner, placement
   ───────────────────────────────────────────────
   startCorner / endCorner identify WHICH corner (gap in the
   rotation) at each endpoint the move connects to — spec §7.1. Both
   are nullable: a Move constructed without them (the v1 shape) is
   still valid and falls back to the reducer's legacy append-only σ
   insertion (PR 2's original policy) — this is the documented
   legacy path for replaying formatVersion 1 Game Records (open
   question O-Q1 in the spec).

   Corner indexing convention (pinned here, operational choice not
   literally mandated by the spec — see PR 4 design notes): for a
   vertex of current degree d ≥ 1, a valid corner index is in
   [0, d-1] and means "insert immediately after the dart currently at
   this position in the rotation." For d = 0 (isolated vertex), the
   only valid index is 0 (spec §10.3's "index 0 for degree 0").

   placement is the spec's π (§7.2) — the occupant-subtree
   assignment needed only for single-boundary (split) moves whose
   region has floating occupants. PR 4 does NOT support a non-empty
   placement: containment (spec §3) does not exist as engine state
   until PR 5, so there is no K to assign against yet. placement MUST
   be null or an empty object for any Move validated under this
   version — validateMove enforces this (PLACEMENT_NOT_YET_SUPPORTED).
   ================================================================ */

/**
 * Creates a Move object from two endpoint dot IDs, a region id, and
 * (optionally) real corner + placement data.
 *
 * A Move represents a player's intent to connect two dots within a
 * specific region of the current position. The reducer
 * (engine/reducer.js) interprets moves; this factory is deliberately
 * thin — no validation happens here (see engine/rules.js).
 *
 * Note: startDotId and endDotId may be equal. In Sprouts, a player
 * may draw a loop from a dot back to itself.
 *
 * @param {number} startDotId       - first endpoint dot id
 * @param {number} endDotId         - second endpoint dot id
 * @param {number} [regionId=0]     - region the curve passes through (legacy; derived, see file header)
 * @param {?number} [startCorner=null] - corner index at startDotId (see file header for convention)
 * @param {?number} [endCorner=null]   - corner index at endDotId
 * @param {?object} [placement=null]   - spec's π; MUST be null/empty in this version
 * @returns {{ startDotId: number, endDotId: number, regionId: number, startCorner: ?number, endCorner: ?number, placement: ?object }}
 */
export function createMove(
  startDotId,
  endDotId,
  regionId = 0,
  startCorner = null,
  endCorner = null,
  placement = null
) {
  return { startDotId, endDotId, regionId, startCorner, endCorner, placement };
}