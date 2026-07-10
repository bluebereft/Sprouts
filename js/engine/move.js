 /* ================================================================
   move.js — Sprouts Engine Layer (v0.9.4 — PR 8)

   Responsibility
   ──────────────
   Defines the canonical Move object used by the engine.
   This is NOT UI state. This is pure game intent.

   A move is independent of rendering, selection, or UI logic.

   v0.9.2 PR 4: startCorner, endCorner, placement
   ───────────────────────────────────────────────
   startCorner / endCorner identify WHICH corner (gap in the
   rotation) at each endpoint the move connects to — spec §7.1. Both
   are nullable: a Move constructed without them falls back to the
   reducer's append-only σ insertion — a general convenience for any
   caller (tests, bots, quick construction) that doesn't need to
   specify an exact corner, not tied to any particular Game Record
   format (see reducer.js's file header).

   Corner indexing convention (pinned here, operational choice not
   literally mandated by the spec — see PR 4 design notes): for a
   vertex of current degree d ≥ 1, a valid corner index is in
   [0, d-1] and means "insert immediately after the dart currently at
   this position in the rotation." For d = 0 (isolated vertex), the
   only valid index is 0 (spec §10.3's "index 0 for degree 0").

   placement is the spec's π (§7.2) — the occupant-subtree
   assignment needed only for single-boundary (split) moves whose
   region has floating occupants. General (non-empty) placement is
   still not supported: containment's update algorithm (PR 5) is
   restricted to K = ∅ splits, so placement MUST be null or an empty
   object for any Move validated today — validateMove enforces this
   (PLACEMENT_NOT_YET_SUPPORTED / NONEMPTY_K_NOT_YET_SUPPORTED).

   v0.9.4 PR 8 — regionId retired
   ───────────────────────────────
   regionId (added v0.7 as a placeholder for a position with more
   than one region, before the topological model existed) is REMOVED.
   Per the accepted specification §7.2, region membership is derived
   from a move's corners, never fundamental — it was never anything
   but a stub value in practice. Its only purpose was formatVersion 1
   Game Record compatibility; formatVersion 1 is dropped entirely
   (spec O-Q1, product ruling), so nothing depends on it any longer.
   ================================================================ */

/**
 * Creates a Move object from two endpoint dot IDs and (optionally)
 * real corner + placement data.
 *
 * A Move represents a player's intent to connect two dots. The
 * reducer (engine/reducer.js) interprets moves; this factory is
 * deliberately thin — no validation happens here (see engine/rules.js).
 *
 * Note: startDotId and endDotId may be equal. In Sprouts, a player
 * may draw a loop from a dot back to itself.
 *
 * @param {number} startDotId       - first endpoint dot id
 * @param {number} endDotId         - second endpoint dot id
 * @param {?number} [startCorner=null] - corner index at startDotId (see file header for convention)
 * @param {?number} [endCorner=null]   - corner index at endDotId
 * @param {?object} [placement=null]   - spec's π: occupantRep → 1|2. Domain must equal K (PR 10).
 * @param {?number} [exteriorSide=null] - for a split of the plane's
 *   outer region, which of the two descendant sides (1 or 2) is the
 *   unbounded / ⊥-adjacent one. Occupants placed there stay roots
 *   (parentAnchor ⊥) rather than becoming nested, keeping the
 *   encoding canonical (PR 10, Option 1). null when not a
 *   ⊥-region split (K = ∅, merges, interior splits).
 * @returns {{ startDotId: number, endDotId: number, startCorner: ?number, endCorner: ?number, placement: ?object, exteriorSide: ?number }}
 */
export function createMove(
  startDotId,
  endDotId,
  startCorner = null,
  endCorner = null,
  placement = null,
  exteriorSide = null
) {
  return { startDotId, endDotId, startCorner, endCorner, placement, exteriorSide };
}
