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
   2k and 2k+1. The dart COUNT and the α PAIRING (2k ↔ 2k+1) are
   mandated by the accepted specification's S1
   (docs/specifications/topological-model.md). The specific
   assignment below — which of the two darts corresponds to which
   named endpoint — is this project's own deterministic convention,
   chosen to be consistent with S1, not dictated by it:
     - dart 2k   originates at edges[k].a
     - dart 2k+1 originates at edges[k].b
   alpha(d) = d ^ 1 is the involution itself, arithmetic and never
   stored, per S1.

   Darts are permanent for the life of a game: edges are only ever
   appended (Sprouts never deletes), so a dart's origin, once set,
   never changes.

   Preconditions (not checked at runtime)
   ───────────────────────────────────────
   Every function assumes `d` is a valid dart id in
   [0, dartCount(edges)) for the given `edges` array, and that
   `vertexId` is a valid vertex id. No bounds checking is performed;
   an invalid id produces undefined/NaN silently rather than an
   error. This matches the project's existing convention for pure
   engine-layer functions (compare reducer.js's "assumes the move is
   already legal") — callers are responsible for passing valid ids.

   Forward contract for PR 2 (rotation system) — read before writing σ
   ─────────────────────────────────────────────────────────────────────
   This module has no notion of degree beyond raw incidence: degreeOf
   counts darts found by scanning `edges`, not by consulting any
   rotation system (none exists yet). The accepted specification's D5
   defines deg(v) as |σ(v)| — the SIZE OF THE ROTATION at v, not this
   incidence count. These two quantities are only guaranteed to agree
   if PR 2's σ(v) is, for every vertex, always exactly a permutation
   of incidentDarts(edges, v) — never a separately maintained or
   independently seeded set. This is a hard requirement on PR 2, not
   an incidental fact: if σ and incidentDarts are ever allowed to
   diverge, degreeOf/degree-based invariants (e.g. lives = 3 − deg)
   would silently check the wrong quantity.

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
