/* ================================================================
   regions.js — Sprouts Engine Regions (v0.9)

   Responsibility
   ──────────────
   Pure combinatorial region model. Answers questions about the
   engine's topological structure — which region a dot belongs to,
   how regions and boundaries relate — using only graph structure.
   No coordinates, no geometry. Geometry-based drawing constraints
   live in browser-side code, not here.

   v0.9 — topological data model, no query logic yet
   ─────────────────────────────────────────────────
   v0.9 is deliberately scoped to the DATA MODEL only, seeded
   correctly wherever a fresh game starts. It does NOT implement the
   query functions (getRegionForDot's real body, getBoundaryForDot,
   areDotsInSameRegion, areDotsOnSameBoundary) — those are v0.9.1.
   It does NOT implement any mutation/splitting logic — that's
   v0.9.2. It does NOT make validateMove region-aware — that's v0.9.3.

   Shape introduced at v0.9:
     regions:        [{ id, boundaries: [boundaryId, ...] }, ...]
     boundaries:      [{ id, vertices: [dotId, ...] }, ...]
     nextRegionId:    number — next unused region id
     nextBoundaryId:  number — next unused boundary id

   Starting topology (buildInitialTopology): one region containing
   one boundary PER DOT, each of length 1 — NOT one shared boundary
   holding all dots. A boundary is a cyclic walk along real edges;
   with zero edges at game start, there is no walk connecting
   separate dots into one boundary, so each isolated dot is trivially
   its own boundary. This matters for Euler's formula (V − E + F =
   1 + C): with N isolated dots, C = N (each its own connected
   component), which requires N boundaries, not one — getting this
   wrong here would make the v0.9.1 invariant checker fail on the
   very first position it's asked to check.

   getRegionForDot's stub body is UNCHANGED at v0.9 and remains
   behaviourally correct: since only region 0 exists for the entire
   duration of v0.9 (no splitting logic exists yet), returning
   hardcoded 0 for any dot gives the same answer a real traversal
   would. v0.9.1 replaces the implementation with a genuine lookup —
   the value doesn't change yet, only how it's computed.

   Depends on: nothing. Pure functions of engine state / dot count.
   ================================================================ */

/**
 * Builds the starting topology for a fresh game: one region
 * containing one single-vertex boundary per dot.
 *
 * Spread this directly into a fresh engine state alongside dots,
 * edges, moves, etc. — see ui.js's startGame() and gameRecord.js's
 * buildInitialState() for the two call sites that do this.
 *
 * @param {number} dotCount — number of starting dots
 * @returns {{
 *   regions: Array<{id: number, boundaries: number[]}>,
 *   boundaries: Array<{id: number, vertices: number[]}>,
 *   nextRegionId: number,
 *   nextBoundaryId: number
 * }}
 */
export function buildInitialTopology(dotCount) {
  const boundaries = [];
  for (let i = 0; i < dotCount; i++) {
    boundaries.push({ id: i, vertices: [i] });
  }

  const region = {
    id: 0,
    boundaries: boundaries.map(b => b.id),
  };

  return {
    regions: [region],
    boundaries,
    nextRegionId: 1,
    nextBoundaryId: dotCount,
  };
}

/**
 * Returns the id of the region a dot currently belongs to.
 *
 * v0.9: body unchanged from the v0.7 stub. Still always returns 0 —
 * see file header for why this remains correct through v0.9 despite
 * real regions/boundaries now existing in state. v0.9.1 replaces
 * this with a genuine boundary/region lookup.
 *
 * @param {object} state — current engine state (unused until v0.9.1)
 * @param {number} dotId — unused until v0.9.1
 * @returns {number} region id
 */
export function getRegionForDot(state, dotId) {
  return 0;
}
