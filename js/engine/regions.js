/* ================================================================
   regions.js — Sprouts Engine Regions (v0.9.1)

   Responsibility
   ──────────────
   Pure combinatorial region model. Answers questions about the
   engine's topological structure — which region/boundary a dot
   belongs to, how regions and boundaries relate — using only graph
   structure. No coordinates, no geometry.

   v0.9.1 — pure query functions, still no mutation
   ─────────────────────────────────────────────────
   Adds getBoundaryForDot, a REAL getRegionForDot (replacing the
   stub), areDotsInSameRegion, areDotsOnSameBoundary,
   getBoundariesForRegion, and checkInvariants — a structural
   validity checker, returning the same { ok, violations } shape
   validateMove() already established.

   Still no mutation/splitting logic — that's v0.9.2. Still no
   region-aware legality in validateMove() — that's v0.9.3.

   A scope note worth being explicit about: while designing this
   file's tests, two hand-built "multi-region" fixtures turned out to
   be invalid planar structures on inspection — isolated dots forming
   two regions (wrong: isolated points enclose nothing, so they can't
   be separate faces) and a triangle-plus-floating-dot fixture whose
   declared F didn't satisfy Euler's formula once worked through by
   hand. Both failures traced to the same unresolved question flagged
   in design.md: whether every edge borders exactly two boundary-
   sides, walked in opposite directions by each side's face. Rather
   than encode an unverified guess about that convention into a test,
   checkInvariants' Euler's-formula check is tested here only against
   states already known correct (the seeded starting topology). Real
   multi-region Euler coverage is deferred to v0.9.2, where it can be
   checked against a state the splitting algorithm actually produces,
   cross-validated against the literature once, rather than invented
   by hand now.

   The five lookup functions below don't have this problem — they're
   pure containment queries, correct for any structurally well-formed
   input regardless of whether it represents a valid embedding, so
   they're tested against simple hand-built fixtures without needing
   that convention resolved first.

   Depends on: js/engine/faces.js (getComponents, v0.9.2 PR 3) for
   checkInvariants' Euler check. Otherwise pure functions of engine
   state, no other dependencies.
   ================================================================ */

import { getComponents } from './faces.js';

/**
 * Builds the starting topology for a fresh game: one region
 * containing one single-vertex boundary per dot, and one empty
 * rotation per dot (v0.9.2 — every dot starts at degree 0, so its
 * rotation system entry is the empty array; see
 * docs/specifications/topological-model.md §2.3).
 *
 * @param {number} dotCount — number of starting dots
 * @returns {{
 *   regions: Array<{id: number, boundaries: number[]}>,
 *   boundaries: Array<{id: number, vertices: number[]}>,
 *   nextRegionId: number,
 *   nextBoundaryId: number,
 *   rotations: number[][]
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

  const rotations = [];
  for (let i = 0; i < dotCount; i++) {
    rotations.push([]);
  }

  return {
    regions: [region],
    boundaries,
    nextRegionId: 1,
    nextBoundaryId: dotCount,
    rotations,
  };
}

// ── Query functions ─────────────────────────────────────────────

/**
 * Returns the id of the boundary a dot currently belongs to.
 *
 * @param {object} state — current engine state
 * @param {number} dotId
 * @returns {number|null} boundary id, or null if the dot isn't found
 *   in any boundary (should not happen for a well-formed state, but
 *   this function doesn't assume its input has already been validated)
 */
export function getBoundaryForDot(state, dotId) {
  const boundary = state.boundaries.find(b => b.vertices.includes(dotId));
  return boundary ? boundary.id : null;
}

/**
 * Returns the id of the region a dot currently belongs to.
 *
 * v0.9.1: real implementation, replacing the v0.7/v0.9 stub that
 * always returned 0. The value it returns is unchanged for any state
 * that existed before this version (only one region has ever existed
 * so far), but it's now a genuine lookup rather than a hardcoded
 * answer — ready for v0.9.2 to give it something real to compute.
 *
 * @param {object} state — current engine state
 * @param {number} dotId
 * @returns {number|null} region id, or null if the dot isn't found
 */
export function getRegionForDot(state, dotId) {
  const boundaryId = getBoundaryForDot(state, dotId);
  if (boundaryId === null) return null;

  const region = state.regions.find(r => r.boundaries.includes(boundaryId));
  return region ? region.id : null;
}

/**
 * Returns true if two dots currently belong to the same region.
 *
 * A dot trivially shares a region with itself — checked as an
 * explicit short-circuit rather than left to fall out of two equal
 * lookups, since this is also the correct handling of a self-loop
 * (both endpoints are the same dot).
 *
 * @param {object} state
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
export function areDotsInSameRegion(state, a, b) {
  if (a === b) return true;
  const regionA = getRegionForDot(state, a);
  const regionB = getRegionForDot(state, b);
  return regionA !== null && regionA === regionB;
}

/**
 * Returns true if two dots currently belong to the same boundary.
 *
 * This is the check that will determine split vs. merge at v0.9.2:
 * two dots on the SAME boundary → a single-boundary move (split);
 * two dots in the same region but on DIFFERENT boundaries → a
 * double-boundary move (merge). See design.md "Topological Model".
 *
 * @param {object} state
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
export function areDotsOnSameBoundary(state, a, b) {
  if (a === b) return true;
  const boundaryA = getBoundaryForDot(state, a);
  const boundaryB = getBoundaryForDot(state, b);
  return boundaryA !== null && boundaryA === boundaryB;
}

/**
 * Returns the full boundary objects belonging to a region, resolving
 * the region's boundary id list into actual boundary data.
 *
 * @param {object} state
 * @param {number} regionId
 * @returns {Array<{id: number, vertices: number[]}>}
 */
export function getBoundariesForRegion(state, regionId) {
  const region = state.regions.find(r => r.id === regionId);
  if (!region) return [];
  return region.boundaries
    .map(boundaryId => state.boundaries.find(b => b.id === boundaryId))
    .filter(Boolean);
}

// ── Structural invariant checker ────────────────────────────────

/** Coded structural violations checkInvariants() can report. */
export const TopologyError = {
  DOT_BOUNDARY_COUNT_WRONG:      'DOT_BOUNDARY_COUNT_WRONG',
  BOUNDARY_REGION_COUNT_WRONG:   'BOUNDARY_REGION_COUNT_WRONG',
  BOUNDARY_EDGE_MISSING:         'BOUNDARY_EDGE_MISSING',
  EULER_FORMULA_VIOLATED:        'EULER_FORMULA_VIOLATED',
};

/**
 * Counts connected components over dots-as-nodes, edges-as-links.
 * Delegates to faces.js's getComponents() (v0.9.2 PR 3) — this used
 * to duplicate its own union-find here; now there is one
 * implementation, shared with the face tracer. Behavior (the count
 * returned) is unchanged.
 *
 * @param {object} state
 * @returns {number}
 */
function countConnectedComponents(state) {
  return getComponents(state.edges, state.dots.map(d => d.id)).length;
}

/**
 * Returns true if an edge exists between two dots, in either
 * direction (edges are unordered pairs).
 */
function edgeExists(state, a, b) {
  return state.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}

/**
 * Checks the structural well-formedness of the engine's topological
 * state. Pure function; does not mutate anything.
 *
 * Checks, in order:
 *   1. Every dot belongs to exactly one boundary.
 *   2. Every boundary belongs to exactly one region.
 *   3. Every consecutive pair in a boundary's cyclic vertex sequence
 *      is connected by a real edge (boundaries of length < 2 are
 *      trivially fine — a single-vertex boundary has no consecutive
 *      pairs to check).
 *   4. Euler's formula holds: V − E + F = 1 + C.
 *
 * See file header for why (4)'s test coverage is currently limited
 * to states already known correct — the boundary-orientation
 * convention needed to hand-construct a trustworthy multi-region
 * fixture is not yet verified against the source material.
 *
 * @param {object} state
 * @returns {{ ok: boolean, violations: Array<object> }}
 */
export function checkInvariants(state) {
  const violations = [];

  // 1. Every dot in exactly one boundary.
  const dotBoundaryCount = new Map(state.dots.map(d => [d.id, 0]));
  state.boundaries.forEach(boundary => {
    boundary.vertices.forEach(dotId => {
      dotBoundaryCount.set(dotId, (dotBoundaryCount.get(dotId) ?? 0) + 1);
    });
  });
  dotBoundaryCount.forEach((count, dotId) => {
    if (count !== 1) {
      violations.push({ rule: TopologyError.DOT_BOUNDARY_COUNT_WRONG, dotId, count });
    }
  });

  // 2. Every boundary in exactly one region.
  const boundaryRegionCount = new Map(state.boundaries.map(b => [b.id, 0]));
  state.regions.forEach(region => {
    region.boundaries.forEach(boundaryId => {
      boundaryRegionCount.set(boundaryId, (boundaryRegionCount.get(boundaryId) ?? 0) + 1);
    });
  });
  boundaryRegionCount.forEach((count, boundaryId) => {
    if (count !== 1) {
      violations.push({ rule: TopologyError.BOUNDARY_REGION_COUNT_WRONG, boundaryId, count });
    }
  });

  // 3. Boundary vertex sequences correspond to real edges.
  state.boundaries.forEach(boundary => {
    const verts = boundary.vertices;
    if (verts.length < 2) return; // trivial single-vertex boundary
    for (let i = 0; i < verts.length; i++) {
      const from = verts[i];
      const to   = verts[(i + 1) % verts.length];
      if (!edgeExists(state, from, to)) {
        violations.push({
          rule: TopologyError.BOUNDARY_EDGE_MISSING,
          boundaryId: boundary.id,
          from,
          to,
        });
      }
    }
  });

  // 4. Euler's formula: V − E + F = 1 + C.
  const V = state.dots.length;
  const E = state.edges.length;
  const F = state.regions.length;
  const C = countConnectedComponents(state);
  const lhs = V - E + F;
  const rhs = 1 + C;
  if (lhs !== rhs) {
    violations.push({
      rule: TopologyError.EULER_FORMULA_VIOLATED,
      V, E, F, C,
      expected: rhs,
      actual: lhs,
    });
  }

  return { ok: violations.length === 0, violations };
}
