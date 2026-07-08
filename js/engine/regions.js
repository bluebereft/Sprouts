/* ================================================================
   regions.js — Sprouts Engine Regions (v0.9.2 — PR 6, cutover)

   Responsibility
   ──────────────
   Pure combinatorial region model. Answers questions about the
   engine's topological structure — which region/boundary a dot
   belongs to, how regions and boundaries relate — using only graph
   structure. No coordinates, no geometry.

   v0.9.2 PR 6 — cutover to the derived view
   ────────────────────────────────────────────
   The stored `regions`/`boundaries` arrays, `nextRegionId`/
   `nextBoundaryId` counters, and the old `checkInvariants` (which
   enforced the disproven "every dot in exactly one boundary"
   invariant) are DELETED. Every query below now reads σ + faces +
   containment (derived, via faces.js/containment.js) instead. This
   also closes finding F1: the stored topology was stale after move 1
   of every game (a sprout never joined any boundary) — the derived
   view has no such staleness, since it's recomputed from the real
   graph every time.

   Three findings from the cutover design review, recorded here
   because they change what these functions mean, not just how they
   compute it:

   (1) A "boundary" IS a face (spec D3). It needs a stable numeric id
       for API compatibility even though nothing external depends on
       the specific number (see below) — smallest dart in the face's
       walk for non-trivial faces (already sorted first, spec §10.3),
       or -(component + 1) for trivial (degree-0) faces, guaranteed
       disjoint from real dart ids (always >= 0).

   (2) Region and boundary collapse to the SAME identifier at the
       single-corner level (a corner's region is always just that
       corner's own face, unconditionally — no root/occupant special
       casing needed), but checking whether TWO DIFFERENT dots share
       a region does NOT collapse to face equality. Per spec D4,
       region(f) = f's own walk plus the outer walks of everything
       occupying f — so dot A and dot B can be on different faces and
       still share a region, if one occupies the other's face (or
       both are siblings occupying a common parent, including both
       being roots, since all root components collectively share the
       ONE plane's outer region). areDotsInSameRegion() implements
       this properly; it is NOT simple equality, unlike the old
       (pre-cutover) v0.9.1 implementation, which was only correct
       because that model had no host/occupant hierarchy at all.

   (3) A dot of degree >= 2 has multiple corners, potentially on
       different faces — "which region is this dot in," asked
       without specifying a corner, is genuinely ambiguous (the same
       finding that motivated Move needing corners at all). Since
       getRegionForDot's only caller (ui.js) doesn't yet resolve a
       real corner from drawn geometry (it supplies a documented
       corner-0 placeholder — see ui.js and move.js's PR 8 notes),
       corner 0 is used here too as a deterministic — but arbitrary —
       convention, matching the precedent set by PR 3's φ-direction
       choice and PR 4's default-corner insertion. (Region-aware
       legality is checked as of PR 7 — Move.regionId, which this
       comment originally referenced as "not read for correctness,"
       no longer exists at all; it was retired at PR 8.)

   getBoundariesForRegion now returns FACE OBJECTS ({component,
   darts}), not the old {id, vertices} shape — an honest
   representation change; grep confirmed (PR 6 design step) that
   nothing outside this file's own tests consumed the old shape.

   Depends on: js/engine/faces.js (traceFaces, getComponents,
   cornerFace), js/engine/containment.js (resolveOuterFaceAnchor,
   resolveParentAnchor, computeK, checkContainmentInvariants).
   ================================================================ */

import { getComponents, traceFaces, cornerFace } from './faces.js';
import {
  resolveOuterFaceAnchor,
  resolveParentAnchor,
  computeK,
  checkContainmentInvariants,
} from './containment.js';

/**
 * Builds the starting topology for a fresh game: one empty rotation
 * per dot (every dot starts at degree 0 — spec §2.3), and containment
 * seeding every dot as its own root component: each dot's
 * outerFaceAnchor is its own trivial (isolated-vertex) face, and its
 * parentAnchor is null (⊥ — the plane's outer region).
 *
 * @param {number} dotCount — number of starting dots
 * @returns {{
 *   rotations: number[][],
 *   outerFaceAnchor: object,
 *   parentAnchor: object
 * }}
 */
export function buildInitialTopology(dotCount) {
  const rotations = [];
  const outerFaceAnchor = {};
  const parentAnchor = {};
  for (let i = 0; i < dotCount; i++) {
    rotations.push([]);
    outerFaceAnchor[i] = { kind: 'vertex', value: i };
    parentAnchor[i] = null;
  }

  return { rotations, outerFaceAnchor, parentAnchor };
}

// ── Boundary/region identifiers (derived-view id scheme) ─────────

/**
 * Deterministic numeric id for a face (= a boundary). See file
 * header, finding (1).
 *
 * @param {{component:number, darts:number[]}} face
 * @returns {number}
 */
function faceId(face) {
  return face.darts.length > 0 ? face.darts[0] : -(face.component + 1);
}

/**
 * Reverse lookup: the face with a given id, within a specific
 * traceFaces() result.
 *
 * @param {Array<{component:number, darts:number[]}>} faces
 * @param {number} id
 * @returns {?{component:number, darts:number[]}}
 */
function findFaceById(faces, id) {
  return faces.find(f => faceId(f) === id) ?? null;
}

// ── Query functions ─────────────────────────────────────────────

/**
 * Returns the id of the boundary (face) a dot's corner-0 currently
 * belongs to — see file header, finding (3), for the corner-0
 * convention.
 *
 * @param {object} state — current engine state
 * @param {number} dotId
 * @returns {?number} boundary id, or null if the dot isn't found
 */
export function getBoundaryForDot(state, dotId) {
  if (!state.dots.some(d => d.id === dotId)) return null;
  const faces = traceFaces(state.edges, state.rotations);
  const face = cornerFace(state.edges, state.rotations, faces, dotId, 0);
  return face ? faceId(face) : null;
}

/**
 * Returns the id of the region a dot's corner-0 currently belongs
 * to. See file header, finding (2) — at the single-corner level this
 * IS the same identifier as getBoundaryForDot (a corner's region is
 * always just that corner's own face) — the region/boundary
 * distinction only matters when enumerating ALL of a region's
 * boundaries (getBoundariesForRegion) or comparing two DIFFERENT
 * dots (areDotsInSameRegion), neither of which is a single-corner
 * lookup.
 *
 * @param {object} state — current engine state
 * @param {number} dotId
 * @returns {?number} region id, or null if the dot isn't found
 */
export function getRegionForDot(state, dotId) {
  return getBoundaryForDot(state, dotId);
}

/**
 * Returns true if two corners currently belong to the same region.
 * NOT simple face equality — see file header, finding (2). Defaults
 * to each dot's corner-0 (the convention finding (3) documents) when
 * cornerA/cornerB are omitted, preserving the original 2-dot-id
 * contract for existing callers (ui.js and pre-PR-7 tests).
 *
 * A corner trivially shares a region with itself — but note this
 * requires BOTH the same dot AND the same corner: a self-loop move
 * has a === b (same vertex) while using two DIFFERENT corners, which
 * can genuinely land on different faces (PR 5b's finding) and must
 * NOT be short-circuited to true just because the vertex matches.
 *
 * @param {object} state
 * @param {number} a
 * @param {number} b
 * @param {number} [cornerA=0]
 * @param {number} [cornerB=0]
 * @returns {boolean}
 */
export function areDotsInSameRegion(state, a, b, cornerA = 0, cornerB = 0) {
  if (a === b && cornerA === cornerB) return true;
  if (!state.dots.some(d => d.id === a) || !state.dots.some(d => d.id === b)) return false;

  const faces = traceFaces(state.edges, state.rotations);
  const dotIds = state.dots.map(d => d.id);
  const components = getComponents(state.edges, dotIds);
  const repOf = new Map();
  components.forEach(members => members.forEach(id => repOf.set(id, members[0])));

  const compA = repOf.get(a);
  const compB = repOf.get(b);

  const faceA = cornerFace(state.edges, state.rotations, faces, a, cornerA);
  const faceB = cornerFace(state.edges, state.rotations, faces, b, cornerB);
  if (faceA === faceB) return true;

  const outerA = resolveOuterFaceAnchor(faces, state.outerFaceAnchor[compA]);
  const outerB = resolveOuterFaceAnchor(faces, state.outerFaceAnchor[compB]);
  const parentA = resolveParentAnchor(faces, state.parentAnchor[compA]);
  const parentB = resolveParentAnchor(faces, state.parentAnchor[compB]);

  // B's whole component occupies A's face?
  if (faceB === outerB && parentB === faceA) return true;
  // A's whole component occupies B's face?
  if (faceA === outerA && parentA === faceB) return true;
  // Siblings under a common parent face (both null => both roots,
  // sharing the ONE plane's outer region — still "common", per D4).
  if (faceA === outerA && faceB === outerB && parentA === parentB) return true;

  return false;
}

/**
 * Returns true if two dots' corner-0s currently belong to the same
 * boundary (face) — simple face equality, unlike areDotsInSameRegion.
 * This is the check that determines split vs. merge (spec D7): same
 * face => single-boundary (split); different faces (whether or not
 * they share a region) => double-boundary (merge).
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
 * Returns the full set of boundaries (face objects) belonging to a
 * region: the host face itself, plus the outer face of every
 * component currently occupying it (spec D4).
 *
 * Returns FACE OBJECTS ({component, darts}), not the old {id,
 * vertices} shape — see file header.
 *
 * @param {object} state
 * @param {number} regionId
 * @returns {Array<{component:number, darts:number[]}>}
 */
export function getBoundariesForRegion(state, regionId) {
  const faces = traceFaces(state.edges, state.rotations);
  const hostFace = findFaceById(faces, regionId);
  if (!hostFace) return [];

  const occupantReps = computeK(faces, state.parentAnchor, hostFace, /* excludeRep, never matches */ -1);
  const boundaries = [hostFace];
  occupantReps.forEach(rep => {
    const outerFace = resolveOuterFaceAnchor(faces, state.outerFaceAnchor[rep]);
    if (outerFace) boundaries.push(outerFace);
  });
  return boundaries;
}

// ── v0.9.2 PR 5 — invariant checker (I-1…I-8) ────────────────────

/** Coded violations checkInvariantsV2() can report, beyond the
 *  containment-specific ones re-exported from containment.js. */
export const TopologyErrorV2 = {
  EULER_FORMULA_VIOLATED: 'EULER_FORMULA_VIOLATED_V2',
  LIVES_INCONSISTENT:     'LIVES_INCONSISTENT',
  TOTAL_LIVES_WRONG:      'TOTAL_LIVES_WRONG',
};

/**
 * Checks I-1 through I-8 (spec §9.2) against the (σ + containment)
 * topological model. This is now the ONLY invariant checker in this
 * file — the legacy checkInvariants() (which enforced the disproven
 * "every dot in exactly one boundary" invariant against the stored
 * regions/boundaries arrays) is deleted as of PR 6.
 *
 * I-1…I-4 (containment structure) delegate to containment.js's
 * checkContainmentInvariants(). I-5 (Euler) uses the COUNTING form
 * F = ΣFc − C + 1 (spec D4) rather than building full region
 * objects. I-6/I-7 (lives) are checked directly here. I-8
 * (π-domain exactness) is a Move-level check and lives in rules.js.
 *
 * @param {object} state
 * @returns {{ ok: boolean, violations: Array<object> }}
 */
export function checkInvariantsV2(state) {
  const dotIds = state.dots.map(d => d.id);
  const components = getComponents(state.edges, dotIds);
  const faces = traceFaces(state.edges, state.rotations);

  const containmentResult = checkContainmentInvariants(state, faces, components);
  const violations = [...containmentResult.violations];

  // I-5: global Euler, counting form.
  const V = state.dots.length;
  const E = state.edges.length;
  const C = components.length;
  const facesByComponent = new Map();
  faces.forEach(f => {
    facesByComponent.set(f.component, (facesByComponent.get(f.component) ?? 0) + 1);
  });
  const totalFacesAcrossComponents = [...facesByComponent.values()].reduce((a, b) => a + b, 0);
  const F = totalFacesAcrossComponents - C + 1;
  const lhs = V - E + F;
  const rhs = 1 + C;
  if (lhs !== rhs) {
    violations.push({ rule: TopologyErrorV2.EULER_FORMULA_VIOLATED, V, E, F, C, expected: rhs, actual: lhs });
  }

  // I-6: lives(v) === 3 - deg(v), and >= 0, for every dot.
  state.dots.forEach(dot => {
    const degree = state.rotations[dot.id].length;
    const expectedLives = 3 - degree;
    if (dot.lives !== expectedLives || dot.lives < 0) {
      violations.push({
        rule: TopologyErrorV2.LIVES_INCONSISTENT,
        dotId: dot.id,
        lives: dot.lives,
        expectedLives,
      });
    }
  });

  // I-7: total lives decreases by exactly 1 per move.
  const totalLives = state.dots.reduce((sum, d) => sum + d.lives, 0);
  const expectedTotal = 3 * state.initialDotCount - state.moves.length;
  if (totalLives !== expectedTotal) {
    violations.push({
      rule: TopologyErrorV2.TOTAL_LIVES_WRONG,
      totalLives,
      expectedTotal,
    });
  }

  return { ok: violations.length === 0, violations };
}
