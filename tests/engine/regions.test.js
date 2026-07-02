/* ================================================================
   tests/engine/regions.test.js — Sprouts v0.9.1

   Tests for js/engine/regions.js.

   v0.9 section: buildInitialTopology(), the seeded starting
   topological data model.

   v0.9.1 section: the pure query functions and checkInvariants().
   The lookup functions (getBoundaryForDot, getRegionForDot,
   areDotsInSameRegion, areDotsOnSameBoundary, getBoundariesForRegion)
   are tested against simple hand-built structural fixtures — these
   are pure containment queries, correct for any well-formed input
   regardless of whether it represents a valid planar embedding, so
   fixture realism doesn't matter for them.

   checkInvariants()'s Euler's-formula check is tested ONLY against
   states already known correct (the seeded starting topology) — see
   this file's header comment in regions.js for why hand-constructing
   a trustworthy multi-region Euler fixture right now would mean
   encoding an unverified assumption about boundary orientation.
   Real multi-region Euler coverage arrives at v0.9.2.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialTopology,
  getBoundaryForDot,
  getRegionForDot,
  areDotsInSameRegion,
  areDotsOnSameBoundary,
  getBoundariesForRegion,
  checkInvariants,
  TopologyError,
} from '../../js/engine/regions.js';

test('buildInitialTopology: produces exactly one region', () => {
  const topo = buildInitialTopology(3);
  assert.equal(topo.regions.length, 1);
  assert.equal(topo.regions[0].id, 0);
});

test('buildInitialTopology: produces exactly dotCount boundaries, not one shared boundary', () => {
  // A boundary is a cyclic walk along real edges. With zero edges at
  // game start, there is no walk connecting separate dots — each
  // isolated dot is trivially its own boundary. One shared boundary
  // holding all dots would be wrong and would break Euler's formula
  // (C = dotCount requires dotCount boundaries, not one).
  const topo = buildInitialTopology(4);
  assert.equal(topo.boundaries.length, 4);
});

test('buildInitialTopology: each boundary holds exactly one dot, matching 0..count-1', () => {
  const topo = buildInitialTopology(3);
  const vertexSets = topo.boundaries.map(b => b.vertices);
  assert.deepEqual(vertexSets, [[0], [1], [2]]);
});

test('buildInitialTopology: boundary ids are unique and sequential starting at 0', () => {
  const topo = buildInitialTopology(4);
  assert.deepEqual(topo.boundaries.map(b => b.id), [0, 1, 2, 3]);
});

test('buildInitialTopology: the single region lists every boundary id', () => {
  const topo = buildInitialTopology(5);
  assert.deepEqual(topo.regions[0].boundaries, [0, 1, 2, 3, 4]);
});

test('buildInitialTopology: nextRegionId starts at 1, nextBoundaryId starts at dotCount', () => {
  // Region 0 and boundaries 0..dotCount-1 are already taken.
  const topo = buildInitialTopology(6);
  assert.equal(topo.nextRegionId, 1);
  assert.equal(topo.nextBoundaryId, 6);
});

test('buildInitialTopology: works correctly for the minimum case of 1 dot', () => {
  const topo = buildInitialTopology(1);
  assert.equal(topo.regions.length, 1);
  assert.equal(topo.boundaries.length, 1);
  assert.deepEqual(topo.boundaries[0].vertices, [0]);
  assert.equal(topo.nextBoundaryId, 1);
});

// ── Query functions: getRegionForDot / getBoundaryForDot ────────

test('getRegionForDot: real lookup gives the same answer as the old stub, for the seeded starting state', () => {
  // v0.9.1 replaces the hardcoded stub with a genuine traversal. For
  // any state that existed before this version (only one region has
  // ever existed), the answer must be unchanged: always 0.
  const topo = buildInitialTopology(3);
  const state = { dots: [{id:0},{id:1},{id:2}], edges: [], ...topo };
  assert.equal(getRegionForDot(state, 0), 0);
  assert.equal(getRegionForDot(state, 1), 0);
  assert.equal(getRegionForDot(state, 2), 0);
});

test('getBoundaryForDot: finds the correct boundary in the seeded starting state', () => {
  const topo = buildInitialTopology(3);
  const state = { dots: [{id:0},{id:1},{id:2}], edges: [], ...topo };
  assert.equal(getBoundaryForDot(state, 0), 0);
  assert.equal(getBoundaryForDot(state, 1), 1);
  assert.equal(getBoundaryForDot(state, 2), 2);
});

test('getRegionForDot / getBoundaryForDot: return null for a dot that is not in any boundary', () => {
  const state = { dots: [], edges: [], regions: [], boundaries: [] };
  assert.equal(getBoundaryForDot(state, 99), null);
  assert.equal(getRegionForDot(state, 99), null);
});

// ── Query functions: multi-region lookups ────────────────────────
//
// These fixtures are hand-built structural data, NOT claimed to be
// geometrically valid planar embeddings — see file header. They only
// need well-formed cross-references (correct ids) to exercise the
// containment logic meaningfully.

test('getRegionForDot: distinguishes dots in two separate regions', () => {
  const state = {
    dots: [{id:0}, {id:1}],
    edges: [],
    regions: [
      { id: 0, boundaries: [0] },
      { id: 1, boundaries: [1] },
    ],
    boundaries: [
      { id: 0, vertices: [0] },
      { id: 1, vertices: [1] },
    ],
  };
  assert.equal(getRegionForDot(state, 0), 0);
  assert.equal(getRegionForDot(state, 1), 1);
});

test('getRegionForDot: two dots on different boundaries can still share one region', () => {
  const state = {
    dots: [{id:0}, {id:1}],
    edges: [],
    regions: [
      { id: 0, boundaries: [0, 1] }, // one region, two boundaries
    ],
    boundaries: [
      { id: 0, vertices: [0] },
      { id: 1, vertices: [1] },
    ],
  };
  assert.equal(getRegionForDot(state, 0), 0);
  assert.equal(getRegionForDot(state, 1), 0); // same region
});

test('areDotsInSameRegion: true within one region, false across two', () => {
  const sameRegion = {
    dots: [{id:0}, {id:1}], edges: [],
    regions: [{ id: 0, boundaries: [0, 1] }],
    boundaries: [{ id: 0, vertices: [0] }, { id: 1, vertices: [1] }],
  };
  assert.equal(areDotsInSameRegion(sameRegion, 0, 1), true);

  const differentRegions = {
    dots: [{id:0}, {id:1}], edges: [],
    regions: [{ id: 0, boundaries: [0] }, { id: 1, boundaries: [1] }],
    boundaries: [{ id: 0, vertices: [0] }, { id: 1, vertices: [1] }],
  };
  assert.equal(areDotsInSameRegion(differentRegions, 0, 1), false);
});

test('areDotsInSameRegion: a dot trivially shares a region with itself', () => {
  const state = { dots: [{id:0}], edges: [], regions: [], boundaries: [] };
  assert.equal(areDotsInSameRegion(state, 0, 0), true);
});

test('areDotsOnSameBoundary: distinguishes same-boundary from same-region-different-boundary', () => {
  // Both dots share a region, but sit on different boundaries within
  // it — this is exactly the case v0.9.2 will need to distinguish as
  // a double-boundary (merge) move rather than a single-boundary
  // (split) move.
  const state = {
    dots: [{id:0}, {id:1}], edges: [],
    regions: [{ id: 0, boundaries: [0, 1] }],
    boundaries: [{ id: 0, vertices: [0] }, { id: 1, vertices: [1] }],
  };
  assert.equal(areDotsInSameRegion(state, 0, 1), true);
  assert.equal(areDotsOnSameBoundary(state, 0, 1), false);
});

test('areDotsOnSameBoundary: true for two dots on the same multi-vertex boundary', () => {
  const state = {
    dots: [{id:0}, {id:1}, {id:2}],
    edges: [{a:0,b:1}, {a:1,b:2}, {a:2,b:0}],
    regions: [{ id: 0, boundaries: [0] }],
    boundaries: [{ id: 0, vertices: [0, 1, 2] }],
  };
  assert.equal(areDotsOnSameBoundary(state, 0, 1), true);
  assert.equal(areDotsOnSameBoundary(state, 1, 2), true);
  assert.equal(areDotsOnSameBoundary(state, 0, 2), true);
});

test('areDotsOnSameBoundary: a dot trivially shares a boundary with itself', () => {
  const state = { dots: [{id:0}], edges: [], regions: [], boundaries: [] };
  assert.equal(areDotsOnSameBoundary(state, 0, 0), true);
});

test('getBoundariesForRegion: resolves boundary ids into full boundary objects', () => {
  const state = {
    dots: [{id:0}, {id:1}], edges: [],
    regions: [{ id: 0, boundaries: [0, 1] }],
    boundaries: [{ id: 0, vertices: [0] }, { id: 1, vertices: [1] }],
  };
  const result = getBoundariesForRegion(state, 0);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(b => b.id), [0, 1]);
});

test('getBoundariesForRegion: returns an empty array for a nonexistent region', () => {
  const state = { dots: [], edges: [], regions: [], boundaries: [] };
  assert.deepEqual(getBoundariesForRegion(state, 99), []);
});

// ── checkInvariants: valid states ────────────────────────────────
//
// Only states already known correct — the seeded starting topology,
// for various dot counts — are used for the "accepts a valid state"
// tests, per the scope note in this file's header.

test('checkInvariants: the seeded starting topology is valid, for several dot counts', () => {
  [1, 2, 3, 6].forEach(count => {
    const topo = buildInitialTopology(count);
    const dots = [];
    for (let i = 0; i < count; i++) dots.push({ id: i, lives: 3 });
    const state = { dots, edges: [], ...topo };

    const result = checkInvariants(state);
    assert.equal(result.ok, true, `dotCount=${count} should be valid`);
    assert.deepEqual(result.violations, []);
  });
});

// ── checkInvariants: malformed states are caught ──────────────────
//
// These fixtures are deliberately broken in exactly one way each,
// starting from the known-correct 2-dot seeded topology, to confirm
// checkInvariants actually detects bad structure — not just that it
// accepts good structure. Testing the checker's ability to catch a
// broken state matters at least as much as testing it accepts a
// correct one.

function validTwoDotState() {
  const topo = buildInitialTopology(2);
  return { dots: [{id:0,lives:3},{id:1,lives:3}], edges: [], ...topo };
}

test('checkInvariants: catches a dot missing from every boundary', () => {
  const state = validTwoDotState();
  state.boundaries = state.boundaries.filter(b => b.id !== 1); // drop dot 1's boundary
  const result = checkInvariants(state);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v =>
    v.rule === TopologyError.DOT_BOUNDARY_COUNT_WRONG && v.dotId === 1 && v.count === 0
  ));
});

test('checkInvariants: catches a dot appearing in two boundaries', () => {
  const state = validTwoDotState();
  state.boundaries[1].vertices = [0]; // dot 0 now wrongly appears in boundary 1 too
  const result = checkInvariants(state);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v =>
    v.rule === TopologyError.DOT_BOUNDARY_COUNT_WRONG && v.dotId === 0 && v.count === 2
  ));
});

test('checkInvariants: catches a boundary belonging to zero regions', () => {
  const state = validTwoDotState();
  state.regions[0].boundaries = [0]; // boundary 1 no longer listed anywhere
  const result = checkInvariants(state);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v =>
    v.rule === TopologyError.BOUNDARY_REGION_COUNT_WRONG && v.boundaryId === 1 && v.count === 0
  ));
});

test('checkInvariants: catches a boundary whose vertices are not actually connected by an edge', () => {
  const state = validTwoDotState();
  // Force a fake 2-vertex boundary claiming dots 0 and 1 are linked,
  // with no edge between them anywhere in state.edges.
  state.boundaries = [{ id: 0, vertices: [0, 1] }];
  state.regions = [{ id: 0, boundaries: [0] }];
  const result = checkInvariants(state);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === TopologyError.BOUNDARY_EDGE_MISSING));
});

test('checkInvariants: catches a violated Euler\'s formula', () => {
  const state = validTwoDotState();
  // Declare a second region with no basis in the actual structure —
  // F is now wrong relative to V, E, C.
  state.regions.push({ id: 1, boundaries: [] });
  const result = checkInvariants(state);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === TopologyError.EULER_FORMULA_VIOLATED));
});

test('checkInvariants: reports multiple simultaneous violations, not just the first', () => {
  const state = validTwoDotState();
  state.boundaries = state.boundaries.filter(b => b.id !== 1); // breaks (1) and, via F/C, likely (4) too
  const result = checkInvariants(state);
  assert.equal(result.ok, false);
  assert.ok(result.violations.length >= 1);
});
