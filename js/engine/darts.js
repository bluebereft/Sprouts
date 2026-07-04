/* ================================================================
   darts.js — Sprouts Engine Darts (v0.9.2 — PR 1)

   Responsibility
   ──────────────
   Pure arithmetic view of the dart (edge-side) ground set over the
   existing `edges` array. Establishes the deterministic dart
   vocabulary that later PRs (rotation system, tracer, containment,
   Move corners) are built on. Introduces no new state, no rotation
   system, and no topology beyond what `edges` already encodes.

   Zero imports. Every function takes `edges` (or a dart id) as an
   explicit argument — this module has no knowledge of engine state
   beyond what's passed in.

   Pinned convention (permanent — do not change)
   ───────────────────────────────────────────────
   Edge k (0-based, creation order in the `edges` array) owns darts
   2k and 2k+1:
     - dart 2k   originates at edges[k].a
     - dart 2k+1 originates at edges[k].b
   alpha(d) = d ^ 1 — the involution pairing a dart with its partner
   on the same edge. This is arithmetic, never stored, per the
   accepted specification's S1 (docs/specifications/topological-model.md).

   Darts are permanent for the life of a game: edges are only ever
   appended (Sprouts never deletes), so a dart's origin, once set,
   never changes.

   incidentDarts() — ordering warning
   ───────────────────────────────────
   incidentDarts(edges, vertexId) returns a vertex's darts in
   ascending dart-id order. This is INCIDENCE order, not ROTATION
   order — it carries no cyclic or geometric meaning whatsoever. No
   rotation system (σ) exists in this module and none is introduced
   here; when σ arrives in a later PR, it will live on engine state
   as the sole source of cyclic/rotation order. Ascending dart-id
   order is nonetheless the deterministic base enumeration later
   conventions (e.g. deterministic face-tracing) will build on, so it
   must not be changed casually.

   No function in this module returns or accepts cyclic order. Any
   caller interpreting incidentDarts() as a rotation has a bug.

   Depends on: nothing.
   ================================================================ */

/**
 * Total number of darts implied by an edges array — 2 per edge.
 *
 * @param {Array<{a: number, b: number}>} edges
 * @returns {number}
 */
export function dartCount(edges) {
  return 2 * edges.length;
}

/**
 * Returns the index (into `edges`) of the edge that owns a dart.
 *
 * @param {number} d — a dart id
 * @returns {number} edge index
 */
export function edgeOfDart(d) {
  return d >> 1;
}

/**
 * Returns the other dart on the same edge — the involution α.
 * Arithmetic only; α is never stored as data (see file header).
 *
 * @param {number} d — a dart id
 * @returns {number} the partner dart id
 */
export function alpha(d) {
  return d ^ 1;
}

/**
 * Returns the vertex a dart originates at, per the pinned
 * convention: dart 2k originates at edges[k].a, dart 2k+1 at
 * edges[k].b.
 *
 * @param {Array<{a: number, b: number}>} edges
 * @param {number} d — a dart id
 * @returns {number} the origin vertex id
 */
export function originOf(edges, d) {
  const edge = edges[edgeOfDart(d)];
  return (d % 2 === 0) ? edge.a : edge.b;
}

/**
 * Returns the vertex at the OTHER end of a dart's edge — i.e. the
 * origin of its α-partner. Convenience composition, not a new
 * primitive.
 *
 * @param {Array<{a: number, b: number}>} edges
 * @param {number} d — a dart id
 * @returns {number} the vertex at the far end of d's edge
 */
export function otherEndOf(edges, d) {
  return originOf(edges, alpha(d));
}

/**
 * Returns every dart originating at a given vertex, in ASCENDING
 * DART-ID ORDER. This is incidence, not rotation — see file header.
 * Do not treat the returned order as cyclic.
 *
 * @param {Array<{a: number, b: number}>} edges
 * @param {number} vertexId
 * @returns {number[]} dart ids, ascending
 */
export function incidentDarts(edges, vertexId) {
  const darts = [];
  for (let k = 0; k < edges.length; k++) {
    if (edges[k].a === vertexId) darts.push(2 * k);
    if (edges[k].b === vertexId) darts.push(2 * k + 1);
  }
  return darts;
}

/**
 * Returns the degree of a vertex — the number of darts originating
 * at it. Equivalent to incidentDarts(edges, vertexId).length.
 *
 * @param {Array<{a: number, b: number}>} edges
 * @param {number} vertexId
 * @returns {number}
 */
export function degreeOf(edges, vertexId) {
  return incidentDarts(edges, vertexId).length;
}
